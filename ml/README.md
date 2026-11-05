# iCARE++ ML service

FastAPI service for **at-risk performance prediction** (Random Forest + Logistic
Regression, Objective 2.1) and **Bayesian Knowledge Tracing** (Objective 2.2),
which drives the adaptive quiz review and what the mobile Library puts in front
of each student. It reads the same Supabase project the web app uses (service
role over PostgREST) and writes `performance_predictions`, `bkt_parameters`,
`ml_models`, and `notifications`.

Besides the nightly whole-cohort run, the web app re-scores a single student's
risk in the background (`/predict/at-risk`, scoped to them) whenever they hand
in a graded quiz or a Patient Case / Return Demo, and whenever an instructor
finalizes one of those grades. The Assess button is for running it by hand.

The two halves form one pipeline. The at-risk models decide **who** needs
intervention. Knowledge tracing decides **what** each student practises: BKT
estimates mastery of every Taylor's skill from quizzes, Patient Cases and
Return Demonstrations; the web app's review quiz brings back the questions a
student got wrong with the least-mastered skills first, and the Library lists
the skills under 95% mastery with their materials and study tips.

The content-based (TF-IDF) quiz recommender this service used to run is gone:
suggesting more quizzes is the adaptive review's job now, driven by the same
mastery estimates. `learning_recommendations` keeps its old rows but is no
longer written.

## Run

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # fill in Supabase + shared secret
set -a; source .env; set +a
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

or `docker build -t icare-ml . && docker run --env-file .env -p 8000:8000 icare-ml`.

## Deploy

**Render** (free plan) — `render.yaml` at the repository root is a Blueprint for
this service; apply it with New → Blueprint. It prompts for `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `ML_SERVICE_SECRET`, which stay out of git. Put
the resulting URL and the same secret into the web app as `ML_SERVICE_URL` /
`ML_SERVICE_SECRET`.

The free plan sleeps a service after ~15 minutes without traffic, and a
sleeping process runs nothing, so the Blueprint sets `ML_SCHEDULE_ENABLED=false`
and `.github/workflows/ml-nightly.yml` drives the nightly run instead — its
request also wakes the service. Re-enabling the in-process scheduler on a paid
instance means disabling that workflow, or both fire and the jobs run twice.

**Fly.io** — `fly.toml` is still here and keeps one machine permanently awake so
the in-process scheduler works, but Fly no longer offers a free tier to new
accounts. Any host works: the container reads `$PORT` when set and falls back
to 8000.

On startup the service seeds `ml_models` with the shipped OULAD baseline
artifacts (`models/*-oulad.joblib`) as **active** models — the manuscript's
pre-trained-baseline clause — so predictions work before any local training
data exists. A nightly in-process scheduler (`ML_SCHEDULE_TIME`, default 03:00)
runs batch predictions, refits BKT and retrains on iCARE data when there is
enough, switching to a retrained model when it clears the gate under Models.

## API

All endpoints except `/health` require header `X-ICARE-ML-KEY: $ML_SERVICE_SECRET`
(the Next.js server proxies to these; the service is never exposed to browsers).

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness |
| `GET /models` | registry contents |
| `POST /models/{id}/promote` | make a model active by hand (retires the previous active of that kind, and any other retrained at-risk model) |
| `POST /models/retrain` `{force?}` | retrain both at-risk models on iCARE data, register them as **staging** (artifacts in Supabase Storage, web migration 090) and switch to one if it clears the gate; answers `{"skipped": ...}` until 30 labeled students, or when none were labeled since the last retrain |
| `POST /predict/at-risk` `{student_ids?}` | batch-score cohort, write `performance_predictions`, notify roster faculty on new at-risk transitions |
| `POST /recommend/refresh` `{student_ids?}` | refit `bkt_parameters` (whole-cohort runs only; a scoped run is a no-op). The path is kept from the TF-IDF days so callers didn't change |

Both `POST` jobs answer with plain JSON by default. With
`Accept: application/x-ndjson` they stream progress instead: `{"done", "total"}`
lines as the run advances, then one `{"result"}` or `{"error"}` line. The web
app asks for the stream to show a percentage; the nightly workflow doesn't.

## Models

- **Features** (`app/schema.py`): `SHARED_FEATURES` are computable from both
  OULAD and live iCARE++ data (avg score, score trend, attempts, completion
  rate, lateness rate, engagement index, activity recency);
  `EXTENDED_FEATURES` add iCARE-only signals (time-on-task ratio, weakest
  competency accuracy, clinical activity volume). Every artifact records its
  own `feature_names`, so both generations coexist.
- **Baselines (Phase 3.3)** — trained on OULAD (CC-BY 4.0, 32,593
  student-presentations, 52.8% at-risk, split by student 80/20):

  | Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
  |---|---|---|---|---|---|
  | Random Forest | 0.9308 | 0.9789 | 0.8873 | 0.9308 | 0.9794 |
  | Logistic Regression | 0.9221 | 0.9602 | 0.8885 | 0.9230 | 0.9741 |

  Reproduce: download OULAD, then
  `python -m training.train_baseline_oulad --raw-dir <dir>`.
- **The flag is a hybrid** — what faculty see is not the OULAD model alone:
  it is the model's probability weighted by how much graded work backs it,
  topped up by a participation rule, as below. Describe it that way in
  reports, and attribute early-term flags to missed deadlines.
- **Participation weighting** — OULAD labels empty activity as a withdrawal,
  so on its own the baseline flags every student who simply hasn't started
  (80-99%). The batch run therefore weights the model's probability by
  graded attempts (full weight at 3) and fills the rest from participation:
  the share of due quizzes and scenarios missed, starting from half the risk
  threshold when nothing has been missed. `completion_rate` likewise only
  counts work whose deadline has passed. Each prediction stores
  `model_probability`, `evidence_weight`, `work_due` and `work_missed` in its
  feature snapshot, and leads its explanations with `missed_deadlines`
  while the evidence is partial.
- **Retraining (Phase 3.4)** — once finalized case grades accumulate:
  `python -m training.train_icare` labels students by the mean of their
  finalized patient-case grades and any faculty-validated competency scores
  vs the 75 passing mark (it needs 30 labeled students with both outcomes),
  trains on `EXTENDED_FEATURES`, and registers artifacts as `staging`. Only
  real students count: the test institution (campus `ICARE-TEST`, see
  `app/cohorts.py`) is left out. A class is too small to spare a holdout, so
  its metrics are stratified k-fold
  cross-validated (up to 5 folds, out-of-fold predictions, `f1_fold_std` for
  the spread) and the shipped model is fit on every labeled student. The
  nightly run does this on its own through `POST /models/retrain` once there
  are enough labeled students, and again whenever more are labeled; the
  artifacts go to the `ml-models` Storage bucket (the free host's disk doesn't
  survive a restart).
- **Switching models** — a retrained model replaces the one in use with nobody
  reviewing it, so it has to clear a gate (`choose_switch` in
  `training/train_icare.py`): 5 full folds (at least 5 students of each
  outcome), ROC-AUC of at least 0.7, and an F1 no lower than the model in use.
  An OULAD baseline is scored on the same iCARE students for that comparison,
  since its OULAD figures say nothing about them. A retrained model answers
  with the cross-validated F1 saved when it was trained, since it has seen
  most of them. If both kinds clear the gate, logistic regression goes live
  unless the forest's F1 beats it by more than its fold spread. A model that
  doesn't clear it stays `staging`, and retraining tries again when more
  students are labeled. On a switch, Admins get a notification, the winner's
  `metrics.replaced` records what it replaced, and every student moves to the
  new model on the next run. Faculty may see a burst of low-performing
  notifications that night, since the flags are recomputed. An active
  retrained model always scores ahead of a baseline, whatever
  `ML_PRIMARY_MODEL_KIND` says.

  To go back: set `ML_AUTO_SWITCH=false` first, or the next retrain can switch
  again, then `POST /models/{id}/promote` the baseline. That retires the
  retrained model. Report a switched model's accuracy from its cross-validated
  metrics, and OULAD figures as OULAD figures only.
- **iCARE evaluation** — `python -m eval.icare_eval` scores the models
  against those same outcomes: raw, as deployed (participation-weighted),
  and the latest stored predictions faculty saw. With `--simulated` it scores
  the test institution's simulated class instead, which only shows the pipeline
  works. Accuracy figures come from real students, without that flag.
- **Bayesian Knowledge Tracing** (`app/bkt.py`) — one two-state hidden
  Markov model per Taylor's skill, over each student's answers in time order.
  An answer is a quiz answer (graded attempts and review quizzes) or a skill's
  rating on a finished Patient Case or Return Demonstration: Excellent and
  Satisfactory count as right, Needs Practice as wrong, and N/A or an unrated
  check-off is skipped. A rated task is one answer however many sub-tasks it
  has, because its sub-tasks are one performance rated in one sitting. Both
  kinds share a skill's parameters, so the fit reads real students only once
  any has a result; until then it reads the simulated class, which keeps the
  pipeline running and is not evidence. EM (Baum-Welch, as in pyBKT) fits
  P(L0), P(T), P(G), P(S) on every whole-cohort `/recommend/refresh` (nightly,
  or an admin's run; scoped runs leave it alone), with guess and slip
  capped below 0.5 to avoid degenerate fits. Cold start: a skill needs 5
  students and 40 answers for its own fit; below that it takes its chapter's
  pooled fit, then the defaults (0.3 / 0.1 / 0.2 / 0.1), and is refit as
  answers accumulate. The parameters go to `bkt_parameters` (web migration
  084). The web app's review quiz (`web/app/lib/bkt.ts`,
  `assessment-selection.ts`) applies the same update rules to the student's
  answers at the moment it deals a paper. It holds only the questions last
  answered wrong, grouped by skill with the least mastered first; graded tries
  don't adapt. The portal shows the same estimates (`web/app/lib/skill-mastery.ts`):
  per student on their profile, per skill on Analytics, and the benchmark and
  live fit on System Tests.

  Benchmark (`eval/out/bkt_eval_as.md`): ASSISTments 2009-2010 skill-builder
  log, 446,844 answers from 4,151 students on 110 skills, 5-fold
  cross-validation by student, predicting each held-out answer before it is
  seen. These are tutoring-system answers, so the benchmark checks the
  implementation, not how well instructor ratings fit BKT.

  | Model | AUC | Accuracy | RMSE |
  |---|---|---|---|
  | BKT | 0.7665 | 0.7592 | 0.4122 |
  | Skill average | 0.6431 | 0.6984 | 0.4473 |
  | Student running average | 0.7619 | 0.7303 | 0.4262 |

## Evaluation (Phase 3.7 / manuscript Ch. IV)

```bash
python -m eval.predict_eval                 # Model Accuracy Report (holdout)
python -m eval.bkt_eval                     # BKT next-answer prediction, live answers
python -m eval.bkt_eval --csv as.csv --student-col user_id --skill-col skill_name \
    --order-col order_id --label "ASSISTments 2009-2010"   # public benchmark
```

All write JSON + Markdown tables to `eval/out/`.

`bkt_eval` judges knowledge tracing by how well it predicts a student's next
answer on a skill. It uses cross-validation by student, fitting on the other
folds and predicting each held-out answer before seeing it. It reports AUC,
accuracy and RMSE beside two baselines: the skill's average, and the
student's own running average. On live data, ratings count as answers, and
it needs real traffic: until students have enough results, every skill runs
on the defaults and the numbers mean nothing. The ASSISTments 2009-2010 skill-builder log
(`as.csv` from CAHLR/pyBKT-examples) is the standard public benchmark for
checking the implementation itself.
