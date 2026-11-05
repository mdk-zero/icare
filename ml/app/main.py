"""iCARE++ ML service (Phase 3): at-risk prediction + Bayesian Knowledge Tracing.

Auth: every endpoint except /health requires the X-ICARE-ML-KEY header to
match ML_SERVICE_SECRET — only the Next.js server (and the nightly
scheduler in this process) may trigger scoring runs. The service is not
meant to be exposed to browsers.

The two batch jobs answer with plain JSON, or, for a caller that sends
`Accept: application/x-ndjson`, stream their progress: `{"done", "total"}`
lines as the run advances, then one `{"result"}` or `{"error"}` line. The
Next.js routes ask for the stream to drive a progress bar; the nightly
workflow's curl doesn't, and gets the same JSON body it always has.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .config import get_settings
from .db import Db
from .predictor import run_batch_predictions
from .progress import Report
from .registry import ensure_baselines_registered, list_models, promote_model
from .tracing import refresh_knowledge_tracing

logger = logging.getLogger("icare-ml")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def verify_secret(x_icare_ml_key: str | None = Header(default=None)) -> None:
    expected = get_settings().ml_service_secret.encode()
    if not hmac.compare_digest((x_icare_ml_key or "").encode(), expected):
        raise HTTPException(status_code=401, detail="invalid or missing X-ICARE-ML-KEY")


async def _nightly_loop() -> None:
    settings = get_settings()
    hour, minute = (int(part) for part in settings.schedule_time.split(":"))
    while True:
        now = datetime.now()
        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            db = Db()
            try:
                predictions = await asyncio.to_thread(run_batch_predictions, db)
                tracing = await asyncio.to_thread(refresh_knowledge_tracing, db)
                retrain = await asyncio.to_thread(_retrain, db)
                logger.info("nightly run: predictions=%s tracing=%s retrain=%s", predictions, tracing, retrain)
            finally:
                db.close()
        except Exception:
            logger.exception("nightly run failed; retrying tomorrow")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    try:
        db = Db()
        try:
            seeded = ensure_baselines_registered(db)
            if seeded:
                logger.info("registered baseline models: %s", seeded)
        finally:
            db.close()
    except Exception:
        logger.exception("baseline registration failed at startup (will retry on first predict)")
    task = None
    if settings.schedule_enabled:
        task = asyncio.create_task(_nightly_loop())
        logger.info("nightly scheduler enabled at %s", settings.schedule_time)
    yield
    if task:
        task.cancel()


app = FastAPI(title="iCARE++ ML service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "icare-ml"}


@app.get("/models", dependencies=[Depends(verify_secret)])
def models() -> list[dict]:
    db = Db()
    try:
        return list_models(db)
    finally:
        db.close()


@app.post("/models/{model_id}/promote", dependencies=[Depends(verify_secret)])
def promote(model_id: str) -> dict:
    db = Db()
    try:
        try:
            return promote_model(db, model_id)
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error))
    finally:
        db.close()


def _retrain(db: Db, force: bool = False) -> dict[str, Any]:
    # Imported here: training pulls in the trainer's extra modules, which the
    # scoring endpoints never need.
    from training.train_icare import train_and_register

    try:
        return train_and_register(db, force=force, log=logger.info)
    except Exception:
        logger.exception("iCARE retrain failed")
        return {"error": "retrain failed"}


class RetrainRequest(BaseModel):
    force: bool = False


@app.post("/models/retrain", dependencies=[Depends(verify_secret)])
async def retrain(body: RetrainRequest | None = None) -> dict:
    """Retrain the at-risk models on iCARE data and register them as staging,
    once there are enough labeled students (finalized case grades, faculty
    validations) and some were labeled since the last retrain. One goes live
    on its own if it clears the switch gate in training/train_icare.py. A
    failure answers 500, so the nightly workflow shows it."""
    db = Db()
    try:
        result = await asyncio.to_thread(_retrain, db, bool(body and body.force))
    finally:
        db.close()
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


NDJSON = "application/x-ndjson"

Job = Callable[[Db, Report | None], dict[str, Any]]

# Streamed jobs run as tasks the response doesn't await, and the event loop
# holds tasks only weakly: without this a job could be collected mid-run.
_streamed_jobs: set[asyncio.Task[None]] = set()


async def _run(job: Job, accept: str | None) -> dict[str, Any] | StreamingResponse:
    if NDJSON in (accept or ""):
        return StreamingResponse(
            _stream(job),
            media_type=NDJSON,
            # Keeps a buffering proxy from holding every line until the end.
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )
    db = Db()
    try:
        return await asyncio.to_thread(job, db, None)
    except RuntimeError as error:
        raise HTTPException(status_code=409, detail=str(error))
    finally:
        db.close()


async def _stream(job: Job) -> AsyncIterator[str]:
    loop = asyncio.get_running_loop()
    events: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def report(done: int, total: int) -> None:
        # Runs on the job's worker thread.
        loop.call_soon_threadsafe(events.put_nowait, {"done": done, "total": total})

    async def run() -> None:
        db = Db()
        try:
            result = await asyncio.to_thread(job, db, report)
            events.put_nowait({"result": result})
        except RuntimeError as error:
            events.put_nowait({"error": str(error)})
        except Exception:
            logger.exception("streamed ML job failed")
            events.put_nowait({"error": "ML job failed"})
        finally:
            db.close()
            events.put_nowait(None)

    # The job runs to completion even if the caller disconnects: its writes
    # are already under way, and a thread can't be cancelled anyway.
    task = asyncio.create_task(run())
    _streamed_jobs.add(task)
    task.add_done_callback(_streamed_jobs.discard)

    while (event := await events.get()) is not None:
        yield json.dumps(event) + "\n"


class PredictRequest(BaseModel):
    student_ids: list[str] | None = None


@app.post("/predict/at-risk", dependencies=[Depends(verify_secret)])
async def predict_at_risk(
    body: PredictRequest | None = None, accept: str | None = Header(default=None)
) -> Any:
    student_ids = body.student_ids if body else None

    def job(db: Db, report: Report | None) -> dict[str, Any]:
        ensure_baselines_registered(db)
        return run_batch_predictions(db, student_ids, report)

    return await _run(job, accept)


class RecommendRefreshRequest(BaseModel):
    student_ids: list[str] | None = None
    # Ignored: kept so callers from before the TF-IDF recommender was removed still validate.
    k: int | None = None


@app.post("/recommend/refresh", dependencies=[Depends(verify_secret)])
async def recommend_refresh(
    body: RecommendRefreshRequest | None = None, accept: str | None = Header(default=None)
) -> Any:
    """Refit the BKT parameters (a whole-cohort run only). The path is kept from
    when this also refreshed TF-IDF quiz picks, so the web app and the nightly
    workflow call it unchanged."""
    student_ids = body.student_ids if body else None

    def job(db: Db, report: Report | None) -> dict[str, Any]:
        return refresh_knowledge_tracing(db, student_ids, report)

    return await _run(job, accept)
