# Bayesian Knowledge Tracing — next-answer prediction

Evaluated 2026-10-30T08:23:16+00:00 on ASSISTments 2009-2010 skill builder (as.csv, CAHLR/pyBKT-examples): 446844 answers from 4151 students across 110 skills; 5-fold cross-validation by student (446844 held-out predictions, 0.6952 answered right).

| Model | AUC | Accuracy | RMSE |
|---|---|---|---|
| BKT | 0.7665 | 0.7592 | 0.4122 |
| Baseline: skill average | 0.6431 | 0.6984 | 0.4473 |
| Baseline: student running average | 0.7619 | 0.7303 | 0.4262 |

Parameters behind the held-out predictions: {'fitted': 445313, 'chapter': 0, 'default': 1531} (fitted = the skill's own fit; chapter = its chapter's pooled fit; default = cold start).
