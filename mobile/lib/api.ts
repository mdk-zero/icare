/**
 * iCARE++ mobile API layer (Phase 5.1/5.2): typed fetchers against the web
 * app's API routes, replacing the original mock dataset. Reads go through
 * the offline cache; clinical writes (vitals, EHR) fall back to the outbox
 * when the network is unreachable.
 */

import {
  api,
  cachedGet,
  CachedResult,
  clearCache,
  clearToken,
  enqueueWrite,
  isNetworkError,
  setToken,
} from './client';
import { evaluateVitals, VitalSignsInput, AnomalyReason } from './vitals-rules';

// ---------------------------------------------------------------
// Auth (5.1)
// ---------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'faculty' | 'admin';
  picture_url?: string | null;
  force_password_change?: boolean;
  cohort?: string;
  studentId?: string;
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

export type GoogleLoginResult = { user: User } | { needsRoleSelection: true };

/**
 * Same `/api/auth/google` endpoint the web app uses: exchanges a verified
 * Google ID token for a session. A brand-new Google account with no matching
 * iCARE++ user comes back as `needsRoleSelection` — self-registration via
 * Google is web-only (faculty/admin), so the mobile UI just surfaces that.
 */
export async function loginWithGoogle(idToken: string, rememberMe: boolean = true): Promise<GoogleLoginResult> {
  const result = await api<{ user?: User; sessionToken?: string; needsRoleSelection?: boolean }>(
    '/api/auth/google',
    {
      method: 'POST',
      body: { id_token: idToken },
      auth: false,
    },
  );
  if (result.needsRoleSelection || !result.user || !result.sessionToken) {
    return { needsRoleSelection: true };
  }
  await clearCache();
  await setToken(result.sessionToken, rememberMe);
  return { user: result.user };
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

/** Consumes the code and sets the new password. */
export async function resetPassword(
  email: string,
  otp: string,
  newPassword: string,
): Promise<{ message: string }> {
  return api('/api/auth/forgot-password/verify', {
    method: 'POST',
    body: { email, otp, newPassword },
    auth: false,
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
// Vitals (5.2 + 5.3 outbox + 5.5 anomaly UX)
// ---------------------------------------------------------------

export interface VitalReading {
  id: string;
  patient_id: string;
  recorded_at: string;
  heart_rate: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature_c: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  pain_score: number | null;
  notes: string | null;
  is_anomaly: boolean;
  anomaly_reasons: AnomalyReason[];
  patients?: { name: string; room_number: string | null } | null;
}

export async function fetchMyVitals(patientId?: string): Promise<CachedResult<VitalReading[]>> {
  const path = patientId
    ? `/api/student/vitals?patient_id=${encodeURIComponent(patientId)}`
    : '/api/student/vitals';
  const result = await cachedGet<{ readings: VitalReading[] }>(path);
  return { ...result, data: result.data.readings ?? [] };
}

export interface VitalSubmission extends VitalSignsInput {
  patient_id: string;
  notes?: string;
}

export interface VitalSubmitResult {
  queued: boolean;
  /** Server evaluation when online, local rule evaluation when queued. */
  is_anomaly: boolean;
  anomaly_reasons: AnomalyReason[];
}

export async function submitVitalReading(input: VitalSubmission): Promise<VitalSubmitResult> {
  try {
    const result = await api<{ reading: VitalReading }>('/api/student/vitals', {
      method: 'POST',
      body: input,
    });
    return {
      queued: false,
      is_anomaly: result.reading.is_anomaly,
      anomaly_reasons: result.reading.anomaly_reasons ?? [],
    };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    // Offline: queue the write and flag with the same rule thresholds the
    // server applies (Phase 5.5), so feedback works with no connection.
    await enqueueWrite({
      label: 'Vital signs entry',
      path: '/api/student/vitals',
      method: 'POST',
      body: input,
    });
    const local = evaluateVitals(input);
    return { queued: true, is_anomaly: local.is_anomaly, anomaly_reasons: local.reasons };
  }
}

// ---------------------------------------------------------------
// Quizzes (5.2: list/take)
// ---------------------------------------------------------------

export interface StudentAssessment {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
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
}

export async function fetchScenarioAssignments(): Promise<CachedResult<ScenarioAssignment[]>> {
  const result = await cachedGet<{ assignments: ScenarioAssignment[] }>('/api/student/scenarios');
  return { ...result, data: result.data.assignments ?? [] };
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
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

export async function completeScenarioAssignment(
  assignmentId: string,
  score: number,
  timeTakenSeconds: number,
): Promise<ScenarioAssignment> {
  const result = await api<{ assignment: ScenarioAssignment }>(
    `/api/student/scenarios/${assignmentId}/complete`,
    { method: 'POST', body: { score, time_taken: timeTakenSeconds } },
  );
  return result.assignment;
}

// ---------------------------------------------------------------
// EHR (5.2 + 5.3 outbox)
// ---------------------------------------------------------------

export type EhrType = 'tpr' | 'ivf' | 'note';

export interface EhrRecord {
  id: string;
  patient_id: string;
  created_at: string;
  // tpr
  shift?: string | null;
  temperature_c?: number | null;
  pulse?: number | null;
  respiration?: number | null;
  remarks?: string | null;
  // ivf
  solution?: string;
  volume_ml?: number | null;
  rate_ml_hr?: number | null;
  site?: string | null;
  status?: 'ongoing' | 'completed' | 'discontinued';
  ended_at?: string | null;
  // note
  content?: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  patients?: { name: string; room_number: string | null } | null;
}

export async function fetchEhrRecords(
  type: EhrType,
  patientId?: string,
): Promise<CachedResult<EhrRecord[]>> {
  const path = patientId
    ? `/api/student/ehr?type=${type}&patient_id=${encodeURIComponent(patientId)}`
    : `/api/student/ehr?type=${type}`;
  const result = await cachedGet<{ records: EhrRecord[] }>(path);
  return { ...result, data: result.data.records ?? [] };
}

export interface EhrSubmitResult {
  queued: boolean;
  record: EhrRecord | null;
}

export async function createEhrRecord(
  type: EhrType,
  patientId: string,
  fields: Record<string, unknown>,
): Promise<EhrSubmitResult> {
  const body = { type, patient_id: patientId, ...fields };
  try {
    const result = await api<{ record: EhrRecord }>('/api/student/ehr', {
      method: 'POST',
      body,
    });
    return { queued: false, record: result.record };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const labels: Record<EhrType, string> = {
      tpr: 'TPR entry',
      ivf: 'IVF record',
      note: 'Progress note',
    };
    await enqueueWrite({
      label: labels[type],
      path: '/api/student/ehr',
      method: 'POST',
      body,
    });
    return { queued: true, record: null };
  }
}

export async function updateIvfStatus(
  id: string,
  status: 'completed' | 'discontinued',
): Promise<EhrRecord> {
  const result = await api<{ record: EhrRecord }>('/api/student/ehr', {
    method: 'PATCH',
    body: { id, status },
  });
  return result.record;
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
    difficulty: 'beginner' | 'intermediate' | 'advanced';
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
