"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPeopleGroup,
  faPlus,
  faShuffle,
  faTrash,
  faPen,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  autoSplitTeams,
  createTeam,
  deleteTeam,
  fetchFacultyTeams,
  moveStudentToTeam,
  renameTeam,
  type TeamsOverview,
} from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import Avatar from "../../components/Avatar";
import ConfirmModal, { type ConfirmConfig } from "../../components/ConfirmModal";
import { EcgLoader } from "../../components/EcgLoader";
import { toast } from "../../components/Toast";
import { usePageData } from "../../lib/use-page-data";

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * Teams within each of the faculty member's sections. A team is a label for
 * assigning: give a scenario to a team and every member gets their own copy,
 * graded on their own.
 */
export default function TeamsClient() {
  const { data, loading, refresh, setData } = usePageData("faculty:teams", fetchFacultyTeams);
  const overview: TeamsOverview | null = data ?? null;
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [splitCount, setSplitCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const sections = overview?.sections ?? [];
  const activeSection = sectionId ?? sections[0]?.id ?? null;
  const teams = useMemo(
    () => (overview?.teams ?? []).filter((t) => t.section_id === activeSection).sort(byName),
    [overview, activeSection],
  );
  const students = useMemo(
    () => (overview?.students ?? []).filter((s) => s.section_id === activeSection),
    [overview, activeSection],
  );
  const unassigned = students.filter((s) => !s.team_id).sort(byName);

  const run = async (action: () => Promise<{ ok: true } | { error: string }>, success?: string) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if ("error" in result) {
      toast(result.error);
      return false;
    }
    if (success) toast(success);
    await refresh();
    return true;
  };

  /** Moves a student at once on screen, then saves; a failure reloads the truth. */
  const move = async (studentId: string, teamId: string | null) => {
    setData((prev) => {
      if (!prev) return prev as unknown as TeamsOverview;
      const student = prev.students.find((s) => s.id === studentId);
      if (!student) return prev;
      const moved = { ...student, team_id: teamId };
      return {
        ...prev,
        students: prev.students.map((s) => (s.id === studentId ? moved : s)),
        teams: prev.teams.map((t) => ({
          ...t,
          members: [
            ...t.members.filter((m) => m.id !== studentId),
            ...(t.id === teamId ? [{ id: moved.id, name: moved.name, picture_url: moved.picture_url, sex: moved.sex }] : []),
          ].sort(byName),
        })),
      };
    });
    const result = await moveStudentToTeam(studentId, teamId);
    if ("error" in result) {
      toast(result.error);
      await refresh();
    }
  };

  const askAutoSplit = () => {
    if (!activeSection) return;
    const assigned = students.length - unassigned.length;
    const doSplit = async () => {
      setConfirm(null);
      await run(() => autoSplitTeams(activeSection, splitCount), `Split into ${splitCount} teams`);
    };
    if (assigned === 0) {
      void doSplit();
      return;
    }
    setConfirm({
      title: "Reshuffle this section?",
      message: `${assigned} student${assigned === 1 ? " is" : "s are"} already in teams. Auto-split moves everyone into ${splitCount} new random teams. Scenarios already assigned are not affected.`,
      confirmLabel: "Reshuffle",
      danger: false,
      onConfirm: () => void doSplit(),
    });
  };

  const askDelete = (teamId: string, name: string, size: number) =>
    setConfirm({
      title: `Delete ${name}?`,
      message:
        size > 0
          ? `Its ${size} member${size === 1 ? "" : "s"} become unassigned. Scenarios already assigned to them stay.`
          : "The team is empty.",
      confirmLabel: "Delete team",
      onConfirm: async () => {
        setConfirm(null);
        await run(() => deleteTeam(teamId), `${name} deleted`);
      },
    });

  const addTeam = async () => {
    if (!activeSection || !newName.trim()) return;
    if (await run(() => createTeam(activeSection, newName.trim()), "Team created")) setNewName("");
  };

  const saveRename = async () => {
    if (!renaming || !renaming.name.trim()) return;
    if (await run(() => renameTeam(renaming.id, renaming.name.trim()))) setRenaming(null);
  };

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faPeopleGroup} className="w-3.5 h-3.5" />, label: "Teams" }}
        title="Teams"
        subtitle="Group each section into teams. Assigning a scenario to a team gives every member their own copy, graded individually."
      />

      {loading && !overview ? (
        <div className="p-12 text-center">
          <EcgLoader size="md" className="text-brand-600" />
        </div>
      ) : !overview ? (
        <p className="p-6 text-sm text-gray-500">Unable to load teams.</p>
      ) : !overview.enabled ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Teams appear once database migration 048 (teams) is applied.</p>
        </div>
      ) : sections.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">You have no sections yet. An admin assigns them in Settings.</p>
      ) : (
        <>
          {/* Sections + controls */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface p-1">
              {sections.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === activeSection}
                  onClick={() => setSectionId(s.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    s.id === activeSection ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-subtle"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Teams
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={splitCount}
                  onChange={(e) => setSplitCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="w-16 rounded-lg border border-gray-300 bg-surface px-2 py-1.5 text-sm tabular-nums"
                />
              </label>
              <button
                onClick={askAutoSplit}
                disabled={busy || students.length < splitCount}
                title={students.length < splitCount ? "Fewer students than teams" : undefined}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-600/40 bg-surface px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-600/5 disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faShuffle} className="h-3.5 w-3.5" />
                Auto-split
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <section key={team.id} className="rounded-xl border border-hairline bg-surface p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
                <header className="mb-2 flex items-center gap-2">
                  {renaming?.id === team.id ? (
                    <input
                      autoFocus
                      value={renaming.name}
                      maxLength={60}
                      onChange={(e) => setRenaming({ id: team.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      onBlur={() => void saveRename()}
                      aria-label="Team name"
                      className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-semibold"
                    />
                  ) : (
                    <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{team.name}</h2>
                  )}
                  <span className="text-xs tabular-nums text-gray-500">{team.members.length}</span>
                  <button
                    onClick={() => setRenaming({ id: team.id, name: team.name })}
                    aria-label={`Rename ${team.name}`}
                    className="grid h-7 w-7 place-items-center rounded-md text-gray-400 hover:bg-subtle hover:text-gray-700"
                  >
                    <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => askDelete(team.id, team.name, team.members.length)}
                    aria-label={`Delete ${team.name}`}
                    className="grid h-7 w-7 place-items-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                  </button>
                </header>
                {team.members.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-300 p-3 text-center text-xs text-gray-500">
                    No members yet — move students in from below.
                  </p>
                ) : (
                  <ul className="divide-y divide-hairline">
                    {team.members.map((m) => (
                      <StudentRow key={m.id} student={m} teamId={team.id} teams={teams} onMove={move} />
                    ))}
                  </ul>
                )}
              </section>
            ))}

            {/* New team */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addTeam();
              }}
              className="flex min-h-[120px] flex-col justify-center gap-2 rounded-xl border border-dashed border-gray-300 p-3"
            >
              <label className="text-sm font-semibold text-gray-700" htmlFor="new-team">
                New team
              </label>
              <div className="flex gap-2">
                <input
                  id="new-team"
                  value={newName}
                  maxLength={60}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`Team ${teams.length + 1}`}
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-surface px-3 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !newName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                  Add
                </button>
              </div>
            </form>
          </div>

          {/* Unassigned */}
          <section className="mt-4 rounded-xl border border-hairline bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-gray-900">
              Not in a team <span className="font-normal tabular-nums text-gray-500">· {unassigned.length}</span>
            </h2>
            {unassigned.length === 0 ? (
              <p className="text-xs text-gray-500">
                {students.length === 0 ? "This section has no students." : "Everyone in this section is in a team."}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-x-6 divide-y divide-hairline sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-3">
                {unassigned.map((s) => (
                  <StudentRow key={s.id} student={s} teamId={null} teams={teams} onMove={move} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {confirm && <ConfirmModal config={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function StudentRow({
  student,
  teamId,
  teams,
  onMove,
}: {
  student: { id: string; name: string; picture_url: string | null; sex: "male" | "female" | null };
  teamId: string | null;
  teams: { id: string; name: string }[];
  onMove: (studentId: string, teamId: string | null) => void;
}) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <Avatar name={student.name} src={student.picture_url} userId={student.id} sex={student.sex} size="xs" />
      <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{student.name}</span>
      <select
        value={teamId ?? ""}
        onChange={(e) => onMove(student.id, e.target.value || null)}
        aria-label={`Team for ${student.name}`}
        className="max-w-[9rem] rounded-md border border-gray-300 bg-surface px-1.5 py-1 text-xs text-gray-700"
      >
        <option value="">No team</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </li>
  );
}
