"""Content-based quiz recommender (Phase 3.6, Objective 2.2).

Item side: each published assessment becomes a TF-IDF document over its
questions' competency tags (a tag token per question-competency link), so
an assessment dominated by "Safe and Quality Nursing Care" items weighs
that tag highly and rare tags are up-weighted across the catalog.

Student side: a weakness profile over the same tag vocabulary —
1 - accuracy from graded attempt answers, blended with faculty-validated
competency scores; competencies without history get a neutral exploration
weight. Ranking = cosine(assessment tags, weakness profile) x a difficulty
match factor derived from the student's average score.
"""

from __future__ import annotations

import re
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from .config import get_settings
from .db import Db
from .features import StudentFeatures, build_student_features
from .registry import ensure_recommender_registered

NEUTRAL_WEAKNESS = 0.5
DIFFICULTY_ORDER = {"beginner": 0, "intermediate": 1, "advanced": 2}
# match factor by |student level - assessment difficulty|
DIFFICULTY_FACTOR = {0: 1.0, 1: 0.85, 2: 0.7}


def _tag_token(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def _student_level(avg_score: float, attempts: float) -> int:
    if attempts == 0 or avg_score < 50:
        return 0
    if avg_score < 75:
        return 1
    return 2


class RecommenderContext:
    """Catalog-side state shared across the students in one batch."""

    def __init__(self, db: Db) -> None:
        self.db = db
        competencies = db.select("competency_areas", "id,name")
        self.comp_name = {c["id"]: c["name"] for c in competencies}
        self.comp_token = {c["id"]: _tag_token(c["name"]) for c in competencies}

        assessments = db.select(
            "assessments", "id,title,difficulty",
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

    def weakness_profile(self, student: StudentFeatures, validated: dict[str, float]) -> dict[str, float]:
        """competency_id -> weakness 0-1. Answer accuracy and faculty-validated
        scores are averaged when both exist."""
        profile: dict[str, float] = {}
        for comp_id in self.comp_name:
            signals = []
            if comp_id in student.competency_accuracy:
                signals.append(1.0 - student.competency_accuracy[comp_id])
            if comp_id in validated:
                signals.append(1.0 - validated[comp_id] / 100.0)
            profile[comp_id] = float(np.mean(signals)) if signals else NEUTRAL_WEAKNESS
        return profile

    def rank_for_student(
        self, student: StudentFeatures, validated: dict[str, float], k: int
    ) -> list[dict[str, Any]]:
        if not self.assessments or self.vectorizer is None:
            return []

        weakness = self.weakness_profile(student, validated)
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

        level = _student_level(
            student.features["avg_score"], student.features["attempts_count"]
        )
        exclude = student.attempted_assessment_ids | student.assigned_assessment_ids

        scored = []
        for i, assessment in enumerate(self.assessments):
            if assessment["id"] in exclude:
                continue
            similarity = float(self.item_matrix[i] @ profile_vector)
            gap = abs(DIFFICULTY_ORDER.get(assessment["difficulty"], 0) - level)
            score = similarity * DIFFICULTY_FACTOR[gap]
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
            if target_comp and weakness.get(target_comp, 0) > NEUTRAL_WEAKNESS:
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
    db: Db, student_ids: list[str] | None = None, k: int | None = None
) -> dict[str, Any]:
    settings = get_settings()
    k = k or settings.recommend_k
    model_id = ensure_recommender_registered(db)
    context = RecommenderContext(db)

    features = build_student_features(db, student_ids)
    if not features:
        return {"students": 0, "recommendations": 0}

    validated_rows = db.select(
        "competency_scores", "student_id,competency_id,score,created_at",
        order="created_at.desc",
    )
    validated: dict[str, dict[str, float]] = {}
    for row in validated_rows:
        validated.setdefault(row["student_id"], {}).setdefault(
            row["competency_id"], float(row["score"])
        )

    written = 0
    for sid, student in features.items():
        recs = context.rank_for_student(student, validated.get(sid, {}), k)
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
    return {"students": len(features), "recommendations": written}


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
    return context.rank_for_student(features[student_id], validated, k)
