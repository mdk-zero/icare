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
 * Safe to re-run: patients upsert on (subject_id, hadm_id), rooms are matched
 * by room_number within the campus, and a scenario is matched by title — its
 * tasks are replaced rather than duplicated.
 *
 *   npx tsx scripts/seed-basic-cases.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

interface TaskSeed {
  title: string;
  description: string;
  category: TaskCategory;
  points: number;
  verification: Verification;
  system_trigger: Trigger;
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
    /** Case-specific work, on top of the two checks every case shares. */
    tasks: TaskSeed[];
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

/**
 * Every case earns these two. Both are system-verified, so a student's own
 * charting closes them and faculty are left to judge the work that actually
 * needs judging.
 */
const SHARED_TASKS: TaskSeed[] = [
  {
    title: 'Assess Patient Vital Signs',
    description: 'Take a full set of vitals — temperature, pulse, respirations, blood pressure, and oxygen saturation — and record them in the Vitals screen.',
    category: 'assessment',
    points: 10,
    verification: 'system',
    system_trigger: 'vitals',
  },
  {
    title: 'Document Your Findings',
    description: 'Write a progress note covering what you assessed, what you did, and how the patient responded.',
    category: 'documentation',
    points: 10,
    verification: 'system',
    system_trigger: 'charting',
  },
];

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
      title: 'Mild Fever: Comfort and Monitoring',
      description:
        'A young adult admitted overnight with a two-day history of fever, sore throat, and body aches. She is alert, talking in full sentences, and asking when she can go home. Nothing here is unstable — the work is a careful set of vitals, sensible comfort measures, and noticing if the picture changes.',
      category: 'General',
      chief_complaint: 'Fever and body aches for two days',
      physical_exam: 'Alert and cooperative. Flushed, warm to touch, mildly dry lips. Throat red without exudate. Chest clear on auscultation. No rash, no neck stiffness.',
      treatment_plan: 'Paracetamol for fever, oral fluids, four-hourly vitals, tepid sponging if temperature rises above 38.5 °C. Escalate for difficulty breathing, confusion, or a fever that will not come down.',
      learning_objectives: [
        'Take and record a complete, accurate set of vital signs',
        'Recognise a fever pattern that is expected versus one that needs escalation',
        'Apply non-pharmacological comfort measures and explain them to the patient',
        'Document assessment findings in clear, objective language',
      ],
      tasks: [
        { title: 'Provide Comfort Measures', description: 'Offer oral fluids, adjust bedding and clothing, and perform tepid sponging if the temperature climbs above 38.5 °C.', category: 'intervention', points: 15, verification: 'faculty', system_trigger: null },
        { title: 'Administer Antipyretic as Ordered', description: 'Give the ordered paracetamol using the rights of medication administration, then recheck the temperature after 60 minutes.', category: 'medication', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Explain Fever Care to the Patient', description: 'Teach the patient why fluids and rest matter, and which symptoms she should report to the nurse straight away.', category: 'communication', points: 15, verification: 'faculty', system_trigger: null },
      ],
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
      title: 'Mild Dehydration: Fluid Balance Basics',
      description:
        'A previously well adult with two days of loose stools and vomiting. He is thirsty and a little tachycardic but fully alert, and tolerating sips. This is a fluid-balance case: measure what goes in and what comes out, and notice that the potassium is drifting low.',
      category: 'Medical-Surgical',
      chief_complaint: 'Loose stools and vomiting for two days',
      physical_exam: 'Alert, mildly weak. Dry mucous membranes, skin turgor slightly reduced. Abdomen soft with active bowel sounds, mild generalised tenderness. Capillary refill under 3 seconds.',
      treatment_plan: 'Oral rehydration salts after each loose stool, IV maintenance fluid as ordered, strict intake and output charting, monitor for worsening weakness or reduced urine output.',
      learning_objectives: [
        'Record an accurate intake and output chart over a shift',
        'Identify the clinical signs of mild versus severe dehydration',
        'Relate a low potassium result to what you observe at the bedside',
        'Teach oral rehydration technique in language the patient understands',
      ],
      tasks: [
        { title: 'Start an Intake and Output Chart', description: 'Record every oral intake, IV volume, emesis, and stool for the shift, then total the balance at the end.', category: 'assessment', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Administer Oral Rehydration', description: 'Prepare and give oral rehydration salts correctly, and show the patient how to take it in small frequent sips.', category: 'intervention', points: 15, verification: 'faculty', system_trigger: null },
        { title: 'Report the Low Potassium', description: 'Recognise the potassium of 3.4 mmol/L as below range and hand it over to the nurse in charge with the relevant bedside findings.', category: 'communication', points: 15, verification: 'faculty', system_trigger: null },
      ],
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
      title: 'Uncomplicated UTI: Antibiotics and Teaching',
      description:
        'A young woman admitted with burning on urination, frequency, and a low-grade fever. She is comfortable at rest and has no flank pain. The teaching here matters as much as the medication — she has had this twice before.',
      category: 'Infection Management',
      chief_complaint: 'Burning on urination and needing to pass urine frequently',
      physical_exam: 'Alert and comfortable. Suprapubic tenderness on light palpation. No costovertebral angle tenderness. Urine cloudy with a strong odour.',
      treatment_plan: 'Oral antibiotic as ordered, increase fluid intake to 2–3 litres daily, paracetamol for discomfort, monitor temperature four-hourly.',
      learning_objectives: [
        'Administer an oral antibiotic safely using the rights of medication administration',
        'Explain why a full antibiotic course must be finished',
        'Teach hygiene and hydration measures that reduce recurrence',
        'Document the response to treatment objectively',
      ],
      tasks: [
        { title: 'Administer the Oral Antibiotic', description: 'Give the ordered antibiotic on time, confirm the patient swallows it, and chart the dose.', category: 'medication', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Encourage and Track Fluid Intake', description: 'Set an achievable hourly target with the patient and record what she actually drinks.', category: 'intervention', points: 15, verification: 'faculty', system_trigger: null },
        { title: 'Teach Recurrence Prevention', description: 'Cover hygiene, hydration, not delaying urination, and completing the full course — and check her understanding by asking her to repeat it back.', category: 'communication', points: 20, verification: 'faculty', system_trigger: null },
      ],
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
      title: 'High Blood Pressure: Measure It Properly',
      description:
        'A middle-aged man admitted for observation after a high reading at a community screening. He feels completely well and says the machine at the mall "must be broken". The skill under test is an accurate manual blood pressure and a conversation that lands.',
      category: 'Patient Education',
      chief_complaint: 'No symptoms — referred after a high reading at a screening',
      physical_exam: 'Well-looking, no distress. Heart sounds normal, no murmurs. No peripheral oedema. No visual disturbance or headache.',
      treatment_plan: 'Blood pressure twice daily in both arms using correct technique, low-salt diet counselling, smoking cessation referral, lifestyle diary before considering medication.',
      learning_objectives: [
        'Measure blood pressure manually with the correct cuff size and technique',
        'Explain what the two numbers mean in plain language',
        'Identify modifiable risk factors from a patient history',
        'Counsel a patient who does not believe he is unwell',
      ],
      tasks: [
        { title: 'Take a Manual Blood Pressure in Both Arms', description: 'Use the correct cuff size, rest the patient five minutes first, and record both arms with the patient seated and supported.', category: 'assessment', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Identify Modifiable Risk Factors', description: 'Work through his history and name the factors he can change — smoking, activity, salt intake — and which he cannot.', category: 'assessment', points: 15, verification: 'faculty', system_trigger: null },
        { title: 'Counsel on Lifestyle Change', description: 'Explain the reading in plain language and agree one realistic change with him rather than listing everything at once.', category: 'communication', points: 20, verification: 'faculty', system_trigger: null },
      ],
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
      title: 'Mild Asthma: Breathing and Inhaler Technique',
      description:
        'A student nurse of the same age, admitted after wheezing through the night. She is speaking in full sentences and her saturation is 95% on room air — mild, and improving. Watch the respiratory rate and check how she actually uses her inhaler.',
      category: 'Respiratory Emergency',
      chief_complaint: 'Wheezing and tight chest since last night',
      physical_exam: 'Alert, speaking full sentences. Mild expiratory wheeze on both sides. No accessory muscle use, no cyanosis. Sitting upright by preference.',
      treatment_plan: 'Salbutamol via metered-dose inhaler with spacer as ordered, upright positioning, monitor respiratory rate and saturation before and after each dose, avoid known triggers on the ward.',
      learning_objectives: [
        'Count a respiratory rate accurately over a full minute',
        'Assess the effect of a bronchodilator by comparing before and after',
        'Demonstrate and correct metered-dose inhaler technique with a spacer',
        'Recognise the signs that a mild exacerbation is becoming severe',
      ],
      tasks: [
        { title: 'Assess Breathing Before and After the Inhaler', description: 'Record respiratory rate, saturation, and wheeze before the dose and again 15 minutes after, then compare.', category: 'assessment', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Position the Patient Upright', description: 'Sit the patient upright and well supported to ease the work of breathing, and explain why the position helps.', category: 'intervention', points: 10, verification: 'faculty', system_trigger: null },
        { title: 'Check and Correct Inhaler Technique', description: 'Have her demonstrate her own inhaler and spacer technique, then correct what she gets wrong.', category: 'communication', points: 20, verification: 'faculty', system_trigger: null },
      ],
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
      title: 'Day One After Surgery: Wound, Pain, Mobility',
      description:
        'A young man on his first day after a straightforward appendectomy. A low-grade temperature on day one is expected; the job is to check the wound properly, get his pain under control, and get him walking.',
      category: 'Medical-Surgical',
      chief_complaint: 'Pain around the surgical site, reluctant to move',
      physical_exam: 'Alert, guarding the abdomen. Three laparoscopic port sites clean and dry, no redness or discharge. Bowel sounds present but sluggish. Pain 5/10 on movement, 2/10 at rest.',
      treatment_plan: 'Analgesia as ordered before mobilising, wound inspection each shift, early ambulation, deep breathing exercises, monitor for fever above 38.5 °C or wound discharge.',
      learning_objectives: [
        'Inspect a surgical wound and describe it in objective terms',
        'Assess pain with a scale and re-assess after giving analgesia',
        'Explain why early mobilisation prevents post-operative complications',
        'Distinguish an expected day-one temperature from a developing infection',
      ],
      tasks: [
        { title: 'Inspect the Surgical Wound', description: 'Check each port site for redness, swelling, warmth, and discharge, and describe what you find without using the word "normal".', category: 'assessment', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Assess and Manage Pain', description: 'Score the pain before analgesia, give the ordered dose, and score it again 30 minutes later.', category: 'medication', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Assist with First Ambulation', description: 'Walk the patient safely to the end of the bay and back, supporting the wound, and stop if he becomes dizzy.', category: 'intervention', points: 20, verification: 'faculty', system_trigger: null },
      ],
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
      title: 'Cellulitis in Diabetes: Skin and Sugar',
      description:
        'An older woman with a warm, red, tender area on her left shin after a gardening scratch. She is systemically well apart from a low fever. Her diabetes is what makes this worth watching — and her glucose is running high.',
      category: 'Infection Management',
      chief_complaint: 'Red, painful, swollen area on the left lower leg',
      physical_exam: 'Alert and comfortable at rest. Left shin with a well-demarcated area of redness roughly 8 cm across, warm and tender, no fluctuance or pus. Pedal pulses present. Sensation intact.',
      treatment_plan: 'Mark the border of the redness and review each shift, elevate the limb, oral antibiotics as ordered, monitor capillary blood glucose, daily foot and skin inspection.',
      learning_objectives: [
        'Assess and document a skin infection including its extent over time',
        'Explain why diabetes slows wound healing and raises infection risk',
        'Perform a capillary blood glucose check correctly',
        'Teach daily foot care to a patient with diabetes',
      ],
      tasks: [
        { title: 'Mark and Measure the Affected Area', description: 'Outline the border of the redness with a skin marker and record its size so the next shift can tell whether it is spreading.', category: 'assessment', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Check Capillary Blood Glucose', description: 'Perform a fingerstick glucose using correct technique and record the result with the time taken.', category: 'assessment', points: 15, verification: 'faculty', system_trigger: null },
        { title: 'Elevate the Limb and Give Antibiotics', description: 'Elevate the leg above heart level to reduce swelling and administer the ordered antibiotic on schedule.', category: 'intervention', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Teach Daily Foot Care', description: 'Walk her through inspecting her feet daily, keeping skin intact, and when to come back — gardening included.', category: 'communication', points: 15, verification: 'faculty', system_trigger: null },
      ],
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
      title: 'Anaemia and Fatigue: Safety First',
      description:
        'A young woman admitted for investigation of tiredness and breathlessness climbing stairs. She is stable, but her haemoglobin is 9.2 and she went lightheaded standing up this morning. Falls prevention and iron teaching are the substance of this one.',
      category: 'Medical-Surgical',
      chief_complaint: 'Tired all the time and short of breath on exertion',
      physical_exam: 'Alert, visibly pale conjunctivae and nail beds. Mild tachycardia at rest. Reports dizziness on standing. No active bleeding. Chest clear.',
      treatment_plan: 'Oral iron with vitamin C as ordered, sit-to-stand precautions and falls risk assessment, dietary counselling, monitor for worsening breathlessness or chest pain.',
      learning_objectives: [
        'Relate a low haemoglobin to the symptoms the patient reports',
        'Carry out a falls risk assessment and put precautions in place',
        'Explain how to take oral iron so it is actually absorbed',
        'Recognise when anaemia stops being stable and needs escalation',
      ],
      tasks: [
        { title: 'Complete a Falls Risk Assessment', description: 'Assess her risk including the postural dizziness, then put the matching precautions in place at the bedside.', category: 'assessment', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Teach Safe Position Changes', description: 'Show her how to move from lying to sitting to standing in stages, and have her demonstrate it back.', category: 'intervention', points: 15, verification: 'faculty', system_trigger: null },
        { title: 'Administer Oral Iron Correctly', description: 'Give the ordered iron with vitamin C, away from tea, coffee, and dairy, and explain why the timing matters.', category: 'medication', points: 20, verification: 'faculty', system_trigger: null },
        { title: 'Counsel on Iron-Rich Diet', description: 'Work out realistic iron sources that fit a vegetarian diet rather than telling her to eat red meat.', category: 'communication', points: 15, verification: 'faculty', system_trigger: null },
      ],
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

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

  for (const seed of CASES) {
    const patient = patientBySubject.get(seed.subject_id);
    const row = {
      title: seed.scenario.title,
      description: seed.scenario.description,
      difficulty: 'beginner' as Difficulty,
      category: seed.scenario.category,
      patient_case: patientCaseFrom(seed),
      learning_objectives: seed.scenario.learning_objectives,
      is_ai_generated: false,
      patient_id: patient?.id ?? null,
      created_by: createdBy,
    };

    // No natural key on scenarios, so title is the handle. Keeps a re-run
    // from stacking a second copy of every case.
    const { data: existing } = await supabase
      .from('scenarios')
      .select('id')
      .eq('title', seed.scenario.title)
      .maybeSingle();

    let scenarioId: string;
    if (existing) {
      const { error } = await supabase.from('scenarios').update(row).eq('id', existing.id);
      if (error) {
        console.error(`Failed to update scenario "${seed.scenario.title}":`, error.message);
        process.exit(1);
      }
      scenarioId = existing.id;
      // Replace rather than merge: tasks have no natural key either, and
      // editing the list in this file should not leave orphans behind.
      await supabase.from('scenario_tasks').delete().eq('scenario_id', scenarioId);
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

    const tasks = [...SHARED_TASKS, ...seed.scenario.tasks].map((t, i) => ({
      scenario_id: scenarioId,
      title: t.title,
      description: t.description,
      category: t.category,
      points: t.points,
      verification: t.verification,
      system_trigger: t.system_trigger,
      sort_order: i + 1,
    }));
    const { error: taskError } = await supabase.from('scenario_tasks').insert(tasks);
    if (taskError) {
      console.error(`Failed to create tasks for "${seed.scenario.title}":`, taskError.message);
      process.exit(1);
    }
    taskCount += tasks.length;
  }

  console.log(`Scenarios: ${created} created, ${updated} updated. ${taskCount} tasks written.`);
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
