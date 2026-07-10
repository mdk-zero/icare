-- Add target_sections to assessments for section-based publishing
-- NULL or empty array means visible to all students
alter table public.assessments
  add column if not exists target_sections text[]
  check (
    target_sections is null or
    array_length(target_sections, 1) is null or
    target_sections <@ array['A', 'B', 'C']
  );
