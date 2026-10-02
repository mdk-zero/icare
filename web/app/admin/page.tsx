import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/app/lib/supabase/server";
import { readSession } from "@/app/lib/auth/session";
import { adminVisibleUserIds, getAdminScope } from "@/app/lib/admin-scope";
import { getStudentsWithWork } from "@/app/lib/faculty-dashboard";
import { deanActorFilter } from "@/app/lib/audit-trail";
import { DEMO_COOKIE } from "@/app/lib/demo/session";
import {
  DashboardSkeleton,
  DashboardView,
  type ActivityRow,
  type AttentionItem,
  type DashboardData,
  type SectionRow,
} from "./_overview/DashboardView";
import DemoDashboard from "./_overview/DemoDashboard";

export const metadata: Metadata = {
  title: "Overview | iCARE++",
};

// Every widget reads live OLTP data; never prerender at build time.
export const dynamic = "force-dynamic";

/**
 * The ML service scores the cohort every night at 03:00, so a newest prediction
 * older than this means the scheduler is failing rather than the data being
 * quiet. Three days rides out a single missed night without crying wolf.
 */
const STALE_PREDICTION_DAYS = 3;

const DAY_MS = 24 * 3_600_000;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

async function loadDashboard(viewerId: string): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();
  // This admin's own faculty, sections and students (migration 053); null
  // before it, when every admin still sees everything.
  const scope = await getAdminScope(supabase, viewerId);
  const visible = scope ? new Set(adminVisibleUserIds(scope, viewerId)) : null;

  const [
    usersRes,
    sectionsRes,
    facultySectionsRes,
    predictionsRes,
    roomsRes,
    patientsRes,
    activityRes,
  ] = await Promise.all([
    supabase.from("users").select("id, name, role, section_id"),
    supabase.from("sections").select("id, name"),
    supabase.from("faculty_sections").select("faculty_id, section_id"),
    supabase
      .from("performance_predictions")
      .select("student_id, risk, predicted_at")
      .order("predicted_at", { ascending: false }),
    supabase.from("rooms").select("id, status, capacity"),
    // Only admitted patients hold a bed; check-out clears room_id anyway, the
    // status filter keeps a hand-edited discharged row from counting.
    supabase.from("patients").select("room_id").eq("status", "admitted").not("room_id", "is", null),
    // The dean's own activity and their instructors'; the whole trail is the admin's.
    supabase
      .from("audit_logs")
      .select("action, created_at, actor_id")
      .or(deanActorFilter(viewerId, scope))
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const { data: memberRows, error: membersError } = await supabase
    .from("team_members")
    .select("student_id");

  const users = (usersRes.data ?? []).filter((u) => !visible || visible.has(u.id));
  const usersById = new Map(
    (usersRes.data ?? []).map((u) => [u.id as string, { name: u.name as string }]),
  );
  const sections = (sectionsRes.data ?? []).filter(
    (sec) => !scope || scope.sectionIds.includes(sec.id),
  );
  const facultySections = (facultySectionsRes.data ?? []).filter(
    (fs) => !scope || scope.sectionIds.includes(fs.section_id),
  );
  const predictions = predictionsRes.data ?? [];

  const students = users.filter((u) => u.role === "student");
  const faculty = users.filter((u) => u.role === "faculty");
  const studentIds = new Set(students.map((s) => s.id));

  // Head count per section. Sections with nobody in them are left out: they
  // have no students to leave uncovered.
  const studentsBySection = new Map<string, number>();
  for (const st of students) {
    if (st.section_id) {
      studentsBySection.set(st.section_id, (studentsBySection.get(st.section_id) ?? 0) + 1);
    }
  }
  const unassignedStudents = students.filter((st) => !st.section_id).length;
  // Faculty see only the students in the groups they supervise, so a sectioned
  // student in no group is seen by nobody.
  const grouped = new Set((memberRows ?? []).map((m) => m.student_id as string));
  const ungroupedStudents = membersError
    ? 0
    : students.filter((st) => st.section_id && !grouped.has(st.id)).length;
  const sectionRows: SectionRow[] = sections
    .map(
      (sec): SectionRow => ({
        id: sec.id,
        name: sec.name,
        students: studentsBySection.get(sec.id) ?? 0,
      }),
    )
    .filter((sec) => sec.students > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Faculty coverage. If either query failed, "no faculty anywhere" would be
  // an alarm about a fault rather than a fact, so coverage is reported unknown.
  const coverageKnown = !sectionsRes.error && !facultySectionsRes.error;
  const coveredSectionIds = new Set(facultySections.map((fs) => fs.section_id));
  const facultyWithSections = new Set(facultySections.map((fs) => fs.faculty_id));
  const uncoveredSections = coverageKnown
    ? sectionRows.filter((s) => !coveredSectionIds.has(s.id))
    : [];
  const facultyWithoutSections = coverageKnown
    ? faculty.filter((f) => !facultyWithSections.has(f.id)).length
    : 0;

  // Latest prediction per student (rows arrive newest-first). Students who've
  // never been scored are unknown, not "on track", so they stay out of both
  // sides of the ratio — and so do students with no work assigned or done,
  // whose prediction is a guess about an empty record.
  const withWork = await getStudentsWithWork(supabase, [...studentIds]);
  const latestRisk = new Map<string, string>();
  for (const p of predictions) {
    if (
      studentIds.has(p.student_id) &&
      withWork.has(p.student_id) &&
      !latestRisk.has(p.student_id)
    ) {
      latestRisk.set(p.student_id, p.risk);
    }
  }
  const assessedCount = latestRisk.size;
  const atRiskCount = [...latestRisk.values()].filter((r) => r === "at_risk").length;
  const lastPredictedAt: string | null = predictions[0]?.predicted_at ?? null;

  // Beds: only rooms in service count towards how full the ward is.
  const admittedByRoom = new Map<string, number>();
  for (const p of patientsRes.data ?? []) {
    if (p.room_id) admittedByRoom.set(p.room_id, (admittedByRoom.get(p.room_id) ?? 0) + 1);
  }
  const activeRooms = (roomsRes.data ?? []).filter((r) => r.status === "active");
  const occupiedRooms = activeRooms.filter((r) => (admittedByRoom.get(r.id) ?? 0) > 0).length;
  const admittedPatients = activeRooms.reduce((sum, r) => sum + (admittedByRoom.get(r.id) ?? 0), 0);
  const bedCapacity = activeRooms.reduce((sum, r) => sum + r.capacity, 0);

  // Everything here is a gap only an admin can close.
  const attention: AttentionItem[] = [];
  if (unassignedStudents > 0) {
    attention.push({
      key: "unassigned",
      message: `${plural(unassignedStudents, "student")} not assigned to a section`,
      detail: "No instructor can see them until they're placed in a section.",
      href: "/admin/student-management",
      action: "Assign",
    });
  }
  if (ungroupedStudents > 0) {
    attention.push({
      key: "ungrouped",
      message: `${plural(ungroupedStudents, "student")} not in a group`,
      detail: "Instructors only see the students in the groups they supervise.",
      href: "/admin/student-management",
      action: "Group them",
    });
  }
  if (uncoveredSections.length > 0) {
    const names = uncoveredSections
      .slice(0, 3)
      .map((s) => s.name)
      .join(", ");
    const more = uncoveredSections.length > 3 ? ` +${uncoveredSections.length - 3} more` : "";
    attention.push({
      key: "uncovered",
      message: `${plural(uncoveredSections.length, "section")} without an instructor`,
      detail: `${names}${more} — their students have no one reviewing them.`,
      href: "/admin/faculty/assignment",
      action: "Assign instructor",
    });
  }
  if (facultyWithoutSections > 0) {
    attention.push({
      key: "idle-faculty",
      message: `${plural(facultyWithoutSections, "instructor account")} with no sections`,
      detail: "They can sign in but have no students to see.",
      href: "/admin/faculty/assignment",
      action: "Assign",
    });
  }
  if (students.length > 0 && !lastPredictedAt) {
    attention.push({
      key: "predictions-never",
      message: "The risk check has never run",
      detail: "Students can't be marked on track or low performing until the ML jobs have run.",
      href: "/admin/student-management",
      action: "Run ML jobs",
    });
  } else if (lastPredictedAt) {
    const daysStale = Math.floor((Date.now() - new Date(lastPredictedAt).getTime()) / DAY_MS);
    if (daysStale > STALE_PREDICTION_DAYS) {
      attention.push({
        key: "predictions-stale",
        message: `The risk check last ran ${daysStale} days ago`,
        detail: "It should refresh every night, so who is low performing may be out of date.",
        href: "/admin/student-management",
        action: "Run ML jobs",
      });
    }
  }

  return {
    // The masthead greets whoever is signed in, the way the faculty one does.
    viewerName: users.find((u) => u.id === viewerId)?.name ?? null,
    totalStudents: students.length,
    assessedCount,
    atRiskCount,
    lastPredictedAt,
    sectionRows,
    assignedStudents: students.length - unassignedStudents,
    unassignedStudents,
    activeRoomCount: activeRooms.length,
    occupiedRooms,
    admittedPatients,
    bedCapacity,
    attention,
    // actor_id has no foreign key (031), so names come from the users read above.
    activity: (activityRes.data ?? []).map(
      (row): ActivityRow => ({
        action: row.action,
        created_at: row.created_at,
        actor: usersById.get(row.actor_id) ?? null,
      }),
    ),
  };
}

export default async function AdminDashboard() {
  const session = await readSession();
  if (!session) {
    // A demo has no session; its numbers live in the visitor's browser.
    if ((await cookies()).get(DEMO_COOKIE)?.value === "admin") return <DemoDashboard />;
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect(
      session.role === "faculty"
        ? "/faculty"
        : session.role === "super_admin"
          ? "/super-admin"
          : "/login",
    );
  }

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent viewerId={session.uid} />
    </Suspense>
  );
}

/** Streams in once loadDashboard settles; DashboardSkeleton holds its place until then. */
async function DashboardContent({ viewerId }: { viewerId: string }) {
  return <DashboardView data={await loadDashboard(viewerId)} />;
}
