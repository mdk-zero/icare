"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPeopleGroup,
  faArrowLeft,
  faChevronRight,
  faSearch,
  faXmark,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultyStudents,
  fetchFacultyTeams,
  type FacultyTeam,
  type TeamsOverview,
} from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import AssignCasesModal from "./AssignCasesModal";
import Avatar from "../../components/Avatar";
import { EcgLoader } from "../../components/EcgLoader";
import { usePageData } from "../../lib/use-page-data";

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const matches = (text: string, query: string) => text.toLowerCase().includes(query);

/** Latest ML risk label per student: "at_risk", "safe", or null when never scored. */
type RiskMap = Map<string, string | null>;

const RISK_BADGE = {
  at_risk: { label: "Low performing", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  none: { label: "Not scored yet", className: "bg-gray-50 text-gray-500 ring-gray-200" },
  safe: { label: "On track", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
} as const;
type RiskKind = keyof typeof RISK_BADGE;

/** Low performers sort first, so the students who need a look top every list. */
const RISK_ORDER: Record<RiskKind, number> = { at_risk: 0, none: 1, safe: 2 };

function riskOf(risks: RiskMap, id: string): RiskKind {
  const risk = risks.get(id);
  if (risk === "at_risk") return "at_risk";
  if (risk === "safe") return "safe";
  return "none";
}

function RiskBadge({ kind }: { kind: RiskKind }) {
  const badge = RISK_BADGE[kind];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

interface SectionView {
  id: string;
  name: string;
  /** Only the groups this faculty member supervises; nobody else's. */
  groups: FacultyTeam[];
  students: number;
}

function buildSections(data: TeamsOverview): SectionView[] {
  return data.sections
    .map((section) => {
      const groups = data.teams
        .filter((t) => t.section_id === section.id && t.faculty_id === data.viewer_id)
        .sort(byName);
      return {
        id: section.id,
        name: section.name,
        groups,
        students: groups.reduce((n, g) => n + g.members.length, 0),
      };
    })
    .filter((section) => section.groups.length > 0)
    .sort(byName);
}

/** Overlapping faces of the first few students, then a "+N" chip for the rest. */
function AvatarStack({ members, max = 5 }: { members: FacultyTeam["members"]; max?: number }) {
  return (
    <div className="flex shrink-0 -space-x-2">
      {members.slice(0, max).map((m) => (
        <Avatar
          key={m.id}
          name={m.name}
          src={m.picture_url}
          userId={m.id}
          sex={m.sex}
          size="sm"
          className="ring-2 ring-surface"
        />
      ))}
      {members.length > max && (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500 ring-2 ring-surface">
          +{members.length - max}
        </span>
      )}
    </div>
  );
}

/**
 * The groups an admin has put this faculty member in charge of: pick a
 * section, then see only their own groups in it, with who is low performing.
 * Admins build and change the groups; this page only shows them.
 */
export default function TeamsClient() {
  const { data, loading } = usePageData("faculty:teams", fetchFacultyTeams);
  // Risk labels come from the roster, which carries each student's latest prediction.
  const { data: roster } = usePageData("faculty:students", () => fetchFacultyStudents());
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const risks: RiskMap = new Map((roster ?? []).map((s) => [s.id, s.risk_level ?? null]));
  const sections = data ? buildSections(data) : [];
  const open = sections.find((s) => s.id === openId) ?? null;
  const totalGroups = sections.reduce((n, s) => n + s.groups.length, 0);

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faPeopleGroup} className="h-3.5 w-3.5" />,
          label: "Teaching",
        }}
        title="My Groups"
        subtitle={
          totalGroups > 0
            ? `You supervise ${plural(totalGroups, "group")} across ${plural(sections.length, "section")}. Your admin sets up the groups.`
            : "The student groups you supervise, by section. Your admin sets up the groups."
        }
      />

      {loading && !data ? (
        <div className="flex justify-center p-16">
          <EcgLoader size="lg" className="text-brand-600" />
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-surface p-12 text-center">
          <FontAwesomeIcon icon={faPeopleGroup} className="h-8 w-8 text-gray-300" />
          <p className="mt-3 font-semibold text-gray-700">No groups assigned to you yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
            When your admin puts you in charge of a group, its section shows up here.
          </p>
        </div>
      ) : (
        <>
          <div className="relative mb-5 max-w-md">
            <FontAwesomeIcon
              icon={faSearch}
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={open ? `Search students in ${open.name}` : "Search sections, groups or students"}
              aria-label="Search"
              className="w-full rounded-xl border border-gray-200 bg-surface py-2.5 pl-11 pr-10 text-gray-700 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-gray-700"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {open ? (
            <SectionDetail section={open} risks={risks} query={q} onBack={() => setOpenId(null)} />
          ) : (
            <SectionGrid sections={sections} risks={risks} query={q} onOpen={setOpenId} />
          )}
        </>
      )}
    </div>
  );
}

function SectionGrid({
  sections,
  risks,
  query,
  onOpen,
}: {
  sections: SectionView[];
  risks: RiskMap;
  query: string;
  onOpen: (id: string) => void;
}) {
  // A section shows when its name, one of its groups, or one of its students matches.
  const shown = sections
    .map((section) => {
      const students = section.groups.flatMap((g) => g.members);
      const hits =
        query && !matches(section.name, query) ? students.filter((m) => matches(m.name, query)) : [];
      const visible =
        !query ||
        matches(section.name, query) ||
        section.groups.some((g) => matches(g.name, query)) ||
        hits.length > 0;
      return { section, students, hits, visible };
    })
    .filter((x) => x.visible);

  if (shown.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500">Nothing matches that search.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {shown.map(({ section, students, hits }) => {
        const low = students.filter((m) => riskOf(risks, m.id) === "at_risk").length;
        return (
          <button
            key={section.id}
            onClick={() => onOpen(section.id)}
            className="group flex flex-col rounded-xl border border-hairline bg-surface p-5 text-left shadow-tile transition-colors hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-gray-900">
                {section.name}
              </h2>
              <FontAwesomeIcon
                icon={faChevronRight}
                className="mt-2 h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
              />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {section.groups.map((g) => g.name).join(" and ")}, {plural(section.students, "student")}
            </p>
            {hits.length > 0 && (
              <p className="mt-1 truncate text-sm text-brand-700">
                Matches {hits.map((m) => m.name).join(", ")}
              </p>
            )}
            <div className="mt-auto flex items-center justify-between gap-3 pt-5">
              <AvatarStack members={students} max={6} />
              {low > 0 ? (
                <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                  {low} low performing
                </span>
              ) : (
                <span className="text-xs text-gray-400">No one low performing</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SectionDetail({
  section,
  risks,
  query,
  onBack,
}: {
  section: SectionView;
  risks: RiskMap;
  query: string;
  onBack: () => void;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
        All sections
      </button>

      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-gray-900">{section.name}</h2>
        <p className="text-sm text-gray-500">
          {plural(section.groups.length, "group")}, {plural(section.students, "student")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {section.groups.map((group) => (
          <GroupCard key={group.id} group={group} risks={risks} query={query} />
        ))}
      </div>
    </div>
  );
}

function GroupCard({ group, risks, query }: { group: FacultyTeam; risks: RiskMap; query: string }) {
  const [assigning, setAssigning] = useState(false);
  const members = group.members
    .filter((m) => !query || matches(m.name, query))
    .sort((a, b) => RISK_ORDER[riskOf(risks, a.id)] - RISK_ORDER[riskOf(risks, b.id)] || byName(a, b));
  const low = group.members.filter((m) => riskOf(risks, m.id) === "at_risk").length;

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
      <header className="flex items-center justify-between gap-4 border-b border-hairline bg-brand-50/60 px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold text-gray-900">{group.name}</h3>
          <p className="text-sm text-gray-500">
            {plural(group.members.length, "student")}
            {low > 0 && <span className="text-rose-600">, {low} low performing</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* A glance at who is in it before reading the list. */}
          <AvatarStack members={group.members} />
          {group.members.length > 0 && (
            <button
              onClick={() => setAssigning(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <FontAwesomeIcon icon={faUserPlus} className="h-3 w-3" />
              Assign cases
            </button>
          )}
        </div>
      </header>
      {assigning && <AssignCasesModal group={group} onClose={() => setAssigning(false)} />}
      {members.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-gray-400">
          {group.members.length === 0 ? "No students in this group yet." : "No students match that search."}
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {members.map((member) => (
            <li key={member.id}>
              <Link
                href={`/faculty/students/${member.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle focus:outline-none focus-visible:bg-subtle"
              >
                <Avatar
                  name={member.name}
                  src={member.picture_url}
                  userId={member.id}
                  sex={member.sex}
                  size="md"
                  tone={riskOf(risks, member.id) === "at_risk" ? "risk" : "brand"}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{member.name}</span>
                <RiskBadge kind={riskOf(risks, member.id)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
