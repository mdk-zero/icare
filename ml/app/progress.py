"""Step counting for the batch jobs, so a caller can show how far a run has got.

A job's work is partly fixed (the table loads every run makes) and partly per
student (the recommender rewrites each student's list separately), and the
student count is only known once the roster has been read. `students()` adds
that part before the first step is reported, so the total a caller sees never
grows mid-run and the percentage it derives never runs backwards.
"""

from __future__ import annotations

from typing import Callable

Report = Callable[[int, int], None]
"""Receives (done, total) after every step. May be called from a worker thread."""


class Progress:
    def __init__(self, fixed_steps: int, steps_per_student: int = 0, report: Report | None = None) -> None:
        self.done = 0
        self.total = fixed_steps
        self._per_student = steps_per_student
        self._report = report

    def students(self, count: int) -> None:
        self.total += count * self._per_student

    def step(self) -> None:
        self.done = min(self.done + 1, self.total)
        if self._report is not None:
            self._report(self.done, self.total)
