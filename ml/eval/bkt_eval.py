"""Bayesian Knowledge Tracing evaluation (manuscript Ch. IV).

BKT is judged by how well it predicts whether a student's next answer on a
skill is correct. Students are split into folds; for each fold the
parameters are fitted on the other students' answer sequences (with the
same skill -> chapter -> default fallback the service uses), then every
held-out student's answers are predicted one at a time, each prediction made
before that answer is seen. AUC, accuracy (at 0.5) and RMSE are reported
over all held-out predictions, beside two baselines:

  - skill average: the training students' share of right answers on the skill
  - student running average: the student's own share so far on the skill,
    Laplace-smoothed ((right + 1) / (answered + 2))

Reads the live answer history by default (needs SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY and ML_SERVICE_SECRET in the environment) and
writes nothing to the database. With --csv it reads an answer log instead:
one row per answer, with student, skill, correct (0/1) and an ordering
column — pilot data exported from iCARE++, or a public benchmark such as
the ASSISTments 2009-2010 skill-builder log (user_id, skill_name, correct,
order_id), on which every skill is its own chapter.

Usage:
    python -m eval.bkt_eval [--folds 5] [--seed 7]
    python -m eval.bkt_eval --csv answers.csv [--student-col user_id]
        [--skill-col skill_name] [--correct-col correct] [--order-col order_id]
        [--label "ASSISTments 2009-2010"]

Writes eval/out/bkt_eval.json and eval/out/bkt_eval.md.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.metrics import accuracy_score, mean_squared_error, roc_auc_score

ML_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ML_ROOT))

from app.bkt import (  # noqa: E402
    DEFAULT_PARAMS,
    MIN_FIT_ANSWERS,
    MIN_FIT_STUDENTS,
    Sequences,
    fit_skills,
    load_sequences,
    trace,
)


def _metrics(y: list[int], p: list[float]) -> dict[str, float | None]:
    y_arr = np.array(y)
    p_arr = np.clip(np.array(p), 0.0, 1.0)
    auc = float(roc_auc_score(y_arr, p_arr)) if len(set(y)) > 1 else None
    return {
        "auc": None if auc is None else round(auc, 4),
        "accuracy": round(float(accuracy_score(y_arr, p_arr >= 0.5)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y_arr, p_arr))), 4),
    }


def evaluate(sequences: Sequences, skill_chapter: dict[str, str], folds: int, seed: int) -> dict:
    students = sorted({s for per in sequences.values() for s in per})
    rng = np.random.default_rng(seed)
    order = list(rng.permutation(students))
    k = max(2, min(folds, len(order)))
    fold_of = {s: i % k for i, s in enumerate(order)}

    y: list[int] = []
    bkt_p: list[float] = []
    skill_avg_p: list[float] = []
    running_p: list[float] = []
    sources: dict[str, int] = {"fitted": 0, "chapter": 0, "default": 0}

    for fold in range(k):
        train: Sequences = {}
        test: Sequences = {}
        for skill, per in sequences.items():
            for student, seq in per.items():
                target = test if fold_of[student] == fold else train
                target.setdefault(skill, {})[student] = seq
        fits = fit_skills(train, skill_chapter)

        for skill, per in test.items():
            fitted = fits.get(skill)
            params = fitted.params if fitted else DEFAULT_PARAMS
            source = fitted.source if fitted else "default"
            train_answers = [a for seq in train.get(skill, {}).values() for a in seq]
            skill_avg = float(np.mean(train_answers)) if train_answers else 0.5
            for seq in per.values():
                predictions, _ = trace(params, seq)
                right = 0
                for i, correct in enumerate(seq):
                    y.append(int(correct))
                    bkt_p.append(predictions[i])
                    skill_avg_p.append(skill_avg)
                    running_p.append((right + 1) / (i + 2))
                    right += int(correct)
                    sources[source] += 1

    return {
        "predictions": len(y),
        "share_correct": round(float(np.mean(y)), 4) if y else None,
        "folds": k,
        "parameters_used": sources,
        "bkt": _metrics(y, bkt_p) if y else None,
        "baselines": {
            "skill_average": _metrics(y, skill_avg_p) if y else None,
            "student_running_average": _metrics(y, running_p) if y else None,
        },
    }


def load_csv(path: str, student: str, skill: str, correct: str, order: str | None) -> Sequences:
    import pandas as pd

    frame = pd.read_csv(path, usecols=[c for c in (student, skill, correct, order) if c], low_memory=False)
    frame = frame.dropna(subset=[student, skill, correct])
    if order:
        frame = frame.sort_values(order, kind="stable")
    sequences: Sequences = {}
    for stu, sk, right in zip(frame[student].astype(str), frame[skill].astype(str), frame[correct]):
        sequences.setdefault(sk, {}).setdefault(stu, []).append(bool(int(right)))
    return sequences


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--csv", help="an answer log to evaluate instead of the live database")
    parser.add_argument("--student-col", default="student_id")
    parser.add_argument("--skill-col", default="skill_id")
    parser.add_argument("--correct-col", default="correct")
    parser.add_argument("--order-col", default=None)
    parser.add_argument("--label", default=None, help="names the data in the report")
    args = parser.parse_args()

    if args.csv:
        sequences = load_csv(args.csv, args.student_col, args.skill_col, args.correct_col, args.order_col)
        skill_chapter: dict[str, str] = {}
        source = args.label or Path(args.csv).name
    else:
        from app.db import Db

        db = Db()
        try:
            sequences, skill_chapter = load_sequences(db)
        finally:
            db.close()
        source = args.label or "iCARE++ live quiz answers"

    students = {s for per in sequences.values() for s in per}
    answers = sum(len(seq) for per in sequences.values() for seq in per.values())
    full_fit = fit_skills(sequences, skill_chapter)
    result = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data": {
            "source": source,
            "students": len(students),
            "skills": len(sequences),
            "answers": answers,
            "fit_thresholds": {"min_students": MIN_FIT_STUDENTS, "min_answers": MIN_FIT_ANSWERS},
            "parameters_on_full_data": {
                s: sum(1 for f in full_fit.values() if f.source == s) for s in ("fitted", "chapter", "default")
            },
        },
        "held_out": evaluate(sequences, skill_chapter, args.folds, args.seed),
    }

    out = ML_ROOT / "eval" / "out"
    out.mkdir(parents=True, exist_ok=True)
    stem = "bkt_eval" if not args.csv else f"bkt_eval_{Path(args.csv).stem}"
    (out / f"{stem}.json").write_text(json.dumps(result, indent=2) + "\n")

    held = result["held_out"]
    lines = [
        "# Bayesian Knowledge Tracing — next-answer prediction",
        "",
        f"Evaluated {result['evaluated_at']} on {source}: {answers} answers from {len(students)} students "
        f"across {len(sequences)} skills; {held['folds']}-fold cross-validation by student "
        f"({held['predictions']} held-out predictions, {held['share_correct']} answered right).",
        "",
        "| Model | AUC | Accuracy | RMSE |",
        "|---|---|---|---|",
    ]
    rows = [("BKT", held["bkt"]),
            ("Baseline: skill average", held["baselines"]["skill_average"]),
            ("Baseline: student running average", held["baselines"]["student_running_average"])]
    for name, m in rows:
        if m:
            lines.append(f"| {name} | {m['auc'] if m['auc'] is not None else '—'} | {m['accuracy']} | {m['rmse']} |")
    lines += [
        "",
        f"Parameters behind the held-out predictions: {held['parameters_used']} "
        "(fitted = the skill's own fit; chapter = its chapter's pooled fit; default = cold start).",
        "",
    ]
    (out / f"{stem}.md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
