import { Text } from '@react-pdf/renderer';
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultySectionIds } from '@/app/lib/roster';
import { ReportShell, StatGrid, Table, styles, type ReportMeta, type ReportDocument } from './kit';
import { toCsv, toCsvBlocks, type CsvCell } from './csv';
import { tallyAttendance, type ShiftAttendanceStatus } from '../shifts';
import { isActiveSkillArea } from '@/scripts/taylors-chapters';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export const REPORT_TYPES = ['student', 'section', 'scenario', 'assessment', 'roster', 'discharge', 'attendance'] as const;
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
  // Targets one stored summary, not a patient: a re-admitted patient has more
  // than one, and each closes a different stay.
  discharge: true,
  // Attendance is reported per section.
  attendance: true,
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
    if (!isActiveSkillArea(name)) continue;
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
      title={`Skill Area Report - ${student.name}`}
      heading="iCARE++ Student Skill Area Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Skill areas', value: competencies.length },
          { label: 'Skill Assessment attempts', value: attempts?.length ?? 0 },
          { label: 'Average score', value: fmt(avg(scored), '%') },
          { label: 'Best score', value: fmt(scored.length ? Math.max(...scored) : null, '%') },
        ]}
      />

      <Text style={styles.sectionTitle}>Skill areas</Text>
      <Table
        head={['Area', 'Ratings', 'Latest']}
        rows={competencies.map((c) => [c.name, c.count, `${Math.round(c.latest)}%`])}
        emptyText="No skill area ratings recorded yet."
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
    { title: `Skill area report — ${student.name} (${student.email})`, head: ['Generated at'], rows: [[meta.generatedAt]] },
    {
      title: 'Skill areas',
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
    if (!isActiveSkillArea(name)) continue;
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
          { label: 'Skill areas', value: areaRows.length },
        ]}
      />

      <Text style={styles.sectionTitle}>Roster</Text>
      <Table
        head={['Student', 'Attempts', 'Average']}
        rows={roster.map((r) => [r.name, r.attempts, fmt(r.mean, '%')])}
        emptyText="No students in this section yet."
      />

      <Text style={styles.sectionTitle}>Skill areas (section mean)</Text>
      <Table
        head={['Area', 'Ratings', 'Mean']}
        rows={areaRows.map((a) => [a.name, a.count, fmt(a.mean, '%')])}
        emptyText="No skill area ratings recorded for this section yet."
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
      title: 'Skill areas',
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

/**
 * A stored discharge summary, rendered as-is.
 *
 * This is the one builder that does not query live data for its body: a
 * discharge summary is a point-in-time record (migration 037), so re-printing
 * it a month later must produce the same document even if the readings behind
 * it have since been edited or deleted.
 */
export async function buildDischargeReport(
  supabase: Supabase,
  meta: ReportMeta,
  summaryId: string,
): Promise<BuildResult> {
  const { data: summary } = await supabase
    .from('discharge_summaries')
    .select(
      'id, admitted_at, discharged_at, diagnosis, room_label, vitals_digest, ehr_digest, follow_up, ai_generated_at, patients(name, age, gender, mimic_id)',
    )
    .eq('id', summaryId)
    .maybeSingle();

  if (!summary) return { error: 'Discharge summary not found', status: 404 };

  const patient = (summary as unknown as {
    patients: { name: string; age: number | null; gender: string; mimic_id: string } | null;
  }).patients;

  const vitals = (summary.vitals_digest ?? {}) as {
    readings?: number;
    flagged?: number;
    critical?: number;
    stats?: Record<string, { min: number; max: number; avg: number; n: number }>;
    findings?: { message: string; severity: string; recommendation?: string }[];
  };
  const ehr = (summary.ehr_digest ?? {}) as {
    tpr?: number;
    ivf?: number;
    ivf_ongoing?: number;
    notes?: number;
    notes_reviewed?: number;
  };
  const followUp = (Array.isArray(summary.follow_up) ? summary.follow_up : []) as {
    title?: string;
    detail?: string;
  }[];

  const name = patient?.name ?? 'Unknown patient';
  const days =
    summary.admitted_at && summary.discharged_at
      ? Math.max(
          0,
          Math.floor(
            (new Date(summary.discharged_at).getTime() - new Date(summary.admitted_at).getTime()) /
              86_400_000,
          ),
        )
      : null;

  const VITAL_LABELS: Record<string, string> = {
    heart_rate: 'Heart rate (bpm)',
    bp_systolic: 'Systolic BP (mmHg)',
    bp_diastolic: 'Diastolic BP (mmHg)',
    temperature_c: 'Temperature (°C)',
    respiratory_rate: 'Respiratory rate (/min)',
    oxygen_saturation: 'Oxygen saturation (%)',
  };

  const vitalRows = Object.entries(vitals.stats ?? {}).map(([key, stat]) => [
    VITAL_LABELS[key] ?? key,
    stat.min,
    stat.avg,
    stat.max,
    stat.n,
  ]);

  const pdf = (
    <ReportShell
      title={`Discharge Summary — ${name}`}
      heading="Discharge Summary"
      meta={meta}
      metaRows={[
        { label: 'Patient', value: `${name}${patient?.age != null ? `, ${patient.age}` : ''}` },
        { label: 'Record ID', value: patient?.mimic_id ?? '—' },
        { label: 'Diagnosis', value: summary.diagnosis || '—' },
        { label: 'Room', value: summary.room_label || '—' },
        { label: 'Admitted', value: date(summary.admitted_at) },
        { label: 'Discharged', value: date(summary.discharged_at) },
        { label: 'Length of stay', value: days === null ? '—' : `${days} day(s)` },
      ]}
    >
      <Text style={styles.sectionTitle}>Stay at a glance</Text>
      <StatGrid
        items={[
          { label: 'Vitals readings', value: vitals.readings ?? 0 },
          { label: 'Flagged', value: vitals.flagged ?? 0 },
          { label: 'TPR sheets', value: ehr.tpr ?? 0 },
          { label: 'IVF records', value: ehr.ivf ?? 0 },
          { label: 'Progress notes', value: ehr.notes ?? 0 },
        ]}
      />

      <Text style={styles.sectionTitle}>Vital signs over the stay</Text>
      <Table
        head={['Vital', 'Min', 'Avg', 'Max', 'Readings']}
        rows={vitalRows}
        emptyText="No vital signs were charted during this stay."
      />

      <Text style={styles.sectionTitle}>Abnormal findings</Text>
      {(vitals.findings ?? []).length === 0 ? (
        <Text style={styles.empty}>No readings fell outside their reference range.</Text>
      ) : (
        (vitals.findings ?? []).map((finding, i) => (
          <Text key={i} style={{ marginBottom: 3 }}>
            {finding.severity === 'critical' ? '[CRITICAL] ' : '• '}
            {finding.message}
            {finding.recommendation ? ` — ${finding.recommendation}` : ''}
          </Text>
        ))
      )}

      <Text style={styles.sectionTitle}>Follow-up recommendations</Text>
      {followUp.length === 0 ? (
        <Text style={styles.empty}>
          No follow-up recommendations have been drafted for this discharge.
        </Text>
      ) : (
        followUp.map((item, i) => (
          <Text key={i} style={{ marginBottom: 4 }}>
            {i + 1}. {item.title ?? ''} — {item.detail ?? ''}
          </Text>
        ))
      )}
      {followUp.length > 0 && summary.ai_generated_at && (
        <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 4 }}>
          Follow-up recommendations were AI-drafted on {date(summary.ai_generated_at)} from the
          recorded data above, and are intended for review by the supervising instructor.
        </Text>
      )}
      {(ehr.ivf_ongoing ?? 0) > 0 && (
        <Text style={{ marginTop: 6 }}>
          Note: {ehr.ivf_ongoing} IVF line(s) were still recorded as running at discharge.
        </Text>
      )}
    </ReportShell>
  );

  const csv = toCsvBlocks([
    {
      title: 'Discharge summary',
      head: ['Field', 'Value'],
      rows: [
        ['Patient', name],
        ['Record ID', patient?.mimic_id ?? ''],
        ['Diagnosis', summary.diagnosis || ''],
        ['Room', summary.room_label || ''],
        ['Admitted', date(summary.admitted_at)],
        ['Discharged', date(summary.discharged_at)],
        ['Length of stay (days)', days === null ? '' : days],
        ['Vitals readings', vitals.readings ?? 0],
        ['Flagged readings', vitals.flagged ?? 0],
        ['TPR sheets', ehr.tpr ?? 0],
        ['IVF records', ehr.ivf ?? 0],
        ['IVF still running', ehr.ivf_ongoing ?? 0],
        ['Progress notes', ehr.notes ?? 0],
      ] as CsvCell[][],
    },
    {
      title: 'Vital signs',
      head: ['Vital', 'Min', 'Avg', 'Max', 'Readings'],
      rows: vitalRows as CsvCell[][],
    },
    {
      title: 'Abnormal findings',
      head: ['Severity', 'Finding', 'Recommendation'],
      rows: (vitals.findings ?? []).map((f) => [
        f.severity,
        f.message,
        f.recommendation ?? '',
      ]) as CsvCell[][],
    },
    {
      title: 'Follow-up recommendations',
      head: ['#', 'Title', 'Detail'],
      rows: followUp.map((f, i) => [i + 1, f.title ?? '', f.detail ?? '']) as CsvCell[][],
    },
  ]);

  return { subject: name, pdf, csv };
}

/**
 * Clinical attendance for one section: a per-student rate plus the shift-by-
 * shift grid behind it.
 *
 * Rates come from `tallyAttendance`, the same function the attendance screens
 * use, so a printed report and the page it was printed from can never disagree
 * about what counts as attended.
 */
export async function buildAttendanceReport(
  supabase: Supabase,
  meta: ReportMeta,
  sectionId: string,
): Promise<BuildResult> {
  const { data: section } = await supabase
    .from('sections')
    .select('id, name')
    .eq('id', sectionId)
    .maybeSingle();
  if (!section) return { error: 'Section not found', status: 404 };

  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, label, shift_type, starts_at, status')
    .eq('section_id', sectionId)
    .order('starts_at', { ascending: true })
    .limit(200);

  const shiftList = (shifts ?? []) as {
    id: string;
    label: string | null;
    shift_type: string;
    starts_at: string;
    status: string;
  }[];

  const { data: students } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', 'student')
    .eq('section_id', sectionId)
    .order('name');

  const studentList = (students ?? []) as { id: string; name: string }[];

  const assignments = shiftList.length
    ? ((
        await supabase
          .from('shift_assignments')
          .select('shift_id, student_id, attendance_status')
          .in(
            'shift_id',
            shiftList.map((s) => s.id),
          )
      ).data ?? [])
    : [];

  // student -> shift -> status
  const grid = new Map<string, Map<string, ShiftAttendanceStatus>>();
  for (const row of assignments as {
    shift_id: string;
    student_id: string;
    attendance_status: ShiftAttendanceStatus;
  }[]) {
    const byShift = grid.get(row.student_id) ?? new Map<string, ShiftAttendanceStatus>();
    byShift.set(row.shift_id, row.attendance_status);
    grid.set(row.student_id, byShift);
  }

  // A cancelled shift is not a shift anyone failed to attend, so it is left
  // out of the rates entirely rather than counted against the roster.
  const counted = shiftList.filter((s) => s.status !== 'cancelled');

  const perStudent = studentList.map((student) => {
    const byShift = grid.get(student.id);
    const statuses = counted
      .map((shift) => byShift?.get(shift.id))
      .filter((v): v is ShiftAttendanceStatus => !!v);
    const tally = tallyAttendance(statuses);
    return { student, tally };
  });

  const sectionTally = tallyAttendance(
    perStudent.flatMap(({ student }) =>
      counted
        .map((shift) => grid.get(student.id)?.get(shift.id))
        .filter((v): v is ShiftAttendanceStatus => !!v),
    ),
  );

  const SHORT: Record<ShiftAttendanceStatus, string> = {
    scheduled: '–',
    present: 'P',
    late: 'L',
    absent: 'A',
    excused: 'E',
  };

  const summaryRows = perStudent.map(({ student, tally }) => [
    student.name,
    tally.present,
    tally.late,
    tally.absent,
    tally.excused,
    tally.rate === null ? '—' : `${tally.rate}%`,
  ]);

  const pdf = (
    <ReportShell
      title={`Attendance — ${section.name}`}
      heading="Clinical Attendance Report"
      meta={meta}
      metaRows={[
        { label: 'Section', value: section.name },
        { label: 'Students', value: String(studentList.length) },
        { label: 'Shifts', value: String(counted.length) },
        {
          label: 'Section attendance',
          value: sectionTally.rate === null ? 'Not yet marked' : `${sectionTally.rate}%`,
        },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Present', value: sectionTally.present },
          { label: 'Late', value: sectionTally.late },
          { label: 'Absent', value: sectionTally.absent },
          { label: 'Excused', value: sectionTally.excused },
          { label: 'Unmarked', value: sectionTally.scheduled },
        ]}
      />

      <Text style={styles.sectionTitle}>Attendance by student</Text>
      <Table
        head={['Student', 'Present', 'Late', 'Absent', 'Excused', 'Rate']}
        rows={summaryRows}
        emptyText="No students are enrolled in this section."
      />

      <Text style={styles.sectionTitle}>Shifts</Text>
      <Table
        head={['Shift', 'Marked', 'Present', 'Absent']}
        rows={counted.map((shift) => {
          const statuses = studentList
            .map((s) => grid.get(s.id)?.get(shift.id))
            .filter((v): v is ShiftAttendanceStatus => !!v);
          const t = tallyAttendance(statuses);
          return [
            `${shift.label || shift.shift_type.toUpperCase()} · ${date(shift.starts_at)}`,
            t.total - t.scheduled,
            t.present + t.late,
            t.absent,
          ];
        })}
        emptyText="No shifts have been scheduled for this section."
      />
      <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 6 }}>
        Rate counts present and late as attended. Excused and unmarked shifts are excluded from
        the rate rather than counted as absences. Cancelled shifts are omitted entirely.
      </Text>
    </ReportShell>
  );

  const csv = toCsvBlocks([
    {
      title: `Attendance — ${section.name}`,
      head: ['Student', 'Present', 'Late', 'Absent', 'Excused', 'Rate'],
      rows: summaryRows as CsvCell[][],
    },
    {
      title: 'Shift grid (P present, L late, A absent, E excused, - unmarked)',
      head: ['Student', ...counted.map((s) => `${s.label || s.shift_type.toUpperCase()} ${date(s.starts_at)}`)],
      rows: studentList.map((student) => [
        student.name,
        ...counted.map((shift) => {
          const status = grid.get(student.id)?.get(shift.id);
          return status ? SHORT[status] : '';
        }),
      ]) as CsvCell[][],
    },
  ]);

  return { subject: section.name, pdf, csv };
}
