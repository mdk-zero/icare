import { Text } from '@react-pdf/renderer';
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { ReportShell, StatGrid, Table, styles, type ReportMeta, type ReportDocument } from './kit';
import { toCsv, toCsvBlocks, type CsvCell } from './csv';

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
  csv: string;
}

export type BuildResult = BuiltReport | { error: string; status: number };

function fmtDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : '—';
}

// ---------------------------------------------------------------------------
// Faculty — one faculty member's sections and student counts
// ---------------------------------------------------------------------------

export async function buildAdminFacultyReport(
  supabase: Supabase,
  meta: ReportMeta,
  facultyId: string,
): Promise<BuildResult> {
  if (!facultyId) {
    const { data: allFaculty } = await supabase
      .from('users')
      .select('id, name, email, created_at, last_login_at')
      .eq('role', 'faculty')
      .order('name');

    const ids = (allFaculty ?? []).map((f) => f.id);
    const { data: links } = ids.length
      ? await supabase.from('faculty_sections').select('faculty_id, sections(id, name)').in('faculty_id', ids)
      : { data: [] as unknown[] };

    const sectionsByFaculty = new Map<string, { id: string; name: string }[]>();
    for (const l of links ?? []) {
      const row = l as unknown as { faculty_id: string; sections: { id: string; name: string } | null };
      if (!row.sections) continue;
      const list = sectionsByFaculty.get(row.faculty_id) ?? [];
      list.push(row.sections);
      sectionsByFaculty.set(row.faculty_id, list);
    }

    const { data: students } = await supabase
      .from('users')
      .select('section_id')
      .eq('role', 'student')
      .not('section_id', 'is', null);

    const studentsPerSection = new Map<string, number>();
    for (const s of students ?? []) {
      if (!s.section_id) continue;
      studentsPerSection.set(s.section_id, (studentsPerSection.get(s.section_id) ?? 0) + 1);
    }

    const rows = (allFaculty ?? []).map((f) => {
      const sects = sectionsByFaculty.get(f.id) ?? [];
      const count = sects.reduce((sum, s) => sum + (studentsPerSection.get(s.id) ?? 0), 0);
      return [`${f.name}\n${f.email}`, String(sects.length), String(count)];
    });

    const totalSections = new Set<string>();
    for (const list of sectionsByFaculty.values()) {
      for (const s of list) totalSections.add(s.id);
    }
    const totalStudents = (allFaculty ?? []).reduce((sum, f) => {
      const sects = sectionsByFaculty.get(f.id) ?? [];
      return sum + sects.reduce((s, sect) => s + (studentsPerSection.get(sect.id) ?? 0), 0);
    }, 0);
    const withSections = (allFaculty ?? []).filter((f) => (sectionsByFaculty.get(f.id) ?? []).length > 0).length;
    const withoutSections = (allFaculty ?? []).length - withSections;
    const description = `This report covers all ${allFaculty?.length ?? 0} faculty members across ${totalSections.size} sections, supervising ${totalStudents} students. ${withSections} faculty have section assignments and ${withoutSections} have none yet.`;

    const metaRows = [
      { label: 'Scope', value: 'All Faculty' },
      { label: 'Total', value: String(allFaculty?.length ?? 0) },
    ];

    const pdf = (
      <ReportShell
        title="All Faculty Report"
        heading="iCARE++ All Faculty Report"
        meta={meta}
        metaRows={metaRows}
      >
        <Text style={{ fontSize: 10, color: '#4b5563', marginTop: 10, marginBottom: 12, lineHeight: 1.4 }}>{description}</Text>
        <Text style={styles.sectionTitle}>Faculty Roster</Text>
        <Table
          head={['Name / Email', 'Sections', 'Students']}
          rows={rows}
          emptyText="No faculty accounts yet."
        />
      </ReportShell>
    );

    const csv = toCsvBlocks([
      { title: 'All Faculty Report', head: [], rows: [] },
      { title: description, head: ['Name', 'Email', 'Sections', 'Students'], rows: (allFaculty ?? []).map((f) => {
        const sects = sectionsByFaculty.get(f.id) ?? [];
        const count = sects.reduce((sum, s) => sum + (studentsPerSection.get(s.id) ?? 0), 0);
        return [f.name, f.email, String(sects.length), String(count)] as CsvCell[];
      }) },
    ]);

    return { subject: 'all-faculty', pdf, csv };
  }

  const { data: faculty } = await supabase
    .from('users')
    .select('id, name, email, created_at, last_login_at')
    .eq('id', facultyId)
    .eq('role', 'faculty')
    .maybeSingle();

  if (!faculty) return { error: 'Faculty not found', status: 404 };

  const { data: links } = await supabase
    .from('faculty_sections')
    .select('sections(id, name)')
    .eq('faculty_id', facultyId);

  const sections = (links ?? [])
    .map((l) => (l as unknown as { sections: { id: string; name: string } | null }).sections)
    .filter(Boolean) as { id: string; name: string }[];

  const { count: studentCount } = sections.length
    ? await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'student')
        .in('section_id', sections.map((s) => s.id))
    : { count: 0 };

  const joinedYear = faculty.created_at ? new Date(faculty.created_at).getFullYear() : '—';
  const sectionList = sections.map((s) => s.name).join(', ') || 'none';
  const sectionSummary = sections.length === 1 ? '1 section' : `${sections.length} sections`;
  const description = `${faculty.name} has been a faculty member since ${joinedYear}, handling ${sectionSummary} (${sectionList}) with ${studentCount ?? 0} students.`;

  const metaRows = [
    { label: 'Faculty', value: faculty.name },
    { label: 'Email', value: faculty.email },
    { label: 'Joined', value: fmtDate(faculty.created_at) },
  ];

  const pdf = (
    <ReportShell
      title={`Faculty Report - ${faculty.name}`}
      heading="iCARE++ Faculty Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={{ fontSize: 10, color: '#4b5563', marginBottom: 12, lineHeight: 1.4 }}>{description}</Text>
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Sections', value: sections.length },
          { label: 'Students', value: studentCount ?? 0 },
        ]}
      />

      <Text style={styles.sectionTitle}>Assigned Sections</Text>
      <Table
        head={['Section', 'Students']}
        rows={sections.map((s) => [s.name, 0])}
        emptyText="No sections assigned yet."
      />
    </ReportShell>
  );

  const csv = toCsvBlocks([
    { title: `Faculty report — ${faculty.name}`, head: [], rows: [[description]] },
    {
      title: 'Sections',
      head: ['Section'],
      rows: sections.map((s) => [s.name]),
    },
  ]);

  return { subject: faculty.name, pdf, csv };
}

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
        heading="iCARE++ All Rooms Report"
        meta={meta}
        metaRows={metaRows}
      >
        <Text style={{ fontSize: 10, color: '#4b5563', marginTop: 10, marginBottom: 12, lineHeight: 1.4 }}>{description}</Text>
        <Text style={styles.sectionTitle}>Room Roster</Text>
        <Table
          head={['Room', 'Number', 'Capacity', 'Occupied', 'Status']}
          rows={rows}
          emptyText="No rooms created yet."
        />
      </ReportShell>
    );

    const csv = toCsvBlocks([
      { title: 'All Rooms Report', head: [], rows: [] },
      { title: description, head: ['Room', 'Number', 'Capacity', 'Occupied', 'Status'], rows: rows as CsvCell[][] },
    ]);

    return { subject: 'all-rooms', pdf, csv };
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
      heading="iCARE++ Room Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={{ fontSize: 10, color: '#4b5563', marginBottom: 12, lineHeight: 1.4 }}>{description}</Text>
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

  const csv = toCsvBlocks([
    { title: `Room report — ${room.name}`, head: [], rows: [[description]] },
    {
      title: 'Occupants',
      head: ['Student', 'Email', 'Since'],
      rows: occupants.map((o) => [o.name, o.email, o.since] as CsvCell[]),
    },
  ]);

  return { subject: room.name, pdf, csv };
}

// ---------------------------------------------------------------------------
// Users — one user's account details
// ---------------------------------------------------------------------------

export async function buildAdminUserReport(
  supabase: Supabase,
  meta: ReportMeta,
  userId: string,
): Promise<BuildResult> {
  if (!userId) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, role, created_at, last_login_at')
      .order('name');

    const rows = (users ?? []).map((u) => [
      `${u.name}\n${u.email}`,
      u.role,
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
    const description = `This report covers all ${users?.length ?? 0} users: ${studentCount} students, ${facultyCount} faculty, and ${adminCount} admins.`;

    const metaRows = [
      { label: 'Scope', value: 'All Users' },
      { label: 'Total', value: String(users?.length ?? 0) },
    ];

    const pdf = (
      <ReportShell
        title="All Users Report"
        heading="iCARE++ All Users Report"
        meta={meta}
        metaRows={metaRows}
      >
        <Text style={{ fontSize: 10, color: '#4b5563', marginTop: 10, marginBottom: 12, lineHeight: 1.4 }}>{description}</Text>
        <Text style={styles.sectionTitle}>Overview</Text>
        <StatGrid
          items={[
            { label: 'Students', value: studentCount },
            { label: 'Faculty', value: facultyCount },
            { label: 'Admins', value: adminCount },
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

    const csv = toCsvBlocks([
      { title: 'All Users Report', head: [], rows: [] },
      { title: description, head: ['Name', 'Email', 'Role', 'Joined', 'Last login'], rows: (users ?? []).map((u) => [u.name, u.email, u.role, fmtDate(u.created_at), fmtDate(u.last_login_at)] as CsvCell[]) },
    ]);

    return { subject: 'all-users', pdf, csv };
  }

  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, role, created_at, last_login_at')
    .eq('id', userId)
    .maybeSingle();

  if (!user) return { error: 'User not found', status: 404 };

  const { count: attemptCount } = await supabase
    .from('assessment_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', userId);

  const joinedDate = fmtDate(user.created_at);
  const lastLogin = fmtDate(user.last_login_at);
  const description = `Report for ${user.name}, a ${user.role} since ${joinedDate}. Last logged in on ${lastLogin} with ${attemptCount ?? 0} assessment ${attemptCount === 1 ? 'attempt' : 'attempts'} on record.`;

  const metaRows = [
    { label: 'Name', value: user.name },
    { label: 'Email', value: user.email },
    { label: 'Role', value: user.role },
    { label: 'Joined', value: joinedDate },
    { label: 'Last login', value: lastLogin },
  ];

  const pdf = (
    <ReportShell
      title={`User Report - ${user.name}`}
      heading="iCARE++ User Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={{ fontSize: 10, color: '#4b5563', marginBottom: 12, lineHeight: 1.4 }}>{description}</Text>
      <Text style={styles.sectionTitle}>Activity</Text>
      <StatGrid
        items={[
          { label: 'Assessment attempts', value: attemptCount ?? 0 },
        ]}
      />
    </ReportShell>
  );

  const csv = toCsvBlocks([
    { title: `User report — ${user.name}`, head: [], rows: [[description]] },
    { title: 'Details', head: ['Field', 'Value'], rows: [
      ['Name', user.name],
      ['Email', user.email],
      ['Role', user.role],
      ['Joined', joinedDate],
      ['Last login', lastLogin],
      ['Assessment attempts', attemptCount ?? 0],
    ] as CsvCell[][] },
  ]);

  return { subject: user.name, pdf, csv };
}

// ---------------------------------------------------------------------------
// Summary — all faculty, rooms, and users at a glance
// ---------------------------------------------------------------------------

export async function buildAdminSummaryReport(
  supabase: Supabase,
  meta: ReportMeta,
): Promise<BuildResult> {
  const [{ data: faculty }, { data: rooms }, { data: userCounts }] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, email, created_at, last_login_at')
      .eq('role', 'faculty')
      .order('name'),
    supabase.from('rooms').select('*').order('room_number'),
    supabase
      .from('users')
      .select('role')
      .in('role', ['student', 'faculty', 'admin']),
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
  const description = `Admin overview with ${totalStudents} students, ${totalFaculty} faculty, ${totalAdmins} admins, and ${totalRooms} rooms (${totalOccupied}/${totalCapacity} capacity occupied).`;

  const metaRows = [
    { label: 'Generated for', value: 'Admin Overview' },
  ];

  const pdf = (
    <ReportShell
      title="Admin Summary Report"
      heading="iCARE++ Admin Summary Report"
      meta={meta}
      metaRows={metaRows}
    >
      <Text style={{ fontSize: 10, color: '#4b5563', marginBottom: 12, lineHeight: 1.4 }}>{description}</Text>
      <Text style={styles.sectionTitle}>Overview</Text>
      <StatGrid
        items={[
          { label: 'Students', value: totalStudents },
          { label: 'Faculty', value: totalFaculty },
          { label: 'Admins', value: totalAdmins },
          { label: 'Rooms', value: totalRooms },
        ]}
      />

      <Text style={styles.sectionTitle}>Faculty</Text>
      <Table
        head={['Name', 'Email', 'Joined', 'Last login']}
        rows={facultyRows}
        emptyText="No faculty accounts yet."
      />

      <Text style={styles.sectionTitle}>Rooms</Text>
      <Table
        head={['Room', 'Number', 'Capacity', 'Occupied', 'Status']}
        rows={roomRows}
        emptyText="No rooms created yet."
      />
    </ReportShell>
  );

  const csv = toCsvBlocks([
    { title: 'Admin summary report', head: [], rows: [[description]] },
    {
      title: 'Faculty',
      head: ['Name', 'Email', 'Joined', 'Last login'],
      rows: facultyRows as CsvCell[][],
    },
    {
      title: 'Rooms',
      head: ['Room', 'Number', 'Capacity', 'Occupied', 'Status'],
      rows: roomRows as CsvCell[][],
    },
  ]);

  return { subject: 'admin-summary', pdf, csv };
}
