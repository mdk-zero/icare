"""Bayesian Knowledge Tracing (Corbett & Anderson, 1995) per Taylor's skill.

Each skill is a two-state hidden Markov model: the student either knows it
or doesn't, and each quiz answer on it is a noisy observation of that state.
Four parameters per skill:

    p_init   P(L0)  the student already knows the skill before any answer
    p_learn  P(T)   they move from not knowing to knowing after an answer
    p_guess  P(G)   they answer right without knowing it
    p_slip   P(S)   they answer wrong despite knowing it

Fitting is expectation-maximisation (Baum-Welch) over every student's answer
sequence for the skill, in the order the answers were given — the algorithm
pyBKT uses, written out here so the service keeps no native build
dependency. Guess and slip are capped below 0.5 (Baker, Corbett & Aleven,
2008): above it the model is degenerate, "knowing" predicting wrong answers.

Cold start: a skill with too few answers to fit takes its chapter's pooled
fit, and failing that the defaults, and is refit on every run as answers
accumulate. The web app applies the same update rules (web/app/lib/bkt.ts)
with these parameters when it deals an adaptive quiz review.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import httpx
import numpy as np

from .db import Db

# Keep in step with DEFAULT_BKT in web/app/lib/bkt.ts.
DEFAULT_P_INIT = 0.3
DEFAULT_P_LEARN = 0.1
DEFAULT_P_GUESS = 0.2
DEFAULT_P_SLIP = 0.1

GUESS_MAX = 0.4
SLIP_MAX = 0.4
FLOOR = 0.001

# Fitting a skill on its own needs this much evidence; below it the chapter's
# pooled fit is used, and below that the defaults.
MIN_FIT_STUDENTS = 5
MIN_FIT_ANSWERS = 40

EM_MAX_ITERATIONS = 200
EM_TOLERANCE = 1e-6

SKILL_IN_NAME = re.compile(r"\bSkills? (\d{1,2}-\d{1,2})\b")


@dataclass(frozen=True)
class BktParams:
    p_init: float
    p_learn: float
    p_guess: float
    p_slip: float

    def as_row(self) -> dict[str, float]:
        return {
            "p_init": round(self.p_init, 6),
            "p_learn": round(self.p_learn, 6),
            "p_guess": round(self.p_guess, 6),
            "p_slip": round(self.p_slip, 6),
        }


DEFAULT_PARAMS = BktParams(DEFAULT_P_INIT, DEFAULT_P_LEARN, DEFAULT_P_GUESS, DEFAULT_P_SLIP)

# Sequences keyed by skill, then student: answers in the order given.
Sequences = dict[str, dict[str, list[bool]]]


# ---------------------------------------------------------------
# The update rules
# ---------------------------------------------------------------

def predict_correct(p_known: float, params: BktParams) -> float:
    """P(the next answer is right) given P(the skill is known)."""
    return p_known * (1 - params.p_slip) + (1 - p_known) * params.p_guess


def update(p_known: float, correct: bool, params: BktParams) -> float:
    """Bayes on the observed answer, then the chance of learning from it."""
    if correct:
        evidence = p_known * (1 - params.p_slip)
        posterior = evidence / (evidence + (1 - p_known) * params.p_guess)
    else:
        evidence = p_known * params.p_slip
        posterior = evidence / (evidence + (1 - p_known) * (1 - params.p_guess))
    return posterior + (1 - posterior) * params.p_learn


def trace(params: BktParams, answers: list[bool]) -> tuple[list[float], float]:
    """The prediction made before each answer, and P(known) after the last."""
    p_known = params.p_init
    predictions = []
    for correct in answers:
        predictions.append(predict_correct(p_known, params))
        p_known = update(p_known, correct, params)
    return predictions, p_known


# ---------------------------------------------------------------
# Fitting
# ---------------------------------------------------------------

def _clip(params: BktParams) -> BktParams:
    return BktParams(
        p_init=float(np.clip(params.p_init, FLOOR, 1 - FLOOR)),
        p_learn=float(np.clip(params.p_learn, FLOOR, 1 - FLOOR)),
        p_guess=float(np.clip(params.p_guess, FLOOR, GUESS_MAX)),
        p_slip=float(np.clip(params.p_slip, FLOOR, SLIP_MAX)),
    )


def _pad(sequences: list[list[bool]]) -> tuple[np.ndarray, np.ndarray]:
    """Sequences as one students x answers matrix, plus where each one has an answer."""
    longest = max(len(s) for s in sequences)
    obs = np.zeros((len(sequences), longest), dtype=int)
    mask = np.zeros((len(sequences), longest), dtype=bool)
    for i, seq in enumerate(sequences):
        obs[i, : len(seq)] = seq
        mask[i, : len(seq)] = True
    return obs, mask


def _em_step(params: BktParams, padded: tuple[np.ndarray, np.ndarray]) -> tuple[BktParams, float]:
    """One Baum-Welch pass over every sequence at once, returning the updated
    parameters and the log-likelihood of `params`. States: 0 = not known,
    1 = known; no forgetting. Positions past a sequence's end carry the last
    state forward and contribute nothing."""
    obs, mask = padded
    n, steps = obs.shape
    transition = np.array([[1 - params.p_learn, params.p_learn], [0.0, 1.0]])
    # emission[state, observation]: observation 1 = correct
    emission = np.array([
        [1 - params.p_guess, params.p_guess],
        [params.p_slip, 1 - params.p_slip],
    ])
    start = np.array([1 - params.p_init, params.p_init])
    emit = emission[:, obs].transpose(1, 2, 0)  # n x steps x 2: P(answer | state)

    alpha = np.zeros((n, steps, 2))
    scale = np.ones((n, steps))
    first = start * emit[:, 0]
    scale[:, 0] = first.sum(axis=1)
    alpha[:, 0] = first / scale[:, 0, None]
    for t in range(1, steps):
        step = (alpha[:, t - 1] @ transition) * emit[:, t]
        total = step.sum(axis=1)
        live = mask[:, t]
        scale[:, t] = np.where(live, total, 1.0)
        alpha[:, t] = np.where(live[:, None], step / np.where(live, total, 1.0)[:, None], alpha[:, t - 1])
    log_likelihood = float(np.log(scale).sum())

    beta = np.ones((n, steps, 2))
    for t in range(steps - 2, -1, -1):
        back = (emit[:, t + 1] * beta[:, t + 1]) @ transition.T / scale[:, t + 1, None]
        beta[:, t] = np.where(mask[:, t + 1][:, None], back, 1.0)

    gamma = alpha * beta
    gamma /= gamma.sum(axis=2, keepdims=True)
    gamma *= mask[:, :, None]

    # P(not known at t, known at t+1 | the sequence), wherever t+1 exists
    nxt = mask[:, 1:]
    learned = (
        alpha[:, :-1, 0] * transition[0, 1] * emit[:, 1:, 1] * beta[:, 1:, 1] / scale[:, 1:]
    ) * nxt
    learn_den = float((gamma[:, :-1, 0] * nxt).sum())
    right = (obs == 1) & mask
    wrong = (obs == 0) & mask
    unknown = float(gamma[:, :, 0].sum())
    known = float(gamma[:, :, 1].sum())

    updated = BktParams(
        p_init=float(gamma[:, 0, 1].sum()) / n,
        p_learn=float(learned.sum()) / learn_den if learn_den > 0 else params.p_learn,
        p_guess=float((gamma[:, :, 0] * right).sum()) / unknown if unknown > 0 else params.p_guess,
        p_slip=float((gamma[:, :, 1] * wrong).sum()) / known if known > 0 else params.p_slip,
    )
    return _clip(updated), log_likelihood


def log_likelihood(params: BktParams, sequences: list[list[bool]]) -> float:
    sequences = [s for s in sequences if s]
    return _em_step(params, _pad(sequences))[1] if sequences else 0.0


def fit(sequences: list[list[bool]]) -> tuple[BktParams, float]:
    """Maximum-likelihood parameters for one skill's sequences. A few starting
    points, since EM only finds a local optimum; the best likelihood wins."""
    sequences = [s for s in sequences if s]
    if not sequences:
        return DEFAULT_PARAMS, 0.0
    padded = _pad(sequences)
    starts = [
        DEFAULT_PARAMS,
        BktParams(0.5, 0.2, 0.15, 0.08),
        BktParams(0.15, 0.05, 0.25, 0.15),
    ]
    best: tuple[BktParams, float] | None = None
    for start in starts:
        params = start
        previous = -np.inf
        for _ in range(EM_MAX_ITERATIONS):
            candidate, ll = _em_step(params, padded)
            # ll is the likelihood of `params`, the point just stepped from.
            if ll - previous < EM_TOLERANCE:
                break
            params, previous = candidate, ll
        final_ll = _em_step(params, padded)[1]
        if best is None or final_ll > best[1]:
            best = (params, final_ll)
    assert best is not None
    return best


# ---------------------------------------------------------------
# Data
# ---------------------------------------------------------------

def load_sequences(db: Db) -> tuple[Sequences, dict[str, str]]:
    """Every student's quiz answers per skill, oldest first: attempts by the
    time they were handed in, answers within one by their place on the
    paper. Graded attempts and practice runs both count — BKT models learning
    across practice. Also returns skill -> chapter (competency) id."""
    skill_chapter = {s["id"]: s["chapter_id"] for s in db.select("taylor_skills", "id,chapter_id")}
    # Filtered here rather than in the query: before web migration 083 the
    # 'practiced' status doesn't exist, and naming it would fail the read.
    attempts = [
        a for a in db.select("assessment_attempts", "id,student_id,status,submitted_at",
                             [("status", "neq", "in_progress")])
        if a["status"] in ("submitted", "practiced") and a.get("submitted_at")
    ]
    attempt_by_id = {a["id"]: a for a in attempts}
    answers = db.select("attempt_answers", "attempt_id,question_id,is_correct")
    served = db.select("attempt_questions", "attempt_id,question_id,position")
    questions = db.select("questions", "id,criteria_id,position")
    criteria = db.select("assessment_criteria", "id,skill_id,name")

    position = {(s["attempt_id"], s["question_id"]): s["position"] for s in served}
    question_position = {q["id"]: q.get("position") or 0 for q in questions}
    criteria_of = {q["id"]: q.get("criteria_id") for q in questions}
    skill_of_criterion: dict[str, str] = {}
    for c in criteria:
        skill = c.get("skill_id")
        if not skill:
            match = SKILL_IN_NAME.search(c.get("name") or "")
            skill = match.group(1) if match else None
        if skill:
            skill_of_criterion[c["id"]] = skill

    ordered = []
    for ans in answers:
        attempt = attempt_by_id.get(ans["attempt_id"])
        skill = skill_of_criterion.get(criteria_of.get(ans["question_id"]) or "")
        if attempt is None or skill is None:
            continue
        slot = position.get((ans["attempt_id"], ans["question_id"]), question_position.get(ans["question_id"], 0))
        ordered.append((attempt["student_id"], skill, attempt["submitted_at"], ans["attempt_id"], slot,
                        bool(ans["is_correct"])))
    ordered.sort(key=lambda row: (row[2], row[3], row[4]))

    sequences: Sequences = {}
    for student, skill, _at, _attempt, _slot, correct in ordered:
        sequences.setdefault(skill, {}).setdefault(student, []).append(correct)
    return sequences, skill_chapter


@dataclass
class SkillFit:
    params: BktParams
    source: str  # 'fitted' | 'chapter' | 'default'
    answers: int
    students: int
    log_likelihood: float | None


def _enough(seqs: list[list[bool]]) -> bool:
    return len(seqs) >= MIN_FIT_STUDENTS and sum(len(s) for s in seqs) >= MIN_FIT_ANSWERS


def fit_skills(sequences: Sequences, skill_chapter: dict[str, str]) -> dict[str, SkillFit]:
    """Parameters for every skill with answers: its own fit when it has
    enough evidence, else its chapter's pooled fit, else the defaults."""
    by_chapter: dict[str, list[list[bool]]] = {}
    for skill, per_student in sequences.items():
        chapter = skill_chapter.get(skill)
        if chapter:
            by_chapter.setdefault(chapter, []).extend(per_student.values())
    chapter_fit = {
        chapter: fit(seqs)[0] for chapter, seqs in by_chapter.items() if _enough(seqs)
    }

    out: dict[str, SkillFit] = {}
    for skill, per_student in sequences.items():
        seqs = list(per_student.values())
        answers = sum(len(s) for s in seqs)
        if _enough(seqs):
            params, ll = fit(seqs)
            source = "fitted"
        elif skill_chapter.get(skill) in chapter_fit:
            params = chapter_fit[skill_chapter[skill]]
            ll = log_likelihood(params, seqs)
            source = "chapter"
        else:
            params = DEFAULT_PARAMS
            ll = log_likelihood(params, seqs)
            source = "default"
        out[skill] = SkillFit(params, source, answers, len(seqs), ll)
    return out


def ensure_bkt_registered(db: Db) -> str | None:
    """A registry row so bkt_parameters.model_id stays auditable. None before
    web migration 084 adds the 'knowledge_tracing' kind."""
    try:
        rows = db.select(
            "ml_models", "id",
            [("kind", "eq", "knowledge_tracing"), ("status", "eq", "active")],
            limit=1,
        )
    except httpx.HTTPStatusError:
        return None
    if rows:
        return rows[0]["id"]
    created = db.insert(
        "ml_models",
        [{
            "name": "Bayesian Knowledge Tracing (per Taylor's skill, EM-fitted)",
            "kind": "knowledge_tracing",
            "version": "1.0.0",
            "status": "active",
            "metrics": {},
            "is_baseline": False,
        }],
        returning=True,
    )
    return created[0]["id"]


def refresh_bkt_parameters(db: Db) -> dict[str, Any]:
    """Refit every skill and replace bkt_parameters. Skipped, not failed,
    before web migration 084: the review then runs on the defaults."""
    sequences, skill_chapter = load_sequences(db)
    fits = fit_skills(sequences, skill_chapter)
    sources = {s: sum(1 for f in fits.values() if f.source == s) for s in ("fitted", "chapter", "default")}

    model_id = ensure_bkt_registered(db)
    if model_id is None:
        return {"skills": len(fits), **sources, "written": False, "reason": "migration 084 not applied"}
    rows = [
        {
            "skill_id": skill,
            **f.params.as_row(),
            "source": f.source,
            "answers": f.answers,
            "students": f.students,
            "log_likelihood": None if f.log_likelihood is None else round(f.log_likelihood, 4),
            "model_id": model_id,
        }
        for skill, f in fits.items()
    ]
    db.delete("bkt_parameters", [("skill_id", "neq", "")])
    db.insert("bkt_parameters", rows)
    return {"skills": len(fits), **sources, "written": True}
