"""Retrain the at-risk models on accumulated iCARE++ data (Phase 3.4).

Labels come from faculty-validated competency scores: a student is labeled
at_risk when their mean validated score falls below --pass-threshold
(default 75, the College's passing mark). Students without any validated
score are excluded — this job only becomes meaningful after the soft
launch has produced real outcomes.

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
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.db import Db  # noqa: E402
from app.features import build_student_features  # noqa: E402
from app.schema import EXTENDED_FEATURES  # noqa: E402
from training.train_baseline_oulad import evaluate  # noqa: E402

SEED = 42


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

        validated = db.select("competency_scores", "student_id,score")
        scores_by_student: dict[str, list[float]] = {}
        for row in validated:
            scores_by_student.setdefault(row["student_id"], []).append(float(row["score"]))

        student_ids, X_rows, y = [], [], []
        for sid, bundle in features.items():
            if sid not in scores_by_student:
                continue
            student_ids.append(sid)
            X_rows.append([bundle.features[name] for name in EXTENDED_FEATURES])
            y.append(1 if np.mean(scores_by_student[sid]) < args.pass_threshold else 0)

        X = np.array(X_rows, dtype=float)
        y = np.array(y, dtype=int)
        print(f"  {len(y)} labeled students, at-risk rate {y.mean() if len(y) else 0:.3f}")

        if len(y) < args.min_samples or len(set(y)) < 2:
            print(
                f"aborting: need >= {args.min_samples} labeled students with both outcomes "
                "(run again after more faculty validations accumulate)"
            )
            sys.exit(1)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, stratify=y, random_state=SEED
        )
        feature_means = {n: float(X_train[:, i].mean()) for i, n in enumerate(EXTENDED_FEATURES)}
        feature_stds = {n: float(X_train[:, i].std()) for i, n in enumerate(EXTENDED_FEATURES)}
        risk_directions = {
            n: float(np.sign(np.corrcoef(X_train[:, i], y_train)[0, 1]) or 1.0)
            if X_train[:, i].std() > 0 else 1.0
            for i, n in enumerate(EXTENDED_FEATURES)
        }
        trained_at = datetime.now(timezone.utc).isoformat()
        ml_root = Path(__file__).resolve().parent.parent

        for kind in ("random_forest", "logistic_regression"):
            if kind == "random_forest":
                model = RandomForestClassifier(
                    n_estimators=200, min_samples_leaf=3,
                    class_weight="balanced_subsample", n_jobs=-1, random_state=SEED,
                )
                model.fit(X_train, y_train)
                scaler = None
                metrics = evaluate(model, X_test, y_test)
            else:
                scaler = StandardScaler().fit(X_train)
                model = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=SEED)
                model.fit(scaler.transform(X_train), y_train)

                class _Scaled:
                    def predict(self, X):
                        return model.predict(scaler.transform(X))
                    def predict_proba(self, X):
                        return model.predict_proba(scaler.transform(X))

                metrics = evaluate(_Scaled(), X_test, y_test)

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
