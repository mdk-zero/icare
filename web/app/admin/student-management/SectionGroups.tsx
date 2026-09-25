"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPeopleGroup,
  faPlus,
  faShuffle,
  faPen,
  faTrashCan,
  faUserTie,
  faTriangleExclamation,
  faCheck,
  faXmark,
  faGripVertical,
} from "@fortawesome/free-solid-svg-icons";
import {
  assignTeamFaculty,
  autoSplitTeams,
  createTeam,
  deleteTeam,
  renameTeam,
  type TeamsOverview,
} from "../../lib/api";
import Avatar from "../../components/Avatar";
import { nextGroupName } from "../../lib/group-label";
import { isStudentDrag, leftTarget, readStudentDrag, startStudentDrag } from "./drag";
import ConfirmModal, { type ConfirmConfig } from "../../components/ConfirmModal";
import { loadingToast } from "../../components/Toast";

/** Mirrors MAX_TEAMS_PER_SECTION on the server. */
const MAX_GROUPS = 20;

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

const selectClass =
  "w-full rounded-lg border border-gray-200 bg-surface px-2.5 py-1.5 text-sm text-gray-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

/**
 * A section's groups: split the roster into groups of a chosen size, give each
 * group a supervising faculty member, and move students between groups.
 * Students outside every group are listed in the roster table below instead.
 */
export default function SectionGroups({
  sectionId,
  studentCount,
  overview,
  onChanged,
  pendingIds,
  onMove,
}: {
  sectionId: string;
  studentCount: number;
  overview: TeamsOverview | null;
  onChanged: () => Promise<unknown> | void;
  /** Students moved on screen whose save hasn't landed yet; drawn greyed out. */
  pendingIds: ReadonlyMap<string, string | null>;
  /** Moves students right away on screen, then saves. */
  onMove: (ids: string[], to: string | null, labels: { pending: string; done: string }) => Promise<void>;
}) {
  // Kept as the typed text, so clearing the box doesn't snap back to a number.
  const [perGroup, setPerGroup] = useState("2");
  const [splitting, setSplitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  // The group card a student is being dragged over, lit up as the drop target.
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const groups = (overview?.teams ?? []).filter((t) => t.section_id === sectionId).sort(byName);
  const faculty = overview?.faculty ?? [];
  const grouped = groups.reduce((n, g) => n + g.members.length, 0);

  const size = Math.max(1, Math.floor(Number(perGroup)) || 1);
  const groupCount = Math.min(MAX_GROUPS, Math.max(1, Math.ceil(studentCount / size)));

  /**
   * Runs one change with a loading toast up the whole time, including the
   * reload after it, so the toast turns to done only once the cards show it.
   */
  const run = async (
    action: () => Promise<{ ok: true } | { error: string }>,
    labels: { pending: string; done: string },
  ) => {
    setBusy(true);
    const progress = loadingToast(labels.pending);
    const result = await action();
    await onChanged();
    setBusy(false);
    if ("error" in result) progress.error(result.error);
    else progress.success(labels.done);
    return !("error" in result);
  };

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "a group";

  const generate = async () => {
    const ok = await run(() => autoSplitTeams(sectionId, groupCount), {
      pending: `Splitting ${studentCount} students into ${groupCount} group${groupCount === 1 ? "" : "s"}…`,
      done: `Split ${studentCount} students into ${groupCount} group${groupCount === 1 ? "" : "s"}`,
    });
    if (ok) setSplitting(false);
  };

  const addGroup = () => {
    const name = nextGroupName(groups.map((g) => g.name));
    void run(() => createTeam(sectionId, name), { pending: `Adding ${name}…`, done: `Added ${name}` });
  };

  const askDelete = (id: string, name: string, members: number) =>
    setConfirm({
      title: `Delete ${name}?`,
      message:
        members > 0
          ? `Its ${members} student${members === 1 ? "" : "s"} move to the not-in-a-group list.`
          : "The group is empty.",
      confirmLabel: "Delete group",
      danger: true,
      onConfirm: () => {
        setConfirm(null);
        void run(() => deleteTeam(id), { pending: `Deleting ${name}…`, done: `${name} deleted` });
      },
    });

  const saveRename = async () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name) return;
    if (await run(() => renameTeam(renaming.id, name), { pending: `Renaming to ${name}…`, done: `Renamed to ${name}` }))
      setRenaming(null);
  };

  if (overview && !overview.enabled) {
    return (
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Groups need database migration 048 (teams) applied first.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-hairline bg-surface p-5 shadow-tile">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-gray-900">
            <FontAwesomeIcon icon={faPeopleGroup} className="h-4 w-4 text-brand-600" />
            Groups
          </h3>
          <p className="text-sm text-gray-500">
            {groups.length === 0
              ? "Split the section into groups, then give each one a faculty member."
              : `${groups.length} group${groups.length === 1 ? "" : "s"} · ${grouped} of ${studentCount} students grouped`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button
            onClick={() => setSplitting(true)}
            disabled={busy || studentCount === 0}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faShuffle} className="h-3.5 w-3.5" />
            {groups.length === 0 ? "Create groups" : "Regroup"}
          </button>
          <button
            onClick={addGroup}
            disabled={busy || groups.length >= MAX_GROUPS}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
            Add group
          </button>
        </div>
      </div>

      {overview && !overview.faculty_enabled && groups.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Assigning faculty to groups needs database migration 051 (team_faculty) applied first.
        </p>
      )}

      {groups.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <div
              key={group.id}
              onDragOver={(e) => {
                if (!isStudentDrag(e)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dropTarget !== group.id) setDropTarget(group.id);
              }}
              onDragLeave={(e) => {
                if (leftTarget(e)) setDropTarget((current) => (current === group.id ? null : current));
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(null);
                const drag = readStudentDrag(e);
                if (!drag || drag.fromGroupId === group.id) return;
                void onMove(drag.studentIds, group.id, {
                  pending: `Adding ${drag.label} to ${group.name}…`,
                  done: `Added ${drag.label} to ${group.name}`,
                });
              }}
              className={`relative flex flex-col rounded-xl border p-4 transition-all duration-150 ${
                dropTarget === group.id
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/40"
                  : "border-hairline bg-subtle/60"
              }`}
            >
              {dropTarget === group.id && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-brand-50/85">
                  <span className="rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
                    Drop to add to {group.name}
                  </span>
                </div>
              )}
              <div className="mb-3 flex items-center justify-between gap-2">
                {renaming?.id === group.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <input
                      autoFocus
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: group.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      maxLength={60}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-surface px-2 py-1 text-sm font-semibold text-gray-900 focus:border-brand-600 focus:outline-none"
                    />
                    <button
                      onClick={() => void saveRename()}
                      aria-label="Save name"
                      className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-600/10"
                    >
                      <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setRenaming(null)}
                      aria-label="Cancel rename"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
                    >
                      <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="min-w-0 truncate font-semibold text-gray-900">
                    {group.name}{" "}
                    <span className="text-xs font-normal text-gray-400">
                      {group.members.length} student{group.members.length === 1 ? "" : "s"}
                    </span>
                  </p>
                )}
                {renaming?.id !== group.id && (
                  <div className="flex shrink-0 items-center">
                    <button
                      onClick={() => setRenaming({ id: group.id, name: group.name })}
                      aria-label={`Rename ${group.name}`}
                      title="Rename"
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-brand-600/10 hover:text-brand-600"
                    >
                      <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => askDelete(group.id, group.name, group.members.length)}
                      aria-label={`Delete ${group.name}`}
                      title="Delete"
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <FontAwesomeIcon icon={faTrashCan} className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              <label className="mb-3 block">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <FontAwesomeIcon icon={faUserTie} className="h-3 w-3" />
                  Faculty
                </span>
                <select
                  value={group.faculty_id ?? ""}
                  disabled={busy || !overview?.faculty_enabled}
                  onChange={(e) => {
                    const facultyId = e.target.value || null;
                    const who = faculty.find((f) => f.id === facultyId)?.name;
                    void run(
                      () => assignTeamFaculty(group.id, facultyId),
                      who
                        ? { pending: `Assigning ${who} to ${group.name}…`, done: `${who} now supervises ${group.name}` }
                        : { pending: `Removing the faculty from ${group.name}…`, done: `${group.name} has no faculty now` },
                    );
                  }}
                  className={selectClass}
                >
                  <option value="">No faculty yet</option>
                  {faculty.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>

              {group.members.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
                  No students yet. Drag students here.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {group.members.map((member) => (
                    <li
                      key={member.id}
                      draggable={!busy && !pendingIds.has(member.id)}
                      onDragStart={(e) => startStudentDrag(e, [member], group.id)}
                      title={pendingIds.has(member.id) ? "Saving…" : "Drag to another group"}
                      className={`flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5 transition-opacity ${
                        pendingIds.has(member.id)
                          ? "pointer-events-none animate-pulse opacity-50 grayscale"
                          : "cursor-grab-outlined"
                      }`}
                    >
                      <FontAwesomeIcon icon={faGripVertical} className="h-3 w-3 shrink-0 text-gray-300" aria-hidden />
                      <Avatar name={member.name} src={member.picture_url} userId={member.id} sex={member.sex} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{member.name}</span>
                      <select
                        value={group.id}
                        disabled={busy}
                        aria-label={`Move ${member.name}`}
                        onChange={(e) => {
                          const to = e.target.value || null;
                          void onMove(
                            [member.id],
                            to,
                            to
                              ? { pending: `Moving ${member.name} to ${groupName(to)}…`, done: `Moved ${member.name} to ${groupName(to)}` }
                              : { pending: `Taking ${member.name} out of ${group.name}…`, done: `${member.name} is no longer in a group` },
                          );
                        }}
                        className="w-28 shrink-0 rounded-md border border-gray-200 bg-surface px-1.5 py-1 text-xs text-gray-600 focus:border-brand-600 focus:outline-none"
                      >
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.id === group.id ? g.name : `Move to ${g.name}`}
                          </option>
                        ))}
                        <option value="">Remove from group</option>
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {splitting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={busy ? undefined : () => setSplitting(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="split-title"
            className="w-full max-w-sm overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void generate();
              }}
              className="p-5"
            >
              <h3 id="split-title" className="font-display text-lg font-semibold text-gray-900">
                {groups.length === 0 ? "Create groups" : "Regroup this section"}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {studentCount} student{studentCount === 1 ? "" : "s"} are split at random, as evenly as possible.
              </p>

              <label className="mt-4 block text-sm font-medium text-gray-700">
                Students per group
                <input
                  type="number"
                  autoFocus
                  min={1}
                  max={Math.max(1, studentCount)}
                  value={perGroup}
                  onChange={(e) => setPerGroup(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-gray-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                />
              </label>
              <p className="mt-2 text-sm text-gray-600">
                Makes <span className="font-semibold text-gray-900">{groupCount}</span> group
                {groupCount === 1 ? "" : "s"} of about {Math.ceil(studentCount / groupCount)}.
              </p>
              {grouped > 0 && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3 w-3 shrink-0" />
                  Everyone is reshuffled. Existing groups keep their names and faculty; extra groups are removed.
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSplitting(false)}
                  disabled={busy}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  <FontAwesomeIcon icon={faShuffle} className="h-3.5 w-3.5" />
                  {busy ? "Grouping…" : groups.length === 0 ? `Create ${groupCount}` : `Regroup into ${groupCount}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && <ConfirmModal config={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
