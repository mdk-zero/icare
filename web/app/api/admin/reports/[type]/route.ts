import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { renderReport, type ReportMeta } from '@/app/lib/reports/kit';
import { slugify } from '@/app/lib/reports/csv';
import {
  ADMIN_REPORT_NEEDS_TARGET,
  buildAdminFacultyReport,
  buildAdminRoomReport,
  buildAdminUserReport,
  buildAdminSummaryReport,
  isAdminReportType,
  type BuildResult,
} from '@/app/lib/reports/admin-builders';

interface RouteParams {
  params: Promise<{ type: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { type } = await params;
  if (!isAdminReportType(type)) {
    return NextResponse.json({ error: `Unknown report type "${type}"` }, { status: 404 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim() ?? '';
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'pdf';

  if (ADMIN_REPORT_NEEDS_TARGET[type] && !id) {
    return NextResponse.json({ error: `A target id is required for ${type} reports` }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: admin } = await supabase.from('users').select('name').eq('id', session.uid).maybeSingle();
    const { data: campus } = await supabase.from('campuses').select('name').limit(1).maybeSingle();

    const meta: ReportMeta = {
      campus: campus?.name ?? 'Batangas State University – TNEU ARASOF Nasugbu',
      generatedBy: admin?.name ?? session.email,
      generatedAt: new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }),
    };

    let result: BuildResult;
    switch (type) {
      case 'faculty':
        result = await buildAdminFacultyReport(supabase, meta, id);
        break;
      case 'rooms':
        result = await buildAdminRoomReport(supabase, meta, id);
        break;
      case 'users':
        result = await buildAdminUserReport(supabase, meta, id);
        break;
      case 'summary':
        result = await buildAdminSummaryReport(supabase, meta);
        break;
    }

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await logAudit(
      session,
      {
        action: 'report.generate',
        entityType: type,
        entityId: id || session.uid,
        details: { report: type, format, subject: result.subject },
      },
      request,
    );

    const filename = `icare-admin-${type}-report-${slugify(result.subject)}.${format}`;
    const headers = {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    };

    if (format === 'csv') {
      return new NextResponse(result.csv, {
        status: 200,
        headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' },
      });
    }

    const pdf = await renderReport(result.pdf);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/pdf' },
    });
  } catch (err) {
    console.error(`Generate admin ${type} report failed`, err);
    return NextResponse.json({ error: 'Unable to generate report' }, { status: 500 });
  }
}
