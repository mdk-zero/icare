# iCARE++ ML service

FastAPI service for **at-risk performance prediction** (Random Forest + Logistic
Regression, Objective 2.1) and the **content-based quiz recommender**
(Objective 2.2). It reads the same Supabase project the web app uses (service
role over PostgREST) and writes `performance_predictions`,
`learning_recommendations`, `ml_models`, and `notifications`.

## Run

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # fill in Supabase + shared secret
set -a; source .env; set +a
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

or `docker build -t icare-ml . && docker run --env-file .env -p 8000:8000 icare-ml`.

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
| `POST /recommend/refresh` `{student_ids?, k?}` | recompute + persist `learning_recommendations` |
| `GET /recommend/{student_id}?k=5` | ad-hoc ranking (not persisted) |

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
- **Retraining (Phase 3.4)** — once faculty validations accumulate:
  `python -m training.train_icare` labels students by mean validated
  competency score vs the 75 passing mark, trains on `EXTENDED_FEATURES`,
  and registers artifacts as `staging`; promote via the API after review.
- **Recommender (Phase 3.6)** — TF-IDF over each published assessment's
  question-competency tags, matched against a per-student weakness profile
  (answer accuracy blended with faculty-validated scores; unexplored
  competencies get a neutral exploration weight), scaled by a difficulty
  match factor. Computed live; registered in `ml_models` for auditability.

## Evaluation (Phase 3.7 / manuscript Ch. IV)

```bash
python -m eval.predict_eval                 # Model Accuracy Report (holdout)
python -m eval.recsys_eval --ground-truth faculty_truth.csv --k 5
```

Both write JSON + Markdown tables to `eval/out/`. `recsys_eval` expects a
faculty ground-truth CSV (`student_id,assessment_id`) collected during the
soft launch and reports Precision@K, Recall@K, and Hit Rate@K.
