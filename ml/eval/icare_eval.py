"""How the at-risk models do on iCARE++'s own students (Phase 3.7).

predict_eval.py scores the OULAD baselines on OULAD's holdout, which says
how well they fit Open University courses, not iCARE. This scores them
against real iCARE outcomes: each graded student's label from
train_icare.outcome_labels (mean of finalized case grades and faculty
validations below the passing mark).

Three views, each scored against the same labels:

    raw          the model's probability on the student's features now
    as deployed  that probability blended with participation, as the
                 nightly batch does (app/predictor.py)
    stored       the latest prediction actually saved to
                 performance_predictions, i.e. what faculty saw

Features and grades cover the same period, so this measures agreement
with outcomes, not prediction ahead of them. With few labeled students
the numbers are indicative only; the report prints n and the confusion
matrix so they read in that light.

Usage (env must contain SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ML_SERVICE_SECRET):
    python -m eval.icare_eval [--models "models/*-oulad.joblib"] [--pass-threshold 75]

Writes eval/out/icare_eval.json and eval/out/icare_eval.md (aggregates
only, no student ids).
"""

from __future__ import annotations

import argparse
import json
import sys
from glob import glob
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

ML_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ML_ROOT))
from app.config import get_settings  # noqa: E402
from app.db import Db  # noqa: E402
from app.features import build_student_features  # noqa: E402
from app.predictor import FULL_EVIDENCE_ATTEMPTS, _participation_risk  # noqa: E402
from training.train_icare import outcome_labels  # noqa: E402


def score(name: str, y: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict:
    predicted = (probabilities >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, predicted, labels=[0, 1]).ravel()
    return {
        "model": name,
        "n": int(len(y)),
        "accuracy": round(float(accuracy_score(y, predicted)), 4),
        "precision": round(float(precision_score(y, predicted, zero_division=0)), 4),
        "recall": round(float(recall_score(y, predicted, zero_division=0)), 4),
        "f1": round(float(f1_score(y, predicted, zero_division=0)), 4),
        # Undefined when every labeled student has the same outcome.
        "roc_auc": round(float(roc_auc_score(y, probabilities)), 4) if len(set(y)) > 1 else None,
        "flagged": int(predicted.sum()),
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", default=str(ML_ROOT / "models" / "*-oulad.joblib"))
    parser.add_argument("--pass-threshold", type=float, default=75.0)
    args = parser.parse_args()
    threshold = get_settings().risk_threshold

    db = Db()
    try:
        labels = outcome_labels(db, args.pass_threshold)
        features = build_student_features(db, list(labels) or None)
        stored = db.select(
            "performance_predictions", "student_id,probability,predicted_at",
            order="predicted_at.asc",
        )
    finally:
        db.close()

    students = [features[sid] for sid in labels if sid in features]
    if not students:
        sys.exit("no labeled students: finalize some case grades first")
    y = np.array([labels[s.student_id] for s in students], dtype=int)
    print(f"  {len(y)} labeled students, {int(y.sum())} at risk")

    evidence = np.array(
        [min(1.0, s.features["attempts_count"] / FULL_EVIDENCE_ATTEMPTS) for s in students]
    )
    participation = np.array([_participation_risk(s, threshold) for s in students])

    results = []
    for path in sorted(glob(args.models)):
        bundle = joblib.load(path)
        X = np.array([[s.features[n] for n in bundle["feature_names"]] for s in students])
        if bundle.get("scaler") is not None:
            X = bundle["scaler"].transform(X)
        raw = bundle["model"].predict_proba(X)[:, 1]
        model = f"{bundle['kind']} v{bundle['version']}"
        results.append(score(f"{model} — raw", y, raw, threshold))
        blended = evidence * raw + (1 - evidence) * participation
        results.append(score(f"{model} — as deployed", y, blended, threshold))

    latest = {row["student_id"]: float(row["probability"]) for row in stored}
    have = [i for i, s in enumerate(students) if s.student_id in latest]
    if have:
        results.append(score(
            "stored — latest saved prediction",
            y[have],
            np.array([latest[students[i].student_id] for i in have]),
            threshold,
        ))

    out_dir = ML_ROOT / "eval" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "labels": f"mean finalized case grade / faculty validation < {args.pass_threshold}",
        "samples": int(len(y)),
        "at_risk": int(y.sum()),
        "threshold": threshold,
        "students_with_full_evidence": int((evidence >= 1).sum()),
        "results": results,
    }
    (out_dir / "icare_eval.json").write_text(json.dumps(payload, indent=2) + "\n")

    lines = [
        "# At-risk models on iCARE++ outcomes", "",
        f"{len(y)} graded students, {int(y.sum())} at risk (mean grade below "
        f"{args.pass_threshold:g}). Flag threshold {threshold}. "
        f"{payload['students_with_full_evidence']} students have the "
        f"{FULL_EVIDENCE_ATTEMPTS}+ graded quiz attempts at which the model counts fully.", "",
        "| Model | n | Flagged | TP | FP | FN | Precision | Recall | F1 | ROC-AUC |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        c = r["confusion"]
        auc = "—" if r["roc_auc"] is None else r["roc_auc"]
        lines.append(
            f"| {r['model']} | {r['n']} | {r['flagged']} | {c['tp']} | {c['fp']} | {c['fn']} "
            f"| {r['precision']} | {r['recall']} | {r['f1']} | {auc} |"
        )
    (out_dir / "icare_eval.md").write_text("\n".join(lines) + "\n")

    print("\n".join(lines))
    print(f"\nwritten to {out_dir}/icare_eval.{{json,md}}")


if __name__ == "__main__":
    main()
