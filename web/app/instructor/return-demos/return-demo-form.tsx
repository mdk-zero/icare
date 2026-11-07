"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faFloppyDisk, faHandHoldingMedical } from "@fortawesome/free-solid-svg-icons";
import { createReturnDemo, fetchReturnDemo, updateReturnDemo, type SkillSelection } from "../../lib/api";
import { MAX_RETURN_DEMO_TITLE } from "../../lib/return-demos";
import { forgetPage } from "../../lib/request-cache";
import CoursePicker, { resolveCourse, useActivityCourses } from "../../components/CoursePicker";
import PageHeader from "../../components/PageHeader";
import { EcgLoader } from "../../components/EcgLoader";
import { toast } from "../../components/Toast";
import SkillPicker from "../scenarios/skill-picker";
import { CHAPTERS_NOT_SAVED, checklistIssue, taskSelection } from "../scenarios/skill-checklist";
import SkillStepsPreview from "./skill-steps-preview";

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-surface px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

/**
 * Make or edit a Return Demonstration: a title, the course it counts toward,
 * and the skills to demonstrate. Each skill becomes a task whose steps start
 * as the Taylor's checklist, word for word; the instructor can rename it, add
 * skills of their own, and add, edit, move or delete steps. When editing, the
 * skills it has load as saved. One a student has been graded on stays, with
 * its steps as they are.
 */
export default function ReturnDemoForm({ id }: { id?: string }) {
  const router = useRouter();
  const editing = Boolean(id);
  const { offerings } = useActivityCourses();

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [chosenCourse, setChosenCourse] = useState("");
  /** Every skill on it: when editing, the saved ones (with their task ids) first. */
  const [skills, setSkills] = useState<SkillSelection[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetchReturnDemo(id).then((demo) => {
      if (cancelled) return;
      if (!demo) {
        setLoadError("This Return Demonstration couldn't be loaded.");
        return;
      }
      setTitle(demo.title);
      setDescription(demo.description);
      setChosenCourse(demo.offering_id ?? "");
      setSkills(demo.tasks.map(taskSelection));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const offeringId = resolveCourse(offerings, chosenCourse);
  const needsCourse = offerings.length > 0 && !offeringId;
  const issue = checklistIssue(skills);
  const canSave = title.trim().length > 0 && skills.length > 0 && !issue && !needsCourse && !saving;

  const save = async () => {
    setSaving(true);
    setError(null);
    const input = { title: title.trim(), description: description.trim(), offering_id: offeringId || null, skills };
    const result = editing && id ? await updateReturnDemo(id, input) : await createReturnDemo(input);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.chaptersSaved === false) toast(CHAPTERS_NOT_SAVED, "info", 8000);
    else toast(editing ? "Return Demonstration saved" : "Return Demonstration created");
    // Back to the list, loaded fresh so the new one is there from the first
    // frame; replace so Back doesn't reopen the form.
    forgetPage("faculty:return-demos");
    router.replace("/instructor/return-demos");
  };

  if (loadError) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>;
  }
  if (editing && !loaded) {
    return (
      <div className="flex justify-center py-16">
        <EcgLoader className="text-brand-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={() => router.push("/instructor/return-demos")}
        className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
        Back to Return Demonstrations
      </button>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faHandHoldingMedical} className="w-3.5 h-3.5" />, label: "Return Demonstrations" }}
        title={editing ? "Edit Return Demonstration" : "New Return Demonstration"}
        subtitle="Pick the Taylor's skills your students will demonstrate, or write your own. No patient or scenario: just the checklists."
      />

      <div className="space-y-5 rounded-xl border border-hairline bg-surface p-5 shadow-tile">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-gray-800">Title</span>
          <input
            type="text"
            value={title}
            maxLength={MAX_RETURN_DEMO_TITLE}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Vital Signs Return Demonstration"
            className={inputClass}
          />
        </label>

        <CoursePicker offerings={offerings} value={offeringId} onChange={setChosenCourse} what="return demonstration" />

        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-gray-800">
            Description <span className="font-normal text-gray-500">(optional)</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What students should prepare, or bring to the skills lab."
            className={inputClass}
          />
        </label>

        <SkillPicker value={skills} onChange={setSkills} disabled={saving} />
        <SkillStepsPreview value={skills} />

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
        {!error && issue && <p className="text-sm text-amber-700">{issue}</p>}

        <div className="flex justify-end gap-3 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={() => router.push("/instructor/return-demos")}
            disabled={saving}
            className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <EcgLoader /> : <FontAwesomeIcon icon={faFloppyDisk} className="h-4 w-4" />}
            {editing ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
