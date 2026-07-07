"""Environment-driven settings for the iCARE++ ML service."""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    service_role_key: str
    ml_service_secret: str
    risk_threshold: float
    primary_model_kind: str
    schedule_enabled: bool
    schedule_time: str  # "HH:MM", 24h
    recommend_k: int
    models_dir: Path


@lru_cache
def get_settings() -> Settings:
    return Settings(
        supabase_url=os.environ["SUPABASE_URL"].rstrip("/"),
        service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        ml_service_secret=os.environ["ML_SERVICE_SECRET"],
        risk_threshold=float(os.environ.get("ML_RISK_THRESHOLD", "0.5")),
        primary_model_kind=os.environ.get("ML_PRIMARY_MODEL_KIND", "random_forest"),
        schedule_enabled=os.environ.get("ML_SCHEDULE_ENABLED", "true").lower() == "true",
        schedule_time=os.environ.get("ML_SCHEDULE_TIME", "03:00"),
        recommend_k=int(os.environ.get("ML_RECOMMEND_K", "5")),
        models_dir=ML_ROOT / "models",
    )
