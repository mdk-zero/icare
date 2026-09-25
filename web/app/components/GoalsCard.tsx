"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullseye, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { fetchStudentGoals, setGoalStatus, type StudentGoal } from "../lib/api";

/**
 * The goals a student set when reflecting on graded work, open ones first.
 * Ticking one marks it met; ticking again reopens it.
 */
export default function GoalsCard() {
  const [goals, setGoals] = useState<StudentGoal[] | null>(null);

  useEffect(() => {
    let live = true;
    void fetchStudentGoals().then((g) => live && setGoals(g));
    return () => {
      live = false;
    };
  }, []);

  const toggle = async (goal: StudentGoal) => {
    const next = goal.status === "met" ? "open" : "met";
    setGoals((prev) => prev?.map((g) => (g.id === goal.id ? { ...g, status: next } : g)) ?? prev);
    if (!(await setGoalStatus(goal.id, next))) {
      setGoals((prev) => prev?.map((g) => (g.id === goal.id ? goal : g)) ?? prev);
    }
  };

  const open = goals?.filter((g) => g.status === "open").length ?? 0;

  return (
    <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-gray-800">
        <FontAwesomeIcon icon={faBullseye} className="h-4 w-4 text-brand-600" />
        My Goals
      </h3>
      <p className="mb-4 text-xs text-gray-500">
        {goals === null ? "Loading…" : goals.length === 0 ? "Set goals when you reflect on a graded scenario or skill assessment." : `${open} open`}
      </p>
      {goals && goals.length > 0 && (
        <ul className="space-y-2">
          {goals.slice(0, 8).map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={g.status === "met"}
                  onChange={() => void toggle(g)}
                  className="mt-0.5 accent-brand-600"
                />
                <span className={g.status === "met" ? "text-gray-400 line-through" : "text-gray-800"}>{g.text}</span>
                {g.status === "met" && <FontAwesomeIcon icon={faCircleCheck} className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
