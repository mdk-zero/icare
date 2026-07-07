"""Prediction model evaluation (Phase 3.7 / manuscript Ch. IV, Table III).

Scores every model artifact against a held-out feature CSV and prints the
precision / recall / F1 table the manuscript's Instrumentation section
commits to (Model Accuracy Report). By default it evaluates the OULAD
baselines on the holdout written by train_baseline_oulad.py.

Usage:
    python -m eval.predict_eval [--features data/oulad_holdout.csv]
                                [--models "models/*-oulad.joblib"]
                                [--label at_risk] [--threshold 0.5]

Writes eval/out/predict_eval.json and eval/out/predict_eval.md.
"""

from __future__ import annotations

import argparse
import json
import sys
from glob import glob
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default=str(ML_ROOT / "data" / "oulad_holdout.csv"))
    parser.add_argument("--models", default=str(ML_ROOT / "models" / "*-oulad.joblib"))
    parser.add_argument("--label", default="at_risk")
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()

    frame = pd.read_csv(args.features)
    y = frame[args.label].to_numpy(dtype=int)
    artifact_paths = sorted(glob(args.models))
    if not artifact_paths:
        sys.exit(f"no model artifacts match {args.models}")

    results = []
    for path in artifact_paths:
        bundle = joblib.load(path)
        names = bundle["feature_names"]
        missing = [n for n in names if n not in frame.columns]
        if missing:
            print(f"skipping {path}: features missing from dataset: {missing}")
            continue
        X = frame[names].to_numpy(dtype=float)
        if bundle.get("scaler") is not None:
            X = bundle["scaler"].transform(X)
        probabilities = bundle["model"].predict_proba(X)[:, 1]
        predicted = (probabilities >= args.threshold).astype(int)
        tn, fp, fn, tp = confusion_matrix(y, predicted).ravel()
        results.append({
            "model": f"{bundle['kind']} v{bundle['version']}",
            "trained_on": bundle.get("trained_on", "?"),
            "n": int(len(y)),
            "accuracy": round(float(accuracy_score(y, predicted)), 4),
            "precision": round(float(precision_score(y, predicted)), 4),
            "recall": round(float(recall_score(y, predicted)), 4),
            "f1": round(float(f1_score(y, predicted)), 4),
            "roc_auc": round(float(roc_auc_score(y, probabilities)), 4),
            "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        })

    out_dir = ML_ROOT / "eval" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "dataset": args.features,
        "samples": int(len(y)),
        "at_risk_rate": round(float(np.mean(y)), 4),
        "threshold": args.threshold,
        "results": results,
    }
    (out_dir / "predict_eval.json").write_text(json.dumps(payload, indent=2) + "\n")

    header = "| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |"
    rule = "|---|---|---|---|---|---|"
    lines = [f"# Model Accuracy Report", "",
             f"Held-out set: `{args.features}` ({len(y)} samples, "
             f"{payload['at_risk_rate']:.1%} at-risk). Threshold {args.threshold}.", "",
             header, rule]
    for r in results:
        lines.append(
            f"| {r['model']} | {r['accuracy']} | {r['precision']} | {r['recall']} "
            f"| {r['f1']} | {r['roc_auc']} |"
        )
    (out_dir / "predict_eval.md").write_text("\n".join(lines) + "\n")

    print("\n".join(lines))
    print(f"\nwritten to {out_dir}/predict_eval.{{json,md}}")


if __name__ == "__main__":
    main()
