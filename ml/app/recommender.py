"""Content-based quiz recommender (Phase 3.6, Objective 2.2).

Item side: each published assessment becomes a TF-IDF document over its
questions' competency tags (a tag token per question-competency link), so
an assessment dominated by "Medications" items weighs
that tag highly and rare tags are up-weighted across the catalog.

Student side: a weakness profile over the same tag vocabulary —
1 - accuracy from graded attempt answers, blended with faculty-validated
competency scores and with the instructor's checklist ratings from Patient
Cases and Return Demonstrations (each rated task's Taylor's skill rolls up to
its chapter competency; Needs Practice counts as fully weak); competencies
without history get a neutral exploration weight. Ranking = cosine(assessment
tags, weakness profile).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

import httpx
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from .bkt import refresh_bkt_parameters
from .config import get_settings
from .db import Db
from .features import FEATURE_STEPS, StudentFeatures, build_student_features
from .progress import Progress, Report
from .registry import ensure_recommender_registered

logger = logging.getLogger(__name__)

NEUTRAL_WEAKNESS = 0.5

# Checklist rating -> weakness. N/A is out of the grade, so it is no evidence.
RATING_WEAKNESS = {"excellent": 0.0, "satisfactory": 0.5, "needs_practice": 1.0}
KIND_NOUN = {"patient_case": "Patient Cases", "return_demo": "Return Demonstrations"}
# Tasks built before skill_id existed name their skill in the title.
SKILL_IN_TITLE = re.compile(r"\bSkills? (\d{1,2}-\d{1,2})\b")


@dataclass
class ChecklistSignal:
    """One student's checklist results on one competency: a weakness per
    graded task, and how many of those tasks had a Needs Practice."""

    weaknesses: list[float] = field(default_factory=list)
    needs_practice: int = 0
    kinds: set[str] = field(default_factory=set)

    @property
    def weakness(self) -> float:
        return float(np.mean(self.weaknesses))

    def where(self) -> str:
        nouns = [KIND_NOUN[k] for k in ("patient_case", "return_demo") if k in self.kinds]
        return " and ".join(nouns) or "skill checklists"


def load_checklist_signals(
    db: Db, student_ids: list[str] | None = None
) -> dict[str, dict[str, ChecklistSignal]]:
    """student_id -> competency_id -> the ratings instructors gave them on
    Patient Case and Return Demonstration checklists. A task's ratings count
    once the student can see them: the task is graded, or the case is
    finalized. A task graded step by step is described by its steps, and is
    fully weak when any step needs practice — the rule the Library's "Needs
    improvement" list follows — so a few weak steps among many good ones
    aren't averaged away."""
    skill_comp = {s["id"]: s["chapter_id"] for s in db.select("taylor_skills", "id,chapter_id")}
    filters = [("student_id", "in", student_ids)] if student_ids else None
    assignments = db.select("scenario_assignments", "id,student_id,scenario_id,status", filters)
    if not assignments:
        return {}
    try:
        scenarios = db.select("scenarios", "id,kind")
    except httpx.HTTPStatusError:
        # Before web migration 072 every scenario is a Patient Case.
        scenarios = db.select("scenarios", "id")
    kind_of = {sc["id"]: sc.get("kind") or "patient_case" for sc in scenarios}
    tasks = db.select("scenario_tasks", "id,scenario_id,title,skill_id")
    completions = db.select("scenario_task_completions", "assignment_id,task_id,rating")
    steps = db.select("scenario_task_steps", "id,task_id")
    step_ratings = db.select("scenario_task_step_ratings", "assignment_id,step_id,rating")

    tasks_by_scenario: dict[str, list[dict[str, Any]]] = {}
    for t in tasks:
        tasks_by_scenario.setdefault(t["scenario_id"], []).append(t)
    steps_by_task: dict[str, list[str]] = {}
    for st in steps:
        steps_by_task.setdefault(st["task_id"], []).append(st["id"])
    task_rating = {(c["assignment_id"], c["task_id"]): c.get("rating") for c in completions}
    step_rating = {(r["assignment_id"], r["step_id"]): r["rating"] for r in step_ratings}

    out: dict[str, dict[str, ChecklistSignal]] = {}
    for a in assignments:
        finalized = a["status"] == "completed"
        kind = kind_of.get(a["scenario_id"], "patient_case")
        for task in tasks_by_scenario.get(a["scenario_id"], []):
            skill_id = task.get("skill_id")
            if not skill_id:
                match = SKILL_IN_TITLE.search(task.get("title") or "")
                skill_id = match.group(1) if match else None
            comp_id = skill_comp.get(skill_id) if skill_id else None
            own = task_rating.get((a["id"], task["id"]))
            if comp_id is None or not (finalized or own):
                continue
            ratings = [
                step_rating[(a["id"], sid)]
                for sid in steps_by_task.get(task["id"], [])
                if (a["id"], sid) in step_rating
            ] or ([own] if own else [])
            weights = [RATING_WEAKNESS[r] for r in ratings if r in RATING_WEAKNESS]
            if not weights:
                continue
            needs_practice = "needs_practice" in ratings
            signal = out.setdefault(a["student_id"], {}).setdefault(comp_id, ChecklistSignal())
            signal.weaknesses.append(1.0 if needs_practice else float(np.mean(weights)))
            signal.kinds.add(kind)
            if needs_practice:
                signal.needs_practice += 1
    return out


def _tag_token(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


class RecommenderContext:
    """Catalog-side state shared across the students in one batch."""

    def __init__(self, db: Db) -> None:
        self.db = db
        competencies = db.select("competency_areas", "id,name")
        self.comp_name = {c["id"]: c["name"] for c in competencies}
        self.comp_token = {c["id"]: _tag_token(c["name"]) for c in competencies}

        assessments = db.select(
            "assessments", "id,title",
            [("is_published", "eq", "true")],
        )
        questions = db.select("questions", "id,assessment_id")
        question_comps = db.select("question_competencies", "question_id,competency_id")

        question_assessment = {q["id"]: q["assessment_id"] for q in questions}
        docs: dict[str, list[str]] = {a["id"]: [] for a in assessments}
        comps_per_assessment: dict[str, dict[str, int]] = {a["id"]: {} for a in assessments}
        for qc in question_comps:
            assessment_id = question_assessment.get(qc["question_id"])
            if assessment_id not in docs:
                continue
            docs[assessment_id].append(self.comp_token[qc["competency_id"]])
            counts = comps_per_assessment[assessment_id]
            counts[qc["competency_id"]] = counts.get(qc["competency_id"], 0) + 1

        self.assessments = [a for a in assessments if docs[a["id"]]]
        self.comps_per_assessment = comps_per_assessment
        if not self.assessments:
            self.vectorizer = None
            self.item_matrix = None
            return

        corpus = [" ".join(docs[a["id"]]) for a in self.assessments]
        self.vectorizer = TfidfVectorizer(token_pattern=r"[a-z0-9_]+")
        self.item_matrix = self.vectorizer.fit_transform(corpus).toarray()
        norms = np.linalg.norm(self.item_matrix, axis=1, keepdims=True)
        self.item_matrix = self.item_matrix / np.where(norms == 0, 1, norms)

    def weakness_profile(
        self,
        student: StudentFeatures,
        validated: dict[str, float],
        checklists: dict[str, ChecklistSignal],
    ) -> dict[str, float]:
        """competency_id -> weakness 0-1. Answer accuracy, faculty-validated
        scores and checklist ratings are averaged where they exist."""
        profile: dict[str, float] = {}
        for comp_id in self.comp_name:
            signals = []
            if comp_id in student.competency_accuracy:
                signals.append(1.0 - student.competency_accuracy[comp_id])
            if comp_id in validated:
                signals.append(1.0 - validated[comp_id] / 100.0)
            if comp_id in checklists:
                signals.append(checklists[comp_id].weakness)
            profile[comp_id] = float(np.mean(signals)) if signals else NEUTRAL_WEAKNESS
        return profile

    def rank_for_student(
        self,
        student: StudentFeatures,
        validated: dict[str, float],
        checklists: dict[str, ChecklistSignal],
        k: int,
    ) -> list[dict[str, Any]]:
        if not self.assessments or self.vectorizer is None:
            return []

        weakness = self.weakness_profile(student, validated, checklists)
        vocabulary = self.vectorizer.vocabulary_
        profile_vector = np.zeros(len(vocabulary))
        for comp_id, weight in weakness.items():
            index = vocabulary.get(self.comp_token[comp_id])
            if index is not None:
                profile_vector[index] = weight
        norm = np.linalg.norm(profile_vector)
        if norm == 0:
            return []
        profile_vector = profile_vector / norm

        exclude = student.attempted_assessment_ids | student.assigned_assessment_ids

        scored = []
        for i, assessment in enumerate(self.assessments):
            if assessment["id"] in exclude:
                continue
            score = float(self.item_matrix[i] @ profile_vector)
            if score <= 0:
                continue
            scored.append((score, assessment))
        scored.sort(key=lambda pair: pair[0], reverse=True)

        results = []
        for rank, (score, assessment) in enumerate(scored[:k], start=1):
            comp_counts = self.comps_per_assessment[assessment["id"]]
            target_comp = max(
                comp_counts, key=lambda cid: (weakness.get(cid, 0), comp_counts[cid]),
                default=None,
            )
            checklist = checklists.get(target_comp) if target_comp else None
            if checklist and checklist.needs_practice:
                reason = (
                    f"Targets {self.comp_name[target_comp]}, rated Needs Practice "
                    f"in your {checklist.where()}"
                )
            elif target_comp and weakness.get(target_comp, 0) > NEUTRAL_WEAKNESS:
                accuracy = student.competency_accuracy.get(target_comp)
                if accuracy is not None:
                    reason = (
                        f"Targets {self.comp_name[target_comp]}, currently your weakest "
                        f"area ({round(accuracy * 100)}% accuracy)"
                    )
                else:
                    reason = f"Strengthens {self.comp_name[target_comp]}, flagged low in faculty validation"
            elif target_comp:
                reason = f"Broadens your practice in {self.comp_name[target_comp]}"
            else:
                reason = "Matched to your current level"
            results.append({
                "assessment_id": assessment["id"],
                "competency_id": target_comp,
                "rank": rank,
                "score": round(score, 4),
                "reason": reason,
            })
        return results


def refresh_recommendations(
    db: Db,
    student_ids: list[str] | None = None,
    k: int | None = None,
    report: Report | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    k = k or settings.recommend_k
    # The knowledge-tracing fit, the validated-score and checklist reads, then
    # one step per student: each student's list is rewritten with its own
    # delete and insert, which is where a large cohort spends its time.
    progress = Progress(FEATURE_STEPS + 3, steps_per_student=1, report=report)

    # What each student practises has two halves: these quiz picks, and the
    # adaptive review inside a quiz, which reads the BKT parameters fitted
    # here. BKT learns from every student at once and moves slowly, so only a
    # whole-cohort run (nightly, or an admin's) refits it; a scoped one — an
    # instructor's Assess, or the web's re-score after a student hands
    # something in — leaves it alone. A failed fit keeps the previous
    # parameters; it never costs the recommendations.
    if student_ids:
        bkt: dict[str, Any] = {"skipped": "scoped run"}
    else:
        try:
            bkt = refresh_bkt_parameters(db)
        except Exception:
            logger.exception("BKT parameter fit failed")
            bkt = {"error": "BKT fit failed"}
    progress.step()

    model_id = ensure_recommender_registered(db)
    context = RecommenderContext(db)

    features = build_student_features(db, student_ids, progress)
    if not features:
        return {"students": 0, "recommendations": 0, "bkt": bkt}

    validated_rows = db.select(
        "competency_scores", "student_id,competency_id,score,created_at",
        order="created_at.desc",
    )
    progress.step()
    validated: dict[str, dict[str, float]] = {}
    for row in validated_rows:
        validated.setdefault(row["student_id"], {}).setdefault(
            row["competency_id"], float(row["score"])
        )

    checklists = load_checklist_signals(db, student_ids)
    progress.step()

    written = 0
    for sid, student in features.items():
        recs = context.rank_for_student(student, validated.get(sid, {}), checklists.get(sid, {}), k)
        # replace open recommendations; keep dismissed/completed rows as history
        db.delete(
            "learning_recommendations",
            [
                ("student_id", "eq", sid),
                ("dismissed_at", "is", "null"),
                ("completed_at", "is", "null"),
            ],
        )
        if recs:
            db.insert(
                "learning_recommendations",
                [
                    {
                        "student_id": sid,
                        "model_id": model_id,
                        "assessment_id": rec["assessment_id"],
                        "competency_id": rec["competency_id"],
                        "rank": rec["rank"],
                        "reason": rec["reason"],
                    }
                    for rec in recs
                ],
            )
            written += len(recs)
        progress.step()
    return {"students": len(features), "recommendations": written, "bkt": bkt}


def recommendations_for_student(db: Db, student_id: str, k: int) -> list[dict[str, Any]]:
    context = RecommenderContext(db)
    features = build_student_features(db, [student_id])
    if student_id not in features:
        return []
    validated_rows = db.select(
        "competency_scores", "competency_id,score,created_at",
        [("student_id", "eq", student_id)],
        order="created_at.desc",
    )
    validated: dict[str, float] = {}
    for row in validated_rows:
        validated.setdefault(row["competency_id"], float(row["score"]))
    checklists = load_checklist_signals(db, [student_id]).get(student_id, {})
    return context.rank_for_student(features[student_id], validated, checklists, k)
