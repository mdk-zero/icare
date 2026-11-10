"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCrown,
  faFilePdf,
  faFilePowerpoint,
  faFolderOpen,
  faHourglassHalf,
  faMagnifyingGlass,
  faPen,
  faTimes,
  faTrash,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import Avatar from "../../../components/Avatar";
import ConfirmModal from "../../../components/ConfirmModal";
import { toast } from "../../../components/Toast";
import { usePageData } from "../../../lib/use-page-data";
import {
  deleteCasePresentation,
  fetchCasePresentation,
  updateCasePresentation,
  type CaseGroup,
  type CasePresentation,
  type CaseSubmissionStatus,
} from "../../../lib/api";
import { scoreDescriptor } from "../../../lib/task-ratings";
import { CaseStatusBadge, formatDue, formatFileSize, inputClassName, labelClassName, toLocalInput } from "../case-ui";
import GroupGrader from "../group-grader";
import CaseGroupPicker, { groupPayload, type GroupPick } from "../group-picker";
import { useCourseAudience } from "../../../components/AudiencePicker";
import { deadlineFromInput } from "../../../lib/deadline-input";

const FILTERS: { key: CaseSubmissionStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "To grade" },
  { key: "graded", label: "Graded" },
  { key: "not_started", label: "Waiting" },
];

type Tab = "groups" | "files";

const formatWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

export default function CasePresentationClient({ presentationId }: { presentationId: string }) {
  const router = useRouter();
  const { data, loading, refresh } = usePageData(`faculty:case:${presentationId}`, async () => {
    const detail = await fetchCasePresentation(presentationId);
    return { detail: detail.data ?? null, error: detail.error ?? null };
  });
  const presentation = data?.detail?.presentation;
  const groups = useMemo(() => data?.detail?.groups ?? [], [data]);

  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (searchParams.get("tab") === "files" ? "files" : "groups"));
  const [filter, setFilter] = useState<CaseSubmissionStatus | "all">("all");
  const [query, setQuery] = useState("");
  // ?group= opens a group straight away; ?edit=1 opens the edit form (the card's Edit).
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("group"));
  const [editing, setEditing] = useState(() => searchParams.get("edit") === "1");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const statusOf = (g: CaseGroup): CaseSubmissionStatus => (g.status === "draft" ? "not_started" : g.status);
  const q = query.trim().toLowerCase();
  const shown = groups.filter(
    (g) =>
      (filter === "all" || statusOf(g) === filter) &&
      (!q ||
        g.name.toLowerCase().includes(q) ||
        g.section_name.toLowerCase().includes(q) ||
        g.members.some((m) => m.name.toLowerCase().includes(q))),
  );
  const selected = groups.find((g) => g.id === selectedId) ?? null;
  // Kept in the address so a reload or a shared link reopens the same view.
  const setAddress = (patch: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    url.searchParams.delete("edit");
    window.history.replaceState(null, "", url);
  };
  const select = (id: string) => {
    setSelectedId(id);
    setTab("groups");
    setAddress({ group: id, tab: null });
  };
  const switchTab = (next: Tab) => {
    setTab(next);
    setAddress({ tab: next === "files" ? "files" : null });
  };
  const handedIn = groups.some((g) => g.status === "submitted" || g.status === "graded");
  const files = groups.filter((g) => g.file);

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
                Due {formatDue(presentation.deadline)} · {groups.length} group{groups.length === 1 ? "" : "s"} ·{" "}
                {groups.reduce((n, g) => n + g.members.length, 0)} students
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
                  title={handedIn ? "Groups have handed in their slides, so it can no longer be deleted" : "Delete"}
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

      <div role="tablist" aria-label="View" className="flex gap-1 border-b border-hairline">
        {(
          [
            ["groups", "Groups", faUsers, groups.length],
            ["files", "Submitted files", faFolderOpen, files.length],
          ] as const
        ).map(([key, label, icon, count]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
            {label}
            <span className="rounded-full bg-subtle px-1.5 text-xs tabular-nums text-gray-500">{count}</span>
          </button>
        ))}
      </div>

      {tab === "files" ? (
        <FilesTable groups={files} loading={loading} onOpen={select} />
      ) : (
        /* Like Patient Case review: the groups down the side, the chosen one's slides and rubric beside them. */
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
                placeholder="Search a group or student…"
                aria-label="Search groups"
                className="w-full rounded-xl border border-gray-200 bg-surface py-2.5 pl-10 pr-3.5 text-sm text-gray-900 shadow-tile outline-none transition-colors placeholder:text-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
              />
            </div>

            <div role="group" aria-label="Filter by status" className="mb-3 flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const count = f.key === "all" ? groups.length : groups.filter((g) => statusOf(g) === f.key).length;
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
                [0, 1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse space-y-2 rounded-xl border border-hairline bg-surface p-3 shadow-tile">
                    <div className="h-3.5 w-1/2 rounded bg-gray-200" />
                    <div className="h-2.5 w-2/3 rounded bg-gray-100" />
                  </div>
                ))}
              {!loading && shown.length === 0 && (
                <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                  {q || filter !== "all" ? "No groups match." : "No groups report this case presentation yet."}
                </p>
              )}
              {!loading &&
                shown.map((g, i) => (
                  <GroupButton key={g.id} group={g} index={i} active={g.id === selectedId} onSelect={() => select(g.id)} />
                ))}
            </div>
          </aside>

          <section className="min-w-0">
            {selected && (selected.status === "submitted" || selected.status === "graded") ? (
              <GroupGrader key={selected.id} groupId={selected.id} onChanged={refresh} />
            ) : (
              <WaitingPanel group={selected} />
            )}
          </section>
        </div>
      )}

      {editing && presentation && (
        <EditModal
          presentation={presentation}
          groups={groups}
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
                <span className="font-medium text-gray-700">{presentation.title}</span> will be removed from every
                group. This can&apos;t be undone.
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

/** One group in the list: its leader and members, status or score, and a badge while it waits for grading. */
function GroupButton({
  group: g,
  index,
  active,
  onSelect,
}: {
  group: CaseGroup;
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      aria-current={active ? "true" : undefined}
      className={`w-full animate-rise rounded-xl border p-3 text-left shadow-tile transition-all hover:border-brand-300 hover:shadow-tile-hover ${
        active
          ? "border-brand-600/50 bg-brand-600/10 shadow-[inset_3px_0_0_0_var(--color-brand-600)]"
          : "border-hairline bg-surface"
      }`}
    >
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-gray-900">{g.name}</span>
          <span className="block truncate text-xs text-gray-500">{g.section_name}</span>
        </span>
        {g.status === "submitted" ? (
          <span
            title="Handed in, not yet graded"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            To grade
          </span>
        ) : g.status === "graded" && g.score !== null ? (
          <span className="shrink-0 text-xs tabular-nums text-emerald-700">
            {g.score}% · {scoreDescriptor(g.score)}
          </span>
        ) : (
          <span className="shrink-0">
            <CaseStatusBadge status="not_started" late={false} />
          </span>
        )}
      </span>
      <span className="mt-2 flex items-center gap-2">
        <span className="flex gap-1">
          {g.members.slice(0, 5).map((m) => (
            <span key={m.student_id} title={m.name}>
              <Avatar name={m.name} src={m.picture_url} userId={m.student_id} size="sm" />
            </span>
          ))}
        </span>
        {g.members.length > 5 && <span className="text-xs text-gray-500">+{g.members.length - 5}</span>}
        <span className="ml-auto flex min-w-0 items-center gap-1 truncate text-xs text-gray-600">
          <FontAwesomeIcon icon={faCrown} className="h-2.5 w-2.5 shrink-0 text-amber-500" />
          <span className="truncate">{g.leader_name ?? "No leader"}</span>
        </span>
      </span>
    </button>
  );
}

/** Before a group hands in: who is in it and who uploads. */
function WaitingPanel({ group }: { group: CaseGroup | null }) {
  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface/60 px-6 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <FontAwesomeIcon icon={group ? faHourglassHalf : faUsers} className="h-7 w-7" />
      </div>
      <p className="font-display text-lg font-semibold text-gray-900">
        {group ? `${group.name} hasn't handed in yet` : "Pick a group"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        {group
          ? `${group.leader_name ?? "The group leader"} uploads the slides. They open here, with the rubric, once uploaded.`
          : "Pick a group to open its slides and grade it on the rubric."}
      </p>
      {group && (
        <ul className="mt-5 flex max-w-md flex-wrap justify-center gap-2">
          {group.members.map((m) => (
            <li
              key={m.student_id}
              className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface py-1 pl-1 pr-3 text-xs text-gray-700"
            >
              <Avatar name={m.name} src={m.picture_url} userId={m.student_id} size="sm" />
              {m.name}
              {m.is_leader && <FontAwesomeIcon icon={faCrown} className="h-2.5 w-2.5 text-amber-500" title="Leader" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Every handed-in file, and the group it came from. */
function FilesTable({ groups, loading, onOpen }: { groups: CaseGroup[]; loading: boolean; onOpen: (id: string) => void }) {
  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl border border-hairline bg-surface shadow-tile" />;
  }
  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
        No group has handed in its slides yet.
      </p>
    );
  }
  const sorted = [...groups].sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
  return (
    <div className="overflow-x-auto rounded-xl border border-hairline bg-surface shadow-tile">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-left text-xs text-gray-600">
          <tr>
            <th className="px-4 py-2.5 font-semibold">File</th>
            <th className="px-4 py-2.5 font-semibold">Group</th>
            <th className="px-4 py-2.5 font-semibold">Uploaded by</th>
            <th className="px-4 py-2.5 font-semibold">Handed in</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {sorted.map((g) => {
            const pptx = g.file!.type === "pptx";
            return (
              <tr key={g.id} className="hover:bg-subtle/60">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <FontAwesomeIcon
                      icon={pptx ? faFilePowerpoint : faFilePdf}
                      className={`h-4 w-4 shrink-0 ${pptx ? "text-orange-600" : "text-rose-600"}`}
                    />
                    <span className="min-w-0">
                      <span className="block max-w-[18rem] truncate font-medium text-gray-900">{g.file!.name}</span>
                      <span className="block text-xs text-gray-500">
                        {pptx ? "PowerPoint" : "PDF"}
                        {g.file!.size ? ` · ${formatFileSize(g.file!.size)}` : ""}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="block font-medium text-gray-900">{g.name}</span>
                  <span className="block text-xs text-gray-500">{g.section_name}</span>
                </td>
                <td className="px-4 py-3 text-gray-700">{g.file!.uploaded_by_name ?? g.leader_name ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatWhen(g.submitted_at)}</td>
                <td className="px-4 py-3">
                  {g.status === "graded" && g.score !== null ? (
                    <span className="text-xs tabular-nums text-emerald-700">{g.score}% · Graded</span>
                  ) : (
                    <CaseStatusBadge status={g.status} late={g.late} />
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onOpen(g.id)}
                    className="rounded-lg border border-brand-600/40 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-600/5"
                  >
                    {g.status === "submitted" ? "Open & grade" : "Open"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditModal({
  presentation,
  groups,
  onClose,
  onSaved,
}: {
  presentation: CasePresentation;
  groups: CaseGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(presentation.title);
  const [instructions, setInstructions] = useState(presentation.instructions);
  const [deadline, setDeadline] = useState(toLocalInput(presentation.deadline));
  const [leaders, setLeaders] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, g.leader_id ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  // More of the course's groups can be added.
  const course = presentation.offering_id ?? null;
  const [picks, setPicks] = useState<GroupPick>({});
  const { roster } = useCourseAudience(course);
  const picked = groupPayload(picks, roster);
  const given = groups.map((g) => g.team_id).filter((t): t is string => !!t);

  const save = async () => {
    if (!title.trim()) return toast("Give the presentation a title");
    if (!deadline) return toast("Set a deadline");
    if (picked.count > 0 && !picked.leadersChosen) return toast("Choose a leader for each new group");
    const changedLeaders = Object.fromEntries(
      Object.entries(leaders).filter(([id, leader]) => leader && leader !== groups.find((g) => g.id === id)?.leader_id),
    );
    setBusy(true);
    const res = await updateCasePresentation(presentation.id, {
      title: title.trim(),
      instructions,
      deadline: deadlineFromInput(deadline),
      ...(Object.keys(changedLeaders).length ? { leaders: changedLeaders } : {}),
      ...(picked.count > 0 ? { groups: picked.groups } : {}),
    });
    setBusy(false);
    if (res.error !== undefined) return toast(res.error);
    const n = res.data.groups_added;
    toast(n > 0 ? `Saved · given to ${n} more group${n === 1 ? "" : "s"}` : "Saved");
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-overlay w-full max-w-xl p-4 space-y-3 max-h-[90vh] overflow-y-auto border border-hairline">
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
        {groups.length > 0 && (
          <div>
            <span className={labelClassName}>Group leaders</span>
            <div className="divide-y divide-hairline rounded-xl border border-hairline">
              {groups.map((g) => (
                <div key={g.id} className="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium text-gray-800">{g.name}</span>
                    <span className="text-gray-500"> · {g.section_name}</span>
                  </span>
                  <select
                    aria-label={`Leader of ${g.name}`}
                    value={leaders[g.id] ?? ""}
                    disabled={busy || g.status === "graded"}
                    title={g.status === "graded" ? "Graded, so the leader can't change" : undefined}
                    onChange={(e) => setLeaders((prev) => ({ ...prev, [g.id]: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-1.5 text-sm text-gray-900 sm:w-56 disabled:bg-subtle"
                  >
                    {g.members.map((m) => (
                      <option key={m.student_id} value={m.student_id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
        {course && (
          <div>
            <span className={labelClassName}>Also give it to</span>
            <CaseGroupPicker offeringId={course} value={picks} onChange={setPicks} given={given} disabled={busy} />
            <p className="text-xs text-gray-500 mt-1">Groups can be added, not removed — they may have handed in already.</p>
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
