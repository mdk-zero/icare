/**
 * Offline evaluation snapshot for the risk-prediction models, copied from
 * ml/eval/out/predict_eval.json (held-out OULAD set, 6471 samples). There is
 * no ground-truth outcome column in the warehouse to score live predictions
 * against, so this is the closest thing to a "Prediction Accuracy" figure —
 * a fixed snapshot, not a live metric. Refresh by re-running
 * `python ml/eval/predict_eval.py` and copying the new numbers in here.
 */
export interface ModelEvalEntry {
  model: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  /** Held-out confusion matrix; at-risk is the positive class. */
  confusion?: { tn: number; fp: number; fn: number; tp: number };
}

/** The held-out set every entry was scored on. */
export const MODEL_EVAL_DATASET = { name: "OULAD held-out", samples: 6471, atRiskRate: 0.5251, threshold: 0.5 };

export const MODEL_EVAL_SNAPSHOT: Record<string, ModelEvalEntry> = {
  logistic_regression: {
    model: "logistic_regression v0.1.0-oulad",
    accuracy: 0.9221,
    precision: 0.9602,
    recall: 0.8885,
    f1: 0.923,
    rocAuc: 0.9741,
    confusion: { tn: 2948, fp: 125, fn: 379, tp: 3019 },
  },
  random_forest: {
    model: "random_forest v0.1.0-oulad",
    accuracy: 0.9308,
    precision: 0.9789,
    recall: 0.8873,
    f1: 0.9308,
    rocAuc: 0.9794,
    confusion: { tn: 3008, fp: 65, fn: 383, tp: 3015 },
  },
};

export const DEFAULT_MODEL_KIND = "random_forest";
