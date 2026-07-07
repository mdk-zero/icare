"""Recommender evaluation (Phase 3.7 / manuscript Ch. IV).

Computes Precision@K, Recall@K, and Hit Rate@K against a faculty
ground-truth CSV — faculty mark which assessments they would actually
assign each student (columns: student_id, assessment_id). Recommendations
are read either from the live learning_recommendations table (default;
needs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ML_SERVICE_SECRET in the
environment) or from a CSV (student_id, assessment_id, rank).

Usage:
    python -m eval.recsys_eval --ground-truth faculty_truth.csv [--k 5]
                               [--recs recommendations.csv]

Writes eval/out/recsys_eval.json and eval/out/recsys_eval.md.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

ML_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ML_ROOT))


def load_recommendations_from_db(k: int) -> pd.DataFrame:
    from app.db import Db

    db = Db()
    try:
        rows = db.select(
            "learning_recommendations",
            "student_id,assessment_id,rank",
            [("dismissed_at", "is", "null"), ("completed_at", "is", "null")],
            order="student_id.asc,rank.asc",
        )
    finally:
        db.close()
    frame = pd.DataFrame(rows, columns=["student_id", "assessment_id", "rank"])
    return frame[frame["rank"] <= k]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ground-truth", required=True,
                        help="CSV with columns student_id,assessment_id (faculty-relevant items)")
    parser.add_argument("--recs", default=None,
                        help="optional CSV with columns student_id,assessment_id,rank; "
                             "defaults to reading learning_recommendations from the database")
    parser.add_argument("--k", type=int, default=5)
    args = parser.parse_args()

    truth = pd.read_csv(args.ground_truth)
    relevant = truth.groupby("student_id")["assessment_id"].apply(set)

    if args.recs:
        recs = pd.read_csv(args.recs)
        recs = recs[recs["rank"] <= args.k]
    else:
        recs = load_recommendations_from_db(args.k)
    recommended = recs.sort_values("rank").groupby("student_id")["assessment_id"].apply(list)

    per_student = []
    for student_id, relevant_set in relevant.items():
        rec_list = recommended.get(student_id, [])[: args.k]
        hits = len(set(rec_list) & relevant_set)
        per_student.append({
            "student_id": student_id,
            "recommended": len(rec_list),
            "relevant": len(relevant_set),
            "hits": hits,
            "precision_at_k": hits / args.k,
            "recall_at_k": hits / len(relevant_set) if relevant_set else 0.0,
            "hit": 1 if hits > 0 else 0,
        })

    if not per_student:
        sys.exit("ground-truth CSV contained no students")

    frame = pd.DataFrame(per_student)
    summary = {
        "k": args.k,
        "students": int(len(frame)),
        "students_with_recommendations": int((frame["recommended"] > 0).sum()),
        f"precision_at_{args.k}": round(float(frame["precision_at_k"].mean()), 4),
        f"recall_at_{args.k}": round(float(frame["recall_at_k"].mean()), 4),
        f"hit_rate_at_{args.k}": round(float(frame["hit"].mean()), 4),
    }

    out_dir = ML_ROOT / "eval" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "recsys_eval.json").write_text(
        json.dumps({"summary": summary, "per_student": per_student}, indent=2, default=str) + "\n"
    )
    lines = [
        "# Recommendation Accuracy Report", "",
        f"Ground truth: `{args.ground_truth}` ({summary['students']} students). K = {args.k}.", "",
        "| Metric | Value |", "|---|---|",
        f"| Precision@{args.k} | {summary[f'precision_at_{args.k}']} |",
        f"| Recall@{args.k} | {summary[f'recall_at_{args.k}']} |",
        f"| Hit Rate@{args.k} | {summary[f'hit_rate_at_{args.k}']} |",
    ]
    (out_dir / "recsys_eval.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nwritten to {out_dir}/recsys_eval.{{json,md}}")


if __name__ == "__main__":
    main()
