"""Per-student feature extraction from the iCARE++ OLTP tables (Phase 3.2).

Produces one row per student in the EXTENDED_FEATURES space plus side
channels the recommender needs (per-competency accuracy, student level).
Volumes are capstone-sized, so everything is fetched once and aggregated
in memory rather than pushed into SQL.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np

from .db import Db
from .schema import (
    ACTIVITY_RECENCY_CAP_DAYS,
    ENGAGEMENT_SATURATION_EVENTS,
    EXTENDED_FEATURES,
)

MIN_ANSWERS_PER_COMPETENCY = 3


@dataclass
class StudentFeatures:
    student_id: str
    features: dict[str, float]
    # competency_id -> answer accuracy 0-1 (only competencies with enough answers)
    competency_accuracy: dict[str, float] = field(default_factory=dict)
    attempted_assessment_ids: set[str] = field(default_factory=set)
    assigned_assessment_ids: set[str] = field(default_factory=set)


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def build_student_features(db: Db, student_ids: list[str] | None = None) -> dict[str, StudentFeatures]:
    filters: list[tuple[str, str, Any]] = [("role", "eq", "student")]
    if student_ids:
        filters.append(("id", "in", student_ids))
    students = db.select("users", "id", filters)
    ids = [s["id"] for s in students]
    if not ids:
        return {}
    id_set = set(ids)

    attempts = db.select(
        "assessment_attempts",
        "id,student_id,assessment_id,assignment_id,status,started_at,submitted_at,score,time_taken_seconds",
    )
    assignments = db.select(
        "assessment_assignments", "id,student_id,assessment_id,status,deadline"
    )
    assessments = db.select("assessments", "id,time_limit_seconds")
    answers = db.select("attempt_answers", "attempt_id,question_id,is_correct")
    question_comps = db.select("question_competencies", "question_id,competency_id")
    vitals = db.select("vital_sign_readings", "recorded_by,recorded_at")
    tpr = db.select("tpr_records", "recorded_by,created_at")
    ivf = db.select("ivf_records", "recorded_by,created_at")
    notes = db.select("progress_notes", "author_id,created_at")

    time_limits = {a["id"]: a.get("time_limit_seconds") for a in assessments}
    deadlines = {a["id"]: _parse_ts(a.get("deadline")) for a in assignments}
    attempt_owner = {a["id"]: a["student_id"] for a in attempts}
    question_to_comps: dict[str, list[str]] = {}
    for qc in question_comps:
        question_to_comps.setdefault(qc["question_id"], []).append(qc["competency_id"])

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=60)

    by_student: dict[str, dict[str, Any]] = {
        sid: {
            "submitted": [],       # (submitted_at, score, time_taken, assignment_id)
            "attempted_assessments": set(),
            "assigned_assessments": set(),
            "assignments_total": 0,
            "assignments_completed": 0,
            "comp_answers": {},    # competency_id -> [is_correct...]
            "all_answers": [],
            "clinical_count": 0,
            "recent_events": 0,
            "last_activity": None,
        }
        for sid in ids
    }

    def bump_activity(sid: str, ts: datetime | None, clinical: bool = False) -> None:
        st = by_student.get(sid)
        if st is None:
            return
        if clinical:
            st["clinical_count"] += 1
        if ts is not None:
            if st["last_activity"] is None or ts > st["last_activity"]:
                st["last_activity"] = ts
            if ts >= window_start:
                st["recent_events"] += 1

    for a in attempts:
        st = by_student.get(a["student_id"])
        if st is None:
            continue
        st["attempted_assessments"].add(a["assessment_id"])
        ts = _parse_ts(a.get("submitted_at")) or _parse_ts(a.get("started_at"))
        bump_activity(a["student_id"], ts)
        if a["status"] == "submitted" and a.get("score") is not None:
            st["submitted"].append(
                (ts, float(a["score"]), a.get("time_taken_seconds"), a.get("assignment_id"),
                 a["assessment_id"])
            )

    for asg in assignments:
        st = by_student.get(asg["student_id"])
        if st is None:
            continue
        st["assigned_assessments"].add(asg["assessment_id"])
        st["assignments_total"] += 1
        if asg["status"] == "completed":
            st["assignments_completed"] += 1

    for ans in answers:
        sid = attempt_owner.get(ans["attempt_id"])
        if sid not in id_set:
            continue
        st = by_student[sid]
        st["all_answers"].append(bool(ans["is_correct"]))
        for comp_id in question_to_comps.get(ans["question_id"], []):
            st["comp_answers"].setdefault(comp_id, []).append(bool(ans["is_correct"]))

    for row in vitals:
        bump_activity(row["recorded_by"], _parse_ts(row.get("recorded_at")), clinical=True)
    for row in tpr:
        bump_activity(row["recorded_by"], _parse_ts(row.get("created_at")), clinical=True)
    for row in ivf:
        bump_activity(row["recorded_by"], _parse_ts(row.get("created_at")), clinical=True)
    for row in notes:
        bump_activity(row["author_id"], _parse_ts(row.get("created_at")), clinical=True)

    out: dict[str, StudentFeatures] = {}
    for sid in ids:
        st = by_student[sid]
        submitted = sorted(st["submitted"], key=lambda r: (r[0] or now))
        scores = [r[1] for r in submitted]

        avg_score = float(np.mean(scores)) if scores else 0.0
        if len(scores) >= 3:
            slope = float(np.polyfit(np.arange(len(scores)), scores, 1)[0])
            score_trend = float(np.clip(slope, -50.0, 50.0))
        else:
            score_trend = 0.0

        total_assigned = st["assignments_total"]
        completion_rate = (
            st["assignments_completed"] / total_assigned if total_assigned else 1.0
        )

        with_deadline = 0
        late = 0
        for ts, _score, _tt, assignment_id, _aid in submitted:
            deadline = deadlines.get(assignment_id)
            if deadline is None or ts is None:
                continue
            with_deadline += 1
            if ts > deadline:
                late += 1
        lateness_rate = late / with_deadline if with_deadline else 0.0

        time_ratios = []
        for _ts, _score, time_taken, _asg, assessment_id in submitted:
            limit = time_limits.get(assessment_id)
            if time_taken and limit:
                time_ratios.append(min(time_taken / limit, 3.0))
        avg_time_ratio = float(np.mean(time_ratios)) if time_ratios else 1.0

        engagement_index = min(1.0, st["recent_events"] / ENGAGEMENT_SATURATION_EVENTS)

        if st["last_activity"] is not None:
            days_idle = min(
                (now - st["last_activity"]).total_seconds() / 86400,
                float(ACTIVITY_RECENCY_CAP_DAYS),
            )
        else:
            days_idle = float(ACTIVITY_RECENCY_CAP_DAYS)

        comp_accuracy = {
            comp_id: float(np.mean(answers_))
            for comp_id, answers_ in st["comp_answers"].items()
            if len(answers_) >= MIN_ANSWERS_PER_COMPETENCY
        }
        if comp_accuracy:
            weakest = min(comp_accuracy.values())
        elif st["all_answers"]:
            weakest = float(np.mean(st["all_answers"]))
        else:
            weakest = 0.5  # neutral prior when the student has no answer history

        features = {
            "avg_score": round(avg_score, 2),
            "score_trend": round(score_trend, 3),
            "attempts_count": float(len(submitted)),
            "completion_rate": round(completion_rate, 4),
            "lateness_rate": round(lateness_rate, 4),
            "engagement_index": round(engagement_index, 4),
            "days_since_last_activity": round(days_idle, 1),
            "avg_time_ratio": round(avg_time_ratio, 4),
            "weakest_competency_accuracy": round(weakest, 4),
            "clinical_activity_count": float(st["clinical_count"]),
        }
        assert set(features) == set(EXTENDED_FEATURES)

        out[sid] = StudentFeatures(
            student_id=sid,
            features=features,
            competency_accuracy=comp_accuracy,
            attempted_assessment_ids=st["attempted_assessments"],
            assigned_assessment_ids=st["assigned_assessments"],
        )
    return out
