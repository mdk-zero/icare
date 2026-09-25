/**
 * The competency areas: the 18 chapters of Lynn & LeBon, "Skill Checklists
 * for Taylor's Clinical Nursing Skills: A Nursing Process Approach", 3rd ed.
 * (Wolters Kluwer / LWW, 2011), shipped in docs/.
 *
 * Every Taylor's skill is numbered chapter-skill ("5-23" is the 23rd skill of
 * Chapter 5), so a criterion or question that cites a skill belongs to exactly
 * one of these areas — the citation is the mapping, and nothing has to be
 * tagged by hand.
 *
 * Migration 041 seeds these same rows under these same ids. The seeds check
 * the live table agrees before they write anything that points at them.
 */

export interface TaylorsChapter {
  chapter: number;
  id: string;
  name: string;
  description: string;
  /** How many skills the chapter has, so a citation past the last is caught. */
  skills: number;
}

export const TAYLORS_CHAPTERS: TaylorsChapter[] = [
  { chapter: 1, id: '47a5fabc-e6a0-48bd-9b1b-c8e1cbf8d0d8', name: 'Vital Signs', skills: 7, description: 'Taylor’s Chapter 1 (Skills 1-1 to 1-7): body temperature, including radiant warmers and cooling blankets, peripheral and apical pulse, respiration, and brachial blood pressure.' },
  { chapter: 2, id: 'fc0fa913-97e2-4a29-b211-d2125e4f3c93', name: 'Health Assessment', skills: 8, description: 'Taylor’s Chapter 2 (Skills 2-1 to 2-8): the general survey, bed scale, and assessment of the skin, head and neck, thorax and lungs, cardiovascular system, abdomen, and neurologic, musculoskeletal, and peripheral vascular systems.' },
  { chapter: 3, id: 'f6c264c6-3851-4d3a-9a1f-4fc781413d66', name: 'Safety', skills: 6, description: 'Taylor’s Chapter 3 (Skills 3-1 to 3-6): fall prevention, alternatives to restraints, and extremity, waist, elbow, and mummy restraints.' },
  { chapter: 4, id: '542e6be2-cf9d-4c53-8ca6-fadcbbe394fd', name: 'Asepsis and Infection Control', skills: 7, description: 'Taylor’s Chapter 4 (Skills 4-1 to 4-7): hand hygiene, preparing and adding to a sterile field, sterile gloves, and personal protective equipment.' },
  { chapter: 5, id: '351652c1-5c00-42bc-8489-16d0ce09d686', name: 'Medications', skills: 25, description: 'Taylor’s Chapter 5 (Skills 5-1 to 5-25): oral and gastric-tube medications, drawing up from ampules and vials, intradermal, subcutaneous, and intramuscular injections, intravenous medications, and transdermal, eye, ear, nasal, vaginal, rectal, and inhaled routes.' },
  { chapter: 6, id: '8ad28724-09c1-420d-b7fe-407655546a17', name: 'Perioperative Nursing', skills: 6, description: 'Taylor’s Chapter 6 (Skills 6-1 to 6-6): preoperative and postoperative care, deep breathing, coughing, and splinting, leg exercises, and forced-air warming.' },
  { chapter: 7, id: '0b05eb3a-f1e6-4a7d-b796-635e465539d5', name: 'Hygiene', skills: 9, description: 'Taylor’s Chapter 7 (Skills 7-1 to 7-9): bed baths, oral and denture care, contact lens removal, shampooing and shaving, and making occupied and unoccupied beds.' },
  { chapter: 8, id: '1cf130dc-52a2-41bb-a8cc-0c07ef708ca2', name: 'Skin Integrity and Wound Care', skills: 17, description: 'Taylor’s Chapter 8 (Skills 8-1 to 8-17): wound cleaning and dressings, irrigation and culture, drain care, negative pressure wound therapy, suture and staple removal, and heat and cold therapy.' },
  { chapter: 9, id: '87e10bb2-a391-4bc5-a530-d784d0db6c39', name: 'Activity', skills: 20, description: 'Taylor’s Chapter 9 (Skills 9-1 to 9-20): turning, moving, and transferring patients, range of motion, ambulation with walkers, crutches, and canes, compression devices, slings and bandages, casts, traction, and external fixation.' },
  { chapter: 10, id: '571a53a2-ca69-4dea-8a54-ee1f6dc90259', name: 'Comfort', skills: 6, description: 'Taylor’s Chapter 10 (Skills 10-1 to 10-6): promoting comfort, back massage, TENS, and patient-controlled, epidural, and continuous wound perfusion analgesia.' },
  { chapter: 11, id: 'c9bdee82-0968-427f-a7a8-487566ae925e', name: 'Nutrition', skills: 5, description: 'Taylor’s Chapter 11 (Skills 11-1 to 11-5): assisting with eating, nasogastric tube insertion and removal, tube feeding, and gastrostomy tube care.' },
  { chapter: 12, id: '72232494-0f7b-47f6-b4b5-9091a1e83f05', name: 'Urinary Elimination', skills: 14, description: 'Taylor’s Chapter 12 (Skills 12-1 to 12-14): bedpans, urinals, and commodes, bladder scanning, external and indwelling catheters, bladder irrigation, urinary diversions, and dialysis access care.' },
  { chapter: 13, id: 'fb673fff-3055-48ea-8bbc-9c579f19c23a', name: 'Bowel Elimination', skills: 8, description: 'Taylor’s Chapter 13 (Skills 13-1 to 13-8): cleansing and retention enemas, digital removal of stool, fecal incontinence pouches, ostomy care and colostomy irrigation, and nasogastric tube irrigation.' },
  { chapter: 14, id: '6a1a5251-8871-4e94-ab2b-57bc58f4ea5b', name: 'Oxygenation', skills: 15, description: 'Taylor’s Chapter 14 (Skills 14-1 to 14-15): pulse oximetry, incentive spirometry, oxygen by cannula, mask, and tent, suctioning and airways, endotracheal and tracheostomy care, chest drainage, and bag-and-mask ventilation.' },
  { chapter: 15, id: '086113d0-4f87-47d2-b6b1-9ed69e3c741e', name: 'Fluid, Electrolyte, and Acid–Base Balance', skills: 10, description: 'Taylor’s Chapter 15 (Skills 15-1 to 15-10): starting, monitoring, and maintaining peripheral IV infusions, blood transfusion, and central venous access devices, implanted ports, and PICCs.' },
  { chapter: 16, id: '71afd85e-3d75-40bc-abf3-e07fcfabb2ce', name: 'Cardiovascular Care', skills: 8, description: 'Taylor’s Chapter 16 (Skills 16-1 to 16-8): the 12-lead ECG, cardiac monitoring, arterial line sampling and removal, CPR, defibrillation, and transcutaneous pacing.' },
  { chapter: 17, id: '3e6a1089-615f-4480-8c6b-c0b3269459d1', name: 'Neurologic Care', skills: 6, description: 'Taylor’s Chapter 17 (Skills 17-1 to 17-6): logrolling, cervical collars, seizure precautions, halo traction, and intracranial pressure monitoring devices.' },
  { chapter: 18, id: 'dac36890-b858-4c38-96c7-19afd4c73406', name: 'Laboratory Specimen Collection', skills: 11, description: 'Taylor’s Chapter 18 (Skills 18-1 to 18-11): stool, urine, sputum, and nasal specimens, capillary blood glucose, venipuncture, blood cultures, and arterial blood gases.' },
];

/** Every skill number ("5-23") in a piece of text, in order. */
export function skillsIn(text: string): string[] {
  return [...text.matchAll(/\b(\d{1,2})-(\d{1,2})\b/g)].map((m) => `${m[1]}-${m[2]}`);
}

/** The chapter a skill number belongs to. Throws on one the book doesn't have. */
export function chapterOfSkill(skill: string): TaylorsChapter {
  const [chapter, number] = skill.split('-').map(Number);
  const found = TAYLORS_CHAPTERS.find((c) => c.chapter === chapter);
  if (!found || !(number >= 1 && number <= found.skills)) {
    throw new Error(`Skill ${skill} is not in Taylor's skill checklists`);
  }
  return found;
}

/**
 * The chapters the app teaches from: Vital Signs, Oxygenation, and Fluid,
 * Electrolyte, and Acid–Base Balance. The catalog holds only their skills, and
 * the other chapters' skill areas are hidden wherever areas are listed (their
 * rows stay in competency_areas, so older scores keep their references).
 */
export const ACTIVE_CHAPTERS: readonly number[] = [1, 14, 15];

const ACTIVE = TAYLORS_CHAPTERS.filter((c) => ACTIVE_CHAPTERS.includes(c.chapter));

/** Skill area (competency_areas) ids of the active chapters. */
export const ACTIVE_SKILL_AREA_IDS: readonly string[] = ACTIVE.map((c) => c.id);

const ACTIVE_NAMES = new Set(ACTIVE.map((c) => c.name));

/** Whether a skill area, by id or by name, is one of the active chapters. */
export function isActiveSkillArea(idOrName: string | null | undefined): boolean {
  return Boolean(idOrName) && (ACTIVE_SKILL_AREA_IDS.includes(idOrName!) || ACTIVE_NAMES.has(idOrName!));
}
