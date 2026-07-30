"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { SkeletonQuestionCard } from "../../../components/skeletons";
import { toast } from "../../../components/Toast";
import ConfirmModal from "../../../components/ConfirmModal";
import { fetchSections, type Section } from "../../../lib/api";

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
  /** How many questions one attempt serves; null serves the whole bank. */
  total_questions: number | null;
  /** Retakes allowed; null is unlimited. */
  max_attempts: number | null;
  /** Section names this is published to; null/empty reaches every section. */
  target_sections: string[] | null;
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
  /** The criterion that owns this question. Unassigned questions are never served. */
  criteria_id: string | null;
}

type QuestionFormData = {
  content: string;
  options: string[];
  correct_index: number;
  question_type: string;
  points: number;
  explanation: string;
  competency_ids: string[];
  criteria_id: string | null;
};

interface AssessmentCriteria {
  id: string;
  assessment_id: string;
  name: string;
  weight: number;
  competency_id: string;
  sort_order: number;
  /** Questions from this criterion that every attempt must include. */
  min_questions: number;
}

/** Mirrors PublishBlocker in app/lib/assessment-validation.ts. */
interface PublishBlocker {
  code: string;
  message: string;
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
  criteria_id: null,
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
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => void; loading?: boolean; error?: string | null } | null>(null);

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
  const [newCriterionMin, setNewCriterionMin] = useState("1");
  const [blockers, setBlockers] = useState<PublishBlocker[]>([]);

  // inline detail editing
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailForm, setDetailForm] = useState({ title: "", description: "", difficulty: "beginner", category: "General", time_limit_minutes: "", total_questions: "", max_attempts: "", target_sections: [] as string[] });
  const [savingDetails, setSavingDetails] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);

  const toggleTargetSection = (name: string) =>
    setDetailForm((f) => ({
      ...f,
      target_sections: f.target_sections.includes(name)
        ? f.target_sections.filter((s) => s !== name)
        : [...f.target_sections, name],
    }));

  /** Targeted names with no section behind them any more (deleted section). */
  const staleTargetSections =
    sections.length === 0
      ? []
      : detailForm.target_sections.filter((name) => !sections.some((s) => s.name === name));

  const handleSaveDetails = async () => {
    if (!detailForm.title.trim()) {
      toast("Title is required");
      return;
    }
    // Blank means "no limit" for both of these, which is a real setting rather
    // than a missing one: no cap on retakes, and serve the whole bank.
    const totalQuestions = detailForm.total_questions ? Number(detailForm.total_questions) : null;
    const maxAttempts = detailForm.max_attempts ? Number(detailForm.max_attempts) : null;

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
        total_questions: totalQuestions,
        max_attempts: maxAttempts,
        // Sent every save, so unchecking every section puts the quiz back in
        // front of all of them.
        target_sections: detailForm.target_sections,
      }),
    });
    setSavingDetails(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      toast(j?.error ?? "Failed to save details");
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
        total_questions: totalQuestions,
        max_attempts: maxAttempts,
        target_sections: detailForm.target_sections.length > 0 ? detailForm.target_sections : null,
      } : prev
    );
    setEditingDetails(false);
    toast("Assessment details updated");
    // The paper size feeds publish validation, so re-read what still blocks it.
    loadData();
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
          assessment: { questions: AssessmentQuestion[]; title: string; description: string; difficulty: string; category: string; time_limit_seconds: number | null; question_count: number; total_questions: number | null; max_attempts: number | null; target_sections: string[] | null };
          blockers?: PublishBlocker[];
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
          total_questions: a.total_questions ?? null,
          max_attempts: a.max_attempts ?? null,
          target_sections: a.target_sections ?? null,
        });
        setDetailForm({
          title: a.title,
          description: a.description ?? "",
          difficulty: a.difficulty,
          category: a.category,
          time_limit_minutes: a.time_limit_seconds ? String(Math.round(a.time_limit_seconds / 60)) : "",
          total_questions: a.total_questions ? String(a.total_questions) : "",
          max_attempts: a.max_attempts ? String(a.max_attempts) : "",
          target_sections: a.target_sections ?? [],
        });
        setBlockers(json.blockers ?? []);
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
            criteria_id: q.criteria_id ?? null,
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

  useEffect(() => {
    fetchSections().then(setSections);
  }, []);

  /**
   * Re-read just what stands between this assessment and being publishable.
   * Coverage shifts on almost every edit — assigning a question, changing a
   * minimum, adding a criterion — and finding out at the publish button is too
   * late to be useful.
   */
  const refreshBlockers = useCallback(async () => {
    try {
      const res = await fetch(`/api/faculty/assessments/${assessmentId}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { blockers?: PublishBlocker[] };
      setBlockers(json.blockers ?? []);
    } catch {
      // Advisory only — a failed refresh must not interrupt editing.
    }
  }, [assessmentId]);

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
      toast("Question needs content and at least two options");
      return;
    }
    if (form.correct_index >= filledOptions.length) {
      toast("Mark one of the filled options as correct");
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
      criteria_id: form.criteria_id,
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
      toast(j.error ?? "Failed to save question");
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
    toast(isNew ? "Question added" : "Question updated");
    // Assigning or unassigning a question changes what a criterion can cover.
    refreshBlockers();
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
    setConfirmAction({
      title: "Delete Question",
      message: "Delete this question permanently? This can't be undone.",
      action: async () => {
        setConfirmAction((prev) => prev ? { ...prev, loading: true, error: null } : null);
        const res = await fetch(`/api/faculty/questions/${qId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          setConfirmAction((prev) => prev ? { ...prev, loading: false, error: "Failed to delete question. Please try again." } : null);
          return;
        }
        setQuestions((prev) => prev.filter((q) => q.id !== qId));
        setQuestionBuilders((prev) => {
          const { [qId]: _, ...rest } = prev;
          return rest;
        });
        setConfirmAction(null);
        toast("Question deleted");
      },
    });
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
        criteria_id: form.criteria_id,
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
      criteria_id: null,
    };
    setQuestions((prev) => [...prev, newQ]);
    setQuestionBuilders((prev) => ({
      ...prev,
      [newId]: { ...emptyQuestionForm, options: ["", ""] },
    }));
  };

  /**
   * The criterion a competency implies, when it implies exactly one.
   *
   * Imported and generated questions arrive tagged with a competency, not a
   * criterion. Where a single criterion uses that competency the mapping is
   * unambiguous and worth making automatically; where several do, guessing is
   * what produced the double-counting this whole change removes, so the
   * question is left unassigned for someone to place.
   */
  const criterionForCompetency = useCallback(
    (competencyId: string | undefined): string | null => {
      if (!competencyId) return null;
      const matches = criteria.filter((c) => c.competency_id === competencyId);
      return matches.length === 1 ? matches[0].id : null;
    },
    [criteria],
  );

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
        toast(json.error ?? "Failed to generate questions");
        return;
      }
      // The generator tags questions by competency; place the ones whose
      // competency points at exactly one criterion.
      appendDraftQuestions(
        json.questions.map((q) => ({
          ...q,
          criteria_id: q.criteria_id ?? criterionForCompetency(q.competency_ids?.[0]),
        })),
      );
      setShowAIPanel(false);
      toast(
        `Generated ${json.questions.length} draft question${json.questions.length !== 1 ? "s" : ""} — review and save each one`,
      );
    } catch {
      toast("Failed to generate questions");
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
      toast("CSV needs a header row and at least one question row");
      return;
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const contentCol = col("content");
    if (contentCol === -1) {
      toast('CSV header must include a "content" column — download the template for the format');
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
        criteria_id: criterionForCompetency(competencyId),
      });
    }

    appendDraftQuestions(drafts);
    toast(
      drafts.length === 0
        ? "No valid questions found in the CSV — download the template for the format"
        : `Imported ${drafts.length} draft question${drafts.length !== 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} row${skipped !== 1 ? "s" : ""} skipped)` : ""} — review and save`,
    );
  };

  // ---------- save all ----------

  const handleSaveAll = async () => {
    const unsaved = questions.filter((q) => q.id.startsWith("new_"));
    if (unsaved.length === 0) {
      toast("No unsaved questions");
      return;
    }
    setSavingAll(true);
    for (const q of unsaved) {
      await handleSaveQuestion(q.id);
    }
    setSavingAll(false);
    toast("All questions saved");
  };

  // ---------- criteria CRUD ----------

  const addCriteria = async () => {
    if (!newCriterionName.trim() || !newCriterionWeight || !newCriterionCompetency) {
      toast("Fill in all criteria fields");
      return;
    }
    const weight = Number(newCriterionWeight);
    if (isNaN(weight) || weight <= 0 || weight > 100) {
      toast("Weight must be between 1 and 100");
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
        min_questions: Number(newCriterionMin) || 0,
      }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      toast(j.error ?? "Failed to add criteria");
      return;
    }
    const j = (await res.json()) as { criteria: AssessmentCriteria };
    setCriteria((prev) => [...prev, j.criteria]);
    setNewCriterionName("");
    setNewCriterionWeight("");
    setNewCriterionCompetency("");
    setNewCriterionMin("1");
    refreshBlockers();
  };

  /** Persist a criterion's minimum; the field is the only inline-editable one. */
  const updateCriterionMin = async (id: string, value: number) => {
    const previous = criteria.find((c) => c.id === id)?.min_questions ?? 1;
    setCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, min_questions: value } : c)),
    );
    const res = await fetch(`/api/faculty/assessment-criteria/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ min_questions: value }),
    });
    if (!res.ok) {
      setCriteria((prev) =>
        prev.map((c) => (c.id === id ? { ...c, min_questions: previous } : c)),
      );
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      toast(j?.error ?? "Failed to update minimum");
      return;
    }
    refreshBlockers();
  };

  const deleteCriteria = async (id: string) => {
    // The questions survive but come back unassigned, and an unassigned
    // question is never served — worth saying before, not after.
    const owned = questions.filter((q) => q.criteria_id === id).length;
    setConfirmAction({
      title: "Remove Criteria",
      message:
        owned > 0
          ? `Remove this criteria permanently? Its ${owned} question${owned === 1 ? "" : "s"} will become unassigned and won't be served until you give ${owned === 1 ? "it" : "them"} a new criteria.`
          : "Remove this criteria permanently? This can't be undone.",
      action: async () => {
        setConfirmAction((prev) => prev ? { ...prev, loading: true, error: null } : null);
        const res = await fetch(`/api/faculty/assessment-criteria/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          setConfirmAction((prev) => prev ? { ...prev, loading: false, error: "Failed to remove criteria. Please try again." } : null);
          return;
        }
        setCriteria((prev) => prev.filter((c) => c.id !== id));
        setConfirmAction(null);
        toast("Criteria removed");
        // The server nulled criteria_id on its questions; re-read rather than
        // guess which ones.
        loadData();
      },
    });
  };

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);

  /** Questions each criterion owns, plus the ones nothing owns. */
  const questionsByCriterion = useMemo(() => {
    const map = new Map<string, AssessmentQuestion[]>();
    for (const c of criteria) map.set(c.id, []);
    const unassigned: AssessmentQuestion[] = [];
    for (const q of questions) {
      const bucket = q.criteria_id ? map.get(q.criteria_id) : undefined;
      if (bucket) bucket.push(q);
      else unassigned.push(q);
    }
    return { map, unassigned };
  }, [criteria, questions]);

  const servedTotal = assessment?.total_questions ?? null;

  /**
   * The question list, grouped under its criteria.
   *
   * Flattened with header entries rather than nested lists so the existing
   * two-column grid still lines the cards up; a header just spans both columns.
   * Numbering stays global so a question keeps the same label wherever it sits.
   */
  const questionList = useMemo(() => {
    const indexOf = new Map(questions.map((q, i) => [q.id, i]));
    type Entry =
      | { kind: "header"; id: string; criterion: AssessmentCriteria | null; count: number }
      | { kind: "question"; id: string; question: AssessmentQuestion; index: number };

    const entries: Entry[] = [];
    if (questionsByCriterion.unassigned.length > 0) {
      entries.push({
        kind: "header",
        id: "h_unassigned",
        criterion: null,
        count: questionsByCriterion.unassigned.length,
      });
      for (const q of questionsByCriterion.unassigned) {
        entries.push({ kind: "question", id: q.id, question: q, index: indexOf.get(q.id) ?? 0 });
      }
    }
    for (const c of criteria) {
      const owned = questionsByCriterion.map.get(c.id) ?? [];
      entries.push({ kind: "header", id: `h_${c.id}`, criterion: c, count: owned.length });
      for (const q of owned) {
        entries.push({ kind: "question", id: q.id, question: q, index: indexOf.get(q.id) ?? 0 });
      }
    }
    return entries;
  }, [criteria, questions, questionsByCriterion]);

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <header className="relative overflow-hidden bg-surface rounded-2xl border border-hairline shadow-tile p-4 sm:p-5">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(70% 130% at 100% 0%, rgb(27 107 123 / 0.07) 0%, transparent 70%)" }} />
        <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-brand-400 via-brand-600 to-brand-800" />
        <div className="relative flex items-start gap-4">
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
                  <input
                    type="number"
                    min={1}
                    value={detailForm.total_questions}
                    onChange={(e) => setDetailForm((f) => ({ ...f, total_questions: e.target.value }))}
                    placeholder="Questions per attempt"
                    title="How many questions each attempt serves. Leave blank to serve every question."
                    className={inputClassName}
                  />
                  <input
                    type="number"
                    min={1}
                    value={detailForm.max_attempts}
                    onChange={(e) => setDetailForm((f) => ({ ...f, max_attempts: e.target.value }))}
                    placeholder="Attempts allowed"
                    title="How many times a student may sit this quiz. Leave blank for unlimited."
                    className={inputClassName}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Leave <span className="font-medium">Questions per attempt</span> blank to serve every
                  question, and <span className="font-medium">Attempts allowed</span> blank for unlimited
                  retakes. Holding questions back is what lets a retake show a student ones they
                  haven&apos;t seen.
                </p>
                <div>
                  <label className={labelClassName}>Published to sections</label>
                  {sections.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No sections exist yet — this assessment reaches every student.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {sections.map((s) => {
                        const checked = detailForm.target_sections.includes(s.name);
                        return (
                          <label
                            key={s.id}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                              checked
                                ? "border-brand-600 bg-brand-600/10 text-brand-700 dark:text-white"
                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTargetSection(s.name)}
                              className="w-4 h-4 accent-brand-600"
                            />
                            Section {s.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {/* Deleting a section leaves its name behind here, and a name
                      with no section left to match hides the quiz from a
                      cohort that no longer exists. Surfaced so it can be
                      dropped — it has no checkbox to untick. */}
                  {staleTargetSections.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {staleTargetSections.map((name) => (
                        <button
                          key={name}
                          onClick={() => toggleTargetSection(name)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100"
                          title="This section no longer exists — remove it"
                        >
                          Section {name}
                          <span className="text-xs">(deleted)</span>
                          <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1.5">
                    Change these any time — students outside the checked sections stop seeing the
                    quiz. Leave every box unchecked to publish to all sections.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveDetails}
                    disabled={savingDetails}
                    className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors"
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
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="font-display text-[26px] sm:text-[31px] font-semibold leading-[1.08] tracking-[-0.015em] text-gray-900 truncate">{assessment.title}</h1>
                    {blockers.length === 0 ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold whitespace-nowrap shrink-0">
                        <FontAwesomeIcon icon={faCheck} className="w-3 h-3 mr-1" />
                        Ready
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold whitespace-nowrap shrink-0">
                        <FontAwesomeIcon icon={faTriangleExclamation} className="w-3 h-3 mr-1" />
                        {blockers.length} issue{blockers.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{assessment.category}</span>{" "}
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      assessment.difficulty === "beginner" ? "bg-green-100 text-green-700" :
                      assessment.difficulty === "intermediate" ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    }`}>{assessment.difficulty}</span>{" "}
                    {assessment.question_count} question{assessment.question_count !== 1 ? "s" : ""}
                    {assessment.time_limit_seconds &&
                      ` · ${Math.round(assessment.time_limit_seconds / 60)} min limit`}
                  </p>
                  {assessment.description && (
                    <p className="text-sm text-gray-600 mt-1">{assessment.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                    <span>
                      {assessment.target_sections && assessment.target_sections.length > 0
                        ? `Published to ${assessment.target_sections.map((name) => `Section ${name}`).join(", ")}`
                        : "Published to all sections"}
                    </span>
                    {blockers.length === 0 && (
                      <span>
                        · Each attempt serves {servedTotal ?? questions.length - questionsByCriterion.unassigned.length} question
                        {(servedTotal ?? questions.length) === 1 ? "" : "s"} across {criteria.length} criteria
                        {assessment.max_attempts
                          ? `, up to ${assessment.max_attempts} attempt${assessment.max_attempts === 1 ? "" : "s"} per student`
                          : ", unlimited retakes"}
                      </span>
                    )}
                  </div>
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
      </header>

      {blockers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm font-semibold text-amber-800">
                Fix these before students can take this quiz
              </p>
              {blockers.map((b) => (
                <p key={b.code + b.message} className="text-xs text-amber-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  {b.message}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

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
                <div className="flex items-center gap-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <span className="w-6" />
                  <span className="flex-1">Criteria</span>
                  <span className="w-32">Competency</span>
                  <span className="w-16 text-right" title="Questions assigned to this criteria">Pool</span>
                  <span className="w-16 text-right" title="Questions from this criteria every attempt must include">Min</span>
                  <span className="w-16 text-right">Weight</span>
                  <span className="w-6" />
                </div>
                {criteria.map((c, i) => {
                  const comp = competencyAreas.find((x) => x.id === c.competency_id);
                  const pool = questionsByCriterion.map.get(c.id)?.length ?? 0;
                  const starved = pool < c.min_questions;
                  return (
                    <div
                      key={c.id}
                      className={`flex items-center gap-3 p-3 rounded-lg ${starved ? "bg-red-50 ring-1 ring-red-200" : "bg-gray-50"}`}
                    >
                      <span className="text-sm font-medium text-gray-500 w-6">{i + 1}.</span>
                      <span className="text-sm text-gray-800 flex-1">{c.name}</span>
                      <span className="text-xs text-gray-500 w-32 truncate">
                        {comp?.name ?? c.competency_id.slice(0, 8)}
                      </span>
                      <span
                        className={`text-sm w-16 text-right font-semibold ${starved ? "text-red-600" : "text-gray-700"}`}
                        title={starved ? `Only ${pool} question(s) for a minimum of ${c.min_questions}` : undefined}
                      >
                        {pool}
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={c.min_questions}
                        onChange={(e) => updateCriterionMin(c.id, Math.max(0, Number(e.target.value) || 0))}
                        title="Minimum questions per attempt"
                        className="w-16 px-2 py-1 text-sm text-right border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                      />
                      <span className="text-sm font-semibold text-brand-600 w-16 text-right">
                        {c.weight}%
                      </span>
                      <button
                        onClick={() => deleteCriteria(c.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 p-3 text-sm font-semibold text-gray-700">
                  <span className="w-6" />
                  <span className="flex-1">Total</span>
                  <span className="w-32" />
                  <span className="w-16 text-right">{questions.length - questionsByCriterion.unassigned.length}</span>
                  <span className={`w-16 text-right ${servedTotal !== null && criteria.reduce((s, c) => s + Math.min(c.min_questions, questionsByCriterion.map.get(c.id)?.length ?? 0), 0) > servedTotal ? "text-red-600" : ""}`}>
                    {criteria.reduce((s, c) => s + Math.min(c.min_questions, questionsByCriterion.map.get(c.id)?.length ?? 0), 0)}
                  </span>
                  <span className={`w-16 text-right ${totalWeight === 100 ? "text-green-600" : "text-red-600"}`}>
                    {totalWeight}%
                  </span>
                  <span className="w-6" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
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
              <input
                type="number"
                min={0}
                value={newCriterionMin}
                onChange={(e) => setNewCriterionMin(e.target.value)}
                placeholder="Min questions"
                title="Minimum questions per attempt"
                className={inputClassName}
              />
              <button
                onClick={addCriteria}
                className="px-4 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
              >
                Add Criteria
              </button>
            </div>

            {totalWeight !== 100 && criteria.length > 0 && (
              <p className="text-xs text-red-600">
                Weights total {totalWeight}% — they should sum to 100%
              </p>
            )}
          </div>
        )}
      </div>

      {/* Question builder */}
      <div className="space-y-4">
        <header className="relative overflow-hidden bg-surface rounded-2xl border border-hairline shadow-tile p-4 sm:p-5">
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(70% 130% at 100% 0%, rgb(27 107 123 / 0.07) 0%, transparent 70%)" }} />
          <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-brand-400 via-brand-600 to-brand-800" />
          <div className="relative">
            <h2 className="font-display text-lg sm:text-xl font-bold text-gray-900">
              Questions ({questions.length})
            </h2>
          </div>
        </header>

        {questions.length === 0 ? (
          <div className="bg-surface p-8 rounded-xl border border-dashed border-gray-300 text-center text-gray-400 text-sm">
            No questions yet. Click &quot;Add Question&quot; to start building.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {questionList.map((entry) => {
              if (entry.kind === "header") {
                const c = entry.criterion;
                const min = c?.min_questions ?? 0;
                const short = c ? entry.count < min : false;
                return (
                  <div
                    key={entry.id}
                    className={`md:col-span-2 flex items-center gap-2 pt-2 pb-1 border-b ${
                      c ? "border-gray-200" : "border-amber-200"
                    }`}
                  >
                    <FontAwesomeIcon
                      icon={c ? faLayerGroup : faTriangleExclamation}
                      className={`w-3.5 h-3.5 ${c ? "text-brand-600" : "text-amber-600"}`}
                    />
                    <span className={`text-sm font-semibold ${c ? "text-gray-800" : "text-amber-800"}`}>
                      {c ? c.name : "Unassigned"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {entry.count} question{entry.count === 1 ? "" : "s"}
                      {c && ` · min ${min} · weight ${c.weight}%`}
                    </span>
                    {short && (
                      <span className="text-xs font-medium text-red-600">
                        needs {min - entry.count} more
                      </span>
                    )}
                    {!c && (
                      <span className="text-xs text-amber-800">
                        never served — give each one a criteria
                      </span>
                    )}
                  </div>
                );
              }

              const q = entry.question;
              const i = entry.index;
              const form = questionBuilders[q.id];
              if (!form) return null;
              const isEditing = editingQuestions.has(q.id);
              return (
                <div
                  key={q.id}
                  className={`bg-surface rounded-xl border shadow-sm flex flex-col ${isEditing ? "border-brand-600/40 ring-1 ring-brand-600/20" : "border-gray-200"}`}
                >
                  <div className="p-4 flex-1 space-y-2">
                    {/* Question header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-gray-500 bg-gray-100 w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <select
                          value={form.question_type}
                          onChange={(e) =>
                            updateBuilderField(q.id, "question_type", e.target.value)
                          }
                          disabled={!isEditing}
                          className="text-xs border border-gray-300 rounded-lg px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="multiple_choice">Multiple choice</option>
                          <option value="true_false">True / False</option>
                          <option value="short_answer">Short answer</option>
                        </select>
                      </div>
                      {isEditing && dirtyQuestions.has(q.id) && (
                        <button
                          onClick={() => {
                            setSavingQuestions((prev) => ({ ...prev, [q.id]: true }));
                            handleSaveQuestion(q.id).finally(() =>
                              setSavingQuestions((prev) => ({ ...prev, [q.id]: false }))
                            );
                          }}
                          disabled={savingQuestions[q.id]}
                          className="flex items-center gap-1 px-2.5 py-1 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors shrink-0"
                        >
                          {savingQuestions[q.id] ? (
                            <FontAwesomeIcon icon={faSpinner} spin className="w-3 h-3" />
                          ) : (
                            <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />
                          )}
                          Save
                        </button>
                      )}
                    </div>

                    {/* Question text */}
                    <textarea
                      value={form.content}
                      onChange={(e) => updateBuilderField(q.id, "content", e.target.value)}
                      disabled={!isEditing}
                      placeholder="Question text"
                      rows={isEditing ? 2 : 1}
                      className={`${inputClassName} disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 text-sm`}
                    />

                    {/* Options */}
                    {form.question_type === "multiple_choice" && (
                      <div className="space-y-1.5">
                        {form.options.slice(0, isEditing ? undefined : 4).map((opt, idx) => (
                          <div key={idx} className={`flex items-center gap-2 ${!isEditing ? "opacity-60" : ""}`}>
                            <button
                              onClick={() => isEditing && setBuilderCorrect(q.id, idx)}
                              title={idx === form.correct_index ? "Correct answer" : "Mark as correct"}
                              className={`shrink-0 ${!isEditing ? "cursor-default" : ""}`}
                              tabIndex={isEditing ? 0 : -1}
                            >
                              {idx === form.correct_index ? (
                                <FontAwesomeIcon icon={faCheck} className="w-4 h-4 text-green-600" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                              )}
                            </button>
                            <input
                              value={opt}
                              onChange={(e) => isEditing && updateBuilderOption(q.id, idx, e.target.value)}
                              placeholder={`Option ${idx + 1}`}
                              disabled={!isEditing}
                              className="flex-1 px-3 py-1.5 bg-surface border border-gray-400 rounded-lg text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 transition-all"
                            />
                            {isEditing && form.options.length > 2 && (
                              <button
                                onClick={() => removeBuilderOption(q.id, idx)}
                                className="text-gray-400 hover:text-red-600 shrink-0"
                              >
                                <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        {!isEditing && form.options.length > 4 && (
                          <p className="text-xs text-gray-400">+{form.options.length - 4} more options</p>
                        )}
                        {isEditing && (
                          <button
                            onClick={() => addBuilderOption(q.id)}
                            className="text-xs text-brand-600 font-medium hover:underline"
                          >
                            + Add option
                          </button>
                        )}
                      </div>
                    )}

                    {/* True / False */}
                    {form.question_type === "true_false" && (
                      <div className="space-y-1.5">
                        {["True", "False"].map((label, idx) => (
                          <div key={idx} className={`flex items-center gap-2 ${!isEditing ? "opacity-60" : ""}`}>
                            <button
                              onClick={() => isEditing && setBuilderCorrect(q.id, idx)}
                              className={`shrink-0 ${!isEditing ? "cursor-default" : ""}`}
                              tabIndex={isEditing ? 0 : -1}
                            >
                              {idx === form.correct_index ? (
                                <FontAwesomeIcon icon={faCheck} className="w-4 h-4 text-green-600" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                              )}
                            </button>
                            <span className={`text-sm ${isEditing ? "text-gray-700" : "text-gray-400"}`}>{label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Short answer */}
                    {form.question_type === "short_answer" && (
                      <p className={`text-xs italic ${isEditing ? "text-gray-400" : "text-gray-300"}`}>
                        Students will type a free-text response.
                      </p>
                    )}
                  </div>

                  {/* Bottom bar — points, competency, actions */}
                  <div className="px-4 py-3 bg-subtle border-t border-hairline flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <label className={`text-xs font-medium ${isEditing ? "text-gray-600" : "text-gray-400"}`}>Points</label>
                        <input
                          type="number"
                          min={1}
                          value={form.points}
                          onChange={(e) =>
                            isEditing && updateBuilderField(q.id, "points", Math.max(1, Number(e.target.value)))
                          }
                          disabled={!isEditing}
                          className="w-14 px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className={`text-xs font-medium ${isEditing ? "text-gray-600" : "text-gray-400"}`}>Criteria</label>
                        <select
                          value={form.criteria_id ?? ""}
                          onChange={(e) => {
                            if (!isEditing) return;
                            const next = e.target.value || null;
                            updateBuilderField(q.id, "criteria_id", next);
                            // Keep the competency tag in step with the criteria
                            // that now owns the question — it is what the ML
                            // recommender reads.
                            const owner = criteria.find((c) => c.id === next);
                            if (owner) updateBuilderField(q.id, "competency_ids", [owner.competency_id]);
                          }}
                          disabled={!isEditing}
                          className={`px-2 py-1 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 ${
                            form.criteria_id
                              ? "border-gray-300 text-gray-700"
                              : "border-amber-200 text-amber-800 bg-amber-50"
                          }`}
                        >
                          <option value="">Unassigned</option>
                          {criteria.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className={`text-xs font-medium ${isEditing ? "text-gray-600" : "text-gray-400"}`}>Comp.</label>
                        <select
                          value={form.competency_ids[0] ?? ""}
                          onChange={(e) =>
                            isEditing && updateBuilderField(q.id, "competency_ids", e.target.value ? [e.target.value] : [])
                          }
                          disabled={!isEditing}
                          className="px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
                        >
                          <option value="">None</option>
                          {competencyAreas.map((ca) => (
                            <option key={ca.id} value={ca.id}>{ca.name}</option>
                          ))}
                        </select>
                      </div>
                      {form.explanation && (
                        <span className="text-xs text-gray-400">Has explanation</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDuplicateQuestion(q.id)}
                        title="Duplicate"
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                      >
                        <FontAwesomeIcon icon={faLayerGroup} className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleEdit(q.id)}
                        title={isEditing ? "Done editing" : "Edit question"}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          isEditing
                            ? "bg-brand-600 text-white border-brand-600 hover:bg-brand-700"
                            : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <FontAwesomeIcon icon={faPen} className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        title="Delete"
                        className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                      </button>
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
                className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors"
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
            className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
            Add Question
          </button>
          {questions.filter((q) => q.id.startsWith("new_")).length > 0 && (
            <button
              onClick={handleSaveAll}
              disabled={savingAll}
              className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors"
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

      {confirmAction && (
        <ConfirmModal
          config={{
            title: confirmAction.title,
            message: confirmAction.message,
            loading: confirmAction.loading,
            error: confirmAction.error,
            onConfirm: confirmAction.action,
          }}
          onClose={() => { if (!confirmAction.loading) setConfirmAction(null); }}
        />
      )}
    </div>
  );
}
