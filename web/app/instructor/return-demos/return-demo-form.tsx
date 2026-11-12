"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronLeft,
  faFloppyDisk,
  faHandHoldingMedical,
  faListCheck,
  faRotateLeft,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  createReturnDemo,
  fetchReturnDemo,
  updateReturnDemo,
  type ReturnDemoDetail,
  type SkillSelection,
} from "../../lib/api";
import { MAX_RETURN_DEMO_TITLE } from "../../lib/return-demos";
import { forgetPage } from "../../lib/request-cache";
import CoursePicker, { resolveCourse, useActivityCourses } from "../../components/CoursePicker";
import PageHeader from "../../components/PageHeader";
import { EcgLoader } from "../../components/EcgLoader";
import { toast } from "../../components/Toast";
import SkillPicker from "../scenarios/skill-picker";
import SkillStepsPreview from "./skill-steps-preview";
import FormsPicker from "./forms-picker";
import { editedSkills } from "./edit-skills";
import ChecklistPanel from "./checklist-panel";
import { checklistRowsFromTasks, stepCount, type ChecklistRow } from "../../lib/checklist-import";

/** What students are graded on: Taylor's skills, or the school's own checklist. */
type Source = "skills" | "checklist";

const SOURCES = [
  {
    value: "skills",
    icon: faHandHoldingMedical,
    label: "Taylor's skills",
    hint: "Pick skills from the catalog; their checklist steps are used word for word.",
  },
  {
    value: "checklist",
    icon: faListCheck,
    label: "Add Checklist",
    hint: "Upload your own procedures or protocols as a PDF or Excel file, or type them in.",
  },
] as const;

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-surface px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

/**
 * Make or edit a Return Demonstration: a title, the course it counts toward,
 * and the Taylor's skills to demonstrate. Each skill becomes a task whose
 * steps are the skill's checklist, word for word. When editing, the skills
 * it already has are shown as stored and stay as they are (a variant can't
 * change under students who may have been graded on it); they can be
 * removed, unless graded, and new ones added. Instead of skills it can use a
 * skills checklist the instructor uploads (PDF or Excel) or types in, which
 * can't change once a student is graded on it. Forms (094) are optional
 * sheets students fill in alongside the skills.
 */
export default function ReturnDemoForm({ id }: { id?: string }) {
  const router = useRouter();
  const editing = Boolean(id);
  const { offerings } = useActivityCourses();

  const [existing, setExisting] = useState<ReturnDemoDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [chosenCourse, setChosenCourse] = useState("");
  /** New picks; when editing, the skills it already has are `existing.tasks`. */
  const [skills, setSkills] = useState<SkillSelection[]>([]);
  /** Skill ids of existing tasks to take off. */
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  /** Form keys, in the order shown to students. */
  const [forms, setForms] = useState<string[]>([]);
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("skills");
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  /** The checklist was edited (or the source switched), so an edit sends it. */
  const [checklistChanged, setChecklistChanged] = useState(false);
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
      setExisting(demo);
      setTitle(demo.title);
      setDescription(demo.description);
      setChosenCourse(demo.offering_id ?? "");
      setForms(demo.forms ?? []);
      // Tasks with no skill are an uploaded checklist's sections.
      if (demo.tasks.length > 0 && demo.tasks.every((t) => !t.skill_id)) {
        setSource("checklist");
        setChecklist(checklistRowsFromTasks(demo.tasks));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const offeringId = resolveCourse(offerings, chosenCourse);
  const needsCourse = offerings.length > 0 && !offeringId;
  const existingTasks = existing?.tasks ?? [];
  const skillTasks = existingTasks.filter((t) => t.skill_id);
  const anyGraded = existingTasks.some((t) => t.graded);
  const savedSource: Source | null =
    existingTasks.length === 0 ? null : existingTasks.every((t) => !t.skill_id) ? "checklist" : "skills";
  const saved = editedSkills(skillTasks, removed, skills);
  const ready = source === "skills" ? saved.length > 0 : stepCount(checklist) > 0;
  const canSave = title.trim().length > 0 && ready && !needsCourse && !saving;
  const switchSource = (next: Source) => {
    if (next === source) return;
    setSource(next);
    setChecklistChanged(true);
  };
  const toggleRemoved = (skillId: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    const base = { title: title.trim(), description: description.trim(), offering_id: offeringId || null, forms };
    // An edit leaves an untouched checklist alone, so a graded one can still be renamed.
    const input =
      source === "skills"
        ? { ...base, skills: saved }
        : editing && !checklistChanged
          ? base
          : { ...base, skills: [], checklist };
    if (editing && id) {
      const result = await updateReturnDemo(id, input);
      setSaving(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast("Return Demonstration saved");
    } else {
      const result = await createReturnDemo({ skills: [], ...input });
      setSaving(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast("Return Demonstration created");
    }
    // Back to the list, loaded fresh so the new one is there from the first
    // frame; replace so Back doesn't reopen the form.
    forgetPage("faculty:return-demos");
    router.replace("/instructor/return-demos");
  };

  if (loadError) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>;
  }
  if (editing && !existing) {
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
        subtitle="Pick the Taylor's skills your students will demonstrate, or add your own checklist. No patient or scenario: just the checklists."
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

        <fieldset>
          <legend className="mb-1.5 block text-sm font-bold text-gray-800">What students are graded on</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SOURCES.map((option) => {
              const on = source === option.value;
              const locked = anyGraded || saving;
              return (
                <label
                  key={option.value}
                  className={`flex gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600/40 ${
                    on ? "border-brand-600 bg-brand-600/5 ring-1 ring-brand-600" : "border-gray-200 hover:bg-gray-50"
                  } ${locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="source"
                    value={option.value}
                    checked={on}
                    disabled={locked}
                    onChange={() => switchSource(option.value)}
                    className="sr-only"
                  />
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      on ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    <FontAwesomeIcon icon={option.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                    <span className="block text-xs text-gray-500">{option.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {anyGraded && (
            <p className="mt-1.5 text-xs text-gray-500">Students have been graded on it, so this can&apos;t change.</p>
          )}
          {savedSource && source !== savedSource && (
            <p className="mt-1.5 text-xs text-amber-700">
              Saving replaces what it has now with the {source === "skills" ? "skills you pick" : "checklist"}.
            </p>
          )}
        </fieldset>

        {source === "checklist" && (
          <ChecklistPanel
            rows={checklist}
            onChange={(rows) => {
              setChecklist(rows);
              setChecklistChanged(true);
            }}
            title={title}
            onSuggestTitle={(found) => setTitle((cur) => (cur.trim() ? cur : found.slice(0, MAX_RETURN_DEMO_TITLE)))}
            disabled={saving}
            locked={anyGraded ? "Graded, so it stays as it is" : undefined}
          />
        )}

        {source === "skills" && skillTasks.length > 0 && (
          <div className="rounded-xl border border-hairline bg-surface p-4">
            <p className="text-sm font-bold text-gray-800">Skills on this Return Demonstration</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Kept as they are, steps and all. Remove one to take it off; one a student has been graded on stays.
            </p>
            <ul className="mt-3 space-y-2">
              {skillTasks.map((task) => {
                const skillId = task.skill_id ?? task.id;
                const off = removed.has(skillId);
                const open = openSkill === task.id;
                return (
                  <li key={task.id} className={`rounded-lg border border-hairline ${off ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setOpenSkill(open ? null : task.id)}
                        aria-expanded={open}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className={`min-w-0 flex-1 text-sm text-gray-800 ${off ? "line-through" : ""}`}>
                          {task.title}
                          <span className="ml-1 text-xs text-gray-500">· {task.steps} steps</span>
                        </span>
                        <FontAwesomeIcon
                          icon={faChevronDown}
                          className={`h-3 w-3 shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
                        />
                      </button>
                      {task.graded ? (
                        <span className="shrink-0 text-[11px] text-gray-500">Graded, stays</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleRemoved(skillId)}
                          disabled={saving}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                        >
                          <FontAwesomeIcon icon={off ? faRotateLeft : faXmark} className="h-3 w-3" />
                          {off ? "Undo" : "Remove"}
                        </button>
                      )}
                    </div>
                    {open && (
                      <ol className="space-y-1.5 border-t border-hairline px-3 py-2 text-xs text-gray-700">
                        {(task.step_titles ?? []).map((step, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="w-5 shrink-0 text-right tabular-nums text-gray-400">{i + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {source === "skills" && (
          <>
            <SkillPicker
              value={skills}
              onChange={setSkills}
              disabled={saving}
              existingIds={skillTasks.map((t) => t.skill_id).filter((id): id is string => !!id)}
              existingLabel="Already on it"
            />
            <SkillStepsPreview value={skills} />
          </>
        )}

        <FormsPicker value={forms} onChange={setForms} disabled={saving} />

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}

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
