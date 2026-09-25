-- =================================================================
-- 049: Skill assessments target Taylor's skills.
--
-- Quizzes are now "skill assessments": each criterion is one Taylor's
-- skill from the catalog (045), and each question is written from one
-- step of it. Until now the skill was only named in the criterion's
-- text and cited in the question's explanation; these columns make it
-- a link, so results can be read per skill as well as per skill area
-- (the chapter, still competency_id).
--
-- Nullable: criteria and questions written before this, or by hand
-- without a skill, keep working as before.
-- =================================================================

alter table public.assessment_criteria
  add column if not exists skill_id text references public.taylor_skills(id) on delete set null;

create index if not exists idx_assessment_criteria_skill on public.assessment_criteria(skill_id);

alter table public.questions
  add column if not exists skill_id text references public.taylor_skills(id) on delete set null;

create index if not exists idx_questions_skill on public.questions(skill_id);
