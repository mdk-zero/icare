"""What each student practises next (Objective 2.2): Bayesian Knowledge Tracing.

BKT (app/bkt.py) estimates how well each student knows every Taylor's skill
from their quiz answers and their Patient Case and Return Demonstration
ratings. The web app reads those estimates to deal the adaptive review quiz
(the questions on the least-mastered skills first) and to choose what the
Library puts in front of the student. This job keeps the per-skill
parameters fitted.

BKT learns from every student at once and moves slowly, so only a
whole-cohort run (nightly, or an admin's) refits it; a scoped one, such as an
instructor's Assess, leaves it alone. A failed fit keeps the previous
parameters.

This replaces the content-based (TF-IDF) quiz recommender: suggesting other
quizzes is now the adaptive quiz's job, driven by the same mastery estimates.
"""

from __future__ import annotations

import logging
from typing import Any

from .bkt import refresh_bkt_parameters
from .db import Db
from .progress import Progress, Report

logger = logging.getLogger("icare-ml")


def refresh_knowledge_tracing(
    db: Db,
    student_ids: list[str] | None = None,
    report: Report | None = None,
) -> dict[str, Any]:
    progress = Progress(1, report=report)
    if student_ids:
        result: dict[str, Any] = {"bkt": {"skipped": "scoped run"}}
    else:
        try:
            result = {"bkt": refresh_bkt_parameters(db)}
        except Exception:
            logger.exception("BKT parameter fit failed")
            result = {"bkt": {"error": "BKT fit failed"}}
    progress.step()
    return result
