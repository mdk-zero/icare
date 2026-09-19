import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { renderReport, type ReportMeta } from '@/app/lib/reports/kit';
import { slugify } from '@/app/lib/reports/csv';
import { getFacultySectionIds, isStudentInFacultySections } from '@/app/lib/roster';
import {
  REPORT_NEEDS_TARGET,
  buildAssessmentReport,
  buildAttendanceReport,
  buildDischargeReport,
  buildRosterReport,
  buildScenarioReport,
  buildSectionReport,
  buildStudentReport,
  isReportType,
  type BuildResult,
} from '@/app/lib/reports/builders';

interface RouteParams {
  params: Promise<{ type: string }>;
}

/**
 * One endpoint for every report subject and format:
 *   GET /api/faculty/reports/<type>?id=<targetId>&format=pdf|csv
 * `roster` needs no id; the others do.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { type } = await params;
  if (!isReportType(type)) {
    return NextResponse.json({ error: `Unknown report type "${type}"` }, { status: 404 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim() ?? '';
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'pdf';

  if (REPORT_NEEDS_TARGET[type] && !id) {
    return NextResponse.json({ error: `A target id is required for ${type} reports` }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Faculty report only on their own sections and the students in them;
    // admins see everything. Out of scope answers exactly like a missing id,
    // so the endpoint can't be used to learn which ids exist.
    if (session.role === 'faculty' && (await outOfScope(supabase, session.uid, type, id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: faculty } = await supabase.from('users').select('name').eq('id', session.uid).maybeSingle();
    const { data: campus } = await supabase.from('campuses').select('name').limit(1).maybeSingle();

    const meta: ReportMeta = {
      campus: campus?.name ?? 'Batangas State University – TNEU ARASOF Nasugbu',
      generatedBy: faculty?.name ?? session.email,
      generatedAt: new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }),
    };

    let result: BuildResult;
    switch (type) {
      case 'student':
        result = await buildStudentReport(supabase, meta, id);
        break;
      case 'section':
        result = await buildSectionReport(supabase, meta, id);
        break;
      case 'scenario':
        result = await buildScenarioReport(supabase, meta, id);
        break;
      case 'assessment':
        result = await buildAssessmentReport(supabase, meta, id);
        break;
      case 'roster':
        result = await buildRosterReport(supabase, meta, session);
        break;
      case 'discharge':
        result = await buildDischargeReport(supabase, meta, id);
        break;
      case 'attendance':
        result = await buildAttendanceReport(supabase, meta, id);
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
        // target_id is what "Generate again" on the Reports page replays;
        // entity_id can't carry it, since whole-scope reports log the actor there.
        details: { report: type, format, subject: result.subject, target_id: id || null },
      },
      request,
    );

    const filename = `icare-${type}-report-${slugify(result.subject)}.${format}`;
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
    console.error(`Generate ${type} report failed`, err);
    return NextResponse.json({ error: 'Unable to generate report' }, { status: 500 });
  }
}

/**
 * Scenarios and assessments are listed app-wide, and a discharge summary is
 * reached from the patient chart, so only the section-bound subjects are
 * checked here.
 */
async function outOfScope(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  facultyId: string,
  type: string,
  id: string,
): Promise<boolean> {
  if (type === 'student') return !(await isStudentInFacultySections(supabase, facultyId, id));
  if (type === 'section' || type === 'attendance') {
    return !(await getFacultySectionIds(supabase, facultyId)).includes(id);
  }
  return false;
}
