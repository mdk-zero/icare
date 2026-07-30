import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const COMPETENCIES = {
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

interface CriteriaSeed {
  name: string;
  weight: number;
  competency_id: string;
}

interface QuestionSeed {
  content: string;
  options: string[];
  correct_index: number;
  question_type: string;
  points: number;
  explanation: string;
  competency_ids: string[];
}

interface AssessmentSeed {
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: string;
  time_limit_seconds: number | null;
  criteria: CriteriaSeed[];
  questions: QuestionSeed[];
}

const assessments: AssessmentSeed[] = [
    {
      title: 'Vital Signs Fundamentals',
      description:
        'Assess knowledge of normal vital sign ranges, proper measurement techniques, and interpretation of abnormal findings in adult patients.',
      difficulty: 'beginner',
      category: 'Medical-Surgical',
      time_limit_seconds: 900,
      criteria: [
        {
          name: 'Accuracy of Vital Signs Interpretation',
          weight: 30,
          competency_id: COMPETENCIES.SAFE_QUALITY_CARE,
        },
        {
          name: 'Proper Measurement Technique',
          weight: 20,
          competency_id: COMPETENCIES.SAFE_QUALITY_CARE,
        },
        {
          name: 'Identification of Abnormal Findings',
          weight: 25,
          competency_id: COMPETENCIES.RECORDS_MANAGEMENT,
        },
        {
          name: 'Clinical Decision Making',
          weight: 25,
          competency_id: COMPETENCIES.SAFE_QUALITY_CARE,
        },
      ],
    questions: [
      {
        content: 'What is the normal adult resting heart rate range?',
        options: ['40-60 bpm', '60-100 bpm', '80-120 bpm', '100-140 bpm'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation: 'The normal adult resting heart rate is 60-100 beats per minute.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which artery is most commonly used to measure blood pressure?',
        options: ['Radial artery', 'Femoral artery', 'Brachial artery', 'Carotid artery'],
        correct_index: 2,
        question_type: 'multiple_choice',
        points: 1,
        explanation: 'The brachial artery is the standard site for blood pressure measurement.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          "A patient's oxygen saturation is 89%. What is the most appropriate action?",
        options: [
          'Document as normal',
          'Administer supplemental oxygen and notify provider',
          'Recheck in 4 hours',
          'Encourage deep breathing only',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation: 'SpO2 below 90% indicates hypoxemia requiring immediate intervention.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'A temperature of 38.5°C (101.3°F) is classified as:',
        options: ['Hypothermia', 'Normal', 'Pyrexia (fever)', 'Hyperpyrexia'],
        correct_index: 2,
        question_type: 'multiple_choice',
        points: 1,
        explanation: 'Pyrexia is defined as a body temperature above 38°C (100.4°F).',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'The nurse should measure orthostatic vital signs when:',
        options: [
          'The patient requests it',
          'The patient reports dizziness upon standing',
          'Routinely every shift',
          'Only for elderly patients',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'Orthostatic vitals are indicated when a patient reports dizziness, lightheadedness, or syncope upon position change.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'What is the normal adult respiratory rate range?',
        options: ['8-12 breaths/min', '12-20 breaths/min', '20-28 breaths/min', '28-36 breaths/min'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation: 'The normal adult respiratory rate is 12-20 breaths per minute.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'What is the normal adult blood pressure classification?',
        options: [
          'Systolic < 100 mmHg and Diastolic < 70 mmHg',
          'Systolic < 120 mmHg and Diastolic < 80 mmHg',
          'Systolic < 130 mmHg and Diastolic < 85 mmHg',
          'Systolic < 140 mmHg and Diastolic < 90 mmHg',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation: 'Normal blood pressure is systolic < 120 mmHg and diastolic < 80 mmHg.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'Which of the following can cause a falsely low pulse oximetry reading?',
        options: [
          'Fever',
          'Hypotension',
          'Cold extremities',
          'Anxiety',
        ],
        correct_index: 2,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Cold extremities cause vasoconstriction, reducing blood flow and leading to falsely low SpO2 readings.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'A patient has a blood pressure of 150/95 mmHg on two separate readings. This is classified as:',
        options: ['Normal', 'Elevated', 'Stage 1 Hypertension', 'Stage 2 Hypertension'],
        correct_index: 2,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'Stage 1 hypertension is systolic 130-139 or diastolic 80-89 mmHg. 150/95 falls under Stage 2.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'When measuring blood pressure manually, the cuff should be placed:',
        options: [
          'Directly over the antecubital fossa',
          '2-3 cm above the antecubital fossa',
          '5 cm below the antecubital fossa',
          'At wrist level',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation: 'The cuff should be placed 2-3 cm above the antecubital fossa for accurate measurement.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
    ],
  },
  {
    title: 'Cardiac Emergency Response',
    description:
      'Test your ability to recognize cardiac emergencies, interpret ECG rhythms, and initiate appropriate life-saving interventions.',
    difficulty: 'advanced',
    category: 'Cardiac Emergency',
    time_limit_seconds: 1200,
      criteria: [
        {
          name: 'ACLS Algorithm Knowledge',
          weight: 25,
          competency_id: COMPETENCIES.SAFE_QUALITY_CARE,
        },
        {
          name: 'ECG Rhythm Interpretation',
          weight: 20,
          competency_id: COMPETENCIES.SAFE_QUALITY_CARE,
        },
        {
          name: 'Emergency Pharmacology',
          weight: 20,
          competency_id: COMPETENCIES.PHARMACOLOGY,
        },
        {
          name: 'Team Dynamics During Code',
          weight: 15,
          competency_id: COMPETENCIES.COLLABORATION_TEAMWORK,
        },
        {
          name: 'Post-Resuscitation Care',
          weight: 20,
          competency_id: COMPETENCIES.SAFE_QUALITY_CARE,
        },
      ],
      questions: [
        {
          content:
            'A patient is in ventricular fibrillation. What is the priority intervention?',
        options: [
          'Administer amiodarone',
          'Perform immediate defibrillation',
          'Start chest compressions',
          'Insert an advanced airway',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'Defibrillation is the priority for VF/pulseless VT per ACLS guidelines.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'Which ECG finding is most characteristic of acute ST-elevation MI?',
        options: [
          'ST-segment depression',
          'T-wave inversion',
          'ST-segment elevation in contiguous leads',
          'Widened QRS complex',
        ],
        correct_index: 2,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'ST-elevation in two or more contiguous leads indicates acute STEMI.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'A patient with unstable angina should be administered which medication first?',
        options: ['Morphine', 'Nitroglycerin sublingual', 'Heparin infusion', 'Beta-blocker'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Sublingual nitroglycerin is the first-line treatment for acute angina.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'The compression-to-ventilation ratio for adult CPR by a single rescuer is:',
        options: ['15:2', '30:2', '5:1', '20:2'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'The AHA recommends a 30:2 compression-to-ventilation ratio for single-rescuer adult CPR.',
        competency_ids: [COMPETENCIES.COLLABORATION_TEAMWORK],
      },
      {
        content:
          'Which medication is the first-line antiarrhythmic for pulseless VT/VF?',
        options: ['Lidocaine', 'Amiodarone', 'Magnesium sulfate', 'Adenosine'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'Amiodarone is the first-line antiarrhythmic for shock-refractory VF/pulseless VT per ACLS.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'The maximum interval for pausing chest compressions during CPR should not exceed:',
        options: ['5 seconds', '10 seconds', '15 seconds', '20 seconds'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation: 'Chest compression pauses should be limited to less than 10 seconds to maintain coronary perfusion.',
        competency_ids: [COMPETENCIES.COLLABORATION_TEAMWORK],
      },
      {
        content:
          'A patient presents with chest pain, diaphoresis, and nausea. ECG shows ST-depression in leads V3-V6. This is most suggestive of:',
        options: ['STEMI', 'NSTEMI', 'Stable angina', 'Pericarditis'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'ST-depression with elevated cardiac enzymes indicates NSTEMI (non-ST-elevation MI).',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'What is the target depth for adult chest compressions during CPR?',
        options: ['1 inch (2.5 cm)', '2 inches (5 cm)', '3 inches (7.5 cm)', '4 inches (10 cm)'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'The recommended compression depth for adult CPR is at least 2 inches (5 cm).',
        competency_ids: [COMPETENCIES.COLLABORATION_TEAMWORK],
      },
      {
        content:
          'Which rhythm is NOT shockable?',
        options: ['Ventricular fibrillation', 'Pulseless ventricular tachycardia', 'Asystole', 'Torsades de pointes'],
        correct_index: 2,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Asystole is not a shockable rhythm. It requires high-quality CPR and IV/IO epinephrine.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'During a code blue, the nurse\'s role is to:',
        options: [
          'Stand by and observe',
          'Begin CPR immediately until the team arrives',
          'Wait for the physician to give orders',
          'Page the family',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Nurses should initiate CPR immediately upon recognizing cardiac arrest.',
        competency_ids: [COMPETENCIES.COLLABORATION_TEAMWORK],
      },
    ],
  },
  {
    title: 'Medication Administration Safety',
    description:
      'Evaluate understanding of the rights of medication administration, dosage calculations, and prevention of medication errors.',
    difficulty: 'intermediate',
    category: 'Medication Safety',
    time_limit_seconds: 900,
    criteria: [
      {
        name: 'Dosage Calculation Accuracy',
        weight: 25,
        competency_id: COMPETENCIES.PHARMACOLOGY,
      },
      {
        name: 'Medication Rights & Safety',
        weight: 30,
        competency_id: COMPETENCIES.LEGAL_RESPONSIBILITY,
      },
      {
        name: 'Adverse Event Response',
        weight: 25,
        competency_id: COMPETENCIES.SAFE_QUALITY_CARE,
      },
      {
        name: 'Safe Administration Routes',
        weight: 20,
        competency_id: COMPETENCIES.PHARMACOLOGY,
      },
    ],
    questions: [
      {
        content:
          'A patient is ordered 500 mg of a medication. The available tablet is 250 mg. How many tablets should the nurse administer?',
        options: ['1 tablet', '1.5 tablets', '2 tablets', '2.5 tablets'],
        correct_index: 2,
        question_type: 'multiple_choice',
        points: 2,
        explanation: '500 mg ÷ 250 mg/tablet = 2 tablets.',
        competency_ids: [COMPETENCIES.PHARMACOLOGY],
      },
      {
        content:
          'The nurse is administering an IM injection. Which site is preferred for adults?',
        options: ['Deltoid', 'Ventrogluteal', 'Dorsogluteal', 'Rectus femoris'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'The ventrogluteal site is preferred for IM injections in adults due to fewer major vessels and nerves.',
        competency_ids: [COMPETENCIES.PHARMACOLOGY, COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'A nurse discovers they administered the wrong medication to a patient. The first action should be:',
        options: [
          'Complete an incident report',
          'Notify the provider and assess the patient',
          'Inform the charge nurse only',
          'Wait and observe for adverse effects',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'Patient safety is priority — assess the patient and notify the provider immediately.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE, COMPETENCIES.LEGAL_RESPONSIBILITY],
      },
      {
        content:
          'The "five rights" of medication administration include all of the following EXCEPT:',
        options: ['Right patient', 'Right dose', 'Right diagnosis', 'Right route'],
        correct_index: 2,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'The five rights are: right patient, drug, dose, route, and time. Diagnosis is not one of them.',
        competency_ids: [COMPETENCIES.LEGAL_RESPONSIBILITY],
      },
      {
        content:
          'An order reads "administer 1 L of 0.9% NaCl over 8 hours." What is the infusion rate in mL/hr?',
        options: ['100 mL/hr', '125 mL/hr', '150 mL/hr', '175 mL/hr'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation: '1000 mL ÷ 8 hours = 125 mL/hr.',
        competency_ids: [COMPETENCIES.PHARMACOLOGY],
      },
      {
        content:
          'A patient is ordered Heparin 5,000 units subcutaneously. The vial contains 10,000 units/mL. How many mL should be administered?',
        options: ['0.25 mL', '0.5 mL', '0.75 mL', '1 mL'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation: '5,000 units ÷ 10,000 units/mL = 0.5 mL.',
        competency_ids: [COMPETENCIES.PHARMACOLOGY],
      },
      {
        content:
          'Which of the following is a high-alert medication requiring special safeguards?',
        options: ['Acetaminophen', 'Insulin', 'Amoxicillin', 'Ibuprofen'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Insulin is a high-alert medication with significant risk of patient harm if used in error.',
        competency_ids: [COMPETENCIES.PHARMACOLOGY, COMPETENCIES.LEGAL_RESPONSIBILITY],
      },
      {
        content:
          'The nurse must verify a medication order against the MAR. This is an example of which right?',
        options: ['Right patient', 'Right dose', 'Right medication', 'All of the above'],
        correct_index: 3,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Verifying the order against the MAR ensures the right patient receives the right medication at the right dose.',
        competency_ids: [COMPETENCIES.LEGAL_RESPONSIBILITY],
      },
      {
        content:
          'A patient refuses an oral medication. What is the nurse\'s best action?',
        options: [
          'Crush the medication and hide it in food',
          'Document the refusal and notify the provider',
          'Insist the patient takes it',
          'Administer via another route',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'The patient has the right to refuse treatment. The nurse should document and notify the provider.',
        competency_ids: [COMPETENCIES.LEGAL_RESPONSIBILITY, COMPETENCIES.ETHICO_MORAL],
      },
      {
        content:
          'A patient is prescribed 250 mg of a medication. The available suspension is 125 mg/5 mL. How many mL should be administered?',
        options: ['5 mL', '10 mL', '15 mL', '20 mL'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          '250 mg ÷ 125 mg × 5 mL = 10 mL.',
        competency_ids: [COMPETENCIES.PHARMACOLOGY],
      },
    ],
  },
  {
    title: 'Infection Control & Prevention',
    description:
      'Assess knowledge of standard precautions, transmission-based precautions, hand hygiene, and healthcare-associated infection prevention.',
    difficulty: 'intermediate',
    category: 'Infection Management',
    time_limit_seconds: 900,
    criteria: [
      {
        name: 'Transmission-Based Precautions Knowledge',
        weight: 40,
        competency_id: COMPETENCIES.SAFE_QUALITY_CARE,
      },
      {
        name: 'Hand Hygiene & Standard Precautions',
        weight: 35,
        competency_id: COMPETENCIES.MANAGEMENT_RESOURCES,
      },
      {
        name: 'Healthcare-Associated Infection Prevention',
        weight: 25,
        competency_id: COMPETENCIES.QUALITY_IMPROVEMENT,
      },
    ],
    questions: [
      {
        content:
          'A patient is diagnosed with pulmonary tuberculosis. Which type of precautions should be implemented?',
        options: [
          'Standard precautions only',
          'Contact precautions',
          'Droplet precautions',
          'Airborne precautions',
        ],
        correct_index: 3,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'TB requires airborne precautions including N95 respirator and negative pressure room.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'Alcohol-based hand rub is effective against all of the following EXCEPT:',
        options: ['MRSA', 'C. difficile spores', 'E. coli', 'Influenza virus'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'C. difficile spores are not killed by alcohol-based hand rubs — soap and water are required.',
        competency_ids: [COMPETENCIES.MANAGEMENT_RESOURCES, COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'A patient with C. difficile infection requires which type of isolation?',
        options: ['Airborne', 'Droplet', 'Contact', 'Protective environment'],
        correct_index: 2,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'C. difficile requires contact precautions due to spore transmission via contaminated surfaces.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'Sterile gloves should be worn during:',
        options: [
          'Taking vital signs',
          "Inserting a urinary catheter",
          "Checking a patient's IV site",
          'Administering oral medications',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Sterile gloves are required for any procedure that requires a sterile field, such as catheter insertion.',
        competency_ids: [COMPETENCIES.MANAGEMENT_RESOURCES, COMPETENCIES.QUALITY_IMPROVEMENT],
      },
      {
        content:
          'Which of the following is the most effective method for preventing healthcare-associated infections?',
        options: [
          'Wearing gloves at all times',
          'Hand hygiene before and after patient contact',
          'Isolating all patients',
          'Using antibiotics prophylactically',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'Hand hygiene is the single most effective measure to prevent HAI transmission.',
        competency_ids: [COMPETENCIES.MANAGEMENT_RESOURCES, COMPETENCIES.QUALITY_IMPROVEMENT],
      },
      {
        content:
          'A patient has MRSA in a wound. What type of precautions should be implemented?',
        options: ['Standard', 'Contact', 'Droplet', 'Airborne'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'MRSA requires contact precautions — gown and gloves upon entry to the patient room.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'How long should a healthcare worker perform hand hygiene with soap and water?',
        options: ['At least 10 seconds', 'At least 20 seconds', 'At least 40 seconds', 'At least 60 seconds'],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'CDC recommends hand washing with soap and water for at least 20 seconds.',
        competency_ids: [COMPETENCIES.MANAGEMENT_RESOURCES],
      },
      {
        content:
          'Needles should be disposed of in which type of container?',
        options: [
          'Regular trash bin',
          'Biohazard sharps container',
          'Red bag waste',
          'Glass disposal bin',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Needles must be disposed immediately in a puncture-resistant sharps container.',
        competency_ids: [COMPETENCIES.MANAGEMENT_RESOURCES, COMPETENCIES.SAFE_QUALITY_CARE],
      },
      {
        content:
          'A nurse sustains a needlestick injury. What should be done FIRST?',
        options: [
          'Complete an incident report',
          'Wash the site thoroughly with soap and water',
          'Notify the supervisor',
          'Get tested for bloodborne pathogens',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'Immediately wash the needlestick site with soap and water to reduce infection risk.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE, COMPETENCIES.MANAGEMENT_RESOURCES],
      },
      {
        content:
          'Which personal protective equipment (PPE) should be worn when caring for a patient on contact precautions?',
        options: [
          'Mask and eye protection',
          'Gown and gloves',
          'N95 respirator only',
          'Face shield only',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Contact precautions require gown and gloves upon entry to the patient room.',
        competency_ids: [COMPETENCIES.SAFE_QUALITY_CARE, COMPETENCIES.MANAGEMENT_RESOURCES],
      },
    ],
  },
  {
    title: 'Patient Education & Communication',
    description:
      'Evaluate therapeutic communication techniques, patient education principles, and culturally competent care delivery.',
    difficulty: 'beginner',
    category: 'Patient Education',
    time_limit_seconds: 600,
    criteria: [
      {
        name: 'Therapeutic Communication Techniques',
        weight: 25,
        competency_id: COMPETENCIES.COMMUNICATION,
      },
      {
        name: 'Patient Education Methods',
        weight: 25,
        competency_id: COMPETENCIES.HEALTH_EDUCATION,
      },
      {
        name: 'Cultural Competence in Care',
        weight: 15,
        competency_id: COMPETENCIES.ETHICO_MORAL,
      },
      {
        name: 'Health Literacy Assessment',
        weight: 20,
        competency_id: COMPETENCIES.HEALTH_EDUCATION,
      },
      {
        name: 'Interprofessional Collaboration',
        weight: 15,
        competency_id: COMPETENCIES.COLLABORATION_TEAMWORK,
      },
    ],
    questions: [
      {
        content:
          'Which communication technique encourages the patient to express feelings?',
        options: [
          'Closed-ended questions',
          'Active listening and open-ended questions',
          'Giving advice',
          'Changing the subject',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Open-ended questions and active listening encourage patients to express themselves freely.',
        competency_ids: [COMPETENCIES.COMMUNICATION],
      },
      {
        content:
          'A patient with limited English proficiency arrives for discharge teaching. The best approach is to:',
        options: [
          'Speak loudly and slowly',
          'Use a certified medical interpreter',
          'Ask a family member to translate',
          'Provide written instructions in English only',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'Certified medical interpreters ensure accurate communication and patient safety.',
        competency_ids: [COMPETENCIES.COMMUNICATION, COMPETENCIES.ETHICO_MORAL],
      },
      {
        content:
          "When teaching a patient about a new diagnosis, the nurse should first:",
        options: [
          'Provide a pamphlet',
          "Assess the patient's readiness to learn",
          'Teach the most complex information first',
          'Ask if they have questions at the end',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Assessing readiness to learn is the first step in the teaching process.',
        competency_ids: [COMPETENCIES.HEALTH_EDUCATION],
      },
      {
        content:
          'A patient says "I don\'t think I can manage this insulin at home." The nurse\'s best response is:',
        options: [
          '"You\'ll get used to it."',
          '"What part concerns you most about managing your insulin?"',
          '"It\'s really quite simple."',
          '"Your doctor prescribed it for a reason."',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          "Asking open-ended questions addresses the patient's specific concerns and promotes patient-centered care.",
        competency_ids: [COMPETENCIES.HEALTH_EDUCATION, COMPETENCIES.COMMUNICATION],
      },
      {
        content:
          'Which of the following is a barrier to effective patient education?',
        options: [
          'Using simple language',
          'Assessing readiness to learn',
          'Providing written materials in the patient\'s language',
          'Teaching when the patient is in severe pain',
        ],
        correct_index: 3,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Pain is a significant barrier to learning. Education should be deferred until the patient is comfortable.',
        competency_ids: [COMPETENCIES.HEALTH_EDUCATION],
      },
      {
        content:
          'When communicating with a visually impaired patient, the nurse should:',
        options: [
          'Speak loudly',
          'Identify themselves when entering the room',
          'Avoid touching the patient',
          'Use written instructions only',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Identifying yourself helps orient the visually impaired patient and reduces anxiety.',
        competency_ids: [COMPETENCIES.COMMUNICATION],
      },
      {
        content:
          'The teach-back method is used to:',
        options: [
          'Test the patient\'s intelligence',
          'Confirm the patient understands instructions in their own words',
          'Document that teaching occurred',
          ' Evaluate the nurse\'s teaching skills',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'Teach-back asks patients to explain information in their own words to confirm understanding.',
        competency_ids: [COMPETENCIES.HEALTH_EDUCATION, COMPETENCIES.COMMUNICATION],
      },
      {
        content:
          'Which statement demonstrates effective therapeutic communication?',
        options: [
          '"You shouldn\'t worry about the surgery."',
          '"It sounds like you\'re feeling anxious about the procedure."',
          '"Everything will be fine."',
          '"I know exactly how you feel."',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Reflecting the patient\'s feelings validates their emotions and promotes therapeutic communication.',
        competency_ids: [COMPETENCIES.COMMUNICATION],
      },
      {
        content:
          'The nurse is teaching a patient about a low-sodium diet. Which approach is most effective?',
        options: [
          'Give the patient a list of foods to avoid',
          'Explain why sodium restriction is important and provide examples',
          'Refer the patient to a dietitian without further explanation',
          'Tell the patient to avoid all packaged foods',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 2,
        explanation:
          'Effective education includes explaining the rationale and providing practical examples to promote adherence.',
        competency_ids: [COMPETENCIES.HEALTH_EDUCATION, COMPETENCIES.COMMUNICATION],
      },
      {
        content:
          'When providing discharge instructions to an older adult, the nurse should:',
        options: [
          'Provide all information at once',
          'Use large-print materials and allow extra time',
          'Speak quickly to avoid taking too much time',
          'Avoid using written materials',
        ],
        correct_index: 1,
        question_type: 'multiple_choice',
        points: 1,
        explanation:
          'Older adults may benefit from larger print, simplified instructions, and additional time for teaching.',
        competency_ids: [COMPETENCIES.HEALTH_EDUCATION],
      },
    ],
  },
];

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

  const { data: faculty, error: facultyErr } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'faculty')
    .limit(1)
    .maybeSingle();

  if (facultyErr || !faculty) {
    console.error('No faculty user found. Run seed.ts first:', facultyErr);
    process.exit(1);
  }

  console.log(`Using faculty user: ${faculty.id}`);
  console.log(`Seeding ${assessments.length} assessments with criteria and questions...\n`);

  for (const a of assessments) {
    // 1. Create assessment
    const { data: assessment, error: createErr } = await supabase
      .from('assessments')
      .insert({
        created_by: faculty.id,
        title: a.title,
        description: a.description,
        difficulty: a.difficulty,
        category: a.category,
        time_limit_seconds: a.time_limit_seconds,
        is_published: true,
      })
      .select('id')
      .single();

    if (createErr || !assessment) {
      console.error(`  ✗ Failed to create "${a.title}":`, createErr);
      continue;
    }

    // 2. Create criteria and capture IDs
    const criteriaRows = a.criteria.map((c, i) => ({
      assessment_id: assessment.id,
      name: c.name,
      weight: c.weight,
      competency_id: c.competency_id,
      sort_order: i,
    }));

    const { data: createdCriteria, error: cErr } = await supabase
      .from('assessment_criteria')
      .insert(criteriaRows)
      .select('id');

    if (cErr || !createdCriteria) {
      console.error(`  ✗ "${a.title}" — criteria failed:`, cErr);
      continue;
    }

    // Distribute questions across criteria round-robin so every criterion
    // owns at least one question and no question is left unassigned.
    // 3. Create questions with criteria_id
    const questionRows = a.questions.map((q, i) => ({
      assessment_id: assessment.id,
      position: i + 1,
      content: q.content,
      options: q.options,
      correct_index: q.correct_index,
      question_type: q.question_type,
      points: q.points,
      explanation: q.explanation,
      criteria_id: createdCriteria[i % createdCriteria.length].id,
    }));

    const { data: createdQuestions, error: qErr } = await supabase
      .from('questions')
      .insert(questionRows)
      .select('id');

    if (qErr || !createdQuestions) {
      console.error(`  ✗ "${a.title}" — questions failed:`, qErr);
      continue;
    }

    // 4. Link questions to competencies
    const qcRows: { question_id: string; competency_id: string }[] = [];
    for (let i = 0; i < createdQuestions.length; i++) {
      const qId = createdQuestions[i].id;
      const compIds = a.questions[i].competency_ids;
      for (const compId of compIds) {
        qcRows.push({ question_id: qId, competency_id: compId });
      }
    }

    if (qcRows.length > 0) {
      const { error: qcErr } = await supabase
        .from('question_competencies')
        .insert(qcRows);

      if (qcErr) {
        console.error(`  ✗ "${a.title}" — question-competency links failed:`, qcErr);
      }
    }

    console.log(
      `  ✓ "${a.title}" — ${a.criteria.length} criteria, ${createdQuestions.length} questions, ${qcRows.length} competency links`,
    );
  }

  console.log('\nDone!');
}

main();
