"""Retrain the at-risk models on accumulated iCARE++ data (Phase 3.4).

Labels come from faculty judgements of the student: finalized patient-case
grades (the RetDem score faculty lock in at finalize) and any
faculty-validated competency scores. A student is labeled at_risk when the
mean of those falls below --pass-threshold (default 75, the College's
passing mark). Students with neither are excluded — this job only becomes
meaningful after the soft launch has produced real outcomes.

Case grades are safe as labels because the features never read them: they
take scores from quiz attempts, and from a case only its status and
deadline.

New artifacts go to Supabase Storage (the ml-models bucket, web migration
090) and are registered in ml_models with status 'staging'. One then replaces
the model in use on its own if it clears the switch gate (choose_switch), which
is how the OULAD baselines give way, and Admins get a notification. With
ML_AUTO_SWITCH=false they stay in staging for POST /models/{id}/promote. The
nightly run calls this through POST /models/retrain, which skips until there
are enough labeled students and whenever none were labeled since the last
retrain.

Usage (env must contain SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ML_SERVICE_SECRET):
    python -m training.train_icare [--pass-threshold 75] [--min-samples 30]
"""

from __future__ import annotations

import argparse
import io
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.cohorts import simulated_students  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import Db  # noqa: E402
from app.features import StudentFeatures, build_student_features  # noqa: E402
from app.registry import STORAGE_PREFIX, get_serving_model, load_artifact, promote_model  # noqa: E402
from app.schema import EXTENDED_FEATURES  # noqa: E402

SEED = 42
MAX_FOLDS = 5

# The switch gate, for a model going live with nobody reviewing it. Full folds
# take five students of each outcome; with fewer, the scores swing too much to
# act on. 0.7 is the usual floor for acceptable discrimination, and it stops a
# model that flags everyone, whose F1 looks fine when most students are at risk.
SWITCH_MIN_FOLDS = MAX_FOLDS
SWITCH_MIN_ROC_AUC = 0.7


def cross_validated(estimator, X: np.ndarray, y: np.ndarray, cv: StratifiedKFold) -> dict:
    """Scores from out-of-fold predictions: every student is scored by a
    model that never saw them, and the per-fold F1 spread shows how much a
    single split would have swung."""
    probabilities = np.zeros(len(y))
    fold_f1 = []
    for train, test in cv.split(X, y):
        fitted = clone(estimator).fit(X[train], y[train])
        probabilities[test] = fitted.predict_proba(X[test])[:, 1]
        fold_f1.append(f1_score(y[test], probabilities[test] >= 0.5, zero_division=0))
    predicted = (probabilities >= 0.5).astype(int)
    return {
        "accuracy": round(float(accuracy_score(y, predicted)), 4),
        "precision": round(float(precision_score(y, predicted, zero_division=0)), 4),
        "recall": round(float(recall_score(y, predicted, zero_division=0)), 4),
        "f1": round(float(f1_score(y, predicted, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y, probabilities)), 4),
        "f1_fold_std": round(float(np.std(fold_f1)), 4),
        "cv_folds": cv.get_n_splits(),
        "samples": int(len(y)),
        "at_risk_rate": round(float(y.mean()), 4),
    }


def outcome_labels(db: Db, pass_threshold: float, simulated: bool = False) -> dict[str, int]:
    """Each graded student's outcome: 1 (at risk) when the mean of their
    finalized case grades and faculty validations is below pass_threshold.
    Students with neither are left out. Shared with eval/icare_eval.py.

    Real students only, or with simulated=True only the simulated ones (for
    evaluation, never training): a model that can go live on its own mustn't
    learn from made-up grades.

    Faculty judgements only. Assessment-derived competency scores are
    computed from the same attempts that produce the features, so folding
    them in here would train the model on its own inputs.
    """
    finalized = db.select(
        "scenario_assignments",
        "student_id,score",
        [("finalized_by", "not.is", "null"), ("score", "not.is", "null")],
    )
    validated = db.select(
        "competency_scores",
        "student_id,score",
        [("source", "eq", "faculty_validation")],
    )
    print(f"  {len(finalized)} finalized case grades, {len(validated)} faculty validations")
    cohort = simulated_students(db)
    scores_by_student: dict[str, list[float]] = {}
    for row in [*finalized, *validated]:
        if (row["student_id"] in cohort) == simulated:
            scores_by_student.setdefault(row["student_id"], []).append(float(row["score"]))
    return {
        sid: int(np.mean(scores) < pass_threshold)
        for sid, scores in scores_by_student.items()
    }


#: Supabase Storage bucket for retrained models (web migration 090).
MODEL_BUCKET = "ml-models"


def _last_icare_samples(db: Db) -> int | None:
    """How many labeled students the newest iCARE model (staging or active) was trained on."""
    rows = db.select(
        "ml_models",
        "metrics,version,created_at",
        [("is_baseline", "eq", "false"), ("version", "like", "*-icare")],
        order="created_at.desc",
        limit=1,
    )
    if not rows:
        return None
    samples = (rows[0].get("metrics") or {}).get("samples")
    return int(samples) if samples is not None else None


def _f1_to_beat(
    db: Db, students: list[StudentFeatures], y: np.ndarray
) -> tuple[dict[str, Any] | None, float]:
    """The model in use and the F1 a new one must match. A baseline never saw
    these students, so it is scored on them, the same students behind the new
    model's scores (its 0.93 on OULAD's holdout says nothing about them). A
    retrained model was fit on most of them and would flatter itself, so it
    answers with the cross-validated F1 saved when it was trained."""
    in_use = get_serving_model(db)
    if in_use is None or not in_use.get("artifact_url"):
        return in_use, 0.0
    if not in_use["is_baseline"]:
        return in_use, float((in_use.get("metrics") or {}).get("f1", 0.0))
    bundle = load_artifact(in_use["artifact_url"])
    X = np.array([[s.features[n] for n in bundle["feature_names"]] for s in students], dtype=float)
    if bundle.get("scaler") is not None:
        X = bundle["scaler"].transform(X)
    probabilities = bundle["model"].predict_proba(X)[:, 1]
    # The same 0.5 cross_validated scores at.
    return in_use, round(float(f1_score(y, probabilities >= 0.5, zero_division=0)), 4)


def choose_switch(candidates: list[dict[str, Any]], to_beat: float) -> dict[str, Any] | None:
    """Which new model, if any, replaces the one in use: it needs full folds, a
    ROC-AUC above the floor and an F1 no lower than to_beat. When both clear
    that, logistic regression, the steadier fit on a class-sized sample, unless
    the forest beats it by more than one split would swing."""
    cleared = {
        c["kind"]: c
        for c in candidates
        if c["metrics"]["cv_folds"] >= SWITCH_MIN_FOLDS
        and c["metrics"]["roc_auc"] >= SWITCH_MIN_ROC_AUC
        and c["metrics"]["f1"] >= to_beat
    }
    forest, logistic = cleared.get("random_forest"), cleared.get("logistic_regression")
    if forest and logistic:
        margin = logistic["metrics"]["f1"] + logistic["metrics"]["f1_fold_std"]
        return forest if forest["metrics"]["f1"] > margin else logistic
    return forest or logistic


def _notify_admins_of_switch(db: Db, winner: dict[str, Any], replaced: dict[str, Any]) -> None:
    """Nobody reviewed this model, so the people who could undo it get told."""
    admins = db.select("users", "id", [("role", "eq", "super_admin")])
    metrics = winner["metrics"]
    db.insert(
        "notifications",
        [
            {
                "user_id": admin["id"],
                "type": "system",
                "title": "Low-performing flag switched models",
                "body": (
                    f"The flag now runs on {winner['kind'].replace('_', ' ')} v{winner['version']}, "
                    f"trained on {metrics['samples']} iCARE++ students "
                    f"(F1 {metrics['f1']}, ROC-AUC {metrics['roc_auc']}). "
                    f"It replaces {replaced['model']} (F1 {replaced['f1']})."
                ),
                "data": {"kind": "ml_model_switched", "model_id": winner["id"]},
            }
            for admin in admins
        ],
    )


def _switch_if_better(
    db: Db, registered: list[dict[str, Any]], students: list[StudentFeatures], y: np.ndarray, log
) -> dict[str, Any] | None:
    in_use, to_beat = _f1_to_beat(db, students, y)
    name = f"{in_use['kind'].replace('_', ' ')} v{in_use['version']}" if in_use else "no model"
    winner = choose_switch(registered, to_beat)
    if winner is None:
        log(f"no switch: nothing cleared the gate against {name} (F1 {to_beat})")
        return None
    replaced = {"model": name, "f1": to_beat}
    db.update(
        "ml_models",
        {"metrics": {**winner["metrics"], "replaced": replaced}},
        [("id", "eq", winner["id"])],
    )
    promote_model(db, winner["id"])
    _notify_admins_of_switch(db, winner, replaced)
    log(f"switched to {winner['kind']} v{winner['version']} from {name}")
    return {"kind": winner["kind"], "version": winner["version"], "f1": winner["metrics"]["f1"], "replaced": replaced}


def train_and_register(
    db: Db,
    pass_threshold: float = 75.0,
    min_samples: int = 30,
    version: str | None = None,
    force: bool = False,
    log=print,
) -> dict[str, Any]:
    """Train both at-risk models on iCARE data, register them as staging, and
    switch to one if it clears the gate (choose_switch).

    Returns what happened. Skips, without writing anything, until there are
    min_samples labeled students with both outcomes, and (unless force) when
    no student has been labeled since the newest iCARE model, so a nightly
    call doesn't pile up identical staging rows.
    """
    # To the minute: GitHub starts the nightly run late, so two can land on one
    # UTC date, and a repeated version would overwrite the first run's file.
    version = version or datetime.now(timezone.utc).strftime("%Y.%m.%d.%H%M")
    log("building live feature frame...")
    features = build_student_features(db)
    labels = outcome_labels(db, pass_threshold)

    student_ids, X_rows, y = [], [], []
    for sid, bundle in features.items():
        if sid not in labels:
            continue
        student_ids.append(sid)
        X_rows.append([bundle.features[name] for name in EXTENDED_FEATURES])
        y.append(labels[sid])

    X = np.array(X_rows, dtype=float)
    y = np.array(y, dtype=int)
    log(f"  {len(y)} labeled students, at-risk rate {y.mean() if len(y) else 0:.3f}")

    if len(y) < min_samples or len(set(y)) < 2:
        return {
            "skipped": f"need {min_samples} labeled students with both outcomes; have {len(y)}",
            "labeled": int(len(y)),
        }
    if not force and _last_icare_samples(db) == len(y):
        return {"skipped": "no newly labeled students since the last retrain", "labeled": int(len(y))}

    # Too few students to spare a holdout: score by stratified k-fold
    # cross-validation, then fit the shipped model on every student.
    folds = min(MAX_FOLDS, int(np.bincount(y).min()))
    if folds < 2:
        return {"skipped": "need at least 2 students of each outcome to cross-validate", "labeled": int(len(y))}
    cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=SEED)

    feature_means = {n: float(X[:, i].mean()) for i, n in enumerate(EXTENDED_FEATURES)}
    feature_stds = {n: float(X[:, i].std()) for i, n in enumerate(EXTENDED_FEATURES)}
    risk_directions = {
        n: float(np.sign(np.corrcoef(X[:, i], y)[0, 1]) or 1.0)
        if X[:, i].std() > 0 else 1.0
        for i, n in enumerate(EXTENDED_FEATURES)
    }
    trained_at = datetime.now(timezone.utc).isoformat()

    registered: list[dict[str, Any]] = []
    for kind in ("logistic_regression", "random_forest"):
        if kind == "random_forest":
            estimator = RandomForestClassifier(
                n_estimators=200, min_samples_leaf=3,
                class_weight="balanced_subsample", n_jobs=-1, random_state=SEED,
            )
            metrics = cross_validated(estimator, X, y, cv)
            model = estimator.fit(X, y)
            scaler = None
        else:
            estimator = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=SEED)
            metrics = cross_validated(make_pipeline(StandardScaler(), estimator), X, y, cv)
            scaler = StandardScaler().fit(X)
            model = estimator.fit(scaler.transform(X), y)

        log(f"{kind}: {metrics}")
        filename = f"{kind}-{version}-icare.joblib"
        buffer = io.BytesIO()
        joblib.dump(
            {
                "kind": kind, "version": f"{version}-icare",
                "model": model, "scaler": scaler,
                "feature_names": EXTENDED_FEATURES,
                "feature_means": feature_means, "feature_stds": feature_stds,
                "risk_directions": risk_directions,
                "metrics": metrics, "trained_on": "icare", "trained_at": trained_at,
            },
            buffer,
            compress=3,
        )
        # Storage, not the local models/ folder: the host's disk is wiped on
        # restart, which would leave the registry pointing at nothing.
        db.upload_object(MODEL_BUCKET, filename, buffer.getvalue())
        artifact_url = f"{STORAGE_PREFIX}{MODEL_BUCKET}/{filename}"
        row = db.insert(
            "ml_models",
            [{
                "name": f"iCARE++ retrained ({kind.replace('_', ' ')})",
                "kind": kind,
                "version": f"{version}-icare",
                "status": "staging",
                "metrics": metrics,
                "artifact_url": artifact_url,
                "is_baseline": False,
                "trained_at": trained_at,
            }],
            returning=True,
        )[0]
        log(f"  registered as staging: {artifact_url}")
        registered.append({"id": row["id"], "kind": kind, "version": f"{version}-icare", "metrics": metrics})

    switched = None
    if get_settings().auto_switch:
        switched = _switch_if_better(db, registered, [features[sid] for sid in student_ids], y, log)
    else:
        log("ML_AUTO_SWITCH is off: review the metrics, then promote via POST /models/{id}/promote")
    return {"registered": registered, "labeled": int(len(y)), "switched": switched}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pass-threshold", type=float, default=75.0)
    parser.add_argument("--min-samples", type=int, default=30)
    parser.add_argument("--version", default=None, help="defaults to the current UTC date and time")
    parser.add_argument("--force", action="store_true", help="retrain even with no newly labeled students")
    args = parser.parse_args()

    db = Db()
    try:
        result = train_and_register(db, args.pass_threshold, args.min_samples, args.version, args.force)
    finally:
        db.close()
    if "skipped" in result:
        print(f"aborting: {result['skipped']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
