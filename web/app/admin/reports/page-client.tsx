"use client";

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuilding,
  faDoorOpen,
  faFileLines,
  faUserSlash,
  faUserTie,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "@/app/lib/api";
import { usePageData } from "@/app/lib/use-page-data";
import type { RecentReport } from "@/app/lib/reports/types";
import PageHeader from "../../components/PageHeader";
import ReportCenter, {
  defineReportType,
  sinceLabel,
  type Suggestion,
  type Target,
} from "../../components/ReportCenter";
import { daysSince, plural } from "../../faculty/_overview/format";

/** No sign-in for this long reads as "dormant". */
const DORMANT_DAYS = 30;

/** A whole-scope report older than this is worth suggesting again. */
const STALE_DAYS = 7;

interface FacultyRow {
  id: string;
  name: string;
  email: string;
  sections: { id: string; name: string }[];
  student_count: number;
}

interface RoomRow {
  id: string;
  name: string;
  room_number: string;
  capacity: number;
  status: string;
  students_assigned: number;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

async function getJson<T>(url: string, key: string): Promise<T[]> {
  const res = await apiFetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Unable to load ${key}`);
  const json = (await res.json()) as Record<string, T[] | undefined>;
  return json[key] ?? [];
}

// Module-level loaders, so the cache sees one stable function per key.
const loadFaculty = () => getJson<FacultyRow>("/api/admin/faculty", "faculty");
const loadRooms = () => getJson<RoomRow>("/api/admin/rooms", "rooms");
const loadUsers = () => getJson<UserRow>("/api/admin/users?role=all", "users");

interface FacultyTarget extends Target {
  sections: number;
  students: number;
}

interface RoomTarget extends Target {
  number: string;
  /** Occupied share of capacity; 0 for a room with no capacity set. */
  fill: number;
  full: boolean;
  status: string;
}

interface UserTarget extends Target {
  role: string;
  createdAt: string;
  /** Days since last sign-in; null when they never have. */
  idleDays: number | null;
}

const byName = (a: Target, b: Target) => a.label.localeCompare(b.label);

const ROLE_LABEL: Record<string, string> = { student: "Student", faculty: "Faculty", admin: "Admin" };

/** What's worth pulling now — from the lists already on the page, no AI. */
function suggestFor(
  faculty: FacultyTarget[] | undefined,
  rooms: RoomTarget[] | undefined,
  users: UserTarget[] | undefined,
  recent: RecentReport[] | undefined,
): Suggestion[] {
  const out: Suggestion[] = [];

  const unassigned = (faculty ?? []).filter((f) => f.sections === 0);
  if (unassigned.length > 0) {
    out.push({
      id: "faculty",
      icon: faUserTie,
      tone: "amber",
      title:
        unassigned.length === 1
          ? `${unassigned[0].label} has no sections`
          : `${unassigned.length} faculty without sections`,
      detail: "They can't see or report on any students until they're assigned.",
      cta: "Show them",
      action: { kind: "filter", type: "faculty", filter: "no-sections" },
    });
  }

  const full = (rooms ?? []).filter((r) => r.full);
  if (full.length === 1) {
    out.push({
      id: "rooms",
      icon: faDoorOpen,
      tone: "rose",
      title: `${full[0].label} is full`,
      detail: "Occupancy and current occupants in one report.",
      cta: "Preview room report",
      action: { kind: "preview", type: "rooms", targetId: full[0].id, subject: full[0].label },
    });
  } else if (full.length > 1) {
    out.push({
      id: "rooms",
      icon: faDoorOpen,
      tone: "rose",
      title: `${full.length} rooms at capacity`,
      detail: "No beds left for new admissions in these rooms.",
      cta: "Show them",
      action: { kind: "filter", type: "rooms", filter: "full" },
    });
  }

  const never = (users ?? []).filter((u) => u.idleDays === null);
  if (never.length > 0) {
    out.push({
      id: "users",
      icon: faUserSlash,
      tone: "amber",
      title: `${plural(never.length, "user")} never signed in`,
      detail: "Accounts that exist but have never been used.",
      cta: "Show them",
      action: { kind: "filter", type: "users", filter: "never" },
    });
  }

  // Wait for history before judging the summary stale, or it flashes "never".
  if (recent) {
    const last = recent.find((r) => r.type === "summary");
    const age = last ? daysSince(last.created_at) : null;
    if (!last || (age !== null && age >= STALE_DAYS)) {
      out.push({
        id: "summary",
        icon: faBuilding,
        tone: "brand",
        title: "Admin summary",
        detail: last
          ? `Last pulled ${sinceLabel(last.created_at)}.`
          : "Faculty, rooms and users on one page.",
        cta: "Preview",
        action: { kind: "preview", type: "summary", targetId: null, subject: "Admin summary" },
      });
    }
  }

  return out;
}

export default function AdminReportsClient() {
  const faculty = usePageData("admin:reports:faculty", loadFaculty);
  const rooms = usePageData("admin:reports:rooms", loadRooms);
  const users = usePageData("admin:reports:users", loadUsers);

  const facultyTargets = useMemo<FacultyTarget[] | undefined>(
    () =>
      faculty.data?.map((f) => ({
        id: f.id,
        label: f.name,
        sub: [
          f.email,
          f.sections.length > 0 ? f.sections.map((s) => s.name).join(", ") : null,
          plural(f.student_count, "student"),
        ]
          .filter(Boolean)
          .join(" · "),
        badges: f.sections.length === 0 ? [{ text: "No sections", tone: "amber" as const }] : [],
        sections: f.sections.length,
        students: f.student_count,
      })),
    [faculty.data],
  );

  const roomTargets = useMemo<RoomTarget[] | undefined>(
    () =>
      rooms.data?.map((r) => {
        const full = r.capacity > 0 && r.students_assigned >= r.capacity;
        const badges: RoomTarget["badges"] = [];
        if (full) badges.push({ text: "Full", tone: "rose" });
        if (r.status !== "active") {
          badges.push({ text: r.status.charAt(0).toUpperCase() + r.status.slice(1), tone: "slate" });
        }
        return {
          id: r.id,
          label: `${r.name} (${r.room_number})`,
          sub: `${r.students_assigned} of ${r.capacity} occupied`,
          badges,
          number: r.room_number,
          fill: r.capacity > 0 ? r.students_assigned / r.capacity : 0,
          full,
          status: r.status,
        };
      }),
    [rooms.data],
  );

  const userTargets = useMemo<UserTarget[] | undefined>(
    () =>
      users.data?.map((u) => {
        const idleDays = daysSince(u.last_login_at);
        const badges: UserTarget["badges"] = [];
        if (idleDays === null) badges.push({ text: "Never signed in", tone: "amber" });
        else if (idleDays >= DORMANT_DAYS) badges.push({ text: `No sign-in ${idleDays}d`, tone: "slate" });
        return {
          id: u.id,
          label: u.name,
          sub: [
            u.email,
            ROLE_LABEL[u.role] ?? u.role,
            u.last_login_at ? `signed in ${sinceLabel(u.last_login_at)}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          badges,
          role: u.role,
          createdAt: u.created_at,
          idleDays,
        };
      }),
    [users.data],
  );

  const types = [
    defineReportType<FacultyTarget>({
      type: "faculty",
      label: "Faculty",
      icon: faUserTie,
      blurb: "A faculty member's sections and the students under them.",
      contents: ["Section and student counts", "Assigned sections"],
      noun: "faculty",
      list: {
        items: facultyTargets,
        loading: faculty.loading,
        failed: Boolean(faculty.error),
        filters: [{ id: "no-sections", label: "No sections", test: (t) => t.sections === 0 }],
        sorts: [
          { id: "students", label: "Most students", compare: (a, b) => b.students - a.students || byName(a, b) },
          { id: "name", label: "A–Z", compare: byName },
        ],
        all: { label: "All faculty" },
      },
    }),
    defineReportType<RoomTarget>({
      type: "rooms",
      label: "Rooms",
      icon: faDoorOpen,
      blurb: "A room's capacity, occupancy and who is in it now.",
      contents: ["Capacity and occupancy", "Current occupants"],
      noun: "rooms",
      list: {
        items: roomTargets,
        loading: rooms.loading,
        failed: Boolean(rooms.error),
        filters: [
          { id: "full", label: "Full", test: (t) => t.full },
          { id: "available", label: "Has space", test: (t) => !t.full && t.status === "active" },
          { id: "offline", label: "Inactive / maintenance", test: (t) => t.status !== "active" },
        ],
        sorts: [
          { id: "fill", label: "Fullest", compare: (a, b) => b.fill - a.fill || byName(a, b) },
          {
            id: "number",
            label: "Room no.",
            compare: (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }),
          },
        ],
        all: { label: "All rooms" },
      },
    }),
    defineReportType<UserTarget>({
      type: "users",
      label: "Users",
      icon: faUsers,
      blurb: "An account's role, sign-in history and activity.",
      contents: ["Role and join date", "Sign-in history", "Assessment attempts"],
      noun: "users",
      list: {
        items: userTargets,
        loading: users.loading,
        failed: Boolean(users.error),
        filters: [
          { id: "never", label: "Never signed in", test: (t) => t.idleDays === null },
          {
            id: "dormant",
            label: `No sign-in ${DORMANT_DAYS}d+`,
            test: (t) => t.idleDays !== null && t.idleDays >= DORMANT_DAYS,
          },
        ],
        sorts: [
          { id: "name", label: "A–Z", compare: byName },
          { id: "newest", label: "Newest", compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
        ],
        facet: {
          label: "Role",
          options: Object.entries(ROLE_LABEL).map(([id, label]) => ({ id, label })),
          valueOf: (t) => t.role,
        },
        all: { label: "All users" },
      },
    }),
    defineReportType({
      type: "summary",
      label: "Admin summary",
      icon: faBuilding,
      blurb: "Faculty, rooms and users on one page — nothing to pick.",
      contents: ["Headcount by role", "Faculty roster", "Room roster"],
      noun: "records",
      scope:
        facultyTargets && roomTargets && userTargets
          ? `Covers ${plural(facultyTargets.length, "faculty member")}, ${plural(roomTargets.length, "room")} and ${plural(userTargets.length, "user")}.`
          : undefined,
    }),
  ];

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faFileLines} className="h-3 w-3" />, label: "Report Center" }}
        title="Reports"
        subtitle="Preview and export PDF or CSV reports on faculty, rooms and users"
      />
      <ReportCenter
        endpoint="/api/admin/reports"
        cachePrefix="admin"
        types={types}
        suggest={(recent) => suggestFor(facultyTargets, roomTargets, userTargets, recent)}
      />
    </div>
  );
}
