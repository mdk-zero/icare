"""Batch at-risk prediction (Phase 3.5).

Scores students with the active primary model, writes
public.performance_predictions (feature snapshot + top contributing
features), and notifies roster faculty when a student newly transitions
to at_risk (Phase 2.9 notification contract, type 'at_risk_flag').

Participation weighting: the baselines learned from OULAD end-of-course
snapshots, where no scores and no activity meant the student had withdrawn.
Early in an iCARE term that same empty vector just means the student has
not started, and the model scores it 80-99% at risk. So the model's verdict
only counts in proportion to the graded work behind it (full weight at
FULL_EVIDENCE_ATTEMPTS), and the rest comes from participation: the share of
due quizzes and scenarios the student missed. A student who has missed
nothing sits halfway to the flag; one who let every deadline pass is flagged
on that alone.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .config import get_settings
from .db import Db
from .features import StudentFeatures, build_student_features
from .registry import get_active_model, load_artifact

TOP_EXPLANATIONS = 3

# Graded attempts at which the model's verdict carries full weight; the
# same minimum score_trend needs before it reads a slope.
FULL_EVIDENCE_ATTEMPTS = 3


def _participation_risk(student: StudentFeatures, threshold: float) -> float:
    """Risk from participation alone. With nothing missed the student is
    neither flagged nor presumed safe (half the threshold); each missed
    deadline moves them from there toward certain."""
    base = threshold / 2
    if not student.work_due:
        return base
    return base + (1 - base) * student.work_missed / student.work_due


def _explanations(
    bundle: dict[str, Any], feature_vector: dict[str, float]
) -> list[dict[str, Any]]:
    """Top contributing features for one student.

    LogReg: signed contribution = coefficient x standardized value (exact for
    the linear model). RF: heuristic ranking = global feature importance x
    |z-score|, signed by whether the deviation points toward the at-risk
    direction learned by a logistic fit is unavailable — so we sign by the
    z-score against the training mean, which faculty read as "unusually
    low/high for this cohort".
    """
    names = bundle["feature_names"]
    means = bundle["feature_means"]
    stds = bundle["feature_stds"]
    z = {
        n: (feature_vector[n] - means[n]) / (stds[n] or 1.0)
        for n in names
    }

    model = bundle["model"]
    if hasattr(model, "coef_"):
        weights = {n: float(c) for n, c in zip(names, model.coef_[0])}
        contributions = {n: weights[n] * z[n] for n in names}
    else:
        importances = {n: float(i) for n, i in zip(names, model.feature_importances_)}
        # risk_direction: sign of the feature's correlation with the positive
        # class, captured at training time; falls back to deviation sign.
        directions = bundle.get("risk_directions", {})
        contributions = {
            n: importances[n] * abs(z[n]) * float(directions.get(n, 1.0)) * (1 if z[n] >= 0 else -1)
            for n in names
        }

    top = sorted(contributions.items(), key=lambda kv: abs(kv[1]), reverse=True)[:TOP_EXPLANATIONS]
    return [
        {
            "feature": name,
            "value": feature_vector[name],
            "cohort_mean": round(means[name], 3),
            "direction": "increases_risk" if contribution > 0 else "decreases_risk",
            "weight": round(abs(contribution), 4),
        }
        for name, contribution in top
        if abs(contribution) > 1e-9
    ]


def _latest_risk_by_student(db: Db) -> dict[str, str]:
    rows = db.select(
        "performance_predictions", "student_id,risk,predicted_at",
        order="predicted_at.desc",
    )
    latest: dict[str, str] = {}
    for row in rows:
        latest.setdefault(row["student_id"], row["risk"])
    return latest


def _notify_at_risk_transitions(db: Db, newly_at_risk: list[str]) -> int:
    if not newly_at_risk:
        return 0
    # Faculty are connected to students through sections: notify every faculty
    # member assigned to an at-risk student's section.
    students = db.select(
        "users", "id,name,section_id", [("id", "in", newly_at_risk)],
    )
    section_ids = sorted({s["section_id"] for s in students if s.get("section_id")})
    if not section_ids:
        return 0
    links = db.select(
        "faculty_sections", "faculty_id,section_id",
        [("section_id", "in", section_ids)],
    )
    faculty_by_section: dict[str, list[str]] = {}
    for link in links:
        faculty_by_section.setdefault(link["section_id"], []).append(link["faculty_id"])
    notifications = [
        {
            "user_id": faculty_id,
            "type": "at_risk_flag",
            "title": "Student flagged at risk",
            "body": f"{student.get('name') or 'A student'} was classified at-risk by the performance prediction model.",
            "data": {"student_id": student["id"], "kind": "at_risk_flag"},
        }
        for student in students
        for faculty_id in faculty_by_section.get(student.get("section_id") or "", [])
    ]
    if not notifications:
        return 0
    db.insert("notifications", notifications)
    return len(notifications)


def run_batch_predictions(db: Db, student_ids: list[str] | None = None) -> dict[str, Any]:
    settings = get_settings()

    model_row = get_active_model(db, settings.primary_model_kind)
    if model_row is None:
        # fall back to whichever kind has an active model
        for kind in ("random_forest", "logistic_regression"):
            model_row = get_active_model(db, kind)
            if model_row:
                break
    if model_row is None or not model_row.get("artifact_url"):
        raise RuntimeError("no active prediction model with an artifact in ml_models")

    bundle = load_artifact(model_row["artifact_url"])
    names = bundle["feature_names"]
    model = bundle["model"]
    scaler = bundle.get("scaler")

    features_by_student: dict[str, StudentFeatures] = build_student_features(db, student_ids)
    if not features_by_student:
        return {"model": model_row["version"], "scored": 0, "at_risk": 0, "notifications": 0}

    students = list(features_by_student.values())
    matrix = np.array([[s.features[n] for n in names] for s in students], dtype=float)
    if scaler is not None:
        matrix = scaler.transform(matrix)
    probabilities = model.predict_proba(matrix)[:, 1]

    previous_risk = _latest_risk_by_student(db)
    cohort_missed = round(float(np.mean([s.work_missed for s in students])), 3)

    rows = []
    newly_at_risk = []
    at_risk_count = 0
    for student, model_probability in zip(students, probabilities):
        evidence = min(1.0, student.features["attempts_count"] / FULL_EVIDENCE_ATTEMPTS)
        participation = _participation_risk(student, settings.risk_threshold)
        probability = evidence * float(model_probability) + (1 - evidence) * participation

        risk = "at_risk" if probability >= settings.risk_threshold else "safe"
        if risk == "at_risk":
            at_risk_count += 1
            if previous_risk.get(student.student_id) != "at_risk":
                newly_at_risk.append(student.student_id)

        explanations = [
            {**e, "weight": round(e["weight"] * evidence, 4)}
            for e in (_explanations(bundle, student.features) if evidence > 0 else [])
        ]
        if evidence < 1:
            # Participation leads while the model has too little to go on.
            explanations = [{
                "feature": "missed_deadlines",
                "value": float(student.work_missed),
                "cohort_mean": cohort_missed,
                "direction": "increases_risk" if student.work_missed else "decreases_risk",
                "weight": round(1 - evidence, 4),
            }] + explanations[:TOP_EXPLANATIONS - 1]

        rows.append({
            "student_id": student.student_id,
            "model_id": model_row["id"],
            "risk": risk,
            "probability": round(probability, 4),
            "features": {
                **student.features,
                "work_due": float(student.work_due),
                "work_missed": float(student.work_missed),
                "evidence_weight": round(evidence, 4),
                "model_probability": round(float(model_probability), 4),
            },
            "explanations": explanations,
        })

    db.insert("performance_predictions", rows)
    notified = _notify_at_risk_transitions(db, newly_at_risk)

    return {
        "model": f"{model_row['kind']} v{model_row['version']}",
        "scored": len(rows),
        "at_risk": at_risk_count,
        "newly_at_risk": len(newly_at_risk),
        "notifications": notified,
    }
