"""iCARE++ ML service (Phase 3): at-risk prediction + quiz recommendation.

Auth: every endpoint except /health requires the X-ICARE-ML-KEY header to
match ML_SERVICE_SECRET — only the Next.js server (and the nightly
scheduler in this process) may trigger scoring runs. The service is not
meant to be exposed to browsers.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from .config import get_settings
from .db import Db
from .predictor import run_batch_predictions
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


class PredictRequest(BaseModel):
    student_ids: list[str] | None = None


@app.post("/predict/at-risk", dependencies=[Depends(verify_secret)])
async def predict_at_risk(body: PredictRequest | None = None) -> dict:
    db = Db()
    try:
        ensure_baselines_registered(db)
        try:
            return await asyncio.to_thread(
                run_batch_predictions, db, body.student_ids if body else None
            )
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error))
    finally:
        db.close()


class RecommendRefreshRequest(BaseModel):
    student_ids: list[str] | None = None
    k: int | None = None


@app.post("/recommend/refresh", dependencies=[Depends(verify_secret)])
async def recommend_refresh(body: RecommendRefreshRequest | None = None) -> dict:
    db = Db()
    try:
        return await asyncio.to_thread(
            refresh_recommendations,
            db,
            body.student_ids if body else None,
            body.k if body else None,
        )
    finally:
        db.close()


@app.get("/recommend/{student_id}", dependencies=[Depends(verify_secret)])
async def recommend(student_id: str, k: int = 5) -> dict:
    db = Db()
    try:
        items = await asyncio.to_thread(recommendations_for_student, db, student_id, k)
        return {"student_id": student_id, "recommendations": items}
    finally:
        db.close()
