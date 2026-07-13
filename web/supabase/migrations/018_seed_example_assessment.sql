-- Seed a Medical-Surgical Nursing example assessment with criteria and questions
--
-- This creates:
--   1 assessment  "Medical-Surgical: Airway & Pharmacology"
--   5 criteria    (Airway & Breathing, Drug Calc, Assessment, Ethico-Legal, Patient Ed)
--   10 questions  (2 per criterion), each tagged to a competency area
--
-- Run this in the Supabase SQL editor. The assessment will be unpublished
-- with target_sections = '{"A","B"}' so only Section A & B students see it.

do $$
declare
  v_assessment_id uuid;
  v_comp_safe uuid;
  v_comp_pharm uuid;
  v_comp_health_ed uuid;
  v_comp_ethico uuid;
  v_q1_id uuid;
  v_q2_id uuid;
  v_q3_id uuid;
  v_q4_id uuid;
  v_q5_id uuid;
  v_q6_id uuid;
  v_q7_id uuid;
  v_q8_id uuid;
  v_q9_id uuid;
  v_q10_id uuid;
begin

-- -----------------------------------------------------------------
-- Look up competency area IDs by name
-- -----------------------------------------------------------------
select id into v_comp_safe from public.competency_areas where name = 'Safe and Quality Nursing Care';
select id into v_comp_pharm from public.competency_areas where name = 'Pharmacology';
select id into v_comp_health_ed from public.competency_areas where name = 'Health Education';
select id into v_comp_ethico from public.competency_areas where name = 'Ethico-moral Responsibility';

if v_comp_safe is null then
  raise exception 'Competency "Safe and Quality Nursing Care" not found. Run 009_add_assessments.sql seed first.';
end if;
if v_comp_pharm is null then
  raise exception 'Competency "Pharmacology" not found. Run 009_add_assessments.sql seed first (includes Pharmacology).';
end if;
if v_comp_health_ed is null then
  raise exception 'Competency "Health Education" not found.';
end if;
if v_comp_ethico is null then
  raise exception 'Competency "Ethico-moral Responsibility" not found.';
end if;

-- -----------------------------------------------------------------
-- 1. Create the assessment
-- -----------------------------------------------------------------
insert into public.assessments (title, description, difficulty, category, time_limit_seconds, is_published, target_sections)
values (
  'Medical-Surgical: Airway & Pharmacology',
  'A 10-question quiz covering airway management, drug calculations, patient assessment, ethico-legal scenarios, and patient education. Weighted criteria pinpoint competency gaps.',
  'intermediate',
  'Medical-Surgical',
  30 * 60,   -- 30 minutes
  false,     -- unpublished, publish when ready
  array['A', 'B']
)
returning id into v_assessment_id;

-- -----------------------------------------------------------------
-- 2. Create 5 criteria linked to competency areas
-- -----------------------------------------------------------------
insert into public.assessment_criteria (assessment_id, name, weight, competency_id, sort_order) values
  (v_assessment_id, 'Airway & Breathing',        30, v_comp_safe,      1),
  (v_assessment_id, 'Drug Calculations',         20, v_comp_pharm,     2),
  (v_assessment_id, 'Patient Assessment',        20, v_comp_health_ed, 3),
  (v_assessment_id, 'Ethico-Legal',              15, v_comp_ethico,    4),
  (v_assessment_id, 'Patient Education',         15, v_comp_health_ed, 5);

-- -----------------------------------------------------------------
-- 3. Create 10 questions (2 per criterion)
-- -----------------------------------------------------------------

-- Criterion 1 – Airway & Breathing (Safe and Quality Nursing Care)
insert into public.questions (assessment_id, position, content, options, correct_index, explanation, difficulty)
values (
  v_assessment_id, 0,
  'A post-op patient has an SpO₂ of 88% on room air. What should the nurse do first?',
  '["Notify the physician","Apply oxygen via nasal cannula","Suction the airway","Reposition the patient"]'::jsonb,
  1,
  'Applying oxygen is the priority nursing intervention for hypoxia. Notifying the physician can follow.',
  'intermediate'
) returning id into v_q1_id;

insert into public.questions (assessment_id, position, content, options, correct_index, explanation, difficulty)
values (
  v_assessment_id, 1,
  'Which finding indicates ineffective breathing pattern?',
  '["SpO₂ 97%","Respiratory rate 24/min with nasal flaring","Breath sounds clear","Chest rises symmetrically"]'::jsonb,
  1,
  'Nasal flaring and tachypnea are classic signs of respiratory distress.',
  'beginner'
) returning id into v_q2_id;

-- Criterion 2 – Drug Calculations (Pharmacology)
insert into public.questions (assessment_id, position, content, options, correct_index, explanation, difficulty)
values (
  v_assessment_id, 2,
  'The order is Ceftriaxone 750 mg IM. Available: 1 g vial. Reconstitute with 3.6 mL to get 250 mg/mL. How many mL should the nurse administer?',
  '["2 mL","3 mL","3.6 mL","1.5 mL"]'::jsonb,
  1,
  '750 mg ÷ 250 mg/mL = 3 mL. Always double-check your concentration before drawing up.',
  'advanced'
) returning id into v_q3_id;

insert into public.questions (assessment_id, position, content, options, correct_index, explanation, difficulty)
values (
  v_assessment_id, 3,
  'Heparin 5,000 units SC. The vial is 10,000 units/mL. How many mL should the nurse administer?',
  '["0.5 mL","1 mL","0.25 mL","2 mL"]'::jsonb,
  0,
  '5,000 ÷ 10,000 = 0.5 mL. Heparin is high-alert; always verify with another nurse.',
  'intermediate'
) returning id into v_q4_id;

-- Criterion 3 – Patient Assessment (Health Education)
insert into public.questions (assessment_id, position, content, options, correct_index, explanation, difficulty)
values (
  v_assessment_id, 4,
  'A nurse assessing a patient with chest pain should check which vital sign FIRST?',
  '["Blood pressure","Oxygen saturation only","Pulse and blood pressure","Capillary refill"]'::jsonb,
  2,
  'Pulse and BP give immediate information about cardiac output and perfusion in chest pain.',
  'intermediate'
) returning id into v_q5_id;

insert into public.questions (assessment_id, position, content, options, correct_index, explanation, difficulty)
values (
  v_assessment_id, 5,
  'Which is a priority assessment for a patient receiving IV fluids?',
  '["Urine output","Hair color","Nail length","Dietary preferences"]'::jsonb,
  0,
  'Urine output is the best indicator of adequate renal perfusion and fluid balance.',
  'beginner'
) returning id into v_q6_id;

-- Criterion 4 – Ethico-Legal (Ethico-moral Responsibility)
insert into public.questions (assessment_id, position, content, options, correct_index, explanation, difficulty)
values (
  v_assessment_id, 6,
  'A minor patient''s parents refuse a life-saving blood transfusion. What should the nurse do?',
  '["Administer the transfusion anyway","Respect the refusal and document","Call security","Persuade the parents to agree"]'::jsonb,
  1,
  'Respecting the parents'' refusal (within legal limits) upholds patient autonomy and informed consent principles.',
  'advanced'
) returning id into v_q7_id;

insert into public.questions (assessment_id, position, content, options, correct_index, explanation, difficulty)
values (
  v_assessment_id, 7,
  'Which action breaches patient confidentiality?',
  '["Discussing care with the attending physician","Sharing lab results with a family member without the patient''s consent","Documenting in the chart","Reporting a communicable disease to public health"]'::jsonb,
  1,
  'Sharing protected health information without consent violates patient confidentiality, except in emergencies or as required by law.',
  'intermediate'
) returning id into v_q8_id;

-- Criterion 5 – Patient Education (Health Education)
insert into public.questions (assessment_id, position, content, options, correct_index, explanation, difficulty)
values (
  v_assessment_id, 8,
  'A newly diagnosed diabetic patient asks when to check blood sugar. What is the BEST response?',
  '["Once a week","Before meals and at bedtime","Only when feeling dizzy","After every meal"]'::jsonb,
  1,
  'For insulin-dependent diabetes, pre-meal and bedtime checks are standard to guide insulin dosing and detect hypoglycemia.',
  'beginner'
) returning id into v_q9_id;

insert into public.questions (assessment_id, position, content, options, correct_index, explanation, difficulty)
values (
  v_assessment_id, 9,
  'Which statement indicates a patient understands fall prevention?',
  '["I''ll keep my walker in the other room","I''ll call for help before getting up","I can walk alone at night","I don''t need non-slip socks"]'::jsonb,
  1,
  'Calling for help demonstrates understanding of fall risk. The other options all increase fall risk.',
  'beginner'
) returning id into v_q10_id;

-- -----------------------------------------------------------------
-- 4. Tag each question with its competency area (via junction table)
-- -----------------------------------------------------------------

-- Criterion 1: Safe and Quality Nursing Care
insert into public.question_competencies (question_id, competency_id) values (v_q1_id, v_comp_safe);
insert into public.question_competencies (question_id, competency_id) values (v_q2_id, v_comp_safe);

-- Criterion 2: Pharmacology
insert into public.question_competencies (question_id, competency_id) values (v_q3_id, v_comp_pharm);
insert into public.question_competencies (question_id, competency_id) values (v_q4_id, v_comp_pharm);

-- Criterion 3: Health Education (used as closest to "Patient Assessment")
insert into public.question_competencies (question_id, competency_id) values (v_q5_id, v_comp_health_ed);
insert into public.question_competencies (question_id, competency_id) values (v_q6_id, v_comp_health_ed);

-- Criterion 4: Ethico-moral Responsibility
insert into public.question_competencies (question_id, competency_id) values (v_q7_id, v_comp_ethico);
insert into public.question_competencies (question_id, competency_id) values (v_q8_id, v_comp_ethico);

-- Criterion 5: Health Education
insert into public.question_competencies (question_id, competency_id) values (v_q9_id, v_comp_health_ed);
insert into public.question_competencies (question_id, competency_id) values (v_q10_id, v_comp_health_ed);

-- -----------------------------------------------------------------
raise notice '✅ Assessment seeded: "Medical-Surgical: Airway & Pharmacology" (ID: %)', v_assessment_id;
raise notice '  5 criteria, 10 questions across 4 competency areas.';
raise notice '  Publish it from the faculty UI when ready.';

end $$;
