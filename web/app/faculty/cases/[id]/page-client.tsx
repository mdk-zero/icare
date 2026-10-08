"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPen, faTimes, faTrash } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "../../../components/ConfirmModal";
import { SkeletonTable } from "../../../components/skeletons";
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
import { deadlineFromInput } from "../../../lib/deadline-input";

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

  const [filter, setFilter] = useState<CaseSubmissionStatus | "all">("all");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const shown = filter === "all" ? roster : roster.filter((r) => r.status === filter);
  const handedIn = roster.some((r) => r.status === "submitted" || r.status === "graded");

  const doDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteCasePresentation(presentationId);
    setDeleting(false);
    if (res.error !== undefined) return setDeleteError(res.error);
    toast("Case presentation deleted");
    router.push("/faculty/cases");
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
                {presentation.sections.map((s) => `Section ${s.name}`).join(", ")}
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

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => {
          const count = f.key === "all" ? roster.length : roster.filter((r) => r.status === f.key).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                active
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-surface border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {f.label} <span className="tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : (
        <div className="bg-surface rounded-xl border border-hairline shadow-tile overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Student</th>
                <th className="px-4 py-3 font-semibold">Patient</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Score</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No students in this group.
                  </td>
                </tr>
              )}
              {shown.map((r) => (
                <RosterRow key={r.submission_id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

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
    <Link href="/faculty/cases" className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700">
      <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" /> Case Presentations
    </Link>
  );
}

function RosterRow({ row }: { row: CaseRosterEntry }) {
  const canOpen = row.status === "submitted" || row.status === "graded";
  return (
    <tr className="hover:bg-gray-50/60">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{row.student_name}</div>
        {row.section_name && <div className="text-xs text-gray-500">Section {row.section_name}</div>}
      </td>
      <td className="px-4 py-3 font-mono text-gray-700">{row.patient_initials ?? "—"}</td>
      <td className="px-4 py-3">
        <CaseStatusBadge status={row.status} late={row.late} />
      </td>
      <td className="px-4 py-3 tabular-nums text-gray-700">
        {row.score === null ? "—" : `${row.score}% · ${scoreDescriptor(row.score)}`}
      </td>
      <td className="px-4 py-3 text-right">
        {canOpen ? (
          <Link
            href={`/faculty/cases/submissions/${row.submission_id}`}
            className={`inline-block px-3 py-1.5 rounded-lg text-sm font-medium ${
              row.status === "submitted"
                ? "bg-brand-600 text-white hover:bg-brand-700"
                : "border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {row.status === "submitted" ? "Grade" : "View"}
          </Link>
        ) : (
          <span className="text-xs text-gray-400">Not handed in</span>
        )}
      </td>
    </tr>
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
        {otherSections.length > 0 && (
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
