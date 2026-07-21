"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faTimes,
  faSpinner,
  faTrash,
  faCheck,
  faArrowLeft,
  faPen,
  faLayerGroup,
  faChevronDown,
  faWandMagicSparkles,
  faFileImport,
} from "@fortawesome/free-solid-svg-icons";
import { SkeletonQuestionCard } from "../../../components/skeletons";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";
const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

interface AssessmentDetail {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  category: string;
  time_limit_seconds: number | null;
  question_count: number;
}

interface AssessmentQuestion {
  id: string;
  position: number;
  content: string;
  options: string[];
  correct_index: number;
  question_type: string;
  points: number;
  explanation: string;
  competency_ids: string[];
}

type QuestionFormData = {
  content: string;
  options: string[];
  correct_index: number;
  question_type: string;
  points: number;
  explanation: string;
  competency_ids: string[];
};

interface AssessmentCriteria {
  id: string;
  assessment_id: string;
  name: string;
  weight: number;
  competency_id: string;
  sort_order: number;
}

interface CompetencyArea {
  id: string;
  name: string;
  description: string | null;
}

const emptyQuestionForm: QuestionFormData = {
  content: "",
  options: [""],
  correct_index: 0,
  question_type: "multiple_choice",
  points: 1,
  explanation: "",
  competency_ids: [],
};

/** Minimal CSV parser: quoted fields, "" escapes, \r\n or \n row breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim().length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim().length > 0)) rows.push(row);
  return rows;
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

const CSV_TEMPLATE = `content,options,correct,type,points,explanation,competency
"What is the normal adult resting heart rate range?","40-50 bpm|60-100 bpm|110-130 bpm|140-160 bpm",2,multiple_choice,1,"Normal adult resting heart rate is 60-100 bpm.",Vital Signs Monitoring
"Hand hygiene is the single most effective way to prevent infection.",,true,true_false,1,"Hand hygiene remains the cornerstone of infection control.",Infection Control
`;

export default function AssessmentQuestionsClient({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [questionBuilders, setQuestionBuilders] = useState<
    Record<string, QuestionFormData>
  >({});
  const [savingQuestions, setSavingQuestions] = useState<
    Record<string, boolean>
  >({});
  const [newQuestionOrder, setNewQuestionOrder] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
  const [dirtyQuestions, setDirtyQuestions] = useState<Set<string>>(new Set());
  const markDirty = (qId: string) => setDirtyQuestions((prev) => new Set(prev).add(qId));
  const markClean = (qId: string) => setDirtyQuestions((prev) => { const next = new Set(prev); next.delete(qId); return next; });
  const [editingQuestions, setEditingQuestions] = useState<Set<string>>(new Set());
  const toggleEdit = (qId: string) => setEditingQuestions((prev) => { const next = new Set(prev); if (next.has(qId)) next.delete(qId); else next.add(qId); return next; });
  // AI generation + CSV import
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiGenerating, setAiGenerating] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // criteria editor
  const [criteria, setCriteria] = useState<AssessmentCriteria[]>([]);
  const [competencyAreas, setCompetencyAreas] = useState<CompetencyArea[]>([]);
  const [showCriteriaEditor, setShowCriteriaEditor] = useState(false);
  const [newCriterionName, setNewCriterionName] = useState("");
  const [newCriterionWeight, setNewCriterionWeight] = useState("");
  const [newCriterionCompetency, setNewCriterionCompetency] = useState("");

  // inline detail editing
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailForm, setDetailForm] = useState({ title: "", description: "", difficulty: "beginner", category: "General", time_limit_minutes: "" });
  const [savingDetails, setSavingDetails] = useState(false);

  const handleSaveDetails = async () => {
    if (!detailForm.title.trim()) {
      flash("Title is required");
      return;
    }
    setSavingDetails(true);
    const res = await fetch(`/api/faculty/assessments/${assessmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        title: detailForm.title.trim(),
        description: detailForm.description,
        difficulty: detailForm.difficulty,
        category: detailForm.category,
        time_limit_seconds: detailForm.time_limit_minutes ? Number(detailForm.time_limit_minutes) * 60 : null,
      }),
    });
    setSavingDetails(false);
    if (!res.ok) {
      flash("Failed to save details");
      return;
    }
    setAssessment((prev) =>
      prev ? {
        ...prev,
        title: detailForm.title.trim(),
        description: detailForm.description,
        difficulty: detailForm.difficulty as "beginner" | "intermediate" | "advanced",
        category: detailForm.category,
        time_limit_seconds: detailForm.time_limit_minutes ? Number(detailForm.time_limit_minutes) * 60 : null,
      } : prev
    );
    setEditingDetails(false);
    flash("Assessment details updated");
  };

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assessRes, criteriaRes, compRes] = await Promise.all([
        fetch(`/api/faculty/assessments/${assessmentId}`, {
          credentials: "include",
        }),
        fetch(`/api/faculty/assessments/${assessmentId}/criteria`, {
          credentials: "include",
        }),
        fetch("/api/competencies", { credentials: "include" }),
      ]);

      if (assessRes.ok) {
        const json = (await assessRes.json()) as {
          assessment: { questions: AssessmentQuestion[]; title: string; description: string; difficulty: string; category: string; time_limit_seconds: number | null; question_count: number };
        };
        const a = json.assessment;
        setAssessment({
          id: assessmentId,
          title: a.title,
          description: a.description,
          difficulty: a.difficulty,
          category: a.category,
          time_limit_seconds: a.time_limit_seconds,
          question_count: a.question_count ?? json.assessment.questions.length,
        });
        setDetailForm({
          title: a.title,
          description: a.description ?? "",
          difficulty: a.difficulty,
          category: a.category,
          time_limit_minutes: a.time_limit_seconds ? String(Math.round(a.time_limit_seconds / 60)) : "",
        });
        const loaded = json.assessment.questions ?? [];
        setQuestions(loaded);
        const builders: Record<string, QuestionFormData> = {};
        for (const q of loaded) {
          builders[q.id] = {
            content: q.content,
            options: q.options.length >= 2 ? [...q.options] : ["", ""],
            correct_index: q.correct_index,
            question_type: q.question_type || "multiple_choice",
            points: q.points || 1,
            explanation: q.explanation,
            competency_ids: [...q.competency_ids],
          };
        }
        setQuestionBuilders(builders);
      }

      if (criteriaRes.ok) {
        const j = (await criteriaRes.json()) as { criteria: AssessmentCriteria[] };
        setCriteria(j.criteria ?? []);
      }

      if (compRes.ok) {
        const j = (await compRes.json()) as { competencies: CompetencyArea[] };
        setCompetencyAreas(j.competencies ?? []);
      }
    } catch (err) {
      console.error("Failed to load assessment", err);
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateBuilderField = (
    qId: string,
    field: keyof QuestionFormData,
    value: unknown,
  ) => {
    setQuestionBuilders((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], [field]: value },
    }));
    markDirty(qId);
  };

  const updateBuilderOption = (qId: string, index: number, value: string) => {
    setQuestionBuilders((prev) => {
      const form = prev[qId];
      if (!form) return prev;
      const options = [...form.options];
      options[index] = value;
      return { ...prev, [qId]: { ...form, options } };
    });
    markDirty(qId);
  };

  const addBuilderOption = (qId: string) => {
    setQuestionBuilders((prev) => {
      const form = prev[qId];
      if (!form) return prev;
      return { ...prev, [qId]: { ...form, options: [...form.options, ""] } };
    });
    markDirty(qId);
  };

  const removeBuilderOption = (qId: string, index: number) => {
    setQuestionBuilders((prev) => {
      const form = prev[qId];
      if (!form) return prev;
      const options = form.options.filter((_, i) => i !== index);
      const correct_index = Math.min(form.correct_index, options.length - 1);
      return { ...prev, [qId]: { ...form, options, correct_index } };
    });
    markDirty(qId);
  };

  const setBuilderCorrect = (qId: string, index: number) => {
    setQuestionBuilders((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], correct_index: index },
    }));
    markDirty(qId);
  };

  const handleSaveQuestion = async (qId: string) => {
    const form = questionBuilders[qId];
    if (!form) return;

    const filledOptions = form.options.filter((o) => o.trim().length > 0);
    if (!form.content.trim() || filledOptions.length < 2) {
      flash("Question needs content and at least two options");
      return;
    }
    if (form.correct_index >= filledOptions.length) {
      flash("Mark one of the filled options as correct");
      return;
    }

    setSavingQuestions((prev) => ({ ...prev, [qId]: true }));

    const payload = {
      content: form.content,
      options: filledOptions,
      correct_index: form.correct_index,
      question_type: form.question_type,
      points: form.points,
      explanation: form.explanation,
      competency_ids: form.competency_ids,
    };

    const isNew = qId.startsWith("new_");
    const res = isNew
      ? await fetch(`/api/faculty/assessments/${assessmentId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/faculty/questions/${qId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });

    setSavingQuestions((prev) => ({ ...prev, [qId]: false }));

    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      flash(j.error ?? "Failed to save question");
      return;
    }

    if (isNew) {
      const json = (await res.json()) as { question: AssessmentQuestion };
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === qId ? { ...json.question, competency_ids: form.competency_ids } : q,
        ),
      );
      setQuestionBuilders((prev) => {
        const { [qId]: data, ...rest } = prev;
        return { ...rest, [json.question.id]: data };
      });
    }

    if (!isNew) {
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === qId
            ? { ...q, ...payload, options: filledOptions, competency_ids: form.competency_ids }
            : q,
        ),
      );
    }
    markClean(qId);
    setEditingQuestions((prev) => { const next = new Set(prev); next.delete(qId); return next; });
    flash(isNew ? "Question added" : "Question updated");
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (qId.startsWith("new_")) {
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      setQuestionBuilders((prev) => {
        const { [qId]: _, ...rest } = prev;
        return rest;
      });
      return;
    }
    if (!window.confirm("Delete this question?")) return;
    setSavingQuestions((prev) => ({ ...prev, [qId]: true }));
    const res = await fetch(`/api/faculty/questions/${qId}`, {
      method: "DELETE",
      credentials: "include",
    });
    setSavingQuestions((prev) => ({ ...prev, [qId]: false }));
    if (!res.ok) {
      flash("Failed to delete question");
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== qId));
    setQuestionBuilders((prev) => {
      const { [qId]: _, ...rest } = prev;
      return rest;
    });
    flash("Question deleted");
  };

  const handleDuplicateQuestion = (qId: string) => {
    const form = questionBuilders[qId];
    if (!form) return;
    const newId = `new_${newQuestionOrder}`;
    setNewQuestionOrder((prev) => prev + 1);
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === qId);
      const newQ: AssessmentQuestion = {
        id: newId,
        position: prev.length,
        content: form.content,
        options: [...form.options],
        correct_index: form.correct_index,
        question_type: form.question_type,
        points: form.points,
        explanation: form.explanation,
        competency_ids: [...form.competency_ids],
      };
      const copy = [...prev];
      copy.splice(idx + 1, 0, newQ);
      return copy;
    });
    setQuestionBuilders((prev) => ({
      ...prev,
      [newId]: { ...form },
    }));
  };

  const handleAddQuestion = () => {
    const newId = `new_${newQuestionOrder}`;
    setNewQuestionOrder((prev) => prev + 1);
    const newQ: AssessmentQuestion = {
      id: newId,
      position: questions.length,
      content: "",
      options: ["", ""],
      correct_index: 0,
      question_type: "multiple_choice",
      points: 1,
      explanation: "",
      competency_ids: [],
    };
    setQuestions((prev) => [...prev, newQ]);
    setQuestionBuilders((prev) => ({
      ...prev,
      [newId]: { ...emptyQuestionForm, options: ["", ""] },
    }));
  };

  /** Appends draft questions to the builder as unsaved `new_` entries. */
  const appendDraftQuestions = (forms: QuestionFormData[]) => {
    if (forms.length === 0) return;
    const startIdx = newQuestionOrder;
    setNewQuestionOrder((prev) => prev + forms.length);
    setQuestions((prev) => [
      ...prev,
      ...forms.map((f, i) => ({
        id: `new_${startIdx + i}`,
        position: prev.length + i,
        ...f,
        options: [...f.options],
        competency_ids: [...f.competency_ids],
      })),
    ]);
    setQuestionBuilders((prev) => {
      const next = { ...prev };
      forms.forEach((f, i) => {
        next[`new_${startIdx + i}`] = {
          ...f,
          options: [...f.options],
          competency_ids: [...f.competency_ids],
        };
      });
      return next;
    });
  };

  // ---------- AI generation ----------

  const handleGenerateAI = async () => {
    setAiGenerating(true);
    try {
      const res = await fetch(
        `/api/faculty/assessments/${assessmentId}/questions/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ topic: aiTopic.trim(), count: aiCount }),
        },
      );
      const json = (await res.json()) as {
        questions?: QuestionFormData[];
        error?: string;
      };
      if (!res.ok || !json.questions) {
        flash(json.error ?? "Failed to generate questions");
        return;
      }
      appendDraftQuestions(json.questions);
      setShowAIPanel(false);
      flash(
        `Generated ${json.questions.length} draft question${json.questions.length !== 1 ? "s" : ""} — review and save each one`,
      );
    } catch {
      flash("Failed to generate questions");
    } finally {
      setAiGenerating(false);
    }
  };

  // ---------- CSV import ----------

  const downloadCsvTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "icare-questions-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      flash("CSV needs a header row and at least one question row");
      return;
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const contentCol = col("content");
    if (contentCol === -1) {
      flash('CSV header must include a "content" column — download the template for the format');
      return;
    }
    const cell = (row: string[], idx: number) => (idx >= 0 ? (row[idx] ?? "").trim() : "");

    const drafts: QuestionFormData[] = [];
    let skipped = 0;

    for (const row of rows.slice(1)) {
      const content = cell(row, contentCol);
      const type = cell(row, col("type")).toLowerCase() || "multiple_choice";
      const correctRaw = cell(row, col("correct")).toLowerCase();
      const points = Math.max(1, Number(cell(row, col("points"))) || 1);
      const explanation = cell(row, col("explanation"));
      const competencyName = cell(row, col("competency")).toLowerCase();
      const competencyId = competencyAreas.find(
        (ca) => ca.name.trim().toLowerCase() === competencyName,
      )?.id;

      if (!content) {
        skipped++;
        continue;
      }

      let options: string[];
      let correctIndex: number;
      if (type === "true_false") {
        options = ["True", "False"];
        correctIndex = correctRaw === "false" || correctRaw === "2" ? 1 : 0;
      } else if (type === "multiple_choice") {
        options = cell(row, col("options"))
          .split("|")
          .map((o) => o.trim())
          .filter((o) => o.length > 0);
        // "correct" is the 1-based option number, or the option text itself.
        const asNumber = Number(correctRaw);
        correctIndex = Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length
          ? asNumber - 1
          : options.findIndex((o) => o.toLowerCase() === correctRaw);
        if (options.length < 2 || correctIndex === -1) {
          skipped++;
          continue;
        }
      } else {
        skipped++;
        continue;
      }

      drafts.push({
        content,
        options,
        correct_index: correctIndex,
        question_type: type,
        points,
        explanation,
        competency_ids: competencyId ? [competencyId] : [],
      });
    }

    appendDraftQuestions(drafts);
    flash(
      drafts.length === 0
        ? "No valid questions found in the CSV — download the template for the format"
        : `Imported ${drafts.length} draft question${drafts.length !== 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} row${skipped !== 1 ? "s" : ""} skipped)` : ""} — review and save`,
    );
  };

  // ---------- save all ----------

  const handleSaveAll = async () => {
    const unsaved = questions.filter((q) => q.id.startsWith("new_"));
    if (unsaved.length === 0) {
      flash("No unsaved questions");
      return;
    }
    setSavingAll(true);
    for (const q of unsaved) {
      await handleSaveQuestion(q.id);
    }
    setSavingAll(false);
    flash("All questions saved");
  };

  // ---------- criteria CRUD ----------

  const addCriteria = async () => {
    if (!newCriterionName.trim() || !newCriterionWeight || !newCriterionCompetency) {
      flash("Fill in all criteria fields");
      return;
    }
    const weight = Number(newCriterionWeight);
    if (isNaN(weight) || weight <= 0 || weight > 100) {
      flash("Weight must be between 1 and 100");
      return;
    }
    const res = await fetch(`/api/faculty/assessments/${assessmentId}/criteria`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: newCriterionName.trim(),
        weight,
        competency_id: newCriterionCompetency,
        sort_order: criteria.length,
      }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      flash(j.error ?? "Failed to add criteria");
      return;
    }
    const j = (await res.json()) as { criteria: AssessmentCriteria };
    setCriteria((prev) => [...prev, j.criteria]);
    setNewCriterionName("");
    setNewCriterionWeight("");
    setNewCriterionCompetency("");
  };

  const deleteCriteria = async (id: string) => {
    if (!window.confirm("Remove this criteria?")) return;
    const res = await fetch(`/api/faculty/assessment-criteria/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      flash("Failed to delete criteria");
      return;
    }
    setCriteria((prev) => prev.filter((c) => c.id !== id));
  };

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="p-2 rounded-lg border border-gray-200 bg-gray-100 animate-pulse w-9 h-9" />
          <div className="space-y-2 animate-pulse">
            <div className="h-5 w-48 bg-gray-100 rounded" />
            <div className="h-4 w-64 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-gray-200 shadow-sm animate-pulse p-4">
          <div className="h-8 w-48 bg-gray-100 rounded" />
        </div>
        <div className="space-y-4">
          <div className="h-5 w-32 bg-gray-100 rounded animate-pulse" />
          <SkeletonQuestionCard />
          <SkeletonQuestionCard />
        </div>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="bg-surface p-10 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] text-center">
        <p className="text-gray-500 mb-4">Assessment not found.</p>
        <button
          onClick={() => router.push("/faculty/assessments")}
          className="px-6 py-2 bg-brand-600 text-white rounded-lg"
        >
          Back to Question Bank
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push("/faculty/assessments")}
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 shrink-0"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {editingDetails ? (
            <div className="space-y-3">
              <input
                value={detailForm.title}
                onChange={(e) => setDetailForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Title"
                className={inputClassName}
              />
              <textarea
                value={detailForm.description}
                onChange={(e) => setDetailForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Description"
                className={inputClassName}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={detailForm.difficulty}
                  onChange={(e) => setDetailForm((f) => ({ ...f, difficulty: e.target.value }))}
                  className={inputClassName}
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                <select
                  value={detailForm.category}
                  onChange={(e) => setDetailForm((f) => ({ ...f, category: e.target.value }))}
                  className={inputClassName}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={detailForm.time_limit_minutes}
                  onChange={(e) => setDetailForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
                  placeholder="Time limit (min)"
                  className={inputClassName}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveDetails}
                  disabled={savingDetails}
                  className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-[#155663] disabled:opacity-60 transition-colors"
                >
                  {savingDetails ? (
                    <><FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" /> Saving…</>
                  ) : (
                    <><FontAwesomeIcon icon={faCheck} className="w-4 h-4" /> Save</>
                  )}
                </button>
                <button
                  onClick={() => setEditingDetails(false)}
                  className="px-5 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-gray-900 truncate">{assessment.title}</h1>
                <p className="text-sm text-gray-500">
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{assessment.category}</span>{" "}
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    assessment.difficulty === "beginner" ? "bg-green-100 text-green-700" :
                    assessment.difficulty === "intermediate" ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>{assessment.difficulty}</span>{" "}
                  {assessment.question_count} question{assessment.question_count !== 1 ? "s" : ""}
                  {assessment.time_limit_seconds &&
                    ` · ${Math.round(assessment.time_limit_seconds / 60)} min limit`}
                </p>
                {assessment.description && (
                  <p className="text-sm text-gray-600 mt-1">{assessment.description}</p>
                )}
              </div>
              <button
                onClick={() => setEditingDetails(true)}
                title="Edit details"
                className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 shrink-0"
              >
                <FontAwesomeIcon icon={faPen} className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Criteria section */}
      <div className="bg-surface rounded-xl border border-gray-200 shadow-sm">
        <button
          onClick={() => setShowCriteriaEditor(!showCriteriaEditor)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4 text-brand-600" />
            <span className="font-semibold text-gray-800">
              Scoring Criteria ({criteria.length})
            </span>
          </div>
          <FontAwesomeIcon
            icon={faChevronDown}
            className={`w-4 h-4 text-gray-400 transition-transform ${
              showCriteriaEditor ? "rotate-180" : ""
            }`}
          />
        </button>

        {showCriteriaEditor && (
          <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
            {criteria.length > 0 && (
              <div className="space-y-2">
                {criteria.map((c, i) => {
                  const comp = competencyAreas.find((x) => x.id === c.competency_id);
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <span className="text-sm font-medium text-gray-500 w-6">{i + 1}.</span>
                      <span className="text-sm text-gray-800 flex-1">{c.name}</span>
                      <span className="text-xs text-gray-500 w-40 truncate">
                        {comp?.name ?? c.competency_id.slice(0, 8)}
                      </span>
                      <span className="text-sm font-semibold text-brand-600 w-16 text-right">
                        {c.weight}%
                      </span>
                      <button
                        onClick={() => deleteCriteria(c.id)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 p-3 text-sm font-semibold text-gray-700">
                  <span className="w-6" />
                  <span className="flex-1">Total</span>
                  <span className="w-40" />
                  <span className={`w-16 text-right ${totalWeight === 100 ? "text-green-600" : "text-red-500"}`}>
                    {totalWeight}%
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                value={newCriterionName}
                onChange={(e) => setNewCriterionName(e.target.value)}
                placeholder="Criteria name"
                className={inputClassName}
              />
              <input
                type="number"
                min={1}
                max={100}
                value={newCriterionWeight}
                onChange={(e) => setNewCriterionWeight(e.target.value)}
                placeholder="Weight %"
                className={inputClassName}
              />
              <select
                value={newCriterionCompetency}
                onChange={(e) => setNewCriterionCompetency(e.target.value)}
                className={inputClassName}
              >
                <option value="">Select competency</option>
                {competencyAreas.map((ca) => (
                  <option key={ca.id} value={ca.id}>
                    {ca.name}
                  </option>
                ))}
              </select>
              <button
                onClick={addCriteria}
                className="px-4 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-[#155663] transition-colors"
              >
                Add Criteria
              </button>
            </div>

            {totalWeight !== 100 && criteria.length > 0 && (
              <p className="text-xs text-red-500">
                Weights total {totalWeight}% — they should sum to 100%
              </p>
            )}
          </div>
        )}
      </div>

      {message && (
        <div className="bg-brand-600/10 border border-brand-600/30 text-[#155663] px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      {/* Question builder */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">
            Questions ({questions.length})
          </h2>
        </div>

        {questions.length === 0 ? (
          <div className="bg-surface p-8 rounded-xl border border-dashed border-gray-300 text-center text-gray-400 text-sm">
            No questions yet. Click &quot;Add Question&quot; to start building.
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, i) => {
              const form = questionBuilders[q.id];
              if (!form) return null;
              const isEditing = editingQuestions.has(q.id);
              return (
                <div
                  key={q.id}
                  className={`bg-surface rounded-xl border shadow-sm ${isEditing ? "border-brand-600/40 ring-1 ring-brand-600/20" : "border-gray-200"}`}
                >
                  <div className="p-4 space-y-2">
                    {/* Question header */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-500 bg-gray-100 w-7 h-7 rounded-full flex items-center justify-center">
                          {i + 1}
                        </span>
                        <select
                          value={form.question_type}
                          onChange={(e) =>
                            updateBuilderField(
                              q.id,
                              "question_type",
                              e.target.value,
                            )
                          }
                          disabled={!isEditing}
                          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="multiple_choice">Multiple choice</option>
                          <option value="true_false">True / False</option>
                          <option value="short_answer">Short answer</option>
                        </select>
                        {isEditing && dirtyQuestions.has(q.id) && (
                          <button
                            onClick={() => {
                              setSavingQuestions((prev) => ({ ...prev, [q.id]: true }));
                              handleSaveQuestion(q.id).finally(() =>
                                setSavingQuestions((prev) => ({ ...prev, [q.id]: false }))
                              );
                            }}
                            disabled={savingQuestions[q.id]}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-[#155663] disabled:opacity-60 transition-colors"
                          >
                            {savingQuestions[q.id] ? (
                              <FontAwesomeIcon icon={faSpinner} spin className="w-3.5 h-3.5" />
                            ) : (
                              <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5" />
                            )}
                            Save Changes
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDuplicateQuestion(q.id)}
                          title="Duplicate"
                          className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs font-medium"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => toggleEdit(q.id)}
                          title={isEditing ? "Done editing" : "Edit question"}
                          className={`p-2 rounded-lg border transition-colors ${
                            isEditing
                              ? "bg-brand-600 text-white border-brand-600 hover:bg-[#155663]"
                              : "border-gray-200 text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          <FontAwesomeIcon icon={faPen} className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          title="Delete"
                          className="p-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                        >
                          <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Question text */}
                    <textarea
                      value={form.content}
                      onChange={(e) =>
                        updateBuilderField(q.id, "content", e.target.value)
                      }
                      disabled={!isEditing}
                      placeholder="Question text"
                      rows={2}
                      className={`${inputClassName} disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50`}
                    />

                    {/* Options */}
                    {form.question_type === "multiple_choice" && (
                      <div className="space-y-2">
                        {form.options.map((opt, idx) => (
                          <div key={idx} className={`flex items-center gap-3 ${!isEditing ? "opacity-60" : ""}`}>
                            <button
                              onClick={() => isEditing && setBuilderCorrect(q.id, idx)}
                              title={
                                idx === form.correct_index
                                  ? "Correct answer"
                                  : "Mark as correct"
                              }
                              className={`shrink-0 ${!isEditing ? "cursor-default" : ""}`}
                              tabIndex={isEditing ? 0 : -1}
                            >
                              {idx === form.correct_index ? (
                                <FontAwesomeIcon
                                  icon={faCheck}
                                  className="w-5 h-5 text-green-600"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                              )}
                            </button>
                            <input
                              value={opt}
                              onChange={(e) =>
                                isEditing && updateBuilderOption(q.id, idx, e.target.value)
                              }
                              placeholder={`Option ${idx + 1}`}
                              disabled={!isEditing}
                              className={`${inputClassName} disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50`}
                            />
                            {form.options.length > 2 && (
                              <button
                                onClick={() => isEditing && removeBuilderOption(q.id, idx)}
                                disabled={!isEditing}
                                className="text-gray-400 hover:text-red-500 shrink-0 disabled:opacity-30"
                              >
                                <FontAwesomeIcon
                                  icon={faTimes}
                                  className="w-4 h-4"
                                />
                              </button>
                            )}
                          </div>
                        ))}
                        {isEditing && (
                          <button
                            onClick={() => addBuilderOption(q.id)}
                            className="text-sm text-brand-600 font-medium hover:underline"
                          >
                            + Add option
                          </button>
                        )}
                      </div>
                    )}

                    {/* True / False */}
                    {form.question_type === "true_false" && (
                      <div className="space-y-2">
                        {["True", "False"].map((label, idx) => (
                          <div key={idx} className={`flex items-center gap-3 ${!isEditing ? "opacity-60" : ""}`}>
                            <button
                              onClick={() => isEditing && setBuilderCorrect(q.id, idx)}
                              className={`shrink-0 ${!isEditing ? "cursor-default" : ""}`}
                              tabIndex={isEditing ? 0 : -1}
                            >
                              {idx === form.correct_index ? (
                                <FontAwesomeIcon
                                  icon={faCheck}
                                  className="w-5 h-5 text-green-600"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                              )}
                            </button>
                            <span className={`text-sm ${isEditing ? "text-gray-700" : "text-gray-400"}`}>
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Short answer */}
                    {form.question_type === "short_answer" && (
                      <p className={`text-sm italic ${isEditing ? "text-gray-400" : "text-gray-300"}`}>
                        Students will type a free-text response. Correct answer
                        matching is configured in the answer key.
                      </p>
                    )}

                    {/* Answer key row */}
                    <div className={`flex items-center gap-3 pt-2 border-t ${isEditing ? "border-gray-100" : "border-gray-50"} flex-wrap`}>
                      <div className="flex items-center gap-2">
                        <label className={`text-sm font-medium ${isEditing ? "text-gray-600" : "text-gray-400"}`}>
                          Points
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={form.points}
                          onChange={(e) =>
                            isEditing &&
                            updateBuilderField(
                              q.id,
                              "points",
                              Math.max(1, Number(e.target.value)),
                            )
                          }
                          disabled={!isEditing}
                          className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className={`text-sm font-medium ${isEditing ? "text-gray-600" : "text-gray-400"}`}>
                          Competency
                        </label>
                        <select
                          value={form.competency_ids[0] ?? ""}
                          onChange={(e) =>
                            isEditing &&
                            updateBuilderField(q.id, "competency_ids", e.target.value ? [e.target.value] : [])
                          }
                          disabled={!isEditing}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
                        >
                          <option value="">No competency</option>
                          {competencyAreas.map((ca) => (
                            <option key={ca.id} value={ca.id}>
                              {ca.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {form.explanation && (
                        <span className={`text-xs ${isEditing ? "text-gray-400" : "text-gray-300"}`}>
                          Has answer explanation
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showAIPanel && (
          <div className="bg-surface rounded-xl border border-brand-600/30 shadow-sm p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faWandMagicSparkles} className="w-4 h-4 text-brand-600" />
                <span className="font-semibold text-gray-800">Generate questions with AI</span>
              </div>
              <button
                onClick={() => setShowAIPanel(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
              <input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder={`Optional focus, e.g. "priority nursing interventions" (defaults to ${assessment.category})`}
                className={inputClassName}
                disabled={aiGenerating}
              />
              <select
                value={aiCount}
                onChange={(e) => setAiCount(Number(e.target.value))}
                className={inputClassName}
                disabled={aiGenerating}
              >
                {[3, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} questions
                  </option>
                ))}
              </select>
              <button
                onClick={handleGenerateAI}
                disabled={aiGenerating}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-[#155663] disabled:opacity-60 transition-colors"
              >
                {aiGenerating ? (
                  <><FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" /> Generating…</>
                ) : (
                  <><FontAwesomeIcon icon={faWandMagicSparkles} className="w-4 h-4" /> Generate</>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Generated questions are added as unsaved drafts — review, edit, and save each one before it reaches students.
            </p>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
          <button
            onClick={handleAddQuestion}
            className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-[#155663] transition-colors"
          >
            <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
            Add Question
          </button>
          {questions.filter((q) => q.id.startsWith("new_")).length > 0 && (
            <button
              onClick={handleSaveAll}
              disabled={savingAll}
              className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-[#155663] disabled:opacity-60 transition-colors"
            >
              {savingAll ? (
                <><FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" /> Saving All…</>
              ) : (
                <><FontAwesomeIcon icon={faCheck} className="w-4 h-4" /> Save All</>
              )}
            </button>
          )}
          <button
            onClick={() => setShowAIPanel((v) => !v)}
            className="flex items-center gap-2 px-6 py-3 bg-surface border border-brand-600 text-brand-600 rounded-xl text-sm font-medium hover:bg-brand-600/5 transition-colors"
          >
            <FontAwesomeIcon icon={faWandMagicSparkles} className="w-4 h-4" />
            Generate with AI
          </button>
          <button
            onClick={() => csvInputRef.current?.click()}
            title='CSV columns: content, options (separated by |), correct (option number or "true"/"false"), type, points, explanation, competency'
            className="flex items-center gap-2 px-6 py-3 bg-surface border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <FontAwesomeIcon icon={faFileImport} className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={downloadCsvTemplate}
            className="text-sm text-gray-500 hover:text-brand-600 hover:underline"
          >
            CSV template
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportCsv(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}
