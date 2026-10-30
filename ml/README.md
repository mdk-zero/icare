# iCARE++ ML service

FastAPI service for **at-risk performance prediction** (Random Forest + Logistic
Regression, Objective 2.1), **Bayesian Knowledge Tracing** for the adaptive
quiz review, and the **content-based quiz recommender** (Objective 2.2). It reads the same Supabase project the web app uses (service
role over PostgREST) and writes `performance_predictions`,
`learning_recommendations`, `bkt_parameters`, `ml_models`, and `notifications`.

The two halves form one pipeline. The at-risk models decide **who** needs
intervention. Knowledge tracing and the recommender decide **what** each
student practises: BKT estimates mastery of every Taylor's skill, the web
app's adaptive quiz review spends a retake or practice run on the
least-mastered skills, and the recommender points to other quizzes on the
weakest competencies.

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
runs batch predictions and refreshes recommendations.

## API

All endpoints except `/health` require header `X-ICARE-ML-KEY: $ML_SERVICE_SECRET`
(the Next.js server proxies to these; the service is never exposed to browsers).

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness |
| `GET /models` | registry contents |
| `POST /models/{id}/promote` | staging → active (retires the previous active of that kind) |
| `POST /predict/at-risk` `{student_ids?}` | batch-score cohort, write `performance_predictions`, notify roster faculty on new at-risk transitions |
| `POST /recommend/refresh` `{student_ids?, k?}` | refit `bkt_parameters`, then recompute + persist `learning_recommendations` |
| `GET /recommend/{student_id}?k=5` | ad-hoc ranking (not persisted) |

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
  trains on `EXTENDED_FEATURES`, and registers artifacts as `staging`;
  promote via the API after review. A class is too small to spare a
  holdout, so its metrics are stratified k-fold cross-validated (up to 5
  folds, out-of-fold predictions, `f1_fold_std` for the spread) and the
  shipped model is fit on every labeled student. Prefer the logistic
  regression unless the forest's scores clearly beat it.
- **iCARE evaluation** — `python -m eval.icare_eval` scores the models
  against those same outcomes: raw, as deployed (participation-weighted),
  and the latest stored predictions faculty saw. Until real grades replace
  the seeded history, its numbers only show the pipeline works.
- **Recommender (Phase 3.6)** — TF-IDF over each published assessment's
  question-competency tags, matched against a per-student weakness profile
  (answer accuracy blended with faculty-validated scores; unexplored
  competencies get a neutral exploration weight). Computed live; registered in `ml_models` for auditability.
- **Bayesian Knowledge Tracing** (`app/bkt.py`) — one two-state hidden
  Markov model per Taylor's skill, over each student's quiz answers in order
  (graded attempts and practice runs). EM (Baum-Welch, as in pyBKT) fits
  P(L0), P(T), P(G), P(S) on every `/recommend/refresh`, with guess and slip
  capped below 0.5 to avoid degenerate fits. Cold start: a skill needs 5
  students and 40 answers for its own fit; below that it takes its chapter's
  pooled fit, then the defaults (0.3 / 0.1 / 0.2 / 0.1), and is refit as
  answers accumulate. The parameters go to `bkt_parameters` (web migration
  084). The web app's adaptive review (`web/app/lib/bkt.ts`,
  `assessment-selection.ts`) applies the same update rules to the student's
  answers at the moment it deals a paper. The surplus questions go to the
  least-mastered skills, and on a practice run the questions last answered
  wrong come first.

## Evaluation (Phase 3.7 / manuscript Ch. IV)

```bash
python -m eval.predict_eval                 # Model Accuracy Report (holdout)
python -m eval.recsys_eval --ground-truth faculty_truth.csv --k 5
python -m eval.bkt_eval                     # BKT next-answer prediction, live answers
python -m eval.bkt_eval --csv as.csv --student-col user_id --skill-col skill_name \
    --order-col order_id --label "ASSISTments 2009-2010"   # public benchmark
```

All write JSON + Markdown tables to `eval/out/`. `recsys_eval` expects a
faculty ground-truth CSV (`student_id,assessment_id`) collected during the
soft launch and reports Precision@K, Recall@K, and Hit Rate@K.

`bkt_eval` judges knowledge tracing by how well it predicts a student's next
answer on a skill. It uses cross-validation by student, fitting on the other
folds and predicting each held-out answer before seeing it. It reports AUC,
accuracy and RMSE beside two baselines: the skill's average, and the
student's own running average. On live data it needs real quiz traffic:
until students have answered enough, every skill runs on the defaults and
the numbers mean nothing. The ASSISTments 2009-2010 skill-builder log
(`as.csv` from CAHLR/pyBKT-examples) is the standard public benchmark for
checking the implementation itself.
