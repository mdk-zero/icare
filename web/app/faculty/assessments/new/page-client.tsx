"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_ATTEMPTS, MIN_ATTEMPTS } from "@/app/lib/quiz-attempts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faListCheck,
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
  faBookOpen,
  faArrowLeft,
  faCheck,
  faClock,
  faRotateRight,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch, fetchSkillCatalog, type SkillSummary } from "../../../lib/api";
import { stashDrafts, type DraftQuestion } from "../draft-handoff";
import { toast } from "../../../components/Toast";
import { EcgLoader } from "../../../components/EcgLoader";
import PageHeader from "../../../components/PageHeader";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";
const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

/** Where the first questions come from, if anywhere. */
type Source = "none" | "lesson" | "ai";

/** The skill-based generator writes at most this many per request. */
const MAX_AI_QUESTIONS = 10;

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
  const [source, setSource] = useState<Source>("none");
  // The Taylor's skill checklist the AI writes from; "" for general questions
  // from the quiz's title and description.
  const [aiSkill, setAiSkill] = useState("");
  const [aiTopic, setAiTopic] = useState("");
  const [skillCatalog, setSkillCatalog] = useState<SkillSummary[]>([]);

  useEffect(() => {
    if (source !== "ai" || skillCatalog.length > 0) return;
    let live = true;
    void fetchSkillCatalog().then((skills) => live && setSkillCatalog(skills));
    return () => {
      live = false;
    };
  }, [source, skillCatalog.length]);

  // The catalog grouped by chapter, for the skill picker.
  const skillChapters = useMemo(() => {
    const groups: { chapter: number; area: string; skills: SkillSummary[] }[] = [];
    for (const sk of skillCatalog) {
      let g = groups.find((x) => x.chapter === sk.chapter);
      if (!g) groups.push((g = { chapter: sk.chapter, area: sk.area, skills: [] }));
      g.skills.push(sk);
    }
    return groups.sort((a, b) => a.chapter - b.chapter);
  }, [skillCatalog]);

  const useLesson = source === "lesson" && !!lessonFile;
  const useAi = source === "ai";
  const maxCount = useAi ? MAX_AI_QUESTIONS : 20;

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
    time_limit_minutes: "",
    max_attempts: String(DEFAULT_ATTEMPTS),
  });

  const handleCreate = async () => {
    if (busy) return;
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    const attempts = Number(form.max_attempts);
    if (!Number.isInteger(attempts) || attempts < MIN_ATTEMPTS) {
      setError(`Attempts allowed must be at least ${MIN_ATTEMPTS}`);
      return;
    }
    if (useLesson) {
      if (!form.description.trim()) {
        setError("Add a description first — the lesson import needs every field filled in");
        return;
      }
      if (!Number.isInteger(lessonCount) || lessonCount < 1) {
        setError("Enter how many questions to generate");
        return;
      }
    }
    if (useAi && (!Number.isInteger(lessonCount) || lessonCount < 1)) {
      setError("Enter how many questions to generate");
      return;
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
            time_limit_seconds: form.time_limit_minutes
              ? Number(form.time_limit_minutes) * 60
              : null,
            max_attempts: Number(form.max_attempts),
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

      if (useAi) {
        setStage("generating");
        const genRes = await fetch(`/api/faculty/assessments/${assessmentId}/questions/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            topic: aiTopic.trim(),
            count: Math.min(lessonCount, MAX_AI_QUESTIONS),
            skill_id: aiSkill || undefined,
          }),
        });
        const genJson = (await genRes.json()) as { questions?: DraftQuestion[]; error?: string };
        if (!genRes.ok || !genJson.questions?.length) {
          setError(
            `${genJson.error ?? "Failed to generate questions"} — your quiz was created; press the button again to retry.`,
          );
          setBusy(false);
          setStage(null);
          return;
        }
        // Drafts, not saved questions: the editor opens with them for review.
        if (!stashDrafts(assessmentId, genJson.questions)) {
          setError("The questions were written, but this browser blocked passing them to the quiz editor. Try again with site storage allowed.");
          setBusy(false);
          setStage(null);
          return;
        }
        toast(`Quiz created — review the ${genJson.questions.length} AI draft questions`);
      } else if (useLesson) {
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
        toast("Quiz created");
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

  const steps = useAi
    ? ([
        { key: "creating", label: "Creating your quiz" },
        { key: "generating", label: aiSkill ? `Writing questions from Skill ${aiSkill}` : "Writing questions" },
        { key: "done", label: "Opening the quiz for your review" },
      ] as const)
    : ([
        { key: "creating", label: "Creating your quiz" },
        { key: "generating", label: "Reading the lesson and writing questions" },
        { key: "done", label: "Connecting criteria and opening the quiz" },
      ] as const);
  const stepIndex = stage === "generating" ? 1 : stage === "creating" ? 0 : -1;

  const generating = useLesson || useAi;
  const count = Number.isFinite(lessonCount) ? lessonCount : 0;
  const timeLimit = Number(form.time_limit_minutes);
  // Identification rows appear only when the lesson asks for them alone or mixed in.
  const writeIn = useLesson && lessonTypes.has("short_answer");
  const bubbles = !useLesson || lessonTypes.has("multiple_choice");
  const checklist = [
    { ok: !!form.title.trim(), label: "Title written" },
    ...(useLesson ? [{ ok: !!form.description.trim(), label: "Description written (the lesson needs it)" }] : []),
    ...(source === "lesson" ? [{ ok: !!lessonFile, label: "Lesson attached" }] : []),
    ...(useAi ? [{ ok: true, label: aiSkill ? `Writing from Skill ${aiSkill}` : "Writing general questions" }] : []),
  ];

  return (
    <div className="pb-4">
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faListCheck} className="h-4 w-4" />,
          label: "Quizzes",
        }}
        title="New Quiz"
        subtitle="Set the quiz up, and let AI write the first questions from a lesson or a Taylor's skill"
      />

      <button
        type="button"
        onClick={() => router.push("/faculty/assessments")}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-brand-700 transition-colors"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
        Back to quizzes
      </button>

      {error && (
        <div
          role="alert"
          className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            rateLimited
              ? "border-brand-200 bg-brand-50 text-brand-800"
              : "border-red-200 bg-red-50 text-red-700"
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

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* The quiz sheet: one numbered step per decision. */}
        <div className="relative rounded-2xl border border-hairline bg-surface p-4 shadow-tile sm:p-6">
          <SheetStep n={1} title="Details" hint="What students see when they open the quiz." done={!!form.title.trim()}>
            <div className="space-y-4">
              <div>
                <label className={labelClassName} htmlFor="quiz-title">Title</label>
                <input
                  id="quiz-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Vital Signs Fundamentals"
                  disabled={busy}
                  className={`${inputClassName} font-display text-base font-medium`}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="quiz-description">
                  Description {!useLesson && <span className="font-normal text-gray-500">(optional)</span>}
                </label>
                <textarea
                  id="quiz-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="A short summary of what this quiz covers"
                  disabled={busy}
                  className={inputClassName}
                />
              </div>
            </div>
          </SheetStep>

          <SheetStep n={2} title="Rules" hint="How long students get, and how many tries." done>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClassName} htmlFor="quiz-time">
                  Time limit <span className="font-normal text-gray-500">(minutes, optional)</span>
                </label>
                <div className="relative">
                  <FontAwesomeIcon icon={faClock} className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    id="quiz-time"
                    type="number"
                    min={1}
                    value={form.time_limit_minutes}
                    onChange={(e) => setForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
                    placeholder="No limit"
                    disabled={busy}
                    className={`${inputClassName} pl-10`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClassName} htmlFor="quiz-attempts">
                  Attempts allowed <span className="font-normal text-gray-500">(at least {MIN_ATTEMPTS})</span>
                </label>
                <div className="relative">
                  <FontAwesomeIcon icon={faRotateRight} className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    id="quiz-attempts"
                    type="number"
                    min={MIN_ATTEMPTS}
                    step={1}
                    value={form.max_attempts}
                    onChange={(e) => setForm((f) => ({ ...f, max_attempts: e.target.value }))}
                    placeholder={String(DEFAULT_ATTEMPTS)}
                    disabled={busy}
                    className={`${inputClassName} pl-10`}
                  />
                </div>
              </div>
            </div>
          </SheetStep>

          <SheetStep
            n={3}
            title="First questions"
            hint="Optional. AI writes them now, or you add them yourself after creating."
            done={generating}
            last
          >
            <div className="space-y-5">
              <div role="radiogroup" aria-label="Question source" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {([
                  { key: "none", label: "Start empty", hint: "Add questions yourself", icon: faPenToSquare },
                  { key: "lesson", label: "From a lesson", hint: "Questions + criteria", icon: faCloudArrowUp },
                  { key: "ai", label: "With AI", hint: "From a Taylor's skill", icon: faWandMagicSparkles },
                ] as const).map((opt) => {
                  const on = source === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setSource(opt.key);
                        setError(null);
                        if (opt.key === "ai") setLessonCount((c) => Math.min(Number.isFinite(c) ? c : 5, MAX_AI_QUESTIONS));
                      }}
                      disabled={busy}
                      className={`relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all disabled:opacity-50 ${
                        on
                          ? "border-brand-600 bg-brand-50 shadow-[0_0_0_1px_var(--color-brand-600)]"
                          : "border-hairline bg-surface hover:border-brand-300"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          on ? "bg-brand-600 text-white" : "bg-subtle text-brand-600"
                        }`}
                      >
                        <FontAwesomeIcon icon={opt.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900">{opt.label}</span>
                        <span className="block text-xs text-gray-500">{opt.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {source === "lesson" && (
                <div className="space-y-5">
                  <input
                    ref={lessonInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                  {lessonFile ? (
                    <div className="flex items-center gap-3 rounded-xl border border-brand-300 bg-brand-50 p-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-600">
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
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-surface hover:text-gray-800"
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
                      className={`flex w-full items-center gap-4 rounded-xl border-2 border-dashed px-4 py-5 text-left transition-colors ${
                        dragOver
                          ? "border-brand-600 bg-brand-50"
                          : "border-gray-300 bg-subtle hover:border-brand-400 hover:bg-brand-50"
                      }`}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                        <FontAwesomeIcon icon={faCloudArrowUp} className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-800">Drop your lesson here, or click to browse</span>
                        <span className="mt-1 flex gap-1.5">
                          {["PDF", "DOCX", "TXT", "MD"].map((t) => (
                            <span key={t} className="rounded-md border border-hairline bg-surface px-2 py-0.5 text-[10px] font-bold tracking-wide text-gray-500">
                              {t}
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  )}

                  {lessonFile && (
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
                              className={`relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                                on
                                  ? "border-brand-600 bg-brand-50"
                                  : "border-hairline bg-surface hover:border-brand-300"
                              }`}
                            >
                              <FontAwesomeIcon icon={opt.icon} className={`h-4 w-4 ${on ? "text-brand-600" : "text-gray-400"}`} />
                              <span>
                                <span className="block text-sm font-semibold text-gray-900">{opt.label}</span>
                                <span className="block text-[11px] text-gray-500">{opt.hint}</span>
                              </span>
                              {on && <FontAwesomeIcon icon={faCircleCheck} className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-brand-600" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {source === "ai" && (
                <div className="space-y-4">
                  <div>
                    <label className={labelClassName} htmlFor="ai-skill">Write from</label>
                    <select
                      id="ai-skill"
                      value={aiSkill}
                      onChange={(e) => setAiSkill(e.target.value)}
                      disabled={busy}
                      className={inputClassName}
                    >
                      <option value="">General — from the quiz title and description</option>
                      {skillChapters.map((g) => (
                        <optgroup key={g.chapter} label={`Chapter ${g.chapter} · ${g.area}`}>
                          {g.skills.map((sk) => (
                            <option key={sk.id} value={sk.id}>
                              Skill {sk.id} · {sk.title}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
                      <FontAwesomeIcon icon={faBookOpen} className="mt-0.5 h-3 w-3 text-brand-600" />
                      {aiSkill
                        ? `Every question tests one step of the checklist and cites it, e.g. “Skill ${aiSkill}, step 9”.`
                        : "Pick a Taylor's skill to ground every question in its checklist."}
                    </p>
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="ai-focus">
                      Focus <span className="font-normal text-gray-500">(optional)</span>
                    </label>
                    <input
                      id="ai-focus"
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder='e.g. "priority nursing interventions"'
                      disabled={busy}
                      className={inputClassName}
                    />
                  </div>
                </div>
              )}

              {generating && (
                <div>
                  <p className={labelClassName}>Number of questions</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-xl border border-gray-400 bg-surface shadow-sm">
                      <button
                        type="button"
                        onClick={() => setLessonCount((c) => Math.max(1, (Number.isFinite(c) ? c : 5) - 1))}
                        disabled={busy || count <= 1}
                        aria-label="Fewer questions"
                        className="flex h-11 w-11 items-center justify-center rounded-l-xl text-gray-600 hover:bg-subtle disabled:opacity-40"
                      >
                        <FontAwesomeIcon icon={faMinus} className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={maxCount}
                        value={Number.isFinite(lessonCount) ? lessonCount : ""}
                        onChange={(e) => setLessonCount(Math.floor(Number(e.target.value)))}
                        disabled={busy}
                        aria-label="Number of questions"
                        className="h-11 w-16 border-x border-hairline bg-transparent text-center font-display text-lg font-semibold tabular-nums text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() => setLessonCount((c) => Math.min(maxCount, (Number.isFinite(c) ? c : 5) + 1))}
                        disabled={busy || count >= maxCount}
                        aria-label="More questions"
                        className="flex h-11 w-11 items-center justify-center rounded-r-xl text-gray-600 hover:bg-subtle disabled:opacity-40"
                      >
                        <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {[5, 10, 15, 20].filter((n) => n <= maxCount).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setLessonCount(n)}
                        disabled={busy}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold tabular-nums transition-colors ${
                          lessonCount === n
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-gray-300 text-gray-600 hover:border-brand-400"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <span className="text-xs text-gray-500">up to {maxCount}</span>
                  </div>
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-subtle p-3 text-xs text-gray-600">
                    <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 h-3.5 w-3.5 text-brand-600" />
                    {useAi ? (
                      <span>
                        Writes <b>{count || "?"}</b> multiple-choice questions{aiSkill ? <> from Skill <b>{aiSkill}</b></> : null}. They
                        open in the quiz as drafts — review, edit and save each one before students see it.
                      </span>
                    ) : (
                      <span>
                        Creates <b>{count || "?"}</b> {typeSummary} questions from your lesson, plus scoring
                        criteria — each question is already connected to its criterion.
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </SheetStep>

          {busy && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 rounded-2xl bg-surface/95 p-8 backdrop-blur-sm">
              <EcgLoader size="lg" className="text-brand-600" />
              <ol className="w-full max-w-xs space-y-3">
                {steps.slice(0, generating ? 3 : 1).map((step, i) => {
                  const done = i < stepIndex;
                  const active = i === stepIndex;
                  return (
                    <li key={step.key} className="flex items-center gap-3 text-sm">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-semibold ${
                          done
                            ? "bg-brand-100 text-brand-700"
                            : active
                              ? "bg-brand-600 text-white animate-pulse"
                              : "bg-subtle text-gray-400"
                        }`}
                      >
                        {done ? <FontAwesomeIcon icon={faCheck} className="h-3 w-3" /> : i + 1}
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

        {/* The quiz at a glance, with create — pinned beside the sheet on wide screens. */}
        <aside className="space-y-3 xl:sticky xl:top-0">
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-tile">
            <div className="relative bg-brand-600 px-4 pb-4 pt-3.5 text-white">
              {/* Ruled like an answer sheet. */}
              <span
                aria-hidden
                className="absolute inset-0 opacity-[0.14] bg-[repeating-linear-gradient(0deg,#fff_0,#fff_1px,transparent_1px,transparent_12px)]"
              />
              <span aria-hidden className="absolute inset-y-0 left-7 w-px bg-white/30" />
              <p className="relative pl-6 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
                {generating ? "Quiz · AI questions" : "Quiz"}
              </p>
              <p
                className={`relative mt-1 pl-6 font-display text-lg font-semibold leading-snug ${
                  form.title.trim() ? "text-white" : "text-white/55"
                }`}
              >
                {form.title.trim() || "Untitled quiz"}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-hairline px-4 py-3 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-subtle px-2 py-0.5">
                <FontAwesomeIcon icon={faClock} className="h-3 w-3 text-brand-600" />
                {timeLimit > 0 ? `${timeLimit} min` : "No time limit"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-subtle px-2 py-0.5">
                <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3 text-brand-600" />
                {form.max_attempts || DEFAULT_ATTEMPTS} attempts
              </span>
            </div>

            <div className="px-4 py-3">
              <div className="flex items-baseline justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500">Questions</p>
                <p className="font-display text-2xl font-semibold tabular-nums text-gray-900">
                  {generating ? count || "–" : 0}
                </p>
              </div>
              {generating && count > 0 ? (
                <AnswerSheet count={count} bubbles={bubbles} writeIn={writeIn} />
              ) : (
                <p className="mt-1 text-xs text-gray-500">
                  {source === "lesson" ? "Attach a lesson to plan its questions." : "You'll add questions after creating."}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-tile">
            <ul className="space-y-1.5 text-xs">
              {checklist.map((c) => (
                <li key={c.label} className={`flex items-center gap-2 ${c.ok ? "text-gray-700" : "text-gray-400"}`}>
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full ${
                      c.ok ? "bg-brand-600 text-white" : "border border-gray-300"
                    }`}
                  >
                    {c.ok && <FontAwesomeIcon icon={faCheck} className="h-2 w-2" />}
                  </span>
                  {c.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              {useLesson
                ? "Your quiz opens with questions and criteria already in place."
                : useAi
                  ? "Your quiz opens with the AI's questions as drafts for you to review."
                  : "You'll add questions and scoring criteria after creating."}
            </p>
            <button
              onClick={handleCreate}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(27,107,123,0.25)] hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <EcgLoader /> {stage === "generating" ? "Generating…" : "Creating…"}
                </>
              ) : generating ? (
                <>
                  <FontAwesomeIcon icon={faWandMagicSparkles} className="h-4 w-4" /> Create & Generate Quiz
                </>
              ) : (
                "Create Quiz"
              )}
            </button>
            <button
              onClick={() => router.push("/faculty/assessments")}
              disabled={busy}
              className="mt-2 w-full rounded-xl px-5 py-2 text-sm text-gray-600 hover:bg-subtle disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A numbered step on the quiz sheet, joined to the next by a rail. */
function SheetStep({
  n,
  title,
  hint,
  done,
  last,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  done?: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="relative grid grid-cols-[2.25rem_1fr] gap-x-3 animate-rise sm:gap-x-4"
      style={{ animationDelay: `${n * 60}ms` }}
    >
      {!last && <span aria-hidden className="absolute bottom-0 left-[1.125rem] top-10 w-px bg-hairline" />}
      <span
        aria-hidden
        className={`relative z-[1] flex h-9 w-9 items-center justify-center rounded-full border font-display text-[13px] font-semibold tabular-nums transition-colors ${
          done ? "border-brand-600 bg-brand-600 text-white" : "border-brand-200 bg-surface text-brand-600"
        }`}
      >
        {done ? <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" /> : String(n).padStart(2, "0")}
      </span>
      <div className={`min-w-0 ${last ? "" : "pb-8"}`}>
        <div className="flex min-h-9 items-center">
          <h2 className="font-display text-base font-semibold text-gray-900">{title}</h2>
        </div>
        {hint && <p className="-mt-0.5 text-xs text-gray-500">{hint}</p>}
        <div className="mt-3.5">{children}</div>
      </div>
    </section>
  );
}

const SHEET_ROWS = 10;

/**
 * The planned questions drawn as an answer sheet: a numbered row of A–D
 * bubbles per multiple-choice question, a write-in line for identification
 * (alternating when a lesson mixes both).
 */
function AnswerSheet({ count, bubbles, writeIn }: { count: number; bubbles: boolean; writeIn: boolean }) {
  const rows = Math.min(count, SHEET_ROWS);
  return (
    <div className="mt-2" aria-hidden>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {Array.from({ length: rows }, (_, i) => {
          const line = writeIn && (!bubbles || i % 2 === 1);
          return (
            <li
              key={i}
              className="flex items-center gap-1.5 animate-rise"
              style={{ animationDelay: `${i * 25}ms` }}
            >
              <span className="w-4 text-right font-display text-[10px] font-semibold tabular-nums text-gray-400">
                {i + 1}
              </span>
              {line ? (
                <span className="h-px flex-1 translate-y-1 bg-brand-300" />
              ) : (
                ["A", "B", "C", "D"].map((l) => (
                  <span
                    key={l}
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-brand-300 text-[7px] font-semibold text-brand-600"
                  >
                    {l}
                  </span>
                ))
              )}
            </li>
          );
        })}
      </ol>
      {count > SHEET_ROWS && (
        <p className="mt-2 text-center text-[11px] font-medium text-gray-500">+{count - SHEET_ROWS} more</p>
      )}
    </div>
  );
}
