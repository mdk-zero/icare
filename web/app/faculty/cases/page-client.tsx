"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboardCheck,
  faFilePrescription,
  faHourglassHalf,
  faPlus,
  faSearch,
  faShieldHalved,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import { SkeletonScenarioCard, SkeletonStatTile } from "../../components/skeletons";
import { toast } from "../../components/Toast";
import { usePageData } from "../../lib/use-page-data";
import {
  createCasePresentation,
  fetchCasePresentations,
  fetchFacultySections,
  type CasePresentationSummary,
  type Section,
} from "../../lib/api";
import { formatDue, inputClassName, labelClassName } from "./case-ui";
import { deadlineFromInput } from "../../lib/deadline-input";

const NO_PRESENTATIONS: CasePresentationSummary[] = [];
const NO_SECTIONS: Section[] = [];

export default function FacultyCasesClient() {
  const { data, loading, refresh } = usePageData("faculty:cases", async () => {
    const [list, sections] = await Promise.all([fetchCasePresentations(), fetchFacultySections()]);
    return {
      presentations: list.data?.presentations ?? NO_PRESENTATIONS,
      error: list.error ?? null,
      sections,
    };
  });
  const presentations = data?.presentations ?? NO_PRESENTATIONS;
  const sections = data?.sections ?? NO_SECTIONS;

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return presentations;
    return presentations.filter(
      (p) => p.title.toLowerCase().includes(q) || p.sections.some((s) => s.name.toLowerCase().includes(q)),
    );
  }, [presentations, search]);

  const toGrade = presentations.reduce((n, p) => n + p.counts.submitted, 0);
  const graded = presentations.reduce((n, p) => n + p.counts.graded, 0);
  const outstanding = presentations.reduce((n, p) => n + p.counts.not_started + p.counts.draft, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faFilePrescription} className="h-4 w-4" />, label: "Case Presentations" }}
        title="Case Presentations"
        subtitle="Students write up their most interesting patient from hospital duty — by initials only — and you grade the presentation"
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonStatTile key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatTile
            icon={faClipboardCheck}
            value={toGrade}
            label="Waiting for grading"
            caption="Handed in, not yet graded"
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatTile
            icon={faHourglassHalf}
            value={outstanding}
            label="Still being written"
            caption="Not started or in draft"
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
          <StatTile
            icon={faFilePrescription}
            value={graded}
            label="Graded"
            caption={`Across ${presentations.length} presentation${presentations.length === 1 ? "" : "s"}`}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title or section..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-gray-400 rounded-xl text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 transition-all"
          />
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium shadow-[0_2px_6px_rgba(27,107,123,0.2)] shrink-0"
        >
          <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
          New Case Presentation
        </button>
      </div>

      {data?.error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{data.error}</p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonScenarioCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface p-12 rounded-xl border border-hairline shadow-tile text-center text-gray-500">
          {search
            ? "No case presentations match your search."
            : "No case presentations yet. Create one to have your students write up a case from their hospital duty."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/faculty/cases/${p.id}`}
              className="bg-surface rounded-xl border border-hairline shadow-tile overflow-hidden flex flex-col hover:border-brand-600/40 transition-colors"
            >
              <div className="p-4 flex-1 space-y-2">
                <h3 className="font-semibold text-gray-800">{p.title}</h3>
                <p className="text-sm text-gray-500">Due {formatDue(p.deadline)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.sections.map((s) => (
                    <span key={s.id} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                      Section {s.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="px-4 py-3 bg-subtle border-t border-hairline flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 tabular-nums">
                <span>{p.counts.total} students</span>
                <span className="text-blue-700">{p.counts.submitted} to grade</span>
                <span className="text-emerald-700">{p.counts.graded} graded</span>
                {p.counts.late > 0 && <span className="text-rose-700">{p.counts.late} late</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <CreateModal
          sections={sections}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CreateModal({
  sections,
  onClose,
  onCreated,
}: {
  sections: Section[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("Most Interesting Case");
  const [instructions, setInstructions] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(sections.length === 1 ? [sections[0].id] : []));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return toast("Give the presentation a title");
    if (selected.size === 0) return toast("Select at least one section");
    if (!deadline) return toast("Set a deadline");
    setBusy(true);
    const res = await createCasePresentation({
      title: title.trim(),
      instructions,
      deadline: deadlineFromInput(deadline),
      section_ids: [...selected],
    });
    setBusy(false);
    if (res.error !== undefined) return toast(res.error);
    const n = res.data.student_count;
    toast(`Assigned to ${n} student${n === 1 ? "" : "s"}`);
    onCreated();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-overlay w-full max-w-lg p-4 space-y-3 max-h-[90vh] overflow-y-auto border border-hairline">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">New case presentation</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className={labelClassName} htmlFor="case-title">Title</label>
          <input id="case-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label className={labelClassName} htmlFor="case-instructions">Instructions (optional)</label>
          <textarea
            id="case-instructions"
            rows={4}
            value={instructions}
            maxLength={4000}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="What to include, how long the presentation should run, when you'll hold it…"
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName} htmlFor="case-deadline">Due</label>
          <input
            id="case-deadline"
            type="datetime-local"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 mt-1">Late cases are still accepted, and marked Late.</p>
        </div>
        <div>
          <span className={labelClassName}>Sections ({selected.size} selected)</span>
          <div className="border border-hairline rounded-xl divide-y divide-hairline max-h-56 overflow-y-auto">
            {sections.length === 0 && (
              <p className="p-4 text-sm text-gray-500">
                You don&apos;t supervise a group in any section yet — ask an admin to assign you one.
              </p>
            )}
            {sections.map((s) => {
              const checked = selected.has(s.id);
              return (
                <label key={s.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelected((prev) => {
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
          <p className="text-xs text-gray-500 mt-1.5 flex items-start gap-1.5">
            <FontAwesomeIcon icon={faShieldHalved} className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              Each student in your groups in these sections gets one case to write. The app only accepts the
              patient&apos;s initials.
            </span>
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-5 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || selected.size === 0 || !deadline}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create & assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
