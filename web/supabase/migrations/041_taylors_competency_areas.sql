-- =================================================================
-- 041: Competency areas become the chapters of Taylor's skill checklists.
--
-- 009 seeded the Philippine Board of Nursing core competencies (Safe and
-- Quality Nursing Care, Pharmacology, ...). Scenarios and quizzes are now
-- written from Lynn & LeBon, "Skill Checklists for Taylor's Clinical Nursing
-- Skills" (3rd ed.), shipped in docs/, and that book organises its 188 skills
-- into 18 chapters. Those chapters are the competency areas from here on: a
-- quiz criterion is one Taylor's skill, and a skill's number names its
-- chapter ("5-23" is Chapter 5, Medications), so every criterion and question
-- belongs to exactly one area. Each description gives the chapter's skills.
--
-- The ids are fixed: web/scripts/taylors-chapters.ts holds the same rows,
-- and the seeds refuse to run if this table disagrees with it.
-- =================================================================

insert into public.competency_areas (id, name, description) values
  ('47a5fabc-e6a0-48bd-9b1b-c8e1cbf8d0d8', 'Vital Signs', 'Taylor’s Chapter 1 (Skills 1-1 to 1-7): body temperature, including radiant warmers and cooling blankets, peripheral and apical pulse, respiration, and brachial blood pressure.'),
  ('fc0fa913-97e2-4a29-b211-d2125e4f3c93', 'Health Assessment', 'Taylor’s Chapter 2 (Skills 2-1 to 2-8): the general survey, bed scale, and assessment of the skin, head and neck, thorax and lungs, cardiovascular system, abdomen, and neurologic, musculoskeletal, and peripheral vascular systems.'),
  ('f6c264c6-3851-4d3a-9a1f-4fc781413d66', 'Safety', 'Taylor’s Chapter 3 (Skills 3-1 to 3-6): fall prevention, alternatives to restraints, and extremity, waist, elbow, and mummy restraints.'),
  ('542e6be2-cf9d-4c53-8ca6-fadcbbe394fd', 'Asepsis and Infection Control', 'Taylor’s Chapter 4 (Skills 4-1 to 4-7): hand hygiene, preparing and adding to a sterile field, sterile gloves, and personal protective equipment.'),
  ('351652c1-5c00-42bc-8489-16d0ce09d686', 'Medications', 'Taylor’s Chapter 5 (Skills 5-1 to 5-25): oral and gastric-tube medications, drawing up from ampules and vials, intradermal, subcutaneous, and intramuscular injections, intravenous medications, and transdermal, eye, ear, nasal, vaginal, rectal, and inhaled routes.'),
  ('8ad28724-09c1-420d-b7fe-407655546a17', 'Perioperative Nursing', 'Taylor’s Chapter 6 (Skills 6-1 to 6-6): preoperative and postoperative care, deep breathing, coughing, and splinting, leg exercises, and forced-air warming.'),
  ('0b05eb3a-f1e6-4a7d-b796-635e465539d5', 'Hygiene', 'Taylor’s Chapter 7 (Skills 7-1 to 7-9): bed baths, oral and denture care, contact lens removal, shampooing and shaving, and making occupied and unoccupied beds.'),
  ('1cf130dc-52a2-41bb-a8cc-0c07ef708ca2', 'Skin Integrity and Wound Care', 'Taylor’s Chapter 8 (Skills 8-1 to 8-17): wound cleaning and dressings, irrigation and culture, drain care, negative pressure wound therapy, suture and staple removal, and heat and cold therapy.'),
  ('87e10bb2-a391-4bc5-a530-d784d0db6c39', 'Activity', 'Taylor’s Chapter 9 (Skills 9-1 to 9-20): turning, moving, and transferring patients, range of motion, ambulation with walkers, crutches, and canes, compression devices, slings and bandages, casts, traction, and external fixation.'),
  ('571a53a2-ca69-4dea-8a54-ee1f6dc90259', 'Comfort', 'Taylor’s Chapter 10 (Skills 10-1 to 10-6): promoting comfort, back massage, TENS, and patient-controlled, epidural, and continuous wound perfusion analgesia.'),
  ('c9bdee82-0968-427f-a7a8-487566ae925e', 'Nutrition', 'Taylor’s Chapter 11 (Skills 11-1 to 11-5): assisting with eating, nasogastric tube insertion and removal, tube feeding, and gastrostomy tube care.'),
  ('72232494-0f7b-47f6-b4b5-9091a1e83f05', 'Urinary Elimination', 'Taylor’s Chapter 12 (Skills 12-1 to 12-14): bedpans, urinals, and commodes, bladder scanning, external and indwelling catheters, bladder irrigation, urinary diversions, and dialysis access care.'),
  ('fb673fff-3055-48ea-8bbc-9c579f19c23a', 'Bowel Elimination', 'Taylor’s Chapter 13 (Skills 13-1 to 13-8): cleansing and retention enemas, digital removal of stool, fecal incontinence pouches, ostomy care and colostomy irrigation, and nasogastric tube irrigation.'),
  ('6a1a5251-8871-4e94-ab2b-57bc58f4ea5b', 'Oxygenation', 'Taylor’s Chapter 14 (Skills 14-1 to 14-15): pulse oximetry, incentive spirometry, oxygen by cannula, mask, and tent, suctioning and airways, endotracheal and tracheostomy care, chest drainage, and bag-and-mask ventilation.'),
  ('086113d0-4f87-47d2-b6b1-9ed69e3c741e', 'Fluid, Electrolyte, and Acid–Base Balance', 'Taylor’s Chapter 15 (Skills 15-1 to 15-10): starting, monitoring, and maintaining peripheral IV infusions, blood transfusion, and central venous access devices, implanted ports, and PICCs.'),
  ('71afd85e-3d75-40bc-abf3-e07fcfabb2ce', 'Cardiovascular Care', 'Taylor’s Chapter 16 (Skills 16-1 to 16-8): the 12-lead ECG, cardiac monitoring, arterial line sampling and removal, CPR, defibrillation, and transcutaneous pacing.'),
  ('3e6a1089-615f-4480-8c6b-c0b3269459d1', 'Neurologic Care', 'Taylor’s Chapter 17 (Skills 17-1 to 17-6): logrolling, cervical collars, seizure precautions, halo traction, and intracranial pressure monitoring devices.'),
  ('dac36890-b858-4c38-96c7-19afd4c73406', 'Laboratory Specimen Collection', 'Taylor’s Chapter 18 (Skills 18-1 to 18-11): stool, urine, sputum, and nasal specimens, capillary blood glucose, venipuncture, blood cultures, and arterial blood gases.')
on conflict (id) do update
  set name = excluded.name, description = excluded.description;

-- -----------------------------------------------------------------
-- Retire the PRC competencies — but only those nothing depends on.
--
-- Deleting a competency cascades to the criteria, question tags, faculty
-- validations and per-attempt criteria scores that use it, so a PRC area
-- still in use is kept and named instead. Re-point what uses it (re-running
-- seed-scenario-quizzes.ts does this for the seeded quizzes), then apply
-- this migration again. Assessment-derived competency scores are not a
-- reason to keep one: they are rebuilt from attempts.
-- -----------------------------------------------------------------
do $$
declare
  kept text;
begin
  delete from public.competency_areas c
  where c.name in (
      'Safe and Quality Nursing Care',
      'Management of Resources and Environment',
      'Health Education',
      'Legal Responsibility',
      'Ethico-moral Responsibility',
      'Personal and Professional Development',
      'Quality Improvement',
      'Research',
      'Records Management',
      'Communication',
      'Collaboration and Teamwork',
      'Pharmacology'
    )
    and not exists (select 1 from public.assessment_criteria x where x.competency_id = c.id)
    and not exists (select 1 from public.question_competencies x where x.competency_id = c.id)
    and not exists (select 1 from public.attempt_criteria_scores x where x.competency_id = c.id)
    and not exists (
      select 1 from public.competency_scores x
      where x.competency_id = c.id and x.source = 'faculty_validation'
    );

  select string_agg(name, ', ' order by name) into kept
  from public.competency_areas
  where name in (
      'Safe and Quality Nursing Care',
      'Management of Resources and Environment',
      'Health Education',
      'Legal Responsibility',
      'Ethico-moral Responsibility',
      'Personal and Professional Development',
      'Quality Improvement',
      'Research',
      'Records Management',
      'Communication',
      'Collaboration and Teamwork',
      'Pharmacology'
  );
  if kept is not null then
    raise notice 'Kept PRC competencies still in use — re-point them, then re-apply: %', kept;
  end if;
end $$;
