import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  renderCompetencyReport,
  type CompetencyReportData,
} from '@/app/lib/reports/competency-report';

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { studentId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const [
      { data: student },
      { data: faculty },
      { data: campus },
      { data: scores },
      { data: attempts },
      { count: readingCount },
      { count: anomalyCount },
      { count: tprCount },
      { count: ivfCount },
      { data: notes },
    ] = await Promise.all([
      supabase.from('users').select('id, name, email').eq('id', studentId).eq('role', 'student').single(),
      supabase.from('users').select('name').eq('id', session.uid).single(),
      supabase.from('campuses').select('name').limit(1).single(),
      supabase
        .from('competency_scores')
        .select('score, created_at, competency_areas(name)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
      supabase
        .from('assessment_attempts')
        .select('score, submitted_at, assessments(title)')
        .eq('student_id', studentId)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false }),
      supabase.from('vital_sign_readings').select('id', { count: 'exact', head: true }).eq('recorded_by', studentId),
      supabase.from('vital_sign_readings').select('id', { count: 'exact', head: true }).eq('recorded_by', studentId).eq('is_anomaly', true),
      supabase.from('tpr_records').select('id', { count: 'exact', head: true }).eq('recorded_by', studentId),
      supabase.from('ivf_records').select('id', { count: 'exact', head: true }).eq('recorded_by', studentId),
      supabase.from('progress_notes').select('id, reviewed_at').eq('author_id', studentId),
    ]);

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Latest score + rating count per competency (rows arrive newest-first).
    const byCompetency = new Map<string, { latest: number; count: number }>();
    for (const record of scores ?? []) {
      const name =
        (record as unknown as { competency_areas: { name: string } | null }).competency_areas
          ?.name ?? 'Unknown';
      const entry = byCompetency.get(name);
      if (entry) entry.count += 1;
      else byCompetency.set(name, { latest: Number(record.score), count: 1 });
    }

    const submitted = (attempts ?? []).filter((a) => a.score !== null);
    const avgScore =
      submitted.length > 0
        ? Math.round(submitted.reduce((sum, a) => sum + Number(a.score), 0) / submitted.length)
        : null;
    const bestScore =
      submitted.length > 0 ? Math.max(...submitted.map((a) => Number(a.score))) : null;

    const data: CompetencyReportData = {
      student: { name: student.name, email: student.email },
      campus: campus?.name ?? 'Batangas State University – TNEU ARASOF Nasugbu',
      generatedBy: faculty?.name ?? session.email,
      generatedAt: new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }),
      competencies: [...byCompetency.entries()]
        .map(([name, { latest, count }]) => ({ name, latest, count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      quiz: { attempts: attempts?.length ?? 0, avgScore, bestScore },
      recentAttempts: (attempts ?? []).slice(0, 10).map((a) => ({
        title:
          (a as unknown as { assessments: { title: string } | null }).assessments?.title ??
          'Unknown assessment',
        score: a.score !== null ? Math.round(Number(a.score)) : null,
        submittedAt: a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—',
      })),
      vitals: { readings: readingCount ?? 0, anomalies: anomalyCount ?? 0 },
      ehr: {
        tpr: tprCount ?? 0,
        ivf: ivfCount ?? 0,
        notes: notes?.length ?? 0,
        reviewedNotes: (notes ?? []).filter((n) => n.reviewed_at !== null).length,
      },
    };

    const pdf = await renderCompetencyReport(data);

    await logAudit(
      session,
      {
        action: 'report.generate',
        entityType: 'users',
        entityId: studentId,
        details: { report: 'competency', student: student.name },
      },
      request,
    );

    const filename = `icare-competency-report-${student.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Generate competency report failed', err);
    return NextResponse.json({ error: 'Unable to generate report' }, { status: 500 });
  }
}
