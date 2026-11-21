/**
 * The teaching ward and its cases, copied from scripts/seed-basic-cases.ts so
 * the demo shows the same content a seeded school does. Each case's tasks are
 * precomputed into case-tasks.json (see scripts/demo-case-tasks.ts).
 */

type RoomStatus = "active" | "inactive" | "maintenance";
type SkillPick = string | { id: string; sections: string[] };

export interface CaseSeed {
  subject_id: number;
  hadm_id: number;
  name: string;
  age: number;
  gender: "M" | "F";
  diagnosis: string;
  medical_history: string;
  room_number: string;
  vitals: {
    heart_rate: number;
    blood_pressure: string;
    temperature: number;
    respiratory_rate: number;
    oxygen_saturation: number;
  };
  labs: Record<string, number>;
  scenario: {
    title: string;
    description: string;
    category: string;
    chief_complaint: string;
    physical_exam: string;
    treatment_plan: string;
    learning_objectives: string[];
    skills: SkillPick[];
    formerly?: string;
  };
}

export const WARD_ROOMS: {
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


export const CASES: CaseSeed[] = [
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
  {
    subject_id: 900009,
    hadm_id: 800009,
    name: 'Ernesto Pangilinan',
    age: 78,
    gender: 'M',
    diagnosis: 'Fall at home with a bruised left hip, no fracture on X-ray',
    medical_history: 'Hypertension on amlodipine 5 mg daily. Mild cataracts. Lives with his daughter and walks with a cane outdoors.',
    room_number: '104',
    vitals: { heart_rate: 84, blood_pressure: '148/86', temperature: 36.7, respiratory_rate: 18, oxygen_saturation: 96 },
    labs: { Hemoglobin: 12.8, 'White Blood Cells': 7.4, Sodium: 136, Potassium: 4.0, Creatinine: 1.1, Glucose: 104 },
    scenario: {
      title: 'Older Adult After a Fall: General Survey, Neurologic and Musculoskeletal Check',
      description:
        'A 78-year-old man admitted for observation after slipping in his bathroom last night. His hip X-ray shows no fracture, but he is bruised, a little unsteady, and unsure whether he blacked out. Start with a general survey, then a focused neurologic, musculoskeletal and peripheral vascular assessment, and take his blood pressure lying and sitting to look for a postural drop. Taylor’s Skills 2-1, 2-8, 1-7.',
      category: 'Medical-Surgical',
      chief_complaint: 'Fell in the bathroom last night; left hip sore',
      physical_exam: 'Awake and oriented to person, place and time, slow to answer. Bruise over the left lateral hip, tender, full passive range of motion. Grip strength equal. Wears glasses. Unsteady walking without his cane.',
      treatment_plan: 'Neurologic checks every 4 hours for 24 hours. Blood pressure lying and sitting each morning; report a systolic drop of 20 mm Hg or more. Fall precautions: bed low, call light in reach, non-slip footwear, assistance to the bathroom. Paracetamol for pain. Physical therapy review before discharge.',
      learning_objectives: [
        'Perform a general survey: appearance, behaviour, mobility and vital signs (Taylor’s Skill 2-1)',
        'Assess neurologic status, muscle strength, range of motion and peripheral pulses after a fall (Skill 2-8)',
        'Measure brachial blood pressure lying and sitting to detect a postural drop (Skill 1-7)',
      ],
      skills: ['2-1', '2-8', '1-7'],
    },
  },
  {
    subject_id: 900010,
    hadm_id: 800010,
    name: 'Lourdes Manalo',
    age: 81,
    gender: 'F',
    diagnosis: 'Chronic heart failure with mild fluid overload',
    medical_history: 'Heart failure for four years on furosemide and enalapril. Atrial fibrillation on warfarin. Her ankles have been more swollen this week.',
    room_number: '201',
    vitals: { heart_rate: 92, blood_pressure: '136/78', temperature: 36.5, respiratory_rate: 22, oxygen_saturation: 94 },
    labs: { Sodium: 133, Potassium: 3.6, Creatinine: 1.3, Hemoglobin: 11.9, INR: 2.4, Glucose: 112 },
    scenario: {
      title: 'Heart Failure in an Older Woman: Cardiovascular Assessment and Apical Pulse',
      description:
        'An 81-year-old woman with long-standing heart failure and atrial fibrillation, admitted because her ankles are more swollen and she now sleeps on three pillows. Her radial pulse is irregular, so it undercounts: auscultate the apical pulse for a full minute, complete a cardiovascular assessment including neck veins and oedema, and take an accurate blood pressure before her morning medicines. Taylor’s Skills 2-6, 1-5, 1-7.',
      category: 'Medical-Surgical',
      chief_complaint: 'Swollen ankles and short of breath lying flat',
      physical_exam: 'Alert, speaking in full sentences sitting up. Irregularly irregular heart rhythm. Neck veins distended at 45°. Pitting oedema to mid-shin on both legs (2+). Fine crackles at both lung bases.',
      treatment_plan: 'Apical pulse for a full minute before rate-control medicine; hold and report a rate below 60. Blood pressure before enalapril. Daily weight, strict intake and output, fluid restriction of 1.5 L a day. Report a weight gain of more than 1 kg in a day or worsening breathlessness.',
      learning_objectives: [
        'Perform a cardiovascular assessment: heart sounds, neck veins, capillary refill and oedema (Taylor’s Skill 2-6)',
        'Auscultate the apical pulse for a full minute and compare it with the radial pulse (Skill 1-5)',
        'Measure brachial blood pressure accurately before antihypertensive medicines (Skill 1-7)',
      ],
      skills: ['2-6', '1-5', '1-7'],
    },
  },
  {
    subject_id: 900011,
    hadm_id: 800011,
    name: 'Danilo Reyes',
    age: 58,
    gender: 'M',
    diagnosis: 'Community-acquired pneumonia of the right lower lobe',
    medical_history: 'Has smoked a pack a day for thirty years. Hypertension, not on regular medicine.',
    room_number: '201',
    vitals: { heart_rate: 104, blood_pressure: '132/84', temperature: 38.4, respiratory_rate: 26, oxygen_saturation: 89 },
    labs: { 'White Blood Cells': 15.8, Hemoglobin: 14.1, 'C-Reactive Protein': 96, Sodium: 135, Potassium: 4.1, Creatinine: 1.0 },
    scenario: {
      title: 'Pneumonia: Oxygen by Face Mask and Pulse Oximetry',
      description:
        'A 58-year-old smoker with three days of productive cough and fever, breathing fast with an oxygen saturation of 89% on room air. The doctor orders oxygen by simple face mask to keep his saturation at 94% or above. Fit the mask, set the flow, and watch his saturation and breathing closely so you notice early if the mask is not enough. Taylor’s Skills 14-4, 14-1, 1-6.',
      category: 'Medical-Surgical',
      chief_complaint: 'Cough with yellow sputum and fever for three days',
      physical_exam: 'Alert, using his accessory muscles slightly. Dullness and coarse crackles at the right base. Lips pink. Speaking in short sentences.',
      treatment_plan: 'Oxygen by simple face mask at 6–8 L/min, titrated to SpO₂ 94% or above. Continuous pulse oximetry; respiratory rate and SpO₂ every hour. IV antibiotics as ordered. Sit him upright and encourage coughing. Escalate for SpO₂ below 92% on the mask, a respiratory rate above 30, or drowsiness.',
      learning_objectives: [
        'Apply a simple face mask, set the flow rate and check the fit (Taylor’s Skill 14-4)',
        'Monitor oxygen saturation continuously and interpret the trend (Skill 14-1)',
        'Count respirations and note depth, rhythm and use of accessory muscles (Skill 1-6)',
      ],
      skills: ['14-4', '14-1', '1-6'],
    },
  },
  {
    subject_id: 900012,
    hadm_id: 800012,
    name: 'Felicidad Ramos',
    age: 45,
    gender: 'F',
    diagnosis: 'Acute pyelonephritis, day three of IV antibiotics',
    medical_history: 'Two urinary tract infections last year. No chronic illness. Allergic to sulfa drugs.',
    room_number: '102',
    vitals: { heart_rate: 86, blood_pressure: '122/78', temperature: 37.4, respiratory_rate: 18, oxygen_saturation: 98 },
    labs: { 'White Blood Cells': 11.0, Creatinine: 0.9, Sodium: 137, Potassium: 3.9, Hemoglobin: 12.6, Glucose: 98 },
    scenario: {
      title: 'Day Three of IV Fluids: Changing the Solution Container and Tubing',
      description:
        'A 45-year-old woman on her third day of IV fluids and antibiotics for a kidney infection. Her fever has settled. Her bag of D5LR is nearly empty and her administration set is due for its scheduled change, so hang the next container and replace the tubing without contaminating the line, then check the site and the infusion rate. Taylor’s Skills 15-2, 15-3.',
      category: 'Infection Management',
      chief_complaint: 'Flank pain and fever, now improving',
      physical_exam: 'Comfortable, no fever this morning. Mild right costovertebral angle tenderness. Peripheral IV in the left forearm, the site clean and dry, no redness or swelling.',
      treatment_plan: 'IV D5LR 1 L to run over 8 hours, then reassess. The administration set is due for its change today, per hospital policy. IV antibiotics as ordered. Check the IV site and rate every hour. Encourage oral fluids of 2 L a day.',
      learning_objectives: [
        'Change an IV solution container and administration set while keeping the system sterile (Taylor’s Skill 15-2)',
        'Monitor the IV site and the infusion rate, recognising infiltration and phlebitis (Skill 15-3)',
      ],
      skills: [{ id: '15-2', sections: ['To Change IV Solution Container and Administration Set'] }, '15-3'],
    },
  },
  {
    subject_id: 900013,
    hadm_id: 800013,
    name: 'Jerome Dizon',
    age: 29,
    gender: 'M',
    diagnosis: 'Dengue fever without warning signs, day four of illness',
    medical_history: 'Previously healthy. A neighbour was admitted with dengue last week.',
    room_number: '201',
    vitals: { heart_rate: 98, blood_pressure: '110/70', temperature: 38.0, respiratory_rate: 20, oxygen_saturation: 98 },
    labs: { 'Platelet Count': 98, Hematocrit: 44, 'White Blood Cells': 3.2, Sodium: 136, Potassium: 3.8, Creatinine: 0.9 },
    scenario: {
      title: 'Dengue Fever: Monitoring IV Fluids, Pulse and Blood Pressure',
      description:
        'A 29-year-old man on day four of dengue fever, when the critical phase can begin. He is on IV fluids, his platelets are falling and his haematocrit is creeping up. Your job is close watching: the IV site and the infusion at its ordered rate, and his pulse and blood pressure, where a rising pulse or a narrowing pulse pressure can be the first sign of plasma leakage. Taylor’s Skills 15-3, 1-7, 1-4.',
      category: 'Infection Management',
      chief_complaint: 'Fever, headache and body pains for four days',
      physical_exam: 'Alert and flushed. Petechiae on both forearms. Mild epigastric tenderness, no enlarged liver. Capillary refill under 2 seconds. Peripheral IV in the right hand.',
      treatment_plan: 'IV PNSS at the ordered rate; check the site and rate every hour. Blood pressure and pulse every 2 hours; report a pulse pressure of 20 mm Hg or less, a systolic below 90, or a pulse above 110. Strict intake and output. CBC with platelet count and haematocrit every 12 hours. Watch for warning signs: abdominal pain, persistent vomiting, bleeding, restlessness.',
      learning_objectives: [
        'Monitor an IV infusion and site, keeping the rate as ordered (Taylor’s Skill 15-3)',
        'Measure brachial blood pressure and work out the pulse pressure (Skill 1-7)',
        'Palpate the radial pulse for rate, rhythm and volume (Skill 1-4)',
      ],
      skills: ['15-3', '1-7', '1-4'],
    },
  },
  {
    subject_id: 900014,
    hadm_id: 800014,
    name: 'Teresita Abad',
    age: 66,
    gender: 'F',
    diagnosis: 'Right pleural effusion, day two after thoracentesis',
    medical_history: 'Breast cancer treated six years ago, in remission. Hypertension on losartan.',
    room_number: '201',
    vitals: { heart_rate: 90, blood_pressure: '138/82', temperature: 36.9, respiratory_rate: 22, oxygen_saturation: 93 },
    labs: { Hemoglobin: 11.8, 'White Blood Cells': 8.1, Albumin: 3.2, Sodium: 137, Potassium: 4.0, Creatinine: 0.8 },
    scenario: {
      title: 'Pleural Effusion: Nasal Cannula Oxygen and Incentive Spirometry',
      description:
        'A 66-year-old woman two days after a litre of fluid was drained from her right chest. She breathes more easily but still shallowly, and her saturation sits at 93% on room air. Start oxygen by nasal cannula as ordered, check her saturation, and teach her to use an incentive spirometer so the right lung re-expands. Taylor’s Skills 14-3, 14-1, 14-2.',
      category: 'Patient Education',
      chief_complaint: 'Short of breath walking to the bathroom',
      physical_exam: 'Alert, sitting upright. Reduced breath sounds and dullness at the right base. Thoracentesis site dressing dry. No calf tenderness.',
      treatment_plan: 'Oxygen by nasal cannula at 2 L/min to keep SpO₂ at 94% or above. SpO₂ and respiratory rate every 4 hours and with activity. Incentive spirometer 10 breaths every hour while awake. Chest X-ray in the morning. Report sudden breathlessness or chest pain.',
      learning_objectives: [
        'Give oxygen by nasal cannula at the ordered flow, with attention to the skin and comfort (Taylor’s Skill 14-3)',
        'Use a pulse oximeter to check the response to oxygen (Skill 14-1)',
        'Teach incentive spirometer use and obtain a return demonstration (Skill 14-2)',
      ],
      skills: ['14-3', '14-1', '14-2'],
    },
  },
];
