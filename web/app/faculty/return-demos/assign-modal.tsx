"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faSearch, faUserPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { assignReturnDemo, fetchFacultyTeams, type ReturnDemoSummary } from "../../lib/api";
import { assignableStudents } from "../../lib/return-demos";
import { deadlineFromInput } from "../../lib/deadline-input";
import { usePageData } from "../../lib/use-page-data";
import { EcgLoader } from "../../components/EcgLoader";
import { toast } from "../../components/Toast";

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-surface px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

/**
 * Give a Return Demonstration to whole groups you supervise and/or single
 * students in them, with a deadline. Each student gets their own copy and
 * is graded on their own; anyone who already has it is skipped.
 */
export default function AssignModal({
  demo,
  onClose,
  onAssigned,
}: {
  demo: ReturnDemoSummary;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { data: overview, loading } = usePageData("faculty:teams", fetchFacultyTeams);
  const { teams, students } = useMemo(
    () => (overview ? assignableStudents(overview) : { teams: [], students: [] }),
    [overview],
  );
  const sectionName = useMemo(() => new Map((overview?.sections ?? []).map((s) => [s.id, s.name])), [overview]);
  const teamLabel = (teamId: string | null) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return "";
    const section = sectionName.get(team.section_id);
    return section ? `${section} · ${team.name}` : team.name;
  };

  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deadline, setDeadline] = useState("");
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  // Everyone the choice reaches, each once: the picked groups' members plus single picks.
  const reached = useMemo(() => {
    const ids = new Set(studentIds);
    for (const t of teams) if (teamIds.includes(t.id)) for (const m of t.members) ids.add(m.id);
    return ids.size;
  }, [teams, teamIds, studentIds]);
  const shown = students.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  const submit = async () => {
    const iso = deadlineFromInput(deadline);
    if (!iso) {
      setError("Set a deadline");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await assignReturnDemo(demo.id, { team_ids: teamIds, student_ids: studentIds, deadline: iso, required });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const assigned = result.assigned ?? 0;
    const skipped = result.skipped ?? 0;
    toast(`Assigned to ${assigned}${skipped > 0 ? `; ${skipped} already had it` : ""}`);
    onAssigned();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-return-demo-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline p-5">
          <div className="min-w-0">
            <h3 id="assign-return-demo-title" className="text-lg font-bold text-gray-900">
              Assign Return Demonstration
            </h3>
            <p className="mt-0.5 truncate text-sm text-gray-500">{demo.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-6">
              <EcgLoader className="text-brand-600" />
            </div>
          ) : teams.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500">
              You don&apos;t supervise any groups yet, so there&apos;s nobody to assign.
            </p>
          ) : (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-gray-800">Groups</legend>
                <ul className="space-y-2">
                  {teams.map((team) => (
                    <li key={team.id} className="rounded-lg border border-hairline">
                      <div className="flex items-center gap-3 px-3 py-2">
                        <input
                          id={`team-${team.id}`}
                          type="checkbox"
                          checked={teamIds.includes(team.id)}
                          onChange={() => setTeamIds((list) => toggle(list, team.id))}
                          className="h-4 w-4 accent-brand-600"
                        />
                        <label htmlFor={`team-${team.id}`} className="min-w-0 flex-1 cursor-pointer text-sm text-gray-800">
                          {teamLabel(team.id)}
                          <span className="ml-1 text-xs text-gray-500">
                            ({team.members.length} member{team.members.length === 1 ? "" : "s"})
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setOpen(open === team.id ? null : team.id)}
                          aria-expanded={open === team.id}
                          aria-label={`Show ${team.name}'s members`}
                          className="grid h-7 w-7 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
                        >
                          <FontAwesomeIcon
                            icon={faChevronDown}
                            className={`h-3 w-3 transition-transform ${open === team.id ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                      {open === team.id && (
                        <p className="border-t border-hairline px-3 py-2 text-xs text-gray-600">
                          {team.members.length === 0 ? "No members yet." : team.members.map((m) => m.name).join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-gray-800">Or single students</legend>
                <div className="relative mb-2">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search students..."
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {shown.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={studentIds.includes(s.id)}
                          onChange={() => setStudentIds((list) => toggle(list, s.id))}
                          className="h-4 w-4 accent-brand-600"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{s.name}</span>
                        <span className="shrink-0 text-xs text-gray-500">{teamLabel(s.team_id)}</span>
                      </label>
                    </li>
                  ))}
                  {shown.length === 0 && <li className="px-2 py-1.5 text-sm text-gray-500">No students match.</li>}
                </ul>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-800">Deadline</span>
                  <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />
                </label>
                <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  Required
                </label>
              </div>
            </>
          )}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-hairline bg-subtle p-4">
          <span className="text-xs text-gray-500">
            {reached > 0 ? `Reaches ${reached} student${reached === 1 ? "" : "s"}` : "Choose groups or students"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 bg-surface px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || reached === 0 || !deadline}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <EcgLoader /> : <FontAwesomeIcon icon={faUserPlus} className="h-3.5 w-3.5" />}
              Assign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
