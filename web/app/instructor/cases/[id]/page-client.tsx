"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faFilePrescription,
  faMagnifyingGlass,
  faPen,
  faTimes,
  faTrash,
  faUserGraduate,
} from "@fortawesome/free-solid-svg-icons";
import Avatar from "../../../components/Avatar";
import ConfirmModal from "../../../components/ConfirmModal";
import { toast } from "../../../components/Toast";
import { usePageData } from "../../../lib/use-page-data";
import {
  deleteCasePresentation,
  fetchCasePresentation,
  fetchFacultySections,
  updateCasePresentation,
  type CasePresentation,
  type CaseRosterEntry,
  type CaseSubmissionStatus,
  type Section,
} from "../../../lib/api";
import { scoreDescriptor } from "../../../lib/task-ratings";
import { CaseStatusBadge, formatDue, inputClassName, labelClassName, toLocalInput } from "../case-ui";
import CaseGrader from "../case-grader";
import { deadlineFromInput } from "../../../lib/deadline-input";
import AudiencePicker, { audiencePayload, useCourseAudience } from "../../../components/AudiencePicker";

const FILTERS: { key: CaseSubmissionStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "To grade" },
  { key: "graded", label: "Graded" },
  { key: "draft", label: "Draft" },
  { key: "not_started", label: "Not started" },
];

export default function CasePresentationClient({ presentationId }: { presentationId: string }) {
  const router = useRouter();
  const { data, loading, refresh } = usePageData(`faculty:case:${presentationId}`, async () => {
    const [detail, sections] = await Promise.all([fetchCasePresentation(presentationId), fetchFacultySections()]);
    return { detail: detail.data ?? null, error: detail.error ?? null, sections };
  });
  const presentation = data?.detail?.presentation;
  const roster = useMemo(() => data?.detail?.roster ?? [], [data]);

  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<CaseSubmissionStatus | "all">("all");
  const [query, setQuery] = useState("");
  // ?submission= opens a student's case straight away; ?edit=1 opens the edit form (the card's Edit).
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("submission"));
  const [editing, setEditing] = useState(() => searchParams.get("edit") === "1");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = roster.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      (!q || r.student_name.toLowerCase().includes(q) || (r.section_name ?? "").toLowerCase().includes(q)),
  );
  const selected = roster.find((r) => r.submission_id === selectedId) ?? null;
  const select = (id: string) => {
    setSelectedId(id);
    // Kept in the address so a reload or a shared link reopens the same student.
    const url = new URL(window.location.href);
    url.searchParams.set("submission", id);
    url.searchParams.delete("edit");
    window.history.replaceState(null, "", url);
  };
  const handedIn = roster.some((r) => r.status === "submitted" || r.status === "graded");

  const doDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteCasePresentation(presentationId);
    setDeleting(false);
    if (res.error !== undefined) return setDeleteError(res.error);
    toast("Case presentation deleted");
    router.push("/instructor/cases");
  };

  if (!loading && !presentation) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="bg-surface p-12 rounded-xl border border-hairline shadow-tile text-center text-gray-500">
          {data?.error ?? "Case presentation not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackLink />

      {presentation && (
        <div className="bg-surface rounded-xl border border-hairline shadow-tile p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold text-gray-900">{presentation.title}</h1>
              <p className="text-sm text-gray-500">
                Due {formatDue(presentation.deadline)} ·{" "}
                {presentation.groups?.length
                  ? presentation.groups.map((g) => `${g.section_name} · ${g.name}`).join(", ")
                  : presentation.sections.map((s) => `Section ${s.name}`).join(", ")}
              </p>
            </div>
            {presentation.can_manage && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
                >
                  <FontAwesomeIcon icon={faPen} className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={handedIn}
                  title={handedIn ? "Students have handed in cases, so it can no longer be deleted" : "Delete"}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
          {presentation.instructions && (
            <p className="text-sm text-gray-700 whitespace-pre-line">{presentation.instructions}</p>
          )}
        </div>
      )}

      {/* Like Patient Case review: the students down the side, the chosen one's case and rubric beside them. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-0 lg:self-start">
          <div className="relative mb-3">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a student…"
              aria-label="Search students"
              className="w-full rounded-xl border border-gray-200 bg-surface py-2.5 pl-10 pr-3.5 text-sm text-gray-900 shadow-tile outline-none transition-colors placeholder:text-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
            />
          </div>

          <div role="group" aria-label="Filter by status" className="mb-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const count = f.key === "all" ? roster.length : roster.filter((r) => r.status === f.key).length;
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-gray-200 bg-surface text-gray-600 hover:border-brand-300 hover:text-gray-900"
                  }`}
                >
                  {f.label}
                  <span className={`tabular-nums ${active ? "text-white/80" : "text-gray-400"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            {loading &&
              [0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl border border-hairline bg-surface p-3 shadow-tile">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-2/3 rounded bg-gray-200" />
                    <div className="h-2.5 w-1/3 rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            {!loading && shown.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                {q || filter !== "all" ? "No students match." : "No students have this case presentation yet."}
              </p>
            )}
            {!loading &&
              shown.map((r, i) => (
                <RosterButton
                  key={r.submission_id}
                  row={r}
                  index={i}
                  active={r.submission_id === selectedId}
                  onSelect={() => select(r.submission_id)}
                />
              ))}
          </div>
        </aside>

        <section className="min-w-0">
          {selected && (selected.status === "submitted" || selected.status === "graded") ? (
            <CaseGrader key={selected.submission_id} submissionId={selected.submission_id} onChanged={refresh} />
          ) : (
            <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface/60 px-6 py-16 text-center">
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <FontAwesomeIcon icon={selected ? faFilePrescription : faUserGraduate} className="h-7 w-7" />
              </div>
              <p className="font-display text-lg font-semibold text-gray-900">
                {selected ? `${selected.student_name} hasn't handed it in` : "Pick a student"}
              </p>
              <p className="mt-1 max-w-xs text-sm text-gray-500">
                {selected
                  ? selected.status === "draft"
                    ? "Their write-up is still a draft. It opens here once they hand it in."
                    : "They haven't started their write-up yet."
                  : "Pick a student to open their case presentation and its rubric."}
              </p>
            </div>
          )}
        </section>
      </div>

      {editing && presentation && (
        <EditModal
          presentation={presentation}
          sections={data?.sections ?? []}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}

      {confirmDelete && presentation && (
        <ConfirmModal
          config={{
            title: "Delete case presentation",
            message: (
              <>
                <span className="font-medium text-gray-700">{presentation.title}</span> and every student&apos;s
                draft will be removed. This can&apos;t be undone.
              </>
            ),
            loading: deleting,
            error: deleteError,
            onConfirm: doDelete,
          }}
          onClose={() => {
            if (!deleting) setConfirmDelete(false);
          }}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/instructor/cases" className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700">
      <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" /> Case Presentations
    </Link>
  );
}

/** One student in the list: status or score at a glance, and a badge while it waits for grading. */
function RosterButton({
  row,
  index,
  active,
  onSelect,
}: {
  row: CaseRosterEntry;
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      aria-current={active ? "true" : undefined}
      className={`flex w-full animate-rise items-center gap-3 rounded-xl border p-3 text-left shadow-tile transition-all hover:border-brand-300 hover:shadow-tile-hover ${
        active
          ? "border-brand-600/50 bg-brand-600/10 shadow-[inset_3px_0_0_0_var(--color-brand-600)]"
          : "border-hairline bg-surface"
      }`}
    >
      <Avatar name={row.student_name} userId={row.student_id} size="md" tone="solid" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-gray-900">{row.student_name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          {row.status === "graded" && row.score !== null ? (
            <span className="tabular-nums">
              {row.score}% · {scoreDescriptor(row.score)}
            </span>
          ) : (
            <CaseStatusBadge status={row.status} late={row.late} />
          )}
          {row.section_name && <span className="truncate">· {row.section_name}</span>}
        </span>
      </span>
      {row.status === "submitted" && (
        <span
          title="Handed in, not yet graded"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          To grade
        </span>
      )}
    </button>
  );
}

function EditModal({
  presentation,
  sections,
  onClose,
  onSaved,
}: {
  presentation: CasePresentation;
  sections: Section[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(presentation.title);
  const [instructions, setInstructions] = useState(presentation.instructions);
  const [deadline, setDeadline] = useState(toLocalInput(presentation.deadline));
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // A course presentation gets more groups through the course's roster.
  const course = presentation.offering_id ?? null;
  const [audience, setAudience] = useState<string[]>([]);
  const { roster } = useCourseAudience(course);
  const picked = audiencePayload(roster, audience);
  const given = [
    ...(presentation.groups ?? []).map((g) => `team:${g.id}`),
    ...presentation.section_ids.map((sid) => `section:${sid}`),
  ];
  const otherSections = sections.filter((s) => !presentation.section_ids.includes(s.id));

  const save = async () => {
    if (!title.trim()) return toast("Give the presentation a title");
    if (!deadline) return toast("Set a deadline");
    setBusy(true);
    const res = await updateCasePresentation(presentation.id, {
      title: title.trim(),
      instructions,
      deadline: deadlineFromInput(deadline),
      ...(added.size > 0 ? { section_ids: [...presentation.section_ids, ...added] } : {}),
      ...(course && picked.count > 0
        ? {
            section_ids: [...presentation.section_ids, ...picked.section_ids],
            team_ids: picked.team_ids,
            student_ids: picked.student_ids,
          }
        : {}),
    });
    setBusy(false);
    if (res.error !== undefined) return toast(res.error);
    const n = res.data.students_added;
    toast(n > 0 ? `Saved · assigned to ${n} more student${n === 1 ? "" : "s"}` : "Saved");
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-overlay w-full max-w-lg p-4 space-y-3 max-h-[90vh] overflow-y-auto border border-hairline">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Edit case presentation</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className={labelClassName} htmlFor="edit-title">Title</label>
          <input id="edit-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label className={labelClassName} htmlFor="edit-instructions">Instructions</label>
          <textarea
            id="edit-instructions"
            rows={4}
            value={instructions}
            maxLength={4000}
            onChange={(e) => setInstructions(e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName} htmlFor="edit-deadline">Due</label>
          <input
            id="edit-deadline"
            type="datetime-local"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={inputClassName}
          />
        </div>
        {course && (
          <div>
            <span className={labelClassName}>Also give it to</span>
            <AudiencePicker offeringId={course} value={audience} onChange={setAudience} given={given} />
            <p className="text-xs text-gray-500 mt-1">Groups can be added, not removed — students there may have started.</p>
          </div>
        )}
        {!course && otherSections.length > 0 && (
          <div>
            <span className={labelClassName}>Also assign to</span>
            <div className="border border-hairline rounded-xl divide-y divide-hairline">
              {otherSections.map((s) => {
                const checked = added.has(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setAdded((prev) => {
                          const next = new Set(prev);
                          if (checked) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        })
                      }
                      className="w-4 h-4 accent-brand-600"
                    />
                    <span className="text-sm text-gray-700">Section {s.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1">Sections can be added, not removed — students there may have started.</p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-5 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
