import { adminVisibleUserIds, ownsFaculty, type AdminScope } from '@/app/lib/admin-scope';
import { Text } from '@react-pdf/renderer';
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { ReportShell, StatGrid, Table, styles, type ReportMeta, type ReportDocument } from './kit';
import { avg, date as fmtDate, grade, gradeTile, groupNames, pct, plural, studentWork } from './data';

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

const lead = { fontSize: 10, color: '#4b5563', marginTop: 10, marginBottom: 12, lineHeight: 1.4 } as const;

// ---------------------------------------------------------------------------
// Faculty — the groups each faculty member supervises, and their grading
// ---------------------------------------------------------------------------

/** Pads an empty id list so an `in` filter matches nothing rather than erroring. */
const idsOrNone = (ids: readonly string[]) => (ids.length ? [...ids] : ['00000000-0000-0000-0000-000000000000']);

interface FacultyLoad {
  groups: { id: string; label: string; section: string }[];
  studentIds: string[];
  scenariosGraded: number;
  casesGraded: number;
  /** Handed in by their students and not graded yet. */
  awaiting: number;
}

/**
 * What each faculty member looks after since groups (048/051): the members of
 * the groups they supervise, not whole sections, and the grades they gave.
 */
async function facultyLoad(supabase: Supabase, facultyIds: readonly string[]): Promise<Map<string, FacultyLoad>> {
  const load = new Map<string, FacultyLoad>(
    facultyIds.map((id) => [id, { groups: [], studentIds: [], scenariosGraded: 0, casesGraded: 0, awaiting: 0 }]),
  );
  if (facultyIds.length === 0) return load;

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, faculty_id, sections(name)')
    .in('faculty_id', [...facultyIds]);
  const teamOwner = new Map<string, string>();
  for (const t of teams ?? []) {
    const section = (t as unknown as { sections: { name: string } | null }).sections?.name ?? 'No section';
    load.get(t.faculty_id as string)?.groups.push({ id: t.id, label: `${section} / ${t.name}`, section });
    teamOwner.set(t.id, t.faculty_id as string);
  }

  const teamIds = [...teamOwner.keys()];
  const { data: members } = teamIds.length
    ? await supabase.from('team_members').select('team_id, student_id').in('team_id', teamIds)
    : { data: [] as { team_id: string; student_id: string }[] };
  const supervisorOf = new Map<string, string>();
  for (const m of members ?? []) {
    const owner = teamOwner.get(m.team_id as string);
    if (!owner) continue;
    load.get(owner)!.studentIds.push(m.student_id as string);
    supervisorOf.set(m.student_id as string, owner);
  }

  const students = [...supervisorOf.keys()];
  const [scenarios, cases, waitingScenarios, waitingCases] = await Promise.all([
    supabase.from('scenario_assignments').select('finalized_by').eq('status', 'completed').in('finalized_by', [...facultyIds]),
    supabase.from('case_submissions').select('graded_by').eq('status', 'graded').in('graded_by', [...facultyIds]),
    supabase
      .from('scenario_assignments')
      .select('student_id')
      .neq('status', 'completed')
      .not('submitted_at', 'is', null)
      .in('student_id', idsOrNone(students)),
    supabase.from('case_submissions').select('student_id').eq('status', 'submitted').in('student_id', idsOrNone(students)),
  ]);
  for (const r of scenarios.data ?? []) {
    const e = load.get(r.finalized_by as string);
    if (e) e.scenariosGraded += 1;
  }
  for (const r of cases.data ?? []) {
    const e = load.get(r.graded_by as string);
    if (e) e.casesGraded += 1;
  }
  for (const r of [...(waitingScenarios.data ?? []), ...(waitingCases.data ?? [])]) {
    const e = load.get(supervisorOf.get(r.student_id as string) ?? '');
    if (e) e.awaiting += 1;
  }
  return load;
}

export async function buildAdminFacultyReport(
  supabase: Supabase,
  meta: ReportMeta,
  facultyId: string,
  scope: AdminScope | null = null,
): Promise<BuildResult> {
  if (facultyId && !ownsFaculty(scope, facultyId)) return { error: 'Instructor not found', status: 404 };
  if (!facultyId) {
    let facultyQuery = supabase
      .from('users')
      .select('id, name, email, last_login_at')
      .eq('role', 'faculty')
      .order('name');
    if (scope) facultyQuery = facultyQuery.in('id', idsOrNone(scope.facultyIds));
    const { data: allFaculty } = await facultyQuery;
    const faculty = allFaculty ?? [];
    const load = await facultyLoad(supabase, faculty.map((f) => f.id));

    const totals = [...load.values()].reduce(
      (t, l) => ({
        groups: t.groups + l.groups.length,
        students: t.students + l.studentIds.length,
        graded: t.graded + l.scenariosGraded + l.casesGraded,
        awaiting: t.awaiting + l.awaiting,
      }),
      { groups: 0, students: 0, graded: 0, awaiting: 0 },
    );
    const withoutGroups = faculty.filter((f) => (load.get(f.id)?.groups.length ?? 0) === 0).length;

    const pdf = (
      <ReportShell
        title="All Instructors Report"
        heading="All Instructors Report"
        meta={meta}
        metaRows={[
          { label: 'Scope', value: scope ? 'Your instructors' : 'All instructors' },
          { label: 'Instructors', value: String(faculty.length) },
        ]}
      >
        <Text style={lead}>
          {plural(faculty.length, 'instructor')} {faculty.length === 1 ? 'supervises' : 'supervise'}{' '}
          {plural(totals.groups, 'group')} with {plural(totals.students, 'student')}.{' '}
          {withoutGroups > 0
            ? `${withoutGroups} ${withoutGroups === 1 ? 'has' : 'have'} no group yet.`
            : 'Every one of them has a group.'}
        </Text>
        <StatGrid
          items={[
            { label: 'Instructors', value: faculty.length },
            { label: 'Students supervised', value: totals.students },
            { label: 'Grades given', value: totals.graded },
            { label: 'Awaiting grade', value: totals.awaiting },
          ]}
        />
        <Text style={styles.sectionTitle}>Instructors</Text>
        <Table
          head={['Name / Email', 'Groups', 'Students', 'Graded', 'Awaiting', 'Last login']}
          widths={[3, 0.9, 1, 0.9, 1, 1.4]}
          rows={faculty.map((f) => {
            const l = load.get(f.id)!;
            return [
              `${f.name}\n${f.email}`,
              l.groups.length,
              l.studentIds.length,
              l.scenariosGraded + l.casesGraded,
              l.awaiting,
              fmtDate(f.last_login_at),
            ];
          })}
          emptyText="No instructor accounts yet."
        />
        <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 6 }}>
          Students are the members of the groups each instructor supervises. Graded counts patient cases
          and case presentations they graded. Awaiting counts work their students handed in that is not
          graded yet.
        </Text>
      </ReportShell>
    );

    return { subject: 'all-faculty', pdf };
  }

  const { data: faculty } = await supabase
    .from('users')
    .select('id, name, email, created_at, last_login_at')
    .eq('id', facultyId)
    .eq('role', 'faculty')
    .maybeSingle();
  if (!faculty) return { error: 'Instructor not found', status: 404 };

  const l = (await facultyLoad(supabase, [facultyId])).get(facultyId)!;
  const work = await studentWork(supabase, l.studentIds);
  const { data: memberRows } = l.groups.length
    ? await supabase.from('team_members').select('team_id, student_id').in('team_id', l.groups.map((g) => g.id))
    : { data: [] as { team_id: string; student_id: string }[] };

  const groupRows = l.groups
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map((g) => {
      const ids = (memberRows ?? []).filter((m) => m.team_id === g.id).map((m) => m.student_id as string);
      const graded = ids.flatMap((id) => {
        const a = work.get(id)?.scenarioAverage;
        return a === null || a === undefined ? [] : [a];
      });
      return [g.label, ids.length, `${graded.length}/${ids.length}`, grade(avg(graded))];
    });
  const sections = [...new Set(l.groups.map((g) => g.section))].sort();

  const pdf = (
    <ReportShell
      title={`Instructor Report - ${faculty.name}`}
      heading="Instructor Report"
      meta={meta}
      metaRows={[
        { label: 'Instructor', value: faculty.name },
        { label: 'Email', value: faculty.email },
        { label: 'Joined', value: fmtDate(faculty.created_at) },
        { label: 'Last login', value: fmtDate(faculty.last_login_at) },
        { label: 'Sections', value: sections.join(', ') || 'None' },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Groups', value: l.groups.length },
          { label: 'Students', value: l.studentIds.length },
          { label: 'Patient cases graded', value: l.scenariosGraded },
          { label: 'Cases graded', value: l.casesGraded },
          { label: 'Awaiting grade', value: l.awaiting },
        ]}
      />

      <Text style={styles.sectionTitle}>Groups supervised</Text>
      <Table
        head={['Group', 'Members', 'Graded', 'Patient case average']}
        widths={[3, 1, 1, 2]}
        rows={groupRows}
        emptyText="Not supervising any group yet."
      />
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

// ---------------------------------------------------------------------------
// Rooms — one room's details and current assignments
// ---------------------------------------------------------------------------

export async function buildAdminRoomReport(
  supabase: Supabase,
  meta: ReportMeta,
  roomId: string,
): Promise<BuildResult> {
  if (!roomId) {
    const [{ data: rooms }, { data: activeAssignments }] = await Promise.all([
      supabase.from('rooms').select('*').order('room_number'),
      supabase.from('room_assignments').select('room_id').is('ends_at', null),
    ]);

    const occupancy = new Map<string, number>();
    for (const a of activeAssignments ?? []) {
      occupancy.set(a.room_id, (occupancy.get(a.room_id) ?? 0) + 1);
    }

    const rows = (rooms ?? []).map((r) => [
      r.name,
      r.room_number,
      String(r.capacity ?? 0),
      String(occupancy.get(r.id) ?? 0),
      r.status ?? 'active',
    ]);

    const totalCapacity = (rooms ?? []).reduce((sum, r) => sum + (r.capacity ?? 0), 0);
    const totalOccupied = (rooms ?? []).reduce((sum, r) => sum + (occupancy.get(r.id) ?? 0), 0);
    const utilPct = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
    const activeRooms = (rooms ?? []).filter((r) => r.status === 'active' || !r.status).length;
    const description = `This report covers all ${rooms?.length ?? 0} rooms with a total capacity of ${totalCapacity}, ${totalOccupied} currently occupied (${utilPct}% utilization). ${activeRooms} rooms are active.`;

    const metaRows = [
      { label: 'Scope', value: 'All Rooms' },
      { label: 'Total', value: String(rooms?.length ?? 0) },
    ];

    const pdf = (
      <ReportShell
        title="All Rooms Report"
        heading="All Rooms Report"
        meta={meta}
        metaRows={metaRows}
      >
        <Text style={lead}>{description}</Text>
        <Text style={styles.sectionTitle}>Room Roster</Text>
        <Table
          head={['Room', 'Number', 'Capacity', 'Occupied', 'Status']}
          rows={rows}
          emptyText="No rooms created yet."
        />
      </ReportShell>
    );

    return { subject: 'all-rooms', pdf };
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle();

  if (!room) return { error: 'Room not found', status: 404 };

  const { data: assignments } = await supabase
    .from('room_assignments')
    .select('id, users(name, email), started_at')
    .eq('room_id', roomId)
    .is('ends_at', null);

  const occupants = (assignments ?? []).map((a) => ({
    name: (a as unknown as { users: { name: string; email: string } | null }).users?.name ?? 'Unknown',
    email: (a as unknown as { users: { name: string; email: string } | null }).users?.email ?? '',
    since: fmtDate(a.started_at),
  }));

  const occupancy = occupants.length;
  const capacity = room.capacity ?? 0;

  const roomStatusLabel = room.status ?? 'active';
  const available = Math.max(0, capacity - occupancy);
  const description = `Report for ${room.name} (${room.room_number}), a ${roomStatusLabel} room with a capacity of ${capacity}. Currently ${occupancy} ${occupancy === 1 ? 'student is' : 'students are'} assigned, leaving ${available} ${available === 1 ? 'spot' : 'spots'} available.`;

  const metaRows = [
    { label: 'Room', value: room.name },
    { label: 'Number', value: room.room_number },
    { label: 'Status', value: roomStatusLabel },
  ];

  const pdf = (
    <ReportShell
      title={`Room Report - ${room.name}`}
      heading="Room Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={lead}>{description}</Text>
      <Text style={styles.sectionTitle}>Occupancy</Text>
      <StatGrid
        items={[
          { label: 'Capacity', value: capacity },
          { label: 'Occupied', value: occupancy },
          { label: 'Available', value: available },
        ]}
      />

      <Text style={styles.sectionTitle}>Current Occupants</Text>
      <Table
        head={['Student', 'Email', 'Since']}
        rows={occupants.map((o) => [o.name, o.email, o.since])}
        emptyText="No students assigned to this room."
      />
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
  const visible = scope ? adminVisibleUserIds(scope, adminId) : null;
  if (userId && visible && !visible.includes(userId)) return { error: 'User not found', status: 404 };
  if (!userId) {
    let usersQuery = supabase
      .from('users')
      .select('id, name, email, role, created_at, last_login_at')
      .order('name');
    if (visible) usersQuery = usersQuery.in('id', visible);
    const { data: users } = await usersQuery;

    const rows = (users ?? []).map((u) => [
      `${u.name}\n${u.email}`,
      ROLE_LABEL[u.role] ?? u.role,
      fmtDate(u.created_at),
      fmtDate(u.last_login_at),
    ]);

    const byRole = new Map<string, number>();
    for (const u of users ?? []) {
      byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1);
    }

    const studentCount = byRole.get('student') ?? 0;
    const facultyCount = byRole.get('faculty') ?? 0;
    const adminCount = byRole.get('admin') ?? 0;
    const description = `This report covers all ${users?.length ?? 0} users: ${studentCount} students, ${facultyCount} instructors, and ${adminCount} deans.`;

    const metaRows = [
      { label: 'Scope', value: 'All Users' },
      { label: 'Total', value: String(users?.length ?? 0) },
    ];

    const pdf = (
      <ReportShell
        title="All Users Report"
        heading="All Users Report"
        meta={meta}
        metaRows={metaRows}
      >
        <Text style={lead}>{description}</Text>
        <Text style={styles.sectionTitle}>Overview</Text>
        <StatGrid
          items={[
            { label: 'Students', value: studentCount },
            { label: 'Instructors', value: facultyCount },
            { label: 'Deans', value: adminCount },
          ]}
        />
        <Text style={styles.sectionTitle}>User Roster</Text>
        <Table
          head={['Name / Email', 'Role', 'Joined', 'Last login']}
          rows={rows}
          emptyText="No users yet."
        />
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

  const joinedDate = fmtDate(user.created_at);
  const lastLogin = fmtDate(user.last_login_at);
  const isStudent = user.role === 'student';

  const [groups, work, { data: section }] = await Promise.all([
    isStudent ? groupNames(supabase, [userId]) : Promise.resolve(new Map<string, string>()),
    isStudent ? studentWork(supabase, [userId]) : Promise.resolve(null),
    user.section_id
      ? supabase.from('sections').select('name').eq('id', user.section_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const w = work?.get(userId);
  const load = user.role === 'faculty' ? (await facultyLoad(supabase, [userId])).get(userId)! : null;

  const pdf = (
    <ReportShell
      title={`User Report - ${user.name}`}
      heading="User Report"
      meta={meta}
      metaRows={[
        { label: 'Name', value: user.name },
        { label: 'Email', value: user.email },
        { label: 'Role', value: ROLE_LABEL[user.role] ?? user.role },
        ...(isStudent
          ? [
              { label: 'Section', value: section?.name ?? 'Unassigned' },
              { label: 'Group', value: groups.get(userId) ?? 'No group' },
            ]
          : []),
        { label: 'Joined', value: joinedDate },
        { label: 'Last login', value: lastLogin },
      ]}
    >
      {w && (
        <>
          <Text style={styles.sectionTitle}>Graded work</Text>
          <StatGrid
            items={[
              { label: 'Patient cases graded', value: `${w.scenariosGraded}/${w.scenariosAssigned}` },
              gradeTile('Patient case grade', w.scenarioAverage),
              { label: 'Case presentations', value: pct(w.caseAverage) },
              { label: 'Quizzes', value: pct(w.quizAverage) },
            ]}
          />
        </>
      )}
      {load && (
        <>
          <Text style={styles.sectionTitle}>Supervision</Text>
          <StatGrid
            items={[
              { label: 'Groups', value: load.groups.length },
              { label: 'Students', value: load.studentIds.length },
              { label: 'Grades given', value: load.scenariosGraded + load.casesGraded },
              { label: 'Awaiting grade', value: load.awaiting },
            ]}
          />
        </>
      )}
    </ReportShell>
  );

  return { subject: user.name, pdf };
}


// ---------------------------------------------------------------------------
// Summary — all faculty, rooms, and users at a glance
// ---------------------------------------------------------------------------

export async function buildAdminSummaryReport(
  supabase: Supabase,
  meta: ReportMeta,
  scope: AdminScope | null = null,
  adminId = '',
): Promise<BuildResult> {
  let facultyQuery = supabase
    .from('users')
    .select('id, name, email, created_at, last_login_at')
    .eq('role', 'faculty')
    .order('name');
  let countQuery = supabase.from('users').select('role').in('role', ['student', 'faculty', 'admin']);
  // Only this admin's faculty and students (migration 053); rooms stay shared.
  if (scope) {
    facultyQuery = facultyQuery.in('id', idsOrNone(scope.facultyIds));
    countQuery = countQuery.in('id', adminVisibleUserIds(scope, adminId));
  }
  const [{ data: faculty }, { data: rooms }, { data: userCounts }] = await Promise.all([
    facultyQuery,
    supabase.from('rooms').select('*').order('room_number'),
    countQuery,
  ]);

  const byRole = new Map<string, number>();
  for (const u of userCounts ?? []) {
    byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1);
  }

  const { data: activeAssignments } = await supabase
    .from('room_assignments')
    .select('room_id')
    .is('ends_at', null);

  const occupancy = new Map<string, number>();
  for (const a of activeAssignments ?? []) {
    occupancy.set(a.room_id, (occupancy.get(a.room_id) ?? 0) + 1);
  }

  const facultyRows = (faculty ?? []).map((f) => [
    f.name,
    f.email,
    fmtDate(f.created_at),
    fmtDate(f.last_login_at),
  ]);

  const roomRows = (rooms ?? []).map((r) => [
    r.name,
    r.room_number,
    String(r.capacity ?? 0),
    String(occupancy.get(r.id) ?? 0),
    r.status ?? 'active',
  ]);

  const totalStudents = byRole.get('student') ?? 0;
  const totalFaculty = byRole.get('faculty') ?? 0;
  const totalAdmins = byRole.get('admin') ?? 0;
  const totalRooms = rooms?.length ?? 0;
  const totalCapacity = (rooms ?? []).reduce((sum, r) => sum + (r.capacity ?? 0), 0);
  const totalOccupied = (rooms ?? []).reduce((sum, r) => sum + (occupancy.get(r.id) ?? 0), 0);
  const studentIds = scope ? scope.studentIds : null;
  const load = await facultyLoad(supabase, (faculty ?? []).map((f) => f.id));
  const awaiting = [...load.values()].reduce((sum, l) => sum + l.awaiting, 0);
  const gradesGiven = [...load.values()].reduce((sum, l) => sum + l.scenariosGraded + l.casesGraded, 0);
  const inGroups = new Set([...load.values()].flatMap((l) => l.studentIds));
  const ungrouped = studentIds === null ? null : studentIds.filter((id) => !inGroups.has(id)).length;

  const description = `Dean overview with ${plural(totalStudents, 'student')}, ${totalFaculty} instructors, ${plural(totalAdmins, 'dean')} and ${plural(totalRooms, 'room')} (${totalOccupied} of ${totalCapacity} places occupied).`;

  const metaRows = [
    { label: 'Scope', value: scope ? 'Your instructors and students' : 'Everyone' },
  ];

  const pdf = (
    <ReportShell
      title="Dean Summary Report"
      heading="Dean Summary Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={lead}>{description}</Text>
      <Text style={styles.sectionTitle}>Overview</Text>
      <StatGrid
        items={[
          { label: 'Students', value: totalStudents },
          { label: 'Instructors', value: totalFaculty },
          { label: 'Deans', value: totalAdmins },
          { label: 'Rooms', value: totalRooms },
        ]}
      />

      <Text style={styles.sectionTitle}>Grading</Text>
      <StatGrid
        items={[
          { label: 'Grades given', value: gradesGiven },
          { label: 'Awaiting grade', value: awaiting },
          { label: 'Students in no supervised group', value: ungrouped ?? '—' },
        ]}
      />

      <Text style={styles.sectionTitle}>Instructors</Text>
      <Table
        head={['Name', 'Email', 'Joined', 'Last login']}
        widths={[2, 2.6, 1.2, 1.2]}
        rows={facultyRows}
        emptyText="No instructor accounts yet."
      />

      <Text style={styles.sectionTitle}>Rooms</Text>
      <Table
        head={['Room', 'Number', 'Capacity', 'Occupied', 'Status']}
        rows={roomRows}
        emptyText="No rooms created yet."
      />
    </ReportShell>
  );

  return { subject: 'admin-summary', pdf };
}
