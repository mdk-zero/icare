/**
 * Seeds a small teaching ward: rooms, admitted patients occupying them, and
 * one beginner scenario per patient.
 *
 * Distinct from seed-mimic-demo.ts, which needs the MIMIC-IV demo CSVs on
 * disk and produces real de-identified admissions with whatever diagnoses
 * they happen to carry. This one is self-contained and deliberately mild —
 * fevers, dehydration, an uncomplicated UTI — so the first thing a student
 * meets is a case they can actually work through.
 *
 * The point of pairing the two: a scenario's patient_case is DERIVED from the
 * patient row rather than written out beside it, so the vitals a student reads
 * in the scenario brief are the same numbers the EHR and Vitals screens show.
 * Hand-authored scenarios drift from their patient the moment either is
 * edited; these cannot.
 *
 * What each scenario asks the student to DO comes from one source: the skill
 * checklists in Lynn & LeBon, "Skill Checklists for Taylor's Clinical Nursing
 * Skills: A Nursing Process Approach", 3rd ed. (Wolters Kluwer / LWW, 2011),
 * shipped in docs/ — Chapters 1, 14 and 15 (Vital Signs, Oxygenation, and
 * Fluid, Electrolyte, and Acid–Base Balance). Each case names the Taylor's
 * skills its patient calls for, and each skill becomes one task whose
 * sub-tasks are that skill's checklist steps word for word, built exactly as
 * the app builds a faculty-created scenario (app/lib/skill-tasks.ts). A skill
 * with alternative routes (oral, tympanic, axillary temperature) names the
 * route the case uses. seed-scenario-quizzes.ts builds each paired skill
 * assessment from the same skills.
 *
 * The catalog comes from scripts/data/taylor-skills.json; with migrations 045
 * and 047 applied (and seed-taylor-skills.ts run) each task and sub-task is
 * also linked to its catalog row. Sub-tasks need migration 044; before it
 * they are skipped with a warning and the tasks are still written.
 *
 * Safe to re-run: patients upsert on (subject_id, hadm_id), rooms are matched
 * by room_number within the campus, and a scenario is matched by title (or
 * the title it had before). Its tasks are matched by skill and updated in
 * place, and their sub-tasks by position, so the ratings students already
 * have on them survive a re-run; only tasks for skills removed from this file
 * are deleted, taking their ratings along.
 *
 *   npx tsx scripts/seed-basic-cases.ts
 *   npx tsx scripts/seed-basic-cases.ts --scenarios-only
 *   npx tsx scripts/seed-basic-cases.ts --tasks-only
 *   npx tsx scripts/seed-basic-cases.ts --check      (validate content only)
 *
 * --scenarios-only rewrites the scenarios that already exist (title, brief,
 * objectives) and their tasks; --tasks-only just the tasks. Neither touches
 * rooms, nor upserts patients (which would reset every seeded patient's
 * admission date and status).
 */

import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { skillTaskFields, skillTaskSteps } from '../app/lib/skill-tasks';
import { INCLUDED_CHAPTERS, type ExtractedSkill } from './extract-taylor-skills';
import catalog from './data/taylor-skills.json';

config({ path: '.env.local' });

type RoomStatus = 'active' | 'inactive' | 'maintenance';
type Difficulty = 'beginner' | 'intermediate' | 'advanced';
type TaskCategory = 'assessment' | 'intervention' | 'medication' | 'communication' | 'documentation';
type Verification = 'system' | 'faculty';
type Trigger = 'vitals' | 'charting' | null;

interface Vitals {
  heart_rate: number;
  blood_pressure: string;
  temperature: number;
  respiratory_rate: number;
  oxygen_saturation: number;
}

/** A skill a case calls for; `sections` picks the route of a skill with alternatives. */
type SkillPick = string | { id: string; sections: string[] };

/** A task as written to the database: the skill's task, with its checklist steps. */
interface TaskSeed {
  skillId: string;
  title: string;
  description: string;
  category: TaskCategory;
  points: number;
  verification: Verification;
  system_trigger: Trigger;
  steps: { title: string; source: string; position: number }[];
}

const SKILLS = new Map((catalog as ExtractedSkill[]).map((s) => [s.id, s]));

/** The tasks a case's skills become — the same builders the app uses. */
function tasksFor(picks: readonly SkillPick[]): TaskSeed[] {
  return picks.map((pick) => {
    const id = typeof pick === 'string' ? pick : pick.id;
    const skill = SKILLS.get(id)!;
    const steps = skill.steps.map((st, i) => ({ position: i + 1, stepNo: st.number, section: st.section, text: st.text }));
    return {
      skillId: id,
      ...skillTaskFields(skill),
      steps: skillTaskSteps(id, steps, typeof pick === 'string' ? undefined : pick.sections).map((st) => ({
        title: st.title,
        source: st.source,
        position: st.position,
      })),
    };
  });
}

interface CaseSeed {
  /** Stable synthetic ids. The 9xxxxx range keeps these clear of MIMIC's. */
  subject_id: number;
  hadm_id: number;
  name: string;
  age: number;
  gender: 'M' | 'F';
  diagnosis: string;
  medical_history: string;
  /** Where this patient belongs clinically. Falls back to any open bed. */
  room_number: string;
  vitals: Vitals;
  labs: Record<string, number>;
  scenario: {
    title: string;
    description: string;
    category: string;
    chief_complaint: string;
    physical_exam: string;
    treatment_plan: string;
    learning_objectives: string[];
    /** The Taylor's skills the case calls for, in task order. */
    skills: SkillPick[];
    /**
     * The title this scenario had before it was rebuilt on the Taylor's
     * checklists. A re-run finds the old row by it and renames it in place, so
     * the scenario keeps its id — and seed-student-history.ts, which clears
     * assignments by scenario id, still finds and rebuilds the old ones.
     */
    formerly?: string;
  };
}

/**
 * The same ten rooms seed-mimic-demo.ts creates, with the same numbers and
 * capacities, so running either script does not produce a second ward. Plan
 * coordinates are filled in here — two rows of five on the 24x16 grid — so
 * the floor plan has something to render instead of ten rooms in the
 * unplaced tray.
 */
const WARD_ROOMS: {
  name: string;
  room_number: string;
  capacity: number;
  status: RoomStatus;
  description: string;
  plan_x: number;
  plan_y: number;
}[] = [
  { name: 'Skills Laboratory A', room_number: '101', capacity: 12, status: 'active', description: 'Basic nursing skills practice — beds, mannequins, and supply carts.', plan_x: 0, plan_y: 0 },
  { name: 'Skills Laboratory B', room_number: '102', capacity: 12, status: 'active', description: 'IV therapy, wound care, and medication administration stations.', plan_x: 5, plan_y: 0 },
  { name: 'Health Assessment Room', room_number: '104', capacity: 10, status: 'active', description: 'Head-to-toe physical assessment stations.', plan_x: 10, plan_y: 0 },
  { name: 'Debriefing Room', room_number: '105', capacity: 20, status: 'active', description: 'Post-scenario debriefing and reflection.', plan_x: 15, plan_y: 0 },
  { name: 'Community Health Room', room_number: '106', capacity: 10, status: 'inactive', description: 'Community and public-health teaching space (currently unused).', plan_x: 20, plan_y: 0 },
  { name: 'Simulation Ward', room_number: '201', capacity: 8, status: 'active', description: 'High-fidelity med-surg simulation with monitored beds.', plan_x: 0, plan_y: 4 },
  { name: 'Maternity Simulation Suite', room_number: '202', capacity: 6, status: 'active', description: 'Obstetric and newborn care simulation.', plan_x: 5, plan_y: 4 },
  { name: 'Pediatric Simulation Room', room_number: '203', capacity: 6, status: 'active', description: 'Pediatric and neonatal scenarios.', plan_x: 10, plan_y: 4 },
  { name: 'Simulation Ward B', room_number: '204', capacity: 8, status: 'maintenance', description: 'Temporarily closed for equipment upgrades.', plan_x: 15, plan_y: 4 },
  { name: 'ICU Simulation Bay', room_number: '301', capacity: 6, status: 'active', description: 'Critical care simulation with ventilator and telemetry.', plan_x: 20, plan_y: 4 },
];

const PLAN_W = 4;
const PLAN_H = 3;

const CASES: CaseSeed[] = [
  {
    subject_id: 900001,
    hadm_id: 800001,
    name: 'Rosa Delgado',
    age: 21,
    gender: 'F',
    diagnosis: 'Acute viral upper respiratory infection with fever',
    medical_history: 'Generally well. No chronic illness, no maintenance medication, no known allergies.',
    room_number: '201',
    vitals: { heart_rate: 96, blood_pressure: '118/74', temperature: 38.2, respiratory_rate: 20, oxygen_saturation: 98 },
    labs: { 'White Blood Cells': 11.2, Hemoglobin: 13.1, 'Platelet Count': 245, Sodium: 138, Potassium: 4.1, Creatinine: 0.8 },
    scenario: {
      title: 'Fever Workup: Temperature, Pulse and Respirations',
      formerly: 'Fever Workup: Vital Signs and a Nasopharyngeal Swab',
      description:
        'A young adult admitted overnight with a two-day history of fever, sore throat, and body aches. She is alert, talking in full sentences, and asking when she can go home. Nothing here is unstable. The work is Chapter 1 of Taylor’s done properly: an accurate oral temperature, a palpated radial pulse, and a respiratory rate counted without her noticing, with her oxygen saturation checked alongside. Taylor’s Skills 1-1, 1-4, 1-6, 14-1.',
      category: 'General',
      chief_complaint: 'Fever and body aches for two days',
      physical_exam: 'Alert and cooperative. Flushed, warm to touch, mildly dry lips. Throat red without exudate. Chest clear on auscultation. No rash, no neck stiffness.',
      treatment_plan: 'Temperature (oral), pulse, respirations, and SpO₂ every 4 hours. Paracetamol 500 mg orally every 6 hours as needed for temperature above 38.0 °C, with a recheck of the temperature after the dose. Encourage oral fluids. Escalate for difficulty breathing, SpO₂ below 95%, confusion, or a fever that will not come down.',
      learning_objectives: [
        'Measure an oral temperature with the probe in the posterior sublingual pocket (Taylor’s Skill 1-1)',
        'Palpate a radial pulse, counting a full minute whenever rate, rhythm, or amplitude is abnormal (Skill 1-4)',
        'Count respirations with the fingers still on the pulse, noting depth and rhythm (Skill 1-6)',
        'Apply a pulse oximeter to a well-perfused site and interpret the reading (Skill 14-1)',
      ],
      skills: [{ id: '1-1', sections: ['Assessing Oral Temperature'] }, '1-4', '1-6', '14-1'],
    },
  },
  {
    subject_id: 900002,
    hadm_id: 800002,
    name: 'Mateo Salazar',
    age: 34,
    gender: 'M',
    diagnosis: 'Acute gastroenteritis with mild dehydration',
    medical_history: 'No chronic illness. Ate at a roadside eatery two days before admission.',
    room_number: '201',
    vitals: { heart_rate: 102, blood_pressure: '106/68', temperature: 37.8, respiratory_rate: 18, oxygen_saturation: 99 },
    labs: { Sodium: 134, Potassium: 3.4, Creatinine: 1.1, 'Urea Nitrogen': 22, Hemoglobin: 14.2, 'White Blood Cells': 9.4 },
    scenario: {
      title: 'Dehydration: Starting and Monitoring a Peripheral IV',
      formerly: 'Dehydration: Peripheral IV and Stool Culture',
      description:
        'A previously well adult with two days of loose stools and vomiting. He is thirsty and a little tachycardic, and his potassium is drifting low. The orders are Chapter 15 work: start a peripheral IV and run PNSS, then check the site and the infusion every hour, with his pulse and blood pressure telling you whether the fluids are working. Taylor’s Skills 15-1, 15-3, 1-4, 1-7.',
      category: 'Medical-Surgical',
      chief_complaint: 'Loose stools and vomiting for two days',
      physical_exam: 'Alert, mildly weak. Dry mucous membranes, skin turgor slightly reduced. Abdomen soft with active bowel sounds, mild generalised tenderness. Capillary refill under 3 seconds.',
      treatment_plan: 'Insert a peripheral IV and start PNSS at the ordered rate. Check the site and flow 30 minutes after starting, then at least hourly. Pulse and blood pressure every 2 hours until the heart rate settles below 100. Strict intake and output; report urine output under 30 mL/hr, a falling blood pressure, or worsening weakness.',
      learning_objectives: [
        'Initiate a peripheral IV infusion with aseptic technique, a correctly placed tourniquet, and a 10–15° insertion angle (Taylor’s Skill 15-1)',
        'Monitor an IV site and infusion hourly, recognising infiltration, phlebitis, infection, and fluid overload (Skill 15-3)',
        'Palpate a peripheral pulse and measure blood pressure to judge the response to fluids (Skills 1-4, 1-7)',
      ],
      skills: ['15-1', '15-3', '1-4', '1-7'],
    },
  },
  {
    subject_id: 900003,
    hadm_id: 800003,
    name: 'Liza Fontanilla',
    age: 27,
    gender: 'F',
    diagnosis: 'Uncomplicated urinary tract infection',
    medical_history: 'Two similar episodes in the past three years, both resolved with oral antibiotics. No allergies.',
    room_number: '101',
    vitals: { heart_rate: 92, blood_pressure: '122/78', temperature: 38.0, respiratory_rate: 18, oxygen_saturation: 99 },
    labs: { 'White Blood Cells': 12.8, Hemoglobin: 12.6, Creatinine: 0.9, Sodium: 139, Potassium: 4.0 },
    scenario: {
      title: 'UTI with Low-Grade Fever: A Full Set of Vital Signs',
      formerly: 'UTI: Clean-Catch Urine and Oral Antibiotics',
      description:
        'A young woman admitted with burning on urination, frequency, and a low-grade fever. She has had this twice before and is otherwise well. The antibiotics are ordered; the nursing work is catching early sepsis if it comes. That means a full, accurate set of vital signs — tympanic temperature, pulse, respirations, and blood pressure — taken by the book and trended every four hours. Taylor’s Skills 1-1, 1-4, 1-6, 1-7.',
      category: 'Infection Management',
      chief_complaint: 'Burning on urination and needing to pass urine frequently',
      physical_exam: 'Alert and comfortable. Suprapubic tenderness on light palpation. No costovertebral angle tenderness. Urine cloudy with a strong odour.',
      treatment_plan: 'Oral antibiotic as ordered. Temperature (tympanic), pulse, respirations, and blood pressure every 4 hours. Oral fluids 2–3 litres daily, paracetamol for discomfort. Escalate a temperature above 38.5 °C, a heart rate above 100, a respiratory rate above 20, or a systolic pressure below 100 mm Hg.',
      learning_objectives: [
        'Measure a tympanic temperature, straightening the ear canal by pulling the pinna up and back in an adult (Taylor’s Skill 1-1)',
        'Palpate a radial pulse and count respirations accurately (Skills 1-4, 1-6)',
        'Measure brachial blood pressure with the correct cuff size and deflation rate (Skill 1-7)',
        'Recognise the vital sign changes that suggest the infection is spreading, and report them',
      ],
      skills: [{ id: '1-1', sections: ['Measuring a Tympanic Membrane Temperature'] }, '1-4', '1-6', '1-7'],
    },
  },
  {
    subject_id: 900004,
    hadm_id: 800004,
    name: 'Ernesto Bautista',
    age: 52,
    gender: 'M',
    diagnosis: 'Newly diagnosed stage 1 hypertension',
    medical_history: 'Sedentary office work, smokes half a pack daily, father had a stroke at 60. No current medication.',
    room_number: '104',
    vitals: { heart_rate: 78, blood_pressure: '152/94', temperature: 36.8, respiratory_rate: 16, oxygen_saturation: 99 },
    labs: { Sodium: 141, Potassium: 4.3, Creatinine: 1.0, 'Total Cholesterol': 232, Glucose: 104, Hemoglobin: 15.1 },
    scenario: {
      title: 'New Hypertension: Accurate Blood Pressure and Apical Pulse',
      formerly: 'New Hypertension: Accurate BP and Cardiovascular Assessment',
      description:
        'A middle-aged man admitted for observation after a high reading at a community screening. He feels completely well and says the machine at the mall “must be broken.” The answer is a reading nobody can argue with: Taylor’s brachial blood pressure technique, step by step, with a palpated systolic estimate first. Then confirm his heart rate at the apex and compare it with the radial pulse. Taylor’s Skills 1-7, 1-5, 1-4.',
      category: 'Patient Education',
      chief_complaint: 'No symptoms — referred after a high reading at a screening',
      physical_exam: 'Well-looking, no distress. Heart sounds normal, no murmurs. No peripheral oedema. No visual disturbance or headache.',
      treatment_plan: 'Manual blood pressure twice daily in both arms, seated and rested, per Skill 1-7. Apical pulse for a full minute with each check, compared against the radial pulse. Low-salt diet counselling and a smoking cessation referral.',
      learning_objectives: [
        'Measure brachial blood pressure accurately: cuff placement, a palpated systolic estimate, and deflation at 2–3 mm Hg per second (Taylor’s Skill 1-7)',
        'Auscultate the apical pulse at the fifth intercostal space, left midclavicular line, for a full minute (Skill 1-5)',
        'Palpate the radial pulse and explain any difference from the apical rate (Skill 1-4)',
      ],
      skills: ['1-7', '1-5', '1-4'],
    },
  },
  {
    subject_id: 900005,
    hadm_id: 800005,
    name: 'Joana Rivas',
    age: 19,
    gender: 'F',
    diagnosis: 'Mild asthma exacerbation, responding to bronchodilator',
    medical_history: 'Asthma since childhood, salbutamol inhaler as needed. Triggered by dust and cold air. No previous intubation.',
    room_number: '203',
    vitals: { heart_rate: 98, blood_pressure: '124/80', temperature: 36.9, respiratory_rate: 22, oxygen_saturation: 95 },
    labs: { 'White Blood Cells': 8.1, Hemoglobin: 12.9, Sodium: 140, Potassium: 3.9 },
    scenario: {
      title: 'Asthma: Pulse Oximetry, Respirations and Nasal Cannula Oxygen',
      formerly: 'Asthma: Pulse Oximetry, Inhaler and Nebulizer',
      description:
        'A student nurse of the same age, admitted after wheezing through the night. She is speaking in full sentences with a saturation of 95% on room air: mild, and improving on her bronchodilator. The orders are Taylor’s Chapter 14: continuous pulse oximetry, a careful respiratory assessment after each dose, and oxygen by nasal cannula if her saturation will not hold. Taylor’s Skills 14-1, 1-6, 14-3.',
      category: 'Respiratory Emergency',
      chief_complaint: 'Wheezing and tight chest since last night',
      physical_exam: 'Alert, speaking full sentences. Mild expiratory wheeze on both sides. No accessory muscle use, no cyanosis. Sitting upright by preference.',
      treatment_plan: 'Pulse oximetry with alarms set; move the sensor on schedule. Salbutamol as ordered. Oxygen by nasal cannula at 2 L/min if SpO₂ stays below 95% after the bronchodilator. Reassess respirations, lung sounds, and SpO₂ after every dose.',
      learning_objectives: [
        'Choose, prepare, and check a pulse oximeter sensor site, and set its alarms (Taylor’s Skill 14-1)',
        'Count respirations and describe their depth, rhythm, and effort (Skill 1-6)',
        'Apply oxygen by nasal cannula at the ordered flow with the safety precautions Skill 14-3 requires',
        'Evaluate the response by reassessing respirations and SpO₂ after each intervention',
      ],
      skills: ['14-1', '1-6', '14-3'],
    },
  },
  {
    subject_id: 900006,
    hadm_id: 800006,
    name: 'Rafael Ocampo',
    age: 24,
    gender: 'M',
    diagnosis: 'Post-operative day 1, uncomplicated appendectomy',
    medical_history: 'Previously healthy. Laparoscopic appendectomy yesterday evening, no intraoperative complications.',
    room_number: '201',
    vitals: { heart_rate: 88, blood_pressure: '118/72', temperature: 37.6, respiratory_rate: 18, oxygen_saturation: 98 },
    labs: { 'White Blood Cells': 10.6, Hemoglobin: 13.4, 'Platelet Count': 288, Sodium: 139, Potassium: 4.2, Creatinine: 0.9 },
    scenario: {
      title: 'Post-Op Day One: Incentive Spirometry and the IV Site',
      formerly: 'Post-Op Day One: Dressing, Breathing Exercises and Comfort',
      description:
        'A young man on his first day after a straightforward laparoscopic appendectomy, guarding his abdomen and reluctant to breathe deeply. A low-grade temperature on day one is expected, but shallow breathing invites atelectasis. Teach incentive spirometry and get a return demonstration, then check his peripheral IV site and infusion and change the dressing that has lifted at one edge. Taylor’s Skills 14-2, 15-3, 15-4, 1-1.',
      category: 'Medical-Surgical',
      chief_complaint: 'Pain around the surgical site, reluctant to move',
      physical_exam: 'Alert, guarding the abdomen. Three laparoscopic port sites clean and dry, no redness or discharge. Bowel sounds present but sluggish. Pain 5/10 on movement, 2/10 at rest.',
      treatment_plan: 'Analgesia as ordered before exercises. Incentive spirometer 10 breaths every 1–2 hours while awake. IV fluids at the ordered rate; check the site hourly, and change the peripheral IV dressing today because it is loose. Temperature every 4 hours; report above 38.5 °C.',
      learning_objectives: [
        'Teach incentive spirometer use and how often to do it, and obtain a return demonstration (Taylor’s Skill 14-2)',
        'Monitor a peripheral IV site and infusion, recognising infiltration and phlebitis (Skill 15-3)',
        'Change a peripheral venous access dressing without dislodging the catheter (Skill 15-4)',
        'Measure an axillary temperature and interpret a low-grade post-operative fever (Skill 1-1)',
      ],
      skills: ['14-2', '15-3', '15-4', { id: '1-1', sections: ['Assessing Axillary Temperature'] }],
    },
  },
  {
    subject_id: 900007,
    hadm_id: 800007,
    name: 'Corazon Villamor',
    age: 61,
    gender: 'F',
    diagnosis: 'Mild cellulitis of the left lower leg',
    medical_history: 'Type 2 diabetes for eight years on metformin. Scratched her leg gardening five days ago.',
    room_number: '101',
    vitals: { heart_rate: 94, blood_pressure: '126/80', temperature: 38.1, respiratory_rate: 18, oxygen_saturation: 98 },
    labs: { 'White Blood Cells': 13.4, Glucose: 168, 'Hemoglobin A1c': 7.8, Creatinine: 1.0, Sodium: 138, Potassium: 4.4 },
    scenario: {
      title: 'Cellulitis: IV Antibiotic Through a Saline Lock',
      formerly: 'Cellulitis with Diabetes: Glucose, Insulin and IV Antibiotic',
      description:
        'An older woman with type 2 diabetes and a warm, red, tender area on her left shin after a gardening scratch. She has a low fever. Her IV antibiotic runs intermittently, so between doses her peripheral line is capped and flushed as a saline lock; before each dose the site is assessed, and her temperature tells you whether the antibiotic is working. Taylor’s Skills 15-5, 15-3, 1-1.',
      category: 'Infection Management',
      chief_complaint: 'Red, painful, swollen area on the left lower leg',
      physical_exam: 'Alert and comfortable at rest. Left shin with a well-demarcated area of redness roughly 8 cm across, warm and tender, no fluctuance or pus. Pedal pulses present. Sensation intact.',
      treatment_plan: 'IV antibiotic every 8 hours as ordered through the peripheral access device; cap and flush it with saline between doses. Assess the IV site before each dose. Temperature (oral) every 4 hours. Capillary glucose before meals. Mark the border of the redness and re-measure each shift; keep the limb elevated.',
      learning_objectives: [
        'Cap a peripheral venous access device for intermittent use and flush it to keep it patent (Taylor’s Skill 15-5)',
        'Assess the IV site for infiltration, phlebitis, and infection before each dose (Skill 15-3)',
        'Measure an oral temperature and trend the response to antibiotics (Skill 1-1)',
      ],
      skills: ['15-5', '15-3', { id: '1-1', sections: ['Assessing Oral Temperature'] }],
    },
  },
  {
    subject_id: 900008,
    hadm_id: 800008,
    name: 'Nadine Corpuz',
    age: 23,
    gender: 'F',
    diagnosis: 'Iron deficiency anaemia, haemodynamically stable',
    medical_history: 'Heavy menstrual periods for over a year. Vegetarian diet. No previous transfusion.',
    room_number: '104',
    vitals: { heart_rate: 96, blood_pressure: '108/66', temperature: 36.6, respiratory_rate: 18, oxygen_saturation: 99 },
    labs: { Hemoglobin: 9.2, Hematocrit: 28.4, 'Red Blood Cells': 3.6, Ferritin: 8, 'White Blood Cells': 6.8, 'Platelet Count': 312 },
    scenario: {
      title: 'Anaemia and Dizziness: Orthostatic Vital Signs and Oxygen Saturation',
      formerly: 'Anaemia and Dizziness: Fall Prevention and Safe Ambulation',
      description:
        'A young woman admitted for investigation of tiredness and breathlessness climbing stairs. She is stable, but her haemoglobin is 9.2 and she went lightheaded standing up this morning. Measure her blood pressure and pulse lying and then standing, check her oxygen saturation at rest and after she walks, and keep her safe while you do it. Taylor’s Skills 1-7, 1-4, 14-1.',
      category: 'Medical-Surgical',
      chief_complaint: 'Tired all the time and short of breath on exertion',
      physical_exam: 'Alert, visibly pale conjunctivae and nail beds. Mild tachycardia at rest. Reports dizziness on standing. No active bleeding. Chest clear.',
      treatment_plan: 'Blood pressure and pulse lying and standing each morning; report a systolic drop of 20 mm Hg or more, or a pulse rise of 20 or more. SpO₂ at rest and after walking. Fall precautions and assistance to stand. Repeat CBC and ferritin in the morning. Oral iron with vitamin C as ordered. Escalate for chest pain or breathlessness at rest.',
      learning_objectives: [
        'Measure brachial blood pressure lying and standing, with the correct cuff size and deflation rate (Taylor’s Skill 1-7)',
        'Palpate a radial pulse with each blood pressure and identify an orthostatic rise (Skill 1-4)',
        'Use a pulse oximeter at rest and on exertion, choosing a well-perfused site (Skill 14-1)',
      ],
      skills: ['1-7', '1-4', '14-1'],
    },
  },
];

/**
 * The scenario brief is built from the patient row, not written beside it —
 * change a patient's vitals and the scenario a student reads changes with it.
 */
function patientCaseFrom(seed: CaseSeed) {
  return {
    vitals: seed.vitals,
    diagnosis: seed.diagnosis,
    medical_history: seed.medical_history,
    chief_complaint: seed.scenario.chief_complaint,
    physical_exam: seed.scenario.physical_exam,
    treatment_plan: seed.scenario.treatment_plan,
  };
}

type Supabase = SupabaseClient;

/** Every skill must be in the catalog, and every route one the skill has. */
function validate() {
  const problems: string[] = [];
  for (const seed of CASES) {
    const where = seed.scenario.title;
    const ids = new Set<string>();
    for (const pick of seed.scenario.skills) {
      const id = typeof pick === 'string' ? pick : pick.id;
      const skill = SKILLS.get(id);
      if (ids.has(id)) problems.push(`${where}: Skill ${id} is listed twice`);
      ids.add(id);
      if (!skill) {
        problems.push(`${where}: Skill ${id} is not in the catalog (chapters ${INCLUDED_CHAPTERS.join(', ')})`);
        continue;
      }
      if (typeof pick !== 'string') {
        const sections = new Set(skill.steps.map((st) => st.section));
        for (const section of pick.sections) {
          if (!sections.has(section)) problems.push(`${where}: Skill ${id} has no section "${section}"`);
        }
      }
    }
    if (ids.size === 0) problems.push(`${where}: no skills`);
  }
  if (problems.length > 0) {
    console.error(`Seed content is invalid:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
}

/** The scenario a case owns: by its title, else by the title it had before. */
async function findScenario(supabase: Supabase, seed: CaseSeed): Promise<{ id: string } | null> {
  // No natural key on scenarios, so title is the handle. Keeps a re-run
  // from stacking a second copy of every case. The former title is tried
  // too, so a renamed case is updated in place rather than duplicated; the
  // current title wins if somehow both exist.
  const titles = [seed.scenario.title, ...(seed.scenario.formerly ? [seed.scenario.formerly] : [])];
  const { data: matches } = await supabase.from('scenarios').select('id, title').in('title', titles);
  const rows = (matches ?? []) as { id: string; title: string }[];
  return rows.find((m) => m.title === seed.scenario.title) ?? rows[0] ?? null;
}

/** Before migration 044 the sub-task table doesn't exist; before 047 there are no skill links. */
let stepsAvailable = true;
let linksAvailable = true;

const isMissingColumn = (e: { code?: string } | null) => e?.code === '42703' || e?.code === 'PGRST204';

/** The skill a task already in the database is: its link, else the "(Skill 1-7)" in its title. */
function skillOfRow(row: { title: string; skill_id?: string | null }): string | null {
  return row.skill_id ?? /\(Skill (\d+-\d+)\)\s*$/.exec(row.title)?.[1] ?? null;
}

/** Catalog step ids by "skill:position", once 045 is applied and seeded; empty before. */
async function catalogStepIds(supabase: Supabase): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const { data, error } = await supabase.from('taylor_skill_steps').select('id, skill_id, position');
  if (error || !data || data.length === 0) {
    console.warn('Catalog steps not in the database yet (migration 045 + seed-taylor-skills.ts): sub-tasks are written unlinked.');
    return ids;
  }
  for (const row of data) ids.set(`${row.skill_id}:${row.position}`, row.id as string);
  return ids;
}

/**
 * Make a scenario's tasks match `seeds`, in order, matching existing rows by
 * skill. Updating in place keeps each task's id, so the completions and
 * ratings students already have on it survive; deleting and re-inserting
 * would cascade them away. Only tasks no longer in the list are deleted.
 */
async function syncTasks(
  supabase: Supabase,
  scenarioId: string,
  seeds: TaskSeed[],
  stepIds: ReadonlyMap<string, string>,
): Promise<{ tasks: number; steps: number }> {
  let read = await supabase.from('scenario_tasks').select('id, title, skill_id').eq('scenario_id', scenarioId);
  if (read.error && isMissingColumn(read.error)) {
    linksAvailable = false;
    read = (await supabase.from('scenario_tasks').select('id, title').eq('scenario_id', scenarioId)) as typeof read;
  }
  if (read.error) {
    console.error('Failed to read scenario tasks:', read.error.message);
    process.exit(1);
  }
  const existing = (read.data ?? []) as { id: string; title: string; skill_id?: string | null }[];
  const bySkill = new Map<string, string>();
  for (const t of existing) {
    const skill = skillOfRow(t);
    if (skill && !bySkill.has(skill)) bySkill.set(skill, t.id);
  }
  const kept = new Set<string>();
  let steps = 0;

  for (const [i, t] of seeds.entries()) {
    const fields = {
      title: t.title,
      description: t.description,
      category: t.category,
      points: t.points,
      verification: t.verification,
      system_trigger: t.system_trigger,
      sort_order: i + 1,
      ...(linksAvailable && stepIds.size > 0 ? { skill_id: t.skillId } : {}),
    };
    let taskId = bySkill.get(t.skillId);
    if (taskId) {
      const { error: updateError } = await supabase.from('scenario_tasks').update(fields).eq('id', taskId);
      if (updateError) {
        console.error(`Failed to update task "${t.title}":`, updateError.message);
        process.exit(1);
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('scenario_tasks')
        .insert({ scenario_id: scenarioId, ...fields })
        .select('id')
        .single();
      if (insertError || !inserted) {
        console.error(`Failed to create task "${t.title}":`, insertError?.message);
        process.exit(1);
      }
      taskId = (inserted as { id: string }).id;
    }
    kept.add(taskId);
    steps += await syncSteps(supabase, taskId, t, stepIds);
  }

  const stale = existing.filter((t) => !kept.has(t.id)).map((t) => t.id);
  if (stale.length > 0) {
    const { error: deleteError } = await supabase.from('scenario_tasks').delete().in('id', stale);
    if (deleteError) {
      console.error('Failed to remove old tasks:', deleteError.message);
      process.exit(1);
    }
  }
  return { tasks: seeds.length, steps };
}

/**
 * A task's sub-tasks, matched by position: the checklist is the book's, so
 * the n-th row stays the n-th row and keeps any rating on it. The same step
 * text can appear twice in one skill, which rules out matching by title.
 */
async function syncSteps(
  supabase: Supabase,
  taskId: string,
  task: TaskSeed,
  stepIds: ReadonlyMap<string, string>,
): Promise<number> {
  if (!stepsAvailable) return 0;
  const { data, error } = await supabase
    .from('scenario_task_steps')
    .select('id, sort_order')
    .eq('task_id', taskId)
    .order('sort_order');
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      stepsAvailable = false;
      console.warn('Sub-tasks skipped: apply migration 044 (scenario task steps), then run this again.');
      return 0;
    }
    console.error('Failed to read sub-tasks:', error.message);
    process.exit(1);
  }
  const existing = (data ?? []) as { id: string; sort_order: number }[];
  const rows = task.steps.map((st, i) => {
    const link = linksAvailable ? stepIds.get(`${task.skillId}:${st.position}`) : undefined;
    return { title: st.title, source: st.source, sort_order: i + 1, ...(link ? { skill_step_id: link } : {}) };
  });

  for (const [i, row] of rows.entries()) {
    const current = existing[i];
    const write = current
      ? supabase.from('scenario_task_steps').update(row).eq('id', current.id)
      : supabase.from('scenario_task_steps').insert({ task_id: taskId, ...row });
    const { error: writeError } = await write;
    if (writeError) {
      console.error(`Failed to write sub-task ${i + 1} of "${task.title}":`, writeError.message);
      process.exit(1);
    }
  }
  const stale = existing.slice(rows.length).map((s) => s.id);
  if (stale.length > 0) {
    const { error: deleteError } = await supabase.from('scenario_task_steps').delete().in('id', stale);
    if (deleteError) {
      console.error('Failed to remove old sub-tasks:', deleteError.message);
      process.exit(1);
    }
  }
  return rows.length;
}

/** The scenario row a case writes; the patient and author are filled in by the full run. */
function scenarioFields(seed: CaseSeed) {
  return {
    title: seed.scenario.title,
    description: seed.scenario.description,
    difficulty: 'beginner' as Difficulty,
    category: seed.scenario.category,
    patient_case: patientCaseFrom(seed),
    learning_objectives: seed.scenario.learning_objectives,
    is_ai_generated: false,
  };
}

async function main() {
  validate();
  if (process.argv.includes('--check')) {
    const tasks = CASES.flatMap((c) => tasksFor(c.scenario.skills));
    const steps = tasks.reduce((sum, t) => sum + t.steps.length, 0);
    console.log(`Content OK: ${CASES.length} scenarios, ${tasks.length} tasks, ${steps} sub-tasks. Nothing written.`);
    for (const c of CASES) {
      console.log(`  ${c.scenario.title}`);
      for (const t of tasksFor(c.scenario.skills)) console.log(`    ${t.title} — ${t.steps.length} steps`);
    }
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stepIds = await catalogStepIds(supabase);

  const scenariosOnly = process.argv.includes('--scenarios-only');
  if (scenariosOnly || process.argv.includes('--tasks-only')) {
    let taskCount = 0;
    let stepCount = 0;
    for (const seed of CASES) {
      const scenario = await findScenario(supabase, seed);
      if (!scenario) {
        console.warn(`  Skipped "${seed.scenario.title}": no such scenario yet. Run without flags to create it.`);
        continue;
      }
      if (scenariosOnly) {
        const { error } = await supabase.from('scenarios').update(scenarioFields(seed)).eq('id', scenario.id);
        if (error) {
          console.error(`Failed to update scenario "${seed.scenario.title}":`, error.message);
          process.exit(1);
        }
      }
      const synced = await syncTasks(supabase, scenario.id, tasksFor(seed.scenario.skills), stepIds);
      taskCount += synced.tasks;
      stepCount += synced.steps;
      console.log(`  ${seed.scenario.title}: ${synced.tasks} tasks, ${synced.steps} sub-tasks`);
    }
    console.log(
      `${scenariosOnly ? 'Scenarios' : 'Tasks'} only: ${taskCount} tasks, ${stepCount} sub-tasks written. Rooms and patients untouched.`,
    );
    return;
  }

  // Attribution. Faculty first, then admin — a scenario with a null author
  // renders as "Unknown" in the faculty list.
  const { data: author } = await supabase
    .from('users')
    .select('id, email, role')
    .in('role', ['faculty', 'admin'])
    .order('role', { ascending: true })
    .limit(1)
    .maybeSingle();
  const createdBy = author?.id ?? null;
  console.log(author ? `Attributing to ${author.email} (${author.role}).` : 'No faculty or admin user found — leaving author blank.');

  // Campus. The rooms unique constraint is (campus_id, room_number), and in
  // Postgres a NULL campus_id makes every row distinct — so rooms seeded
  // without one would duplicate on the next run.
  const { data: campus } = await supabase.from('campuses').select('id, name').limit(1).maybeSingle();
  if (!campus) {
    console.error('No campus found. Seed a campus first — rooms need one to stay de-duplicated.');
    process.exit(1);
  }
  console.log(`Campus: ${campus.name}`);

  // ---- Rooms -----------------------------------------------------------
  const { data: existingRooms } = await supabase
    .from('rooms')
    .select('id, room_number')
    .eq('campus_id', campus.id);
  const byNumber = new Map((existingRooms ?? []).map((r) => [r.room_number, r.id]));

  const toInsert = WARD_ROOMS.filter((r) => !byNumber.has(r.room_number)).map((r) => ({
    campus_id: campus.id,
    name: r.name,
    room_number: r.room_number,
    capacity: r.capacity,
    status: r.status,
    description: r.description,
    plan_x: r.plan_x,
    plan_y: r.plan_y,
    plan_w: PLAN_W,
    plan_h: PLAN_H,
  }));

  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase.from('rooms').insert(toInsert).select('id, room_number');
    if (error) {
      console.error('Failed to create rooms:', error.message);
      process.exit(1);
    }
    for (const r of inserted ?? []) byNumber.set(r.room_number, r.id);
  }
  console.log(`Rooms: ${toInsert.length} created, ${WARD_ROOMS.length - toInsert.length} already present.`);

  // Only active rooms take patients. seed-mimic-demo fills the first room
  // with space regardless of status, which quietly admits people into a ward
  // that is closed for maintenance.
  const openRooms = WARD_ROOMS.filter((r) => r.status === 'active')
    .map((r) => ({ ...r, id: byNumber.get(r.room_number)! }))
    .filter((r) => r.id);

  // Beds already taken by admitted patients, so a re-run does not overfill.
  const occupancy = new Map<string, number>();
  const { data: admitted } = await supabase
    .from('patients')
    .select('room_id, subject_id')
    .eq('status', 'admitted')
    .not('room_id', 'is', null);
  const seededSubjects = new Set(CASES.map((c) => c.subject_id));
  for (const p of admitted ?? []) {
    // Rows this script owns are about to be rewritten; don't count them twice.
    if (seededSubjects.has(p.subject_id)) continue;
    occupancy.set(p.room_id!, (occupancy.get(p.room_id!) ?? 0) + 1);
  }

  // ---- Patients --------------------------------------------------------
  const admissionBase = Date.now() - 1000 * 60 * 60 * 24;
  const patientRows = CASES.map((seed, i) => {
    // Each case names the room it belongs in, so the ward reads like a ward
    // rather than eight people stacked in whichever room came back first.
    // A full or missing room falls back to any open bed so the seed still
    // completes against a hand-edited rooms table.
    const hasSpace = (r: { id: string; capacity: number }) =>
      (occupancy.get(r.id) ?? 0) < r.capacity;
    const preferred = openRooms.find((r) => r.room_number === seed.room_number);
    const room =
      preferred && hasSpace(preferred)
        ? preferred
        : openRooms.find(hasSpace) ?? null;
    if (preferred && room && room.id !== preferred.id) {
      console.warn(`  ${seed.name}: room ${seed.room_number} unavailable, using ${room.room_number}.`);
    }
    if (room) occupancy.set(room.id, (occupancy.get(room.id) ?? 0) + 1);
    return {
      subject_id: seed.subject_id,
      hadm_id: seed.hadm_id,
      mimic_id: `SIM-${seed.subject_id}`,
      name: seed.name,
      age: seed.age,
      gender: seed.gender,
      diagnosis: seed.diagnosis,
      medical_history: seed.medical_history,
      vital_signs: seed.vitals,
      labs: seed.labs,
      room_id: room?.id ?? null,
      // Must match resolveRoom() in app/lib/patient-rooms.ts — the EHR, Vitals
      // and AI paths all read this denormalized label.
      room_number: room ? `${room.name} · Room ${room.room_number}` : '',
      status: 'admitted' as const,
      admission_date: new Date(admissionBase + i * 60 * 60 * 1000).toISOString(),
      created_by: createdBy,
    };
  });

  const { data: patients, error: patientError } = await supabase
    .from('patients')
    .upsert(patientRows, { onConflict: 'subject_id,hadm_id' })
    .select('id, subject_id, name, room_number');
  if (patientError) {
    console.error('Failed to seed patients:', patientError.message);
    process.exit(1);
  }
  const patientBySubject = new Map((patients ?? []).map((p) => [p.subject_id, p]));
  console.log(`Patients: ${patients?.length ?? 0} upserted.`);

  // ---- Scenarios + tasks ----------------------------------------------
  let created = 0;
  let updated = 0;
  let taskCount = 0;
  let stepCount = 0;

  for (const seed of CASES) {
    const patient = patientBySubject.get(seed.subject_id);
    const row = {
      ...scenarioFields(seed),
      patient_id: patient?.id ?? null,
      created_by: createdBy,
    };

    const existing = await findScenario(supabase, seed);

    let scenarioId: string;
    if (existing) {
      const { error } = await supabase.from('scenarios').update(row).eq('id', existing.id);
      if (error) {
        console.error(`Failed to update scenario "${seed.scenario.title}":`, error.message);
        process.exit(1);
      }
      scenarioId = existing.id;
      updated += 1;
    } else {
      const { data: inserted, error } = await supabase.from('scenarios').insert(row).select('id').single();
      if (error || !inserted) {
        console.error(`Failed to create scenario "${seed.scenario.title}":`, error?.message);
        process.exit(1);
      }
      scenarioId = inserted.id;
      created += 1;
    }

    const synced = await syncTasks(supabase, scenarioId, tasksFor(seed.scenario.skills), stepIds);
    taskCount += synced.tasks;
    stepCount += synced.steps;
  }

  console.log(`Scenarios: ${created} created, ${updated} updated. ${taskCount} tasks, ${stepCount} sub-tasks written.`);
  console.log('\nWard is ready:');
  for (const seed of CASES) {
    const patient = patientBySubject.get(seed.subject_id);
    console.log(`  ${seed.name.padEnd(20)} ${(patient?.room_number || 'no room').padEnd(38)} ${seed.scenario.title}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
