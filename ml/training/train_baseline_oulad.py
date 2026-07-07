"""Train the pre-trained baseline at-risk models on OULAD (Phase 3.3).

The manuscript commits to public-dataset baselines during early deployment,
before iCARE++ has its own labeled outcomes. OULAD (Open University
Learning Analytics Dataset, CC-BY 4.0, https://analyse.kmi.open.ac.uk/open-dataset)
is mapped into the SHARED_FEATURES space:

    unit of sample   one (student, module, presentation) registration
    avg_score        mean coursework score (non-exam assessments)
    score_trend      OLS slope of scores over submission order
    attempts_count   submitted coursework assessments
    completion_rate  submitted / expected coursework assessments
    lateness_rate    share submitted after the deadline
    engagement_index student's VLE-click percentile within the presentation
    days_since_last_activity  presentation end - last VLE activity, capped

    label at_risk    final_result in (Fail, Withdrawn)

Usage:
    python -m training.train_baseline_oulad --raw-dir /path/to/oulad [--version 0.1.0]

Writes models/{kind}-{version}-oulad.joblib, models/baseline_metrics.json,
and data/oulad_holdout.csv (the held-out rows eval/predict_eval.py scores).
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.schema import ACTIVITY_RECENCY_CAP_DAYS, SHARED_FEATURES  # noqa: E402

KEY = ["code_module", "code_presentation", "id_student"]
SEED = 42


def build_oulad_features(raw_dir: Path) -> pd.DataFrame:
    info = pd.read_csv(raw_dir / "studentInfo.csv")
    courses = pd.read_csv(raw_dir / "courses.csv")
    assessments = pd.read_csv(raw_dir / "assessments.csv")
    submissions = pd.read_csv(raw_dir / "studentAssessment.csv")

    coursework = assessments[assessments["assessment_type"] != "Exam"].copy()
    expected = (
        coursework.groupby(["code_module", "code_presentation"])["id_assessment"]
        .nunique()
        .rename("expected_assessments")
    )

    graded = submissions[(submissions["is_banked"] == 0) & submissions["score"].notna()]
    graded = graded.merge(
        coursework[["id_assessment", "code_module", "code_presentation", "date"]],
        on="id_assessment",
        how="inner",
    ).sort_values("date_submitted")

    def per_student(group: pd.DataFrame) -> pd.Series:
        scores = group["score"].to_numpy(dtype=float)
        trend = float(np.polyfit(np.arange(len(scores)), scores, 1)[0]) if len(scores) >= 3 else 0.0
        with_deadline = group[group["date"].notna()]
        late = (with_deadline["date_submitted"] > with_deadline["date"]).mean() if len(with_deadline) else 0.0
        return pd.Series({
            "avg_score": scores.mean(),
            "score_trend": float(np.clip(trend, -50, 50)),
            "attempts_count": float(len(scores)),
            "submitted_assessments": float(group["id_assessment"].nunique()),
            "lateness_rate": float(late),
        })

    assessment_features = graded.groupby(KEY).apply(per_student, include_groups=False).reset_index()

    vle = pd.read_csv(
        raw_dir / "studentVle.csv",
        usecols=["code_module", "code_presentation", "id_student", "date", "sum_click"],
        dtype={"id_student": np.int64, "date": np.int32, "sum_click": np.int32},
    )
    vle_agg = (
        vle.groupby(KEY)
        .agg(total_clicks=("sum_click", "sum"), last_vle_day=("date", "max"))
        .reset_index()
    )
    vle_agg["engagement_index"] = vle_agg.groupby(["code_module", "code_presentation"])[
        "total_clicks"
    ].rank(pct=True)

    frame = info[KEY + ["final_result"]].copy()
    frame = frame.merge(assessment_features, on=KEY, how="left")
    frame = frame.merge(vle_agg, on=KEY, how="left")
    frame = frame.merge(expected.reset_index(), on=["code_module", "code_presentation"], how="left")
    frame = frame.merge(
        courses.rename(columns={"module_presentation_length": "presentation_length"}),
        on=["code_module", "code_presentation"],
        how="left",
    )

    frame["completion_rate"] = (
        frame["submitted_assessments"].fillna(0) / frame["expected_assessments"].clip(lower=1)
    ).clip(upper=1.0)
    frame["days_since_last_activity"] = (
        (frame["presentation_length"] - frame["last_vle_day"])
        .fillna(ACTIVITY_RECENCY_CAP_DAYS)
        .clip(lower=0, upper=ACTIVITY_RECENCY_CAP_DAYS)
    )
    for column, default in [
        ("avg_score", 0.0), ("score_trend", 0.0), ("attempts_count", 0.0),
        ("lateness_rate", 0.0), ("engagement_index", 0.0),
    ]:
        frame[column] = frame[column].fillna(default)

    frame["at_risk"] = frame["final_result"].isin(["Fail", "Withdrawn"]).astype(int)
    return frame[KEY + SHARED_FEATURES + ["at_risk"]]


def evaluate(model, X_test: np.ndarray, y_test: np.ndarray) -> dict:
    predicted = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]
    return {
        "accuracy": round(float(accuracy_score(y_test, predicted)), 4),
        "precision": round(float(precision_score(y_test, predicted)), 4),
        "recall": round(float(recall_score(y_test, predicted)), 4),
        "f1": round(float(f1_score(y_test, predicted)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, probabilities)), 4),
        "holdout_size": int(len(y_test)),
        "holdout_at_risk_rate": round(float(y_test.mean()), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, required=True, help="directory with the OULAD csv files")
    parser.add_argument("--version", default="0.1.0")
    args = parser.parse_args()

    ml_root = Path(__file__).resolve().parent.parent
    models_dir = ml_root / "models"
    data_dir = ml_root / "data"
    models_dir.mkdir(exist_ok=True)
    data_dir.mkdir(exist_ok=True)

    print("building OULAD feature frame...")
    frame = build_oulad_features(args.raw_dir)
    print(f"  {len(frame)} registrations, at-risk rate {frame['at_risk'].mean():.3f}")

    X = frame[SHARED_FEATURES].to_numpy(dtype=float)
    y = frame["at_risk"].to_numpy(dtype=int)
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
    train_index, test_index = next(splitter.split(X, y, groups=frame["id_student"]))
    X_train, X_test, y_train, y_test = X[train_index], X[test_index], y[train_index], y[test_index]

    holdout = frame.iloc[test_index]
    holdout.to_csv(data_dir / "oulad_holdout.csv", index=False)

    feature_means = {name: float(X_train[:, i].mean()) for i, name in enumerate(SHARED_FEATURES)}
    feature_stds = {name: float(X_train[:, i].std()) for i, name in enumerate(SHARED_FEATURES)}
    risk_directions = {
        name: float(np.sign(np.corrcoef(X_train[:, i], y_train)[0, 1]) or 1.0)
        for i, name in enumerate(SHARED_FEATURES)
    }
    trained_at = datetime.now(timezone.utc).isoformat()

    all_metrics = {}

    print("training random forest...")
    forest = RandomForestClassifier(
        n_estimators=200, min_samples_leaf=10, max_depth=12,
        class_weight="balanced_subsample", n_jobs=-1, random_state=SEED,
    )
    forest.fit(X_train, y_train)
    metrics = evaluate(forest, X_test, y_test)
    all_metrics["random_forest"] = metrics
    print(f"  {metrics}")
    joblib.dump(
        {
            "kind": "random_forest", "version": f"{args.version}-oulad",
            "model": forest, "scaler": None,
            "feature_names": SHARED_FEATURES,
            "feature_means": feature_means, "feature_stds": feature_stds,
            "risk_directions": risk_directions,
            "metrics": metrics, "trained_on": "oulad", "trained_at": trained_at,
        },
        models_dir / f"random_forest-{args.version}-oulad.joblib",
        compress=3,
    )

    print("training logistic regression...")
    scaler = StandardScaler().fit(X_train)
    logreg = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=SEED)
    logreg.fit(scaler.transform(X_train), y_train)

    class _Scaled:
        """evaluate() helper so metrics use the scaled space."""
        def predict(self, X):
            return logreg.predict(scaler.transform(X))
        def predict_proba(self, X):
            return logreg.predict_proba(scaler.transform(X))

    metrics = evaluate(_Scaled(), X_test, y_test)
    all_metrics["logistic_regression"] = metrics
    print(f"  {metrics}")
    joblib.dump(
        {
            "kind": "logistic_regression", "version": f"{args.version}-oulad",
            "model": logreg, "scaler": scaler,
            "feature_names": SHARED_FEATURES,
            "feature_means": feature_means, "feature_stds": feature_stds,
            "metrics": metrics, "trained_on": "oulad", "trained_at": trained_at,
        },
        models_dir / f"logistic_regression-{args.version}-oulad.joblib",
        compress=3,
    )

    summary = {
        "dataset": "OULAD (Open University Learning Analytics Dataset, CC-BY 4.0)",
        "samples": int(len(frame)),
        "at_risk_rate": round(float(frame["at_risk"].mean()), 4),
        "features": SHARED_FEATURES,
        "split": "GroupShuffleSplit by id_student, 80/20, seed 42",
        "trained_at": trained_at,
        "models": all_metrics,
    }
    (models_dir / "baseline_metrics.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(f"artifacts written to {models_dir}")


if __name__ == "__main__":
    main()
