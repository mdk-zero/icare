/**
 * Fictional records for the phone screenshots in the user manual. Every name
 * comes from the web portal's demo, and every piece of clinical content is
 * read from the repo's own data: the demo ward and cases, the Taylor's skill
 * checklists, the quiz question bank and the case presentation rubric. Only
 * dates, scores and counts are set here.
 *
 * Times are fixed against the capture clock, Monday 2026-11-16 09:30 in
 * Manila, so every date on screen agrees with it.
 */

import { readFileSync } from 'node:fs';

// Node strips the types from these TypeScript files; none of them imports anything.
import { CASES, WARD_ROOMS } from '../../../../web/app/lib/demo/fixtures/cases-data.ts';
import { CASE_CRITERIA } from '../../../../web/app/lib/case-rubric.ts';
import { SKILL_QUESTIONS } from '../../../../web/scripts/data/skill-questions.ts';
import { RETURN_DEMO_FORMS } from '../../../../mobile/lib/return-demo-forms.ts';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const CASE_TASKS = json('../../../../web/app/lib/demo/fixtures/case-tasks.json');
const RETURN_DEMO_TASKS = json('../../../../web/app/lib/demo/fixtures/return-demo-tasks.json');
const TAYLOR = new Map(json('../../../../web/scripts/data/taylor-skills.json').map((s) => [s.id, s]));

/** The capture clock. */
export const NOW = '2026-11-16T09:30:00+08:00';

/** A Manila wall-clock time as an ISO string. */
const at = (date, time = '08:00') => `${date}T${time}:00+08:00`;

/** Ids shaped like the web demo's (`d{kind}-0000-4000-8000-{n}`). */
const id = (kind, n) => `d${String(kind).padStart(7, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ---------------------------------------------------------------------------
// People (web/app/lib/demo/fixtures/people.ts)
// ---------------------------------------------------------------------------

export const STUDENT = {
  id: id(1, 101),
  name: 'Angela Bautista',
  email: 'angela.bautista@student.demo.icare.ph',
  role: 'student',
  sex: 'female',
  picture_url: null,
  has_password: true,
  section: 'BSN 3101',
};

export const INSTRUCTOR = {
  id: id(1, 3),
  name: 'Maria Santos',
  email: 'maria.santos@demo.icare.ph',
  role: 'faculty',
  sex: 'female',
  picture_url: null,
  has_password: true,
  section: null,
};

/** Group A of BSN 3101, alphabetical, as the demo picks its leader. */
const GROUP_A = [
  [101, 'Angela Bautista'],
  [102, 'Mark Anthony Cruz'],
  [103, 'Kristine Dela Peña'],
  [104, 'Joshua Mendoza'],
  [105, 'Patricia Lim'],
];

// ---------------------------------------------------------------------------
// Ward (cases-data.ts, school.ts and ward.ts)
// ---------------------------------------------------------------------------

const rooms = WARD_ROOMS.map((r, i) => ({ ...r, id: id(11, i + 1), plan_w: 4, plan_h: 3, plan_door: i < 5 ? 's' : 'n' }));
const roomByNumber = new Map(rooms.map((r) => [r.room_number, r]));

const patients = CASES.map((c, i) => ({
  id: id(12, i + 1),
  name: c.name,
  age: c.age,
  gender: c.gender,
  diagnosis: c.diagnosis,
  room: roomByNumber.get(c.room_number),
  case: c,
}));
const patientNamed = (name) => patients.find((p) => p.name === name);
const caseTitled = (title) => CASE_TASKS.find((c) => c.title === title);

/** The floor plan's fixtures, as ward.ts places them. */
const FIXTURES = [
  ['corridor', 'Main corridor', 0, 3, 24, 1],
  ['nurse_station', "Nurses' station", 0, 7, 4, 2],
  ['restroom', 'Restroom', 5, 7, 2, 2],
  ['storage', 'Supply room', 8, 7, 3, 2],
  ['stairs', 'Stairs', 20, 7, 2, 2],
  ['elevator', 'Elevator', 22, 7, 2, 2],
  ['label', 'College of Nursing · 2F', 13, 8, 6, 1],
].map(([kind, label, x, y, w, h], i) => ({ id: id(18, i + 1), kind, label, plan_x: x, plan_y: y, plan_w: w, plan_h: h }));

// ---------------------------------------------------------------------------
// Patient Cases and Return Demonstrations
// ---------------------------------------------------------------------------

const ROSA = patientNamed('Rosa Delgado');
const JOANA = patientNamed('Joana Rivas');
const LIZA = patientNamed('Liza Fontanilla');
const ASSIGNED = [ROSA, JOANA, LIZA];

/** Instructor remarks from the web demo's pool (school.ts REMARKS). */
const REMARK_TECHNIQUE = 'Good technique; explain each step to the patient as you go.';
const REMARK_FULL_MINUTE = 'Counted for a full minute — well done.';

function patientCase({ n, patient, status, deadline, assignedAt, startedAt = null, score = null, completedAt = null, timeTaken = null, ratings = {} }) {
  const scenario = patient.case.scenario;
  const built = caseTitled(scenario.title);
  return {
    id: id(5, n),
    scenario_id: id(4, CASES.indexOf(patient.case) + 1),
    scenario_title: scenario.title,
    description: scenario.description,
    category: scenario.category,
    learning_objectives: scenario.learning_objectives,
    patient,
    patient_id: patient.id,
    assigned_at: assignedAt,
    deadline,
    status,
    required: true,
    score,
    submitted_at: null,
    completed_at: completedAt,
    time_taken: timeTaken,
    started_at: startedAt,
    team_name: 'Group A',
    kind: 'patient_case',
    tasks: built.tasks.map((t, i) => {
      const rating = ratings[t.skill_id] ?? null;
      return {
        id: id(6, n * 100 + i + 1),
        title: t.title,
        description: t.description,
        category: t.category,
        points: t.points,
        verification: 'faculty',
        system_trigger: null,
        sort_order: i,
        is_completed: Boolean(rating),
        completed_via: rating ? 'faculty' : null,
        completed_at: rating ? at('2026-11-16', '09:27') : null,
        rating: rating?.level ?? null,
        remarks: rating?.remarks ?? null,
        percent: rating?.percent ?? null,
        steps: t.steps.map((s, j) => ({ id: id(6, n * 10_000 + i * 100 + j + 1), title: s.title, rating: rating?.level ?? null })),
      };
    }),
  };
}

function returnDemo({ n, title, status, deadline, assignedAt, score = null, completedAt = null }) {
  const built = RETURN_DEMO_TASKS.find((r) => r.title === title);
  return {
    id: id(5, n),
    scenario_id: id(4, 100 + n),
    scenario_title: title,
    patient: null,
    patient_id: null,
    assigned_at: assignedAt,
    deadline,
    status,
    required: true,
    score,
    submitted_at: null,
    completed_at: completedAt,
    time_taken: null,
    started_at: null,
    team_name: 'Group A',
    kind: 'return_demo',
    tasks: built.tasks.map((t, i) => ({
      id: id(6, n * 100 + i + 1),
      title: t.title,
      description: t.description,
      category: t.category,
      points: t.points,
      verification: 'faculty',
      system_trigger: null,
      sort_order: i,
      is_completed: false,
      completed_via: null,
      completed_at: null,
      rating: null,
      remarks: null,
      percent: null,
      steps: t.steps.map((s, j) => ({ id: id(6, n * 10_000 + i * 100 + j + 1), title: s.title, rating: null })),
    })),
  };
}

/** Newest assigned first, as the server sends them; Home's NEXT UP is the first open one. */
export const ASSIGNMENTS = [
  patientCase({ n: 201, patient: ROSA, status: 'pending', deadline: at('2026-11-18'), assignedAt: at('2026-11-14', '08:10') }),
  returnDemo({ n: 211, title: 'Vital Signs Return Demonstration', status: 'pending', deadline: at('2026-11-19'), assignedAt: at('2026-11-12', '15:20') }),
  patientCase({
    n: 202,
    patient: JOANA,
    status: 'in_progress',
    deadline: at('2026-11-16'),
    assignedAt: at('2026-11-11', '10:05'),
    // Started 7 min 42 s before the capture clock.
    startedAt: '2026-11-16T09:22:18+08:00',
    ratings: {
      '14-1': { level: 'excellent', percent: 100, remarks: REMARK_TECHNIQUE },
      '1-6': { level: 'satisfactory', percent: 79.2, remarks: REMARK_FULL_MINUTE },
    },
  }),
  patientCase({
    n: 203,
    patient: LIZA,
    status: 'completed',
    deadline: at('2026-11-09'),
    assignedAt: at('2026-11-04', '09:00'),
    score: 88,
    completedAt: at('2026-11-09', '10:42'),
    timeTaken: 1490,
  }),
  returnDemo({
    n: 212,
    title: 'Oxygen Therapy Return Demonstration',
    status: 'completed',
    deadline: at('2026-11-03'),
    assignedAt: at('2026-10-28', '14:00'),
    score: 85,
    completedAt: at('2026-11-03', '11:15'),
  }),
];

const publicAssignment = ({ patient, tasks, description, category, learning_objectives, submitted_at, ...a }) => a;

export function studentScenarios() {
  return { assignments: ASSIGNMENTS.map(publicAssignment) };
}

export function scenarioTasks(assignmentId) {
  const a = ASSIGNMENTS.find((x) => x.id === assignmentId);
  if (!a) return null;
  return {
    tasks: a.tasks,
    assignment: {
      id: a.id,
      status: a.status,
      submitted_at: null,
      completed_at: a.completed_at,
      score: a.score,
      time_taken: a.time_taken,
      started_at: a.started_at,
    },
  };
}

export function returnDemoForms(assignmentId) {
  const a = ASSIGNMENTS.find((x) => x.id === assignmentId && x.kind === 'return_demo');
  if (!a) return null;
  // The first demo carries the PhilPEN Form, as in the web demo (return-demos.ts).
  const forms = a.id === ASSIGNMENTS[1].id
    ? RETURN_DEMO_FORMS.filter((f) => f.key === 'philpen').map((f) => ({ ...f, rows: [], submitted_at: null, updated_at: null }))
    : [];
  return { forms, locked: a.status === 'completed' };
}

export function ward() {
  const cases = ASSIGNMENTS.filter((a) => a.kind === 'patient_case');
  const occupied = new Map();
  for (const p of patients) occupied.set(p.room.id, (occupied.get(p.room.id) ?? 0) + 1);
  const assignedRooms = new Set(ASSIGNED.map((p) => p.room.id));
  return {
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      room_number: r.room_number,
      capacity: r.capacity,
      status: r.status,
      plan_x: r.plan_x,
      plan_y: r.plan_y,
      plan_w: r.plan_w,
      plan_h: r.plan_h,
      plan_door: r.plan_door,
      occupied: occupied.get(r.id) ?? 0,
      has_assignment: assignedRooms.has(r.id),
    })),
    fixtures: FIXTURES,
    patients: patients.map((p) => {
      const mine = ASSIGNED.includes(p);
      return {
        id: p.id,
        name: p.name,
        age: p.age,
        gender: p.gender,
        room_id: p.room.id,
        room_number: p.room.room_number,
        is_assigned: mine,
        ...(mine ? { diagnosis: p.diagnosis, latest_vitals: null } : {}),
      };
    }),
    assignments: cases.map((a) => ({
      id: a.id,
      scenario_id: a.scenario_id,
      scenario_title: a.scenario_title,
      description: a.description,
      category: a.category,
      learning_objectives: a.learning_objectives,
      patient_id: a.patient_id,
      assigned_at: a.assigned_at,
      deadline: a.deadline,
      status: a.status,
      required: a.required,
      score: a.score,
      submitted_at: null,
      completed_at: a.completed_at,
      tasks_done: a.tasks.filter((t) => t.rating).length + (a.status === 'completed' ? a.tasks.length : 0),
      tasks_total: a.tasks.length,
      started_at: a.started_at,
    })),
  };
}

export function myPatients() {
  return {
    patients: ASSIGNED.map((p) => ({
      id: p.id,
      name: p.name,
      age: p.age,
      gender: p.gender,
      room_number: p.room.room_number,
      diagnosis: p.diagnosis,
      admission_date: at('2026-11-10', '09:00'),
      medical_history: p.case.medical_history,
      vital_signs: {},
      mimic_id: `DEMO-${p.case.hadm_id}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// Case presentation (teaching.ts, case-rubric.ts)
// ---------------------------------------------------------------------------

const PRESENTATION = {
  id: id(16, 1),
  title: 'Case Presentation 1: A patient from your first ward week',
  instructions:
    'Choose one patient you cared for during your first ward week. Present them with initials only — no names, birthdays or hospital numbers. Cover the profile, your assessment findings, two prioritised nursing diagnoses and the care you gave.',
  deadline: at('2026-11-20', '17:00'),
};
const CASE_ID = id(17, 1);

export function myCases() {
  return {
    cases: [
      {
        id: CASE_ID,
        status: 'not_started',
        group_name: 'Group A',
        is_leader: true,
        file_name: null,
        submitted_at: null,
        graded_at: null,
        score: null,
        updated_at: at('2026-11-10', '08:00'),
        late: false,
        presentation: PRESENTATION,
      },
    ],
  };
}

export function caseDetail(caseId) {
  if (caseId !== CASE_ID) return null;
  return {
    case: {
      id: CASE_ID,
      status: 'not_started',
      is_leader: true,
      presentation: PRESENTATION,
      group: {
        id: id(18, 951),
        name: 'Group A',
        section_name: 'BSN 3101',
        leader_id: STUDENT.id,
        leader_name: STUDENT.name,
        status: 'not_started',
        file: null,
        submitted_at: null,
        late: false,
        score: null,
        remarks: '',
        graded_at: null,
        members: GROUP_A.map(([n, name], i) => ({
          student_id: id(1, n),
          submission_id: id(17, i + 1),
          name,
          picture_url: null,
          is_leader: i === 0,
        })),
      },
      ratings: [],
      criteria: CASE_CRITERIA,
    },
  };
}

// ---------------------------------------------------------------------------
// Quizzes (school.ts QUIZ_PLANS; questions from web/scripts/data/skill-questions.ts)
// ---------------------------------------------------------------------------

const skillTitle = (skillId) => TAYLOR.get(skillId)?.title ?? '';
const quizDescription = (skills, caseIndex) =>
  `A skill assessment built from Taylor’s skill checklists ${skills.map((s) => `${s} (${skillTitle(s)})`).join(', ')} — the skills the “${CASES[caseIndex].scenario.title}” patient case calls for.`;

/** The quiz the capture takes; the only one the mock can start. */
export const QUIZ_FULL_SET = id(7, 3);

function quiz({ n, title, skills, caseIndex, time = 900, questions, assignment = null, grade = null, attempts = 0, last = null, max = 1, practice = {} }) {
  return {
    id: id(7, n),
    title,
    description: quizDescription(skills, caseIndex),
    category: CASES[caseIndex].scenario.category,
    author_name: INSTRUCTOR.name,
    time_limit_seconds: time,
    question_count: questions,
    assignment,
    grade,
    attempt_count: attempts,
    last_submitted_at: last,
    max_attempts: max,
    attempts_used: attempts,
    attempts_remaining: max === null ? null : Math.max(0, max - attempts),
    ...practice,
  };
}

/** The questions of "A Full Set of Vital Signs", in the bank's order (the rectal question left out). */
const QUIZ_QUESTIONS = [
  ['1-1', 0], ['1-1', 1], ['1-1', 3],
  ['1-4', 0], ['1-4', 1], ['1-4', 3],
  ['1-6', 0], ['1-6', 2],
  ['1-7', 0], ['1-7', 1],
].map(([skill, k], i) => ({ id: id(8, 300 + i + 1), position: i + 1, skill, ...SKILL_QUESTIONS[skill][k] }));

/** The two the capture script answers wrong, one on each of the student's weakest skills. */
export const WRONG_ON = [QUIZ_QUESTIONS[7].id, QUIZ_QUESTIONS[9].id];

export function quizAnswerKey() {
  return QUIZ_QUESTIONS.map((q) => ({ id: q.id, content: q.content, options: q.options, correct_index: q.correct_index }));
}

export function assessments(state) {
  const fullSetTaken = state.submitted.has(QUIZ_FULL_SET);
  return {
    assessments: [
      quiz({
        n: 3,
        title: 'A Full Set of Vital Signs',
        skills: ['1-1', '1-4', '1-6', '1-7'],
        caseIndex: 2,
        questions: QUIZ_QUESTIONS.length,
        assignment: { id: id(7, 1003), status: fullSetTaken ? 'completed' : 'pending', deadline: at('2026-11-20', '17:00'), required: true },
        ...(fullSetTaken ? { grade: state.lastScore, attempts: 1, last: NOW } : {}),
      }),
      quiz({
        n: 5,
        title: 'Pulse Oximetry, Respiration, and Nasal Cannula Oxygen',
        skills: ['14-1', '1-6', '14-3'],
        caseIndex: 4,
        time: null,
        questions: 8,
        max: 2,
      }),
      quiz({
        n: 1,
        title: 'Temperature, Pulse, Respiration, and Pulse Oximetry',
        skills: ['1-1', '1-4', '1-6', '14-1'],
        caseIndex: 0,
        questions: 10,
        assignment: { id: id(7, 1001), status: 'completed', deadline: at('2026-11-07', '17:00'), required: true },
        grade: 82,
        attempts: 1,
        last: at('2026-11-06', '14:12'),
        practice: { practice_available: true, review_question_count: 2, practice_count: 0, last_practice_score: null },
      }),
      quiz({
        n: 4,
        title: 'Blood Pressure, Apical Pulse, and Radial Pulse',
        skills: ['1-7', '1-5', '1-4'],
        caseIndex: 3,
        questions: 10,
        grade: 74,
        attempts: 1,
        last: at('2026-10-30', '15:40'),
      }),
      quiz({
        n: 2,
        title: 'Peripheral IV Therapy, Pulse, and Blood Pressure',
        skills: ['15-1', '15-3', '1-4', '1-7'],
        caseIndex: 1,
        questions: 10,
        grade: 86,
        attempts: 1,
        last: at('2026-10-23', '10:05'),
      }),
    ],
  };
}

export const ATTEMPT_ID = id(9, 901);

export function startAttempt(quizId) {
  if (quizId !== QUIZ_FULL_SET) return null;
  return {
    // Started 90 s before the capture clock, so the timer reads 13:30.
    attempt: { id: ATTEMPT_ID, started_at: '2026-11-16T09:28:30+08:00' },
    assessment: { id: QUIZ_FULL_SET, title: 'A Full Set of Vital Signs', time_limit_seconds: 900 },
    questions: QUIZ_QUESTIONS.map((q) => ({ id: q.id, position: q.position, content: q.content, options: q.options, question_type: 'multiple_choice' })),
    resumed: false,
    attempt_number: 1,
    max_attempts: 1,
    attempts_remaining: 0,
    previous_expired: false,
    practice: false,
  };
}

/** Grades the submitted answers against the bank, as the server does. */
export function submitAttempt(answers) {
  const byId = new Map((answers ?? []).map((a) => [a.question_id, a]));
  const results = QUIZ_QUESTIONS.map((q) => {
    const given = byId.get(q.id);
    const selected = typeof given?.selected_index === 'number' ? given.selected_index : null;
    return {
      question_id: q.id,
      selected_index: selected,
      correct_index: q.correct_index,
      is_correct: selected === q.correct_index,
      explanation: q.explanation,
      skill: q.skill,
    };
  });
  const correct = results.filter((r) => r.is_correct).length;
  const score = Math.round((correct / results.length) * 100);
  return {
    score,
    correct,
    total: results.length,
    time_taken_seconds: 612,
    late: false,
    practice: false,
    results: results.map(({ skill, ...r }) => r),
    bySkill: results,
  };
}

const LEVEL = (pct) => (pct >= 83 ? 'Excellent' : pct >= 50 ? 'Satisfactory' : 'Needs Practice');

export function reflection(result) {
  const skills = ['1-1', '1-4', '1-6', '1-7'];
  const items = skills.map((skill) => {
    const rows = result ? result.bySkill.filter((r) => r.skill === skill) : [];
    const score = rows.length ? Math.round((rows.filter((r) => r.is_correct).length / rows.length) * 100) : 0;
    return { title: `Skill ${skill} · ${skillTitle(skill)}`, skill_id: skill, score, level: LEVEL(score), remarks: null };
  });
  return {
    enabled: true,
    work: { title: 'A Full Set of Vital Signs', score: result?.score ?? null, graded_at: NOW, items },
    reflection: null,
    goals: [],
    feedback: null,
    feedback_stale: false,
  };
}

// ---------------------------------------------------------------------------
// Mastery, progress and goals
// ---------------------------------------------------------------------------

/** BKT estimates, weakest first: [skill, mastery, answers, correct]. */
const MASTERY = [
  ['1-7', 0.62, 9, 5],
  ['1-6', 0.71, 8, 5],
  ['14-1', 0.78, 7, 5],
  ['1-4', 0.88, 10, 8],
  ['1-1', 0.96, 11, 10],
  ['1-5', 0.97, 6, 6],
];
const CHAPTER_AREA = { 1: 'Vital Signs', 14: 'Oxygenation' };
const MASTERED_AT = 0.95;

export function skillMastery() {
  return {
    skills: MASTERY.map(([skill, mastery, answers, correct]) => ({
      skill_id: skill,
      title: skillTitle(skill),
      mastery,
      answers,
      correct,
      source: 'fitted',
    })),
  };
}

/** Four weekly points per skill, ending at today's estimate. */
export function masteryHistory() {
  const days = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'];
  return {
    skills: [...MASTERY]
      .sort((a, b) => b[2] - a[2])
      .map(([skill, mastery, answers, correct]) => {
        const chapter = Number(skill.split('-')[0]);
        const start = Math.max(0.3, mastery - 0.3);
        return {
          skill_id: skill,
          title: skillTitle(skill),
          chapter,
          area: CHAPTER_AREA[chapter],
          mastery,
          answers,
          points: days.map((day, i) => {
            const share = (i + 1) / days.length;
            return {
              day,
              at: `${day}T15:00:00+08:00`,
              mastery: Math.round((start + (mastery - start) * share) * 100) / 100,
              answers: Math.round(answers * share),
              correct: Math.round(correct * share),
            };
          }),
        };
      }),
  };
}

export function libraryFocus() {
  const weak = MASTERY.filter(([, m]) => m < MASTERED_AT);
  const mean = (list) => list.reduce((sum, [, m]) => sum + m, 0) / list.length;
  const chapters = [1, 14]
    .map((chapter) => {
      const list = MASTERY.filter(([s]) => s.startsWith(`${chapter}-`));
      return { chapter, area: CHAPTER_AREA[chapter], mastery: Math.round(mean(list) * 100) / 100, skills: list.length };
    })
    .sort((a, b) => a.mastery - b.mastery);
  return {
    skills: weak.map(([skill, mastery]) => {
      const chapter = Number(skill.split('-')[0]);
      return { skill_id: skill, title: skillTitle(skill), chapter, area: CHAPTER_AREA[chapter], evidence: [], quiz_ids: [], mastery };
    }),
    overall: {
      mastery: Math.round(mean(MASTERY) * 100) / 100,
      skills: MASTERY.length,
      mastered: MASTERY.filter(([, m]) => m >= MASTERED_AT).length,
      chapters,
    },
    at_risk: false,
  };
}

/** Study tips for the two weakest skills, written only from their Taylor's checklist steps. */
export function tips() {
  return {
    tips: [
      {
        skill_id: '1-7',
        title: 'Estimate the systolic pressure first',
        tip: 'Before you listen, palpate the brachial or radial pulse, inflate the cuff until the pulse disappears, then deflate it and wait 1 minute (Skill 1-7, steps 12 to 15). Pump 30 mm Hg above that point and let the gauge drop 2 to 3 mm per second (step 19).',
      },
      {
        skill_id: '1-6',
        title: 'Count a full minute when breathing is abnormal',
        tip: 'Keep your fingers on the pulse and watch the chest rise and fall (Skill 1-6, steps 1 and 2). Count for 30 seconds and multiply by 2, but if the respirations are abnormal in any way, count for at least 1 full minute and note their depth and rhythm (steps 3 to 5).',
      },
    ],
    generated_at: at('2026-11-15', '20:00'),
    ai_off: false,
  };
}

export function progress() {
  const attempt = (n, quizN, title, score, submitted) => ({
    id: id(9, n),
    assessment_id: id(7, quizN),
    score,
    submitted_at: submitted,
    time_taken_seconds: 640,
    assessments: { title, category: 'General' },
  });
  return {
    attempts: [
      attempt(801, 1, 'Temperature, Pulse, Respiration, and Pulse Oximetry', 82, at('2026-11-06', '14:12')),
      attempt(802, 4, 'Blood Pressure, Apical Pulse, and Radial Pulse', 74, at('2026-10-30', '15:40')),
      attempt(803, 2, 'Peripheral IV Therapy, Pulse, and Blood Pressure', 86, at('2026-10-23', '10:05')),
    ],
    competency_scores: [
      { id: id(18, 701), competency_id: '47a5fabc-e6a0-48bd-9b1b-c8e1cbf8d0d8', score: 84, source: 'faculty', remarks: null, created_at: at('2026-11-09', '11:00'), competency_areas: { name: 'Vital Signs' } },
      { id: id(18, 702), competency_id: '6a1a5251-8871-4e94-ab2b-57bc58f4ea5b', score: 80, source: 'faculty', remarks: null, created_at: at('2026-11-03', '11:30'), competency_areas: { name: 'Oxygenation' } },
    ],
  };
}

export function goals() {
  return {
    goals: [
      { id: id(22, 1), text: 'Count every irregular pulse for a full minute', skill_id: '1-4', status: 'open', created_at: at('2026-11-06', '14:30'), met_at: null },
      { id: id(22, 2), text: 'Support the arm at heart level before taking a blood pressure', skill_id: '1-7', status: 'met', created_at: at('2026-10-30', '16:00'), met_at: at('2026-11-09', '10:50') },
    ],
  };
}

// ---------------------------------------------------------------------------
// Library (teaching.ts; titles from the Taylor's skill catalog)
// ---------------------------------------------------------------------------

const material = (n, skill, kind, title, author, course, seen) => ({
  id: id(15, n),
  skill,
  kind,
  title,
  description: '',
  youtube_id: null,
  file_name: kind === 'pdf' ? `skill-${skill}-checklist.pdf` : null,
  url: kind === 'link' ? 'https://example.com/' : null,
  published_at: at('2026-11-01', '09:00'),
  author_name: author,
  course,
  seen,
});
const NCM101 = { code: 'NCM 101', title: 'Health Assessment' };
const NCM103 = { code: 'NCM 103', title: 'Fundamentals of Nursing Practice' };
const checklistTitle = (skill) => `Skill ${skill} checklist: ${skillTitle(skill)}`;

const MATERIALS = [
  material(61, '1-1', 'pdf', checklistTitle('1-1'), 'Jose Reyes', NCM101, true),
  material(62, '1-4', 'link', checklistTitle('1-4'), 'Liza Fernandez', NCM101, true),
  material(50, '1-7', 'note', 'Blood pressure: the five mistakes we see most', 'Maria Santos', NCM101, true),
  material(63, '1-7', 'pdf', checklistTitle('1-7'), 'Maria Santos', NCM101, false),
  material(64, '14-1', 'pdf', checklistTitle('14-1'), 'Liza Fernandez', NCM101, true),
  material(65, '14-3', 'link', checklistTitle('14-3'), 'Jose Reyes', NCM103, false),
];

export function library() {
  const chapters = [1, 14].map((chapter) => {
    const ids = [...new Set(MATERIALS.filter((m) => m.skill.startsWith(`${chapter}-`)).map((m) => m.skill))];
    return {
      chapter,
      area: CHAPTER_AREA[chapter],
      skills: ids.map((skill) => ({
        id: skill,
        title: skillTitle(skill),
        materials: MATERIALS.filter((m) => m.skill === skill).map(({ skill: _skill, ...m }) => m),
      })),
    };
  });
  return { chapters, total: MATERIALS.length, unseen: MATERIALS.filter((m) => !m.seen).length };
}

// ---------------------------------------------------------------------------
// Courses (courses.ts; names and statuses as web/app/lib/course-progress.ts writes them)
// ---------------------------------------------------------------------------

export const TERM = { id: id(18, 501), name: '1st Semester AY 2026–2027', starts_on: '2026-08-17', ends_on: '2027-01-29' };

const skillReq = (skill) => `Skill ${skill} · ${skillTitle(skill)} (satisfactory or better)`;
const req = (n, name, detail, status) => ({ id: id(18, 530 + n), name, detail, done: status === null, status });

export function studentCourses() {
  return {
    courses: [
      {
        id: id(18, 521),
        course: NCM101,
        term: TERM,
        instructor: INSTRUCTOR.name,
        requirements: [
          req(1, 'Quiz #1', '3 Quizzes passed at 75%+', '2 of 3 so far'),
          req(7, 'Written Exam #1', 'Midterm written exam', 'Not scored yet'),
          req(2, 'Skill #1', skillReq('1-1'), null),
          req(3, 'Skill #2', skillReq('1-4'), null),
          req(4, 'Skill #3', skillReq('1-6'), null),
          req(5, 'Skill #4', skillReq('1-7'), null),
          req(6, 'Lab Activity #1', 'Head-to-toe assessment check-off, signed by the clinical instructor', 'Not scored yet'),
        ],
      },
      {
        id: id(18, 522),
        course: NCM103,
        term: TERM,
        instructor: INSTRUCTOR.name,
        requirements: [
          req(8, 'Patient Case #1', '3 Patient Cases graded', '1 of 3 so far'),
          req(9, 'Quiz #1', '2 Quizzes passed at 75%+', null),
          req(14, 'Written Exam #1', 'Midterm written exam', 'Not scored yet'),
          req(12, 'Case Presentation #1', `Case Presentation: ${PRESENTATION.title}`, 'Not graded yet'),
          req(10, 'Skill #1', skillReq('14-1'), null),
          req(11, 'Skill #2', skillReq('15-3'), 'No graded work yet'),
          req(13, 'Lab Activity #1', 'Oxygen therapy check-off (nasal cannula and face mask)', 'Not scored yet'),
        ],
      },
    ],
  };
}

export function facultyCourses() {
  const sections = [
    { id: id(2, 1), name: 'BSN 3101', has_group: true },
    { id: id(2, 2), name: 'BSN 3102', has_group: true },
  ];
  return {
    offerings: [
      {
        id: id(18, 521),
        course: { id: id(18, 511), ...NCM101 },
        term: TERM,
        sections,
        student_count: 15,
        requirement_count: 7,
        progress: { complete: 3, students: 15 },
      },
      {
        id: id(18, 522),
        course: { id: id(18, 512), ...NCM103 },
        term: TERM,
        sections,
        student_count: 15,
        requirement_count: 7,
        progress: { complete: 0, students: 15 },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Notifications (titles and bodies as the server writes them)
// ---------------------------------------------------------------------------

export function notifications(role) {
  if (role !== 'student') return [];
  const n = (k, type, title, body, data, createdAt, read) => ({
    id: id(13, 900 + k),
    type,
    title,
    body,
    data,
    read_at: read ? at('2026-11-12', '19:00') : null,
    created_at: createdAt,
  });
  const [a1, r1] = ASSIGNMENTS;
  return [
    // web/app/lib/notify-case-assigned.ts
    n(1, 'assignment_created', 'New patient case assigned',
      `You have been assigned "${a1.scenario_title}". You'll perform it on Wed, Nov 18.`,
      { kind: 'scenario', scenario_id: a1.scenario_id, assignment_id: a1.id, patient_id: a1.patient_id },
      at('2026-11-14', '08:10'), false),
    // web/app/api/faculty/assessments/[id]/assign/route.ts
    n(2, 'assignment_created', 'New quiz assigned', 'You have been assigned "A Full Set of Vital Signs".',
      { kind: 'quiz', assessment_id: QUIZ_FULL_SET }, at('2026-11-13', '16:45'), false),
    n(3, 'assignment_created', 'New Return Demonstration',
      `You'll demonstrate "${r1.scenario_title}" on Thu, Nov 19. Open it to see the checklist.`,
      { kind: 'return_demo', scenario_id: r1.scenario_id, assignment_id: r1.id }, at('2026-11-12', '15:20'), false),
    // web/app/lib/cases.ts, the leader's wording
    n(4, 'assignment_created', 'New case presentation assigned',
      `You are your group's leader for "${PRESENTATION.title}". Upload the group's slides (PowerPoint or PDF) when they are ready.`,
      { case_presentation_id: PRESENTATION.id, case_submission_id: CASE_ID }, at('2026-11-10', '08:00'), true),
    // web/app/lib/library.ts
    n(5, 'system', 'New study note in the Library', '"Blood pressure: the five mistakes we see most" for Skill 1-7.',
      { kind: 'library', materialId: id(15, 50), skillId: '1-7' }, at('2026-11-09', '13:30'), true),
    // web/app/lib/announcements.ts
    n(6, 'system', 'System maintenance on Saturday',
      'iCARE++ will be unavailable on Saturday from 8:00 to 10:00 AM while the system is updated. Save your work before then.',
      { kind: 'announcement', announcement_id: id(18, 801), by_name: 'Andrea Villanueva' }, at('2026-11-06', '17:00'), true),
  ];
}
