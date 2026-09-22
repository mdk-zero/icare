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
 * shipped in docs/. Each case names the Taylor's skills its patient calls
 * for, and every case-specific task is one of those skills, condensed from its
 * checklist steps and titled with the skill number so a student or evaluator
 * can open the checklist and grade against it. seed-scenario-quizzes.ts builds
 * each paired quiz from the same skills.
 *
 * Each task also carries its sub-task checklist: the rows faculty rate one by
 * one at /faculty/scenarios/review, Excellent through Not Performed. Every row
 * condenses one or a few numbered steps of a Taylor's checklist and cites
 * them ("Skill 1-7, steps 12–15"), so an evaluator can check the row against
 * the book. Sub-tasks need migration 044; before it they are skipped with a
 * warning and the tasks are still written.
 *
 * Safe to re-run: patients upsert on (subject_id, hadm_id), rooms are matched
 * by room_number within the campus, and a scenario is matched by title. Its
 * tasks and their sub-tasks are updated in place, matched by title, so the
 * ratings students already have on them survive a re-run; only tasks or
 * sub-tasks removed from this file are deleted, taking their ratings along.
 *
 *   npx tsx scripts/seed-basic-cases.ts
 *   npx tsx scripts/seed-basic-cases.ts --tasks-only
 *   npx tsx scripts/seed-basic-cases.ts --check      (validate content only)
 *
 * --tasks-only syncs the tasks and sub-tasks of scenarios that already exist
 * and touches nothing else: no rooms, and no patient upsert (which would reset
 * every seeded patient's admission date and status).
 */

import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

/** One sub-task row: what the student does, and the checklist steps it condenses. */
interface StepSeed {
  title: string;
  /** "Skill X-Y, step(s) …" — rendered as "Taylor's Skill X-Y, …" beside the row. */
  source: string;
}

interface TaskSeed {
  title: string;
  description: string;
  category: TaskCategory;
  points: number;
  verification: Verification;
  system_trigger: Trigger;
  steps: StepSeed[];
}

const step = (title: string, source: string): StepSeed => ({ title, source });

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

/**
 * Every case earns these two. Both are system-verified, so a student's own
 * charting closes them and faculty are left to judge the work that actually
 * needs judging.
 */
const SHARED_TASKS: TaskSeed[] = [
  {
    title: 'Assess Patient Vital Signs',
    description: 'Take a full set of vitals — temperature, pulse, respirations, blood pressure, and oxygen saturation (Taylor’s Skills 1-1, 1-4, 1-6, 1-7, 14-1) — and record them in the Vitals screen.',
    category: 'assessment',
    points: 10,
    verification: 'system',
    system_trigger: 'vitals',
    steps: [
      step('Perform hand hygiene, identify the patient, and explain each measurement', 'Skill 1-1, steps 2–4'),
      step('Measure the temperature by the ordered route with a probe cover, and note the reading', 'Skill 1-1, steps 7–15'),
      step('Palpate a peripheral pulse with three fingers for 30 seconds, a full minute if abnormal, noting rhythm and amplitude', 'Skill 1-4, steps 6–10'),
      step('Count respirations for 30 seconds with the fingers still on the pulse, noting depth and rhythm', 'Skill 1-6, steps 1–5'),
      step('Measure blood pressure with the cuff centred over the brachial artery, deflating at 2–3 mm Hg per second', 'Skill 1-7, steps 7–23'),
      step('Apply the pulse oximeter to a well-perfused site and read the SpO₂', 'Skill 14-1, steps 6–10'),
      step('Leave the patient comfortable, remove PPE, and perform hand hygiene', 'Skill 1-7, steps 24–25'),
    ],
  },
  {
    title: 'Document Your Findings',
    description: 'Write a progress note covering what you assessed, what you did, and how the patient responded. Any medication you gave is documented immediately after administration (Taylor’s Skill 5-1, step 21).',
    category: 'documentation',
    points: 10,
    verification: 'system',
    system_trigger: 'charting',
    steps: [
      step('Document the assessment findings, including anything abnormal', 'Skill 2-1, goal; Skill 8-1, step 13'),
      step('Document each medication immediately after giving it', 'Skill 5-1, step 21'),
      step('Document how the patient responded to the care and medication', 'Skill 5-1, step 22; Skill 10-1, step 23'),
      step('Report findings that need follow-up and refer as indicated', 'Skill 2-1, step 14'),
    ],
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
      title: 'Fever Workup: Vital Signs and a Nasopharyngeal Swab',
      formerly: 'Mild Fever: Comfort and Monitoring',
      description:
        'A young adult admitted overnight with a two-day history of fever, sore throat, and body aches. She is alert, talking in full sentences, and asking when she can go home. Nothing here is unstable. The work is Chapter 1 of Taylor’s done properly: an accurate oral temperature, a palpated pulse, and a respiratory rate counted without her noticing. After that, a nasopharyngeal swab for the viral panel, collected so it is not contaminated, and a PRN antipyretic given with every check. Taylor’s Skills 1-1, 1-4, 1-6, 18-5, 5-1.',
      category: 'General',
      chief_complaint: 'Fever and body aches for two days',
      physical_exam: 'Alert and cooperative. Flushed, warm to touch, mildly dry lips. Throat red without exudate. Chest clear on auscultation. No rash, no neck stiffness.',
      treatment_plan: 'Temperature (oral), pulse, and respirations every 4 hours. Nasopharyngeal swab for respiratory viral panel this morning, sent to the laboratory immediately. Paracetamol 500 mg orally every 6 hours as needed for temperature above 38.0 °C, with a recheck after the dose. Encourage oral fluids. Escalate for difficulty breathing, confusion, or a fever that will not come down.',
      learning_objectives: [
        'Measure an oral temperature with the probe in the posterior sublingual pocket (Taylor’s Skill 1-1)',
        'Palpate a radial pulse, counting a full minute whenever rate, rhythm, or amplitude is abnormal (Skill 1-4)',
        'Count respirations with the fingers still on the pulse, noting depth and rhythm (Skill 1-6)',
        'Collect and label a nasopharyngeal swab without contaminating it, and send it promptly (Skill 18-5)',
        'Give an oral antipyretic with the identification, bedside, and documentation checks of Skill 5-1',
      ],
      tasks: [
        { title: 'Measure an Oral Temperature (Skill 1-1)', description: 'Cover the probe, place it in the posterior sublingual pocket with her lips closed around it, hold it until the beep, and discard the cover by the release button without touching it.', category: 'assessment', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Check the order, perform hand hygiene, identify her, and explain the procedure', 'Skill 1-1, steps 1–4'),
          step('Confirm the thermometer works, and put on gloves if indicated', 'Skill 1-1, steps 5–6'),
          step('Cover the probe and place it in the posterior sublingual pocket with her lips closed around it', 'Skill 1-1, steps 11–12 (oral)'),
          step('Hold the probe until it beeps and note the reading', 'Skill 1-1, step 13 (oral)'),
          step('Discard the cover with the release button and return the unit to its charger', 'Skill 1-1, steps 14–15 (oral)'),
          step('Remove gloves and PPE and perform hand hygiene', 'Skill 1-1, step 9'),
        ] },
        { title: 'Obtain a Nasopharyngeal Swab (Skill 18-5)', description: 'Check the swab’s expiry date and the label against her ID band, put on gloves, have her cough and tip her head back, pass the swab about 6 inches through one naris, rotate it, and leave it 15–30 seconds. Bag it and send it immediately.', category: 'intervention', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Check the swab’s expiry date and the specimen label against her ID band', 'Skill 18-5, steps 1, 4'),
          step('Put on gloves, then have her cough and tip her head back', 'Skill 18-5, steps 6–7'),
          step('Open the package and take out the swab without touching it to any surface', 'Skill 18-5, step 8'),
          step('Pass the swab about 6 inches through one naris, rotate it, and leave it 15–30 seconds', 'Skill 18-5, steps 9–10'),
          step('Put the swab in the collection tube, label it, and seal it in a biohazard bag', 'Skill 18-5, steps 11, 13'),
          step('Remove gloves, perform hand hygiene, and send the specimen immediately', 'Skill 18-5, steps 12, 14–15'),
        ] },
        { title: 'Give the PRN Paracetamol (Skill 5-1)', description: 'Check the order against the MAR and her allergies, identify her by two methods, stay until the tablet is swallowed, document immediately, and recheck the temperature to evaluate the dose.', category: 'medication', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Check the order against the MAR and her chart for allergies', 'Skill 5-1, step 1'),
          step('Know the drug’s action, safe dose range, and adverse effects', 'Skill 5-1, step 2'),
          step('Compare the label with the MAR and check the expiry date, then recheck before leaving the cart', 'Skill 5-1, steps 7–10'),
          step('Identify her by two methods and complete the pre-dose assessment', 'Skill 5-1, steps 14–16'),
          step('Offer water and stay until the tablet is swallowed', 'Skill 5-1, steps 18–19'),
          step('Document immediately, then recheck the temperature to evaluate the dose', 'Skill 5-1, steps 21–22'),
        ] },
        { title: 'Explain the Swab Before Collecting It (Skill 18-5)', description: 'Tell her why the swab is needed and what she will feel, then answer her questions before you start.', category: 'communication', points: 10, verification: 'faculty', system_trigger: null, steps: [
          step('Identify her and discuss why a nasal swab is needed', 'Skill 18-5, step 3'),
          step('Explain how the specimen is collected and what she will feel', 'Skill 18-5, step 3'),
          step('Close the curtain or door before starting', 'Skill 18-5, step 5'),
        ] },
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
      title: 'Dehydration: Peripheral IV and Stool Culture',
      formerly: 'Mild Dehydration: Fluid Balance Basics',
      description:
        'A previously well adult with two days of loose stools and vomiting. He is thirsty and a little tachycardic, and his potassium is drifting low. The orders are Chapter 15 and Chapter 18 work: start a peripheral IV, then watch the site and the infusion every hour. Collect a stool specimen for culture. Until the organism is known, gown and glove correctly for contact precautions. Taylor’s Skills 15-1, 15-3, 18-2, 4-7.',
      category: 'Medical-Surgical',
      chief_complaint: 'Loose stools and vomiting for two days',
      physical_exam: 'Alert, mildly weak. Dry mucous membranes, skin turgor slightly reduced. Abdomen soft with active bowel sounds, mild generalised tenderness. Capillary refill under 3 seconds.',
      treatment_plan: 'Insert a peripheral IV and start PNSS at the ordered rate. Check the site and flow 30 minutes after starting, then at least hourly. Stool specimen for culture, sent while still warm. Contact precautions per facility policy pending the culture. Strict intake and output; report urine output under 30 mL/hr or worsening weakness.',
      learning_objectives: [
        'Initiate a peripheral IV infusion with aseptic technique, a correctly placed tourniquet, and a 10–15° insertion angle (Taylor’s Skill 15-1)',
        'Monitor an IV site and infusion hourly, recognising infiltration, phlebitis, infection, and fluid overload (Skill 15-3)',
        'Collect a stool specimen for culture free of urine and deliver it while still warm (Skill 18-2)',
        'Put on and remove gown, mask, eyewear, and gloves in the correct sequence (Skill 4-7)',
      ],
      tasks: [
        { title: 'Initiate the Peripheral IV (Skill 15-1)', description: 'Verify the order, prime the tubing, apply the tourniquet 3–4 inches above the site, scrub with chlorhexidine for 30 seconds and let it dry, and insert bevel up at 10–15°. Label the dressing with date, time, site, and gauge, and return in 30 minutes to check it.', category: 'intervention', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Verify the order and his allergies, and check the solution for colour, leaks, and expiry', 'Skill 15-1, steps 1, 5, 7'),
          step('Spike the bag and prime the tubing aseptically until no air remains', 'Skill 15-1, steps 8–11'),
          step('Apply the tourniquet 3–4 inches above the site and select a vein', 'Skill 15-1, steps 16, 19–21'),
          step('Scrub the site with chlorhexidine for 30 seconds and let it dry completely', 'Skill 15-1, step 22'),
          step('Insert bevel up at 10–15°, advance on flashback, release the tourniquet, and flush', 'Skill 15-1, steps 23–27'),
          step('Dress the site and label it with date, time, site, and gauge', 'Skill 15-1, steps 28–29'),
          step('Start the infusion at the ordered rate and recheck the site 30 minutes later', 'Skill 15-1, steps 31, 35'),
        ] },
        { title: 'Monitor the IV Site and Infusion (Skill 15-3)', description: 'Hourly: check the rate, tubing, and clamps, then inspect the site. Swelling, coolness, or pallor means infiltration; redness, heat, or induration means phlebitis. Keep the intake and output chart current.', category: 'assessment', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Verify the order, then check the pump settings, rate, and time tape', 'Skill 15-3, steps 1, 6'),
          step('Check the tubing for kinks and that the clamps are open', 'Skill 15-3, step 8'),
          step('Inspect the site for infiltration: swelling, leakage, coolness, or pallor', 'Skill 15-3, steps 9–10'),
          step('Inspect and palpate for phlebitis or infection: redness, heat, induration, pain', 'Skill 15-3, steps 11–12'),
          step('Watch for fluid overload: intake and output, vital signs, and lung sounds', 'Skill 15-3, step 13'),
          step('Ask him to call if the site hurts, the flow changes, or the pump alarms', 'Skill 15-3, step 14'),
        ] },
        { title: 'Collect the Stool Specimen (Skill 18-2)', description: 'Have him void first and keep toilet paper out of the specimen. Take a sample free of blood and urine with tongue blades, label it against his ID band, bag it, and send it while it is still warm.', category: 'intervention', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Explain the collection, and have him void first and keep toilet paper out', 'Skill 18-2, step 3'),
          step('Check the specimen label against his ID band', 'Skill 18-2, step 4'),
          step('With gloves on, take a sample free of blood and urine with tongue blades', 'Skill 18-2, steps 5–6'),
          step('Close, label, and seal the container in a biohazard bag', 'Skill 18-2, steps 7–8'),
          step('Send it to the laboratory while the stool is still warm', 'Skill 18-2, step 10'),
        ] },
        { title: 'Use PPE for Contact Precautions (Skill 4-7)', description: 'Put on the gown first and the gloves last, over the gown cuffs. At the doorway, remove the gloves first and roll the gown inside out, then perform hand hygiene immediately.', category: 'intervention', points: 10, verification: 'faculty', system_trigger: null, steps: [
          step('Check the type of precautions ordered and perform hand hygiene', 'Skill 4-7, steps 1, 3'),
          step('Put on the gown first, opening at the back, tied at the neck and waist', 'Skill 4-7, step 5a'),
          step('Put on the gloves last, over the gown cuffs', 'Skill 4-7, step 5d'),
          step('At the doorway, remove the gloves first, turning them inside out', 'Skill 4-7, steps 7b–d'),
          step('Remove the gown touching only its inside and roll it inside out', 'Skill 4-7, step 7f'),
          step('Perform hand hygiene immediately after removing all PPE', 'Skill 4-7, step 8'),
        ] },
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
      title: 'UTI: Clean-Catch Urine and Oral Antibiotics',
      formerly: 'Uncomplicated UTI: Antibiotics and Teaching',
      description:
        'A young woman admitted with burning on urination, frequency, and a low-grade fever. She has had this twice before. Before the first antibiotic dose she needs a clean-catch midstream urine for urinalysis and culture, and she will collect it herself, so the teaching decides whether the result can be trusted. Then give the oral antibiotic with every check in place. Taylor’s Skills 18-7, 5-1, 4-1.',
      category: 'Infection Management',
      chief_complaint: 'Burning on urination and needing to pass urine frequently',
      physical_exam: 'Alert and comfortable. Suprapubic tenderness on light palpation. No costovertebral angle tenderness. Urine cloudy with a strong odour.',
      treatment_plan: 'Clean-catch midstream urine for urinalysis and culture before the first antibiotic dose, sent promptly or refrigerated. Oral antibiotic as ordered once the specimen is collected. Oral fluids 2–3 litres daily, paracetamol for discomfort, temperature every 4 hours.',
      learning_objectives: [
        'Teach and supervise a clean-catch midstream urine collection that avoids contamination (Taylor’s Skill 18-7)',
        'Label a urine specimen correctly and refrigerate it if transport is delayed (Skill 18-7)',
        'Perform and teach handwashing with soap and water, with at least 15 seconds of friction (Skill 4-1)',
        'Administer an oral antibiotic with the checks, identifiers, and documentation Skill 5-1 requires',
      ],
      tasks: [
        { title: 'Teach the Clean-Catch Technique (Skill 18-7)', description: 'Have her wash her hands, separate the labia, and clean each side of the meatus and then the centre, front to back, with a new wipe each stroke. She voids a little into the toilet, then collects 10–20 mL midstream without touching the inside of the cup.', category: 'communication', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Explain the procedure and have her perform hand hygiene', 'Skill 18-7, steps 3–4'),
          step('Have her keep the labia separated through cleaning and collection', 'Skill 18-7, step 8'),
          step('Clean each side of the meatus, then the centre, front to back, with a new wipe each stroke', 'Skill 18-7, step 8'),
          step('Void a little into the toilet first, then collect 10–20 mL midstream', 'Skill 18-7, step 9'),
          step('Keep fingers off the inside of the container and lid', 'Skill 18-7, step 9'),
        ] },
        { title: 'Label and Send the Urine Specimen (Skill 18-7)', description: 'Check the label against her ID band, bag the container in a sealable biohazard bag, and send it as soon as possible, refrigerating it if it cannot go straight away.', category: 'documentation', points: 10, verification: 'faculty', system_trigger: null, steps: [
          step('Check the specimen label against her ID band', 'Skill 18-7, step 5'),
          step('Close the lid, transferring to test containers if needed', 'Skill 18-7, step 10'),
          step('Label the container and seal it in a biohazard bag', 'Skill 18-7, step 13'),
          step('Send it promptly, refrigerating it if transport is delayed', 'Skill 18-7, step 15'),
        ] },
        { title: 'Administer the Oral Antibiotic (Skill 5-1)', description: 'Check the order against the MAR and her allergies, identify her by two methods, stay until she has swallowed it, and document immediately afterwards.', category: 'medication', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Check the order against the MAR and her chart for allergies', 'Skill 5-1, step 1'),
          step('Compare the label with the MAR and check the expiry date, then recheck before leaving the cart', 'Skill 5-1, steps 7–10'),
          step('Identify her by two methods at the bedside', 'Skill 5-1, step 14'),
          step('Explain what the antibiotic is for and stay until it is swallowed', 'Skill 5-1, steps 16, 19'),
          step('Document immediately after giving it', 'Skill 5-1, step 21'),
        ] },
        { title: 'Wash Hands with Soap and Water (Skill 4-1)', description: 'Before and after the collection: hands lower than elbows, friction over every surface for at least 15 seconds, rinse toward the fingertips, and turn the tap off with a paper towel.', category: 'intervention', points: 10, verification: 'faculty', system_trigger: null, steps: [
          step('Remove jewellery and keep clothing away from the sink', 'Skill 4-1, steps 1–2'),
          step('Wet the hands and wrists, keeping hands lower than elbows', 'Skill 4-1, steps 3–4'),
          step('Lather every surface with firm friction for at least 15 seconds', 'Skill 4-1, steps 5–7'),
          step('Clean under the fingernails', 'Skill 4-1, step 8'),
          step('Rinse toward the fingertips and pat dry from the fingers up to the forearms', 'Skill 4-1, steps 9–10'),
          step('Turn off the tap with a clean paper towel', 'Skill 4-1, step 10'),
        ] },
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
      title: 'New Hypertension: Accurate BP and Cardiovascular Assessment',
      formerly: 'High Blood Pressure: Measure It Properly',
      description:
        'A middle-aged man admitted for observation after a high reading at a community screening. He feels completely well and says the machine at the mall “must be broken.” The answer is a reading nobody can argue with: Taylor’s brachial blood pressure technique, step by step. Add a general survey, a cardiovascular examination, and a baseline 12-lead ECG explained so that it does not frighten him. Taylor’s Skills 1-7, 2-1, 2-6, 16-1.',
      category: 'Patient Education',
      chief_complaint: 'No symptoms — referred after a high reading at a screening',
      physical_exam: 'Well-looking, no distress. Heart sounds normal, no murmurs. No peripheral oedema. No visual disturbance or headache.',
      treatment_plan: 'Manual blood pressure twice daily in both arms, seated and rested, per Skill 1-7. General survey with weight, height, BMI, and waist circumference. Cardiovascular assessment. Baseline 12-lead ECG. Low-salt diet counselling and a smoking cessation referral.',
      learning_objectives: [
        'Measure brachial blood pressure accurately: cuff placement, a palpated systolic estimate, and deflation at 2–3 mm Hg per second (Taylor’s Skill 1-7)',
        'Complete a general survey including BMI and waist circumference (Skill 2-1)',
        'Palpate the carotids one at a time and auscultate the heart from the aortic to the mitral area (Skill 2-6)',
        'Record a 12-lead ECG with correct limb and chest electrode placement, explaining it first (Skill 16-1)',
      ],
      tasks: [
        { title: 'Measure Blood Pressure Manually (Skill 1-7)', description: 'Confirm he has rested several minutes, seated with legs uncrossed and the arm supported at heart level. Centre the cuff bladder over the brachial artery 1–2 inches above the elbow crease. Estimate systolic by palpation, then inflate 30 mm Hg above it and deflate at 2–3 mm Hg per second.', category: 'assessment', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Confirm he has rested for several minutes and explain the procedure', 'Skill 1-7, step 4'),
          step('Seat him with his back supported, legs uncrossed, and forearm at heart level', 'Skill 1-7, step 7'),
          step('Centre the cuff bladder over the brachial artery, lower edge 1–2 inches above the elbow crease', 'Skill 1-7, steps 9–10'),
          step('Estimate the systolic by palpation, then deflate and wait 1 minute', 'Skill 1-7, steps 12–15'),
          step('Inflate 30 mm Hg above the estimate and deflate at 2–3 mm Hg per second', 'Skill 1-7, step 19'),
          step('Read systolic and diastolic to the nearest 2 mm Hg without reinflating', 'Skill 1-7, steps 20–22'),
        ] },
        { title: 'Perform a General Survey (Skill 2-1)', description: 'Observe appearance, body structure, mobility, and behaviour. Weigh and measure him with shoes off, calculate his BMI, and measure waist circumference at the level of the umbilicus.', category: 'assessment', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Assess appearance, mental status, and any sign of acute distress', 'Skill 2-1, step 4'),
          step('Assess body structure, mobility, and behaviour', 'Skill 2-1, steps 5–7'),
          step('Weigh and measure him with shoes off', 'Skill 2-1, steps 9–10'),
          step('Calculate his BMI', 'Skill 2-1, step 11'),
          step('Measure waist circumference at the level of the umbilicus', 'Skill 2-1, step 12'),
        ] },
        { title: 'Assess the Cardiovascular System (Skill 2-6)', description: 'Head of bed at 30–45°. Palpate one carotid at a time, inspect for jugular venous distention, and auscultate the aortic, pulmonic, Erb’s point, tricuspid, and mitral areas in that order.', category: 'assessment', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Position him supine with the head raised 30–45° and the chest exposed', 'Skill 2-6, step 4'),
          step('Inspect, palpate, and auscultate each carotid, one side at a time', 'Skill 2-6, step 5'),
          step('Inspect the neck for jugular venous distention', 'Skill 2-6, step 6'),
          step('Inspect and palpate the precordium and locate the apical impulse', 'Skill 2-6, steps 7–8'),
          step('Auscultate the aortic, pulmonic, Erb’s point, tricuspid, and mitral areas in that order', 'Skill 2-6, step 9'),
        ] },
        { title: 'Record a Baseline 12-Lead ECG (Skill 16-1)', description: 'Tell him no electricity enters his body and that it takes about 5 minutes. Place the limb leads and V1–V6 correctly, then have him lie still and not talk while it records.', category: 'intervention', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Explain that no electricity enters his body and that it takes about 5 minutes', 'Skill 16-1, step 5'),
          step('Position him supine with arms at his sides, limbs relaxed and draped', 'Skill 16-1, step 8'),
          step('Prepare flat, fleshy sites: clip hair and clean oil from the skin', 'Skill 16-1, steps 9–10'),
          step('Place the four limb leads on the correct limbs', 'Skill 16-1, steps 11–12'),
          step('Place V1–V6 at their landmarks', 'Skill 16-1, steps 13–14'),
          step('Have him lie still and not talk while it records, and check the tracing', 'Skill 16-1, steps 17–18'),
        ] },
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
      title: 'Asthma: Pulse Oximetry, Inhaler and Nebulizer',
      formerly: 'Mild Asthma: Breathing and Inhaler Technique',
      description:
        'A student nurse of the same age, admitted after wheezing through the night. She is speaking in full sentences with a saturation of 95% on room air: mild, and improving. The orders are Taylor’s Chapter 14 and the inhaled-medication skills of Chapter 5: pulse oximetry, salbutamol by metered-dose inhaler with a spacer, a nebulizer if that is not enough, and nasal cannula oxygen on standby. Taylor’s Skills 14-1, 5-23, 5-24, 14-3.',
      category: 'Respiratory Emergency',
      chief_complaint: 'Wheezing and tight chest since last night',
      physical_exam: 'Alert, speaking full sentences. Mild expiratory wheeze on both sides. No accessory muscle use, no cyanosis. Sitting upright by preference.',
      treatment_plan: 'Pulse oximetry with alarms set; move the sensor on schedule. Salbutamol 2 puffs via MDI with spacer every 4 hours and as needed; salbutamol by small-volume nebulizer if the wheeze persists. Oxygen by nasal cannula at 2 L/min if SpO₂ stays below 95% after the bronchodilator. Reassess respirations, lung sounds, and SpO₂ after every dose.',
      learning_objectives: [
        'Choose, prepare, and check a pulse oximeter sensor site, and set its alarms (Taylor’s Skill 14-1)',
        'Coach metered-dose inhaler use with a spacer, including the breath-hold and the wait between puffs (Skill 5-23)',
        'Set up a small-volume nebulizer and continue until all the medication is aerosolized (Skill 5-24)',
        'Apply oxygen by nasal cannula with the safety precautions Skill 14-3 requires',
        'Evaluate the response by reassessing lung sounds, SpO₂, and respirations after each dose (Skills 5-23, 5-24)',
      ],
      tasks: [
        { title: 'Apply Pulse Oximetry (Skill 14-1)', description: 'Use an index, middle, or ring finger with a good proximal pulse and capillary refill. Remove nail polish if needed, align the emitter and receiver opposite each other, set the alarm limits, and move a clip sensor every 2 hours.', category: 'assessment', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Choose a finger with a good proximal pulse and capillary refill', 'Skill 14-1, step 6'),
          step('Pick the right probe size and check for adhesive allergy', 'Skill 14-1, step 7'),
          step('Clean the site and remove nail polish if needed', 'Skill 14-1, step 8'),
          step('Align the emitter and receiver opposite each other', 'Skill 14-1, step 9'),
          step('Confirm the reading and set the alarm limits', 'Skill 14-1, steps 10–11'),
          step('Move a clip sensor every 2 hours and check the skin under it', 'Skill 14-1, step 13'),
        ] },
        { title: 'Coach the MDI with Spacer (Skill 5-23)', description: 'Shake the inhaler and spacer, release one puff into the spacer, and have her breathe in slowly and deeply. She holds 5–10 seconds, exhales through pursed lips, and waits 1–5 minutes before the next puff, then rinses her mouth.', category: 'medication', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Check the order and her allergies, and identify her by two methods', 'Skill 5-23, steps 1, 14–15'),
          step('Attach the inhaler to the spacer and shake both well', 'Skill 5-23, steps 17–18'),
          step('Seal her lips on the mouthpiece, release one puff, and inhale slowly and deeply', 'Skill 5-23, steps 19–20'),
          step('Hold the breath 5–10 seconds, then exhale through pursed lips', 'Skill 5-23, step 21'),
          step('Wait 1–5 minutes before the next puff', 'Skill 5-23, step 22'),
          step('Rinse her mouth afterwards and document the dose', 'Skill 5-23, steps 24, 26'),
        ] },
        { title: 'Give the Nebulized Dose if Ordered (Skill 5-24)', description: 'Place the unit dose in the cup, check for a fine mist, and have her breathe slowly and deeply through the mouthpiece until the cup is empty (about 15 minutes).', category: 'medication', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Check the order and her allergies, and identify her by two methods', 'Skill 5-24, steps 1, 14–15'),
          step('Put the unit dose in the cup and connect it to the air or oxygen source', 'Skill 5-24, steps 17–18'),
          step('Check for a fine mist before she starts', 'Skill 5-24, step 19'),
          step('Coach slow, deep breaths through the mouthpiece until the cup is empty', 'Skill 5-24, steps 20–21'),
          step('Have her rinse her mouth, clean the nebulizer, and document the dose', 'Skill 5-24, steps 22, 24'),
        ] },
        { title: 'Reassess After Each Dose (Skills 5-23, 5-24)', description: 'Reassess lung sounds, SpO₂, and respirations. If saturation stays below target, apply nasal cannula oxygen per Skill 14-3, with the “No Smoking” precautions explained.', category: 'assessment', points: 10, verification: 'faculty', system_trigger: null, steps: [
          step('Reassess lung sounds', 'Skill 5-23, step 27; Skill 5-24, step 25'),
          step('Recheck SpO₂ and respirations', 'Skill 5-23, step 27; Skill 5-24, step 25'),
          step('Apply nasal cannula oxygen at the ordered rate if saturation stays low', 'Skill 14-3, steps 6–9'),
          step('Explain the oxygen safety precautions and post “No Smoking” signs', 'Skill 14-3, step 5'),
        ] },
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
      title: 'Post-Op Day One: Dressing, Breathing Exercises and Comfort',
      formerly: 'Day One After Surgery: Wound, Pain, Mobility',
      description:
        'A young man on his first day after a straightforward laparoscopic appendectomy, guarding his abdomen and reluctant to move. A low-grade temperature on day one is expected. The work spans four chapters of Taylor’s: a dry sterile dressing change, deep breathing and splinted coughing, incentive spirometry, and the pain relief that makes the rest possible. Taylor’s Skills 8-1, 6-2, 14-2, 10-1.',
      category: 'Medical-Surgical',
      chief_complaint: 'Pain around the surgical site, reluctant to move',
      physical_exam: 'Alert, guarding the abdomen. Three laparoscopic port sites clean and dry, no redness or discharge. Bowel sounds present but sluggish. Pain 5/10 on movement, 2/10 at rest.',
      treatment_plan: 'Analgesia as ordered before dressing changes and exercises. Clean the port sites and apply dry sterile dressings daily and as needed. Deep breathing every 1–2 hours, and splinted coughing every 2 hours while awake. Incentive spirometer 5–10 breaths every 1–2 hours. Early ambulation. Report a temperature above 38.5 °C or wound discharge.',
      learning_objectives: [
        'Clean a surgical wound and apply a dry sterile dressing without contaminating it (Taylor’s Skill 8-1)',
        'Teach deep breathing, coughing, and incisional splinting, and obtain a return demonstration (Skill 6-2)',
        'Teach incentive spirometer use and the frequency it should be done (Skill 14-2)',
        'Assess pain with a scale, combine medication with non-drug comfort measures, and reassess with the same tool (Skill 10-1)',
      ],
      tasks: [
        { title: 'Change the Port-Site Dressings (Skill 8-1)', description: 'Give analgesia first if needed. Remove the old dressing with clean gloves and note any drainage, then inspect the wound. With sterile gloves, clean top to bottom and centre outward with a new gauze for each wipe, dress the wound, and label it with the date and time.', category: 'intervention', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Assess his pain and give analgesia first if needed', 'Skill 8-1, step 6'),
          step('Remove the old dressing with clean gloves and note any drainage', 'Skill 8-1, steps 10–12'),
          step('Inspect the wounds: size, appearance, drainage, and closures', 'Skill 8-1, step 13'),
          step('Set up a sterile field and put on sterile gloves', 'Skill 8-1, steps 14–16'),
          step('Clean top to bottom and centre outward, a new gauze for each wipe', 'Skill 8-1, step 17'),
          step('Apply the dry sterile dressing, secure it, and label the date and time', 'Skill 8-1, steps 20–24'),
        ] },
        { title: 'Teach Deep Breathing and Splinted Coughing (Skill 6-2)', description: 'Sit him in semi-Fowler’s with a pillow against the incision. He breathes in through the nose, holds for 3 seconds, and exhales through pursed lips, then coughs while splinting. Get a return demonstration.', category: 'communication', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Find out what he knows and explain why the exercises matter', 'Skill 6-2, steps 6–7'),
          step('Sit him in semi-Fowler’s with his palms on the lower rib cage', 'Skill 6-2, step 8a'),
          step('Breathe in through the nose, hold 3 seconds, and exhale through pursed lips', 'Skill 6-2, steps 8b–d'),
          step('Splint the incision with a pillow and cough', 'Skill 6-2, steps 9a–d'),
          step('Get a return demonstration and answer his questions', 'Skill 6-2, step 10'),
        ] },
        { title: 'Coach the Incentive Spirometer (Skill 14-2)', description: 'He exhales normally, seals his lips on the mouthpiece, inhales slowly and as deeply as he can, and holds for a count of three. Aim for 5–10 breaths every 1–2 hours.', category: 'intervention', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Sit him upright, assess his pain, and splint the incision', 'Skill 14-2, step 6'),
          step('Show him how to hold the device and the mouthpiece', 'Skill 14-2, step 7'),
          step('Exhale normally, seal the lips, then inhale slowly and as deeply as possible', 'Skill 14-2, steps 8–9'),
          step('Hold the breath for a count of three and check the gauge', 'Skill 14-2, step 10'),
          step('Repeat 5–10 times every 1–2 hours', 'Skill 14-2, step 12'),
        ] },
        { title: 'Assess and Relieve Pain (Skill 10-1)', description: 'Rate his pain with a scale and give the ordered analgesic. Add a non-drug measure (positioning, relaxation breathing, a quieter room), then reassess with the same tool.', category: 'medication', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Acknowledge his pain and let him help choose the relief', 'Skill 10-1, step 3'),
          step('Rate his pain with an appropriate scale', 'Skill 10-1, step 4'),
          step('Give the ordered analgesic', 'Skill 10-1, step 5'),
          step('Add a non-drug measure: positioning, a quieter room, or relaxation breathing', 'Skill 10-1, steps 6, 8, 16'),
          step('Reassess with the same tool', 'Skill 10-1, step 23'),
        ] },
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
      title: 'Cellulitis with Diabetes: Glucose, Insulin and IV Antibiotic',
      formerly: 'Cellulitis in Diabetes: Skin and Sugar',
      description:
        'An older woman with type 2 diabetes and a warm, red, tender area on her left shin after a gardening scratch. She has a low fever and a glucose of 168 mg/dL. This case is medication-heavy: capillary glucose checks, correctional insulin drawn from a vial and given subcutaneously, and an IV antibiotic hung as a piggyback. Taylor’s Skills 18-3, 5-4, 5-7, 5-11.',
      category: 'Infection Management',
      chief_complaint: 'Red, painful, swollen area on the left lower leg',
      physical_exam: 'Alert and comfortable at rest. Left shin with a well-demarcated area of redness roughly 8 cm across, warm and tender, no fluctuance or pus. Pedal pulses present. Sensation intact.',
      treatment_plan: 'Capillary blood glucose before meals and at bedtime. Regular insulin subcutaneously per the correctional scale when glucose is above target. IV antibiotic by piggyback as ordered; assess the IV site before each dose. Mark the border of the redness and re-measure each shift; keep the limb elevated.',
      learning_objectives: [
        'Obtain a capillary blood glucose sample without squeezing the puncture site (Taylor’s Skill 18-3)',
        'Withdraw insulin from a vial with sterile technique, injecting air into the space above the solution (Skill 5-4)',
        'Give a subcutaneous injection at the correct angle and rate, without massaging the site (Skill 5-7)',
        'Hang and run an IV piggyback antibiotic after assessing the IV site (Skill 5-11)',
      ],
      tasks: [
        { title: 'Check Capillary Blood Glucose (Skill 18-3)', description: 'Have her wash with soap and warm water, or swab the finger and let it dry. Pierce with the lancet perpendicular to the skin, lower the hand to encourage bleeding without squeezing, touch the drop to the strip, and press with dry gauze, not alcohol.', category: 'assessment', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Turn on the meter and check the strip code matches', 'Skill 18-3, steps 6, 10–11'),
          step('Have her wash in warm water, or swab the finger and let it dry completely', 'Skill 18-3, step 13'),
          step('Pierce with the lancet held perpendicular to the skin', 'Skill 18-3, step 14'),
          step('Lower the hand to encourage bleeding, without squeezing the site', 'Skill 18-3, step 16'),
          step('Touch the drop to the strip and press with dry gauze, not alcohol', 'Skill 18-3, steps 17, 19'),
          step('Discard the lancet in the sharps container', 'Skill 18-3, step 21'),
        ] },
        { title: 'Draw Up and Give Correctional Insulin (Skills 5-4, 5-7)', description: 'Inject air equal to the dose into the vial’s air space, withdraw the dose at eye level, and recheck it against the MAR. Inject at 45–90° at 10 seconds per mL, do not massage the site, and engage the needle guard.', category: 'medication', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Check the order and the correctional scale against the MAR', 'Skill 5-4, steps 1, 7–8'),
          step('Swab the vial top and inject air equal to the dose into the air space', 'Skill 5-4, steps 10–12'),
          step('Withdraw the dose at eye level, clear bubbles, and recheck it against the MAR', 'Skill 5-4, steps 14–18'),
          step('Identify her by two methods, then choose and clean the site', 'Skill 5-7, steps 15, 20–23'),
          step('Inject at 45–90°, slowly, at 10 seconds per mL', 'Skill 5-7, steps 26–28'),
          step('Don’t massage the site; engage the needle guard and document', 'Skill 5-7, steps 30–31, 34'),
        ] },
        { title: 'Hang the IV Antibiotic Piggyback (Skill 5-11)', description: 'Assess the IV site first. Spike and prime the secondary set, hang it higher than the primary, and clean the access port. Run it at the ordered rate, then return the primary bag to its original height and check its rate.', category: 'medication', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Check the order, allergies, and infusion rate, and identify her by two methods', 'Skill 5-11, steps 1, 8, 14'),
          step('Assess the IV site for inflammation or infiltration', 'Skill 5-11, step 18'),
          step('Spike the medication and prime the secondary tubing aseptically', 'Skill 5-11, steps 19–23'),
          step('Hang it higher than the primary and connect it to the cleaned access port', 'Skill 5-11, steps 21, 24–25'),
          step('Run it at the ordered rate', 'Skill 5-11, step 26'),
          step('Return the primary bag to its height, check its rate, and document', 'Skill 5-11, steps 28, 30'),
        ] },
        { title: 'Explain Why Glucose Is Monitored (Skill 18-3)', description: 'Explain the procedure and why her glucose is being checked while she has an infection, and tell her the result each time.', category: 'communication', points: 10, verification: 'faculty', system_trigger: null, steps: [
          step('Identify her and explain the procedure', 'Skill 18-3, step 4'),
          step('Explain why her glucose needs watching while she has an infection', 'Skill 18-3, step 4'),
          step('Tell her the result each time', 'Skill 18-3, step 20'),
        ] },
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
      title: 'Anaemia and Dizziness: Fall Prevention and Safe Ambulation',
      formerly: 'Anaemia and Fatigue: Safety First',
      description:
        'A young woman admitted for investigation of tiredness and breathlessness climbing stairs. She is stable, but her haemoglobin is 9.2 and she went lightheaded standing up this morning, which makes her a falls risk. Put Taylor’s fall-prevention measures in place, walk her safely with a gait belt, and draw the follow-up blood count by venipuncture. Taylor’s Skills 3-1, 9-7, 18-9.',
      category: 'Medical-Surgical',
      chief_complaint: 'Tired all the time and short of breath on exertion',
      physical_exam: 'Alert, visibly pale conjunctivae and nail beds. Mild tachycardia at rest. Reports dizziness on standing. No active bleeding. Chest clear.',
      treatment_plan: 'Fall precautions: bed in the lowest position with locks on, call bell and personal items within reach, nonskid footwear, rise slowly and sit before standing, rounding every 1–2 hours. Ambulate with assistance and a gait belt. Repeat CBC and ferritin by venipuncture in the morning. Oral iron with vitamin C as ordered. Escalate for chest pain or breathlessness at rest.',
      learning_objectives: [
        'Put Taylor’s fall-prevention measures in place and explain them to the patient and family (Skill 3-1)',
        'Assist ambulation with a gait belt, checking for dizziness at the bedside first (Skill 9-7)',
        'Recognise when weakness or unsteadiness means returning the patient to bed or a chair (Skill 9-7)',
        'Collect a venous blood sample with correct tourniquet use, insertion angle, and site care (Skill 18-9)',
      ],
      tasks: [
        { title: 'Put Fall Precautions in Place (Skill 3-1)', description: 'Bed in the lowest position with locks on, call bell and belongings within reach, a clear path to the bathroom, nonskid footwear, and a night light. Explain the reasons to her and her family.', category: 'intervention', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Bed in the lowest position with the locks on', 'Skill 3-1, steps 20–21'),
          step('Call bell, bedside table, and belongings within reach', 'Skill 3-1, step 13'),
          step('Clear path to the bathroom and good lighting, with a night light', 'Skill 3-1, steps 5–6'),
          step('Nonskid footwear', 'Skill 3-1, step 10'),
          step('Explain the precautions to her and her family', 'Skill 3-1, steps 3–4'),
          step('Round every 1–2 hours', 'Skill 3-1, step 27'),
        ] },
        { title: 'Teach Slow Position Changes (Skill 3-1)', description: 'Teach her to rise slowly and sit for several minutes before standing, and to call for help rather than getting up alone.', category: 'communication', points: 10, verification: 'faculty', system_trigger: null, steps: [
          step('Explain why she is at risk of falling', 'Skill 3-1, step 3'),
          step('Teach her to rise slowly and sit several minutes before standing', 'Skill 3-1, step 17'),
          step('Show her the call signal and ask her to call before getting up', 'Skill 3-1, steps 7, 23'),
        ] },
        { title: 'Assist Ambulation with a Gait Belt (Skill 9-7)', description: 'Sit her on the edge of the bed for several minutes and check for dizziness. Fit footwear and a gait belt, stand to her side and slightly behind, and return her to bed or a chair if she becomes weak or unsteady.', category: 'intervention', points: 20, verification: 'faculty', system_trigger: null, steps: [
          step('Explain the walk and ask her to report dizziness or weakness', 'Skill 9-7, step 3'),
          step('Sit her on the edge of the bed for several minutes and check for dizziness', 'Skill 9-7, step 6'),
          step('Put on her footwear and fit the gait belt', 'Skill 9-7, steps 7–8'),
          step('Help her stand and assess her balance and leg strength', 'Skill 9-7, step 9'),
          step('Walk at her side and slightly behind, holding the belt', 'Skill 9-7, steps 10–11'),
          step('Return her to the bed or a chair if she becomes weak or unsteady', 'Skill 9-7, steps 9, 12'),
        ] },
        { title: 'Draw the Morning Blood Sample (Skill 18-9)', description: 'Check the label against her ID band. Tourniquet 3–4 inches above the site, clean the skin and let it dry, and insert bevel up at 15°. Release the tourniquet once blood flows, and hold pressure 2–3 minutes after the needle is out.', category: 'assessment', points: 15, verification: 'faculty', system_trigger: null, steps: [
          step('Check the label against her ID band and explain the procedure', 'Skill 18-9, steps 4, 6'),
          step('Apply the tourniquet 3–4 inches above the site and choose a vein', 'Skill 18-9, steps 9–10'),
          step('Clean the site and let it dry', 'Skill 18-9, step 13'),
          step('Insert bevel up at 15° and fill the tubes', 'Skill 18-9, steps 15–17, 19'),
          step('Release the tourniquet as soon as blood flows', 'Skill 18-9, step 18'),
          step('Hold pressure 2–3 minutes once the needle is out, with the guard engaged', 'Skill 18-9, steps 20–21'),
        ] },
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

type Supabase = SupabaseClient;

/**
 * Every task needs a checklist, every row a citation, and titles must be
 * unique within their list — the sync below matches on them.
 */
function validate() {
  const problems: string[] = [];
  const checkTasks = (where: string, tasks: TaskSeed[]) => {
    const titles = new Set<string>();
    for (const task of tasks) {
      if (titles.has(task.title)) problems.push(`${where}: duplicate task "${task.title}"`);
      titles.add(task.title);
      if (task.steps.length === 0) problems.push(`${where} / ${task.title}: no sub-tasks`);
      const stepTitles = new Set<string>();
      for (const s of task.steps) {
        if (stepTitles.has(s.title)) problems.push(`${where} / ${task.title}: duplicate sub-task "${s.title}"`);
        stepTitles.add(s.title);
        if (!/^Skill \d+-\d+, (steps?|goal)\b/.test(s.source)) {
          problems.push(`${where} / ${task.title} / "${s.title}": source must cite "Skill X-Y, step …"`);
        }
      }
    }
  };
  for (const seed of CASES) checkTasks(seed.scenario.title, [...SHARED_TASKS, ...seed.scenario.tasks]);
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

/** Before migration 044 the sub-task table doesn't exist. */
let stepsAvailable = true;

/**
 * Make a scenario's tasks match `seeds`, in order, matching existing rows by
 * title. Updating in place keeps each task's id, so the completions and
 * ratings students already have on it survive; deleting and re-inserting
 * would cascade them away. Only tasks no longer in the list are deleted.
 */
async function syncTasks(
  supabase: Supabase,
  scenarioId: string,
  seeds: TaskSeed[],
): Promise<{ tasks: number; steps: number }> {
  const { data, error } = await supabase.from('scenario_tasks').select('id, title').eq('scenario_id', scenarioId);
  if (error) {
    console.error('Failed to read scenario tasks:', error.message);
    process.exit(1);
  }
  const existing = (data ?? []) as { id: string; title: string }[];
  const byTitle = new Map(existing.map((t) => [t.title, t.id]));
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
    };
    let taskId = byTitle.get(t.title);
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
    steps += await syncSteps(supabase, taskId, t.steps);
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

/** Same as syncTasks, one level down: a task's sub-tasks, matched by title. */
async function syncSteps(supabase: Supabase, taskId: string, seeds: StepSeed[]): Promise<number> {
  if (!stepsAvailable) return 0;
  const { data, error } = await supabase.from('scenario_task_steps').select('id, title').eq('task_id', taskId);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      stepsAvailable = false;
      console.warn('Sub-tasks skipped: apply migration 044 (scenario task steps), then run this again.');
      return 0;
    }
    console.error('Failed to read sub-tasks:', error.message);
    process.exit(1);
  }
  const existing = (data ?? []) as { id: string; title: string }[];
  const byTitle = new Map(existing.map((s) => [s.title, s.id]));
  const kept = new Set<string>();
  const inserts: { task_id: string; title: string; source: string; sort_order: number }[] = [];

  for (const [i, s] of seeds.entries()) {
    const id = byTitle.get(s.title);
    if (id) {
      kept.add(id);
      const { error: updateError } = await supabase
        .from('scenario_task_steps')
        .update({ source: s.source, sort_order: i + 1 })
        .eq('id', id);
      if (updateError) {
        console.error(`Failed to update sub-task "${s.title}":`, updateError.message);
        process.exit(1);
      }
    } else {
      inserts.push({ task_id: taskId, title: s.title, source: s.source, sort_order: i + 1 });
    }
  }
  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from('scenario_task_steps').insert(inserts);
    if (insertError) {
      console.error('Failed to create sub-tasks:', insertError.message);
      process.exit(1);
    }
  }
  const stale = existing.filter((s) => !kept.has(s.id)).map((s) => s.id);
  if (stale.length > 0) {
    const { error: deleteError } = await supabase.from('scenario_task_steps').delete().in('id', stale);
    if (deleteError) {
      console.error('Failed to remove old sub-tasks:', deleteError.message);
      process.exit(1);
    }
  }
  return seeds.length;
}

async function main() {
  validate();
  if (process.argv.includes('--check')) {
    const tasks = CASES.flatMap((c) => [...SHARED_TASKS, ...c.scenario.tasks]);
    const steps = tasks.reduce((sum, t) => sum + t.steps.length, 0);
    console.log(`Content OK: ${CASES.length} scenarios, ${tasks.length} tasks, ${steps} sub-tasks. Nothing written.`);
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

  if (process.argv.includes('--tasks-only')) {
    let taskCount = 0;
    let stepCount = 0;
    for (const seed of CASES) {
      const scenario = await findScenario(supabase, seed);
      if (!scenario) {
        console.warn(`  Skipped "${seed.scenario.title}": no such scenario yet. Run without --tasks-only to create it.`);
        continue;
      }
      const synced = await syncTasks(supabase, scenario.id, [...SHARED_TASKS, ...seed.scenario.tasks]);
      taskCount += synced.tasks;
      stepCount += synced.steps;
      console.log(`  ${seed.scenario.title}: ${synced.tasks} tasks, ${synced.steps} sub-tasks`);
    }
    console.log(`Tasks only: ${taskCount} tasks, ${stepCount} sub-tasks written. Rooms and patients untouched.`);
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

    const synced = await syncTasks(supabase, scenarioId, [...SHARED_TASKS, ...seed.scenario.tasks]);
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
