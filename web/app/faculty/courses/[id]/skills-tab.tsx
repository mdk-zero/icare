"use client";

import { useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faPenToSquare, faRobot, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { usePageData } from "../../../lib/use-page-data";
import { fetchSkillDetails, type SkillSummary } from "../../../lib/api";
import { EcgLoader } from "../../../components/EcgLoader";
import { TOPICS, TopicIcon } from "../topics";

const SKILLS = TOPICS.skill;

interface ChapterGroup {
  chapter: number;
  area: string;
  skills: SkillSummary[];
}

/**
 * The instructor's own skill list for this course: the skills the AI picked
 * from the course's details, plus the ones they added with Edit Skills. Each chapter is a
 * card whose header stays in view while its skills scroll; a skill opens to
 * show its goal and how many steps its checklist has.
 */
export default function SkillsTab({
  courseCode,
  skillIds,
  aiSkillIds,
  catalog,
  picking,
  onEditSkills,
}: {
  courseCode: string;
  skillIds: string[];
  /** The skills the AI picked. */
  aiSkillIds: string[];
  catalog: SkillSummary[];
  /** The AI is picking the course's skills right now. */
  picking: boolean;
  onEditSkills: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const chapterRefs = useRef<Record<number, HTMLElement | null>>({});

  const groups = useMemo(() => {
    const byId = new Map(catalog.map((s) => [s.id, s]));
    const map = new Map<number, ChapterGroup>();
    for (const id of skillIds) {
      const s = byId.get(id);
      if (!s) continue;
      const g = map.get(s.chapter) ?? { chapter: s.chapter, area: s.area, skills: [] };
      g.skills.push(s);
      map.set(s.chapter, g);
    }
    const order = (id: string) => id.split("-").map(Number);
    for (const g of map.values()) g.skills.sort((a, b) => order(a.id)[1] - order(b.id)[1]);
    return [...map.values()].sort((a, b) => a.chapter - b.chapter);
  }, [catalog, skillIds]);

  const byAi = useMemo(() => new Set(aiSkillIds), [aiSkillIds]);

  const shown = groups.flatMap((g) => g.skills.map((s) => s.id));
  const { data: details } = usePageData(shown.length ? `skills:details:${shown.join(",")}` : null, () => fetchSkillDetails(shown), {
    freshFor: 10 * 60_000,
  });
  const detailById = useMemo(() => new Map((details ?? []).map((d) => [d.id, d])), [details]);

  const total = shown.length;
  const picked = shown.filter((id) => byAi.has(id)).length;
  const added = total - picked;

  if (total === 0 && picking) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-surface px-6 py-12 text-center">
        <span className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${SKILLS.tile}`}>
          <FontAwesomeIcon icon={faRobot} className="h-5 w-5" />
        </span>
        <p className="flex items-center justify-center gap-2 font-semibold text-gray-700">
          <EcgLoader />
          Picking the skills {courseCode} covers…
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          The AI is reading the course&rsquo;s title and description. You can add more with Edit Skills afterwards.
        </p>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-surface px-6 py-12 text-center">
        <span className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${SKILLS.tile}`}>
          <FontAwesomeIcon icon={faWandMagicSparkles} className="h-5 w-5" />
        </span>
        <p className="font-semibold text-gray-700">No skills picked yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          The AI couldn&rsquo;t pick {courseCode}&rsquo;s skills from its details. Pick them by hand, or try Detect with AI again.
        </p>
        <button
          type="button"
          onClick={onEditSkills}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <FontAwesomeIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
          Pick skills
        </button>
      </div>
    );
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-hairline bg-surface">
        <span className={`absolute inset-y-0 left-0 w-1 ${SKILLS.bar}`} aria-hidden />
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 py-4 pl-6 pr-5">
          <div className="flex items-center gap-3">
            <TopicIcon topic={SKILLS} />
            <div>
              <p className="font-display text-2xl font-semibold leading-none tabular-nums text-gray-900">
                {total} <span className="text-sm font-medium text-gray-500">skill{total === 1 ? "" : "s"}</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                across {groups.length} chapter{groups.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="min-w-[14rem] flex-1">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 text-gray-600">
                <FontAwesomeIcon icon={faRobot} className={`h-3 w-3 ${SKILLS.text}`} />
                <span className="font-semibold tabular-nums text-gray-900">{picked}</span> picked by the AI
              </span>
              <span className="inline-flex items-center gap-1.5 text-gray-600">
                <FontAwesomeIcon icon={faPenToSquare} className="h-3 w-3 text-gray-400" />
                <span className="font-semibold tabular-nums text-gray-900">{added}</span> added by you
              </span>
            </div>
            <div className="mt-2 flex gap-[3px]" role="img" aria-label={`${picked} of ${total} skills were picked by the AI`}>
              {groups.flatMap((g) =>
                g.skills.map((s) => (
                  <span key={s.id} className={`h-2 min-w-[3px] flex-1 rounded-full ${byAi.has(s.id) ? SKILLS.bar : "bg-gray-300"}`} />
                )),
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {`Your own list: the AI picked these from the course's details; add the ones your setup needs with Edit Skills. Other ${courseCode} instructors pick their own.`}
            </p>
          </div>
        </div>
        {groups.length > 1 && (
          <nav aria-label="Chapters" className="flex flex-wrap gap-1.5 border-t border-hairline bg-subtle/50 py-2.5 pl-6 pr-5">
            {groups.map((g) => (
              <button
                key={g.chapter}
                type="button"
                onClick={() => chapterRefs.current[g.chapter]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-hairline transition-colors hover:bg-indigo-50 hover:text-indigo-700 hover:ring-indigo-600/20"
              >
                <span className="font-mono text-[11px] text-gray-400">{String(g.chapter).padStart(2, "0")}</span>
                {g.area}
                <span className="tabular-nums text-gray-400">{g.skills.length}</span>
              </button>
            ))}
          </nav>
        )}
      </section>

      {groups.map((g) => {
        const fromAi = g.skills.filter((s) => byAi.has(s.id)).length;
        return (
          <section
            key={g.chapter}
            ref={(el) => {
              chapterRefs.current[g.chapter] = el;
            }}
            aria-labelledby={`chapter-${g.chapter}`}
            className="scroll-mt-14 overflow-clip rounded-xl border border-hairline bg-surface"
          >
            {/* Stays under the course tab bar while the chapter's skills scroll past. */}
            <header className="sticky top-9 z-10 flex items-center gap-4 border-b border-hairline bg-surface px-5 py-3 lg:top-7">
              <span className={`font-display text-[28px] font-semibold leading-none tabular-nums ${SKILLS.text}`} aria-hidden>
                {String(g.chapter).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Chapter {g.chapter}</p>
                <h3 id={`chapter-${g.chapter}`} className="truncate font-display text-[15px] font-semibold text-gray-900">
                  {g.area}
                </h3>
              </div>
              <span className="shrink-0 text-xs text-gray-500">
                {`${g.skills.length} skill${g.skills.length === 1 ? "" : "s"}`}
                {fromAi > 0 && (fromAi === g.skills.length ? " · all by the AI" : ` · ${fromAi} by the AI`)}
              </span>
            </header>
            <ul className="divide-y divide-hairline">
              {g.skills.map((s) => {
                const expanded = open.has(s.id);
                const detail = detailById.get(s.id);
                return (
                  <li key={s.id}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                      <button
                        type="button"
                        onClick={() => toggle(s.id)}
                        aria-expanded={expanded}
                        aria-controls={`skill-${s.id}`}
                        className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className={`w-12 shrink-0 rounded-md py-0.5 text-center font-mono text-xs font-semibold ${SKILLS.tile}`}>{s.id}</span>
                        <span className="min-w-0 flex-1 text-sm font-medium text-gray-800 group-hover:text-gray-950">{s.title}</span>
                        <FontAwesomeIcon
                          icon={faChevronDown}
                          className={`h-3 w-3 shrink-0 text-gray-300 transition-transform group-hover:text-gray-500 ${expanded ? "rotate-180" : ""}`}
                        />
                      </button>
                      {byAi.has(s.id) ? (
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold ${SKILLS.text}`}
                          title="The AI picked this skill from the course's details"
                        >
                          <FontAwesomeIcon icon={faRobot} className="h-2.5 w-2.5" />
                          AI pick
                        </span>
                      ) : (
                        <span
                          className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500"
                          title="You added this skill with Edit Skills"
                        >
                          Added by you
                        </span>
                      )}
                    </div>
                    {expanded && (
                      <div id={`skill-${s.id}`} className="animate-fade-in pb-4 pl-[5.25rem] pr-5 text-sm">
                        {detail ? (
                          <>
                            {detail.goal && <p className="text-gray-600">{detail.goal}</p>}
                            <p className="mt-1 text-xs text-gray-400">
                              {detail.steps.length} step{detail.steps.length === 1 ? "" : "s"} in its checklist
                            </p>
                          </>
                        ) : details === undefined ? (
                          <div className="space-y-1.5" aria-hidden>
                            <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
                            <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
                          </div>
                        ) : (
                          <p className="text-gray-400">This skill&rsquo;s details couldn&rsquo;t be loaded.</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
