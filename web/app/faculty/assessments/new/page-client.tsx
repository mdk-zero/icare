"use client";

import { useRef, useState, type SelectHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faListCheck,
  faChevronDown,
  faXmark,
  faCloudArrowUp,
  faFilePdf,
  faFileWord,
  faFileLines,
  faListUl,
  faPenToSquare,
  faMinus,
  faPlus,
  faCircleCheck,
  faTriangleExclamation,
  faWandMagicSparkles,
  faCircleInfo,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "../../../lib/api";
import { toast } from "../../../components/Toast";
import { EcgLoader } from "../../../components/EcgLoader";
import PageHeader from "../../../components/PageHeader";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";
const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

/** A native `<select>` with its own chevron pulled in from the edge, rather
 * than the browser's default arrow flush against the border. */
function SelectField({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`${inputClassName} appearance-none pr-9 ${className}`} />
      <FontAwesomeIcon
        icon={faChevronDown}
        className="pointer-events-none absolute right-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500"
      />
    </div>
  );
}

const CATEGORIES = [
  "Cardiac Emergency",
  "Respiratory Emergency",
  "Neurological Emergency",
  "Trauma",
  "Medical-Surgical",
  "Patient Education",
  "Infection Management",
  "Critical Care",
  "Medication Safety",
  "General",
] as const;

type Difficulty = "beginner" | "intermediate" | "advanced";

export default function AssessmentNewClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"creating" | "generating" | null>(null);
  const createdIdRef = useRef<string | null>(null);
  const lessonInputRef = useRef<HTMLInputElement>(null);
  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [lessonTypes, setLessonTypes] = useState<Set<"multiple_choice" | "short_answer">>(
    () => new Set(["multiple_choice"]),
  );
  const [lessonCount, setLessonCount] = useState(5);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = (file: File | null) => {
    setLessonFile(file);
    setError(null);
  };

  const toggleLessonType = (type: "multiple_choice" | "short_answer") => {
    setLessonTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const [form, setForm] = useState({
    title: "",
    description: "",
    difficulty: "beginner" as Difficulty,
    category: "General" as (typeof CATEGORIES)[number],
    time_limit_minutes: "",
  });

  const handleCreate = async () => {
    if (busy) return;
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (lessonFile) {
      if (!form.description.trim()) {
        setError("Add a description first — the lesson import needs every field filled in");
        return;
      }
      if (!Number.isInteger(lessonCount) || lessonCount < 1) {
        setError("Enter how many questions to generate");
        return;
      }
    }
    setBusy(true);
    setError(null);

    try {
      // Reuse the assessment from a failed generation attempt rather than
      // creating a duplicate on retry.
      let assessmentId = createdIdRef.current;
      if (!assessmentId) {
        setStage("creating");
        const res = await apiFetch("/api/faculty/assessments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: form.title.trim(),
            description: form.description,
            category: form.category,
            difficulty: form.difficulty,
            time_limit_seconds: form.time_limit_minutes
              ? Number(form.time_limit_minutes) * 60
              : null,
          }),
        });

        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          setError(j.error ?? "Failed to create assessment");
          setBusy(false);
          setStage(null);
          return;
        }

        const json = (await res.json()) as { assessment: { id: string } };
        assessmentId = json.assessment.id;
        createdIdRef.current = assessmentId;
      }

      if (lessonFile) {
        setStage("generating");
        const formData = new FormData();
        formData.append("file", lessonFile);
        formData.append("questionTypes", Array.from(lessonTypes).join(","));
        formData.append("count", String(lessonCount));
        formData.append("save", "true");
        const genRes = await fetch(
          `/api/faculty/assessments/${assessmentId}/questions/generate-from-lesson`,
          { method: "POST", credentials: "include", body: formData },
        );
        const genJson = (await genRes.json()) as { saved?: number; error?: string };
        if (!genRes.ok || !genJson.saved) {
          setError(
            `${genJson.error ?? "Failed to generate questions from the lesson"} — your assessment was created; press the button again to retry the lesson.`,
          );
          setBusy(false);
          setStage(null);
          return;
        }
        toast(`Assessment created with ${genJson.saved} questions from your lesson`);
      } else {
        toast("Assessment created");
      }

      router.replace(`/faculty/assessments/${assessmentId}`);
    } catch {
      setError("Failed to create assessment");
      setBusy(false);
      setStage(null);
    }
  };

  const fileIcon = !lessonFile
    ? faCloudArrowUp
    : lessonFile.name.toLowerCase().endsWith(".pdf")
      ? faFilePdf
      : lessonFile.name.toLowerCase().endsWith(".docx")
        ? faFileWord
        : faFileLines;
  const fileSize = lessonFile
    ? lessonFile.size >= 1024 * 1024
      ? `${(lessonFile.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(lessonFile.size / 1024))} KB`
    : "";
  const typeSummary = Array.from(lessonTypes)
    .map((t) => (t === "multiple_choice" ? "multiple-choice" : "identification"))
    .join(" + ");
  const rateLimited = error?.toLowerCase().includes("rate-limited") ?? false;

  const steps = [
    { key: "creating", label: "Creating your quiz" },
    { key: "generating", label: "Reading the lesson and writing questions" },
    { key: "done", label: "Connecting criteria and opening the quiz" },
  ] as const;
  const stepIndex = stage === "generating" ? 1 : stage === "creating" ? 0 : -1;

  return (
    <div className="space-y-6">
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faListCheck} className="h-4 w-4" />,
          label: "Assessments",
        }}
        title="New Assessment"
        subtitle="Create a new quiz — or drop in a lesson and let it write the questions"
      />

      {error && (
        <div
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            rateLimited
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              {rateLimited ? "The AI is busy right now" : "Something went wrong"}
            </p>
            <p className="opacity-90">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Quiz details */}
        <div className="space-y-5 rounded-2xl border border-hairline bg-surface p-6 shadow-tile lg:col-span-3">
          <div className="flex items-center gap-3 border-b border-hairline pb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
              <FontAwesomeIcon icon={faListCheck} className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-gray-900">Quiz details</h2>
              <p className="text-xs text-gray-500">What students will see</p>
            </div>
          </div>

          <div>
            <label className={labelClassName}>Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Vital Signs Fundamentals"
              disabled={busy}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="A short summary of what this quiz covers"
              disabled={busy}
              className={inputClassName}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClassName}>Difficulty</label>
              <SelectField
                value={form.difficulty}
                disabled={busy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, difficulty: e.target.value as Difficulty }))
                }
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </SelectField>
            </div>
            <div>
              <label className={labelClassName}>Category</label>
              <SelectField
                value={form.category}
                disabled={busy}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    category: e.target.value as (typeof CATEGORIES)[number],
                  }))
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
          <div>
            <label className={labelClassName}>
              Time limit <span className="font-normal text-gray-500">(minutes, optional)</span>
            </label>
            <input
              type="number"
              min={1}
              value={form.time_limit_minutes}
              onChange={(e) => setForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
              placeholder="No limit"
              disabled={busy}
              className={inputClassName}
            />
          </div>
        </div>

        {/* Lesson import */}
        <div className="relative overflow-hidden rounded-2xl border border-hairline bg-surface shadow-tile lg:col-span-2">
          <div className="flex items-center gap-3 border-b border-hairline bg-gradient-to-r from-brand-600/[0.07] to-transparent p-6 pb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <FontAwesomeIcon icon={faWandMagicSparkles} className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-gray-900">Generate from a lesson</h2>
              <p className="text-xs text-gray-500">Optional — questions + criteria, connected</p>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <input
              ref={lessonInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              disabled={busy}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />

            {lessonFile ? (
              <div className="flex items-center gap-3 rounded-xl border border-brand-600/30 bg-brand-600/[0.05] p-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                  <FontAwesomeIcon icon={fileIcon} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{lessonFile.name}</p>
                  <p className="text-xs text-gray-500">{fileSize} · ready to read</p>
                </div>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => {
                      pickFile(null);
                      if (lessonInputRef.current) lessonInputRef.current.value = "";
                    }}
                    aria-label="Remove lesson file"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  >
                    <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => lessonInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pickFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                  dragOver
                    ? "border-brand-600 bg-brand-600/[0.08]"
                    : "border-gray-300 bg-gray-50/60 hover:border-brand-600/60 hover:bg-brand-600/[0.04]"
                }`}
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600/10 text-brand-600">
                  <FontAwesomeIcon icon={faCloudArrowUp} className="h-6 w-6" />
                </span>
                <span className="text-sm font-semibold text-gray-800">
                  Drag & drop your lesson here
                </span>
                <span className="text-xs text-gray-500">or click to browse</span>
                <span className="mt-1 flex gap-1.5">
                  {["PDF", "DOCX", "TXT", "MD"].map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-gray-500"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </button>
            )}

            {lessonFile && (
              <>
                <div>
                  <p className={labelClassName}>Question types</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: "multiple_choice", label: "Multiple choice", hint: "4 options", icon: faListUl },
                      { key: "short_answer", label: "Identification", hint: "Type the answer", icon: faPenToSquare },
                    ] as const).map((opt) => {
                      const on = lessonTypes.has(opt.key);
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => toggleLessonType(opt.key)}
                          disabled={busy}
                          aria-pressed={on}
                          className={`relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                            on
                              ? "border-brand-600 bg-brand-600/[0.07] shadow-sm"
                              : "border-gray-300 bg-surface hover:border-brand-600/50"
                          }`}
                        >
                          <FontAwesomeIcon
                            icon={opt.icon}
                            className={`h-4 w-4 ${on ? "text-brand-600" : "text-gray-400"}`}
                          />
                          <span className="text-sm font-semibold text-gray-900">{opt.label}</span>
                          <span className="text-[11px] text-gray-500">{opt.hint}</span>
                          {on && (
                            <FontAwesomeIcon
                              icon={faCircleCheck}
                              className="absolute right-2.5 top-2.5 h-4 w-4 text-brand-600"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className={labelClassName}>Number of questions</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLessonCount((c) => Math.max(1, (Number.isFinite(c) ? c : 5) - 1))}
                      disabled={busy}
                      aria-label="Fewer questions"
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      <FontAwesomeIcon icon={faMinus} className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={Number.isFinite(lessonCount) ? lessonCount : ""}
                      onChange={(e) => setLessonCount(Math.floor(Number(e.target.value)))}
                      disabled={busy}
                      className={`${inputClassName} text-center text-base font-bold`}
                    />
                    <button
                      type="button"
                      onClick={() => setLessonCount((c) => Math.min(20, (Number.isFinite(c) ? c : 5) + 1))}
                      disabled={busy}
                      aria-label="More questions"
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {[5, 10, 15, 20].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setLessonCount(n)}
                        disabled={busy}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                          lessonCount === n
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-gray-300 text-gray-600 hover:border-brand-600/50"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                  <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 h-3.5 w-3.5 text-brand-600" />
                  <p>
                    Creates <b>{Number.isFinite(lessonCount) ? lessonCount : "?"}</b> {typeSummary}{" "}
                    questions from your lesson, plus scoring criteria — each question is already
                    connected to its criterion.
                  </p>
                </div>
              </>
            )}
          </div>

          {busy && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-surface/95 p-8 backdrop-blur-sm">
              <EcgLoader />
              <ol className="w-full max-w-xs space-y-3">
                {steps
                  .slice(0, lessonFile ? 3 : 1)
                  .map((step, i) => {
                    const done = i < stepIndex;
                    const active = i === stepIndex;
                    return (
                      <li key={step.key} className="flex items-center gap-3 text-sm">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            done
                              ? "bg-emerald-500 text-white"
                              : active
                                ? "bg-brand-600 text-white animate-pulse"
                                : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {done ? <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" /> : i + 1}
                        </span>
                        <span className={active ? "font-semibold text-gray-900" : done ? "text-gray-500" : "text-gray-400"}>
                          {step.label}
                        </span>
                      </li>
                    );
                  })}
              </ol>
              <p className="text-center text-xs text-gray-500">
                Hang tight — this can take up to a minute. Please don&apos;t close this page.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 rounded-2xl border border-hairline bg-surface p-4 shadow-tile sm:flex-row sm:items-center">
        <p className="text-xs text-gray-500">
          {lessonFile
            ? "Your quiz opens with questions and criteria already in place."
            : "Without a lesson, you'll add questions and scoring criteria after creating."}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => router.push("/faculty/assessments")}
            disabled={busy}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(27,107,123,0.25)] hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? (
              <>
                <EcgLoader />{" "}
                {stage === "generating" ? "Generating…" : "Creating…"}
              </>
            ) : lessonFile ? (
              <>
                <FontAwesomeIcon icon={faWandMagicSparkles} className="h-4 w-4" /> Create & Generate Quiz
              </>
            ) : (
              "Create Assessment"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
