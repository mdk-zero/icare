"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faCrown,
  faDownload,
  faFilePdf,
  faFilePowerpoint,
  faLock,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import Avatar from "../../components/Avatar";
import { SkeletonCaseGrading } from "../../components/skeletons";
import { toast } from "../../components/Toast";
import { usePageData } from "../../lib/use-page-data";
import { fetchCaseGroup, gradeCaseGroup, type CaseLevel } from "../../lib/api";
import { CASE_LEVELS, allCriteriaRated, caseScore } from "../../lib/case-rubric";
import { MAX_REMARKS_LENGTH, scoreDescriptor } from "../../lib/task-ratings";
import { CaseStatusBadge, formatDue, formatFileSize } from "./case-ui";

const formatWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

/** A level's colour when picked, Excellent to Beginning. */
const LEVEL_STYLE: Record<CaseLevel, string> = {
  4: "border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500",
  3: "border-sky-500 bg-sky-50 text-sky-800 ring-1 ring-sky-500",
  2: "border-amber-500 bg-amber-50 text-amber-800 ring-1 ring-amber-500",
  1: "border-rose-500 bg-rose-50 text-rose-800 ring-1 ring-rose-500",
};

/**
 * One group's case presentation: its slides beside the rubric. The group is
 * graded as a whole; finalizing gives every member the group's score.
 * `onChanged` runs after a save, so the list beside it can update.
 */
export default function GroupGrader({ groupId, onChanged }: { groupId: string; onChanged?: () => void }) {
  const { data, loading, refresh } = usePageData(`faculty:case-group:${groupId}`, async () => {
    const res = await fetchCaseGroup(groupId);
    return { grading: res.data ?? null, error: res.error ?? null };
  });
  const grading = data?.grading ?? null;

  const [levels, setLevels] = useState<Map<string, CaseLevel>>(new Map());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "finalize" | null>(null);

  // Seed the form from what is saved whenever a fresh copy arrives.
  useEffect(() => {
    if (!grading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLevels(new Map(grading.ratings.map((r) => [r.criterion, r.level])));
    setNotes(Object.fromEntries(grading.ratings.map((r) => [r.criterion, r.remarks])));
    setRemarks(grading.group.remarks ?? "");
    setDirty(false);
  }, [grading]);

  const score = useMemo(() => caseScore(levels), [levels]);
  const complete = allCriteriaRated(levels);
  const graded = grading?.group.status === "graded";

  const rate = (key: string, level: CaseLevel) => {
    setLevels((prev) => {
      const next = new Map(prev);
      if (next.get(key) === level) next.delete(key);
      else next.set(key, level);
      return next;
    });
    setDirty(true);
  };

  const save = async (finalize: boolean) => {
    if (!grading) return;
    setBusy(finalize ? "finalize" : "save");
    const res = await gradeCaseGroup(groupId, {
      ratings: Object.fromEntries(grading.criteria.map((c) => [c.key, levels.get(c.key) ?? null])),
      rating_remarks: Object.fromEntries(
        grading.criteria.filter((c) => levels.has(c.key)).map((c) => [c.key, notes[c.key] ?? ""]),
      ),
      remarks,
      finalize,
    });
    setBusy(null);
    if (res.error !== undefined) return toast(res.error);
    toast(finalize ? `Graded · ${res.data.score}% for every member` : "Saved");
    refresh();
    onChanged?.();
  };

  if (!loading && !grading) {
    return (
      <div className="bg-surface p-12 rounded-xl border border-hairline shadow-tile text-center text-gray-500">
        {data?.error ?? "Group not found."}
      </div>
    );
  }

  if (loading || !grading) return <SkeletonCaseGrading />;

  const { group: g, presentation, file_url: file } = grading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-4 shadow-tile">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {g.name}
            {g.section_name && <span className="font-normal text-gray-500"> · {g.section_name}</span>}
          </h2>
          <p className="text-sm text-gray-500">
            Handed in {formatWhen(g.submitted_at)} by {g.file?.uploaded_by_name ?? g.leader_name ?? "the leader"} · due{" "}
            {formatDue(presentation.deadline)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CaseStatusBadge status={g.status} late={g.late} />
          {graded && (
            <a
              href={`/api/faculty/reports/case?id=${g.id}&format=pdf`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm"
            >
              <FontAwesomeIcon icon={faFilePdf} className="w-3.5 h-3.5" /> Download PDF
            </a>
          )}
        </div>
      </div>

      {/* Side by side, the rubric is as tall as the slides and members, and scrolls inside. */}
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] gap-4 items-start 2xl:items-stretch">
        <div className="space-y-4 min-w-0">
          <FilePreview group={g} file={file} />
          <MembersCard members={g.members} />
        </div>

        <div className="relative min-w-0">
          <section className="flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile 2xl:absolute 2xl:inset-0">
            <div className="flex items-baseline justify-between gap-3 border-b border-hairline p-4">
              <div>
                <h2 className="font-semibold text-gray-900">Rubric</h2>
                <p className="text-xs text-gray-500">Graded as a group: every member gets this score.</p>
              </div>
              <span className="text-sm tabular-nums text-gray-700 text-right">
                {graded ? "Final" : "Projected"}: <strong>{score}%</strong> · {scoreDescriptor(score)}
                {/* Unrated criteria count as zero, so say how far along the projection is. */}
                {!graded && !complete && (
                  <span className="block text-xs text-gray-500">
                    {levels.size} of {grading.criteria.length} rated
                  </span>
                )}
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {grading.criteria.map((c, i) => {
                const current = levels.get(c.key);
                const earned = current ? Math.round(((c.weight * current) / 4) * 100) / 100 : null;
                return (
                  <div key={c.key} className="space-y-2 border-t border-hairline pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-medium text-gray-900">
                        {["I", "II", "III", "IV", "V", "VI"][i] ?? i + 1}. {c.label}
                      </div>
                      <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-xs tabular-nums text-gray-600">
                        {earned === null ? `${c.weight}%` : `${earned} / ${c.weight}`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={c.label}>
                      {CASE_LEVELS.map((level) => {
                        const on = current === level.value;
                        return (
                          <button
                            key={level.value}
                            role="radio"
                            aria-checked={on}
                            disabled={graded}
                            onClick={() => rate(c.key, level.value)}
                            title={c.levels[level.value]}
                            className={`rounded-lg border px-2.5 py-2 text-left transition-colors disabled:cursor-default ${
                              on
                                ? LEVEL_STYLE[level.value]
                                : `border-gray-200 text-gray-700 ${graded ? "" : "hover:border-brand-300 hover:bg-subtle"}`
                            }`}
                          >
                            <span className="block text-xs font-semibold">
                              {level.label} ({level.value})
                            </span>
                            <span className={`mt-0.5 block text-[11px] leading-snug ${on ? "" : "text-gray-500"}`}>
                              {c.levels[level.value]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {(current || notes[c.key]) && (
                      <input
                        value={notes[c.key] ?? ""}
                        disabled={graded}
                        maxLength={MAX_REMARKS_LENGTH}
                        onChange={(e) => {
                          setNotes((prev) => ({
                            ...prev,
                            [c.key]: e.target.value,
                          }));
                          setDirty(true);
                        }}
                        placeholder="Remarks (optional)"
                        className="w-full px-3 py-2 bg-surface border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:bg-subtle"
                      />
                    )}
                  </div>
                );
              })}

              <div className="border-t border-hairline pt-3">
                <label htmlFor="overall-remarks" className="text-sm font-medium text-gray-900">
                  Overall remarks
                </label>
                <textarea
                  id="overall-remarks"
                  rows={3}
                  value={remarks}
                  disabled={graded}
                  maxLength={MAX_REMARKS_LENGTH}
                  onChange={(e) => {
                    setRemarks(e.target.value);
                    setDirty(true);
                  }}
                  className="mt-1 w-full px-3 py-2 bg-surface border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:bg-subtle"
                />
              </div>
            </div>

            {graded ? (
              <p className="flex items-center gap-2 border-t border-hairline p-4 text-sm text-gray-600">
                <FontAwesomeIcon icon={faLock} className="w-3.5 h-3.5" /> Graded {formatWhen(g.graded_at)}. The grade is
                final.
              </p>
            ) : (
              <div className="flex items-center justify-end gap-2 border-t border-hairline p-4">
                <button
                  onClick={() => save(false)}
                  disabled={busy !== null || !dirty}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === "save" ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => save(true)}
                  disabled={busy !== null || !complete}
                  title={complete ? "Lock in the grade and notify every member" : "Rate every criterion first"}
                  className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy === "finalize" ? "Finalizing…" : "Finalize grade"}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** The slides in the page: a PDF as the browser shows it, PowerPoint through Microsoft's viewer. */
function FilePreview({
  group: g,
  file,
}: {
  group: {
    file: { name: string; size: number | null; type: "pdf" | "pptx" } | null;
  };
  file: { url: string; embed: string; download: string } | null;
}) {
  if (!g.file) {
    return (
      <div className="rounded-xl border border-dashed border-hairline bg-surface/60 p-8 text-center text-sm text-gray-500">
        No slides uploaded yet.
      </div>
    );
  }
  const pptx = g.file.type === "pptx";
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${pptx ? "bg-orange-50 text-orange-600" : "bg-rose-50 text-rose-600"}`}
        >
          <FontAwesomeIcon icon={pptx ? faFilePowerpoint : faFilePdf} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-gray-900">{g.file.name}</span>
          <span className="block text-xs text-gray-500">
            {pptx ? "PowerPoint" : "PDF"}
            {g.file.size ? ` · ${formatFileSize(g.file.size)}` : ""}
          </span>
        </span>
        {file && (
          <span className="flex gap-1.5">
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" /> Open
            </a>
            <a
              href={file.download}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FontAwesomeIcon icon={faDownload} className="h-3 w-3" /> Download
            </a>
          </span>
        )}
      </div>
      {file ? (
        <iframe title={g.file.name} src={file.embed} className="block h-[70vh] min-h-[420px] w-full bg-subtle" />
      ) : (
        <p className="p-6 text-center text-sm text-gray-500">
          The slides can&apos;t be previewed right now. Try again in a moment.
        </p>
      )}
    </div>
  );
}

function MembersCard({
  members,
}: {
  members: {
    student_id: string;
    name: string;
    picture_url: string | null;
    is_leader: boolean;
  }[];
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-tile">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5 text-brand-600" />
        Members <span className="font-normal text-gray-500">· {members.length}</span>
      </h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {members.map((m) => (
          <li key={m.student_id} className="flex items-center gap-2.5 rounded-lg border border-hairline px-3 py-2">
            <Avatar name={m.name} src={m.picture_url} userId={m.student_id} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{m.name}</span>
            {m.is_leader && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                <FontAwesomeIcon icon={faCrown} className="h-2.5 w-2.5" /> Leader
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
