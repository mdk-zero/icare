/**
 * Seeds one quiz per ward scenario from seed-basic-cases.ts.
 *
 * The pairing is the point: a student works Rosa Delgado's fever at the
 * bedside, then sits a quiz about fever assessment, antipyretics, and the
 * teaching that goes with them. Scenario and quiz share a category and a set
 * of learning objectives, so the assessment measures what the scenario just
 * taught instead of testing unrelated material.
 *
 * Every quiz is built to satisfy publish validation (app/lib/assessment-
 * validation.ts) so it can be published rather than sitting in draft:
 *
 *   - criteria weights total exactly 100
 *   - every question is owned by a criterion (an unassigned one is never served)
 *   - each criterion holds at least its min_questions
 *   - total_questions <= the assigned bank, and >= the sum of the minimums
 *
 * Banks are eight questions and each attempt serves six. The surplus is
 * deliberate: it is the pool a retake draws unseen questions from, which is
 * what makes the adaptive selection in app/lib/assessment-selection.ts do
 * anything interesting.
 *
 * Safe to re-run: a quiz is matched by title, and its criteria and questions
 * are rebuilt rather than duplicated.
 *
 *   npx tsx scripts/seed-scenario-quizzes.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

/**
 * The PRC/CHED core competencies, by the ids migration 009 seeds. Same
 * constants as seed-assessments.ts — both scripts point at the same rows.
 */
const C = {
  SAFE_QUALITY_CARE: 'cb61c12e-896c-4b01-8782-4d1f77ac21f5',
  MANAGEMENT_RESOURCES: 'a2e3f4eb-8898-496e-b224-52f523b55e77',
  HEALTH_EDUCATION: '36565c30-3c0e-4559-b20a-bddfcfd1b0e2',
  LEGAL_RESPONSIBILITY: '8caec700-9577-4583-92c7-25ef3e7c4599',
  ETHICO_MORAL: '7a6a27f0-e0d4-4b26-9e22-ef821bb50c42',
  PROFESSIONAL_DEV: 'b991ab11-f8a1-4192-aa5e-dac6f2543e2f',
  QUALITY_IMPROVEMENT: 'fbefb01d-51e6-4fde-8ce6-1ec67e0cd1fc',
  RESEARCH: '07dae176-15e2-4078-81ec-5cc46578ae64',
  RECORDS_MANAGEMENT: 'd3f7a4d5-a0c5-4486-b22f-1e1a0e8b12b8',
  COMMUNICATION: 'b4f9884a-de33-46e9-8c05-a183a4167779',
  COLLABORATION_TEAMWORK: 'd71b3490-5280-4c97-927e-e0de4cbce75a',
  PHARMACOLOGY: '631e7fd0-247e-4a1f-b82d-7188f88c0cec',
} as const;

interface CriterionSeed {
  name: string;
  weight: number;
  min_questions: number;
  competency_id: string;
}

interface QuestionSeed {
  content: string;
  options: string[];
  correct_index: number;
  explanation: string;
  /** Index into the quiz's criteria array. Every question must own one. */
  criterion: number;
  competency_ids: string[];
}

interface QuizSeed {
  /** The scenario this quiz is paired with, by title. */
  scenario_title: string;
  title: string;
  description: string;
  category: string;
  time_limit_seconds: number;
  /** How many questions one attempt serves, out of the bank below. */
  total_questions: number;
  criteria: CriterionSeed[];
  questions: QuestionSeed[];
}

const POINTS_PER_QUESTION = 10;

const QUIZZES: QuizSeed[] = [
  {
    scenario_title: 'Mild Fever: Comfort and Monitoring',
    title: 'Fever Assessment and Management',
    description:
      'Normal temperature ranges, how fever is measured and monitored, safe antipyretic administration, and the comfort measures and teaching that go with a mild febrile illness.',
    category: 'General',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Temperature Assessment', weight: 40, min_questions: 2, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Fever Management', weight: 35, min_questions: 2, competency_id: C.PHARMACOLOGY },
      { name: 'Patient Teaching', weight: 25, min_questions: 1, competency_id: C.HEALTH_EDUCATION },
    ],
    questions: [
      {
        content: 'Which oral temperature range is considered normal for a healthy adult?',
        options: ['35.0–36.0 °C', '36.5–37.5 °C', '37.6–38.5 °C', '38.6–39.5 °C'],
        correct_index: 1,
        explanation: 'Normal adult oral temperature runs roughly 36.5–37.5 °C. A reading of 38.0 °C or above is generally treated as fever.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'A patient has an oral temperature of 38.2 °C, pulse 96, respirations 20, BP 118/74, and SpO2 98% on room air. How should the nurse interpret this set of vitals?',
        options: [
          'Mild fever with a compensatory rise in pulse — continue monitoring',
          'Septic shock requiring immediate rapid response activation',
          'Entirely normal findings for an adult',
          'Respiratory failure requiring supplemental oxygen',
        ],
        correct_index: 0,
        explanation: 'Heart rate rises roughly 10 beats per minute per degree of fever. With a stable blood pressure and normal saturation, this is a mild fever, not shock.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'A patient drank hot coffee five minutes ago. What should the nurse do before taking an oral temperature?',
        options: [
          'Take it immediately — hot drinks do not affect oral readings',
          'Wait 15–30 minutes before measuring',
          'Add 0.5 °C to whatever the thermometer reads',
          'Switch to an oral reading under the tongue on the opposite side',
        ],
        correct_index: 1,
        explanation: 'Hot or cold intake changes oral temperature for up to 30 minutes. Waiting is the only way to get a true reading; adjusting the number is guesswork.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.QUALITY_IMPROVEMENT],
      },
      {
        content: 'What is the primary action of paracetamol when given for fever?',
        options: [
          'It kills the organism causing the infection',
          'It resets the hypothalamic set point so the body cools',
          'It constricts peripheral blood vessels to conserve heat',
          'It replaces fluid lost through sweating',
        ],
        correct_index: 1,
        explanation: 'Paracetamol acts centrally on the hypothalamic set point. It treats the fever, not the infection causing it.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY],
      },
      {
        content: 'How long after giving an oral antipyretic should the nurse recheck the temperature?',
        options: ['Immediately', 'After about 60 minutes', 'After 6 hours', 'Only at the next scheduled round'],
        correct_index: 1,
        explanation: 'Oral paracetamol reaches useful effect at roughly 60 minutes. Rechecking then shows whether the dose worked while there is still time to act.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which nursing action is appropriate when a febrile patient begins to shiver during tepid sponging?',
        options: [
          'Continue sponging with colder water to bring the fever down faster',
          'Stop sponging and cover the patient — shivering raises temperature',
          'Place ice packs in both axillae',
          'Open the windows to increase air circulation',
        ],
        correct_index: 1,
        explanation: 'Shivering is heat production. It defeats the cooling and makes the patient miserable, so stop and rewarm rather than pushing on.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which instruction should the nurse give a patient being discharged after a mild febrile illness?',
        options: [
          'Restrict fluids to prevent overload',
          'Take the antipyretic on a strict schedule whether or not there is fever',
          'Drink plenty of fluids and return if fever persists beyond three days',
          'Stop all fluids and food until the temperature is normal',
        ],
        correct_index: 2,
        explanation: 'Fever increases insensible fluid loss, so intake matters. A clear return precaution gives the patient a threshold to act on.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.COMMUNICATION],
      },
      {
        content: 'A patient asks why she must finish the fluids when she does not feel thirsty. What is the best reply?',
        options: [
          'Hospital policy requires every patient to finish their fluids',
          'Fever makes you lose extra water through sweat and breathing, so you need more than thirst tells you',
          'Drinking more will make the fever break immediately',
          'Thirst is not a real sign, so you should ignore it entirely',
        ],
        correct_index: 1,
        explanation: 'Explaining the mechanism in plain language earns cooperation. Thirst lags behind actual need, especially with fever.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.COMMUNICATION],
      },
    ],
  },
  {
    scenario_title: 'Mild Dehydration: Fluid Balance Basics',
    title: 'Fluid Balance and Dehydration',
    description:
      'Signs of dehydration, accurate intake and output recording, oral rehydration technique, and reading the electrolyte results that go with fluid loss.',
    category: 'Medical-Surgical',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Hydration Assessment', weight: 40, min_questions: 2, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Intake and Output Recording', weight: 35, min_questions: 2, competency_id: C.RECORDS_MANAGEMENT },
      { name: 'Rehydration Teaching', weight: 25, min_questions: 1, competency_id: C.HEALTH_EDUCATION },
    ],
    questions: [
      {
        content: 'Which set of findings best indicates mild dehydration in an adult?',
        options: [
          'Dry mucous membranes, thirst, and mildly reduced skin turgor',
          'Unresponsiveness with absent peripheral pulses',
          'Bounding pulse with distended neck veins',
          'Moist mucous membranes with pitting oedema',
        ],
        correct_index: 0,
        explanation: 'Mild dehydration shows as thirst, dry mucosa, and slightly reduced turgor while the patient stays alert and perfused.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'A patient with two days of vomiting has a potassium of 3.4 mmol/L. How should the nurse interpret this?',
        options: [
          'Above normal — restrict potassium-containing foods',
          'Below normal — report it and monitor for weakness and irregular pulse',
          'Within normal limits — no action needed',
          'A laboratory error that should be ignored',
        ],
        correct_index: 1,
        explanation: 'Normal potassium is about 3.5–5.0 mmol/L. Gastrointestinal losses drive it down, and low potassium shows up as weakness, cramps, and arrhythmia.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.QUALITY_IMPROVEMENT],
      },
      {
        content: 'Which finding would most strongly suggest dehydration is worsening rather than improving?',
        options: [
          'Urine output falling below 30 mL per hour',
          'The patient asking for a second glass of water',
          'Temperature settling from 37.8 °C to 37.2 °C',
          'Bowel sounds becoming active',
        ],
        correct_index: 0,
        explanation: 'Urine output under 30 mL/hour signals that renal perfusion is dropping. It is the earliest objective sign that compensation is failing.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which of the following must be recorded on an intake and output chart?',
        options: [
          'Oral fluids only',
          'IV fluids only',
          'All oral and IV intake, plus urine, emesis, and liquid stool',
          'Only what the patient reports at the end of the shift',
        ],
        correct_index: 2,
        explanation: 'A fluid balance chart is only useful if every route in and out is captured. Missing emesis or stool makes the total meaningless.',
        criterion: 1,
        competency_ids: [C.RECORDS_MANAGEMENT],
      },
      {
        content: 'A patient took 1,200 mL orally and 800 mL IV, and passed 1,500 mL of urine plus 300 mL of emesis. What is the fluid balance?',
        options: ['+200 mL', '−200 mL', '+2,000 mL', '−1,800 mL'],
        correct_index: 0,
        explanation: 'Intake 2,000 mL minus output 1,800 mL gives a positive balance of 200 mL. Totalling both columns is the whole skill.',
        criterion: 1,
        competency_ids: [C.RECORDS_MANAGEMENT, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'When should intake and output entries be written?',
        options: [
          'At the time each intake or output occurs',
          'At the end of the shift from memory',
          'Only when the doctor asks for a total',
          'Once daily at midnight',
        ],
        correct_index: 0,
        explanation: 'Recording at the point of care is what keeps the chart accurate. Reconstructing a shift from memory is where fluid balance errors come from.',
        criterion: 1,
        competency_ids: [C.RECORDS_MANAGEMENT, C.LEGAL_RESPONSIBILITY],
      },
      {
        content: 'What is the correct way to teach a patient to take oral rehydration salts?',
        options: [
          'Drink the whole litre as quickly as possible',
          'Take small frequent sips, increasing as tolerated',
          'Mix the sachet with milk to improve the taste',
          'Take it only when thirsty',
        ],
        correct_index: 1,
        explanation: 'Small frequent sips are absorbed and stay down. A large volume at once in a vomiting patient usually comes straight back up.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION],
      },
      {
        content: 'Which sign should the nurse teach the patient to report immediately after discharge?',
        options: [
          'Passing urine three times in a day',
          'Feeling mildly tired in the afternoon',
          'Dizziness on standing with little or no urine output',
          'Mild hunger returning',
        ],
        correct_index: 2,
        explanation: 'Postural dizziness with reduced urine output means the fluid deficit is returning. It is the one thing that needs urgent review.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.COMMUNICATION],
      },
    ],
  },
  {
    scenario_title: 'Uncomplicated UTI: Antibiotics and Teaching',
    title: 'Urinary Tract Infection Care',
    description:
      'Recognising the signs of a urinary tract infection, giving oral antibiotics safely, and the hygiene and hydration teaching that prevents the next episode.',
    category: 'Infection Management',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Infection Assessment', weight: 40, min_questions: 2, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Antibiotic Administration', weight: 35, min_questions: 2, competency_id: C.PHARMACOLOGY },
      { name: 'Prevention Teaching', weight: 25, min_questions: 1, competency_id: C.HEALTH_EDUCATION },
    ],
    questions: [
      {
        content: 'Which group of symptoms is most typical of a lower urinary tract infection?',
        options: [
          'Burning on urination, frequency, and urgency',
          'Chest pain radiating to the left arm',
          'Productive cough with green sputum',
          'Severe headache with neck stiffness',
        ],
        correct_index: 0,
        explanation: 'Dysuria, frequency, and urgency are the classic lower tract triad. They point at the bladder rather than the kidney.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which finding would suggest the infection has moved from the bladder to the kidney?',
        options: [
          'Cloudy urine with a strong odour',
          'Flank pain with costovertebral angle tenderness and high fever',
          'Mild suprapubic discomfort',
          'Passing urine more often than usual',
        ],
        correct_index: 1,
        explanation: 'Flank pain, CVA tenderness, and a high fever mark pyelonephritis — a different severity that needs prompt escalation.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'A urine specimen cannot be sent to the laboratory straight away. What should the nurse do?',
        options: [
          'Leave it at room temperature until the next round',
          'Refrigerate it and label it with the collection time',
          'Add tap water to preserve the volume',
          'Discard it and collect a fresh sample in the morning',
        ],
        correct_index: 1,
        explanation: 'Bacteria multiply at room temperature and inflate the count. Refrigeration with an accurate collection time keeps the result meaningful.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.QUALITY_IMPROVEMENT],
      },
      {
        content: 'Which are the rights of medication administration the nurse must confirm before giving an antibiotic?',
        options: [
          'Right patient, drug, dose, route, and time',
          'Right ward, bed, and chart colour',
          'Right doctor, pharmacy, and supplier',
          'Right shift, nurse, and handover',
        ],
        correct_index: 0,
        explanation: 'Patient, drug, dose, route, and time are the core five, with documentation following. They are checked every single administration.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.LEGAL_RESPONSIBILITY],
      },
      {
        content: 'A patient says she feels completely better and wants to stop her antibiotic after three of seven days. What is the correct response?',
        options: [
          'Agree — symptoms resolving means the infection has cleared',
          'Explain that stopping early can let the infection return and encourage resistance',
          'Tell her to double the remaining doses to finish sooner',
          'Advise her to save the rest for the next episode',
        ],
        correct_index: 1,
        explanation: 'Symptom relief comes before bacterial clearance. Stopping early risks relapse and selects for resistant organisms.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.HEALTH_EDUCATION],
      },
      {
        content: 'Before giving the first dose of an antibiotic, which patient information is most important to check?',
        options: [
          'Preferred meal times',
          'Known drug allergies',
          'Usual sleeping position',
          'Next of kin contact number',
        ],
        correct_index: 1,
        explanation: 'An unchecked allergy is the error with the fastest and most severe consequence. It is verified before every first dose.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which measure best helps prevent recurrent urinary tract infections?',
        options: [
          'Restricting fluid intake in the evening',
          'Holding urine as long as possible to train the bladder',
          'Drinking adequate fluids and not delaying urination',
          'Taking a leftover antibiotic at the first twinge',
        ],
        correct_index: 2,
        explanation: 'Good hydration and regular voiding flush bacteria from the bladder. Holding urine and self-medicating both make recurrence more likely.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION],
      },
      {
        content: 'The nurse has finished teaching about preventing recurrence. What is the best way to confirm the patient understood?',
        options: [
          'Ask "Do you understand?" and accept a nod',
          'Give her the leaflet and move on',
          'Ask her to explain the key points back in her own words',
          'Repeat the instructions a second time more slowly',
        ],
        correct_index: 2,
        explanation: 'Teach-back is the only method that actually tests understanding. A nod confirms politeness, not comprehension.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.COMMUNICATION],
      },
    ],
  },
  {
    scenario_title: 'High Blood Pressure: Measure It Properly',
    title: 'Blood Pressure Measurement and Hypertension Teaching',
    description:
      'Correct manual blood pressure technique, interpreting a reading against the standard categories, identifying modifiable risk factors, and counselling a patient who feels perfectly well.',
    category: 'Patient Education',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Measurement Technique', weight: 40, min_questions: 2, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Risk Factor Identification', weight: 35, min_questions: 2, competency_id: C.QUALITY_IMPROVEMENT },
      { name: 'Lifestyle Counselling', weight: 25, min_questions: 1, competency_id: C.HEALTH_EDUCATION },
    ],
    questions: [
      {
        content: 'What happens to the reading if the blood pressure cuff is too small for the patient’s arm?',
        options: [
          'It gives a falsely high reading',
          'It gives a falsely low reading',
          'It has no effect on accuracy',
          'It only affects the pulse, not the pressure',
        ],
        correct_index: 0,
        explanation: 'An undersized cuff needs more pressure to occlude the artery, so it over-reads. Cuff selection is the most common technique error.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'How long should a patient rest before an accurate blood pressure is taken?',
        options: ['No rest is needed', 'About 5 minutes, seated and supported', 'At least 30 minutes lying flat', 'Exactly 60 seconds standing'],
        correct_index: 1,
        explanation: 'Five minutes seated with the back supported and feet flat lets the reading settle to a true resting value.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'A patient’s blood pressure is 152/94 mmHg. Which category does this fall into?',
        options: ['Normal', 'Elevated but not hypertensive', 'Stage 1 hypertension', 'Hypertensive crisis'],
        correct_index: 2,
        explanation: 'Stage 1 hypertension covers roughly 140–159 systolic or 90–99 diastolic. A crisis is 180/120 or above with symptoms.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which of these is a modifiable risk factor for hypertension?',
        options: ['Family history of stroke', 'Age', 'Cigarette smoking', 'Male sex'],
        correct_index: 2,
        explanation: 'Smoking is within the patient’s control. Family history, age, and sex are fixed and cannot be changed by counselling.',
        criterion: 1,
        competency_ids: [C.QUALITY_IMPROVEMENT, C.HEALTH_EDUCATION],
      },
      {
        content: 'Which dietary change most directly lowers blood pressure?',
        options: [
          'Reducing salt intake',
          'Increasing red meat portions',
          'Adding a daily sweetened drink',
          'Skipping breakfast each day',
        ],
        correct_index: 0,
        explanation: 'Sodium restriction has the most direct and best-evidenced effect on blood pressure of any single dietary change.',
        criterion: 1,
        competency_ids: [C.QUALITY_IMPROVEMENT, C.HEALTH_EDUCATION],
      },
      {
        content: 'Why is hypertension often described as a "silent" condition?',
        options: [
          'It produces no sound on auscultation',
          'It usually causes no symptoms until organ damage has occurred',
          'Patients are reluctant to discuss it',
          'It can only be detected by blood tests',
        ],
        correct_index: 1,
        explanation: 'Most people with raised blood pressure feel entirely well, which is exactly why screening and follow-up matter.',
        criterion: 1,
        competency_ids: [C.QUALITY_IMPROVEMENT, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'A patient insists he feels fine and does not need to change anything. What is the most effective nursing approach?',
        options: [
          'Warn him he will have a stroke if he does not comply',
          'Accept his decision and record that he refused advice',
          'Explore what matters to him and agree one realistic change together',
          'Give him every recommendation at once so nothing is missed',
        ],
        correct_index: 2,
        explanation: 'Agreeing one achievable change the patient chose himself outperforms both fear appeals and long lists he will not act on.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.COMMUNICATION],
      },
      {
        content: 'Which instruction should be given to a patient monitoring blood pressure at home?',
        options: [
          'Measure straight after climbing the stairs',
          'Measure at the same time each day, seated and rested',
          'Measure only when feeling unwell',
          'Measure immediately after a cigarette to see the worst value',
        ],
        correct_index: 1,
        explanation: 'Consistent timing and conditions are what make home readings comparable over time. Random measurement produces noise.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.SAFE_QUALITY_CARE],
      },
    ],
  },
  {
    scenario_title: 'Mild Asthma: Breathing and Inhaler Technique',
    title: 'Asthma Assessment and Inhaler Technique',
    description:
      'Counting respirations accurately, judging the severity of an asthma exacerbation, correct metered-dose inhaler and spacer technique, and knowing when mild becomes severe.',
    category: 'Respiratory Emergency',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Respiratory Assessment', weight: 40, min_questions: 2, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Inhaler and Medication Use', weight: 35, min_questions: 2, competency_id: C.PHARMACOLOGY },
      { name: 'Self-Management Teaching', weight: 25, min_questions: 1, competency_id: C.HEALTH_EDUCATION },
    ],
    questions: [
      {
        content: 'What is the normal respiratory rate for a resting adult?',
        options: ['6–10 breaths per minute', '12–20 breaths per minute', '22–30 breaths per minute', '30–40 breaths per minute'],
        correct_index: 1,
        explanation: 'Twelve to twenty breaths per minute is the normal adult range. A rate of 22 is mildly raised, as in a mild exacerbation.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which finding suggests an asthma exacerbation is becoming severe rather than mild?',
        options: [
          'Speaking in full sentences',
          'Oxygen saturation of 95% on room air',
          'Using accessory muscles and speaking only in single words',
          'Mild expiratory wheeze on both sides',
        ],
        correct_index: 2,
        explanation: 'Accessory muscle use and broken speech mark severe airflow obstruction. Sentence length is a fast bedside severity check.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'How should a nurse count a patient’s respiratory rate most accurately?',
        options: [
          'Tell the patient you are counting, then count for 15 seconds',
          'Count for a full minute without drawing attention to it',
          'Ask the patient how fast they feel they are breathing',
          'Estimate it from the pulse rate',
        ],
        correct_index: 1,
        explanation: 'People alter their breathing when they know it is being watched, and a full minute avoids multiplying an irregular pattern.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.QUALITY_IMPROVEMENT],
      },
      {
        content: 'What is the main reason for using a spacer with a metered-dose inhaler?',
        options: [
          'It makes the canister last longer',
          'It delivers more drug to the lungs and less to the mouth and throat',
          'It removes the need to shake the inhaler',
          'It allows a lower prescription cost',
        ],
        correct_index: 1,
        explanation: 'A spacer slows the aerosol and improves lung deposition while cutting oropharyngeal deposition and its side effects.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY],
      },
      {
        content: 'What is the correct breathing technique when using a metered-dose inhaler with a spacer?',
        options: [
          'Breathe in fast and hard, then exhale immediately',
          'Breathe in slowly and deeply, then hold the breath for about 10 seconds',
          'Hold the breath before actuating the inhaler',
          'Breathe out through the spacer after actuating',
        ],
        correct_index: 1,
        explanation: 'A slow deep breath carries the aerosol distally, and the breath hold lets it settle rather than being exhaled straight out.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.HEALTH_EDUCATION],
      },
      {
        content: 'Salbutamol is classified as which type of medication?',
        options: ['Short-acting bronchodilator', 'Inhaled corticosteroid', 'Antibiotic', 'Antihistamine'],
        correct_index: 0,
        explanation: 'Salbutamol is a short-acting beta-2 agonist that relaxes bronchial smooth muscle — the reliever, not the preventer.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY],
      },
      {
        content: 'Which position best eases the work of breathing during an asthma exacerbation?',
        options: ['Flat on the back', 'Upright and well supported', 'Left lateral with the head low', 'Prone with a pillow under the abdomen'],
        correct_index: 1,
        explanation: 'Sitting upright lets the diaphragm descend fully and the accessory muscles work, which lying flat prevents.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'What should a patient with asthma be taught to do when the reliever inhaler stops working as well as usual?',
        options: [
          'Double the dose and carry on at home',
          'Stop using it entirely to avoid dependence',
          'Seek medical review — a reliever that is failing signals worsening control',
          'Switch to someone else’s preventer inhaler',
        ],
        correct_index: 2,
        explanation: 'Needing the reliever more often, or getting less from it, is an early warning of deteriorating control and warrants review.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.COMMUNICATION],
      },
    ],
  },
  {
    scenario_title: 'Day One After Surgery: Wound, Pain, Mobility',
    title: 'Post-Operative Care Fundamentals',
    description:
      'Surgical wound inspection, pain assessment and reassessment, early mobilisation, and telling an expected post-operative fever apart from a developing infection.',
    category: 'Medical-Surgical',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Wound Assessment', weight: 40, min_questions: 2, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Pain Management', weight: 35, min_questions: 2, competency_id: C.PHARMACOLOGY },
      { name: 'Mobilisation and Recovery', weight: 25, min_questions: 1, competency_id: C.HEALTH_EDUCATION },
    ],
    questions: [
      {
        content: 'Which signs indicate a surgical wound may be infected?',
        options: [
          'Redness, warmth, swelling, and purulent discharge',
          'A thin dry scab along the incision line',
          'Mild itching as the wound heals',
          'Pale, closed wound edges',
        ],
        correct_index: 0,
        explanation: 'The cardinal signs of infection are redness, warmth, swelling, pain, and purulent discharge. Itching and scabbing are normal healing.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'A patient on post-operative day 1 has a temperature of 37.6 °C with clean, dry wound sites. How should the nurse interpret this?',
        options: [
          'Expected inflammatory response — continue routine monitoring',
          'Definite wound infection requiring immediate antibiotics',
          'A sign of malignant hyperthermia',
          'Equipment error — retake with a different thermometer',
        ],
        correct_index: 0,
        explanation: 'A mild temperature on day one reflects the normal inflammatory response to surgery. Infection typically appears later and with local signs.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which is the correct way to document a wound assessment?',
        options: [
          '"Wound looks normal."',
          '"Wound fine, no problems."',
          '"Three port sites, edges approximated, no redness or discharge, dressing dry and intact."',
          '"Patient says the wound is healing well."',
        ],
        correct_index: 2,
        explanation: 'Objective, specific description lets the next nurse compare. "Normal" and "fine" carry no information across a handover.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.RECORDS_MANAGEMENT],
      },
      {
        content: 'When should analgesia be given in relation to planned mobilisation?',
        options: [
          'After walking, so the patient feels the improvement',
          'Before walking, timed so it is working when the patient moves',
          'Only if the patient asks while walking',
          'Analgesia and mobilisation should never be combined',
        ],
        correct_index: 1,
        explanation: 'Pre-emptive analgesia timed to peak effect lets the patient mobilise properly. Pain after the fact discourages the next attempt.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'After administering an analgesic, when should the nurse reassess the patient’s pain?',
        options: [
          'Immediately after the dose',
          'About 30 minutes later for an oral dose',
          'At the end of the shift',
          'Only if the patient complains again',
        ],
        correct_index: 1,
        explanation: 'Reassessment at the drug’s expected onset is what closes the loop — it shows whether the dose worked or the plan needs changing.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY],
      },
      {
        content: 'A patient rates his pain 5/10 on movement and 2/10 at rest. What does this tell the nurse?',
        options: [
          'The pain scale is being used incorrectly',
          'Rest pain is controlled but movement needs analgesic cover before mobilising',
          'The patient is exaggerating his symptoms',
          'No analgesia is required at all',
        ],
        correct_index: 1,
        explanation: 'Incident pain higher than rest pain is typical after surgery and tells you exactly when cover is needed — before moving.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Why is early ambulation encouraged after surgery?',
        options: [
          'It frees the bed sooner for the next admission',
          'It reduces the risk of chest infection, clots, and constipation',
          'It prevents the wound from ever becoming infected',
          'It removes the need for pain relief',
        ],
        correct_index: 1,
        explanation: 'Moving early protects against atelectasis, venous thromboembolism, and ileus — the main complications of lying still.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'During his first walk the patient becomes dizzy and pale. What should the nurse do first?',
        options: [
          'Encourage him to push on to the end of the corridor',
          'Help him sit or lie down safely and check his vital signs',
          'Leave him standing and go for assistance',
          'Give an extra dose of analgesia',
        ],
        correct_index: 1,
        explanation: 'Patient safety comes first: sit or lie him down where he is to prevent a fall, then assess. Never leave an unsteady patient standing.',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE, C.HEALTH_EDUCATION],
      },
    ],
  },
  {
    scenario_title: 'Cellulitis in Diabetes: Skin and Sugar',
    title: 'Skin Infection and Diabetes Care',
    description:
      'Assessing and tracking a spreading skin infection, capillary blood glucose technique, why diabetes impairs healing, and the foot care teaching that prevents the next wound.',
    category: 'Infection Management',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Skin and Wound Assessment', weight: 40, min_questions: 2, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Glucose Monitoring', weight: 35, min_questions: 2, competency_id: C.QUALITY_IMPROVEMENT },
      { name: 'Foot Care Teaching', weight: 25, min_questions: 1, competency_id: C.HEALTH_EDUCATION },
    ],
    questions: [
      {
        content: 'Why does the nurse mark the border of the redness in cellulitis with a skin marker?',
        options: [
          'To show the doctor where to inject antibiotics',
          'To provide an objective reference for whether the infection is spreading',
          'To indicate where the dressing should be applied',
          'To record the patient’s consent to treatment',
        ],
        correct_index: 1,
        explanation: 'A marked border turns "does this look bigger?" into a measurable comparison the next shift can act on.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.RECORDS_MANAGEMENT],
      },
      {
        content: 'Which finding in a patient with cellulitis should be escalated most urgently?',
        options: [
          'Redness that has extended beyond the marked border with rising fever',
          'Mild tenderness on palpation',
          'A small area of dry, flaking skin',
          'The patient reporting the leg feels warm',
        ],
        correct_index: 0,
        explanation: 'Spread past the marked line together with systemic signs means the infection is outpacing treatment and needs review now.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Why is elevating the affected limb helpful in cellulitis?',
        options: [
          'It increases arterial blood flow to the area',
          'It promotes venous and lymphatic drainage, reducing swelling',
          'It raises the skin temperature to fight bacteria',
          'It prevents the antibiotic from reaching the site',
        ],
        correct_index: 1,
        explanation: 'Elevation assists venous and lymphatic return, which reduces oedema and eases pain. It supports the antibiotic rather than replacing it.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which site is appropriate for a capillary blood glucose sample?',
        options: [
          'The centre pad of the fingertip',
          'The side of the fingertip',
          'The nail bed',
          'The palm of the hand',
        ],
        correct_index: 1,
        explanation: 'The side of the fingertip has fewer nerve endings than the centre pad, so it hurts less while still bleeding freely.',
        criterion: 1,
        competency_ids: [C.QUALITY_IMPROVEMENT, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'A patient with diabetes has a random blood glucose of 168 mg/dL and an HbA1c of 7.8%. How should the nurse interpret this?',
        options: [
          'Glucose control is excellent and needs no attention',
          'Control is above target, which slows healing and raises infection risk',
          'The patient is hypoglycaemic and needs glucose immediately',
          'The HbA1c result is unrelated to wound healing',
        ],
        correct_index: 1,
        explanation: 'An HbA1c of 7.8% shows sustained hyperglycaemia. High glucose impairs white cell function and healing, which is why this infection matters more here.',
        criterion: 1,
        competency_ids: [C.QUALITY_IMPROVEMENT, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'What should the nurse do before performing a fingerstick glucose test?',
        options: [
          'Clean the site with alcohol and let it dry completely',
          'Apply lotion to soften the skin first',
          'Use the same lancet as the previous test to save supplies',
          'Warm the finger in hot water above 50 °C',
        ],
        correct_index: 0,
        explanation: 'Residual alcohol dilutes the sample and skews the reading, so the site must be dry. Lancets are always single-use.',
        criterion: 1,
        competency_ids: [C.QUALITY_IMPROVEMENT, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which foot care instruction is correct for a patient with diabetes?',
        options: [
          'Soak the feet in hot water daily to soften calluses',
          'Inspect the feet daily and keep the skin clean, dry, and intact',
          'Walk barefoot at home to toughen the soles',
          'Cut calluses off with a blade at home',
        ],
        correct_index: 1,
        explanation: 'Daily inspection catches injury early in a foot that may have reduced sensation. Hot soaks, bare feet, and home blade work all cause the wounds being prevented.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION],
      },
      {
        content: 'The patient scratched her leg while gardening. What is the most useful teaching point?',
        options: [
          'She should stop gardening permanently',
          'Wear protective clothing and closed shoes, and clean and check any break in the skin the same day',
          'Minor scratches in diabetes never need attention',
          'Apply an antibiotic ointment to any scratch for two weeks',
        ],
        correct_index: 1,
        explanation: 'Practical protection plus prompt attention to small injuries keeps her doing what she enjoys. Banning the activity is advice she will not follow.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.COMMUNICATION],
      },
    ],
  },
  {
    scenario_title: 'Anaemia and Fatigue: Safety First',
    title: 'Anaemia Care and Falls Prevention',
    description:
      'Interpreting a low haemoglobin against the patient’s symptoms, falls risk assessment and precautions, safe position changes, and how to take oral iron so it is actually absorbed.',
    category: 'Medical-Surgical',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Anaemia Assessment', weight: 40, min_questions: 2, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Falls Prevention', weight: 35, min_questions: 2, competency_id: C.QUALITY_IMPROVEMENT },
      { name: 'Iron and Diet Teaching', weight: 25, min_questions: 1, competency_id: C.HEALTH_EDUCATION },
    ],
    questions: [
      {
        content: 'Which set of findings is most consistent with iron deficiency anaemia?',
        options: [
          'Pallor, fatigue, and shortness of breath on exertion',
          'Flushed skin with a bounding pulse',
          'Cyanosis with clubbing of the fingers',
          'Jaundice with right upper quadrant pain',
        ],
        correct_index: 0,
        explanation: 'Reduced oxygen-carrying capacity produces pallor, tiredness, and breathlessness on exertion before anything shows at rest.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'A young woman has a haemoglobin of 9.2 g/dL. How should the nurse interpret this?',
        options: [
          'Above the normal range',
          'Below the normal range, consistent with her reported fatigue',
          'Within the normal range for an adult female',
          'So low that immediate transfusion is always required',
        ],
        correct_index: 1,
        explanation: 'Normal for an adult female is roughly 12–16 g/dL. At 9.2 she is anaemic and symptomatic, but stable vitals mean this is not an emergency transfusion.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which additional finding would indicate the anaemia is no longer stable and needs urgent escalation?',
        options: [
          'Mild tiredness in the afternoon',
          'Chest pain and breathlessness at rest',
          'Pale conjunctivae',
          'A heart rate of 96 at rest',
        ],
        correct_index: 1,
        explanation: 'Chest pain and dyspnoea at rest suggest the heart is no longer compensating. That is a different urgency from exertional symptoms.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'A patient reports dizziness when standing up. What is this called and what is the priority action?',
        options: [
          'Orthostatic hypotension — implement falls precautions and teach staged position changes',
          'Vertigo — refer immediately for an ear examination',
          'Syncope — begin cardiopulmonary resuscitation',
          'Normal fatigue — no action needed',
        ],
        correct_index: 0,
        explanation: 'Postural dizziness in anaemia is orthostatic hypotension, and it makes the patient a genuine falls risk that needs precautions now.',
        criterion: 1,
        competency_ids: [C.QUALITY_IMPROVEMENT, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which measure is part of standard falls prevention on the ward?',
        options: [
          'Keeping the bed at its highest position',
          'Placing the call bell within reach and keeping the floor clear',
          'Removing the bed rails entirely',
          'Discouraging the patient from ever getting up',
        ],
        correct_index: 1,
        explanation: 'A reachable call bell, a clear floor, and a low bed are the basics. Immobilising the patient creates new complications rather than safety.',
        criterion: 1,
        competency_ids: [C.QUALITY_IMPROVEMENT, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'How should a patient with orthostatic dizziness be taught to get out of bed?',
        options: [
          'Stand up quickly to get it over with',
          'Sit on the edge of the bed for a moment, then stand slowly with support nearby',
          'Roll onto the floor and rise from kneeling',
          'Only ever get up with two staff present',
        ],
        correct_index: 1,
        explanation: 'Staged movement gives the circulation time to adjust between each position. It is the single most effective self-management step.',
        criterion: 1,
        competency_ids: [C.QUALITY_IMPROVEMENT, C.HEALTH_EDUCATION],
      },
      {
        content: 'Which drink taken with oral iron reduces its absorption?',
        options: ['Orange juice', 'Water', 'Tea', 'Diluted squash'],
        correct_index: 2,
        explanation: 'Tannins in tea bind iron and cut absorption, as do coffee and dairy. Vitamin C in orange juice does the opposite and helps.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.PHARMACOLOGY],
      },
      {
        content: 'Which advice is appropriate for a vegetarian patient with iron deficiency anaemia?',
        options: [
          'She must start eating red meat or the anaemia will not resolve',
          'Combine plant iron sources such as legumes and dark leafy greens with a vitamin C source',
          'Iron supplements make dietary sources irrelevant',
          'Dairy products are the best source of dietary iron',
        ],
        correct_index: 1,
        explanation: 'Non-haem iron is absorbed far better alongside vitamin C. Working within her diet is advice she can actually act on; dairy inhibits absorption.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.COMMUNICATION],
      },
    ],
  },
];

/**
 * Re-checks the publish rules from app/lib/assessment-validation.ts against
 * the seed data before anything is written.
 *
 * The real validation runs server-side at publish time and would simply
 * refuse, leaving eight quizzes stuck in draft with no explanation at the
 * seed's end. Failing here instead names the quiz and the rule.
 */
function validate(quiz: QuizSeed): string[] {
  const problems: string[] = [];

  const weight = quiz.criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.round(weight * 100) / 100 !== 100) {
    problems.push(`criteria weights total ${weight}, must be 100`);
  }

  const poolOf = (i: number) => quiz.questions.filter((q) => q.criterion === i).length;

  quiz.criteria.forEach((c, i) => {
    if (poolOf(i) < c.min_questions) {
      problems.push(`"${c.name}" needs ${c.min_questions} questions but has ${poolOf(i)}`);
    }
  });

  const orphans = quiz.questions.filter(
    (q) => q.criterion < 0 || q.criterion >= quiz.criteria.length,
  );
  if (orphans.length > 0) {
    problems.push(`${orphans.length} question(s) point at a criterion that does not exist`);
  }

  if (quiz.total_questions > quiz.questions.length) {
    problems.push(
      `serves ${quiz.total_questions} questions but the bank holds ${quiz.questions.length}`,
    );
  }

  const minimums = quiz.criteria.reduce(
    (sum, c, i) => sum + Math.min(c.min_questions, poolOf(i)),
    0,
  );
  if (minimums > quiz.total_questions) {
    problems.push(
      `criteria minimums add up to ${minimums}, more than the ${quiz.total_questions} served`,
    );
  }

  quiz.questions.forEach((q, i) => {
    if (q.correct_index < 0 || q.correct_index >= q.options.length) {
      problems.push(`question ${i + 1} has correct_index outside its options`);
    }
  });

  return problems;
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

  // Fail before touching the database rather than half-way through.
  let invalid = 0;
  for (const quiz of QUIZZES) {
    const problems = validate(quiz);
    for (const p of problems) {
      console.error(`  INVALID  "${quiz.title}" — ${p}`);
      invalid += 1;
    }
  }
  if (invalid > 0) {
    console.error(`\n${invalid} problem(s) found. Nothing was written.`);
    process.exit(1);
  }

  // The competency taxonomy has to exist: assessment_criteria.competency_id
  // is NOT NULL, and these ids are the ones migration 009 seeds.
  const { data: competencies } = await supabase.from('competency_areas').select('id');
  const known = new Set((competencies ?? []).map((c) => c.id));
  const missing = [...new Set(Object.values(C))].filter((id) => !known.has(id));
  if (missing.length > 0) {
    console.error(
      `competency_areas is missing ${missing.length} of the 12 ids these quizzes reference.\n` +
        'Restore it before seeding — re-running migration 009 mints new ids and will not match.',
    );
    process.exit(1);
  }

  const { data: author } = await supabase
    .from('users')
    .select('id, email, role')
    .in('role', ['faculty', 'admin'])
    .order('role', { ascending: true })
    .limit(1)
    .maybeSingle();
  console.log(author ? `Attributing to ${author.email} (${author.role}).` : 'No faculty or admin user found — leaving author blank.');

  const { data: campus } = await supabase.from('campuses').select('id').limit(1).maybeSingle();

  let created = 0;
  let replaced = 0;

  for (const quiz of QUIZZES) {
    // Pair by title. A missing scenario is worth saying out loud — it means
    // seed-basic-cases.ts has not been run, and the quiz will land unpaired.
    const { data: scenario } = await supabase
      .from('scenarios')
      .select('id')
      .eq('title', quiz.scenario_title)
      .maybeSingle();
    if (!scenario) {
      console.warn(`  note: no scenario titled "${quiz.scenario_title}" — run db:seed:basic-cases first.`);
    }

    const row = {
      campus_id: campus?.id ?? null,
      created_by: author?.id ?? null,
      title: quiz.title,
      description: quiz.description,
      difficulty: 'beginner' as const,
      category: quiz.category,
      time_limit_seconds: quiz.time_limit_seconds,
      total_questions: quiz.total_questions,
      is_published: true,
      is_ai_generated: false,
    };

    const { data: existing } = await supabase
      .from('assessments')
      .select('id')
      .eq('title', quiz.title)
      .maybeSingle();

    let assessmentId: string;
    if (existing) {
      const { error } = await supabase.from('assessments').update(row).eq('id', existing.id);
      if (error) {
        console.error(`  ✗ "${quiz.title}" — update failed:`, error.message);
        process.exit(1);
      }
      assessmentId = existing.id;
      // Questions cascade from the assessment, not from criteria, so both are
      // cleared explicitly. question_competencies follows its question.
      await supabase.from('questions').delete().eq('assessment_id', assessmentId);
      await supabase.from('assessment_criteria').delete().eq('assessment_id', assessmentId);
      replaced += 1;
    } else {
      const { data: inserted, error } = await supabase
        .from('assessments')
        .insert(row)
        .select('id')
        .single();
      if (error || !inserted) {
        console.error(`  ✗ "${quiz.title}" — insert failed:`, error?.message);
        process.exit(1);
      }
      assessmentId = inserted.id;
      created += 1;
    }

    const { data: criteria, error: cErr } = await supabase
      .from('assessment_criteria')
      .insert(
        quiz.criteria.map((c, i) => ({
          assessment_id: assessmentId,
          name: c.name,
          weight: c.weight,
          competency_id: c.competency_id,
          min_questions: c.min_questions,
          sort_order: i,
        })),
      )
      .select('id, sort_order');
    if (cErr || !criteria) {
      console.error(`  ✗ "${quiz.title}" — criteria failed:`, cErr?.message);
      process.exit(1);
    }
    // Order by sort_order rather than trusting insert order, so a question's
    // criterion index cannot silently point at the wrong criterion.
    const criterionIds = [...criteria]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => c.id);

    const { data: questions, error: qErr } = await supabase
      .from('questions')
      .insert(
        quiz.questions.map((q, i) => ({
          assessment_id: assessmentId,
          position: i + 1,
          content: q.content,
          options: q.options,
          correct_index: q.correct_index,
          explanation: q.explanation,
          difficulty: 'beginner' as const,
          question_type: 'multiple_choice',
          points: POINTS_PER_QUESTION,
          criteria_id: criterionIds[q.criterion],
        })),
      )
      .select('id, position');
    if (qErr || !questions) {
      console.error(`  ✗ "${quiz.title}" — questions failed:`, qErr?.message);
      process.exit(1);
    }

    const byPosition = [...questions].sort((a, b) => a.position - b.position);
    const links = quiz.questions.flatMap((q, i) =>
      q.competency_ids.map((competency_id) => ({
        question_id: byPosition[i].id,
        competency_id,
      })),
    );
    const { error: lErr } = await supabase.from('question_competencies').insert(links);
    if (lErr) {
      console.error(`  ✗ "${quiz.title}" — competency links failed:`, lErr.message);
      process.exit(1);
    }

    console.log(
      `  ✓ ${quiz.title} — ${quiz.criteria.length} criteria, ${questions.length} questions ` +
        `(${quiz.total_questions} served), ${links.length} competency links` +
        `${scenario ? '' : '  [unpaired]'}`,
    );
  }

  console.log(`\nQuizzes: ${created} created, ${replaced} rebuilt. All published.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
