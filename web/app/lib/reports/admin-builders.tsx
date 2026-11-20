import { adminVisibleUserIds, ownsFaculty, type AdminScope } from '@/app/lib/admin-scope';
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { ReportShell, type ReportMeta, type ReportDocument } from './kit';
import { date as fmtDate, groupNames, studentWork } from './data';
import {
  FacultyListBody,
  FacultyOneBody,
  RoomOneBody,
  RoomsListBody,
  SummaryBody,
  UserOneBody,
  UsersListBody,
  type AccountRow,
  type InstructorFacts,
  type InstructorRow,
  type RoomRow,
  type SupervisedGroup,
} from './dean-sheet';
import { earlierOf, emptyTotals, poolTotals, totalOf } from './view';
import { fetchAll, readMatching } from '../fetch-all';
import { kindOf, scenarioKinds } from '../scenario-kind';
import { termStatus } from '../course-progress';
import { loadOfferingRosters } from '../courses';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export const ADMIN_REPORT_TYPES = ['faculty', 'rooms', 'users', 'summary'] as const;
export type AdminReportType = (typeof ADMIN_REPORT_TYPES)[number];

export function isAdminReportType(value: unknown): value is AdminReportType {
  return typeof value === 'string' && (ADMIN_REPORT_TYPES as readonly string[]).includes(value);
}

/** When id is empty the builder returns every record of that type. */
export const ADMIN_REPORT_NEEDS_TARGET: Record<AdminReportType, boolean> = {
  faculty: false,
  rooms: false,
  users: false,
  summary: false,
};

export interface BuiltReport {
  subject: string;
  pdf: ReportDocument;
}

export type BuildResult = BuiltReport | { error: string; status: number };

// ---------------------------------------------------------------------------
// Faculty — the groups each faculty member supervises, and their grading
// ---------------------------------------------------------------------------

interface FacultyLoad {
  groups: { id: string; label: string; section: string; memberIds: string[] }[];
  /** Their roster: their group members, plus whole sections and added students on their running courses. */
  studentIds: string[];
  /** Patient Cases they finalized. */
  scenariosGraded: number;
  /** Return Demonstrations they finalized. */
  demosGraded: number;
  casesGraded: number;
  /** Handed in by their students and not graded yet. */
  awaiting: number;
  /** The work behind `awaiting`, so totals across instructors count each piece once. */
  awaitingIds: string[];
  /** The earliest `submitted_at` among that work; null when nothing is waiting. */
  oldestAwaitingAt: string | null;
}

/**
 * What each instructor looks after and the grades they gave. Their students
 * are their group members (048/051) and the rosters of their courses whose
 * semester hasn't ended (whole sections where they have no group, and students
 * added by hand), the same roster their Students tab shows. Every read pages
 * past PostgREST's 1,000-row cap.
 */
async function facultyLoad(supabase: Supabase, facultyIds: readonly string[]): Promise<Map<string, FacultyLoad>> {
  const load = new Map<string, FacultyLoad>(
    facultyIds.map((id) => [
      id,
      { groups: [], studentIds: [], scenariosGraded: 0, demosGraded: 0, casesGraded: 0, awaiting: 0, awaitingIds: [], oldestAwaitingAt: null },
    ]),
  );
  if (facultyIds.length === 0) return load;
  const ids = [...facultyIds];

  const teams = await readMatching<{ id: string; name: string; faculty_id: string; sections: { name: string } | null }>(
    ids,
    (part, from, to) => supabase.from('teams').select('id, name, faculty_id, sections(name)').in('faculty_id', part).order('id').range(from, to),
  );
  const teamOwner = new Map<string, string>();
  const groupOf = new Map<string, FacultyLoad['groups'][number]>();
  for (const t of teams) {
    const section = t.sections?.name ?? 'No section';
    const group = { id: t.id, label: `${section} / ${t.name}`, section, memberIds: [] as string[] };
    load.get(t.faculty_id)?.groups.push(group);
    groupOf.set(t.id, group);
    teamOwner.set(t.id, t.faculty_id);
  }

  const members = await readMatching<{ team_id: string; student_id: string }>([...teamOwner.keys()], (part, from, to) =>
    supabase.from('team_members').select('team_id, student_id').in('team_id', part).order('team_id').order('student_id').range(from, to),
  );
  const roster = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const m of members) {
    const owner = teamOwner.get(m.team_id);
    if (owner) roster.get(owner)!.add(m.student_id);
    groupOf.get(m.team_id)?.memberIds.push(m.student_id);
  }

  // Their running courses' rosters (a course they teach this semester or next).
  const offerings = (
    await readMatching<{ id: string; faculty_id: string; academic_terms: { starts_on: string; ends_on: string } | null }>(
      ids,
      (part, from, to) =>
        supabase
          .from('course_offerings')
          .select('id, faculty_id, academic_terms(starts_on, ends_on)')
          .in('faculty_id', part)
          .order('id')
          .range(from, to),
    ).catch(() => [])
  ).filter((o) => o.academic_terms && termStatus(o.academic_terms) !== 'ended');
  if (offerings.length > 0) {
    const links = await readMatching<{ offering_id: string; section_id: string }>(
      offerings.map((o) => o.id),
      (part, from, to) =>
        supabase.from('course_offering_sections').select('offering_id, section_id').in('offering_id', part).order('offering_id').range(from, to),
    );
    const sectionsOf = new Map<string, string[]>();
    for (const l of links) sectionsOf.set(l.offering_id, [...(sectionsOf.get(l.offering_id) ?? []), l.section_id]);
    const rosters = await loadOfferingRosters(
      supabase,
      offerings.map((o) => ({ id: o.id, faculty_id: o.faculty_id, section_ids: sectionsOf.get(o.id) ?? [] })),
    );
    for (const o of offerings) {
      for (const s of rosters.get(o.id)?.students ?? []) roster.get(o.faculty_id)?.add(s.id);
    }
  }
  const instructorsOf = new Map<string, string[]>();
  for (const [facultyId, students] of roster) {
    load.get(facultyId)!.studentIds = [...students];
    for (const s of students) instructorsOf.set(s, [...(instructorsOf.get(s) ?? []), facultyId]);
  }

  const students = [...instructorsOf.keys()];
  const [finalized, graded, waitingScenarios, waitingCases] = await Promise.all([
    readMatching<{ finalized_by: string; scenario_id: string }>(ids, (part, from, to) =>
      supabase
        .from('scenario_assignments')
        .select('id, finalized_by, scenario_id')
        .eq('status', 'completed')
        .in('finalized_by', part)
        .order('id')
        .range(from, to),
    ),
    readMatching<{ graded_by: string }>(ids, (part, from, to) =>
      supabase.from('case_submissions').select('id, graded_by').eq('status', 'graded').in('graded_by', part).order('id').range(from, to),
    ).catch(() => []),
    readMatching<{ id: string; student_id: string; submitted_at: string | null }>(students, (part, from, to) =>
      supabase
        .from('scenario_assignments')
        .select('id, student_id, submitted_at')
        .neq('status', 'completed')
        .not('submitted_at', 'is', null)
        .in('student_id', part)
        .order('id')
        .range(from, to),
    ),
    readMatching<{ id: string; student_id: string; submitted_at: string | null }>(students, (part, from, to) =>
      supabase.from('case_submissions').select('id, student_id, submitted_at').eq('status', 'submitted').in('student_id', part).order('id').range(from, to),
    ).catch(() => []),
  ]);
  const kinds = await scenarioKinds(supabase, [...new Set(finalized.map((r) => r.scenario_id))]);
  for (const r of finalized) {
    const e = load.get(r.finalized_by);
    if (!e) continue;
    if (kindOf(kinds, r.scenario_id) === 'return_demo') e.demosGraded += 1;
    else e.scenariosGraded += 1;
  }
  for (const r of graded) {
    const e = load.get(r.graded_by);
    if (e) e.casesGraded += 1;
  }
  for (const [prefix, rows] of [['s', waitingScenarios], ['c', waitingCases]] as const) {
    for (const r of rows) {
      for (const facultyId of instructorsOf.get(r.student_id) ?? []) {
        const e = load.get(facultyId)!;
        e.awaiting += 1;
        e.awaitingIds.push(`${prefix}:${r.id}`);
        e.oldestAwaitingAt = earlierOf(e.oldestAwaitingAt, r.submitted_at);
      }
    }
  }
  return load;
}

/** Totals across instructors, each student and each piece of work counted once. */
function loadTotals(load: Map<string, FacultyLoad>) {
  const all = [...load.values()];
  return {
    groups: all.reduce((n, l) => n + l.groups.length, 0),
    students: new Set(all.flatMap((l) => l.studentIds)).size,
    graded: all.reduce((n, l) => n + l.scenariosGraded + l.demosGraded + l.casesGraded, 0),
    awaiting: new Set(all.flatMap((l) => l.awaitingIds)).size,
    oldestAwaitingAt: all.reduce<string | null>((oldest, l) => earlierOf(oldest, l.oldestAwaitingAt), null),
  };
}

const graded = (l: FacultyLoad) => l.scenariosGraded + l.demosGraded + l.casesGraded;

const instructorFacts = (l: FacultyLoad): InstructorFacts => ({
  groups: l.groups.length,
  students: l.studentIds.length,
  patientCasesGraded: l.scenariosGraded,
  returnDemosGraded: l.demosGraded,
  casesGraded: l.casesGraded,
  awaiting: l.awaiting,
  oldestAwaitingAt: l.oldestAwaitingAt,
});

interface FacultyAccount {
  id: string;
  name: string;
  email: string;
  created_at: string | null;
  last_login_at: string | null;
}

/** The instructor accounts in scope; every one, paged, before the ownership column exists. */
async function readFaculty(supabase: Supabase, facultyIds: readonly string[] | null): Promise<FacultyAccount[]> {
  const select = 'id, name, email, created_at, last_login_at';
  const rows = facultyIds
    ? await readMatching<FacultyAccount>(facultyIds, (part, from, to) =>
        supabase.from('users').select(select).eq('role', 'faculty').in('id', part).order('id').range(from, to),
      )
    : await fetchAll<FacultyAccount>((from, to) => supabase.from('users').select(select).eq('role', 'faculty').order('id').range(from, to));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function buildAdminFacultyReport(
  supabase: Supabase,
  meta: ReportMeta,
  facultyId: string,
  scope: AdminScope | null = null,
): Promise<BuildResult> {
  const now = new Date();
  if (facultyId && !ownsFaculty(scope, facultyId)) return { error: 'Instructor not found', status: 404 };
  if (!facultyId) {
    const faculty = await readFaculty(supabase, scope ? scope.facultyIds : null);
    const load = await facultyLoad(supabase, faculty.map((f) => f.id));
    const totals = loadTotals(load);

    const rows: InstructorRow[] = faculty.map((f) => {
      const l = load.get(f.id)!;
      return {
        name: f.name,
        groups: l.groups.length,
        students: l.studentIds.length,
        graded: graded(l),
        awaiting: l.awaiting,
        oldestAwaitingAt: l.oldestAwaitingAt,
        lastLogin: f.last_login_at,
      };
    });

    const pdf = (
      <ReportShell title="All Instructors Report" subject={scope ? 'Your instructors' : 'All instructors'} meta={meta} metaRows={[]}>
        <FacultyListBody rows={rows} totals={totals} now={now} />
      </ReportShell>
    );

    return { subject: 'all-faculty', pdf };
  }

  const [{ data: faculty }, loads] = await Promise.all([
    supabase.from('users').select('id, name, email, created_at, last_login_at').eq('id', facultyId).eq('role', 'faculty').maybeSingle(),
    facultyLoad(supabase, [facultyId]),
  ]);
  if (!faculty) return { error: 'Instructor not found', status: 404 };

  const l = loads.get(facultyId)!;
  const work = await studentWork(supabase, [...new Set(l.groups.flatMap((g) => g.memberIds))]);

  const groups: SupervisedGroup[] = l.groups.map((g) => {
    const totals = poolTotals(g.memberIds.map((id) => work.get(id)?.totals ?? emptyTotals()));
    return {
      name: g.label,
      members: g.memberIds.length,
      withWork: g.memberIds.filter((id) => totalOf(work.get(id)?.totals ?? emptyTotals()).n > 0).length,
      totals,
    };
  });
  const sections = [...new Set(l.groups.map((g) => g.section))].sort();

  const pdf = (
    <ReportShell
      title="Instructor Report"
      subject={faculty.name}
      meta={meta}
      metaRows={[
        { label: 'Email', value: faculty.email },
        { label: 'Sections', value: sections.join(', ') || 'None' },
        { label: 'Joined', value: fmtDate(faculty.created_at) },
        { label: 'Last login', value: fmtDate(faculty.last_login_at) },
      ]}
    >
      <FacultyOneBody facts={instructorFacts(l)} groups={groups} now={now} />
    </ReportShell>
  );

  return { subject: faculty.name, pdf };
}

const ROLE_LABEL: Record<string, string> = {
  student: 'Student',
  faculty: 'Instructor',
  admin: 'Dean',
  super_admin: 'Admin',
};

/**
 * Role names for a report. A Dean's reports cover only their own people, so
 * the one Dean-level account in them is the viewer, named by their own
 * title: Dean or Program Chair (080).
 */
function roleNames(meta: ReportMeta): Record<string, string> {
  return { ...ROLE_LABEL, admin: meta.deanLabel ?? ROLE_LABEL.admin };
}

// ---------------------------------------------------------------------------
// Rooms — one room's details and current assignments
// ---------------------------------------------------------------------------

/**
 * The rooms of a Dean's ward (077), or every room without a limit, with how
 * many students each one holds now. The assignments are read for these rooms
 * only and paged, so a busy ward is never cut off at the row cap.
 */
async function readRooms(supabase: Supabase, deanId: string | null): Promise<RoomRow[]> {
  let query = supabase.from('rooms').select('id, name, room_number, capacity, status').order('room_number');
  if (deanId) query = query.eq('admin_id', deanId);
  const { data, error } = await query;
  if (error) throw error;
  const rooms = (data ?? []) as { id: string; name: string; room_number: string; capacity: number | null; status: string | null }[];

  const held = await readMatching<{ room_id: string }>(
    rooms.map((r) => r.id),
    (part, from, to) => supabase.from('room_assignments').select('id, room_id').in('room_id', part).is('ends_at', null).order('id').range(from, to),
  );
  const occupancy = new Map<string, number>();
  for (const a of held) occupancy.set(a.room_id, (occupancy.get(a.room_id) ?? 0) + 1);

  return rooms.map((r) => ({
    name: r.name,
    number: r.room_number,
    capacity: r.capacity ?? 0,
    occupied: occupancy.get(r.id) ?? 0,
    status: r.status ?? 'active',
  }));
}

export async function buildAdminRoomReport(
  supabase: Supabase,
  meta: ReportMeta,
  roomId: string,
  /** The Dean whose ward this is (077); null for every room. */
  deanId: string | null = null,
): Promise<BuildResult> {
  if (!roomId) {
    const rooms = await readRooms(supabase, deanId);
    const pdf = (
      <ReportShell title="All Rooms Report" subject="Your ward" meta={meta} metaRows={[]}>
        <RoomsListBody rooms={rooms} />
      </ReportShell>
    );

    return { subject: 'all-rooms', pdf };
  }

  let roomQuery = supabase.from('rooms').select('id, name, room_number, capacity, status').eq('id', roomId);
  if (deanId) roomQuery = roomQuery.eq('admin_id', deanId);
  const { data: room } = await roomQuery.maybeSingle();

  if (!room) return { error: 'Room not found', status: 404 };

  // Two foreign keys point at users (the student and who assigned them), so the embed names the first.
  const { data: assignments, error } = await supabase
    .from('room_assignments')
    .select('id, starts_at, users!room_assignments_student_id_fkey(name)')
    .eq('room_id', roomId)
    .is('ends_at', null);
  if (error) throw error;

  const occupants = (assignments ?? []).map((a) => ({
    name: (a as unknown as { users: { name: string } | null }).users?.name ?? 'Unknown',
    since: a.starts_at as string | null,
  }));

  const pdf = (
    <ReportShell
      title="Room Report"
      subject={room.name}
      meta={meta}
      metaRows={[
        { label: 'Number', value: room.room_number },
        { label: 'Status', value: (room.status ?? 'active').replace(/^./, (c: string) => c.toUpperCase()) },
      ]}
    >
      <RoomOneBody capacity={room.capacity ?? 0} occupants={occupants} />
    </ReportShell>
  );

  return { subject: room.name, pdf };
}

// ---------------------------------------------------------------------------
// Users — accounts, and for one user what they have been graded on or grade
// ---------------------------------------------------------------------------

export async function buildAdminUserReport(
  supabase: Supabase,
  meta: ReportMeta,
  userId: string,
  scope: AdminScope | null = null,
  adminId = '',
): Promise<BuildResult> {
  const now = new Date();
  const visible = scope ? adminVisibleUserIds(scope, adminId) : null;
  if (userId && visible && !visible.includes(userId)) return { error: 'User not found', status: 404 };
  if (!userId) {
    type Account = { id: string; name: string; email: string; role: string; created_at: string | null; last_login_at: string | null };
    const select = 'id, name, email, role, created_at, last_login_at';
    const users = visible
      ? await readMatching<Account>(visible, (part, from, to) => supabase.from('users').select(select).in('id', part).order('id').range(from, to))
      : await fetchAll<Account>((from, to) => supabase.from('users').select(select).order('id').range(from, to));
    const roles = roleNames(meta);

    const rows: AccountRow[] = users.map((u) => ({
      name: u.name,
      email: u.email,
      role: u.role,
      roleName: roles[u.role] ?? u.role,
      createdAt: u.created_at,
      lastLogin: u.last_login_at,
    }));

    const pdf = (
      <ReportShell title="All Users Report" subject="Your users" meta={meta} metaRows={[]}>
        <UsersListBody rows={rows} now={now} />
      </ReportShell>
    );

    return { subject: 'all-users', pdf };
  }

  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, role, section_id, created_at, last_login_at')
    .eq('id', userId)
    .maybeSingle();

  if (!user) return { error: 'User not found', status: 404 };

  const isStudent = user.role === 'student';

  const [groups, work, { data: section }, loads] = await Promise.all([
    isStudent ? groupNames(supabase, [userId]) : Promise.resolve(new Map<string, string>()),
    isStudent ? studentWork(supabase, [userId]) : Promise.resolve(null),
    user.section_id
      ? supabase.from('sections').select('name').eq('id', user.section_id).maybeSingle()
      : Promise.resolve({ data: null }),
    user.role === 'faculty' ? facultyLoad(supabase, [userId]) : Promise.resolve(null),
  ]);
  const load = loads?.get(userId) ?? null;

  const pdf = (
    <ReportShell
      title="User Report"
      subject={user.name}
      meta={meta}
      metaRows={[
        { label: 'Email', value: user.email },
        { label: 'Role', value: roleNames(meta)[user.role] ?? user.role },
        ...(isStudent
          ? [
              { label: 'Section', value: section?.name ?? 'Unassigned' },
              { label: 'Group', value: groups.get(userId) ?? 'No group' },
            ]
          : []),
        { label: 'Joined', value: fmtDate(user.created_at) },
        { label: 'Last login', value: fmtDate(user.last_login_at) },
      ]}
    >
      <UserOneBody student={work?.get(userId)?.totals} instructor={load ? instructorFacts(load) : undefined} now={now} />
    </ReportShell>
  );

  return { subject: user.name, pdf };
}

// ---------------------------------------------------------------------------
// Summary — the Dean's cohort at a glance: results, grading backlog, workload, ward
// ---------------------------------------------------------------------------

/**
 * Reads: students, instructors and their loads, graded work, sections and
 * rooms all start together; only the room counts wait for the rooms. The
 * graded work comes from studentWork, which pages every table past the row
 * cap and chunks the id lists, and sums the same rows as dw.fact_student_work
 * (the Analytics page), so the cohort figures match it.
 */
export async function buildAdminSummaryReport(
  supabase: Supabase,
  meta: ReportMeta,
  scope: AdminScope | null = null,
  /** The Dean whose ward this is (077); null for every room. */
  deanId: string | null = null,
): Promise<BuildResult> {
  const now = new Date();
  type StudentRow = { id: string; section_id: string | null; sections: { name: string } | null };
  const readStudents = (ids: readonly string[] | null) =>
    ids
      ? readMatching<StudentRow>(ids, (part, from, to) =>
          supabase.from('users').select('id, section_id, sections!section_id(name)').eq('role', 'student').in('id', part).order('id').range(from, to),
        )
      : fetchAll<StudentRow>((from, to) =>
          supabase.from('users').select('id, section_id, sections!section_id(name)').eq('role', 'student').order('id').range(from, to),
        );

  // Before the ownership columns (053) there is no scope, so the lists are read first and the rest follows.
  const early = scope ? null : await Promise.all([readStudents(null), readFaculty(supabase, null)]);
  const studentIds = scope ? scope.studentIds : early![0].map((s) => s.id);
  const facultyIds = scope ? scope.facultyIds : early![1].map((f) => f.id);

  const [studentRows, faculty, load, work, sectionRows, rooms] = await Promise.all([
    early ? early[0] : readStudents(studentIds),
    early ? early[1] : readFaculty(supabase, facultyIds),
    facultyLoad(supabase, facultyIds),
    studentWork(supabase, studentIds),
    // Sections in scope are listed even when nobody is in them yet.
    scope
      ? readMatching<{ id: string; name: string }>(scope.sectionIds, (part, from, to) =>
          supabase.from('sections').select('id, name').in('id', part).order('id').range(from, to),
        )
      : Promise.resolve([] as { id: string; name: string }[]),
    readRooms(supabase, deanId),
  ]);

  const totals = loadTotals(load);
  const onARoster = new Set([...load.values()].flatMap((l) => l.studentIds));

  const instructors: InstructorRow[] = faculty.map((f) => {
    const l = load.get(f.id)!;
    return {
      name: f.name,
      groups: l.groups.length,
      students: l.studentIds.length,
      graded: graded(l),
      awaiting: l.awaiting,
      oldestAwaitingAt: l.oldestAwaitingAt,
      lastLogin: f.last_login_at,
    };
  });

  const pdf = (
    <ReportShell title={`${roleNames(meta).admin} Summary Report`} subject="Your instructors and students" meta={meta} metaRows={[]}>
      <SummaryBody
        students={studentRows.map((s) => ({ section: s.sections?.name ?? 'No section', totals: work.get(s.id)?.totals ?? emptyTotals() }))}
        sections={sectionRows.map((s) => s.name)}
        instructors={instructors}
        awaiting={totals.awaiting}
        oldestAwaitingAt={totals.oldestAwaitingAt}
        notOnRoster={scope ? studentIds.filter((id) => !onARoster.has(id)).length : null}
        rooms={{
          count: rooms.length,
          capacity: rooms.reduce((n, r) => n + r.capacity, 0),
          occupied: rooms.reduce((n, r) => n + r.occupied, 0),
        }}
        now={now}
      />
    </ReportShell>
  );

  return { subject: 'admin-summary', pdf };
}
