/**
 * The demo school's teaching record: the ward, its patients, eight patient
 * cases built on Taylor's checklists, five weeks of group case work at every
 * stage (graded, awaiting review, under way), the paired quizzes and their
 * attempts.
 *
 * Everything is generated from a fixed random seed, so every demo starts from
 * the same data; only the dates move, relative to the day the demo starts.
 */

import caseTasks from "./case-tasks.json";
import { CASES, WARD_ROOMS } from "./cases-data";
import { SKILL_QUESTIONS } from "@/scripts/data/skill-questions";
import {
  DEAN_ID,
  INSTRUCTOR_ID,
  KIND,
  ago,
  ahead,
  demoId,
  type DemoTeam,
  type DemoUser,
} from "./people";
import type { TaskRating } from "@/app/lib/task-ratings";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface DemoRoom {
  id: string;
  campus_id: string | null;
  name: string;
  room_number: string;
  capacity: number;
  status: "active" | "inactive" | "maintenance";
  description: string | null;
  created_at: string;
  updated_at: string;
  plan_x: number | null;
  plan_y: number | null;
  plan_w: number | null;
  plan_h: number | null;
  plan_door: "n" | "e" | "s" | "w" | null;
}

export interface DemoVitals {
  heart_rate: number | null;
  blood_pressure: string | null;
  temperature: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
}

export interface DemoPatient {
  id: string;
  subject_id: number;
  hadm_id: number;
  mimic_id: string;
  name: string;
  age: number;
  gender: string;
  room_id: string | null;
  room_number: string;
  diagnosis: string;
  admission_date: string;
  status: "admitted" | "discharged";
  discharged_at: string | null;
  vital_signs: DemoVitals;
  labs: Record<string, number>;
  medical_history: string | null;
  created_by: string;
  created_at: string;
}

export interface DemoScenario {
  id: string;
  created_by: string;
  title: string;
  description: string;
  category: string;
  learning_objectives: string[];
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
  patient_id: string | null;
  patient_case: Record<string, unknown>;
  rubric: Record<string, string> | null;
  difficulty: string;
}

export interface DemoTask {
  id: string;
  scenario_id: string;
  title: string;
  description: string;
  category: "assessment" | "intervention" | "medication" | "communication" | "documentation";
  points: number;
  verification: "system" | "faculty";
  system_trigger: "vitals" | "charting" | null;
  sort_order: number;
  skill_id: string | null;
}

export interface DemoStep {
  id: string;
  task_id: string;
  title: string;
  source: string;
  position: number;
}

export interface DemoAssignment {
  id: string;
  scenario_id: string;
  student_id: string;
  assigned_by: string;
  assigned_at: string;
  deadline: string;
  status: "pending" | "in_progress" | "completed" | "overdue";
  required: boolean;
  score: number | null;
  started_at: string | null;
  completed_at: string | null;
  time_taken: number | null;
  submitted_at: string | null;
  finalized_by: string | null;
  team_id: string | null;
}

export interface DemoCompletion {
  assignment_id: string;
  task_id: string;
  rating: TaskRating | null;
  remarks: string | null;
  completed_via: "system" | "faculty";
  completed_at: string;
}

export interface DemoStepRating {
  assignment_id: string;
  step_id: string;
  rating: TaskRating;
}

export interface DemoQuiz {
  id: string;
  created_by: string;
  title: string;
  description: string;
  category: string;
  time_limit_seconds: number | null;
  is_published: boolean;
  is_ai_generated: boolean;
  target_sections: string[];
  /** Questions served per attempt; null serves every question. */
  total_questions: number | null;
  max_attempts: number | null;
  created_at: string;
  updated_at: string;
  scenario_id: string | null;
}

export interface DemoCriterion {
  id: string;
  assessment_id: string;
  name: string;
  weight: number;
  competency_id: string | null;
  sort_order: number;
  min_questions: number;
  created_at: string;
}

export interface DemoQuestion {
  id: string;
  assessment_id: string;
  position: number;
  content: string;
  options: string[];
  correct_index: number;
  question_type: string;
  points: number;
  explanation: string;
  criteria_id: string | null;
  competency_ids: string[];
}

export interface DemoQuizAssignment {
  id: string;
  assessment_id: string;
  student_id: string;
  assigned_by: string;
  assigned_at: string;
  deadline: string | null;
  status: "pending" | "in_progress" | "completed" | "overdue";
  required: boolean;
}

export interface DemoAttempt {
  id: string;
  assessment_id: string;
  student_id: string;
  status: "in_progress" | "submitted" | "expired";
  score: number | null;
  correct_answers: number | null;
  total_questions: number;
  started_at: string;
  submitted_at: string | null;
  time_taken_seconds: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** mulberry32: small, fast, and the same sequence on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CREDIT: Record<TaskRating, number> = { excellent: 1, satisfactory: 2 / 3, needs_practice: 1 / 3 };

function levelFor(credit: number): TaskRating {
  const score = Math.round(credit * 100);
  if (score >= 90) return "excellent";
  if (score >= 60) return "satisfactory";
  return "needs_practice";
}

/** "1-1" → "Assessing Body Temperature", read off the precomputed task titles. */
const SKILL_TITLE = new Map(
  caseTasks.flatMap((c) => c.tasks.map((t) => [t.skill_id, t.title.replace(/ \(Skill [\d-]+\)$/, "")] as const)),
);

/** The quiz paired with each case: its title, and the skills it tests (from seed-scenario-quizzes.ts). */
const QUIZ_PLANS: { title: string; skills: string[] }[] = [
  { title: "Temperature, Pulse, Respiration, and Pulse Oximetry", skills: ["1-1", "1-4", "1-6", "14-1"] },
  { title: "Peripheral IV Therapy, Pulse, and Blood Pressure", skills: ["15-1", "15-3", "1-4", "1-7"] },
  { title: "A Full Set of Vital Signs", skills: ["1-1", "1-4", "1-6", "1-7"] },
  { title: "Blood Pressure, Apical Pulse, and Radial Pulse", skills: ["1-7", "1-5", "1-4"] },
  { title: "Pulse Oximetry, Respiration, and Nasal Cannula Oxygen", skills: ["14-1", "1-6", "14-3"] },
  { title: "Incentive Spirometry, IV Site Care, and Temperature", skills: ["14-2", "15-3", "15-4", "1-1"] },
  { title: "Saline Lock, IV Site Monitoring, and Temperature", skills: ["15-5", "15-3", "1-1"] },
  { title: "Blood Pressure, Pulse, and Pulse Oximetry", skills: ["1-7", "1-4", "14-1"] },
];

/** Taylor's chapter skill areas (competency_areas ids) by chapter number. */
const AREA_BY_CHAPTER: Record<string, string> = {
  "1": "47a5fabc-e6a0-48bd-9b1b-c8e1cbf8d0d8",
  "14": "6a1a5251-8871-4e94-ab2b-57bc58f4ea5b",
  "15": "086113d0-4f87-47d2-b6b1-9ed69e3c741e",
};

/** Whole-number weights totalling 100. */
function evenWeights(n: number): number[] {
  const base = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => base + (i < 100 - base * n ? 1 : 0));
}

const REMARKS = [
  "Good technique; explain each step to the patient as you go.",
  "Remember hand hygiene before touching the patient, not only after.",
  "Counted for a full minute — well done.",
  "Check the order before you start; you went straight to the equipment.",
  "Confident and organised.",
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export function seedSchool(users: DemoUser[], teams: DemoTeam[]) {
  const random = rng(20261002);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];

  // --- Ward ---------------------------------------------------------------
  const rooms: DemoRoom[] = WARD_ROOMS.map((r, i) => ({
    id: demoId(KIND.room, i + 1),
    campus_id: null,
    name: r.name,
    room_number: r.room_number,
    capacity: r.capacity,
    status: r.status,
    description: r.description,
    created_at: ago(230),
    updated_at: ago(30),
    plan_x: r.plan_x,
    plan_y: r.plan_y,
    plan_w: 4,
    plan_h: 3,
    plan_door: i < 5 ? "s" : "n",
  }));
  const roomByNumber = new Map(rooms.map((r) => [r.room_number, r]));

  const patients: DemoPatient[] = CASES.map((c, i) => {
    const room = roomByNumber.get(c.room_number) ?? null;
    return {
      id: demoId(KIND.patient, i + 1),
      subject_id: c.subject_id,
      hadm_id: c.hadm_id,
      mimic_id: `DEMO-${c.hadm_id}`,
      name: c.name,
      age: c.age,
      gender: c.gender,
      room_id: room?.id ?? null,
      room_number: room?.room_number ?? "",
      diagnosis: c.diagnosis,
      admission_date: ago(6 - (i % 5), 9),
      status: "admitted",
      discharged_at: null,
      vital_signs: { ...c.vitals },
      labs: { ...c.labs },
      medical_history: c.medical_history,
      created_by: INSTRUCTOR_ID,
      created_at: ago(40),
    };
  });
  // Two earlier admissions, discharged, so the census has history.
  patients.push(
    {
      ...patients[0],
      id: demoId(KIND.patient, 50),
      subject_id: 900050,
      hadm_id: 800050,
      mimic_id: "DEMO-800050",
      name: "Teodoro Ilagan",
      age: 67,
      gender: "M",
      room_id: null,
      room_number: "",
      diagnosis: "Community-acquired pneumonia, resolved",
      admission_date: ago(18, 10),
      status: "discharged",
      discharged_at: ago(11, 15),
      vital_signs: { heart_rate: 80, blood_pressure: "128/82", temperature: 36.8, respiratory_rate: 17, oxygen_saturation: 97 },
      labs: { "White Blood Cells": 8.9, Hemoglobin: 13.0 },
      medical_history: "Hypertension on amlodipine. Former smoker.",
    },
    {
      ...patients[1],
      id: demoId(KIND.patient, 51),
      subject_id: 900051,
      hadm_id: 800051,
      mimic_id: "DEMO-800051",
      name: "Melinda Sarmiento",
      age: 45,
      gender: "F",
      room_id: null,
      room_number: "",
      diagnosis: "Dengue fever without warning signs, recovered",
      admission_date: ago(14, 8),
      status: "discharged",
      discharged_at: ago(9, 16),
      vital_signs: { heart_rate: 76, blood_pressure: "116/74", temperature: 36.7, respiratory_rate: 16, oxygen_saturation: 99 },
      labs: { "Platelet Count": 162, Hematocrit: 39 },
      medical_history: "No chronic illness.",
    },
  );

  // --- Patient cases ---------------------------------------------------------
  const scenarios: DemoScenario[] = [];
  const tasks: DemoTask[] = [];
  const steps: DemoStep[] = [];
  let taskN = 0;
  let stepN = 0;
  CASES.forEach((c, i) => {
    const id = demoId(KIND.scenario, i + 1);
    scenarios.push({
      id,
      created_by: i % 3 === 2 ? DEAN_ID : INSTRUCTOR_ID,
      title: c.scenario.title,
      description: c.scenario.description,
      category: c.scenario.category,
      learning_objectives: c.scenario.learning_objectives,
      is_ai_generated: false,
      created_at: ago(60 - i * 2),
      updated_at: ago(30 - i),
      patient_id: patients[i].id,
      patient_case: {
        vitals: c.vitals,
        diagnosis: c.diagnosis,
        medical_history: c.medical_history,
        chief_complaint: c.scenario.chief_complaint,
        physical_exam: c.scenario.physical_exam,
        treatment_plan: c.scenario.treatment_plan,
      },
      rubric: null,
      difficulty: "beginner",
    });
    caseTasks[i].tasks.forEach((t, sort) => {
      taskN += 1;
      const taskId = demoId(KIND.task, taskN);
      tasks.push({
        id: taskId,
        scenario_id: id,
        title: t.title,
        description: t.description,
        category: t.category as DemoTask["category"],
        points: t.points,
        verification: "faculty",
        system_trigger: null,
        sort_order: sort,
        skill_id: t.skill_id,
      });
      for (const st of t.steps) {
        stepN += 1;
        steps.push({ id: demoId(KIND.task, 10_000 + stepN), task_id: taskId, title: st.title, source: st.source, position: st.position });
      }
    });
  });

  // --- Case work: five weekly blocks ------------------------------------------
  // Block 0–2 graded, block 3 handed in and waiting for review, block 4 this
  // week's case, still open. Each group shares one case per block.
  const studentsOf = (teamId: string) => users.filter((u) => u.role === "student" && u.team_id === teamId);
  const ability = new Map(
    users
      .filter((u) => u.role === "student")
      .map((u) => [u.id, u.risk_level === "at_risk" ? 0.5 + random() * 0.12 : 0.72 + random() * 0.22]),
  );

  const assignments: DemoAssignment[] = [];
  const completions: DemoCompletion[] = [];
  const stepRatings: DemoStepRating[] = [];
  let assignmentN = 0;

  const BLOCK_START_DAYS_AGO = [32, 25, 18, 11, 3];
  teams.forEach((team, g) => {
    const supervisor = team.faculty_id ?? INSTRUCTOR_ID;
    for (let block = 0; block < 5; block++) {
      const caseIndex = (g * 2 + block) % CASES.length;
      const scenario = scenarios[caseIndex];
      const assignedAgo = BLOCK_START_DAYS_AGO[block];
      const deadline = block === 4 ? ahead(4, 17) : ago(assignedAgo - 6, 17);
      for (const student of studentsOf(team.id)) {
        assignmentN += 1;
        const skill = ability.get(student.id) ?? 0.75;
        const base: DemoAssignment = {
          id: demoId(KIND.assignment, assignmentN),
          scenario_id: scenario.id,
          student_id: student.id,
          assigned_by: supervisor,
          assigned_at: ago(assignedAgo, 8),
          deadline,
          status: "pending",
          required: true,
          score: null,
          started_at: null,
          completed_at: null,
          time_taken: null,
          submitted_at: null,
          finalized_by: null,
          team_id: team.id,
        };
        const weak = student.risk_level === "at_risk";

        if (block <= 2) {
          // Graded: every sub-task rated, the score follows from the ratings.
          const started = ago(assignedAgo - 2, 9, Math.floor(random() * 50));
          const submitted = new Date(Date.parse(started) + (35 + random() * 40) * 60_000).toISOString();
          const graded = ago(assignedAgo - 4, 15, Math.floor(random() * 50));
          let earned = 0;
          let total = 0;
          for (const task of tasks.filter((t) => t.scenario_id === scenario.id)) {
            const taskSteps = steps.filter((s) => s.task_id === task.id);
            let credit = 0;
            for (const st of taskSteps) {
              const roll = random() * 0.5 + skill * 0.85;
              const rating: TaskRating = roll > 1.0 ? "excellent" : roll > 0.72 ? "satisfactory" : "needs_practice";
              credit += CREDIT[rating];
              stepRatings.push({ assignment_id: base.id, step_id: st.id, rating });
            }
            const taskCredit = taskSteps.length ? credit / taskSteps.length : 1;
            completions.push({
              assignment_id: base.id,
              task_id: task.id,
              rating: levelFor(taskCredit),
              remarks: random() < 0.25 ? pick(REMARKS) : null,
              completed_via: "faculty",
              completed_at: graded,
            });
            earned += task.points * taskCredit;
            total += task.points;
          }
          Object.assign(base, {
            status: "completed",
            score: total ? Math.round((earned / total) * 100) : 0,
            started_at: started,
            submitted_at: submitted,
            completed_at: graded,
            time_taken: Math.round((Date.parse(submitted) - Date.parse(started)) / 1000),
            finalized_by: supervisor,
          });
        } else if (block === 3) {
          if (weak && random() < 0.7) {
            // Never handed in: past its deadline.
            Object.assign(base, { status: "overdue", started_at: ago(assignedAgo - 3, 10) });
          } else {
            const started = ago(assignedAgo - 2 - random() * 2, 9);
            Object.assign(base, {
              status: "in_progress",
              started_at: started,
              submitted_at: new Date(Date.parse(started) + (30 + random() * 45) * 60_000).toISOString(),
            });
          }
        } else if (random() < 0.4 && !weak) {
          Object.assign(base, { status: "in_progress", started_at: ago(1 - random() * 0.8) });
        }
        assignments.push(base);
      }
    }
  });

  // --- Quizzes -----------------------------------------------------------------
  const quizzes: DemoQuiz[] = [];
  const criteria: DemoCriterion[] = [];
  const questions: DemoQuestion[] = [];
  let criterionN = 0;
  let questionN = 0;
  QUIZ_PLANS.forEach((plan, i) => {
    const id = demoId(KIND.quiz, i + 1);
    const named = plan.skills.map((s) => `${s} (${SKILL_TITLE.get(s)})`).join(", ");
    quizzes.push({
      id,
      created_by: INSTRUCTOR_ID,
      title: plan.title,
      description: `A skill assessment built from Taylor’s skill checklists ${named} — the skills the “${CASES[i].scenario.title}” patient case calls for.`,
      category: CASES[i].scenario.category,
      time_limit_seconds: 900,
      is_published: true,
      is_ai_generated: false,
      target_sections: ["BSN 3101", "BSN 3102"],
      total_questions: 6,
      max_attempts: 2,
      created_at: ago(58 - i * 2),
      updated_at: ago(40 - i),
      scenario_id: scenarios[i].id,
    });
    const weights = evenWeights(plan.skills.length);
    plan.skills.forEach((skill, ci) => {
      criterionN += 1;
      const criterionId = demoId(KIND.criteria, criterionN);
      criteria.push({
        id: criterionId,
        assessment_id: id,
        name: `Skill ${skill} · ${SKILL_TITLE.get(skill) ?? "Skill"}`,
        weight: weights[ci],
        competency_id: AREA_BY_CHAPTER[skill.split("-")[0]] ?? null,
        sort_order: ci,
        min_questions: 1,
        created_at: ago(58 - i * 2),
      });
      for (const q of SKILL_QUESTIONS[skill] ?? []) {
        questionN += 1;
        questions.push({
          id: demoId(KIND.question, questionN),
          assessment_id: id,
          position: questions.filter((x) => x.assessment_id === id).length + 1,
          content: q.content,
          options: q.options,
          correct_index: q.correct_index,
          question_type: "multiple_choice",
          points: 10,
          explanation: q.explanation,
          criteria_id: criterionId,
          competency_ids: AREA_BY_CHAPTER[skill.split("-")[0]] ? [AREA_BY_CHAPTER[skill.split("-")[0]]] : [],
        });
      }
    });
  });

  // Each group takes the quiz paired with every case it has worked so far.
  const quizAssignments: DemoQuizAssignment[] = [];
  const attempts: DemoAttempt[] = [];
  let quizAssignN = 0;
  let attemptN = 0;
  teams.forEach((team, g) => {
    for (let block = 0; block < 5; block++) {
      const caseIndex = (g * 2 + block) % CASES.length;
      const quiz = quizzes[caseIndex];
      const assignedAgo = BLOCK_START_DAYS_AGO[block];
      for (const student of studentsOf(team.id)) {
        const skill = ability.get(student.id) ?? 0.75;
        const weak = student.risk_level === "at_risk";
        quizAssignN += 1;
        const qa: DemoQuizAssignment = {
          id: demoId(KIND.quiz, 1000 + quizAssignN),
          assessment_id: quiz.id,
          student_id: student.id,
          assigned_by: team.faculty_id ?? INSTRUCTOR_ID,
          assigned_at: ago(assignedAgo, 8),
          deadline: block === 4 ? ahead(5, 23, 59) : ago(assignedAgo - 5, 23, 59),
          status: "pending",
          required: true,
        };
        const takes = block < 4 ? (weak && random() < 0.35 ? 0 : 1 + (random() < 0.3 ? 1 : 0)) : random() < 0.35 ? 1 : 0;
        for (let t = 0; t < takes; t++) {
          attemptN += 1;
          const correct = Math.max(1, Math.min(6, Math.round(6 * (skill + (t ? 0.08 : 0) + (random() - 0.5) * 0.3))));
          const started = ago(assignedAgo - 1 - t - random() * 2, 19, Math.floor(random() * 50));
          const taken = 240 + Math.floor(random() * 520);
          attempts.push({
            id: demoId(KIND.attempt, attemptN),
            assessment_id: quiz.id,
            student_id: student.id,
            status: "submitted",
            score: Math.round((correct / 6) * 100),
            correct_answers: correct,
            total_questions: 6,
            started_at: started,
            submitted_at: new Date(Date.parse(started) + taken * 1000).toISOString(),
            time_taken_seconds: taken,
          });
        }
        qa.status = takes > 0 ? "completed" : block < 4 ? "overdue" : "pending";
        quizAssignments.push(qa);
      }
    }
  });

  return {
    rooms,
    patients,
    scenarios,
    tasks,
    steps,
    assignments,
    completions,
    stepRatings,
    quizzes,
    criteria,
    questions,
    quizAssignments,
    attempts,
  };
}
