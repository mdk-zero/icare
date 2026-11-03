-- =================================================================
-- 089: A quiz criterion's weight follows its questions.
--
-- The instructor used to type each criterion's weight and keep the total at
-- 100%. Now the weight is the criterion's share of the quiz's questions: 4
-- questions out of 10 is 40%. It follows every way a question arrives or
-- leaves (typed, written by the AI, read from a lesson, moved to another
-- criterion, deleted), so it can't drift from the bank.
--
-- Shares are kept to hundredths and always total exactly 100: each criterion
-- gets its share rounded down, and the hundredths left over go to the ones
-- rounded down the most (largest remainder). A criterion with no questions
-- yet weighs 0, so the check becomes weight >= 0; with no questions anywhere
-- the criteria share 100 equally until the first one is added.
--
-- The last statement recomputes every existing quiz once. A finished
-- attempt keeps the breakdown it was scored with
-- (attempt_criteria_scores.weight); only later attempts use the new weights.
-- Re-running is safe.
-- =================================================================

-- 016 left the check unnamed, so find it by what it checks.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where contype = 'c'
      and conrelid = 'public.assessment_criteria'::regclass
      and pg_get_constraintdef(oid) like '%weight%'
  loop
    execute format('alter table public.assessment_criteria drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.assessment_criteria
  add constraint assessment_criteria_weight_check check (weight >= 0 and weight <= 100);

create or replace function public.recompute_criteria_weights(p_assessment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  criteria_count int;
  question_count int;
begin
  select count(*) into criteria_count from assessment_criteria where assessment_id = p_assessment;
  if criteria_count = 0 then
    return;
  end if;
  select count(*) into question_count
  from questions q
  join assessment_criteria c on c.id = q.criteria_id
  where c.assessment_id = p_assessment;

  with pools as (
    select c.id, c.sort_order, c.created_at,
           (select count(*) from questions q where q.criteria_id = c.id) as pool
    from assessment_criteria c
    where c.assessment_id = p_assessment
  ),
  -- In hundredths of a percent, so 100% is 10000.
  shares as (
    select id, sort_order, created_at,
           case when question_count = 0 then 10000.0 / criteria_count
                else pool * 10000.0 / question_count end as exact
    from pools
  ),
  floored as (
    select id, sort_order, created_at, floor(exact)::int as base, exact - floor(exact) as remainder
    from shares
  ),
  ranked as (
    select f.*,
           row_number() over (order by remainder desc, sort_order, created_at, id) as rank,
           10000 - sum(base) over () as left_over
    from floored f
  )
  update assessment_criteria c
  set weight = (r.base + case when r.rank <= r.left_over then 1 else 0 end) / 100.0
  from ranked r
  where c.id = r.id
    and c.weight is distinct from (r.base + case when r.rank <= r.left_over then 1 else 0 end) / 100.0;
end;
$$;

create or replace function public.criteria_weights_after_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform recompute_criteria_weights(old.assessment_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.assessment_id is distinct from old.assessment_id) then
    perform recompute_criteria_weights(new.assessment_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_questions_criteria_weights on public.questions;
create trigger trg_questions_criteria_weights
  after insert or delete or update of criteria_id, assessment_id on public.questions
  for each row execute function public.criteria_weights_after_question();

create or replace function public.criteria_weights_after_criterion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform recompute_criteria_weights(coalesce(new.assessment_id, old.assessment_id));
  return null;
end;
$$;

-- Insert and delete only: an update here is this recompute itself.
drop trigger if exists trg_criteria_weights on public.assessment_criteria;
create trigger trg_criteria_weights
  after insert or delete on public.assessment_criteria
  for each row execute function public.criteria_weights_after_criterion();

-- Every existing quiz, once.
select public.recompute_criteria_weights(id) from public.assessments;
