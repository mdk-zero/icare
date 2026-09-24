import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse,
  faHeartPulse,
  faLayerGroup,
  faUserTie,
  faDoorOpen,
  faCircleCheck,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/app/lib/supabase/server";
import { readSession } from "@/app/lib/auth/session";
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
  attempts: number;
  /** Null until a student in the section has submitted something. */
  average: number | null;
}

interface AttentionItem {
  key: string;
  message: string;
  detail: string;
  href: string;
  action: string;
}

const PASSING_SCORE = 75;

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

  const [
    usersRes,
    sectionsRes,
    facultySectionsRes,
    attemptsRes,
    predictionsRes,
    roomsRes,
    patientsRes,
    activityRes,
  ] = await Promise.all([
    supabase.from("users").select("id, name, role, section_id"),
    supabase.from("sections").select("id, name"),
    supabase.from("faculty_sections").select("faculty_id, section_id"),
    supabase.from("assessment_attempts").select("student_id, score").eq("status", "submitted"),
    supabase
      .from("performance_predictions")
      .select("student_id, risk, predicted_at")
      .order("predicted_at", { ascending: false }),
    supabase.from("rooms").select("id, status, capacity"),
    // Only admitted patients hold a bed; check-out clears room_id anyway, the
    // status filter keeps a hand-edited discharged row from counting.
    supabase.from("patients").select("room_id").eq("status", "admitted").not("room_id", "is", null),
    supabase
      .from("audit_logs")
      .select("action, created_at, actor:users(name)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const users = usersRes.data ?? [];
  const sections = sectionsRes.data ?? [];
  const facultySections = facultySectionsRes.data ?? [];
  const attempts = attemptsRes.data ?? [];
  const predictions = predictionsRes.data ?? [];

  const students = users.filter((u) => u.role === "student");
  const faculty = users.filter((u) => u.role === "faculty");
  const studentIds = new Set(students.map((s) => s.id));

  // Who is rostered where, and how each section has scored. Attempts count per
  // attempt, the way the Analytics faculty ranking weights a section.
  const sectionOfStudent = new Map(students.map((s) => [s.id, s.section_id as string | null]));
  const tally = new Map<string, { students: number; attempts: number; sum: number }>();
  const entryFor = (sectionId: string) => {
    let entry = tally.get(sectionId);
    if (!entry) {
      entry = { students: 0, attempts: 0, sum: 0 };
      tally.set(sectionId, entry);
    }
    return entry;
  };
  for (const s of students) {
    if (s.section_id) entryFor(s.section_id).students += 1;
  }
  for (const a of attempts) {
    const sectionId = sectionOfStudent.get(a.student_id);
    if (!sectionId) continue;
    const entry = entryFor(sectionId);
    entry.attempts += 1;
    entry.sum += a.score ?? 0;
  }
  const unassignedStudents = students.filter((s) => !s.section_id).length;

  // Sections with nobody in them have nothing to compare, so they're left out.
  // Weakest average first puts the section needing intervention on top; ones
  // with no submissions yet sink to the bottom.
  const sectionRows: SectionRow[] = sections
    .map((sec): SectionRow => {
      const t = tally.get(sec.id);
      return {
        id: sec.id,
        name: sec.name,
        students: t?.students ?? 0,
        attempts: t?.attempts ?? 0,
        average: t && t.attempts > 0 ? Math.round(t.sum / t.attempts) : null,
      };
    })
    .filter((s) => s.students > 0)
    .sort((a, b) => {
      if (a.average === null && b.average === null) return a.name.localeCompare(b.name);
      if (a.average === null) return 1;
      if (b.average === null) return -1;
      return a.average - b.average || a.name.localeCompare(b.name);
    });

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
      message: "Risk predictions have never run",
      detail: "Cohort health can't be reported until the ML jobs have scored the students.",
      href: "/admin/student-management",
      action: "Run ML jobs",
    });
  } else if (lastPredictedAt) {
    const daysStale = Math.floor((Date.now() - new Date(lastPredictedAt).getTime()) / DAY_MS);
    if (daysStale > STALE_PREDICTION_DAYS) {
      attention.push({
        key: "predictions-stale",
        message: `Risk predictions last ran ${daysStale} days ago`,
        detail: "The nightly run should keep these current; at-risk flags may be out of date.",
        href: "/admin/student-management",
        action: "Run ML jobs",
      });
    }
  }

  return {
    // The masthead greets whoever is signed in, the way the faculty one does.
    viewerName: users.find((u) => u.id === viewerId)?.name ?? null,
    totalStudents: students.length,
    facultyCount: faculty.length,
    assessedCount,
    atRiskCount,
    lastPredictedAt,
    sectionRows,
    assignedStudents: students.length - unassignedStudents,
    unassignedStudents,
    uncoveredSectionCount: uncoveredSections.length,
    coverageKnown,
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
    facultyCount,
    assessedCount,
    atRiskCount,
    lastPredictedAt,
    sectionRows,
    assignedStudents,
    unassignedStudents,
    uncoveredSectionCount,
    coverageKnown,
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
      ? `${Math.round((onTrackCount / assessedCount) * 100)}% on track · as of ${shortDate(lastPredictedAt)}`
      : totalStudents > 0
        ? "No prediction run yet"
        : "No students enrolled";
  const studentsPerFaculty =
    facultyCount > 0 && totalStudents > 0 ? `${Math.round(totalStudents / facultyCount)}:1` : "—";

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          href="/admin/analytics"
          icon={faHeartPulse}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          value={assessedCount > 0 ? `${onTrackCount}/${assessedCount}` : "—"}
          label="Cohort Health"
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
          href="/admin/faculty"
          icon={faUserTie}
          value={studentsPerFaculty}
          label="Faculty Load"
          caption={
            coverageKnown
              ? `${plural(facultyCount, "faculty member")} · ${uncoveredSectionCount} uncovered`
              : plural(facultyCount, "faculty member")
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
            title="Section Comparison"
            subtitle={`Weakest average first · the tick marks the ${PASSING_SCORE}% pass line`}
          >
            <Link
              href="/admin/analytics"
              className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
            >
              Analytics →
            </Link>
          </PanelHeader>
          {sectionRows.length === 0 ? (
            <EmptyState
              title="No sections with students yet"
              hint="Create sections and enroll students to compare them here."
            />
          ) : (
            <div className="p-4 space-y-4">
              {sectionRows.map((section) => (
                <div key={section.id}>
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <span className="min-w-0 truncate text-sm font-medium text-gray-700">
                      {section.name}
                      <span className="font-normal text-gray-400">
                        {" "}
                        · {plural(section.students, "student")} ·{" "}
                        {plural(section.attempts, "attempt")}
                      </span>
                    </span>
                    <span
                      className={`tabular shrink-0 text-sm font-semibold ${
                        section.average === null
                          ? "text-gray-400"
                          : section.average >= PASSING_SCORE
                            ? "text-gray-900"
                            : "text-red-600"
                      }`}
                    >
                      {section.average === null ? "—" : `${section.average}%`}
                    </span>
                  </div>
                  <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    {section.average !== null && (
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          section.average >= PASSING_SCORE
                            ? "bg-gradient-to-r from-brand-600 to-brand-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(section.average, 100)}%` }}
                      />
                    )}
                    <span
                      aria-hidden
                      className="absolute top-0 h-full w-px bg-gray-400/70"
                      style={{ left: `${PASSING_SCORE}%` }}
                    />
                  </div>
                </div>
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

      <Panel>
        <PanelHeader
          title="Needs Your Attention"
          subtitle="Gaps in rosters and predictions that only an admin can close"
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
              Every student is placed, every section has faculty, and risk predictions are current.
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
    </div>
  );
}
