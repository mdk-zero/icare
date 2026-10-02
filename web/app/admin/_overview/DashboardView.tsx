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
import PageHeader from "@/app/components/PageHeader";
import StatTile from "@/app/components/StatTile";
import { lastName } from "@/app/faculty/_overview/format";
import { SkeletonActivityItem, SkeletonStatTile } from "@/app/components/skeletons";

/**
 * The Dean overview's markup, apart from where its numbers come from: the
 * page loads them on the server, the demo (DemoDashboard) from the browser.
 */

export interface ActivityRow {
  action: string;
  created_at: string;
  actor: { name: string } | null;
}

export interface SectionRow {
  id: string;
  name: string;
  students: number;
}

export interface AttentionItem {
  key: string;
  message: string;
  detail: string;
  href: string;
  action: string;
}


export interface DashboardData {
  viewerName: string | null;
  totalStudents: number;
  assessedCount: number;
  atRiskCount: number;
  lastPredictedAt: string | null;
  sectionRows: SectionRow[];
  assignedStudents: number;
  unassignedStudents: number;
  activeRoomCount: number;
  occupiedRooms: number;
  admittedPatients: number;
  bedCapacity: number;
  attention: AttentionItem[];
  activity: ActivityRow[];
}

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

export function DashboardView({ data }: { data: DashboardData }) {
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
  } = data;

  const surname = viewerName ? lastName(viewerName) : null;
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
          label: "Dean Dashboard",
        }}
        title={surname ? `Welcome back, Dean ${surname}!` : "Welcome back!"}
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
          href="/admin/wards"
          icon={faDoorOpen}
          value={`${occupiedRooms}/${activeRoomCount}`}
          label="Rooms in Use"
          caption={`${plural(admittedPatients, "patient")} · ${plural(bedCapacity, "bed")}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel>
          <PanelHeader title="Recent Activity" subtitle="You and your instructors">
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
              hint="Dean and instructor actions are logged here as they happen."
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
        <Panel className="lg:col-span-2">
          <PanelHeader title="Needs Your Attention" subtitle="Things only a dean can fix">
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
                Every student is placed, every section has an instructor, and the risk check is
                current.
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
                  <span className="shrink-0 text-sm text-brand-600 font-medium">
                    {item.action} →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Mirrors the dashboard: masthead, three KPI tiles, Recent Activity beside Needs Your Attention. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Loading dashboard…</span>
      <div className="mb-5 border-b border-hairline pb-5 animate-pulse">
        <div className="mb-2.5 h-2.5 w-28 rounded bg-gray-100" />
        <div className="h-8 w-80 max-w-full rounded bg-gray-100 sm:h-10" />
        <div className="mt-2.5 h-4 w-[28rem] max-w-full rounded bg-gray-100" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel>
          <SkeletonPanelHeader />
          <div className="p-4 space-y-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonActivityItem key={i} />
            ))}
          </div>
        </Panel>
        <Panel className="lg:col-span-2">
          <SkeletonPanelHeader />
          <div className="divide-y divide-hairline animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <div className="h-9 w-9 shrink-0 rounded-full bg-gray-100" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-4 w-64 max-w-full rounded bg-gray-100" />
                  <div className="h-3.5 w-80 max-w-full rounded bg-gray-100" />
                </div>
                <div className="h-4 w-20 shrink-0 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SkeletonPanelHeader() {
  return (
    <div className="p-4 border-b border-gray-100 space-y-2 animate-pulse">
      <div className="h-5 w-36 rounded bg-gray-100" />
      <div className="h-3.5 w-48 rounded bg-gray-100" />
    </div>
  );
}
