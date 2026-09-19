"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboardCheck,
  faClock,
  faHouse,
  faTriangleExclamation,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultyAlerts,
  fetchFacultyDashboard,
  refreshCurrentUser,
  type FacultyOverview,
  type FacultyStats,
} from "../lib/api";
import { usePageData } from "../lib/use-page-data";
import { SkeletonActivityItem, SkeletonStatTile, SkeletonStudentRow } from "../components/skeletons";
import PageHeader from "../components/PageHeader";
import StatTile from "../components/StatTile";
import { CardLabel } from "../components/Card";
import AttentionList from "./_overview/AttentionList";
import DutyCard from "./_overview/DutyCard";
import WaitingCard from "./_overview/WaitingCard";
import SectionMonitor from "./_overview/SectionMonitor";
import AlertFeed from "./_overview/AlertFeed";
import ActivityFeed from "./_overview/ActivityFeed";
import { clockTime, greeting, listSentence, plural, relativeDay, timeAgo } from "./_overview/format";

/**
 * The page continues the masthead's entrance cascade (four steps of 45ms)
 * rather than starting its own, so the whole page arrives as one gesture.
 */
const STEP_MS = 45;
const rise = (index: number): CSSProperties => ({ animationDelay: `${(4 + index) * STEP_MS}ms` });

const EMPTY_OVERVIEW: FacultyOverview = {
  sections: [],
  attention: [],
  attention_total: 0,
  review_queue: { total: 0, items: [] },
  upcoming_shifts: [],
  due_soon: [],
  overdue_assignments: 0,
  students_behind: 0,
  cohort_avg_recent: null,
  cohort_avg_prior: null,
  scored_at: null,
};

/** The masthead's standfirst: the day in one or two sentences, not a slogan. */
function briefing(stats: FacultyStats | null, overview: FacultyOverview, now: number): string {
  const parts: string[] = [];
  const flagged = overview.attention_total;
  if (flagged > 0) parts.push(`${plural(flagged, "student")} ${flagged === 1 ? "needs" : "need"} a look`);
  const review = stats?.awaiting_review ?? 0;
  if (review > 0) parts.push(`${plural(review, "submission")} ${review === 1 ? "is" : "are"} waiting for review`);
  const overdue = stats?.overdue_assignments ?? 0;
  if (overdue > 0) parts.push(`${plural(overdue, "assignment")} ${overdue === 1 ? "is" : "are"} overdue`);

  let text = parts.length > 0 ? `${listSentence(parts)}.` : "Everyone is on track and nothing is waiting on you.";
  text = text.charAt(0).toUpperCase() + text.slice(1);

  const next = overview.upcoming_shifts[0];
  if (next) {
    const live = Date.parse(next.starts_at) <= now;
    const day = relativeDay(next.starts_at);
    // Mid-sentence, "Today" and "Tomorrow" lose their capital; weekdays keep theirs.
    const when = day === "Today" || day === "Tomorrow" ? day.toLowerCase() : day;
    const withSection = next.section ? ` with ${next.section}` : "";
    text += live
      ? ` You're on duty now${withSection}.`
      : ` Next on duty: ${when} at ${clockTime(next.starts_at)}${withSection}.`;
  }
  return text;
}

export default function FacultyDashboard() {
  const { data, loading } = usePageData("faculty:overview", async () => {
    const [dashboard, alertsData, user] = await Promise.all([
      fetchFacultyDashboard(),
      fetchFacultyAlerts(),
      refreshCurrentUser(),
    ]);
    return {
      stats: dashboard?.stats ?? null,
      activities: dashboard?.recent_activities ?? [],
      overview: dashboard?.overview ?? EMPTY_OVERVIEW,
      alerts: alertsData?.alerts ?? [],
      firstName: user?.name ? user.name.split(" ")[0] : null,
      // Everything on the page is as of this moment, so "live" and "overdue"
      // can't disagree with each other across a re-render.
      loadedAt: Date.now(),
    };
  });

  if (loading || !data) return <OverviewSkeleton />;

  const { stats, activities, overview, alerts, firstName, loadedAt } = data;
  const total = stats?.total_students ?? 0;
  const atRisk = stats?.at_risk_students ?? 0;
  const review = stats?.awaiting_review ?? 0;
  const overdue = stats?.overdue_assignments ?? 0;

  // One scale for every monitor, so equal heights mean equal scores.
  const observed = overview.sections.flatMap((s) => [
    ...s.weekly.map((w) => w.average),
    s.avg_recent,
  ]).filter((v): v is number => v != null);
  const domain = {
    min: observed.length > 0 ? Math.max(0, Math.floor((Math.min(...observed) - 5) / 10) * 10) : 0,
    max: 100,
  };

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faHouse} className="h-3.5 w-3.5" />, label: "Dashboard" }}
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        subtitle={briefing(stats, overview, loadedAt)}
      />

      <div className="space-y-4">
        <div className="animate-rise grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" style={rise(0)}>
          <StatTile
            href="/faculty/students"
            icon={faUsers}
            value={total}
            label="Students"
            caption={overview.sections.length > 0 ? `Across ${plural(overview.sections.length, "section")}` : "No sections yet"}
          />
          <StatTile
            href="/faculty/students"
            icon={faTriangleExclamation}
            iconBg="bg-red-50"
            iconColor="text-red-600"
            value={atRisk}
            label="At risk"
            caption={
              overview.scored_at
                ? `${total > 0 ? Math.round((atRisk / total) * 100) : 0}% · scored ${timeAgo(overview.scored_at).toLowerCase()}`
                : "Not scored yet"
            }
          />
          <StatTile
            href="/faculty/scenarios/review"
            icon={faClipboardCheck}
            iconBg="bg-brand-600/10"
            iconColor="text-brand-600"
            value={review}
            label="To review"
            caption={review > 0 ? "Scenario submissions" : "Queue is clear"}
          />
          <StatTile
            href="/faculty/students"
            icon={faClock}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            value={overdue}
            label="Overdue"
            caption={overdue > 0 ? `${plural(stats?.students_behind ?? 0, "student")} behind` : "Nothing overdue"}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="animate-rise lg:col-span-2" style={rise(1)}>
            <AttentionList students={overview.attention} total={overview.attention_total} roster={total} />
          </div>
          <div className="animate-rise flex flex-col gap-4" style={rise(2)}>
            <DutyCard shifts={overview.upcoming_shifts} now={loadedAt} />
            <WaitingCard review={overview.review_queue} dueSoon={overview.due_soon} />
          </div>
        </div>

        {overview.sections.length > 0 && (
          <section className="pt-2">
            <div className="animate-rise mb-3 flex items-end justify-between gap-4" style={rise(3)}>
              <div>
                <CardLabel>Section monitors</CardLabel>
                <h2 className="mt-1 font-display text-[19px] font-semibold tracking-[-0.015em] text-slate-900">
                  How each section is doing
                </h2>
              </div>
              <Link href="/faculty/analytics" className="shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700">
                Open analytics →
              </Link>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
              {overview.sections.map((section, i) => (
                <SectionMonitor key={section.id} section={section} domain={domain} style={rise(4 + i)} />
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-4 pt-2 lg:grid-cols-5">
          <div className="animate-rise lg:col-span-3" style={rise(5 + overview.sections.length)}>
            <AlertFeed alerts={alerts} />
          </div>
          <div className="animate-rise lg:col-span-2" style={rise(6 + overview.sections.length)}>
            <ActivityFeed activities={activities} />
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  const panel = "rounded-xl border border-hairline bg-surface shadow-tile";
  return (
    <div className="space-y-4">
      <div className="mb-5 animate-pulse space-y-3 border-b border-hairline pb-5">
        <div className="h-3 w-24 rounded-full bg-gray-200" />
        <div className="h-9 w-72 rounded bg-gray-200" />
        <div className="h-4 w-[28rem] max-w-full rounded bg-gray-200" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatTile key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${panel} animate-pulse overflow-hidden lg:col-span-2`}>
          <div className="border-b border-hairline p-4">
            <div className="h-5 w-44 rounded bg-gray-200" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonStudentRow key={i} />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={`${panel} animate-pulse space-y-2 p-4`}>
              <div className="h-4 w-28 rounded bg-gray-200" />
              {Array.from({ length: 2 }).map((__, j) => (
                <SkeletonActivityItem key={j} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${panel} h-52 animate-pulse`} />
        ))}
      </div>
    </div>
  );
}
