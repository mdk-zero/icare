import { Text } from '@react-pdf/renderer';
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultySectionIds } from '@/app/lib/roster';
import { ReportShell, StatGrid, Table, styles, type ReportMeta, type ReportDocument } from './kit';
import { toCsv, toCsvBlocks, type CsvCell } from './csv';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export const REPORT_TYPES = ['student', 'section', 'scenario', 'assessment', 'roster'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export function isReportType(value: unknown): value is ReportType {
  return typeof value === 'string' && (REPORT_TYPES as readonly string[]).includes(value);
}

/** Roster is the only type that reports on the whole scope rather than one record. */
export const REPORT_NEEDS_TARGET: Record<ReportType, boolean> = {
  student: true,
  section: true,
  scenario: true,
  assessment: true,
  roster: false,
};

export interface BuiltReport {
  /** Used for the filename and the PDF document title. */
  subject: string;
  pdf: ReportDocument;
  csv: string;
}

export type BuildResult = BuiltReport | { error: string; status: number };

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function fmt(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value}${suffix}`;
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : '—';
}

// ---------------------------------------------------------------------------
// Student — competency profile for one student
// ---------------------------------------------------------------------------

export async function buildStudentReport(
  supabase: Supabase,
  meta: ReportMeta,
  studentId: string,
): Promise<BuildResult> {
  const [
    { data: student },
    { data: scores },
    { data: attempts },
    { count: readings },
    { count: anomalies },
    { count: tpr },
    { count: ivf },
    { data: notes },
  ] = await Promise.all([
    supabase.from('users').select('id, name, email').eq('id', studentId).eq('role', 'student').maybeSingle(),
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
    supabase
      .from('vital_sign_readings')
      .select('id', { count: 'exact', head: true })
      .eq('recorded_by', studentId)
      .eq('is_anomaly', true),
    supabase.from('tpr_records').select('id', { count: 'exact', head: true }).eq('recorded_by', studentId),
    supabase.from('ivf_records').select('id', { count: 'exact', head: true }).eq('recorded_by', studentId),
    supabase.from('progress_notes').select('id, reviewed_at').eq('author_id', studentId),
  ]);

  if (!student) return { error: 'Student not found', status: 404 };

  // Rows arrive newest-first, so the first hit per area is the latest score.
  const byCompetency = new Map<string, { latest: number; count: number }>();
  for (const record of scores ?? []) {
    const name =
      (record as unknown as { competency_areas: { name: string } | null }).competency_areas?.name ?? 'Unknown';
    const entry = byCompetency.get(name);
    if (entry) entry.count += 1;
    else byCompetency.set(name, { latest: Number(record.score), count: 1 });
  }
  const competencies = [...byCompetency.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const scored = (attempts ?? []).filter((a) => a.score !== null).map((a) => Number(a.score));
  const recent = (attempts ?? []).slice(0, 10).map((a) => ({
    title: (a as unknown as { assessments: { title: string } | null }).assessments?.title ?? 'Unknown assessment',
    score: a.score !== null ? Math.round(Number(a.score)) : null,
    submittedAt: date(a.submitted_at),
  }));

  const reviewedNotes = (notes ?? []).filter((n) => (n as { reviewed_at: string | null }).reviewed_at !== null).length;

  const metaRows = [
    { label: 'Student', value: student.name },
    { label: 'Email', value: student.email },
  ];

  const pdf = (
    <ReportShell
      title={`Competency Report - ${student.name}`}
      heading="iCARE++ Student Competency Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Competency areas', value: competencies.length },
          { label: 'Quiz attempts', value: attempts?.length ?? 0 },
          { label: 'Average score', value: fmt(avg(scored), '%') },
          { label: 'Best score', value: fmt(scored.length ? Math.max(...scored) : null, '%') },
        ]}
      />

      <Text style={styles.sectionTitle}>Competency areas</Text>
      <Table
        head={['Area', 'Ratings', 'Latest']}
        rows={competencies.map((c) => [c.name, c.count, `${Math.round(c.latest)}%`])}
        emptyText="No competency ratings recorded yet."
      />

      <Text style={styles.sectionTitle}>Recent assessment attempts</Text>
      <Table
        head={['Assessment', 'Submitted', 'Score']}
        rows={recent.map((r) => [r.title, r.submittedAt, r.score === null ? '—' : `${r.score}%`])}
        emptyText="No submitted attempts yet."
      />

      <Text style={styles.sectionTitle}>Clinical activity</Text>
      <StatGrid
        items={[
          { label: 'Vitals recorded', value: readings ?? 0 },
          { label: 'Anomalies flagged', value: anomalies ?? 0 },
          { label: 'TPR / IVF records', value: `${tpr ?? 0} / ${ivf ?? 0}` },
          { label: 'Notes reviewed', value: `${reviewedNotes} / ${notes?.length ?? 0}` },
        ]}
      />
    </ReportShell>
  );

  const csv = toCsvBlocks([
    { title: `Competency report — ${student.name} (${student.email})`, head: ['Generated at'], rows: [[meta.generatedAt]] },
    {
      title: 'Competency areas',
      head: ['Area', 'Ratings', 'Latest score'],
      rows: competencies.map((c) => [c.name, c.count, Math.round(c.latest)]),
    },
    {
      title: 'Assessment attempts',
      head: ['Assessment', 'Submitted', 'Score'],
      rows: recent.map((r) => [r.title, r.submittedAt, r.score]),
    },
  ]);

  return { subject: student.name, pdf, csv };
}

// ---------------------------------------------------------------------------
// Section — one class at a glance
// ---------------------------------------------------------------------------

export async function buildSectionReport(
  supabase: Supabase,
  meta: ReportMeta,
  sectionId: string,
): Promise<BuildResult> {
  const { data: section } = await supabase.from('sections').select('id, name').eq('id', sectionId).maybeSingle();
  if (!section) return { error: 'Section not found', status: 404 };

  const { data: students } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('role', 'student')
    .eq('section_id', sectionId)
    .order('name');

  const ids = (students ?? []).map((s) => s.id);
  const [{ data: scores }, { data: attempts }] = await Promise.all([
    ids.length
      ? supabase.from('competency_scores').select('student_id, score, competency_areas(name)').in('student_id', ids)
      : Promise.resolve({ data: [] as unknown[] }),
    ids.length
      ? supabase.from('assessment_attempts').select('student_id, score').eq('status', 'submitted').in('student_id', ids)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const attemptsByStudent = new Map<string, number[]>();
  for (const a of (attempts ?? []) as { student_id: string; score: number | null }[]) {
    if (a.score === null) continue;
    const list = attemptsByStudent.get(a.student_id) ?? [];
    list.push(Number(a.score));
    attemptsByStudent.set(a.student_id, list);
  }

  const byArea = new Map<string, number[]>();
  for (const s of (scores ?? []) as { score: number; competency_areas: { name: string } | null }[]) {
    const name = s.competency_areas?.name ?? 'Unknown';
    const list = byArea.get(name) ?? [];
    list.push(Number(s.score));
    byArea.set(name, list);
  }
  const areaRows = [...byArea.entries()]
    .map(([name, list]) => ({ name, count: list.length, mean: avg(list) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const roster = (students ?? []).map((s) => {
    const list = attemptsByStudent.get(s.id) ?? [];
    return { name: s.name, email: s.email, attempts: list.length, mean: avg(list) };
  });
  const classMean = avg(roster.flatMap((r) => (r.mean === null ? [] : [r.mean])));
  const belowThreshold = roster.filter((r) => r.mean !== null && r.mean < 75).length;

  const metaRows = [
    { label: 'Section', value: section.name },
    { label: 'Students', value: String(roster.length) },
  ];

  const pdf = (
    <ReportShell
      title={`Section Report - ${section.name}`}
      heading="iCARE++ Section Performance Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Students', value: roster.length },
          { label: 'Class average', value: fmt(classMean, '%') },
          { label: 'Below 75%', value: belowThreshold },
          { label: 'Competency areas', value: areaRows.length },
        ]}
      />

      <Text style={styles.sectionTitle}>Roster</Text>
      <Table
        head={['Student', 'Attempts', 'Average']}
        rows={roster.map((r) => [r.name, r.attempts, fmt(r.mean, '%')])}
        emptyText="No students in this section yet."
      />

      <Text style={styles.sectionTitle}>Competency areas (section mean)</Text>
      <Table
        head={['Area', 'Ratings', 'Mean']}
        rows={areaRows.map((a) => [a.name, a.count, fmt(a.mean, '%')])}
        emptyText="No competency ratings recorded for this section yet."
      />
    </ReportShell>
  );

  const csv = toCsvBlocks([
    { title: `Section report — ${section.name}`, head: ['Generated at'], rows: [[meta.generatedAt]] },
    {
      title: 'Roster',
      head: ['Student', 'Email', 'Attempts', 'Average score'],
      rows: roster.map((r) => [r.name, r.email, r.attempts, r.mean]),
    },
    {
      title: 'Competency areas',
      head: ['Area', 'Ratings', 'Mean score'],
      rows: areaRows.map((a) => [a.name, a.count, a.mean]),
    },
  ]);

  return { subject: section.name, pdf, csv };
}

// ---------------------------------------------------------------------------
// Scenario — assignment and completion for one scenario
// ---------------------------------------------------------------------------

export async function buildScenarioReport(
  supabase: Supabase,
  meta: ReportMeta,
  scenarioId: string,
): Promise<BuildResult> {
  const { data: scenario } = await supabase
    .from('scenarios')
    .select('id, title, difficulty, category, created_at')
    .eq('id', scenarioId)
    .maybeSingle();
  if (!scenario) return { error: 'Scenario not found', status: 404 };

  const { data: assignments } = await supabase
    .from('scenario_assignments')
    .select('status, score, time_taken, assigned_at, completed_at, deadline, users!scenario_assignments_student_id_fkey(name)')
    .eq('scenario_id', scenarioId)
    .order('assigned_at', { ascending: false });

  const rows = (assignments ?? []).map((a) => {
    const studentName =
      (a as unknown as { users: { name: string } | null }).users?.name ?? 'Unknown student';
    return {
      name: studentName,
      status: a.status as string,
      score: a.score === null ? null : Number(a.score),
      completedAt: date(a.completed_at),
      minutes: a.time_taken === null ? null : Math.round(Number(a.time_taken) / 60),
    };
  });

  const completed = rows.filter((r) => r.status === 'completed');
  const scored = completed.flatMap((r) => (r.score === null ? [] : [r.score]));
  const completionRate = rows.length > 0 ? Math.round((completed.length / rows.length) * 100) : null;

  const metaRows = [
    { label: 'Scenario', value: scenario.title },
    { label: 'Difficulty', value: String(scenario.difficulty) },
    { label: 'Category', value: String(scenario.category) },
  ];

  const pdf = (
    <ReportShell
      title={`Scenario Report - ${scenario.title}`}
      heading="iCARE++ Scenario Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Assigned', value: rows.length },
          { label: 'Completed', value: completed.length },
          { label: 'Completion rate', value: fmt(completionRate, '%') },
          { label: 'Average score', value: fmt(avg(scored), '%') },
        ]}
      />

      <Text style={styles.sectionTitle}>Assignments</Text>
      <Table
        head={['Student', 'Status', 'Completed', 'Score']}
        rows={rows.map((r) => [r.name, r.status, r.completedAt, fmt(r.score, '%')])}
        emptyText="This scenario has not been assigned yet."
      />
    </ReportShell>
  );

  const csv = toCsvBlocks([
    { title: `Scenario report — ${scenario.title}`, head: ['Generated at'], rows: [[meta.generatedAt]] },
    {
      title: 'Assignments',
      head: ['Student', 'Status', 'Completed at', 'Score', 'Minutes taken'],
      rows: rows.map((r) => [r.name, r.status, r.completedAt, r.score, r.minutes] as CsvCell[]),
    },
  ]);

  return { subject: scenario.title, pdf, csv };
}

// ---------------------------------------------------------------------------
// Assessment — attempt distribution for one quiz
// ---------------------------------------------------------------------------

export async function buildAssessmentReport(
  supabase: Supabase,
  meta: ReportMeta,
  assessmentId: string,
): Promise<BuildResult> {
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, title, difficulty, category, is_published')
    .eq('id', assessmentId)
    .maybeSingle();
  if (!assessment) return { error: 'Assessment not found', status: 404 };

  const { data: attempts } = await supabase
    .from('assessment_attempts')
    .select('status, score, submitted_at, time_taken_seconds, users(name)')
    .eq('assessment_id', assessmentId)
    .order('submitted_at', { ascending: false });

  const rows = (attempts ?? []).map((a) => ({
    name: (a as unknown as { users: { name: string } | null }).users?.name ?? 'Unknown student',
    status: a.status as string,
    score: a.score === null ? null : Math.round(Number(a.score)),
    submittedAt: date(a.submitted_at),
    minutes: a.time_taken_seconds === null ? null : Math.round(Number(a.time_taken_seconds) / 60),
  }));

  const submitted = rows.filter((r) => r.status === 'submitted' && r.score !== null);
  const scored = submitted.map((r) => r.score as number);
  const passRate =
    submitted.length > 0 ? Math.round((scored.filter((s) => s >= 75).length / submitted.length) * 100) : null;

  // Distribution gives a shape the raw list does not.
  const bands = [
    { label: '90–100', test: (s: number) => s >= 90 },
    { label: '75–89', test: (s: number) => s >= 75 && s < 90 },
    { label: '60–74', test: (s: number) => s >= 60 && s < 75 },
    { label: 'Below 60', test: (s: number) => s < 60 },
  ].map((b) => ({ label: b.label, count: scored.filter(b.test).length }));

  const metaRows = [
    { label: 'Assessment', value: assessment.title },
    { label: 'Difficulty', value: String(assessment.difficulty) },
    { label: 'Status', value: assessment.is_published ? 'Published' : 'Draft' },
  ];

  const pdf = (
    <ReportShell
      title={`Assessment Report - ${assessment.title}`}
      heading="iCARE++ Assessment Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Attempts', value: rows.length },
          { label: 'Submitted', value: submitted.length },
          { label: 'Average', value: fmt(avg(scored), '%') },
          { label: 'Pass rate (≥75)', value: fmt(passRate, '%') },
        ]}
      />

      <Text style={styles.sectionTitle}>Score distribution</Text>
      <Table
        head={['Band', 'Students']}
        rows={bands.map((b) => [b.label, b.count])}
        emptyText="No submitted attempts yet."
      />

      <Text style={styles.sectionTitle}>Attempts</Text>
      <Table
        head={['Student', 'Status', 'Submitted', 'Score']}
        rows={rows.map((r) => [r.name, r.status, r.submittedAt, fmt(r.score, '%')])}
        emptyText="No attempts recorded yet."
      />
    </ReportShell>
  );

  const csv = toCsvBlocks([
    { title: `Assessment report — ${assessment.title}`, head: ['Generated at'], rows: [[meta.generatedAt]] },
    { title: 'Score distribution', head: ['Band', 'Students'], rows: bands.map((b) => [b.label, b.count]) },
    {
      title: 'Attempts',
      head: ['Student', 'Status', 'Submitted at', 'Score', 'Minutes taken'],
      rows: rows.map((r) => [r.name, r.status, r.submittedAt, r.score, r.minutes] as CsvCell[]),
    },
  ]);

  return { subject: assessment.title, pdf, csv };
}

// ---------------------------------------------------------------------------
// Roster — every student the caller supervises, one row each
// ---------------------------------------------------------------------------

export async function buildRosterReport(
  supabase: Supabase,
  meta: ReportMeta,
  session: { uid: string; role: string },
): Promise<BuildResult> {
  let query = supabase
    .from('users')
    .select('id, name, email, sections(name)')
    .eq('role', 'student')
    .order('name');

  if (session.role === 'faculty') {
    const sectionIds = await getFacultySectionIds(supabase, session.uid);
    if (sectionIds.length === 0) {
      return { error: 'You have no assigned sections yet', status: 400 };
    }
    query = query.in('section_id', sectionIds);
  }

  const { data: students } = await query;
  const ids = (students ?? []).map((s) => s.id);

  const { data: attempts } = ids.length
    ? await supabase.from('assessment_attempts').select('student_id, score').eq('status', 'submitted').in('student_id', ids)
    : { data: [] as unknown[] };

  const byStudent = new Map<string, number[]>();
  for (const a of (attempts ?? []) as { student_id: string; score: number | null }[]) {
    if (a.score === null) continue;
    const list = byStudent.get(a.student_id) ?? [];
    list.push(Number(a.score));
    byStudent.set(a.student_id, list);
  }

  const rows = (students ?? []).map((s) => {
    const list = byStudent.get(s.id) ?? [];
    return {
      name: s.name,
      email: s.email,
      section: (s as unknown as { sections: { name: string } | null }).sections?.name ?? 'Unassigned',
      attempts: list.length,
      mean: avg(list),
    };
  });

  const overall = avg(rows.flatMap((r) => (r.mean === null ? [] : [r.mean])));
  const noActivity = rows.filter((r) => r.attempts === 0).length;

  const metaRows = [
    { label: 'Scope', value: session.role === 'admin' ? 'All students' : 'Your sections' },
    { label: 'Students', value: String(rows.length) },
  ];

  const pdf = (
    <ReportShell
      title="Roster Summary Report"
      heading="iCARE++ Roster Summary Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Students', value: rows.length },
          { label: 'Overall average', value: fmt(overall, '%') },
          { label: 'No attempts yet', value: noActivity },
          { label: 'Below 75%', value: rows.filter((r) => r.mean !== null && r.mean < 75).length },
        ]}
      />

      <Text style={styles.sectionTitle}>Students</Text>
      <Table
        head={['Student', 'Section', 'Attempts', 'Average']}
        rows={rows.map((r) => [r.name, r.section, r.attempts, fmt(r.mean, '%')])}
        emptyText="No students on your roster yet."
      />
    </ReportShell>
  );

  const csv = toCsv(
    ['Student', 'Email', 'Section', 'Attempts', 'Average score'],
    rows.map((r) => [r.name, r.email, r.section, r.attempts, r.mean] as CsvCell[]),
  );

  return { subject: 'roster-summary', pdf, csv };
}
