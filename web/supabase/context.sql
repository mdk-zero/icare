-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  google_sub text UNIQUE,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  picture_url text,
  role USER-DEFINED NOT NULL DEFAULT 'student'::user_role,
  password_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_login_at timestamp with time zone,
  force_password_change boolean NOT NULL DEFAULT false,
  campus_id uuid,
  section character varying CHECK (section::text = ANY (ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying]::text[])),
  section_id uuid,
  sex USER-DEFINED,
  admin_id uuid,
  web_session_id uuid,
  mobile_session_id uuid,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campuses(id),
  CONSTRAINT users_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id),
  CONSTRAINT users_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.password_resets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT password_resets_pkey PRIMARY KEY (id),
  CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.patients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subject_id bigint NOT NULL,
  hadm_id bigint,
  name text NOT NULL,
  age integer,
  gender text,
  room_number text,
  diagnosis text,
  admission_date timestamp with time zone,
  vital_signs jsonb NOT NULL DEFAULT '{}'::jsonb,
  labs jsonb NOT NULL DEFAULT '{}'::jsonb,
  mimic_id text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  medical_history text,
  room_id uuid,
  status USER-DEFINED NOT NULL DEFAULT 'admitted'::patient_status,
  discharged_at timestamp with time zone,
  discharged_by uuid,
  admin_id uuid,
  CONSTRAINT patients_pkey PRIMARY KEY (id),
  CONSTRAINT patients_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT patients_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id),
  CONSTRAINT patients_discharged_by_fkey FOREIGN KEY (discharged_by) REFERENCES public.users(id),
  CONSTRAINT patients_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.faculty_students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL,
  student_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT faculty_students_pkey PRIMARY KEY (id),
  CONSTRAINT faculty_students_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.users(id),
  CONSTRAINT faculty_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id)
);
CREATE TABLE public.scenarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid,
  title text NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  difficulty USER-DEFINED NOT NULL,
  category text NOT NULL,
  patient_case jsonb NOT NULL DEFAULT '{}'::jsonb,
  learning_objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  patient_id uuid,
  rubric jsonb CHECK (rubric IS NULL OR jsonb_typeof(rubric) = 'object'::text),
  kind text NOT NULL DEFAULT 'patient_case'::text CHECK (kind = ANY (ARRAY['patient_case'::text, 'return_demo'::text])),
  offering_id uuid,
  admin_id uuid,
  CONSTRAINT scenarios_pkey PRIMARY KEY (id),
  CONSTRAINT scenarios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT scenarios_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT scenarios_category_fkey FOREIGN KEY (category) REFERENCES public.scenario_categories(name),
  CONSTRAINT scenarios_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.course_offerings(id),
  CONSTRAINT scenarios_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.scenario_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  deadline timestamp with time zone,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::scenario_assignment_status,
  required boolean NOT NULL DEFAULT true,
  completed_at timestamp with time zone,
  score numeric,
  time_taken integer,
  submitted_at timestamp with time zone,
  finalized_by uuid,
  team_id uuid,
  started_at timestamp with time zone,
  CONSTRAINT scenario_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT scenario_assignments_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id),
  CONSTRAINT scenario_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT scenario_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id),
  CONSTRAINT scenario_assignments_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES public.users(id),
  CONSTRAINT scenario_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.campuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  address text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campuses_pkey PRIMARY KEY (id)
);
CREATE TABLE public.rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campus_id uuid,
  name text NOT NULL,
  room_number text NOT NULL,
  capacity integer NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  status USER-DEFINED NOT NULL DEFAULT 'active'::room_status,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  plan_x integer,
  plan_y integer,
  plan_w integer,
  plan_h integer,
  admin_id uuid,
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campuses(id),
  CONSTRAINT rooms_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.room_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_by uuid,
  shift text,
  starts_at timestamp with time zone NOT NULL DEFAULT now(),
  ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT room_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT room_assignments_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id),
  CONSTRAINT room_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT room_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);
CREATE TABLE public.competency_areas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT competency_areas_pkey PRIMARY KEY (id)
);
CREATE TABLE public.assessments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campus_id uuid,
  created_by uuid,
  title text NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  difficulty USER-DEFINED NOT NULL DEFAULT 'beginner'::assessment_difficulty,
  category USER-DEFINED NOT NULL DEFAULT 'General'::scenario_category,
  time_limit_seconds integer CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
  is_published boolean NOT NULL DEFAULT false,
  is_ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  target_sections ARRAY,
  max_attempts integer CHECK (max_attempts IS NULL OR max_attempts > 0),
  total_questions integer CHECK (total_questions IS NULL OR total_questions > 0),
  deadline timestamp with time zone,
  offering_id uuid,
  admin_id uuid,
  CONSTRAINT assessments_pkey PRIMARY KEY (id),
  CONSTRAINT assessments_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campuses(id),
  CONSTRAINT assessments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT assessments_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.course_offerings(id),
  CONSTRAINT assessments_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer NOT NULL CHECK (correct_index >= 0),
  explanation text NOT NULL DEFAULT ''::text,
  difficulty USER-DEFINED,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  question_type character varying DEFAULT 'multiple_choice'::character varying CHECK (question_type::text = ANY (ARRAY['multiple_choice'::character varying, 'true_false'::character varying, 'short_answer'::character varying]::text[])),
  points integer DEFAULT 1,
  criteria_id uuid,
  skill_id text,
  CONSTRAINT questions_pkey PRIMARY KEY (id),
  CONSTRAINT questions_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.taylor_skills(id),
  CONSTRAINT questions_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id),
  CONSTRAINT questions_criteria_id_fkey FOREIGN KEY (criteria_id) REFERENCES public.assessment_criteria(id)
);
CREATE TABLE public.question_competencies (
  question_id uuid NOT NULL,
  competency_id uuid NOT NULL,
  CONSTRAINT question_competencies_pkey PRIMARY KEY (question_id, competency_id),
  CONSTRAINT question_competencies_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id),
  CONSTRAINT question_competencies_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competency_areas(id)
);
CREATE TABLE public.assessment_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  deadline timestamp with time zone,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::assessment_assignment_status,
  required boolean NOT NULL DEFAULT true,
  max_attempts integer CHECK (max_attempts IS NULL OR max_attempts > 0),
  CONSTRAINT assessment_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT assessment_assignments_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id),
  CONSTRAINT assessment_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT assessment_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);
CREATE TABLE public.assessment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assignment_id uuid,
  status USER-DEFINED NOT NULL DEFAULT 'in_progress'::attempt_status,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  submitted_at timestamp with time zone,
  score numeric CHECK (score IS NULL OR score >= 0::numeric AND score <= 100::numeric),
  time_taken_seconds integer CHECK (time_taken_seconds IS NULL OR time_taken_seconds >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assessment_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT assessment_attempts_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id),
  CONSTRAINT assessment_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT assessment_attempts_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assessment_assignments(id)
);
CREATE TABLE public.attempt_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  selected_index integer,
  is_correct boolean NOT NULL DEFAULT false,
  time_spent_seconds integer CHECK (time_spent_seconds IS NULL OR time_spent_seconds >= 0),
  answered_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attempt_answers_pkey PRIMARY KEY (id),
  CONSTRAINT attempt_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.assessment_attempts(id),
  CONSTRAINT attempt_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.vital_sign_readings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  recorded_by uuid NOT NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  heart_rate integer CHECK (heart_rate IS NULL OR heart_rate >= 0 AND heart_rate <= 400),
  bp_systolic integer CHECK (bp_systolic IS NULL OR bp_systolic >= 0 AND bp_systolic <= 400),
  bp_diastolic integer CHECK (bp_diastolic IS NULL OR bp_diastolic >= 0 AND bp_diastolic <= 300),
  temperature_c numeric CHECK (temperature_c IS NULL OR temperature_c >= 20::numeric AND temperature_c <= 46::numeric),
  respiratory_rate integer CHECK (respiratory_rate IS NULL OR respiratory_rate >= 0 AND respiratory_rate <= 120),
  oxygen_saturation integer CHECK (oxygen_saturation IS NULL OR oxygen_saturation >= 0 AND oxygen_saturation <= 100),
  pain_score integer CHECK (pain_score IS NULL OR pain_score >= 0 AND pain_score <= 10),
  notes text,
  is_anomaly boolean NOT NULL DEFAULT false,
  anomaly_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vital_sign_readings_pkey PRIMARY KEY (id),
  CONSTRAINT vital_sign_readings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT vital_sign_readings_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id)
);
CREATE TABLE public.tpr_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  recorded_by uuid NOT NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  shift text,
  temperature_c numeric,
  pulse integer,
  respiration integer,
  remarks text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tpr_records_pkey PRIMARY KEY (id),
  CONSTRAINT tpr_records_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT tpr_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id)
);
CREATE TABLE public.ivf_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  recorded_by uuid NOT NULL,
  solution text NOT NULL,
  volume_ml integer CHECK (volume_ml IS NULL OR volume_ml > 0),
  rate_ml_hr numeric CHECK (rate_ml_hr IS NULL OR rate_ml_hr > 0::numeric),
  site text,
  status USER-DEFINED NOT NULL DEFAULT 'ongoing'::ivf_status,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  remarks text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ivf_records_pkey PRIMARY KEY (id),
  CONSTRAINT ivf_records_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT ivf_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id)
);
CREATE TABLE public.progress_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  author_id uuid NOT NULL,
  content text NOT NULL,
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT progress_notes_pkey PRIMARY KEY (id),
  CONSTRAINT progress_notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT progress_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id),
  CONSTRAINT progress_notes_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id)
);
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role USER-DEFINED,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type USER-DEFINED NOT NULL DEFAULT 'system'::notification_type,
  title text NOT NULL,
  body text NOT NULL DEFAULT ''::text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.device_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  platform USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT device_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.ml_models (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind USER-DEFINED NOT NULL,
  version text NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'staging'::ml_model_status,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_url text,
  is_baseline boolean NOT NULL DEFAULT false,
  trained_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ml_models_pkey PRIMARY KEY (id)
);
CREATE TABLE public.performance_predictions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  model_id uuid NOT NULL,
  risk USER-DEFINED NOT NULL,
  probability numeric CHECK (probability >= 0::numeric AND probability <= 1::numeric),
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanations jsonb NOT NULL DEFAULT '[]'::jsonb,
  predicted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT performance_predictions_pkey PRIMARY KEY (id),
  CONSTRAINT performance_predictions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT performance_predictions_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.ml_models(id)
);
CREATE TABLE public.learning_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  model_id uuid,
  assessment_id uuid,
  competency_id uuid,
  rank integer NOT NULL DEFAULT 1,
  reason text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  dismissed_at timestamp with time zone,
  completed_at timestamp with time zone,
  CONSTRAINT learning_recommendations_pkey PRIMARY KEY (id),
  CONSTRAINT learning_recommendations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT learning_recommendations_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.ml_models(id),
  CONSTRAINT learning_recommendations_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id),
  CONSTRAINT learning_recommendations_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competency_areas(id)
);
CREATE TABLE public.competency_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  competency_id uuid NOT NULL,
  faculty_id uuid,
  source USER-DEFINED NOT NULL DEFAULT 'faculty_validation'::competency_score_source,
  score numeric NOT NULL CHECK (score >= 0::numeric AND score <= 100::numeric),
  attempt_id uuid,
  remarks text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT competency_scores_pkey PRIMARY KEY (id),
  CONSTRAINT competency_scores_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT competency_scores_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competency_areas(id),
  CONSTRAINT competency_scores_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.users(id),
  CONSTRAINT competency_scores_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.assessment_attempts(id)
);
CREATE TABLE public.assistance_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  room_id uuid,
  patient_id uuid,
  message text NOT NULL DEFAULT ''::text,
  status USER-DEFINED NOT NULL DEFAULT 'open'::assistance_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamp with time zone,
  CONSTRAINT assistance_requests_pkey PRIMARY KEY (id),
  CONSTRAINT assistance_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT assistance_requests_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id),
  CONSTRAINT assistance_requests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT assistance_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id)
);
CREATE TABLE public.service_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  category text,
  comments text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT service_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT service_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.assessment_criteria (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  name text NOT NULL,
  weight numeric NOT NULL CHECK (weight > 0::numeric),
  competency_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  min_questions integer NOT NULL DEFAULT 1 CHECK (min_questions >= 0),
  skill_id text,
  CONSTRAINT assessment_criteria_pkey PRIMARY KEY (id),
  CONSTRAINT assessment_criteria_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.taylor_skills(id),
  CONSTRAINT assessment_criteria_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id),
  CONSTRAINT assessment_criteria_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competency_areas(id)
);
CREATE TABLE public.attempt_criteria_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL,
  criteria_id uuid NOT NULL,
  competency_id uuid NOT NULL,
  criteria_name text NOT NULL,
  weight numeric NOT NULL,
  correct integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  weighted_score numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attempt_criteria_scores_pkey PRIMARY KEY (id),
  CONSTRAINT attempt_criteria_scores_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.assessment_attempts(id),
  CONSTRAINT attempt_criteria_scores_criteria_id_fkey FOREIGN KEY (criteria_id) REFERENCES public.assessment_criteria(id),
  CONSTRAINT attempt_criteria_scores_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competency_areas(id)
);
CREATE TABLE public.sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  admin_id uuid,
  CONSTRAINT sections_pkey PRIMARY KEY (id),
  CONSTRAINT sections_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.faculty_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL,
  section_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT faculty_sections_pkey PRIMARY KEY (id),
  CONSTRAINT faculty_sections_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.users(id),
  CONSTRAINT faculty_sections_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id)
);
CREATE TABLE public.scenario_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  category USER-DEFINED NOT NULL DEFAULT 'assessment'::scenario_task_category,
  points integer NOT NULL DEFAULT 10 CHECK (points >= 0),
  verification USER-DEFINED NOT NULL DEFAULT 'faculty'::scenario_task_verification,
  system_trigger USER-DEFINED,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  skill_id text,
  CONSTRAINT scenario_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT scenario_tasks_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id),
  CONSTRAINT scenario_tasks_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.taylor_skills(id)
);
CREATE TABLE public.scenario_task_completions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  task_id uuid NOT NULL,
  completed_by uuid,
  completed_via USER-DEFINED NOT NULL,
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  rating text CHECK (rating IS NULL OR (rating = ANY (ARRAY['excellent'::text, 'satisfactory'::text, 'needs_practice'::text, 'not_applicable'::text]))),
  remarks text CHECK (remarks IS NULL OR char_length(remarks) <= 1000),
  rated_by uuid,
  CONSTRAINT scenario_task_completions_pkey PRIMARY KEY (id),
  CONSTRAINT scenario_task_completions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.scenario_assignments(id),
  CONSTRAINT scenario_task_completions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.scenario_tasks(id),
  CONSTRAINT scenario_task_completions_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id),
  CONSTRAINT scenario_task_completions_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id)
);
CREATE TABLE public.attempt_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  criteria_id uuid,
  position integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attempt_questions_pkey PRIMARY KEY (id),
  CONSTRAINT attempt_questions_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.assessment_attempts(id),
  CONSTRAINT attempt_questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id),
  CONSTRAINT attempt_questions_criteria_id_fkey FOREIGN KEY (criteria_id) REFERENCES public.assessment_criteria(id)
);
CREATE TABLE public.shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campus_id uuid,
  room_id uuid,
  section_id uuid,
  created_by uuid,
  label text,
  shift_type USER-DEFINED NOT NULL DEFAULT 'custom'::shift_type,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  notes text,
  status USER-DEFINED NOT NULL DEFAULT 'scheduled'::shift_status,
  series_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  team_id uuid,
  CONSTRAINT shifts_pkey PRIMARY KEY (id),
  CONSTRAINT shifts_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT shifts_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campuses(id),
  CONSTRAINT shifts_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id),
  CONSTRAINT shifts_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id),
  CONSTRAINT shifts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.shift_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_by uuid,
  attendance_status USER-DEFINED NOT NULL DEFAULT 'scheduled'::shift_attendance_status,
  checked_in_at timestamp with time zone,
  checked_out_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shift_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT shift_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id),
  CONSTRAINT shift_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT shift_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);
CREATE TABLE public.assessment_deadline_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  reminder_window text NOT NULL,
  deadline timestamp with time zone NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assessment_deadline_reminders_pkey PRIMARY KEY (id),
  CONSTRAINT assessment_deadline_reminders_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assessment_assignments(id)
);
CREATE TABLE public.discharge_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  created_by uuid,
  admitted_at timestamp with time zone,
  discharged_at timestamp with time zone NOT NULL DEFAULT now(),
  diagnosis text NOT NULL DEFAULT ''::text,
  room_label text NOT NULL DEFAULT ''::text,
  vitals_digest jsonb NOT NULL DEFAULT '{}'::jsonb,
  ehr_digest jsonb NOT NULL DEFAULT '{}'::jsonb,
  follow_up jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_model text,
  ai_generated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT discharge_summaries_pkey PRIMARY KEY (id),
  CONSTRAINT discharge_summaries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT discharge_summaries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.scenario_task_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  title text NOT NULL,
  source text NOT NULL DEFAULT ''::text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  skill_step_id uuid,
  CONSTRAINT scenario_task_steps_pkey PRIMARY KEY (id),
  CONSTRAINT scenario_task_steps_skill_step_id_fkey FOREIGN KEY (skill_step_id) REFERENCES public.taylor_skill_steps(id),
  CONSTRAINT scenario_task_steps_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.scenario_tasks(id)
);
CREATE TABLE public.scenario_task_step_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  step_id uuid NOT NULL,
  rating text NOT NULL CHECK (rating = ANY (ARRAY['excellent'::text, 'satisfactory'::text, 'needs_practice'::text, 'not_applicable'::text])),
  rated_by uuid,
  rated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT scenario_task_step_ratings_pkey PRIMARY KEY (id),
  CONSTRAINT scenario_task_step_ratings_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.scenario_assignments(id),
  CONSTRAINT scenario_task_step_ratings_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.scenario_task_steps(id),
  CONSTRAINT scenario_task_step_ratings_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id)
);
CREATE TABLE public.taylor_skills (
  id text NOT NULL CHECK (id ~ '^\d{1,2}-\d{1,2}$'::text),
  chapter_id uuid NOT NULL,
  chapter integer NOT NULL,
  number integer NOT NULL,
  title text NOT NULL,
  goal text NOT NULL DEFAULT ''::text,
  CONSTRAINT taylor_skills_pkey PRIMARY KEY (id),
  CONSTRAINT taylor_skills_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.competency_areas(id)
);
CREATE TABLE public.taylor_skill_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  skill_id text NOT NULL,
  position integer NOT NULL,
  step_no integer NOT NULL,
  section text,
  text text NOT NULL,
  CONSTRAINT taylor_skill_steps_pkey PRIMARY KEY (id),
  CONSTRAINT taylor_skill_steps_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.taylor_skills(id)
);
CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 60),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  faculty_id uuid,
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.users(id),
  CONSTRAINT teams_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id),
  CONSTRAINT teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.team_members (
  team_id uuid NOT NULL,
  student_id uuid NOT NULL UNIQUE,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_members_pkey PRIMARY KEY (team_id, student_id),
  CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id)
);
CREATE TABLE public.student_reflections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type = ANY (ARRAY['scenario'::text, 'assessment'::text])),
  source_id uuid NOT NULL,
  reflection text NOT NULL DEFAULT ''::text CHECK (char_length(reflection) <= 4000),
  ai_feedback jsonb,
  ai_signature text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT student_reflections_pkey PRIMARY KEY (id),
  CONSTRAINT student_reflections_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id)
);
CREATE TABLE public.student_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  reflection_id uuid,
  text text NOT NULL CHECK (char_length(btrim(text)) >= 1 AND char_length(btrim(text)) <= 300),
  skill_id text,
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'met'::text])),
  target_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  met_at timestamp with time zone,
  CONSTRAINT student_goals_pkey PRIMARY KEY (id),
  CONSTRAINT student_goals_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT student_goals_reflection_id_fkey FOREIGN KEY (reflection_id) REFERENCES public.student_reflections(id),
  CONSTRAINT student_goals_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.taylor_skills(id)
);
CREATE TABLE public.request_metrics (
  id bigint NOT NULL DEFAULT nextval('request_metrics_id_seq'::regclass),
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  method text NOT NULL,
  route text NOT NULL,
  status integer NOT NULL,
  duration_ms integer NOT NULL,
  source text NOT NULL DEFAULT 'web'::text CHECK (source = ANY (ARRAY['web'::text, 'mobile'::text, 'benchmark'::text, 'ai'::text])),
  role text,
  CONSTRAINT request_metrics_pkey PRIMARY KEY (id)
);
CREATE TABLE public.system_test_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind = ANY (ARRAY['benchmark'::text, 'dw_benchmark'::text, 'health'::text, 'e2e'::text, 'api'::text])),
  run_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT system_test_runs_pkey PRIMARY KEY (id),
  CONSTRAINT system_test_runs_run_by_fkey FOREIGN KEY (run_by) REFERENCES public.users(id)
);
CREATE TABLE public.case_presentations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(TRIM(BOTH FROM title)) > 0),
  instructions text NOT NULL DEFAULT ''::text,
  deadline timestamp with time zone,
  section_ids ARRAY NOT NULL DEFAULT '{}'::uuid[],
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  offering_id uuid,
  team_ids ARRAY NOT NULL DEFAULT '{}'::uuid[],
  admin_id uuid,
  CONSTRAINT case_presentations_pkey PRIMARY KEY (id),
  CONSTRAINT case_presentations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT case_presentations_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.course_offerings(id),
  CONSTRAINT case_presentations_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.case_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  presentation_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'not_started'::case_submission_status,
  patient_initials text CHECK (patient_initials ~ '^[A-Z]{2,4}$'::text),
  age integer CHECK (age >= 0 AND age <= 130),
  sex USER-DEFINED,
  hospital text NOT NULL DEFAULT ''::text,
  ward text NOT NULL DEFAULT ''::text,
  admitting_diagnosis text NOT NULL DEFAULT ''::text,
  chief_complaint text NOT NULL DEFAULT ''::text,
  history text NOT NULL DEFAULT ''::text,
  medications text NOT NULL DEFAULT ''::text,
  nursing_diagnoses text NOT NULL DEFAULT ''::text,
  interventions text NOT NULL DEFAULT ''::text,
  observations jsonb NOT NULL DEFAULT '{"ivf": [], "tpr": [], "vitals": []}'::jsonb,
  submitted_at timestamp with time zone,
  graded_by uuid,
  graded_at timestamp with time zone,
  score numeric,
  remarks text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT case_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT case_submissions_presentation_id_fkey FOREIGN KEY (presentation_id) REFERENCES public.case_presentations(id),
  CONSTRAINT case_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT case_submissions_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES public.users(id)
);
CREATE TABLE public.case_submission_ratings (
  submission_id uuid NOT NULL,
  criterion text NOT NULL,
  rating text NOT NULL CHECK (rating = ANY (ARRAY['excellent'::text, 'satisfactory'::text, 'needs_practice'::text])),
  remarks text NOT NULL DEFAULT ''::text,
  rated_by uuid,
  rated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT case_submission_ratings_pkey PRIMARY KEY (submission_id, criterion),
  CONSTRAINT case_submission_ratings_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.case_submissions(id),
  CONSTRAINT case_submission_ratings_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id)
);
CREATE TABLE public.email_change_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  new_email text NOT NULL CHECK (new_email = lower(new_email) AND new_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text),
  otp_hash text NOT NULL,
  requested_by uuid,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT email_change_requests_pkey PRIMARY KEY (id),
  CONSTRAINT email_change_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id),
  CONSTRAINT email_change_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.student_ai_tips (
  student_id uuid NOT NULL,
  tips jsonb NOT NULL DEFAULT '[]'::jsonb,
  fingerprint text NOT NULL,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT student_ai_tips_pkey PRIMARY KEY (student_id),
  CONSTRAINT student_ai_tips_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id)
);
CREATE TABLE public.scenario_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (name = btrim(name) AND char_length(name) >= 1 AND char_length(name) <= 60),
  source text NOT NULL DEFAULT 'faculty'::text CHECK (source = ANY (ARRAY['preset'::text, 'faculty'::text, 'lesson'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  admin_id uuid,
  CONSTRAINT scenario_categories_pkey PRIMARY KEY (id),
  CONSTRAINT scenario_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT scenario_categories_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.library_materials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  skill_id text NOT NULL,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['video'::text, 'note'::text, 'pdf'::text, 'slides'::text, 'link'::text])),
  title text NOT NULL CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200),
  description text NOT NULL DEFAULT ''::text,
  youtube_id text CHECK (youtube_id ~ '^[A-Za-z0-9_-]{11}$'::text),
  body_md text,
  url text,
  file_path text,
  file_name text,
  file_size integer,
  mime_type text,
  target_sections ARRAY,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text])),
  published_at timestamp with time zone,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  offering_id uuid,
  admin_id uuid,
  CONSTRAINT library_materials_pkey PRIMARY KEY (id),
  CONSTRAINT library_materials_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.taylor_skills(id),
  CONSTRAINT library_materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT library_materials_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.course_offerings(id),
  CONSTRAINT library_materials_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.library_suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  skill_id text NOT NULL,
  youtube_id text NOT NULL CHECK (youtube_id ~ '^[A-Za-z0-9_-]{11}$'::text),
  title text NOT NULL,
  channel text NOT NULL DEFAULT ''::text,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT library_suggestions_pkey PRIMARY KEY (id),
  CONSTRAINT library_suggestions_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.taylor_skills(id)
);
CREATE TABLE public.library_views (
  material_id uuid NOT NULL,
  user_id uuid NOT NULL,
  first_viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  last_viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT library_views_pkey PRIMARY KEY (material_id, user_id),
  CONSTRAINT library_views_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.library_materials(id),
  CONSTRAINT library_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.academic_terms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid,
  name text NOT NULL CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 80),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT academic_terms_pkey PRIMARY KEY (id),
  CONSTRAINT academic_terms_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.courses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid,
  code text NOT NULL CHECK (char_length(btrim(code)) >= 1 AND char_length(btrim(code)) <= 20),
  title text NOT NULL CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 120),
  description text NOT NULL DEFAULT ''::text CHECK (char_length(description) <= 2000),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT courses_pkey PRIMARY KEY (id),
  CONSTRAINT courses_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.course_skills (
  course_id uuid NOT NULL,
  skill_id text NOT NULL,
  source text NOT NULL DEFAULT 'manual'::text CHECK (source = ANY (ARRAY['manual'::text, 'ai'::text])),
  added_by uuid,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT course_skills_pkey PRIMARY KEY (course_id, skill_id),
  CONSTRAINT course_skills_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT course_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.taylor_skills(id),
  CONSTRAINT course_skills_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id)
);
CREATE TABLE public.course_offerings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  term_id uuid NOT NULL,
  faculty_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  grading jsonb CHECK (grading IS NULL OR jsonb_typeof(grading) = 'object'::text),
  CONSTRAINT course_offerings_pkey PRIMARY KEY (id),
  CONSTRAINT course_offerings_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT course_offerings_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.academic_terms(id),
  CONSTRAINT course_offerings_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.users(id),
  CONSTRAINT course_offerings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.course_offering_sections (
  offering_id uuid NOT NULL,
  section_id uuid NOT NULL,
  CONSTRAINT course_offering_sections_pkey PRIMARY KEY (offering_id, section_id),
  CONSTRAINT course_offering_sections_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.course_offerings(id),
  CONSTRAINT course_offering_sections_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id)
);
CREATE TABLE public.course_requirements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['activity'::text, 'count'::text, 'skill'::text, 'manual'::text])),
  title text NOT NULL DEFAULT ''::text CHECK (char_length(title) <= 200),
  activity_type text CHECK (activity_type = ANY (ARRAY['scenario'::text, 'assessment'::text, 'case_presentation'::text, 'shift'::text])),
  scenario_id uuid,
  assessment_id uuid,
  presentation_id uuid,
  target_count integer CHECK (target_count >= 1 AND target_count <= 200),
  skill_id text,
  min_score numeric CHECK (min_score >= 0::numeric AND min_score <= 100::numeric),
  skills_only boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  manual_type text NOT NULL DEFAULT 'lab'::text,
  CONSTRAINT course_requirements_pkey PRIMARY KEY (id),
  CONSTRAINT course_requirements_presentation_id_fkey FOREIGN KEY (presentation_id) REFERENCES public.case_presentations(id),
  CONSTRAINT course_requirements_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.taylor_skills(id),
  CONSTRAINT course_requirements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT course_requirements_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.course_offerings(id),
  CONSTRAINT course_requirements_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id),
  CONSTRAINT course_requirements_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id)
);
CREATE TABLE public.course_requirement_checks (
  requirement_id uuid NOT NULL,
  student_id uuid NOT NULL,
  checked_by uuid,
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT ''::text CHECK (char_length(note) <= 500),
  CONSTRAINT course_requirement_checks_pkey PRIMARY KEY (requirement_id, student_id),
  CONSTRAINT course_requirement_checks_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES public.course_requirements(id),
  CONSTRAINT course_requirement_checks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT course_requirement_checks_checked_by_fkey FOREIGN KEY (checked_by) REFERENCES public.users(id)
);
CREATE TABLE public.course_requirement_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL,
  student_id uuid NOT NULL,
  score numeric NOT NULL CHECK (score >= 0::numeric AND score <= 100::numeric),
  note text NOT NULL DEFAULT ''::text CHECK (char_length(note) <= 500),
  entered_by uuid,
  entered_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT course_requirement_scores_pkey PRIMARY KEY (id),
  CONSTRAINT course_requirement_scores_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES public.course_requirements(id),
  CONSTRAINT course_requirement_scores_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT course_requirement_scores_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES public.users(id)
);
CREATE TABLE public.patient_courses (
  patient_id uuid NOT NULL,
  course_id uuid NOT NULL,
  added_by uuid,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT patient_courses_pkey PRIMARY KEY (patient_id, course_id),
  CONSTRAINT patient_courses_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT patient_courses_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT patient_courses_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id)
);
CREATE TABLE public.offering_skills (
  offering_id uuid NOT NULL,
  skill_id text NOT NULL,
  source text NOT NULL DEFAULT 'manual'::text CHECK (source = ANY (ARRAY['manual'::text, 'ai'::text])),
  added_by uuid,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT offering_skills_pkey PRIMARY KEY (offering_id, skill_id),
  CONSTRAINT offering_skills_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.course_offerings(id),
  CONSTRAINT offering_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.taylor_skills(id),
  CONSTRAINT offering_skills_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id)
);
CREATE TABLE public.course_offering_students (
  offering_id uuid NOT NULL,
  student_id uuid NOT NULL,
  added_by uuid,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT course_offering_students_pkey PRIMARY KEY (offering_id, student_id),
  CONSTRAINT course_offering_students_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.course_offerings(id),
  CONSTRAINT course_offering_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT course_offering_students_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id)
);
CREATE TABLE public.activity_excuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  activity_kind text NOT NULL CHECK (activity_kind = ANY (ARRAY['scenario'::text, 'assessment'::text, 'case_presentation'::text])),
  activity_id uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) >= 1 AND char_length(btrim(reason)) <= 300),
  excused_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT activity_excuses_pkey PRIMARY KEY (id),
  CONSTRAINT activity_excuses_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT activity_excuses_excused_by_fkey FOREIGN KEY (excused_by) REFERENCES public.users(id)
);
CREATE TABLE public.push_tokens (
  token text NOT NULL,
  user_id uuid NOT NULL,
  platform text NOT NULL DEFAULT 'android'::text CHECK (platform = ANY (ARRAY['android'::text, 'ios'::text])),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_pkey PRIMARY KEY (token),
  CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
