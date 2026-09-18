/**
 * Seeds one quiz per ward scenario from seed-basic-cases.ts.
 *
 * The pairing is the point: a student works Rosa Delgado's fever at the
 * bedside, then sits a quiz on exactly the skills that case used. Scenario and
 * quiz share a category and a set of Taylor's skills, so the assessment
 * measures what the scenario just taught instead of testing unrelated material.
 *
 * Source. Every question is written from one step of the skill checklists in
 * Lynn & LeBon, "Skill Checklists for Taylor's Clinical Nursing Skills: A
 * Nursing Process Approach", 3rd ed. (Wolters Kluwer / LWW, 2011), shipped in
 * docs/. Each criterion is one Taylor's skill (named with its number), and
 * each explanation opens with the skill and step it came from, so a student
 * who misses a question can open the checklist and read the step. validate()
 * refuses a question that does not cite its skill.
 *
 * Every quiz is built to satisfy publish validation (app/lib/assessment-
 * validation.ts) so it can be published rather than sitting in draft:
 *
 *   - criteria weights total exactly 100
 *   - every question is owned by a criterion (an unassigned one is never served)
 *   - each criterion holds at least its min_questions
 *   - total_questions <= the assigned bank, and >= the sum of the minimums
 *
 * Banks are ten or eleven questions and each attempt serves six. The surplus is
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
  /**
   * The title this quiz had before it was rebuilt on the Taylor's checklists.
   * A re-run finds the old row by it and renames it in place, so the quiz
   * keeps its id — and seed-student-history.ts, which clears attempts by
   * assessment id, still finds and rebuilds the old ones.
   */
  formerly?: string;
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
    scenario_title: 'Fever Workup: Vital Signs and a Nasopharyngeal Swab',
    title: 'Temperature, Pulse, Respiration, and Nasopharyngeal Swab',
    formerly: 'Fever Assessment and Management',
    description:
      'Built from Taylor’s skill checklists 1-1 (Assessing Body Temperature), 1-4 (Assessing a Peripheral Pulse by Palpation), 1-6 (Assessing Respiration), 18-5 (Obtaining a Nasopharyngeal Swab), and 5-1 (Administering Oral Medications), the skills Rosa Delgado’s fever workup calls for.',
    category: 'General',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Skill 1-1 · Assessing Body Temperature', weight: 30, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skills 1-4 & 1-6 · Pulse and Respiration', weight: 20, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 18-5 · Obtaining a Nasopharyngeal Swab', weight: 30, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 5-1 · Administering Oral Medications', weight: 20, min_questions: 1, competency_id: C.PHARMACOLOGY },
    ],
    questions: [
      {
        content: 'Where does the nurse place the covered probe of an electronic thermometer to take an oral temperature?',
        options: [
          'On top of the tongue, just behind the front teeth',
          'Between the cheek and the lower gum, lips closed',
          'In the posterior sublingual pocket, lips closed',
          'Under the tip of the tongue, with the mouth left open',
        ],
        correct_index: 2,
        explanation: 'Skill 1-1, oral step 12: place the probe beneath the tongue in the posterior sublingual pocket and ask the patient to close the lips around it, then hold it until the beep (step 13).',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Before inserting a tympanic thermometer in an adult, how does the nurse straighten the ear canal?',
        options: [
          'Pull the pinna up and back',
          'Pull the pinna down and back',
          'Press the tragus forward over the canal',
          'Tilt the head toward the opposite shoulder',
        ],
        correct_index: 0,
        explanation: 'Skill 1-1, tympanic step 12: insert the probe snugly, angled toward the jaw line, pulling the pinna up and back to straighten the canal in an adult. The reading is immediate, usually within 2 seconds (step 13).',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'How far is a lubricated rectal thermometer probe inserted in an adult?',
        options: ['About 0.5 inch', 'About 3 inches', 'About 1 inch', 'About 1.5 inches'],
        correct_index: 3,
        explanation: 'Skill 1-1, rectal steps 13–15: lubricate about 1 inch of the probe and insert it about 1.5 inches in an adult (1 inch in a child), with the patient side-lying and only the buttocks exposed.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'After counting a radial pulse for 30 seconds, the nurse notices the rhythm is irregular. What should the nurse do?',
        options: [
          'Double the 30-second count and record it',
          'Count again for a full minute',
          'Count for 15 seconds and multiply by 4',
          'Record “irregular” without a rate',
        ],
        correct_index: 1,
        explanation: 'Skill 1-4, step 9: a 30-second count doubled is only acceptable when the pulse is normal. If the rate, rhythm, or amplitude is abnormal in any way, palpate and count for 1 full minute, then note rhythm and amplitude (step 10).',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE, C.QUALITY_IMPROVEMENT],
      },
      {
        content: 'Why does the nurse count respirations while the fingers are still on the pulse?',
        options: [
          'So the patient does not notice the breathing is being counted and alter it',
          'Because the respiratory rate is calculated from the pulse rate',
          'To keep the patient’s arm still for the blood pressure',
          'To feel the respirations through the radial artery',
        ],
        correct_index: 0,
        explanation: 'Skill 1-6, step 1: observe respirations while your fingers are still in place after counting the pulse. People change their breathing when they know it is being watched, so the count stays unobtrusive. Count 30 seconds × 2, or a full minute if abnormal (steps 3–4).',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'How is the swab placed when collecting a nasopharyngeal specimen from an adult?',
        options: [
          'About 2 inches into the naris and removed immediately',
          'Rubbed firmly along the inside of both nostrils for 5 seconds',
          'About 6 inches through one naris, rotated, and left 15–30 seconds',
          'Through the mouth, against the back of the throat for 15 seconds',
        ],
        correct_index: 2,
        explanation: 'Skill 18-5, step 10: insert the swab approximately 6 inches (adult) through one naris to the nasopharynx, rotate it, and leave it 15 to 30 seconds, without touching the tongue or the sides of the nostril.',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Immediately before inserting the nasopharyngeal swab, what does the nurse ask the patient to do?',
        options: [
          'Hold her breath and close her eyes',
          'Lie flat with her chin tucked',
          'Gargle with water',
          'Cough, then tip her head back',
        ],
        correct_index: 3,
        explanation: 'Skill 18-5, step 7: ask the patient to cough and then tip the head back, assisting as necessary. The nurse then inspects the back of the throat with a tongue depressor (step 9) before inserting the swab.',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE, C.COMMUNICATION],
      },
      {
        content: 'Which details must the nasopharyngeal specimen label carry?',
        options: [
          'The patient’s name, diagnosis, and attending physician',
          'Name, ID number, time, route, and who collected it',
          'The ordering doctor, room number, and test requested',
          'Only the date, since the requisition carries the rest',
        ],
        correct_index: 1,
        explanation: 'Skill 18-5, step 4: check the label against the ID bracelet. It must include the patient’s name and identification number, time of collection, route of collection, the person obtaining the sample, and anything else agency policy requires.',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE, C.RECORDS_MANAGEMENT],
      },
      {
        content: 'How does the nurse identify Rosa before giving her paracetamol?',
        options: [
          'By two identifiers, such as her ID band and her stated name and birth date',
          'By calling her full name and waiting for her to answer to it',
          'By matching her room and bed number to the MAR before entering',
          'By asking the nurse from the previous shift to point her out',
        ],
        correct_index: 0,
        explanation: 'Skill 5-1, step 14: identify the patient using two methods and compare with the CMAR/MAR: the name and ID number on the band, and the patient stating name and birth date. Room and bed numbers are never identifiers.',
        criterion: 3,
        competency_ids: [C.PHARMACOLOGY, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Rosa asks the nurse to leave her paracetamol on the bedside table until after her shower. What is the correct action?',
        options: [
          'Leave it on the table, since she is alert and oriented',
          'Leave it, and chart it as given once she says she took it',
          'Stay until she takes it, or take it away and offer it later',
          'Dissolve it in her water jug so she takes it with her fluids',
        ],
        correct_index: 2,
        explanation: 'Skill 5-1, step 19: remain with the patient until each medication is swallowed and never leave medication at the bedside. Documentation happens only after administration (step 21).',
        criterion: 3,
        competency_ids: [C.PHARMACOLOGY, C.COMMUNICATION],
      },
    ],
  },
  {
    scenario_title: 'Dehydration: Peripheral IV and Stool Culture',
    title: 'Peripheral IV Therapy, Stool Culture, and PPE',
    formerly: 'Fluid Balance and Dehydration',
    description:
      'Built from Taylor’s skill checklists 15-1 (Initiating a Peripheral Venous Access IV Infusion), 15-3 (Monitoring an IV Site and Infusion), 18-2 (Collecting a Stool Specimen for Culture), and 4-7 (Using Personal Protective Equipment), the skills Mateo Salazar’s dehydration and gastroenteritis call for.',
    category: 'Medical-Surgical',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Skill 15-1 · Initiating a Peripheral IV Infusion', weight: 30, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 15-3 · Monitoring an IV Site and Infusion', weight: 30, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 18-2 · Collecting a Stool Specimen for Culture', weight: 20, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 4-7 · Using Personal Protective Equipment', weight: 20, min_questions: 1, competency_id: C.MANAGEMENT_RESOURCES },
    ],
    questions: [
      {
        content: 'Where is the tourniquet applied when starting a peripheral IV?',
        options: [
          'Directly over the intended site, to make the vein stand out',
          '3 to 4 inches above the site, with the radial pulse still present',
          '6 to 8 inches above the site, tight enough to stop the radial pulse',
          'Just below the elbow, whatever vein is chosen',
        ],
        correct_index: 1,
        explanation: 'Skill 15-1, step 19: apply the tourniquet 3 to 4 inches above the venipuncture site to distend the vein, direct its ends away from the entry site, and make sure the radial pulse is still present. It should stop venous flow, not arterial.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'How does the nurse prepare the skin with chlorhexidine before inserting the IV catheter?',
        options: [
          'Wipe once in a circle from the center out, then insert while it is still wet',
          'Apply it for 10 seconds, then wipe it off with an alcohol swab',
          'Scrub from the outside in for 30 seconds, then blot it dry with sterile gauze',
          'Scrub back and forth for at least 30 seconds, then let it air-dry completely',
        ],
        correct_index: 3,
        explanation: 'Skill 15-1, step 22: press the applicator against the skin, use a back-and-forth friction scrub for at least 30 seconds, do not wipe or blot, and allow it to dry completely.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.QUALITY_IMPROVEMENT],
      },
      {
        content: 'At what angle, and with the bevel which way, is the IV catheter inserted?',
        options: [
          'Bevel up, at 10 to 15 degrees',
          'Bevel down, at 45 degrees',
          'Bevel up, at 90 degrees',
          'Bevel down, at 10 to 15 degrees',
        ],
        correct_index: 0,
        explanation: 'Skill 15-1, step 24: holding the catheter by the hub, bevel side up, enter the skin at a 10- to 15-degree angle, directly over or beside the vein. When blood returns in the flashback chamber, advance until the hub is at the site (step 25).',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Mateo’s IV site is swollen, cool, and pale, and his arm feels tight. What does this indicate, and what is done?',
        options: [
          'Phlebitis: apply a warm compress and keep the infusion running',
          'Normal findings: slow the rate slightly',
          'Infiltration: the IV is removed and restarted at another site',
          'Fluid overload: increase the rate to clear the line',
        ],
        correct_index: 2,
        explanation: 'Skill 15-3, step 10: swelling, leakage, coolness, or pallor at the site indicate infiltration. The IV must be removed and restarted at another site, following facility policy for treating the infiltration.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which findings at an IV site suggest phlebitis?',
        options: [
          'Redness, heat, and swelling, with a hard (indurated) vein and pain',
          'Coolness, pallor, and swelling',
          'Blood backing up into the tubing when the bag is lowered',
          'A drip chamber less than half full',
        ],
        correct_index: 0,
        explanation: 'Skill 15-3, step 11: redness, swelling, and heat, induration on palpation, and pain suggest phlebitis. Notify the primary care provider; the IV is discontinued and restarted at another site.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE, C.COLLABORATION_TEAMWORK],
      },
      {
        content: 'Which findings suggest fluid overload in a patient receiving IV fluids?',
        options: [
          'Thirst, dry mucous membranes, and dark urine',
          'Redness and warmth along the vein above the site',
          'A slow pulse, cool hands, and low blood pressure',
          'Shortness of breath, edema, and abnormal lung sounds',
        ],
        correct_index: 3,
        explanation: 'Skill 15-3, step 13a: fluid overload can lead to cardiac or respiratory failure. Monitor intake and output and vital signs, assess for edema, auscultate lung sounds, and ask about shortness of breath.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE, C.RECORDS_MANAGEMENT],
      },
      {
        content: 'What does the nurse tell Mateo before he produces a stool specimen for culture?',
        options: [
          'Collect it straight from the toilet water',
          'Void first, and don’t put toilet paper in with the stool',
          'It is fine if some urine mixes with the stool',
          'Save three stools and combine them in one container',
        ],
        correct_index: 1,
        explanation: 'Skill 18-2, step 3: instruct the patient to void first, not to discard toilet paper with the stool, and to call as soon as the bowel movement is complete. The sample must be free of urine and blood (step 5).',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE, C.HEALTH_EDUCATION],
      },
      {
        content: 'How is a stool specimen for culture handled once collected?',
        options: [
          'Refrigerated at once, since warmth lets organisms overgrow the sample',
          'Kept at the bedside, lid on, until the next scheduled laboratory pickup',
          'Sent to the laboratory while still warm; if delayed, check whether refrigeration is allowed',
          'Mixed with a little sterile saline so it stays moist until it is examined',
        ],
        correct_index: 2,
        explanation: 'Skill 18-2, step 10: transport the specimen while the stool is still warm. If immediate transport is impossible, check with the laboratory or policy manual whether refrigeration is contraindicated.',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'In what order does the nurse put on PPE?',
        options: [
          'Gloves first, then gown, mask, and goggles, so the hands are covered before anything else',
          'Mask or respirator, then goggles, then gloves, then the gown tied over the glove cuffs',
          'Goggles, then mask, then gown, with gloves put on only after entering the room',
          'Gown, then mask or respirator, then goggles or face shield, then gloves over the cuffs',
        ],
        correct_index: 3,
        explanation: 'Skill 4-7, step 5: gown first, tied at neck and waist; then mask or respirator; then goggles or face shield; and last, clean gloves extended over the cuffs of the gown.',
        criterion: 3,
        competency_ids: [C.MANAGEMENT_RESOURCES, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Leaving Mateo’s room, which PPE comes off first, and when is hand hygiene done?',
        options: [
          'The mask first; hand hygiene at the nurses’ station',
          'The gown first; hand hygiene only if a glove tore',
          'The gloves first; hand hygiene immediately after all PPE is off',
          'The goggles first; no hand hygiene is needed after gloves',
        ],
        correct_index: 2,
        explanation: 'Skill 4-7, steps 7–8: at the doorway, remove the gloves first (untying a front-tied gown waist before that), then goggles or face shield, then the gown rolled inside out, then the mask. Perform hand hygiene immediately after all PPE is removed.',
        criterion: 3,
        competency_ids: [C.MANAGEMENT_RESOURCES, C.SAFE_QUALITY_CARE],
      },
    ],
  },
  {
    scenario_title: 'UTI: Clean-Catch Urine and Oral Antibiotics',
    title: 'Clean-Catch Urine, Oral Medications, and Handwashing',
    formerly: 'Urinary Tract Infection Care',
    description:
      'Built from Taylor’s skill checklists 18-7 (Collecting a Urine Specimen, Clean Catch, Midstream), 5-1 (Administering Oral Medications), and 4-1 (Performing Hand Hygiene Using Soap and Water), the skills Liza Fontanilla’s urinary tract infection calls for.',
    category: 'Infection Management',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Skill 18-7 · Clean-Catch Midstream Urine Specimen', weight: 40, min_questions: 2, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 5-1 · Administering Oral Medications', weight: 35, min_questions: 1, competency_id: C.PHARMACOLOGY },
      { name: 'Skill 4-1 · Handwashing With Soap and Water', weight: 25, min_questions: 1, competency_id: C.MANAGEMENT_RESOURCES },
    ],
    questions: [
      {
        content: 'How does a female patient clean the perineum before a clean-catch urine collection?',
        options: [
          'One firm wipe from back to front across the whole perineum',
          'Circular wipes starting at the meatus and moving outward, with one towelette',
          'No cleaning is needed if she showered today, since the midstream is sterile',
          'Each side, then the center, front to back, with a new wipe for each stroke',
        ],
        correct_index: 3,
        explanation: 'Skill 18-7, step 8: with the labia separated, clean each side of the urinary meatus and then the center over it, front to back, using a new wipe (or a clean area of the washcloth) for each stroke. Keep the labia separated during collection.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.HEALTH_EDUCATION],
      },
      {
        content: 'Which portion of the urine stream goes into the specimen cup?',
        options: [
          'The first few milliliters, which carry the most organisms',
          'The midstream, after a small amount goes into the toilet',
          'The last portion, once the bladder is almost empty',
          'The whole void, with 20 mL poured off into the cup',
        ],
        correct_index: 1,
        explanation: 'Skill 18-7, step 9: void a small amount into the toilet, bedpan, or commode, stop briefly, then void into the container, collect the specimen, and finish voiding. The first portion flushes organisms from the urethra so they don’t contaminate the specimen.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.HEALTH_EDUCATION],
      },
      {
        content: 'How much urine is sufficient for a clean-catch specimen?',
        options: ['10 to 20 mL', '1 to 2 mL', 'At least 100 mL', 'The cup must be filled to the brim'],
        correct_index: 0,
        explanation: 'Skill 18-7, step 9: 10 to 20 mL is sufficient. The patient must not touch the inside of the container or the lid.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Liza’s urine specimen cannot go to the laboratory straight away. What should the nurse do?',
        options: [
          'Leave it at the bedside until the lab opens',
          'Discard it and collect a fresh one tomorrow',
          'Refrigerate it',
          'Add a preservative from ward stock',
        ],
        correct_index: 2,
        explanation: 'Skill 18-7, step 15: transport the specimen as soon as possible; if it cannot go to the laboratory immediately, refrigerate it. (Contrast Skill 18-2, where stool for culture goes while still warm.)',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.QUALITY_IMPROVEMENT],
      },
      {
        content: 'When is Liza’s antibiotic dose documented?',
        options: [
          'Before giving it, to save time',
          'At the end of the shift with the other medications',
          'Immediately after it is administered',
          'Only if she refuses it',
        ],
        correct_index: 2,
        explanation: 'Skill 5-1, step 21: document the administration of the medication immediately after administration. Charting in advance records a dose that may never be taken.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.RECORDS_MANAGEMENT],
      },
      {
        content: 'The antibiotic tablets come in a multidose bottle. How does the nurse transfer them?',
        options: [
          'Pour them into the bottle cap, then into the medication cup',
          'Tip them into a clean, dry palm, then into the cup',
          'Pick them out one at a time with gloved fingers',
          'Pour extra into the cup and return the surplus to the bottle',
        ],
        correct_index: 0,
        explanation: 'Skill 5-1, step 9b: pour the necessary number into the bottle cap and then into a medication cup. Break only scored tablets if needed, and do not touch tablets or capsules with the hands.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'At the bedside, what must the nurse complete immediately before giving the antibiotic?',
        options: [
          'Weigh her to confirm the dose',
          'Take her blood pressure in both arms',
          'Nothing further, since the checks were done in the medication room',
          'Check allergies and explain the drug’s purpose and action',
        ],
        correct_index: 3,
        explanation: 'Skill 5-1, step 16: complete necessary assessments, check the allergy bracelet or ask about allergies, and explain the purpose and action of each medication to the patient.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.COMMUNICATION],
      },
      {
        content: 'During handwashing, how are the hands held?',
        options: [
          'Higher than the elbows, so water runs toward the wrists',
          'Lower than the elbows, so water flows toward the fingertips',
          'Level with the elbows',
          'Either way, as long as soap is used',
        ],
        correct_index: 1,
        explanation: 'Skill 4-1, steps 4 and 9: keep the hands lower than the elbows so water flows toward the fingertips, both when wetting and when rinsing.',
        criterion: 2,
        competency_ids: [C.MANAGEMENT_RESOURCES, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'How long should the friction motion of handwashing last, at minimum?',
        options: ['At least 15 seconds', 'About 5 seconds', 'At least 2 minutes', 'Until the lather disappears'],
        correct_index: 0,
        explanation: 'Skill 4-1, step 7: continue the friction motion for at least 15 seconds, covering palms, backs, each finger and the spaces between them, knuckles, wrists, and forearms (step 6).',
        criterion: 2,
        competency_ids: [C.MANAGEMENT_RESOURCES, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'After drying the hands, how does the nurse turn off a hand-operated faucet?',
        options: [
          'Quickly, with the clean hand, before drying it',
          'Leave it running, since touching it recontaminates the hands',
          'With a second clean paper towel, then discard it',
          'With a wrist or forearm, keeping both hands clear',
        ],
        correct_index: 2,
        explanation: 'Skill 4-1, step 10: pat the hands dry from the fingers up toward the forearms, discard the towel, then use another clean towel to turn off the faucet and discard it without touching the clean hand.',
        criterion: 2,
        competency_ids: [C.MANAGEMENT_RESOURCES, C.SAFE_QUALITY_CARE],
      },
    ],
  },
  {
    scenario_title: 'New Hypertension: Accurate BP and Cardiovascular Assessment',
    title: 'Blood Pressure, Cardiovascular Assessment, and 12-Lead ECG',
    formerly: 'Blood Pressure Measurement and Hypertension Teaching',
    description:
      'Built from Taylor’s skill checklists 1-7 (Assessing Brachial Artery Blood Pressure), 2-1 (Performing a General Survey), 2-6 (Assessing the Cardiovascular System), and 16-1 (Obtaining an Electrocardiogram), the skills Ernesto Bautista’s new hypertension workup calls for.',
    category: 'Patient Education',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Skill 1-7 · Assessing Brachial Artery Blood Pressure', weight: 40, min_questions: 2, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skills 2-1 & 2-6 · General Survey and Cardiovascular Assessment', weight: 30, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 16-1 · Obtaining an Electrocardiogram', weight: 30, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
    ],
    questions: [
      {
        content: 'How is Ernesto positioned for a seated blood pressure?',
        options: [
          'Back supported, legs uncrossed, forearm at heart level',
          'Sitting on the edge of the bed with the arm hanging at his side',
          'Standing, with the arm raised above his head',
          'Sitting with legs crossed and the arm resting on his lap',
        ],
        correct_index: 0,
        explanation: 'Skill 1-7, step 7: support the forearm at heart level with the palm upward. If he is sitting, the chair supports his back and his legs stay uncrossed. Step 4: first confirm he has relaxed for several minutes.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Where does the blood pressure cuff go?',
        options: [
          'Lower edge resting in the elbow crease, over the brachial pulse',
          'Around the forearm, 2 to 3 cm below the elbow crease',
          'Bladder over the brachial artery, lower edge 2.5 to 5 cm above the inner elbow',
          'High on the upper arm, with the upper edge just below the axilla',
        ],
        correct_index: 2,
        explanation: 'Skill 1-7, step 9: palpate the brachial artery and center the cuff bladder over it, about midway on the arm, with the lower edge 2.5 to 5 cm above the inner aspect of the elbow and the artery marker lined up.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'The nurse palpates the brachial pulse, inflates the cuff, and the pulse disappears at 150 mm Hg. To what level is the cuff pumped for auscultation, and how fast is it released?',
        options: [
          '150 mm Hg, released at 10 mm Hg per second',
          '180 mm Hg, released at 2 to 3 mm Hg per second',
          '200 mm Hg, released as fast as possible',
          '160 mm Hg, released at 1 mm Hg every 5 seconds',
        ],
        correct_index: 1,
        explanation: 'Skill 1-7, step 19: pump the pressure 30 mm Hg above the point where the palpated pulse disappeared (150 + 30 = 180), then open the valve so the gauge drops 2 to 3 mm Hg per second. Step 15: after the palpated estimate, deflate and wait 1 minute.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'The nurse suspects a blood pressure reading is wrong. How is it repeated?',
        options: [
          'Reinflate the cuff straight away while it is still deflating',
          'Move the cuff to the forearm and try again',
          'Wait 30 minutes and use the other arm only',
          'Deflate the cuff completely and wait at least 1 minute before repeating',
        ],
        correct_index: 3,
        explanation: 'Skill 1-7, steps 21 and 23: never reinflate the cuff mid-release to recheck the systolic. Let the remaining air escape, deflate the cuff completely, and wait at least 1 minute before repeating a suspicious reading.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.QUALITY_IMPROVEMENT],
      },
      {
        content: 'During the general survey, where is Ernesto’s waist circumference measured?',
        options: [
          'At the narrowest point of the torso, over clothing',
          'Around the hips, at the widest part of the buttocks',
          'Around the chest, at the level of the nipples',
          'Snugly at the level of the umbilicus',
        ],
        correct_index: 3,
        explanation: 'Skill 2-1, step 12: place the tape measure snugly around the waist at the level of the umbilicus.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Ernesto weighs 86 kg and is 1.70 m tall. What is his BMI?',
        options: ['29.8', '25.3', '32.4', '50.6'],
        correct_index: 0,
        explanation: 'Skill 2-1, step 11: BMI = weight in kilograms ÷ height in meters². 86 ÷ (1.70 × 1.70) = 86 ÷ 2.89 ≈ 29.8.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE, C.HEALTH_EDUCATION],
      },
      {
        content: 'In what order does the nurse auscultate the heart?',
        options: [
          'Mitral, tricuspid, Erb’s point, pulmonic, aortic',
          'Tricuspid, mitral, aortic, pulmonic, Erb’s point',
          'Aortic, pulmonic, Erb’s point, tricuspid, mitral',
          'Any order, provided all five areas are heard',
        ],
        correct_index: 2,
        explanation: 'Skill 2-6, step 9: auscultate systematically from the aortic area to the pulmonic area, Erb’s point, the tricuspid area, and finally the mitral area. Use the diaphragm for high-pitched sounds, then the bell for low-pitched ones.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'How are the carotid arteries palpated?',
        options: [
          'Both at once, to compare their strength',
          'One at a time, the left and then the right',
          'Firmly, massaging over the bifurcation',
          'They are auscultated only, never palpated',
        ],
        correct_index: 1,
        explanation: 'Skill 2-6, step 5: inspect and palpate the left and then the right carotid artery, only one at a time, and auscultate them with the bell. Pressing both at once can reduce blood flow to the brain.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Where is chest lead V1 placed?',
        options: [
          'Fourth intercostal space at the right sternal border',
          'Fourth intercostal space at the left sternal border',
          'Fifth intercostal space at the left midclavicular line',
          'Fifth intercostal space at the midaxillary line',
        ],
        correct_index: 0,
        explanation: 'Skill 16-1, step 13: V1 goes at the fourth intercostal space at the right sternal border and V2 at the left sternal border. V4 sits at the fifth intercostal space, left midclavicular line, V3 halfway between V2 and V4, and V6 at the midaxillary line, level with V4.',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which limb lead is attached to the left leg?',
        options: ['White (RA)', 'Green (RL)', 'Black (LA)', 'Red (LL)'],
        correct_index: 3,
        explanation: 'Skill 16-1, step 11: white (RA) goes on the right arm, green (RL) on the right leg, red (LL) on the left leg, and black (LA) on the left arm. Choose flat, fleshy areas and avoid muscle and bone (step 9).',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Ernesto asks whether the ECG will give him a shock. Which explanation is correct?',
        options: [
          'A small, harmless current passes through him to trace the heart’s rhythm',
          'No current enters his body; it only records his heart’s electrical activity',
          'He may feel a mild tingling under the chest electrodes while it records',
          'He must hold his breath for about 5 minutes until the tracing is done',
        ],
        correct_index: 1,
        explanation: 'Skill 16-1, step 5: tell the patient the test records the heart’s electrical activity, that no electrical current will enter his body, and that it typically takes about 5 minutes. During recording he relaxes, breathes normally, and does not talk (step 17).',
        criterion: 2,
        competency_ids: [C.COMMUNICATION, C.HEALTH_EDUCATION],
      },
    ],
  },
  {
    scenario_title: 'Asthma: Pulse Oximetry, Inhaler and Nebulizer',
    title: 'Pulse Oximetry, Inhalers, Nebulizers, and Nasal Cannula',
    formerly: 'Asthma Assessment and Inhaler Technique',
    description:
      'Built from Taylor’s skill checklists 14-1 (Using a Pulse Oximeter), 5-23 (Administering Medication via a Metered-Dose Inhaler), 5-24 (Administering Medication via a Small-Volume Nebulizer), and 14-3 (Administering Oxygen by Nasal Cannula), the skills Joana Rivas’s asthma exacerbation calls for.',
    category: 'Respiratory Emergency',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Skill 14-1 · Using a Pulse Oximeter', weight: 25, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 5-23 · Metered-Dose Inhaler', weight: 30, min_questions: 1, competency_id: C.PHARMACOLOGY },
      { name: 'Skill 5-24 · Small-Volume Nebulizer', weight: 25, min_questions: 1, competency_id: C.PHARMACOLOGY },
      { name: 'Skill 14-3 · Oxygen by Nasal Cannula', weight: 20, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
    ],
    questions: [
      {
        content: 'Which fingers are the first choice for a pulse oximeter sensor?',
        options: ['The thumb, which has the strongest pulse', 'The little finger, to keep the others free', 'The index, middle, or ring finger', 'A toe, so the hands stay free'],
        correct_index: 2,
        explanation: 'Skill 14-1, step 6a: use the patient’s index, middle, or ring finger, after checking the proximal pulse and capillary refill (6b). Use a toe only if lower-extremity circulation is not compromised (6d).',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Circulation at Joana’s finger is poor. Which alternative sensor sites are recommended?',
        options: [
          'The earlobe, forehead, or bridge of the nose',
          'The upper arm, over the brachial artery',
          'The wrist, over the radial artery',
          'None; oximetry is abandoned and an ABG ordered',
        ],
        correct_index: 0,
        explanation: 'Skill 14-1, step 6c: if circulation at the site is inadequate, consider the earlobe, forehead, or bridge of the nose. On the forehead or nose the emitter and receiver don’t need aligning (step 9).',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Joana’s oximeter uses a spring-tension finger clip. How often is it removed to check the skin?',
        options: ['Every 30 minutes', 'Every 8 hours', 'Only when the alarm sounds', 'Every 2 hours'],
        correct_index: 3,
        explanation: 'Skill 14-1, step 13: remove the sensor regularly to check for skin irritation or pressure, every 2 hours for a spring-tension sensor or every 4 hours for an adhesive finger or toe sensor.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.QUALITY_IMPROVEMENT],
      },
      {
        content: 'What is done with the inhaler and spacer just before the first puff?',
        options: [
          'Warm them in the hands',
          'Shake them well',
          'Rinse the spacer with water',
          'Hold them upside down for a minute',
        ],
        correct_index: 1,
        explanation: 'Skill 5-23, steps 17–18: remove the mouthpiece covers, attach the MDI to the spacer, and shake the inhaler and spacer well. She then seals her lips around the spacer mouthpiece and breathes normally through it (step 19).',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.HEALTH_EDUCATION],
      },
      {
        content: 'After releasing a puff into the spacer and inhaling slowly and deeply, what does Joana do next?',
        options: [
          'Exhale straight away through the nose so the medicine settles',
          'Take three quick breaths through the spacer to pull in the rest of the dose',
          'Hold her breath 5 to 10 seconds, then exhale slowly through pursed lips',
          'Cough firmly to clear the airway before the next puff',
        ],
        correct_index: 2,
        explanation: 'Skill 5-23, steps 20–21: depress the canister to release one puff into the spacer, inhale slowly and deeply through the mouth, hold the breath for 5 to 10 seconds or as long as possible, then exhale slowly through pursed lips.',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.HEALTH_EDUCATION],
      },
      {
        content: 'Two puffs are ordered. When is the second given?',
        options: [
          'After waiting 1 to 5 minutes, as prescribed',
          'Immediately after the first, while the airway is open',
          'After 30 minutes, once the first puff has worked',
          'At the next scheduled dose',
        ],
        correct_index: 0,
        explanation: 'Skill 5-23, step 22: wait 1 to 5 minutes, as prescribed, before the next puff. Afterward she rinses and gargles with tap water as needed (step 24), and the nurse reassesses lung sounds, saturation, and respirations (step 27).',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY],
      },
      {
        content: 'How long does a small-volume nebulizer treatment usually take, and when is it finished?',
        options: [
          'About 2 minutes, or ten deep breaths, whichever comes first',
          'About 1 hour, stopping when the timer sounds',
          'When the wheeze stops, even if medication remains',
          'About 15 minutes, when the cup is empty',
        ],
        correct_index: 3,
        explanation: 'Skill 5-24, step 21: continue until all medication in the cup has been aerosolized, usually about 15 minutes. When the mist decreases, gently flick the sides of the cup.',
        criterion: 2,
        competency_ids: [C.PHARMACOLOGY],
      },
      {
        content: 'How should Joana breathe through the nebulizer mouthpiece?',
        options: [
          'Rapid, shallow breaths through the nose',
          'Slowly and deeply through the mouth, with a slight pause before each exhalation',
          'Normally through the nose, with the mouthpiece resting on her lips',
          'Holding each breath for 30 seconds',
        ],
        correct_index: 1,
        explanation: 'Skill 5-24, steps 19–20: she grasps the mouthpiece securely with teeth and lips and inhales slowly and deeply through the mouth, holding each breath for a slight pause before exhaling. A nose clip may be needed if she also breathes through the nose.',
        criterion: 2,
        competency_ids: [C.PHARMACOLOGY, C.HEALTH_EDUCATION],
      },
      {
        content: 'Joana’s saturation stays below target and nasal cannula oxygen is started. Which safety step is required?',
        options: [
          'Review oxygen safety precautions and place “No Smoking” signs',
          'Set the flow meter to its maximum, then titrate down',
          'Tape the prongs to her cheeks so they cannot slip',
          'Remove the humidifier so the flow is not reduced',
        ],
        correct_index: 0,
        explanation: 'Skill 14-3, step 5: explain the procedure, review the safety precautions needed when oxygen is in use, and place “No Smoking” signs in appropriate areas. The flow rate is set to the order (step 6).',
        criterion: 3,
        competency_ids: [C.SAFE_QUALITY_CARE, C.MANAGEMENT_RESOURCES],
      },
      {
        content: 'How often does the nurse remove and clean the nasal cannula and check the nares?',
        options: [
          'Every hour, alongside the SpO₂ check',
          'Every 3 days, when the tubing is changed',
          'At least every 8 hours, or per agency policy',
          'Only if she reports soreness or nosebleeds',
        ],
        correct_index: 2,
        explanation: 'Skill 14-3, step 12: with clean gloves, remove and clean the cannula and assess the nares for irritation or bleeding at least every 8 hours, or according to agency recommendations.',
        criterion: 3,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
    ],
  },
  {
    scenario_title: 'Post-Op Day One: Dressing, Breathing Exercises and Comfort',
    title: 'Wound Dressing, Post-Op Breathing Exercises, and Pain Relief',
    formerly: 'Post-Operative Care Fundamentals',
    description:
      'Built from Taylor’s skill checklists 8-1 (Cleaning a Wound and Applying a Dry, Sterile Dressing), 6-2 (Deep Breathing Exercises, Coughing, and Splinting), 14-2 (Teaching Patient to Use an Incentive Spirometer), and 10-1 (Promoting Patient Comfort), the skills Rafael Ocampo’s first post-operative day calls for.',
    category: 'Medical-Surgical',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Skill 8-1 · Dry, Sterile Dressing', weight: 30, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 6-2 · Deep Breathing, Coughing, and Splinting', weight: 25, min_questions: 1, competency_id: C.HEALTH_EDUCATION },
      { name: 'Skill 14-2 · Incentive Spirometer Teaching', weight: 20, min_questions: 1, competency_id: C.HEALTH_EDUCATION },
      { name: 'Skill 10-1 · Promoting Patient Comfort', weight: 25, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
    ],
    questions: [
      {
        content: 'In which direction is the surgical wound cleaned?',
        options: [
          'From the outside toward the center, reusing the gauze',
          'Top to bottom and center outward, with new gauze for each wipe',
          'Back and forth across the incision',
          'Bottom to top with a single gauze',
        ],
        correct_index: 1,
        explanation: 'Skill 8-1, step 17: clean the wound from top to bottom and from the center to the outside, using new gauze for each wipe. Dry it the same way (step 18).',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'The old dressing sticks to Rafael’s wound. What does the nurse do?',
        options: [
          'Pull it off quickly in one motion to limit pain',
          'Leave it in place and dress over the top',
          'Soak it with alcohol so it lifts cleanly',
          'Loosen it with small amounts of sterile saline',
        ],
        correct_index: 3,
        explanation: 'Skill 8-1, step 11: remove the soiled dressing carefully. If any part sticks to the underlying skin, use small amounts of sterile saline to loosen it; a silicone-based adhesive remover helps with resistant tape.',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'At what point in the dressing change does the nurse put on sterile gloves?',
        options: [
          'After the old dressing is removed and the sterile field and solution are ready',
          'Before touching the old dressing, so the wound is never handled with clean gloves',
          'Only if the wound is draining; clean gloves are enough for a dry incision',
          'After cleaning, just before the new gauze and ABD pad are applied',
        ],
        correct_index: 0,
        explanation: 'Skill 8-1, steps 10–16: clean gloves remove the old dressing and are then discarded (10–12). The nurse inspects the wound (13), prepares a sterile field (14), opens the cleaning solution (15), and only then puts on sterile gloves (16).',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'During deep breathing exercises, how long does Rafael hold each breath?',
        options: ['No hold; exhale at once', '10 seconds', '3 seconds', '30 seconds'],
        correct_index: 2,
        explanation: 'Skill 6-2, steps 8c–d: breathe in through the nose as deeply as possible, hold for 3 seconds, then exhale through the mouth with pursed lips. Practise three times, every 1 to 2 hours for the first 24 hours after surgery (8e).',
        criterion: 1,
        competency_ids: [C.HEALTH_EDUCATION],
      },
      {
        content: 'Why does Rafael press a folded blanket or pillow against his abdomen before he coughs?',
        options: [
          'To splint and support the incision',
          'To keep the abdomen warm',
          'To measure the force of the cough',
          'To stop him from aspirating',
        ],
        correct_index: 0,
        explanation: 'Skill 6-2, step 9a: in semi-Fowler’s, apply a folded bath blanket or pillow against the incision to support it while coughing, repeated every 2 hours while awake (9e). Confirm understanding with a return demonstration (step 10).',
        criterion: 1,
        competency_ids: [C.HEALTH_EDUCATION, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Which instruction describes correct incentive spirometer use?',
        options: [
          'Seal the lips, then blow out as hard and as long as possible into the mouthpiece',
          'Breathe in and out rapidly through the mouthpiece to exercise the lungs',
          'Inhale sharply so the indicator jumps to the target, then exhale into the device',
          'Exhale normally, seal the lips, inhale slowly and deeply, then hold for a count of three',
        ],
        correct_index: 3,
        explanation: 'Skill 14-2, steps 8–10: exhale normally, place the lips securely around the mouthpiece, inhale slowly and as deeply as possible without using the nose, then hold the breath and count to three.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION],
      },
      {
        content: 'How often should Rafael use the incentive spirometer, and what does he do if he feels light-headed?',
        options: [
          'Twice a day; keep going through any dizziness',
          '5 to 10 times every 1 to 2 hours; stop and breathe normally',
          '50 times each morning; lie flat until it passes',
          'Only when short of breath; call the doctor at once',
        ],
        correct_index: 1,
        explanation: 'Skill 14-2, steps 11–12: if the patient becomes light-headed, stop and take a few normal breaths before resuming. Encourage 5 to 10 breaths every 1 to 2 hours, if possible.',
        criterion: 2,
        competency_ids: [C.HEALTH_EDUCATION, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'After giving Rafael’s analgesic and repositioning him, how does the nurse evaluate the effect?',
        options: [
          'Ask whether he feels better overall and chart his answer',
          'Check whether his pulse and blood pressure have come down',
          'Reassess pain with the same scale used at baseline',
          'Wait for him to ask for the next dose, then rate it',
        ],
        correct_index: 2,
        explanation: 'Skill 10-1, step 23: evaluate the response by reassessing discomfort or pain with the original assessment tools, then alter the plan of care as appropriate. Step 4 set the baseline with an appropriate scale.',
        criterion: 3,
        competency_ids: [C.SAFE_QUALITY_CARE, C.PHARMACOLOGY],
      },
      {
        content: 'Which relaxation technique for pain is part of promoting patient comfort?',
        options: [
          'Slow, deep abdominal breathing, exhaling through puckered lips',
          'Holding the breath and bearing down until the pain passes',
          'Rapid, shallow chest breathing to avoid moving the incision',
          'Keeping the lights bright so he stays alert and distracted',
        ],
        correct_index: 0,
        explanation: 'Skill 10-1, step 16: with hands on the stomach and eyes closed, the patient inhales slowly and deeply so the abdomen expands, holds briefly, then exhales slowly through puckered lips, counting to keep a steady rhythm. Practise twice a day for 10 minutes.',
        criterion: 3,
        competency_ids: [C.SAFE_QUALITY_CARE, C.HEALTH_EDUCATION],
      },
      {
        content: 'Which environmental measures promote Rafael’s comfort?',
        options: [
          'Keep the door open so staff can check on him from the corridor',
          'Keep bright lights on around the clock so he can be observed',
          'Wake him every hour to reassess and chart his pain score',
          'Dim harsh light and noise, and group care to allow rest',
        ],
        correct_index: 3,
        explanation: 'Skill 10-1, steps 6–7: adjust the room temperature to the patient’s preference, reduce harsh lighting and noise, close the door or curtain, keep the room ventilated, and group activities so there are undisturbed rest periods.',
        criterion: 3,
        competency_ids: [C.SAFE_QUALITY_CARE, C.MANAGEMENT_RESOURCES],
      },
    ],
  },
  {
    scenario_title: 'Cellulitis with Diabetes: Glucose, Insulin and IV Antibiotic',
    title: 'Capillary Glucose, Insulin Injection, and IV Piggyback',
    formerly: 'Skin Infection and Diabetes Care',
    description:
      'Built from Taylor’s skill checklists 18-3 (Obtaining a Capillary Blood Sample for Glucose Testing), 5-4 (Removing Medication From a Vial), 5-7 (Administering a Subcutaneous Injection), and 5-11 (Administering a Piggyback Intermittent IV Infusion), the skills Corazon Villamor’s cellulitis and diabetes call for.',
    category: 'Infection Management',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Skill 18-3 · Capillary Blood Glucose', weight: 30, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 5-4 · Removing Medication From a Vial', weight: 20, min_questions: 1, competency_id: C.PHARMACOLOGY },
      { name: 'Skill 5-7 · Subcutaneous Injection', weight: 25, min_questions: 1, competency_id: C.PHARMACOLOGY },
      { name: 'Skill 5-11 · Piggyback Intermittent IV Infusion', weight: 25, min_questions: 1, competency_id: C.PHARMACOLOGY },
    ],
    questions: [
      {
        content: 'After the lancet puncture, how does the nurse get enough blood for the test strip?',
        options: [
          'Squeeze firmly at the puncture site until a large drop forms',
          'Milk the fingertip toward the nail with steady pressure',
          'Wipe the site with alcohol to keep the blood flowing',
          'Lower the hand and lightly stroke the finger',
        ],
        correct_index: 3,
        explanation: 'Skill 18-3, step 16: encourage bleeding by lowering the hand and lightly stroking the finger if necessary. Don’t squeeze the finger or the puncture site, and don’t touch the site or the blood. Wipe away the first drop if the monitor’s manufacturer recommends it (step 15).',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'How is the fingertip prepared before the puncture?',
        options: [
          'Swab with alcohol and puncture while wet, so the site stays sterile',
          'Wash with warm soapy water, or swab with alcohol, and let it dry',
          'Paint with povidone-iodine and puncture through it',
          'No cleaning, since the first drop is always wiped away',
        ],
        correct_index: 1,
        explanation: 'Skill 18-3, step 13: have the patient wash with soap and warm water and dry thoroughly, or cleanse with an alcohol swab and allow the skin to dry completely. Then hold the lancet perpendicular to the skin and pierce (step 14).',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Once the blood is on the strip, what is used to apply pressure to the puncture site?',
        options: ['An alcohol wipe', 'The lancet cap', 'A cotton ball or dry gauze', 'Nothing; pressure isn’t needed'],
        correct_index: 2,
        explanation: 'Skill 18-3, step 19: apply pressure with a cotton ball or dry gauze, not an alcohol wipe. Read the result, document it at the bedside, and tell the patient (step 20).',
        criterion: 0,
        competency_ids: [C.SAFE_QUALITY_CARE, C.RECORDS_MANAGEMENT],
      },
      {
        content: 'Before drawing insulin from a vial, the nurse injects air equal to the dose. Where does the air go?',
        options: [
          'Into the air space above the solution',
          'Directly into the insulin, to mix it evenly',
          'Out into the room, to clear the syringe first',
          'Nowhere; air must never enter a vial',
        ],
        correct_index: 0,
        explanation: 'Skill 5-4, steps 11–12: draw back air equal to the dose, pierce the center of the stopper with the vial on a flat surface, and inject the air into the space above the solution, not into it. Then invert the vial and withdraw the dose at eye level (steps 13–14).',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY],
      },
      {
        content: 'A multidose insulin vial has just been opened. What must be done before it is stored?',
        options: [
          'Nothing; multidose vials need no label',
          'Tape the stopper shut',
          'Write the patient’s diagnosis on it',
          'Label it with the date and time it was opened',
        ],
        correct_index: 3,
        explanation: 'Skill 5-4, step 19: when a multidose vial is used, label it with the date and time opened and store it according to facility policy, after rechecking the label against the CMAR/MAR (step 18).',
        criterion: 1,
        competency_ids: [C.PHARMACOLOGY, C.RECORDS_MANAGEMENT],
      },
      {
        content: 'At what angle is a subcutaneous injection given?',
        options: ['10 to 15 degrees', '45 to 90 degrees', 'Always exactly 30 degrees', 'Parallel to the skin'],
        correct_index: 1,
        explanation: 'Skill 5-7, step 26: hold the syringe between thumb and forefinger and inject the needle quickly at a 45- to 90-degree angle, after bunching or spreading the skin at the site (step 25).',
        criterion: 2,
        competency_ids: [C.PHARMACOLOGY],
      },
      {
        content: 'How fast is the medication injected subcutaneously?',
        options: [
          'Slowly, at about 10 seconds per mL',
          'As fast as possible, to limit discomfort',
          '1 mL per minute',
          'Speed makes no difference',
        ],
        correct_index: 0,
        explanation: 'Skill 5-7, step 28: inject the medication slowly, at a rate of 10 seconds per mL, keeping the syringe steady with the nondominant hand (step 27).',
        criterion: 2,
        competency_ids: [C.PHARMACOLOGY],
      },
      {
        content: 'What does the nurse do after withdrawing the needle from a subcutaneous insulin injection?',
        options: [
          'Massage the site firmly so the insulin spreads evenly',
          'Recap the needle carefully, then discard the syringe',
          'Press gently with gauze, no massage, and engage the shield',
          'Apply a warm compress to speed absorption',
        ],
        correct_index: 2,
        explanation: 'Skill 5-7, steps 30–31: apply gentle pressure with a gauze square and do not massage the site. Don’t recap the used needle; engage the safety shield or needle guard and discard it in the proper receptacle.',
        criterion: 2,
        competency_ids: [C.PHARMACOLOGY, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Where is the piggyback antibiotic bag hung in relation to the primary IV bag?',
        options: [
          'Lower than the primary bag, so gravity favours the antibiotic',
          'Higher than the primary, which is lowered on the hook',
          'On the same hook as the primary, sharing its drip chamber',
          'On a separate pole, below the level of the insertion site',
        ],
        correct_index: 1,
        explanation: 'Skill 5-11, step 21: hang the piggyback higher than the primary IV per the manufacturer, using the hook to lower the primary container. When the infusion ends, return the primary to its original height and check its rate (step 28).',
        criterion: 3,
        competency_ids: [C.PHARMACOLOGY],
      },
      {
        content: 'What does the nurse assess immediately before connecting the piggyback antibiotic?',
        options: [
          'The IV site, for inflammation or infiltration',
          'Only her temperature',
          'The color of the antibiotic after mixing it into the primary bag',
          'Nothing more, since the line was checked last shift',
        ],
        correct_index: 0,
        explanation: 'Skill 5-11, step 18: assess the IV site for inflammation or infiltration before connecting, and monitor the site at intervals afterward (step 31). Clean the access port with an antimicrobial swab before connecting (step 24).',
        criterion: 3,
        competency_ids: [C.PHARMACOLOGY, C.SAFE_QUALITY_CARE],
      },
    ],
  },
  {
    scenario_title: 'Anaemia and Dizziness: Fall Prevention and Safe Ambulation',
    title: 'Fall Prevention, Assisted Ambulation, and Venipuncture',
    formerly: 'Anaemia Care and Falls Prevention',
    description:
      'Built from Taylor’s skill checklists 3-1 (Fall Prevention), 9-7 (Assisting a Patient With Ambulation), and 18-9 (Using Venipuncture to Collect a Venous Blood Sample for Routine Testing), the skills Nadine Corpuz’s anaemia and postural dizziness call for.',
    category: 'Medical-Surgical',
    time_limit_seconds: 900,
    total_questions: 6,
    criteria: [
      { name: 'Skill 3-1 · Fall Prevention', weight: 35, min_questions: 2, competency_id: C.MANAGEMENT_RESOURCES },
      { name: 'Skill 9-7 · Assisting a Patient With Ambulation', weight: 35, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
      { name: 'Skill 18-9 · Venipuncture for Routine Testing', weight: 30, min_questions: 1, competency_id: C.SAFE_QUALITY_CARE },
    ],
    questions: [
      {
        content: 'Which bed setup reduces Nadine’s risk of injury from a fall?',
        options: [
          'Highest position, so she cannot climb out',
          'Any height, with all four side rails raised',
          'Lowest position, with the bed locks secured',
          'Head of the bed kept flat',
        ],
        correct_index: 2,
        explanation: 'Skill 3-1, steps 20–21: keep the bed in the lowest position during use and make sure the bed or wheelchair locks are secured at all times. Bed rails are used according to facility policy (step 22), not as a default.',
        criterion: 0,
        competency_ids: [C.MANAGEMENT_RESOURCES, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Nadine went lightheaded standing up this morning. What should the nurse teach her?',
        options: [
          'Rise slowly and sit for several minutes before standing',
          'Stand up quickly so the dizziness passes sooner',
          'Stay in bed until her haemoglobin is back to normal',
          'Drink a cup of coffee before getting up to raise her pressure',
        ],
        correct_index: 0,
        explanation: 'Skill 3-1, step 17: encourage the patient to rise or change position slowly and sit for several minutes before standing. Step 3: explain the reason for each fall-prevention measure to her and her family.',
        criterion: 0,
        competency_ids: [C.MANAGEMENT_RESOURCES, C.HEALTH_EDUCATION],
      },
      {
        content: 'Which items should always be within Nadine’s reach?',
        options: [
          'The IV pole and the oxygen outlet, for safety',
          'Her medication supply, so she can take doses herself',
          'The commode, kept by the door to save space',
          'The call bell, bedside table, and personal items',
        ],
        correct_index: 3,
        explanation: 'Skill 3-1, step 13: ensure the call bell, bedside table, telephone, and other personal items are within reach at all times. A commode, if used, stays near the bed (step 12).',
        criterion: 0,
        competency_ids: [C.MANAGEMENT_RESOURCES],
      },
      {
        content: 'How often should nursing rounds be made for a patient at risk of falling?',
        options: [
          'Every 8 hours, at the start of each shift, with a full falls-risk rescore',
          'Every 1 or 2 hours, covering pain, toileting, comfort, and reach',
          'At medication times, so rounding does not disturb her rest',
          'Only when the bed alarm sounds or she presses the call bell',
        ],
        correct_index: 1,
        explanation: 'Skill 3-1, step 27: increase observation with 1- or 2-hour nursing rounds that include pain assessment, toileting assistance, comfort, personal items in reach, and patient needs. Step 23: anticipate needs rather than waiting to be asked.',
        criterion: 0,
        competency_ids: [C.MANAGEMENT_RESOURCES, C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Nadine sits on the edge of the bed before walking. What is the nurse assessing during this pause?',
        options: [
          'Whether she can put on her own nonskid shoes without help',
          'Her breathing, so she can be given oxygen before walking',
          'Nothing; the pause only lets the nurse fit the gait belt',
          'Dizziness; she stays seated until she feels secure',
        ],
        correct_index: 3,
        explanation: 'Skill 9-7, step 6: have the patient sit on the side of the bed for several minutes and assess for dizziness or lightheadedness, staying seated until she feels secure. Step 3: ask her to report dizziness, weakness, or shortness of breath while walking.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'Where does a single nurse stand to assist ambulation?',
        options: [
          'To her side and slightly behind, holding the gait belt',
          'Directly in front, walking backward and holding both hands',
          'A step behind, arms ready to catch her if she falls',
          'On her strong side, holding her elbow',
        ],
        correct_index: 0,
        explanation: 'Skill 9-7, step 10: a nurse assisting alone stands to the side and slightly behind the patient, supporting her by the waist or a gait (transfer) belt.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'On standing, Nadine says her legs feel weak and she is unsteady. What does the nurse do?',
        options: [
          'Encourage her to walk faster to build strength',
          'Let go of the gait belt so she can find her balance',
          'Return her to the bed or help her into a chair',
          'Carry on to the bathroom as planned',
        ],
        correct_index: 2,
        explanation: 'Skill 9-7, step 9: after helping the patient stand, assess balance and leg strength. If she is weak or unsteady, return her to the bed or assist her to a chair.',
        criterion: 1,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'When is the tourniquet released during venipuncture?',
        options: [
          'After all the ordered tubes have been filled',
          'As soon as blood flows well into the first tube',
          'Just before the needle is inserted into the vein',
          'After the needle is withdrawn and gauze is applied',
        ],
        correct_index: 1,
        explanation: 'Skill 18-9, step 18: remove the tourniquet as soon as blood flows adequately into the tube. It is applied 3 to 4 inches above the site, tight enough to impede venous but not arterial flow (step 14).',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'At what angle is the venipuncture needle inserted?',
        options: ['45 degrees, bevel down', '90 degrees', '5 degrees, bevel down', 'About 15 degrees, bevel up'],
        correct_index: 3,
        explanation: 'Skill 18-9, step 16: tell the patient she will feel a pinch, then insert the needle bevel up at a 15-degree angle to the skin, while the nondominant thumb holds traction below the site (step 15).',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE],
      },
      {
        content: 'After the needle is out, how long is pressure held on the site?',
        options: [
          '2 to 3 minutes, or until bleeding stops',
          'About 10 seconds',
          'A full 15 minutes',
          'No pressure is needed once a bandage is on',
        ],
        correct_index: 0,
        explanation: 'Skill 18-9, steps 20–22: place gauze over the site but don’t press until the needle is fully removed, then apply gentle pressure for 2 to 3 minutes or until bleeding stops, and apply a bandage. Check the site for a hematoma afterward (step 27).',
        criterion: 2,
        competency_ids: [C.SAFE_QUALITY_CARE],
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
    // The citation is what makes a question checkable against the book.
    if (!/^Skills? \d+-\d+/.test(q.explanation)) {
      problems.push(`question ${i + 1} does not open its explanation with the Taylor's skill it cites`);
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

    // The former title is tried too, so a renamed quiz is updated in place
    // rather than duplicated; the current title wins if somehow both exist.
    const titles = [quiz.title, ...(quiz.formerly ? [quiz.formerly] : [])];
    const { data: matches } = await supabase.from('assessments').select('id, title').in('title', titles);
    const existing = (matches ?? []).find((m) => m.title === quiz.title) ?? (matches ?? [])[0] ?? null;

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
