"""Which students are simulated.

The iCARE++ Test Institution (campus code ICARE-TEST) holds the simulated class
from web/scripts/seed-student-history.ts and the fictional App Review accounts.
Real evidence comes from every other campus, such as Batangas State University,
so what a model learns must not mix the two.
"""

from __future__ import annotations

from .db import Db

SIMULATED_CAMPUS = "ICARE-TEST"


def simulated_students(db: Db) -> set[str]:
    campuses = db.select("campuses", "id", [("code", "eq", SIMULATED_CAMPUS)])
    if not campuses:
        return set()
    students = db.select(
        "users", "id",
        [("role", "eq", "student"), ("campus_id", "in", [c["id"] for c in campuses])],
    )
    return {s["id"] for s in students}
