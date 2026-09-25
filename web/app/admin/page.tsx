import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse,
  faHeartPulse,
  faLayerGroup,
  faDoorOpen,
  faCircleCheck,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/app/lib/supabase/server";
import { readSession } from "@/app/lib/auth/session";
import { adminVisibleUserIds, getAdminScope } from "@/app/lib/admin-scope";
import PageHeader from "@/app/components/PageHeader";
import StatTile from "@/app/components/StatTile";

export const metadata: Metadata = {
  title: "Overview | iCARE++",
};

// Every widget reads live OLTP data; never prerender at build time.
export const dynamic = "force-dynamic";

interface ActivityRow {
  action: string;
  created_at: string;
  actor: { name: string } | null;
}

interface SectionRow {
  id: string;
  name: string;
  students: number;
}

interface AttentionItem {
  key: string;
  message: string;
  detail: string;
  href: string;
  action: string;
}

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

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return shortDate(iso);
}

function humanizeAction(action: string): string {
  // e.g. 'user.create' → 'user create', 'faculty.roster.update' → 'faculty roster update'
  return action.replaceAll(".", " ").replaceAll("_", " ");
}

/**
 * Timeline marker for an audit entry, keyed off the verb at the end of the
 * action ('user.create', 'room.delete'). The faculty overview colours its feed
 * the same way: a removal reads red, a creation green, everything else brand.
 */
function activityMeta(action: string): { dot: string; ring: string } {
  const verb = action.toLowerCase();
  if (verb.includes("delete") || verb.includes("remove") || verb.includes("archive")) {
    return { dot: "bg-red-600", ring: "ring-red-100" };
  }
  if (verb.includes("create") || verb.includes("add") || verb.includes("enroll")) {
    return { dot: "bg-emerald-600", ring: "ring-emerald-100" };
  }
  return { dot: "bg-brand-600", ring: "ring-teal-100" };
}

/** One hairline card per block — the panel the faculty overview is built from. */
function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-surface rounded-xl border border-hairline shadow-tile overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      {children && <div className="shrink-0 flex items-center gap-3">{children}</div>}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="p-10 text-center">
      <p className="text-gray-500 font-medium">{title}</p>
      <p className="text-sm text-gray-400 mt-1">{hint}</p>
    </div>
  );
}

async function loadDashboard(viewerId: string) {
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
    (visible
      ? supabase.from("audit_logs").select("action, created_at, actor:users(name)").in("actor_id", [...visible])
      : supabase.from("audit_logs").select("action, created_at, actor:users(name)")
    )
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const { data: memberRows, error: membersError } = await supabase.from("team_members").select("student_id");

  const users = (usersRes.data ?? []).filter((u) => !visible || visible.has(u.id));
  const sections = (sectionsRes.data ?? []).filter((sec) => !scope || scope.sectionIds.includes(sec.id));
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
  const ungroupedStudents = membersError ? 0 : students.filter((st) => st.section_id && !grouped.has(st.id)).length;
  const sectionRows: SectionRow[] = sections
    .map((sec): SectionRow => ({
      id: sec.id,
      name: sec.name,
      students: studentsBySection.get(sec.id) ?? 0,
    }))
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
  // sides of the ratio.
  const latestRisk = new Map<string, string>();
  for (const p of predictions) {
    if (studentIds.has(p.student_id) && !latestRisk.has(p.student_id)) {
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
      detail: "No faculty can see them until they're placed in a section.",
      href: "/admin/student-management",
      action: "Assign",
    });
  }
  if (ungroupedStudents > 0) {
    attention.push({
      key: "ungrouped",
      message: `${plural(ungroupedStudents, "student")} not in a group`,
      detail: "Faculty only see the students in the groups they supervise.",
      href: "/admin/student-management",
      action: "Group them",
    });
  }
  if (uncoveredSections.length > 0) {
    const names = uncoveredSections.slice(0, 3).map((s) => s.name).join(", ");
    const more = uncoveredSections.length > 3 ? ` +${uncoveredSections.length - 3} more` : "";
    attention.push({
      key: "uncovered",
      message: `${plural(uncoveredSections.length, "section")} without a faculty member`,
      detail: `${names}${more} — their students have no one reviewing them.`,
      href: "/admin/faculty/assignment",
      action: "Assign faculty",
    });
  }
  if (facultyWithoutSections > 0) {
    attention.push({
      key: "idle-faculty",
      message: `${plural(facultyWithoutSections, "faculty account")} with no sections`,
      detail: "They can sign in but have no students to see.",
      href: "/admin/faculty/assignment",
      action: "Assign",
    });
  }
  if (students.length > 0 && !lastPredictedAt) {
    attention.push({
      key: "predictions-never",
      message: "The risk check has never run",
      detail: "Students can't be marked on track or at risk until the ML jobs have run.",
      href: "/admin/student-management",
      action: "Run ML jobs",
    });
  } else if (lastPredictedAt) {
    const daysStale = Math.floor((Date.now() - new Date(lastPredictedAt).getTime()) / DAY_MS);
    if (daysStale > STALE_PREDICTION_DAYS) {
      attention.push({
        key: "predictions-stale",
        message: `The risk check last ran ${daysStale} days ago`,
        detail: "It should refresh every night, so who is at risk may be out of date.",
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
    activity: (activityRes.data ?? []) as unknown as ActivityRow[],
  };
}

export default async function AdminDashboard() {
  const session = await readSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect(session.role === "faculty" ? "/faculty" : "/dashboard");
  }

  const {
    viewerName,
    totalStudents,
    assessedCount,
    atRiskCount,
    lastPredictedAt,
    sectionRows,
    assignedStudents,
    unassignedStudents,
    activeRoomCount,
    occupiedRooms,
    admittedPatients,
    bedCapacity,
    attention,
    activity,
  } = await loadDashboard(session.uid);

  const firstName = viewerName ? viewerName.split(" ")[0] : null;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const onTrackCount = assessedCount - atRiskCount;
  const healthCaption =
    assessedCount > 0 && lastPredictedAt
      ? `${Math.round((onTrackCount / assessedCount) * 100)}% · last risk check ${shortDate(lastPredictedAt)}`
      : totalStudents > 0
        ? "No risk check yet"
        : "No students enrolled";

  return (
    <div className="space-y-4">
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faHouse} className="w-3.5 h-3.5" />,
          label: "Admin Dashboard",
        }}
        title={firstName ? `Welcome back, ${firstName}!` : "Welcome back!"}
        subtitle={`${today} • Here's what's happening across the program today.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatTile
          href="/admin/analytics"
          icon={faHeartPulse}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          value={assessedCount > 0 ? `${onTrackCount}/${assessedCount}` : "—"}
          label="Students on Track"
          caption={healthCaption}
        />
        <StatTile
          href="/admin/student-management"
          icon={faLayerGroup}
          value={sectionRows.length}
          label="Active Sections"
          caption={
            unassignedStudents > 0
              ? `${plural(assignedStudents, "student")} · ${unassignedStudents} unassigned`
              : `${plural(assignedStudents, "student")} · all assigned`
          }
        />
        <StatTile
          href="/admin/rooms"
          icon={faDoorOpen}
          value={`${occupiedRooms}/${activeRoomCount}`}
          label="Rooms in Use"
          caption={`${plural(admittedPatients, "patient")} · ${plural(bedCapacity, "bed")}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Needs Your Attention"
            subtitle="Things only an admin can fix"
          >
            {attention.length > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                {attention.length} open
              </span>
            )}
          </PanelHeader>
          {attention.length === 0 ? (
            <div className="p-10 text-center">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <FontAwesomeIcon icon={faCircleCheck} className="h-5 w-5" />
              </span>
              <p className="text-gray-500 font-medium">Nothing needs your attention</p>
              <p className="text-sm text-gray-400 mt-1">
                Every student is placed, every section has a faculty member, and the risk check is current.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {attention.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex items-center gap-3 p-4 hover:bg-subtle transition-colors"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{item.message}</p>
                    <p className="text-sm text-gray-500">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-sm text-brand-600 font-medium">{item.action} →</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Recent Activity" subtitle="Latest actions across the console">
            <Link
              href="/admin/audit"
              className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
            >
              Audit trail →
            </Link>
          </PanelHeader>
          {activity.length === 0 ? (
            <EmptyState
              title="No recorded activity yet"
              hint="Admin and faculty actions are logged here as they happen."
            />
          ) : (
            <div className="p-4">
              <ol className="relative space-y-5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-gray-100">
                {activity.map((entry, idx) => {
                  const meta = activityMeta(entry.action);
                  return (
                    <li key={idx} className="relative flex gap-3">
                      <span
                        className={`relative z-10 w-8 h-8 shrink-0 rounded-full bg-surface ring-4 ${meta.ring} flex items-center justify-center`}
                      >
                        <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                      </span>
                      <div className="flex-1 min-w-0 pb-0.5">
                        <p className="font-medium text-gray-900 text-sm capitalize">
                          {humanizeAction(entry.action)}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {entry.actor?.name ?? "System"}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {relativeTime(entry.created_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
