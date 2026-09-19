"""iCARE++ ML service (Phase 3): at-risk prediction + quiz recommendation.

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
from .recommender import recommendations_for_student, refresh_recommendations
from .registry import ensure_baselines_registered, list_models, promote_model

logger = logging.getLogger("icare-ml")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def verify_secret(x_icare_ml_key: str | None = Header(default=None)) -> None:
    if x_icare_ml_key != get_settings().ml_service_secret:
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
                recommendations = await asyncio.to_thread(refresh_recommendations, db)
                logger.info("nightly run: predictions=%s recommendations=%s", predictions, recommendations)
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
    k: int | None = None


@app.post("/recommend/refresh", dependencies=[Depends(verify_secret)])
async def recommend_refresh(
    body: RecommendRefreshRequest | None = None, accept: str | None = Header(default=None)
) -> Any:
    student_ids = body.student_ids if body else None
    k = body.k if body else None

    def job(db: Db, report: Report | None) -> dict[str, Any]:
        return refresh_recommendations(db, student_ids, k, report)

    return await _run(job, accept)


@app.get("/recommend/{student_id}", dependencies=[Depends(verify_secret)])
async def recommend(student_id: str, k: int = 5) -> dict:
    db = Db()
    try:
        items = await asyncio.to_thread(recommendations_for_student, db, student_id, k)
        return {"student_id": student_id, "recommendations": items}
    finally:
        db.close()
