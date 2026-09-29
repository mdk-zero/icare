"use client";

import { DEFAULT_ATTEMPTS, MIN_ATTEMPTS } from "@/app/lib/quiz-attempts";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faTimes,
  faTrash,
  faCheck,
  faArrowLeft,
  faChartSimple,
  faPen,
  faLayerGroup,
  faChevronDown,
  faTriangleExclamation,
  faListCheck,
  faClock,
  faRotateRight,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { SkeletonQuestionCard } from "../../../components/skeletons";
import { toast } from "../../../components/Toast";
import ConfirmModal from "../../../components/ConfirmModal";
import { fetchSections, getCurrentUser, type Section, apiFetch } from "../../../lib/api";
import { takeDrafts } from "../draft-handoff";
import { EcgLoader } from "../../../components/EcgLoader";
import LiveClock from "../../../components/LiveClock";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";
/** A plainer, Google-Forms-like field style for the assessment's own detail
 * form — lighter than `inputClassName`, and scoped to just that form so the
 * question builder below keeps its usual weight. */
/** The centred column the whole page sits in, form-style. */
const formColumn = "mx-auto w-full max-w-6xl px-0 sm:px-4";

/** Form-style fields for the details editor: no box, a rule underneath that turns brand on focus. */
const underlineInput =
  "w-full border-0 border-b-2 border-gray-200 bg-transparent px-0 py-2 text-gray-900 placeholder:text-gray-400 transition-colors focus:border-brand-600 focus:outline-none focus:ring-0";
const underlineLabel = "block text-xs font-semibold text-gray-600";

/** An icon button with its name shown on hover and focus, like a form editor's toolbar. */
function IconAction({ label, icon, onClick }: { label: string; icon: typeof faPen; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group relative grid h-10 w-10 place-items-center rounded-full text-gray-500 transition-colors hover:bg-subtle hover:text-gray-900 focus-visible:bg-subtle focus-visible:outline-none"
    >
      <FontAwesomeIcon icon={icon} className="h-4 w-4" />
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full right-0 z-20 mt-1.5 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}


interface AssessmentDetail {
  id: string;
  created_by: string | null;
  title: string;
  description: string;
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

export default function AssessmentQuestionsClient({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const router = useRouter();
  const me = getCurrentUser();
  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  // Mirrors the server's guardAssessmentEdit: the creator may change it, and
  // so may an admin (the server also checks the admin owns the creator).
  // Everyone else views it read-only.
  const canEdit = !assessment || me?.role === "admin" || assessment.created_by === me?.id;
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
  // AI drafts handed over by the New Quiz page are picked up once.
  const draftsTakenRef = useRef(false);

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
  const [detailForm, setDetailForm] = useState({ title: "", description: "", category: "General", time_limit_minutes: "", max_attempts: "", target_sections: [] as string[] });
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
    // Every attempt always serves the whole bank now — no per-attempt cap to
    // set, so this is sent as null on every save (clearing out any value a
    // quiz was left with from before this control was removed).
    const totalQuestions = null;
    const maxAttempts = detailForm.max_attempts ? Number(detailForm.max_attempts) : null;

    setSavingDetails(true);
    const res = await apiFetch(`/api/faculty/assessments/${assessmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        title: detailForm.title.trim(),
        description: detailForm.description,
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
        category: detailForm.category,
        time_limit_seconds: detailForm.time_limit_minutes ? Number(detailForm.time_limit_minutes) * 60 : null,
        total_questions: totalQuestions,
        max_attempts: maxAttempts,
        target_sections: detailForm.target_sections.length > 0 ? detailForm.target_sections : null,
      } : prev
    );
    setEditingDetails(false);
    toast("Quiz details updated");
    // The paper size feeds publish validation, so re-read what still blocks it.
    loadData();
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assessRes, criteriaRes, compRes] = await Promise.all([
        apiFetch(`/api/faculty/assessments/${assessmentId}`, {
          credentials: "include",
        }),
        apiFetch(`/api/faculty/assessments/${assessmentId}/criteria`, {
          credentials: "include",
        }),
        apiFetch("/api/competencies", { credentials: "include" }),
      ]);

      if (assessRes.ok) {
        const json = (await assessRes.json()) as {
          assessment: { questions: AssessmentQuestion[]; created_by: string | null; title: string; description: string; category: string; time_limit_seconds: number | null; question_count: number; total_questions: number | null; max_attempts: number | null; target_sections: string[] | null };
          blockers?: PublishBlocker[];

        };
        const a = json.assessment;
        setAssessment({
          id: assessmentId,
          created_by: a.created_by ?? null,
          title: a.title,
          description: a.description,
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
          category: a.category,
          time_limit_minutes: a.time_limit_seconds ? String(Math.round(a.time_limit_seconds / 60)) : "",
          // Older quizzes may still be unlimited (null); editing gives them the standard.
          max_attempts: String(a.max_attempts ?? DEFAULT_ATTEMPTS),
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
      const res = await apiFetch(`/api/faculty/assessments/${assessmentId}`, {
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
      ? await apiFetch(`/api/faculty/assessments/${assessmentId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
      : await apiFetch(`/api/faculty/questions/${qId}`, {
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
        const res = await apiFetch(`/api/faculty/questions/${qId}`, {
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

  // ---------- AI drafts from the New Quiz page ----------

  // Questions generated while creating the quiz open here as unsaved drafts,
  // placed on a criterion where their competency points at exactly one.
  useEffect(() => {
    if (loading || draftsTakenRef.current) return;
    draftsTakenRef.current = true;
    const drafts = takeDrafts(assessmentId);
    if (drafts.length === 0) return;
    appendDraftQuestions(
      drafts.map((q) => ({
        ...q,
        criteria_id: q.criteria_id ?? criterionForCompetency(q.competency_ids?.[0]),
      })),
    );
    toast(`${drafts.length} AI draft question${drafts.length === 1 ? "" : "s"} — review and save each one`);
    // appendDraftQuestions is recreated every render; the ref makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, assessmentId, criterionForCompetency]);

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
    const res = await apiFetch(`/api/faculty/assessments/${assessmentId}/criteria`, {
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
    const res = await apiFetch(`/api/faculty/assessment-criteria/${id}`, {
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
        const res = await apiFetch(`/api/faculty/assessment-criteria/${id}`, {
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
   * Flattened with header entries rather than nested lists: a header opens a
   * skill's section and the questions follow it down the single column.
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

  // Each skill's questions under its header, as one section to fold or open.
  type HeaderEntry = Extract<(typeof questionList)[number], { kind: "header" }>;
  type QuestionEntry = Extract<(typeof questionList)[number], { kind: "question" }>;
  const sectionGroups: { header: HeaderEntry; items: QuestionEntry[] }[] = [];
  for (const entry of questionList) {
    if (entry.kind === "header") sectionGroups.push({ header: entry, items: [] });
    else sectionGroups[sectionGroups.length - 1]?.items.push(entry);
  }
  // The unassigned group isn't a section.
  const sectionTotal = sectionGroups.filter((g) => g.header.criterion).length;
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const toggleSection = (id: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
        <p className="text-gray-500 mb-4">Quiz not found.</p>
        <button
          onClick={() => router.push("/faculty/assessments")}
          className="px-6 py-2 bg-brand-600 text-white rounded-lg"
        >
          Back to Quizzes
        </button>
      </div>
    );
  }

  /** One question card: its text, answers, and the points/criteria bar. */
  const renderQuestion = (entry: QuestionEntry) => {
    const q = entry.question;
    const i = entry.index;
    const form = questionBuilders[q.id];
    if (!form) return null;
    const isEditing = editingQuestions.has(q.id);
    return (
      <div
        key={q.id}
        className={`bg-surface rounded-xl border shadow-sm flex flex-col overflow-hidden ${
          isEditing ? "border-brand-600/40 border-l-[6px] border-l-brand-600" : "border-gray-200"
        }`}
      >
        <div className="px-5 py-4 sm:px-6 flex-1 space-y-2.5">
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
                  <EcgLoader size="xs" />
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
        <div className="px-5 py-3 sm:px-6 bg-subtle border-t border-hairline flex items-center justify-between gap-2 flex-wrap">
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
          <div className={`flex items-center gap-1.5 ${canEdit ? "" : "hidden"}`}>
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
  };

  return (
    <div className={`${formColumn} space-y-4`}>
      {/* Back to the list, and the clock */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push("/faculty/assessments")}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-subtle hover:text-gray-900"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
          Quizzes
        </button>
        <LiveClock variant="full" className="hidden lg:block" />
      </div>

      {/* Title card, in the manner of a form's title section: a tab with the
          quiz's state, the title, what it covers, and how it's served. */}
      <section aria-label="Quiz details">
        <span
          className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-1 text-xs font-semibold text-white ${
            blockers.length === 0 ? "bg-brand-600" : "bg-amber-600"
          }`}
        >
          <FontAwesomeIcon icon={blockers.length === 0 ? faCheck : faTriangleExclamation} className="h-3 w-3" />
          {blockers.length === 0
            ? "Ready for students"
            : `${blockers.length} issue${blockers.length === 1 ? "" : "s"} to fix`}
        </span>
        <header
          className={`rounded-xl rounded-tl-none border border-hairline border-l-[6px] bg-surface shadow-tile ${
            blockers.length === 0 ? "border-l-brand-600" : "border-l-amber-600"
          }`}
        >
          {editingDetails ? (
            <div className="space-y-6 px-6 py-6 sm:px-8">
              <div>
                <label htmlFor="quiz-title" className="sr-only">Title</label>
                <input
                  id="quiz-title"
                  value={detailForm.title}
                  onChange={(e) => setDetailForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Quiz title"
                  className={`${underlineInput} font-display text-2xl font-bold sm:text-3xl`}
                />
              </div>
              <div>
                <label htmlFor="quiz-description" className="sr-only">Description</label>
                <textarea
                  id="quiz-description"
                  value={detailForm.description}
                  onChange={(e) => setDetailForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="What this quiz covers"
                  className={`${underlineInput} resize-y text-[15px] leading-relaxed`}
                />
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="quiz-time" className={underlineLabel}>Time limit, in minutes</label>
                  <input
                    id="quiz-time"
                    type="number"
                    min={1}
                    value={detailForm.time_limit_minutes}
                    onChange={(e) => setDetailForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
                    placeholder="No limit"
                    className={`${underlineInput} text-sm`}
                  />
                </div>
                <div>
                  <label htmlFor="quiz-attempts" className={underlineLabel}>
                    Attempts allowed, at least {MIN_ATTEMPTS}
                  </label>
                  <input
                    id="quiz-attempts"
                    type="number"
                    min={MIN_ATTEMPTS}
                    step={1}
                    value={detailForm.max_attempts}
                    onChange={(e) => setDetailForm((f) => ({ ...f, max_attempts: e.target.value }))}
                    placeholder={String(DEFAULT_ATTEMPTS)}
                    className={`${underlineInput} text-sm`}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Every attempt serves the whole quiz. Students get {DEFAULT_ATTEMPTS} attempts as standard; allow more if the quiz calls for it.
              </p>
                <div>
                  <p className={underlineLabel}>Published to sections</p>
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
              <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
                <button
                  onClick={() => setEditingDetails(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-subtle"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDetails}
                  disabled={savingDetails}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                >
                  {savingDetails ? (
                    <><EcgLoader /> Saving…</>
                  ) : (
                    <><FontAwesomeIcon icon={faCheck} className="h-4 w-4" /> Save details</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="px-6 py-5 sm:px-8 sm:py-6">
              <div className="flex items-start gap-4">
                <h1 className="min-w-0 flex-1 font-display text-[28px] font-bold leading-[1.12] tracking-[-0.015em] text-gray-900 sm:text-[34px]">
                  {assessment.title}
                </h1>
                <div className="flex shrink-0 items-center gap-1 pt-1">
                  <IconAction
                    label="See results"
                    icon={faChartSimple}
                    onClick={() => router.push(`/faculty/assessments/${assessmentId}/results`)}
                  />
                  {canEdit && <IconAction label="Edit details" icon={faPen} onClick={() => setEditingDetails(true)} />}
                </div>
              </div>
              {assessment.description && (
                <p className="mt-3 max-w-[75ch] text-[15px] leading-relaxed text-gray-700">{assessment.description}</p>
              )}
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faListCheck} className="h-3 w-3 text-gray-400" />
                  {assessment.question_count} question{assessment.question_count !== 1 ? "s" : ""}
                  {blockers.length === 0 &&
                    `, ${servedTotal ?? questions.length - questionsByCriterion.unassigned.length} served per attempt across ${criteria.length} criteria`}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faClock} className="h-3 w-3 text-gray-400" />
                  {assessment.time_limit_seconds
                    ? `${Math.round(assessment.time_limit_seconds / 60)} min limit`
                    : "No time limit"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3 text-gray-400" />
                  {assessment.max_attempts ? `Up to ${assessment.max_attempts} attempts per student` : "Unlimited retakes"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faUsers} className="h-3 w-3 text-gray-400" />
                  {assessment.target_sections && assessment.target_sections.length > 0
                    ? `Published to ${assessment.target_sections.map((name) => `Section ${name}`).join(", ")}`
                    : "Published to all sections"}
                </span>
              </div>
            </div>
          )}
        </header>
      </section>

      {!canEdit && (
        <div className="bg-subtle border border-hairline rounded-xl p-4 text-sm text-gray-600">
          View only — only the instructor who created this assessment can change it. You can still assign it and see its results.
        </div>
      )}

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

      {/* Criteria section — in the same centred column as the questions */}
      <div>
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
          <fieldset disabled={!canEdit} className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3 min-w-0">
            {criteria.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <span className="w-6" />
                  <span className="flex-1">Criteria</span>
                  <span className="w-44">Skill Area</span>
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
                      <span className="text-xs text-gray-500 w-44">
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
                  <span className="w-44" />
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
                <option value="">Select skill area</option>
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
          </fieldset>
        )}
      </div>
      </div>

      {/* Question builder — one centred column, read top to bottom like a
          form, with each skill's questions under its own section card. */}
      <div className="space-y-3">
        <header className="bg-surface rounded-xl border border-hairline border-t-[6px] border-t-brand-600 shadow-tile px-5 py-4 sm:px-6">
          <h2 className="font-display text-lg sm:text-xl font-bold text-gray-900">
            Questions ({questions.length})
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {sectionTotal} {sectionTotal === 1 ? "section" : "sections"}, one per skill. Each attempt draws from every section.
          </p>
        </header>

        {questions.length === 0 ? (
          <div className="bg-surface p-8 rounded-xl border border-dashed border-gray-300 text-center text-gray-400 text-sm">
            No questions yet. Click &quot;Add Question&quot; to start building.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sectionGroups.map(({ header: entry, items }) => {
              const c = entry.criterion;
              const min = c?.min_questions ?? 0;
              const short = c ? entry.count < min : false;
              const collapsed = collapsedSections.has(entry.id);
              const panelId = `section-${entry.id}`;
              return (
                <section key={entry.id} aria-label={c ? c.name : "Unassigned questions"}>
                  {/* Stays in view while its questions scroll under it. The
                      negative inset cancels Shell's padding (p-3 lg:p-5) so it
                      docks at the window's top edge. */}
                  <div className="sticky -top-3 z-20 lg:-top-5">
                    <button
                      type="button"
                      onClick={() => toggleSection(entry.id)}
                      aria-expanded={!collapsed}
                      aria-controls={panelId}
                      className={`flex w-full items-start gap-2.5 rounded-xl border border-l-[6px] bg-surface px-5 py-4 text-left shadow-tile transition-colors hover:bg-subtle/60 sm:px-6 ${
                        c ? "border-hairline border-l-brand-600" : "border-amber-200 border-l-amber-600"
                      }`}
                    >
                      <FontAwesomeIcon
                        icon={c ? faLayerGroup : faTriangleExclamation}
                        className={`mt-1 w-4 h-4 shrink-0 ${c ? "text-brand-600" : "text-amber-600"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-base font-semibold ${c ? "text-gray-900" : "text-amber-800"}`}>
                          {c ? c.name : "Unassigned"}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {entry.count} question{entry.count === 1 ? "" : "s"}
                          {c && `, at least ${min} per attempt, ${c.weight}% of the score`}
                        </span>
                        {short && (
                          <span className="mt-1 block text-xs font-medium text-red-600">
                            Needs {min - entry.count} more question{min - entry.count === 1 ? "" : "s"} to fill the minimum
                          </span>
                        )}
                        {!c && (
                          <span className="mt-1 block text-xs text-amber-800">
                            These are never served — give each one a criteria.
                          </span>
                        )}
                      </span>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-gray-500">
                        <FontAwesomeIcon
                          icon={faChevronDown}
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
                        />
                      </span>
                    </button>
                  </div>
                  {!collapsed && (
                    <div id={panelId} className="mt-3 flex flex-col gap-3">
                      {items.map(renderQuestion)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <div className={`flex items-center justify-center gap-3 pt-2 flex-wrap ${canEdit ? "" : "hidden"}`}>
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
                <><EcgLoader /> Saving All…</>
              ) : (
                <><FontAwesomeIcon icon={faCheck} className="w-4 h-4" /> Save All</>
              )}
            </button>
          )}
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
