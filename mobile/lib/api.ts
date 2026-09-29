/**
 * iCARE++ mobile API layer (Phase 5.1/5.2): typed fetchers against the web
 * app's API routes, replacing the original mock dataset. Reads go through
 * the offline cache; clinical writes (vitals, EHR) fall back to the outbox
 * when the network is unreachable.
 */

import {
  api,
  ApiError,
  apiUpload,
  cachedGet,
  CachedResult,
  clearCache,
  clearToken,
  enqueueWrite,
  isNetworkError,
  duringTokenSwap,
  replaceToken,
  setToken,
} from './client';
import type { AnomalyReason } from './vitals-rules';
import type { TaskRating } from './task-ratings';

// ---------------------------------------------------------------
// Auth (5.1)
// ---------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'faculty' | 'admin' | 'super_admin';
  /** Null when unrecorded — faculty/admin set it on the roster (migration 032). */
  sex?: 'male' | 'female' | null;
  picture_url?: string | null;
  has_password?: boolean;
  /** A Google account is connected, so "Continue with Google" signs in too. */
  google_linked?: boolean;
  force_password_change?: boolean;
  /** Section name from `/api/auth/session`; null when unassigned. */
  section?: string | null;
}

export async function login(email: string, password: string, rememberMe: boolean = true): Promise<User> {
  const result = await api<{ user: User; sessionToken: string }>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  // Cached GETs are keyed by path only, not by user — drop any reads left
  // over from a previous account on this device before adopting this one.
  await clearCache();
  await setToken(result.sessionToken, rememberMe);
  return result.user;
}

export type GoogleLoginResult = { user: User } | { needsAccount: true; onboardingToken: string };

/**
 * Same `/api/auth/google` endpoint the web app uses: exchanges a verified
 * Google ID token for a session. A Google account with no iCARE++ user comes
 * back as `needsAccount` with a signed token that opens the web contact form
 * with that Google email filled in — accounts are requested, not self-made.
 */
export async function loginWithGoogle(idToken: string, rememberMe: boolean = true): Promise<GoogleLoginResult> {
  let result: { user?: User; sessionToken?: string };
  try {
    result = await api<{ user?: User; sessionToken?: string }>('/api/auth/google', {
      method: 'POST',
      body: { id_token: idToken },
      auth: false,
    });
  } catch (err) {
    const body = err instanceof ApiError ? (err.body as { code?: unknown; onboarding_token?: unknown } | null) : null;
    if (body?.code === 'no_account' && typeof body.onboarding_token === 'string') {
      return { needsAccount: true, onboardingToken: body.onboarding_token };
    }
    throw err;
  }
  if (!result.user || !result.sessionToken) {
    throw new Error('Google sign-in failed.');
  }
  await clearCache();
  await setToken(result.sessionToken, rememberMe);
  return { user: result.user };
}

/** Profile "Connect to Google": links the Google account behind this ID token. */
export async function connectGoogle(idToken: string): Promise<User> {
  const result = await api<{ user: User }>('/api/users/google', {
    method: 'POST',
    body: { id_token: idToken },
  });
  return result.user;
}

/** The server refuses when there's no password to fall back on. */
export async function disconnectGoogle(): Promise<User> {
  const result = await api<{ user: User }>('/api/users/google', { method: 'DELETE' });
  return result.user;
}

export async function logout(): Promise<void> {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // best effort; the bearer token is what actually matters
  }
  await clearToken();
  await clearCache();
}

/** Validates the stored token against the server. null = not signed in. */
export async function fetchSession(): Promise<User | null> {
  const result = await api<{ user: User | null }>('/api/auth/session');
  return result.user;
}

// ---------------------------------------------------------------
// Forgot password (email OTP, shared with the web app's flow)
// ---------------------------------------------------------------

/** Sends a reset-code email. Always resolves — server hides whether the account exists. */
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return api('/api/auth/forgot-password/request', {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

/** Verifies a 6-digit code without consuming it — the code stays valid for the reset step. */
export async function checkPasswordResetCode(email: string, otp: string): Promise<{ message: string }> {
  return api('/api/auth/forgot-password/check-code', {
    method: 'POST',
    body: { email, otp },
    auth: false,
  });
}

/**
 * Consumes the code and sets the new password. The reset signs out every
 * session; when this device is signed in to the same account, the server
 * sends a fresh token back so it stays signed in.
 */
export async function resetPassword(
  email: string,
  otp: string,
  newPassword: string,
): Promise<{ message: string }> {
  return duringTokenSwap(async () => {
    const result = await api<{ message: string; sessionToken?: string }>(
      '/api/auth/forgot-password/verify',
      { method: 'POST', body: { email, otp, newPassword } },
    );
    if (result.sessionToken) await replaceToken(result.sessionToken);
    return { message: result.message };
  });
}

// ---------------------------------------------------------------
// Patients
// ---------------------------------------------------------------

export interface Patient {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
  room_number: string | null;
  diagnosis: string | null;
  admission_date: string | null;
  medical_history: string | null;
  vital_signs: Record<string, unknown>;
  mimic_id: string;
}

export async function fetchPatients(): Promise<CachedResult<Patient[]>> {
  const result = await cachedGet<{ patients: Patient[] }>('/api/patients');
  return { ...result, data: result.data.patients ?? [] };
}

// ---------------------------------------------------------------
// Ward ("Clinic" tab: the admin's floor plan, its beds, and my assignments)
// ---------------------------------------------------------------

/** A room as the admin placed it. plan_* are null when it is not on the plan. */
export interface WardRoom {
  id: string;
  name: string;
  room_number: string;
  capacity: number;
  status: 'active' | 'inactive' | 'maintenance';
  plan_x: number | null;
  plan_y: number | null;
  plan_w: number | null;
  plan_h: number | null;
  /** The wall the Dean put the door in; null reads as the bottom wall (and before migration 062). */
  plan_door?: DoorSide | null;
  /** Admitted patients in the room — what `capacity` gates. */
  occupied: number;
  /** True when one of this student's scenario patients is in this room. */
  has_assignment: boolean;
}

export type DoorSide = 'n' | 'e' | 's' | 'w';

export type WardFixtureKind =
  | 'corridor'
  | 'nurse_station'
  | 'stairs'
  | 'elevator'
  | 'restroom'
  | 'storage'
  | 'label';

/** Anything on the floor plan that is not a room: corridors, the nurse station… */
export interface WardFixture {
  id: string;
  kind: WardFixtureKind;
  label: string;
  plan_x: number;
  plan_y: number;
  plan_w: number;
  plan_h: number;
}

export interface WardVitals {
  recorded_at: string;
  heart_rate: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature_c: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  is_anomaly: boolean;
  anomaly_reasons: AnomalyReason[];
}

export interface WardPatient {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
  room_id: string | null;
  room_number: string | null;
  /** Only an assigned patient shows its scenario brief and checklist. */
  is_assigned: boolean;
  /** Withheld by the server for patients this student is not assigned to. */
  diagnosis?: string | null;
  latest_vitals?: WardVitals | null;
}

export interface WardAssignment {
  id: string;
  scenario_id: string;
  scenario_title: string;
  description: string | null;
  category: string | null;
  learning_objectives: string[] | null;
  patient_id: string | null;
  assigned_at: string;
  deadline: string | null;
  status: ScenarioAssignment['status'];
  required: boolean;
  score: number | null;
  submitted_at: string | null;
  completed_at: string | null;
  tasks_done: number;
  tasks_total: number;
}

export interface WardResult {
  rooms: WardRoom[];
  fixtures: WardFixture[];
  patients: WardPatient[];
  assignments: WardAssignment[];
}

/** The whole Clinic tab in one cached read — plan, beds and assignments. */
export async function fetchWard(): Promise<CachedResult<WardResult>> {
  const result = await cachedGet<WardResult>('/api/student/ward');
  return {
    ...result,
    data: {
      rooms: result.data.rooms ?? [],
      // Absent from an older server or a cached read from before it.
      fixtures: result.data.fixtures ?? [],
      patients: result.data.patients ?? [],
      assignments: result.data.assignments ?? [],
    },
  };
}

// ---------------------------------------------------------------
// Quizzes (5.2: list/take)
// ---------------------------------------------------------------

export interface StudentAssessment {
  id: string;
  title: string;
  description: string;
  category: string;
  time_limit_seconds: number | null;
  question_count: number;
  assignment: {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'overdue';
    deadline: string | null;
    required: boolean;
  } | null;
  best_score: number | null;
  attempt_count: number;
  last_submitted_at: string | null;
  /** Tries allowed; null is unlimited. */
  max_attempts: number | null;
  /** Attempts that have run their course — submitted or expired. */
  attempts_used: number;
  /** null when unlimited; 0 means the quiz can no longer be started. */
  attempts_remaining: number | null;
}

export async function fetchAssessments(): Promise<CachedResult<StudentAssessment[]>> {
  const result = await cachedGet<{ assessments: StudentAssessment[] }>('/api/student/assessments');
  return { ...result, data: result.data.assessments ?? [] };
}

export interface AttemptQuestion {
  id: string;
  position: number;
  content: string;
  options: string[];
}

export interface StartedAttempt {
  attempt: { id: string; started_at: string };
  assessment: { id: string; title: string; time_limit_seconds: number | null };
  questions: AttemptQuestion[];
  /** True when an unfinished attempt was handed back rather than a new one dealt. */
  resumed?: boolean;
  attempt_number?: number;
  max_attempts?: number | null;
  attempts_remaining?: number | null;
}

export async function startAttempt(assessmentId: string): Promise<StartedAttempt> {
  return api<StartedAttempt>(`/api/student/assessments/${assessmentId}/attempts`, {
    method: 'POST',
  });
}

export interface AttemptResult {
  score: number;
  correct: number;
  total: number;
  time_taken_seconds: number;
  /** Submitted after the time limit: still graded and counted, but flagged to faculty. */
  late?: boolean;
  results: {
    question_id: string;
    selected_index: number | null;
    correct_index: number;
    is_correct: boolean;
    explanation: string;
  }[];
}

export async function submitAttempt(
  attemptId: string,
  answers: { question_id: string; selected_index: number | null; time_spent_seconds?: number }[],
): Promise<AttemptResult> {
  return api<AttemptResult>(`/api/student/attempts/${attemptId}/submit`, {
    method: 'POST',
    body: { answers },
  });
}

// ---------------------------------------------------------------
// Scenario assignments ("Tasks" tab)
// ---------------------------------------------------------------

export interface ScenarioAssignment {
  id: string;
  scenario_id: string;
  scenario_title: string;
  patient_id: string | null;
  assigned_at: string;
  deadline: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  required: boolean;
  score: number | null;
  completed_at: string | null;
  time_taken: number | null;
  /** The student's team, when faculty have put them in one. */
  team_name?: string | null;
}

export async function fetchScenarioAssignments(): Promise<CachedResult<ScenarioAssignment[]>> {
  const result = await cachedGet<{ assignments: ScenarioAssignment[] }>('/api/student/scenarios');
  return { ...result, data: result.data.assignments ?? [] };
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: string;
  patient_id: string | null;
  patient_case: Record<string, unknown>;
  learning_objectives: string[];
  created_at: string;
}

export async function fetchScenario(id: string): Promise<CachedResult<Scenario>> {
  const result = await cachedGet<{ scenario: Scenario }>(`/api/scenarios/${id}`);
  return { ...result, data: result.data.scenario };
}

export interface ScenarioTask {
  id: string;
  title: string;
  description: string;
  category: 'assessment' | 'intervention' | 'medication' | 'communication' | 'documentation';
  points: number;
  verification: 'system' | 'faculty';
  system_trigger: 'vitals' | 'charting' | null;
  sort_order: number;
  is_completed: boolean;
  completed_via: 'system' | 'faculty' | null;
  completed_at: string | null;
  /** Instructor's verbal rating and note — sent only once the scenario is finalized. */
  rating?: TaskRating | null;
  remarks?: string | null;
  /** The share of this task's points earned (0–100), sent with the rating. */
  percent?: number | null;
}

export interface ScenarioTasksResult {
  tasks: ScenarioTask[];
  assignment: {
    id: string;
    status: ScenarioAssignment['status'];
    submitted_at: string | null;
    completed_at: string | null;
    score: number | null;
    time_taken: number | null;
    /**
     * When the student started the case (null: not yet). Absent while the
     * server's database has no clock (before migration 063).
     */
    started_at?: string | null;
  };
}

/** Tasks for a scenario plus their completion state on this student's assignment. */
export async function fetchScenarioTasks(
  assignmentId: string,
): Promise<CachedResult<ScenarioTasksResult>> {
  return cachedGet<ScenarioTasksResult>(`/api/student/scenarios/${assignmentId}/tasks`);
}

/**
 * The student is ready: start the patient case's clock. It runs until the
 * instructor grades the last task; starting again keeps the first start.
 */
export async function startScenarioAssignment(
  assignmentId: string,
): Promise<{ started_at: string | null; timing: boolean }> {
  return api<{ started_at: string | null; timing: boolean }>(
    `/api/student/scenarios/${assignmentId}/start`,
    { method: 'POST' },
  );
}

/**
 * Hand the assignment in for faculty review. Faculty rate each task and
 * finalize the score.
 */
export async function submitScenarioAssignment(
  assignmentId: string,
  timeTakenSeconds: number,
): Promise<ScenarioAssignment> {
  const result = await api<{ assignment: ScenarioAssignment }>(
    `/api/student/scenarios/${assignmentId}/submit`,
    { method: 'POST', body: { time_taken: timeTakenSeconds } },
  );
  return result.assignment;
}

// ---------------------------------------------------------------
// AI study tips (LLM, generated from the student's open scenarios)
// ---------------------------------------------------------------

export interface AiTip {
  title: string;
  tip: string;
  /** The open scenario this tip is about, or null when it spans several. */
  scenario_title: string | null;
}

export interface AiTipsResult {
  tips: AiTip[];
  generated_at: string | null;
  /** True when generation failed and the server fell back to older tips. */
  stale?: boolean;
}

/**
 * Tips are generated server-side and cached there against the student's
 * assignment state, so calling this on every mount costs a row read, not an
 * LLM call, until the assignments actually change.
 */
export async function fetchAiTips(): Promise<CachedResult<AiTipsResult>> {
  const result = await cachedGet<AiTipsResult>('/api/student/tips');
  return { ...result, data: { ...result.data, tips: result.data.tips ?? [] } };
}

// ---------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------

export interface AppNotification {
  id: string;
  type:
    | 'assignment_created'
    | 'deadline_reminder'
    | 'at_risk_flag'
    | 'vitals_anomaly'
    | 'performance_validated'
    | 'assistance_request'
    | 'system';
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export async function fetchNotifications(): Promise<
  CachedResult<{ notifications: AppNotification[]; unread: number }>
> {
  return cachedGet<{ notifications: AppNotification[]; unread: number }>('/api/notifications');
}

export async function markNotificationRead(id: string): Promise<void> {
  await api('/api/notifications', { method: 'PATCH', body: { id } });
}

export async function markAllNotificationsRead(): Promise<void> {
  await api('/api/notifications', { method: 'PATCH', body: { all: true } });
}

// ---------------------------------------------------------------
// Recommendations (ML service output, Phase 3)
// ---------------------------------------------------------------

export interface Recommendation {
  id: string;
  assessment_id: string;
  rank: number;
  reason: string;
  created_at: string;
  assessments: {
    id: string;
    title: string;
    description: string;
    category: string;
  } | null;
  competency_areas: { name: string } | null;
}

export async function fetchRecommendations(): Promise<CachedResult<Recommendation[]>> {
  const result = await cachedGet<{ recommendations: Recommendation[] }>(
    '/api/student/recommendations',
  );
  return { ...result, data: result.data.recommendations ?? [] };
}

export async function dismissRecommendation(id: string): Promise<void> {
  await api('/api/student/recommendations', { method: 'PATCH', body: { id } });
}

// ---------------------------------------------------------------
// Progress
// ---------------------------------------------------------------

export interface ProgressAttempt {
  id: string;
  /** The quiz taken; retakes share it. Absent from a server or cached read from before it was sent. */
  assessment_id?: string | null;
  score: number | null;
  submitted_at: string;
  time_taken_seconds: number | null;
  assessments: { title: string; category: string } | null;
}

export interface CompetencyScoreRecord {
  id: string;
  competency_id: string;
  score: number;
  source: string;
  remarks: string | null;
  created_at: string;
  competency_areas: { name: string } | null;
}

export interface Progress {
  attempts: ProgressAttempt[];
  competency_scores: CompetencyScoreRecord[];
}

export async function fetchProgress(): Promise<CachedResult<Progress>> {
  return cachedGet<Progress>('/api/student/progress');
}

// ---------------------------------------------------------------
// Assistance requests (ERD entity; raises the faculty help flag)
// ---------------------------------------------------------------

export interface AssistanceRequest {
  id: string;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  created_at: string;
  resolved_at?: string | null;
  patient_id: string | null;
  room_id: string | null;
  patients?: { name: string; room_number: string | null } | null;
}

export async function fetchAssistanceRequests(): Promise<CachedResult<AssistanceRequest[]>> {
  const result = await cachedGet<{ requests: AssistanceRequest[] }>('/api/student/assistance');
  return { ...result, data: result.data.requests ?? [] };
}

/**
 * Queues offline like the other clinical writes — a student who cannot reach
 * the server is exactly the one who may need help, so the call is kept rather
 * than dropped.
 */
export async function requestAssistance(
  message: string,
  patientId?: string | null,
): Promise<{ queued: boolean; request: AssistanceRequest | null }> {
  const body = { message, patient_id: patientId ?? null };
  try {
    const result = await api<{ request: AssistanceRequest }>('/api/student/assistance', {
      method: 'POST',
      body,
    });
    return { queued: false, request: result.request };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await enqueueWrite({
      label: 'Assistance request',
      path: '/api/student/assistance',
      method: 'POST',
      body,
    });
    return { queued: true, request: null };
  }
}

export async function resolveAssistanceRequest(id: string): Promise<void> {
  await api('/api/student/assistance', { method: 'PATCH', body: { id, status: 'resolved' } });
}

// ---------------------------------------------------------------
// Profile
// ---------------------------------------------------------------

export async function updateProfile(name: string): Promise<User> {
  const result = await api<{ user: User }>('/api/users/profile', {
    method: 'PATCH',
    body: { name },
  });
  return result.user;
}

/**
 * First-login password change for accounts an admin provisioned with a
 * temporary password. The server skips OTP verification while
 * `force_password_change` is set, so this is a single call. Voluntary changes
 * reuse the emailed-code reset flow above
 * ({@link requestPasswordReset} / {@link checkPasswordResetCode} / {@link resetPassword}).
 */
export async function completeForcedPasswordChange(
  newPassword: string,
): Promise<{ success: boolean }> {
  const result = await api<{ success: boolean; sessionToken?: string }>('/api/users/change-password', {
    method: 'POST',
    body: { newPassword },
  });
  // The change signs out every older token, this device's included.
  if (result.sessionToken) await replaceToken(result.sessionToken);
  return { success: result.success };
}

/**
 * Uploaded avatars are stored as a bucket path rather than a URL, so they only
 * become loadable after being exchanged for a signed URL. Google pictures are
 * already absolute and pass straight through.
 */
/**
 * Uploads a local image as the signed-in user's avatar and returns the stored
 * bucket path — feed it to `resolveAvatarUrl()` to display it.
 *
 * Deliberately not queued to the offline outbox: that queue replays JSON
 * bodies, and a cache file URI it replayed days later may well be gone.
 */
export async function uploadAvatar(uri: string): Promise<string> {
  const form = new FormData();
  // React Native's FormData takes a file as this {uri,name,type} shape; the
  // DOM typings only know about Blob, hence the cast.
  form.append('avatar', { uri, name: 'avatar.jpg', type: 'image/jpeg' } as unknown as Blob);
  const result = await apiUpload<{ path: string }>('/api/users/avatar', form);
  return result.path;
}

export async function resolveAvatarUrl(pictureUrl: string | null | undefined): Promise<string | null> {
  if (!pictureUrl) return null;
  if (!pictureUrl.startsWith('avatars/')) return pictureUrl;
  try {
    const result = await api<{ signedUrl: string }>(
      `/api/users/avatar-url?path=${encodeURIComponent(pictureUrl)}`,
    );
    return result.signedUrl ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------
// Reflections and goals (after a scenario is finalized or a skill
// assessment is scored). Mirrors web/app/lib/reflections.ts.
// ---------------------------------------------------------------

export type ReflectionSource = 'scenario' | 'assessment';

export interface GradedItem {
  title: string;
  skill_id: string | null;
  score: number;
  level: string;
  remarks: string | null;
}

export interface ReflectionFeedback {
  summary: string;
  strengths: { skill_id: string | null; note: string }[];
  improvements: { skill_id: string | null; note: string }[];
  suggested_goals: string[];
  source: 'ai' | 'rules';
}

export interface StudentGoal {
  id: string;
  text: string;
  skill_id: string | null;
  status: 'open' | 'met';
  created_at: string;
  met_at: string | null;
}

export interface ReflectionState {
  enabled: boolean;
  work: { title: string; score: number | null; graded_at: string | null; items: GradedItem[] };
  reflection: { text: string; updated_at: string } | null;
  goals: StudentGoal[];
  feedback: ReflectionFeedback | null;
  feedback_stale: boolean;
}

export async function fetchReflection(source: ReflectionSource, sourceId: string): Promise<ReflectionState> {
  return api<ReflectionState>(`/api/student/reflections?source_type=${source}&source_id=${encodeURIComponent(sourceId)}`);
}

export async function requestReflectionFeedback(source: ReflectionSource, sourceId: string): Promise<ReflectionFeedback> {
  const res = await api<{ feedback: ReflectionFeedback }>('/api/student/reflections/feedback', {
    method: 'POST',
    body: { source_type: source, source_id: sourceId },
  });
  return res.feedback;
}

export async function saveReflection(
  source: ReflectionSource,
  sourceId: string,
  reflection: string,
  goals: { text: string; skill_id: string | null }[],
): Promise<void> {
  await api('/api/student/reflections', {
    method: 'POST',
    body: { source_type: source, source_id: sourceId, reflection, goals },
  });
}

export async function fetchGoals(): Promise<StudentGoal[]> {
  const res = await api<{ goals: StudentGoal[] }>('/api/student/goals');
  return res.goals ?? [];
}

export async function setGoalStatus(goalId: string, status: 'open' | 'met'): Promise<void> {
  await api(`/api/student/goals/${goalId}`, { method: 'PATCH', body: { status } });
}

// ---------------------------------------------------------------
// Hospital case presentations (write up a real duty patient, initials only)
// ---------------------------------------------------------------

export type CaseStatus = 'not_started' | 'draft' | 'submitted' | 'graded';

export interface CaseVitalsEntry {
  heart_rate: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature_c: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  pain_score: number | null;
  notes: string;
  observed_at: string | null;
}

export interface CaseTprEntry {
  temperature_c: number | null;
  pulse: number | null;
  respiration: number | null;
  remarks: string;
  observed_at: string | null;
}

export interface CaseIvfEntry {
  solution: string;
  volume_ml: number | null;
  rate_ml_hr: number | null;
  site: string;
  remarks: string;
  observed_at: string | null;
}

export interface CaseObservations {
  vitals: CaseVitalsEntry[];
  tpr: CaseTprEntry[];
  ivf: CaseIvfEntry[];
}

export interface CasePresentationInfo {
  id: string;
  title: string;
  instructions: string;
  deadline: string | null;
}

export interface CaseListItem {
  id: string;
  status: CaseStatus;
  patient_initials: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  score: number | null;
  updated_at: string;
  late: boolean;
  presentation: CasePresentationInfo;
}

/** The fields a student edits; the server whitelists exactly these. */
export interface CaseDraft {
  patient_initials: string | null;
  age: number | null;
  sex: 'male' | 'female' | null;
  hospital: string;
  ward: string;
  admitting_diagnosis: string;
  chief_complaint: string;
  history: string;
  medications: string;
  nursing_diagnoses: string;
  interventions: string;
  observations: CaseObservations;
}

export interface CaseDetail extends CaseDraft {
  id: string;
  status: CaseStatus;
  submitted_at: string | null;
  graded_at: string | null;
  score: number | null;
  remarks: string;
  late: boolean;
  updated_at: string;
  presentation: CasePresentationInfo;
  ratings: { criterion: string; rating: TaskRating; remarks: string }[];
  criteria: { key: string; label: string; description: string }[];
}

export async function fetchMyCases(): Promise<CachedResult<CaseListItem[]>> {
  const result = await cachedGet<{ cases: CaseListItem[] }>('/api/student/cases');
  return { ...result, data: result.data.cases ?? [] };
}

export async function fetchCase(id: string): Promise<CachedResult<CaseDetail>> {
  const result = await cachedGet<{ case: CaseDetail }>(`/api/student/cases/${id}`);
  return { ...result, data: result.data.case };
}

/** Saves the draft; not queued offline, since a later edit would race it. */
export async function saveCaseDraft(id: string, patch: Partial<CaseDraft>): Promise<CaseDetail> {
  const result = await api<{ case: CaseDetail }>(`/api/student/cases/${id}`, { method: 'PATCH', body: patch });
  return result.case;
}

export async function submitCase(id: string): Promise<void> {
  await api(`/api/student/cases/${id}/submit`, { method: 'POST' });
}

// ---------------------------------------------------------------
// Library: study materials instructors publish per Taylor's skill
// ---------------------------------------------------------------

export type LibraryKind = 'video' | 'note' | 'pdf' | 'slides' | 'link';

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  title: string;
  description: string;
  youtube_id: string | null;
  file_name: string | null;
  url: string | null;
  published_at: string | null;
  author_name: string;
  seen: boolean;
}

export interface LibraryChapter {
  chapter: number;
  area: string;
  skills: { id: string; title: string; materials: LibraryItem[] }[];
}

export interface Library {
  chapters: LibraryChapter[];
  total: number;
  unseen: number;
}

export interface LibraryMaterialDetail {
  material: {
    id: string;
    skill_id: string;
    kind: LibraryKind;
    title: string;
    description: string;
    youtube_id: string | null;
    body_md: string | null;
    url: string | null;
    file_name: string | null;
    file_size: number | null;
    published_at: string | null;
    author_name: string;
  };
  skill: {
    id: string;
    label: string;
    area: string;
    goal: string;
    /** The skill's checklist, word for word. */
    steps: { stepNo: number; section: string | null; text: string }[];
  } | null;
  /** direct: a 10-minute signed link to the file; embed: a viewer page for it. */
  file: { direct: string; embed: string } | null;
}

export async function fetchLibrary(): Promise<CachedResult<Library>> {
  return cachedGet<Library>('/api/student/library');
}

/** Opening a material records that the student has seen it. */
export async function fetchLibraryMaterial(id: string): Promise<LibraryMaterialDetail> {
  return api<LibraryMaterialDetail>(`/api/student/library/${encodeURIComponent(id)}`);
}
