"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faTrophy } from "@fortawesome/free-solid-svg-icons";
import { fetchFacultySections, fetchStudentLeaderboard, Section } from "../../../lib/api";
import PageHeader from "../../../components/PageHeader";
import Card from "../../../components/Card";
import { usePageData } from "../../../lib/use-page-data";
import { Leaderboard, LeaderboardSkeleton } from "../Leaderboard";
import { formatRange } from "../dates";

const NO_SECTIONS: Section[] = [];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every student in scope, ranked — the full list behind the analytics page's
 * top-5 card. The scope arrives in the URL (sections, from, to) from that
 * card's link, so this ranks exactly the students the card was drawn from;
 * opened bare, it ranks all of the caller's sections over all time.
 */
export default function LeaderboardClient() {
  const params = useSearchParams();
  const sectionParam = params.get("sections") ?? "";
  const sectionIds = useMemo(() => sectionParam.split(",").filter(Boolean), [sectionParam]);
  // The server ignores a malformed date; only a well-formed pair is shown as the range.
  const from = DAY.test(params.get("from") ?? "") ? params.get("from")! : undefined;
  const to = DAY.test(params.get("to") ?? "") ? params.get("to")! : undefined;

  const { data: sectionsData } = usePageData("faculty:sections", fetchFacultySections);
  const sections = sectionsData ?? NO_SECTIONS;

  const loader = useCallback(
    () => fetchStudentLeaderboard({ sectionIds, from, to }),
    [sectionIds, from, to],
  );
  const { data: students, loading, refresh } = usePageData(
    `faculty:leaderboard:${[...sectionIds].sort().join(",")}:${from ?? ""}:${to ?? ""}`,
    loader,
  );

  const sectionLabel =
    sectionIds.length === 0
      ? "All your sections"
      : sectionIds
          .map((id) => sections.find((s) => s.id === id)?.name)
          .filter(Boolean)
          .join(", ") || `${sectionIds.length} section${sectionIds.length === 1 ? "" : "s"}`;
  const rangeLabel = from && to ? formatRange(from, to) : "All time";

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faTrophy} className="w-3.5 h-3.5" />,
          label: "Analytics",
        }}
        title="Student Leaderboard"
        subtitle="Every student in scope, ranked by average submitted score"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/faculty/analytics"
          className="inline-flex items-center gap-2 px-3 py-2 bg-surface border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" />
          Back to analytics
        </Link>
        <p className="text-sm text-gray-500">
          {sectionLabel} · <span className="tabular-nums">{rangeLabel}</span>
        </p>
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-amber-500/10 p-2.5">
              <FontAwesomeIcon icon={faTrophy} className="h-5 w-5 text-amber-600" />
            </div>
            <h2 className="font-semibold text-gray-900">Top Performing Students</h2>
          </div>
          {students && students.length > 0 && (
            <span className="text-sm text-gray-400 tabular-nums">
              {students.length} ranked
            </span>
          )}
        </div>

        {loading ? (
          <LeaderboardSkeleton />
        ) : students ? (
          <Leaderboard students={students} />
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">The leaderboard couldn&apos;t be loaded.</p>
            <button
              onClick={() => void refresh()}
              className="mt-3 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              Try again
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
