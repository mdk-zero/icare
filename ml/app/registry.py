"""Model registry (Phase 3.4): artifact loading, baseline seeding, promotion.

Artifacts are joblib bundles referenced from public.ml_models.artifact_url:
either a path relative to the ml/ root (the shipped OULAD baselines, under
ml/models/), or "storage:<bucket>/<key>" for a model retrained on iCARE data,
kept in Supabase Storage because the host's own disk doesn't survive a
restart. A storage artifact is downloaded once and cached. A bundle is:

    {
      "kind": "random_forest" | "logistic_regression",
      "version": "...",
      "model": fitted sklearn estimator,
      "scaler": fitted StandardScaler (LogReg) or None (RF),
      "feature_names": [...],
      "feature_means": {name: mean}, "feature_stds": {name: std},
      "metrics": {...}, "trained_on": "oulad" | "icare", "trained_at": iso ts,
    }
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

import joblib

from .config import ML_ROOT, get_settings
from .db import Db

MODEL_KINDS = ("random_forest", "logistic_regression")


STORAGE_PREFIX = "storage:"
_CACHE_DIR = Path(tempfile.gettempdir()) / "icare-ml-models"


def load_artifact(relative_path: str) -> dict[str, Any]:
    if relative_path.startswith(STORAGE_PREFIX):
        bucket, _, key = relative_path[len(STORAGE_PREFIX):].partition("/")
        if not bucket or not key or ".." in key:
            raise ValueError(f"bad storage artifact: {relative_path}")
        cached = _CACHE_DIR / bucket / key
        if not cached.exists():
            cached.parent.mkdir(parents=True, exist_ok=True)
            db = Db()
            try:
                cached.write_bytes(db.download_object(bucket, key))
            finally:
                db.close()
        return joblib.load(cached)
    path = (ML_ROOT / relative_path).resolve()
    if not str(path).startswith(str(ML_ROOT)):
        raise ValueError(f"artifact path escapes ml root: {relative_path}")
    return joblib.load(path)


def get_active_model(db: Db, kind: str) -> dict[str, Any] | None:
    rows = db.select(
        "ml_models",
        "id,name,kind,version,status,metrics,artifact_url,is_baseline,trained_at",
        [("kind", "eq", kind), ("status", "eq", "active")],
        order="created_at.desc",
        limit=1,
    )
    return rows[0] if rows else None


def get_serving_model(db: Db) -> dict[str, Any] | None:
    """The model that scores students: the active retrained model when there
    is one, since it learned from this college's students. Until then the
    baseline of the primary kind, or whichever kind is active."""
    active = db.select(
        "ml_models",
        "id,name,kind,version,status,metrics,artifact_url,is_baseline,trained_at",
        [("kind", "in", MODEL_KINDS), ("status", "eq", "active")],
        order="created_at.desc",
    )
    primary = get_settings().primary_model_kind
    return min(active, key=lambda m: (m["is_baseline"], m["kind"] != primary), default=None)


def list_models(db: Db) -> list[dict[str, Any]]:
    return db.select(
        "ml_models",
        "id,name,kind,version,status,metrics,artifact_url,is_baseline,trained_at,created_at",
        order="created_at.desc",
    )


def promote_model(db: Db, model_id: str) -> dict[str, Any]:
    rows = db.select("ml_models", "id,kind,status", [("id", "eq", model_id)])
    if not rows:
        raise LookupError(f"model {model_id} not found")
    target = rows[0]
    db.update(
        "ml_models",
        {"status": "retired"},
        [("kind", "eq", target["kind"]), ("status", "eq", "active"), ("id", "neq", model_id)],
    )
    if target["kind"] in MODEL_KINDS:
        # get_serving_model prefers any retrained model, so one left active
        # under the other kind would keep scoring over the model just promoted.
        db.update(
            "ml_models",
            {"status": "retired"},
            [
                ("kind", "in", MODEL_KINDS),
                ("is_baseline", "eq", "false"),
                ("status", "eq", "active"),
                ("id", "neq", model_id),
            ],
        )
    db.update("ml_models", {"status": "active"}, [("id", "eq", model_id)])
    target["status"] = "active"
    return target


def ensure_baselines_registered(db: Db) -> list[str]:
    """Seed the registry with the shipped OULAD baselines on first boot.

    The manuscript commits to pre-trained baseline models during early
    deployment (Phase 3.3); this makes them appear as active registry rows
    without a manual ops step. No-op for any kind that already has an
    active model.
    """
    settings = get_settings()
    registered: list[str] = []
    for kind in MODEL_KINDS:
        if get_active_model(db, kind) is not None:
            continue
        candidates = sorted(settings.models_dir.glob(f"{kind}-*-oulad.joblib"))
        if not candidates:
            continue
        artifact_path = candidates[-1]
        bundle = joblib.load(artifact_path)
        relative = str(Path("models") / artifact_path.name)
        existing = db.select(
            "ml_models", "id", [("kind", "eq", kind), ("version", "eq", bundle["version"])]
        )
        if existing:
            db.update("ml_models", {"status": "active"}, [("id", "eq", existing[0]["id"])])
        else:
            db.insert(
                "ml_models",
                [{
                    "name": f"OULAD baseline ({kind.replace('_', ' ')})",
                    "kind": kind,
                    "version": bundle["version"],
                    "status": "active",
                    "metrics": bundle.get("metrics", {}),
                    "artifact_url": relative,
                    "is_baseline": True,
                    "trained_at": bundle.get("trained_at"),
                }],
            )
        registered.append(kind)
    return registered
