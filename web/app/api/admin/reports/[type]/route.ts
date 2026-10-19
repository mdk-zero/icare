import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getAdminScope } from '@/app/lib/admin-scope';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { renderReport, reportResponse, type ReportMeta } from '@/app/lib/reports/kit';
import { slugify } from '@/app/lib/reports/data';
import {
  ADMIN_REPORT_NEEDS_TARGET,
  buildAdminFacultyReport,
  buildAdminRoomReport,
  buildAdminUserReport,
  buildAdminSummaryReport,
  isAdminReportType,
  type BuildResult,
} from '@/app/lib/reports/admin-builders';
import { deanInstitution, viewerDeanId } from '@/app/lib/dean-scope';

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

  if (ADMIN_REPORT_NEEDS_TARGET[type] && !id) {
    return NextResponse.json({ error: `A target id is required for ${type} reports` }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: admin } = await supabase.from('users').select('name').eq('id', session.uid).maybeSingle();
    // The Dean's own institution (077), else the first one on file.
    const deanId = await viewerDeanId(supabase, session);
    const campus = (await deanInstitution(supabase, session.uid))
      ?? (await supabase.from('campuses').select('name').limit(1).maybeSingle()).data;

    const meta: ReportMeta = {
      campus: campus?.name ?? 'Batangas State University - The NEU ARASOF Nasugbu',
      generatedBy: admin?.name ?? session.email,
      generatedAt: new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }),
    };

    let result: BuildResult;
    // Only this admin's faculty and students (migration 053).
    const scope = await getAdminScope(supabase, session.uid);
    switch (type) {
      case 'faculty':
        result = await buildAdminFacultyReport(supabase, meta, id, scope);
        break;
      case 'rooms':
        result = await buildAdminRoomReport(supabase, meta, id, deanId);
        break;
      case 'users':
        result = await buildAdminUserReport(supabase, meta, id, scope, session.uid);
        break;
      case 'summary':
        result = await buildAdminSummaryReport(supabase, meta, scope, session.uid, deanId);
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
        // target_id is what "Generate again" on the Reports page replays.
        details: { report: type, format: 'pdf', subject: result.subject, target_id: id || null },
      },
      request,
    );

    const filename = `icare-admin-${type}-report-${slugify(result.subject)}.pdf`;
    return reportResponse(request, await renderReport(result.pdf), filename);
  } catch (err) {
    console.error(`Generate dean ${type} report failed`, err);
    return NextResponse.json({ error: 'Unable to generate report' }, { status: 500 });
  }
}
