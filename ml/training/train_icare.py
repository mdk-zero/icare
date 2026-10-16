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

New artifacts are written to ml/models/ and registered in ml_models with
status 'staging'; promote via POST /models/{id}/promote once the metrics
are reviewed (they then replace the OULAD baselines).

Usage (env must contain SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ML_SERVICE_SECRET):
    python -m training.train_icare [--pass-threshold 75] [--min-samples 30]
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

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
from app.db import Db  # noqa: E402
from app.features import build_student_features  # noqa: E402
from app.schema import EXTENDED_FEATURES  # noqa: E402

SEED = 42
MAX_FOLDS = 5


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


def outcome_labels(db: Db, pass_threshold: float) -> dict[str, int]:
    """Each graded student's outcome: 1 (at risk) when the mean of their
    finalized case grades and faculty validations is below pass_threshold.
    Students with neither are left out. Shared with eval/icare_eval.py.

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
    scores_by_student: dict[str, list[float]] = {}
    for row in [*finalized, *validated]:
        scores_by_student.setdefault(row["student_id"], []).append(float(row["score"]))
    return {
        sid: int(np.mean(scores) < pass_threshold)
        for sid, scores in scores_by_student.items()
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pass-threshold", type=float, default=75.0)
    parser.add_argument("--min-samples", type=int, default=30)
    parser.add_argument("--version", default=None, help="defaults to today's date")
    args = parser.parse_args()
    version = args.version or datetime.now(timezone.utc).strftime("%Y.%m.%d")

    db = Db()
    try:
        print("building live feature frame...")
        features = build_student_features(db)

        labels = outcome_labels(db, args.pass_threshold)

        student_ids, X_rows, y = [], [], []
        for sid, bundle in features.items():
            if sid not in labels:
                continue
            student_ids.append(sid)
            X_rows.append([bundle.features[name] for name in EXTENDED_FEATURES])
            y.append(labels[sid])

        X = np.array(X_rows, dtype=float)
        y = np.array(y, dtype=int)
        print(f"  {len(y)} labeled students, at-risk rate {y.mean() if len(y) else 0:.3f}")

        if len(y) < args.min_samples or len(set(y)) < 2:
            print(
                f"aborting: need >= {args.min_samples} labeled students with both outcomes "
                "(run again after more case grades are finalized)"
            )
            sys.exit(1)

        # Too few students to spare a holdout: score by stratified k-fold
        # cross-validation, then fit the shipped model on every student.
        folds = min(MAX_FOLDS, int(np.bincount(y).min()))
        if folds < 2:
            print("aborting: need at least 2 students of each outcome to cross-validate")
            sys.exit(1)
        cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=SEED)

        feature_means = {n: float(X[:, i].mean()) for i, n in enumerate(EXTENDED_FEATURES)}
        feature_stds = {n: float(X[:, i].std()) for i, n in enumerate(EXTENDED_FEATURES)}
        risk_directions = {
            n: float(np.sign(np.corrcoef(X[:, i], y)[0, 1]) or 1.0)
            if X[:, i].std() > 0 else 1.0
            for i, n in enumerate(EXTENDED_FEATURES)
        }
        trained_at = datetime.now(timezone.utc).isoformat()
        ml_root = Path(__file__).resolve().parent.parent

        # Logistic regression first: with a class-sized sample its few
        # coefficients are the steadier fit, and the one to promote unless
        # the forest's cross-validated scores clearly beat it.
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

            print(f"{kind}: {metrics}")
            filename = f"{kind}-{version}-icare.joblib"
            joblib.dump(
                {
                    "kind": kind, "version": f"{version}-icare",
                    "model": model, "scaler": scaler,
                    "feature_names": EXTENDED_FEATURES,
                    "feature_means": feature_means, "feature_stds": feature_stds,
                    "risk_directions": risk_directions,
                    "metrics": metrics, "trained_on": "icare", "trained_at": trained_at,
                },
                ml_root / "models" / filename,
                compress=3,
            )
            db.insert(
                "ml_models",
                [{
                    "name": f"iCARE++ retrained ({kind.replace('_', ' ')})",
                    "kind": kind,
                    "version": f"{version}-icare",
                    "status": "staging",
                    "metrics": metrics,
                    "artifact_url": f"models/{filename}",
                    "is_baseline": False,
                    "trained_at": trained_at,
                }],
            )
            print(f"  registered as staging: models/{filename}")

        print("review metrics, then promote via POST /models/{id}/promote")
    finally:
        db.close()


if __name__ == "__main__":
    main()
