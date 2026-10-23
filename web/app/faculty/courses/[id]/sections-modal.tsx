"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import { EcgLoader } from "../../../components/EcgLoader";
import { loadingToast } from "../../../components/Toast";
import { fetchCourseSectionChoices, saveCourseSections, type CourseSectionChoice } from "../../../lib/api";

/**
 * The sections the instructor teaches this course in. A Dean can assign a
 * course with none, leaving the instructor to add their own here. Students
 * come from the checked sections: the members of the instructor's groups
 * there, or the whole section where they supervise no group.
 */
export default function SectionsModal({
  offeringId,
  courseCode,
  onClose,
  onSaved,
}: {
  offeringId: string;
  courseCode: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [choices, setChoices] = useState<CourseSectionChoice[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchCourseSectionChoices(offeringId).then((result) => {
      if (!live) return;
      if (result.error !== undefined) {
        setError(result.error);
        return;
      }
      // The course's sections first, then the ones with a group of theirs, then by name.
      const sorted = [...result.data.sections].sort(
        (a, b) =>
          Number(b.on_course) - Number(a.on_course) ||
          Number(b.groups.length > 0) - Number(a.groups.length > 0) ||
          a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
      setChoices(sorted);
      setPicked(sorted.filter((s) => s.on_course).map((s) => s.id));
    });
    return () => {
      live = false;
    };
  }, [offeringId]);

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const current = (choices ?? []).filter((s) => s.on_course).map((s) => s.id);
  const changed = picked.length !== current.length || picked.some((id) => !current.includes(id));
  const dropping = (choices ?? []).filter((s) => s.on_course && !picked.includes(s.id));

  const save = async () => {
    setSaving(true);
    setError(null);
    const progress = loadingToast(`Saving ${courseCode}'s sections…`);
    const result = await saveCourseSections(offeringId, picked);
    setSaving(false);
    if (result.error !== undefined) {
      progress.error(result.error);
      setError(result.error);
      return;
    }
    progress.success("Sections saved");
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={saving ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-sections-title"
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 text-brand-600" />
            </span>
            <div className="min-w-0">
              <h2 id="course-sections-title" className="truncate font-display text-lg font-semibold text-gray-900">
                {courseCode} sections
              </h2>
              <p className="truncate text-sm text-gray-500">The sections you teach this course in</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-[8rem] flex-1 overflow-y-auto p-2">
          {choices === null && !error ? (
            <p className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500">
              <EcgLoader />
              Loading sections…
            </p>
          ) : choices !== null && choices.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">
              There are no sections to choose from yet. Ask your Dean or Program Chair to add them.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {(choices ?? []).map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 hover:bg-subtle">
                    <input
                      type="checkbox"
                      checked={picked.includes(s.id)}
                      onChange={() => toggle(s.id)}
                      disabled={saving}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-600/30"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800">{s.name}</span>
                      <span className="block text-xs text-gray-500">
                        {s.groups.length
                          ? `Your groups: ${s.groups.join(", ")}`
                          : "No group of yours here, so the whole section joins your roster"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-hairline px-5 py-4">
          {dropping.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-amber-700">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3 w-3 shrink-0" />
              {`Students who are only here through ${dropping.map((s) => s.name).join(", ")} leave the roster. Their work and scores are kept.`}
            </p>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || choices === null || !changed}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {saving && <EcgLoader />}
              Save sections
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
