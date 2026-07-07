"""Batch at-risk prediction (Phase 3.5).

Scores students with the active primary model, writes
public.performance_predictions (feature snapshot + top contributing
features), and notifies roster faculty when a student newly transitions
to at_risk (Phase 2.9 notification contract, type 'at_risk_flag').
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .config import get_settings
from .db import Db
from .features import StudentFeatures, build_student_features
from .registry import get_active_model, load_artifact

TOP_EXPLANATIONS = 3


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
    roster = db.select(
        "faculty_students", "faculty_id,student_id",
        [("student_id", "in", newly_at_risk)],
    )
    students = db.select("users", "id,name", [("id", "in", newly_at_risk)])
    names = {s["id"]: s.get("name") or "A student" for s in students}
    notifications = [
        {
            "user_id": link["faculty_id"],
            "type": "at_risk_flag",
            "title": "Student flagged at risk",
            "body": f"{names.get(link['student_id'], 'A student')} was classified at-risk by the performance prediction model.",
            "data": {"student_id": link["student_id"], "kind": "at_risk_flag"},
        }
        for link in roster
    ]
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

    rows = []
    newly_at_risk = []
    at_risk_count = 0
    for student, probability in zip(students, probabilities):
        risk = "at_risk" if probability >= settings.risk_threshold else "safe"
        if risk == "at_risk":
            at_risk_count += 1
            if previous_risk.get(student.student_id) != "at_risk":
                newly_at_risk.append(student.student_id)
        rows.append({
            "student_id": student.student_id,
            "model_id": model_row["id"],
            "risk": risk,
            "probability": round(float(probability), 4),
            "features": student.features,
            "explanations": _explanations(bundle, student.features),
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
