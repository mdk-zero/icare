import type { MlEvent } from './ml';
import { NDJSON, readNdjson } from './ndjson';
import { cachedFetch, clearRequestCache } from './request-cache';
import type { AttendanceTally, ShiftAttendanceStatus } from './shifts';
import { resolveRubric, type Rubric, type TaskRating } from './task-ratings';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'faculty' | 'admin';
  picture_url?: string | null;
  /** Null when unrecorded; the dashboard greeting drops the honorific then. */
  sex?: 'male' | 'female' | null;
  has_password?: boolean;
  force_password_change?: boolean;
}

const USER_STORAGE_KEY = 'icare_user';
const TOKEN_STORAGE_KEY = 'icare_token';
const SESSION_ENDPOINT = '/api/auth/session';

function mirrorToStorage(user: User | null) {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_STORAGE_KEY, 'logged_in');
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

/**
 * The session cookie expires after seven days; the localStorage flags the UI
 * gates on never expire by themselves. When they disagree the app renders the
 * full authenticated shell while every request behind it 401s, so a dead
 * session has to end the client session too.
 *
 * A full-page navigation rather than a router push, so every in-memory cache
 * and the notification EventSource are torn down with the document.
 */
let sessionExpiryHandled = false;

function handleSessionExpired() {
  if (typeof window === 'undefined' || sessionExpiryHandled) return;
  sessionExpiryHandled = true;
  mirrorToStorage(null);
  clearRequestCache();
  const next = window.location.pathname + window.location.search;
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * The one request that actually reaches the network. Session expiry is handled
 * here so it is handled in exactly one place; authentication endpoints are
 * exempt, because a 401 from /api/auth/login is a wrong password, not a dead
 * session.
 *
 * A successful write drops every cached read. Reads and writes share this
 * function, so there is no way to mutate something and leave a stale copy of it
 * behind.
 */
async function sendRequest(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { credentials: 'include', ...init });
  if (res.status === 401 && !input.startsWith('/api/auth/')) handleSessionExpired();
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && res.ok) clearRequestCache();
  return res;
}

/**
 * Every request in this module goes through here. GETs are served from the
 * in-memory response cache when one is warm, so returning to a page the user
 * has already opened costs no network round-trip.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return cachedFetch(input, init, sendRequest);
}

export interface Patient {
  id: string;
  subject_id?: number;
  hadm_id?: number;
  mimic_id?: string;
  name: string;
  age: number;
  gender: string;
  room_number: string;
  diagnosis: string;
  admission_date?: string;
  vital_signs: {
    heart_rate: number | null;
    blood_pressure: string | null;
    temperature: number | null;
    respiratory_rate: number | null;
    oxygen_saturation: number | null;
  };
  labs?: Record<string, string | number | null>;
  medical_history?: string | null;
  created_by: string;
  created_at: string;
}

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
  /** Tries allowed; null is unlimited. */
  max_attempts: number | null;
  /** Attempts that have run their course — submitted or expired. */
  attempts_used: number;
  /** null when unlimited; 0 means the quiz can no longer be started. */
  attempts_remaining: number | null;
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

export interface CriteriaBreakdown {
  criteria_id: string;
  criteria_name: string;
  weight: number;
  correct: number;
  total: number;
  score: number;
  weighted_score: number;
}

export interface AttemptResult {
  score: number;
  correct: number;
  total: number;
  time_taken_seconds: number;
  criteria_breakdown?: CriteriaBreakdown[];
  results: {
    question_id: string;
    selected_index: number | null;
    correct_index: number;
    is_correct: boolean;
    explanation: string;
  }[];
}

// Authentication Functions
export async function login(email: string, password: string): Promise<{ user: User; sessionToken: string } | null> {
  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const { user, sessionToken } = (await res.json()) as { user: User; sessionToken: string };
    mirrorToStorage(user);
    return { user, sessionToken };
  } catch (err) {
    console.error('login() failed', err);
    return null;
  }
}

export async function logout(): Promise<void> {
  mirrorToStorage(null);
  // Logout returns to /login through the router, so the document — and with it
  // every cached read of the outgoing user's data — survives. Drop it here
  // rather than relying on the request below, which may never land.
  clearRequestCache();
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('logout() failed', err);
  }
}

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem(USER_STORAGE_KEY);
  return userStr ? JSON.parse(userStr) : null;
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(TOKEN_STORAGE_KEY) === 'logged_in';
}

export async function refreshCurrentUser(): Promise<User | null> {
  try {
    const res = await apiFetch(SESSION_ENDPOINT, { credentials: 'include' });
    if (!res.ok) {
      mirrorToStorage(null);
      return null;
    }
    const { user } = (await res.json()) as { user: User | null };
    mirrorToStorage(user);
    return user;
  } catch {
    return getCurrentUser();
  }
}

// Profile API Functions
export async function updateProfile(updates: {
  name: string;
}): Promise<User | null> {
  try {
    const res = await apiFetch('/api/users/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error || 'Unable to update profile');
    }
    const { user } = (await res.json()) as { user: User };
    mirrorToStorage(user);
    return user;
  } catch (err) {
    console.error('updateProfile() failed', err);
    throw err;
  }
}

export async function uploadAvatar(file: File): Promise<{ path: string }> {
  try {
    const formData = new FormData();
    formData.append('avatar', file);

    const res = await apiFetch('/api/users/avatar', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error || 'Unable to upload avatar');
    }

    const { path } = (await res.json()) as { path: string };
    return { path };
  } catch (err) {
    console.error('uploadAvatar() failed', err);
    throw err;
  }
}

export async function getAvatarUrl(path: string): Promise<string | null> {
  try {
    const res = await apiFetch(
      `/api/users/avatar-url?path=${encodeURIComponent(path)}`,
      { credentials: 'include' },
    );
    if (!res.ok) return null;
    const { signedUrl } = (await res.json()) as { signedUrl: string };
    return signedUrl;
  } catch (err) {
    console.error('getAvatarUrl() failed', err);
    return null;
  }
}

export async function getDisplayAvatarUrl(
  pictureUrl: string | null | undefined,
): Promise<string | null> {
  if (!pictureUrl) return null;
  if (pictureUrl.startsWith('avatars/')) {
    return getAvatarUrl(pictureUrl);
  }
  return pictureUrl;
}

export async function requestPasswordChangeOtp(
  currentPassword: string,
): Promise<{ success: boolean; requiresOtp?: boolean; devOtp?: string; error?: string }> {
  try {
    const res = await apiFetch('/api/users/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ currentPassword }),
    });

    const data = (await res.json()) as {
      success?: boolean;
      requiresOtp?: boolean;
      devOtp?: string;
      error?: string;
    };
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Unable to send verification code',
      };
    }
    if (data.requiresOtp) {
      return {
        success: false,
        requiresOtp: true,
        devOtp: data.devOtp,
        error: data.error,
      };
    }
    return { success: true };
  } catch (err) {
    console.error('requestPasswordChangeOtp() failed', err);
    return { success: false, error: 'Unable to send verification code' };
  }
}

export async function verifyPasswordChangeOtp(
  otp: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/users/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ otp, verifyOnly: true }),
    });

    const data = (await res.json()) as {
      success?: boolean;
      otpVerified?: boolean;
      error?: string;
    };
    if (!res.ok || !data.otpVerified) {
      return {
        success: false,
        error: data.error || 'Invalid or expired verification code',
      };
    }
    return { success: true };
  } catch (err) {
    console.error('verifyPasswordChangeOtp() failed', err);
    return { success: false, error: 'Unable to verify code' };
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  otp: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/users/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newPassword, otp }),
    });

    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok) {
      return { success: false, error: data.error || 'Unable to change password' };
    }
    return { success: true };
  } catch (err) {
    console.error('changePassword() failed', err);
    return { success: false, error: 'Unable to change password' };
  }
}

// Student API Functions
export async function fetchPatients(search?: string, abnormalOnly?: boolean): Promise<Patient[]> {
  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (abnormalOnly) params.set('abnormal_only', 'true');
    const query = params.toString();
    const res = await apiFetch(`/api/patients${query ? `?${query}` : ''}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('fetchPatients() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { patients: Patient[] };
    return json.patients ?? [];
  } catch (err) {
    console.error('fetchPatients() failed', err);
    return [];
  }
}

export async function fetchStudentAssessments(): Promise<StudentAssessment[]> {
  try {
    const res = await apiFetch('/api/student/assessments', { credentials: 'include' });
    if (!res.ok) {
      console.error('fetchStudentAssessments() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { assessments: StudentAssessment[] };
    return json.assessments ?? [];
  } catch (err) {
    console.error('fetchStudentAssessments() failed', err);
    return [];
  }
}

export async function startAssessmentAttempt(
  assessmentId: string,
): Promise<StartedAttempt | null> {
  try {
    const res = await apiFetch(`/api/student/assessments/${assessmentId}/attempts`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('startAssessmentAttempt() failed', res.status);
      return null;
    }
    return (await res.json()) as StartedAttempt;
  } catch (err) {
    console.error('startAssessmentAttempt() failed', err);
    return null;
  }
}

export async function submitAssessmentAttempt(
  attemptId: string,
  answers: { question_id: string; selected_index: number | null; time_spent_seconds?: number }[],
): Promise<AttemptResult | null> {
  try {
    const res = await apiFetch(`/api/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) {
      console.error('submitAssessmentAttempt() failed', res.status);
      return null;
    }
    return (await res.json()) as AttemptResult;
  } catch (err) {
    console.error('submitAssessmentAttempt() failed', err);
    return null;
  }
}

// Vital signs (rule-based anomaly detection runs server-side)
export interface AnomalyReason {
  field: string;
  value: number;
  severity: 'warning' | 'critical';
  message: string;
}

export interface VitalReadingInput {
  patient_id: string;
  heart_rate?: number | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  temperature_c?: number | null;
  respiratory_rate?: number | null;
  oxygen_saturation?: number | null;
  pain_score?: number | null;
  notes?: string | null;
}

export interface VitalReading {
  id: string;
  patient_id: string;
  recorded_by: string;
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
  users?: { name: string; email: string } | null;
}

export async function submitVitalReading(
  input: VitalReadingInput,
): Promise<{ reading?: VitalReading; is_anomaly?: boolean; anomaly_reasons?: AnomalyReason[]; error?: string }> {
  try {
    const res = await apiFetch('/api/student/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as {
      reading?: VitalReading;
      is_anomaly?: boolean;
      anomaly_reasons?: AnomalyReason[];
      error?: string;
    };
    if (!res.ok) {
      return { error: json.error || 'Unable to save reading' };
    }
    return json;
  } catch (err) {
    console.error('submitVitalReading() failed', err);
    return { error: 'Unable to save reading. Please try again.' };
  }
}

export async function fetchMyVitalReadings(patientId?: string): Promise<VitalReading[]> {
  try {
    const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : '';
    const res = await apiFetch(`/api/student/vitals${query}`, { credentials: 'include' });
    if (!res.ok) {
      console.error('fetchMyVitalReadings() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { readings: VitalReading[] };
    return json.readings ?? [];
  } catch (err) {
    console.error('fetchMyVitalReadings() failed', err);
    return [];
  }
}

export async function fetchFacultyVitalReadings(options?: {
  flaggedOnly?: boolean;
  patientId?: string;
  studentId?: string;
}): Promise<VitalReading[]> {
  try {
    const params = new URLSearchParams();
    if (options?.flaggedOnly) params.set('flagged', 'true');
    if (options?.patientId) params.set('patient_id', options.patientId);
    if (options?.studentId) params.set('student_id', options.studentId);
    const query = params.toString();
    const res = await apiFetch(`/api/faculty/vitals${query ? `?${query}` : ''}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('fetchFacultyVitalReadings() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { readings: VitalReading[] };
    return json.readings ?? [];
  } catch (err) {
    console.error('fetchFacultyVitalReadings() failed', err);
    return [];
  }
}

// Rooms (admin CRUD + student assignment)
export interface Room {
  id: string;
  campus_id: string | null;
  name: string;
  room_number: string;
  capacity: number;
  status: 'active' | 'inactive' | 'maintenance';
  description: string | null;
  created_at: string;
  updated_at: string;
  /** Students rostered to the room; not measured against `capacity`. */
  students_assigned: number;
  /** Patients occupying the room — this is what `capacity` limits. */
  patients_assigned: number;
  /** Floor-plan rectangle in grid units; all four null = not placed. */
  plan_x: number | null;
  plan_y: number | null;
  plan_w: number | null;
  plan_h: number | null;
}

/** One room's floor-plan rectangle, or all-null to remove it from the plan. */
export interface RoomPlacement {
  id: string;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
}

export async function saveRoomLayout(
  positions: RoomPlacement[],
): Promise<{ saved?: number; error?: string }> {
  try {
    const res = await apiFetch('/api/admin/rooms/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ positions }),
    });
    const json = (await res.json()) as { saved?: number; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to save the floor plan' };
    return { saved: json.saved };
  } catch (err) {
    console.error('saveRoomLayout() failed', err);
    return { error: 'Unable to save the floor plan. Please try again.' };
  }
}

export interface RoomAssignment {
  id: string;
  student_id: string;
  shift: string | null;
  starts_at: string;
  ends_at: string | null;
  users?: { name: string; email: string } | null;
}

export async function fetchRooms(): Promise<Room[]> {
  try {
    const res = await apiFetch('/api/admin/rooms', { credentials: 'include' });
    if (!res.ok) {
      console.error('fetchRooms() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { rooms: Room[] };
    return json.rooms ?? [];
  } catch (err) {
    console.error('fetchRooms() failed', err);
    return [];
  }
}

export async function fetchRoomDetail(
  id: string,
): Promise<{ room: Room; assignments: RoomAssignment[] } | null> {
  try {
    const res = await apiFetch(`/api/admin/rooms/${id}`, { credentials: 'include' });
    if (!res.ok) {
      console.error('fetchRoomDetail() failed', res.status);
      return null;
    }
    return (await res.json()) as { room: Room; assignments: RoomAssignment[] };
  } catch (err) {
    console.error('fetchRoomDetail() failed', err);
    return null;
  }
}

export async function createRoom(input: {
  name: string;
  room_number: string;
  capacity: number;
  status?: Room['status'];
  description?: string | null;
}): Promise<{ room?: Room; error?: string }> {
  try {
    const res = await apiFetch('/api/admin/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as { room?: Room; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to create room' };
    return { room: json.room };
  } catch (err) {
    console.error('createRoom() failed', err);
    return { error: 'Unable to create room. Please try again.' };
  }
}

export async function updateRoom(
  id: string,
  updates: Partial<Pick<Room, 'name' | 'room_number' | 'capacity' | 'status' | 'description'>>,
): Promise<{ room?: Room; error?: string }> {
  try {
    const res = await apiFetch(`/api/admin/rooms/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    const json = (await res.json()) as { room?: Room; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to update room' };
    return { room: json.room };
  } catch (err) {
    console.error('updateRoom() failed', err);
    return { error: 'Unable to update room. Please try again.' };
  }
}

export async function deleteRoom(id: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch(`/api/admin/rooms/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      return { error: json.error || 'Unable to delete room' };
    }
    return { success: true };
  } catch (err) {
    console.error('deleteRoom() failed', err);
    return { error: 'Unable to delete room. Please try again.' };
  }
}

export async function assignStudentsToRoom(
  roomId: string,
  studentIds: string[],
  shift?: string | null,
): Promise<{ assignments?: RoomAssignment[]; error?: string }> {
  try {
    const res = await apiFetch(`/api/admin/rooms/${roomId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ student_ids: studentIds, shift: shift ?? null }),
    });
    const json = (await res.json()) as { assignments?: RoomAssignment[]; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to assign students' };
    return { assignments: json.assignments };
  } catch (err) {
    console.error('assignStudentsToRoom() failed', err);
    return { error: 'Unable to assign students. Please try again.' };
  }
}

export async function endRoomAssignment(
  roomId: string,
  assignmentId: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch(`/api/admin/rooms/${roomId}/assignments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ assignment_id: assignmentId }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      return { error: json.error || 'Unable to end assignment' };
    }
    return { success: true };
  } catch (err) {
    console.error('endRoomAssignment() failed', err);
    return { error: 'Unable to end assignment. Please try again.' };
  }
}

// Simulated EHR documentation (TPR / IVF / progress notes)
export type EhrType = 'tpr' | 'ivf' | 'note';

export interface EhrRecord {
  id: string;
  patient_id: string;
  created_at: string;
  // TPR
  shift?: string | null;
  temperature_c?: number | null;
  pulse?: number | null;
  respiration?: number | null;
  // IVF
  solution?: string;
  volume_ml?: number | null;
  rate_ml_hr?: number | null;
  site?: string | null;
  status?: 'ongoing' | 'completed' | 'discontinued';
  started_at?: string;
  ended_at?: string | null;
  // Notes
  content?: string;
  structured?: Record<string, unknown>;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  remarks?: string | null;
  patients?: { name: string; room_number: string | null } | null;
  /** The recorder; the patient chart also embeds their id, picture and sex for the avatar. */
  users?: {
    id?: string;
    name: string;
    email: string;
    picture_url?: string | null;
    sex?: 'male' | 'female' | null;
  } | null;
}

export async function fetchMyEhrRecords(type: EhrType, patientId?: string): Promise<EhrRecord[]> {
  try {
    const params = new URLSearchParams({ type });
    if (patientId) params.set('patient_id', patientId);
    const res = await apiFetch(`/api/student/ehr?${params}`, { credentials: 'include' });
    if (!res.ok) return [];
    const json = (await res.json()) as { records: EhrRecord[] };
    return json.records ?? [];
  } catch (err) {
    console.error('fetchMyEhrRecords() failed', err);
    return [];
  }
}

export async function createEhrRecord(
  payload: { type: EhrType; patient_id: string } & Record<string, unknown>,
): Promise<{ record?: EhrRecord; error?: string }> {
  try {
    const res = await apiFetch('/api/student/ehr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { record?: EhrRecord; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to save record' };
    return { record: json.record };
  } catch (err) {
    console.error('createEhrRecord() failed', err);
    return { error: 'Unable to save record. Please try again.' };
  }
}

export async function updateIvfStatus(
  id: string,
  status: 'completed' | 'discontinued',
): Promise<{ record?: EhrRecord; error?: string }> {
  try {
    const res = await apiFetch('/api/student/ehr', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, status }),
    });
    const json = (await res.json()) as { record?: EhrRecord; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to update record' };
    return { record: json.record };
  } catch (err) {
    console.error('updateIvfStatus() failed', err);
    return { error: 'Unable to update record. Please try again.' };
  }
}

export async function fetchFacultyEhrRecords(
  type: EhrType,
  options?: { patientId?: string; studentId?: string },
): Promise<EhrRecord[]> {
  try {
    const params = new URLSearchParams({ type });
    if (options?.patientId) params.set('patient_id', options.patientId);
    if (options?.studentId) params.set('student_id', options.studentId);
    const res = await apiFetch(`/api/faculty/ehr?${params}`, { credentials: 'include' });
    if (!res.ok) return [];
    const json = (await res.json()) as { records: EhrRecord[] };
    return json.records ?? [];
  } catch (err) {
    console.error('fetchFacultyEhrRecords() failed', err);
    return [];
  }
}

export async function reviewProgressNote(noteId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/ehr', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ note_id: noteId }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      return { error: json.error || 'Unable to review note' };
    }
    return { success: true };
  } catch (err) {
    console.error('reviewProgressNote() failed', err);
    return { error: 'Unable to review note. Please try again.' };
  }
}

// Competency validation (faculty records competency_scores — the ML label source)
export interface CompetencyArea {
  id: string;
  name: string;
  description: string | null;
}

export interface CompetencyScore {
  id: string;
  competency_id: string;
  faculty_id?: string | null;
  source: string;
  score: number;
  attempt_id?: string | null;
  remarks: string | null;
  created_at: string;
  competency_areas?: { name: string } | null;
}

export async function fetchCompetencyAreas(): Promise<CompetencyArea[]> {
  try {
    const res = await apiFetch('/api/competencies', { credentials: 'include' });
    if (!res.ok) {
      console.error('fetchCompetencyAreas() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { competencies: CompetencyArea[] };
    return json.competencies ?? [];
  } catch (err) {
    console.error('fetchCompetencyAreas() failed', err);
    return [];
  }
}

export async function fetchCompetencyScores(studentId: string): Promise<CompetencyScore[]> {
  try {
    const res = await apiFetch(
      `/api/faculty/competency-scores?student_id=${encodeURIComponent(studentId)}`,
      { credentials: 'include' },
    );
    if (!res.ok) {
      console.error('fetchCompetencyScores() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { scores: CompetencyScore[] };
    return json.scores ?? [];
  } catch (err) {
    console.error('fetchCompetencyScores() failed', err);
    return [];
  }
}

export async function recordCompetencyScore(input: {
  student_id: string;
  competency_id: string;
  score: number;
  remarks?: string | null;
  attempt_id?: string | null;
}): Promise<{ score?: CompetencyScore; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/competency-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as { score?: CompetencyScore; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to record score' };
    return { score: json.score };
  } catch (err) {
    console.error('recordCompetencyScore() failed', err);
    return { error: 'Unable to record score. Please try again.' };
  }
}

// Faculty API Types
export interface FacultyStats {
  total_students: number;
  at_risk_students: number;
  active_alerts: number;
  completed_reviews: number;
  active_scenarios: number;
  pending_scenarios: number;
  /** Scenario submissions handed in and not yet finalized. */
  awaiting_review: number;
  /** Assignments past their deadline and not handed in. */
  overdue_assignments: number;
  /** Students with at least one overdue assignment. */
  students_behind: number;
}

/** The rest of the faculty landing page — see buildFacultyOverview on the server. */
export interface FacultyOverview {
  sections: {
    id: string;
    name: string;
    students: number;
    at_risk: number;
    overdue: number;
    completion: number | null;
    avg_recent: number | null;
    avg_prior: number | null;
    weekly: { week_start: string; average: number | null }[];
  }[];
  attention: {
    id: string;
    name: string;
    section: string | null;
    picture_url: string | null;
    sex: 'male' | 'female' | null;
    risk: string | null;
    probability: number | null;
    overdue: number;
    recent_avg: number | null;
    last_activity: string | null;
    open_assistance: number;
  }[];
  attention_total: number;
  review_queue: {
    total: number;
    items: { assignment_id: string; student_id: string; student_name: string; scenario_title: string; submitted_at: string }[];
  };
  upcoming_shifts: {
    id: string;
    label: string | null;
    shift_type: string;
    starts_at: string;
    ends_at: string;
    section: string | null;
    room: string | null;
    rostered: number;
    checked_in: number;
    absent: number;
  }[];
  due_soon: { kind: 'scenario' | 'quiz'; id: string; title: string; deadline: string; open: number }[];
  overdue_assignments: number;
  students_behind: number;
  cohort_avg_recent: number | null;
  cohort_avg_prior: number | null;
  scored_at: string | null;
}

export interface CreateStudentResponse {
  student: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  password?: string;
  warning?: string;
}

export interface FacultyStudent {
  id: string;
  name: string;
  email: string;
  picture_url?: string | null;
  sex?: 'male' | 'female' | null;
  section_id?: string | null;
  section?: string | null;
  /** Latest ML classification; null when the model has never scored them. */
  risk_level?: 'safe' | 'at_risk' | null;
  /** ISO timestamp of their most recent recorded activity, or null. */
  last_activity?: string | null;
  /** Detail endpoint only: averaged over submitted attempts, null if none. */
  average_score?: number | null;
  quiz_count?: number;
}

export interface SimulationScenario {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  category: string;
  patient_case: any;
  patient_id?: string | null;
  patient_name?: string | null;
  learning_objectives: string[];
  is_ai_generated: boolean;
  student_count: number;
  created_at: string;
  /** Faculty's own wording per grading level; missing levels use the book's. Null before migration 046. */
  rubric?: Partial<Rubric> | null;
}

export interface ScenarioAssignment {
  id: string;
  scenario_id: string;
  scenario_title: string;
  student_id: string;
  student_name: string;
  student_picture_url?: string | null;
  student_sex?: 'male' | 'female' | null;
  /** The student's current group, if they are in one. */
  team_id?: string | null;
  team_name?: string | null;
  /** "BSN 1102 · Group 1": group names repeat across sections. */
  team_label?: string | null;
  /** The group the assignment was given through, if any. */
  assigned_team_id?: string | null;
  assigned_at: string;
  deadline: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  required: boolean;
  score?: number;
  completed_at?: string;
  time_taken?: number;
  submitted_at?: string | null;
  finalized_by?: string | null;
  /** Tasks on the scenario's checklist; null when the counts couldn't be read. */
  total_tasks?: number | null;
  /** How many of them the student performed; null when unknown. */
  completed_tasks?: number | null;
}

export interface ScenarioPerformance {
  id: string;
  student_id: string;
  student_name: string;
  scenario_id: string;
  scenario_title: string;
  score: number;
  max_score: number;
  time_taken: number;
  /** Tasks performed, and how many the scenario has. Null when unknown. */
  completed_tasks: number | null;
  total_tasks: number | null;
  completed_at: string;
}

/** One submitted quiz attempt, as the faculty Performance tab lists it. */
export interface StudentQuizAttempt {
  id: string;
  quiz_title: string;
  /** Percentage, or null for an attempt that was never scored. */
  score: number | null;
  submitted_at: string | null;
  started_at: string | null;
  time_taken_seconds: number | null;
  correct_answers: number | null;
  total_questions: number | null;
}

export interface ScenarioTask {
  id: string;
  title: string;
  description: string;
  category: 'assessment' | 'intervention' | 'medication' | 'communication' | 'documentation';
  points: number;
  is_completed: boolean;
}

export interface FacultyNotification {
  id: string;
  title: string;
  message: string;
  type: 'alert' | 'warning' | 'info' | 'success';
  is_read: boolean;
  created_at: string;
  student_id?: string;
}

export interface FacultyAlert {
  id: string;
  student_id: string;
  student_name: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface FacultyReport {
  id: string;
  student_id: string;
  student_name: string;
  report_type: string;
  generated_at: string;
  pdf_url: string | null;
}

export interface FacultyPatient {
  id: string;
  subject_id?: number;
  hadm_id?: number;
  name: string;
  age: number;
  gender: string;
  /** Denormalized label synced from the linked room; also read by EHR/Vitals. */
  room_number: string;
  /** FK to the rooms table — the real room link. */
  room_id?: string | null;
  /** Joined room, embedded by the patients API for display. */
  room?: { id: string; name: string; room_number: string } | null;
  diagnosis: string;
  admission_date: string;
  /** Admission lifecycle; rows predating migration 034 read as admitted. */
  status?: 'admitted' | 'discharged';
  discharged_at?: string | null;
  vital_signs?: {
    heart_rate: number | null;
    blood_pressure: string | null;
    temperature: number | null;
    respiratory_rate: number | null;
    oxygen_saturation: number | null;
  };
  labs?: Record<string, string | number | null>;
  mimic_id: string;
}

export interface AuditLog {
  id: string;
  faculty_id: string;
  faculty_name: string;
  tab: string;
  action: string;
  details: string;
  target_type?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogInsert {
  /** Ignored by the server — the actor is derived from the session. */
  faculty_id?: string;
  /** Ignored by the server — the actor is derived from the session. */
  faculty_name?: string;
  tab: string;
  action: string;
  details: string;
  target_type?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

// Warehouse-backed analytics (public.dw_analytics_summary via /api/analytics/summary)
export interface AnalyticsSummary {
  etl: { last_run_at: string | null; rows_loaded: Record<string, number> } | null;
  /** Sections represented in the current scope, with their student counts. */
  sections: { id: string; name: string; students: number; active_students: number }[];
  cohort: {
    total_students: number;
    submitted_attempts: number;
    average_score: number | null;
    active_students_30d: number;
  };
  weekly_trend: { week_start: string; average_score: number; attempts: number }[];
  /** `weekly_trend` split by section, attached when asked for with
   * `sectionTrend`. Null only when the split couldn't be read at all. */
  section_trend?: {
    section_id: string;
    section_name: string;
    week_start: string;
    average_score: number;
    attempts: number;
  }[] | null;
  competency_breakdown: Record<string, number>;
  competency_detail: {
    name: string;
    ratings: number;
    students: number;
    average_score: number;
    pass_rate_pct: number;
  }[];
  room_utilization: {
    name: string;
    room_number: string;
    status: string;
    capacity: number;
    assigned: number;
    utilization_pct: number;
  }[];
  clinical_activity: {
    vital_readings: number;
    anomalies: number;
    tpr_entries: number;
    ivf_records: number;
    progress_notes: number;
    notes_reviewed: number;
  };
  risk_distribution: Record<string, number>; // keys: 'safe' | 'at_risk'
  /** Ranked by average submitted score, same section/date scope as everything else. */
  top_students: {
    /** = users.id */
    student_key: string;
    name: string;
    /** Joined from users by the route; the warehouse keeps neither. */
    picture_url?: string | null;
    sex?: 'male' | 'female' | null;
    section: string | null;
    average_score: number;
    attempts: number;
  }[];
  /** Whichever model most recently issued a risk label — pairs with the
   * offline accuracy figure shipped in model-eval-snapshot.ts, since there is
   * no ground-truth outcome column to score predictions against live. */
  active_model: { kind: string | null; version: string | null } | null;
}

/** Trend granularity the server derived from the requested range. */
export type AnalyticsBucket = 'day' | 'week' | 'month' | 'year';

export interface AnalyticsFilters {
  /** Section ids; omitted/empty = every section the caller manages. */
  sectionIds?: string[];
  /** YYYY-MM-DD bounds. */
  from?: string;
  to?: string;
  /** Summary only: also attach `section_trend`, one series per section. */
  sectionTrend?: boolean;
}

export async function fetchAnalyticsSummary(
  filters: AnalyticsFilters = {},
  signal?: AbortSignal,
): Promise<{ summary: AnalyticsSummary | null; bucket: AnalyticsBucket }> {
  const params = new URLSearchParams();
  if (filters.sectionIds?.length) params.set('section_ids', filters.sectionIds.join(','));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.sectionTrend) params.set('section_trend', '1');
  const query = params.toString();

  try {
    const res = await apiFetch(`/api/analytics/summary${query ? `?${query}` : ''}`, {
      credentials: 'include',
      signal,
    });
    if (!res.ok) {
      console.error('fetchAnalyticsSummary() failed', res.status);
      return { summary: null, bucket: 'week' };
    }
    const json = (await res.json()) as { summary: AnalyticsSummary; bucket?: AnalyticsBucket };
    return { summary: json.summary ?? null, bucket: json.bucket ?? 'week' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { summary: null, bucket: 'week' };
    }
    console.error('fetchAnalyticsSummary() failed', err);
    return { summary: null, bucket: 'week' };
  }
}

/**
 * Every student in scope, in `top_students` order — the full list behind the
 * dashboard's top-5 card. Null when the request fails, so the page can tell
 * "nobody has submitted yet" apart from "couldn't load".
 */
export async function fetchStudentLeaderboard(
  filters: AnalyticsFilters = {},
): Promise<AnalyticsSummary['top_students'] | null> {
  const params = new URLSearchParams();
  if (filters.sectionIds?.length) params.set('section_ids', filters.sectionIds.join(','));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();

  try {
    const res = await apiFetch(`/api/analytics/leaderboard${query ? `?${query}` : ''}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('fetchStudentLeaderboard() failed', res.status);
      return null;
    }
    const json = (await res.json()) as { students?: AnalyticsSummary['top_students'] };
    return json.students ?? [];
  } catch (err) {
    console.error('fetchStudentLeaderboard() failed', err);
    return null;
  }
}

/** Plain-language reading of the dashboard, for the same filters. */
export interface AnalyticsNarrative {
  headline: string;
  overview: string;
  highlights: string[];
  watchouts: string[];
  actions: string[];
}

export async function generateAnalyticsNarrative(
  filters: AnalyticsFilters = {},
  signal?: AbortSignal,
): Promise<{ narrative?: AnalyticsNarrative; generated_at?: string; error?: string }> {
  const params = new URLSearchParams();
  if (filters.sectionIds?.length) params.set('section_ids', filters.sectionIds.join(','));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();

  try {
    const res = await apiFetch(`/api/analytics/narrative${query ? `?${query}` : ''}`, {
      method: 'POST',
      credentials: 'include',
      signal,
    });
    const json = (await res.json()) as {
      narrative?: AnalyticsNarrative;
      generated_at?: string;
      error?: string;
    };
    if (!res.ok) {
      return { error: json.error || 'Unable to generate summary' };
    }
    return { narrative: json.narrative, generated_at: json.generated_at };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return {};
    console.error('generateAnalyticsNarrative() failed', err);
    return { error: 'Unable to generate summary' };
  }
}

export async function runWarehouseEtl(): Promise<{ rows_loaded?: Record<string, number>; error?: string }> {
  try {
    const res = await apiFetch('/api/admin/etl', { method: 'POST', credentials: 'include' });
    const json = (await res.json()) as { rows_loaded?: Record<string, number>; error?: string };
    if (!res.ok) return { error: json.error || 'ETL run failed' };
    return { rows_loaded: json.rows_loaded };
  } catch (err) {
    console.error('runWarehouseEtl() failed', err);
    return { error: 'ETL run failed. Please try again.' };
  }
}

// ---------------------------------------------------------------
// ML predictions + recommendations (Phase 3.8)
// ---------------------------------------------------------------

export interface PredictionExplanation {
  feature: string;
  value: number;
  cohort_mean: number;
  direction: 'increases_risk' | 'decreases_risk';
  weight: number;
}

export interface RiskPrediction {
  id: string;
  student_id: string;
  risk: 'safe' | 'at_risk';
  probability: number | null;
  features: Record<string, number>;
  explanations: PredictionExplanation[];
  predicted_at: string;
  ml_models: { kind: string; version: string; is_baseline: boolean } | null;
}

export async function fetchLatestPrediction(studentId: string): Promise<RiskPrediction | null> {
  try {
    const res = await apiFetch(`/api/faculty/predictions?student_id=${encodeURIComponent(studentId)}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('fetchLatestPrediction() failed', res.status);
      return null;
    }
    const json = (await res.json()) as { prediction: RiskPrediction | null };
    return json.prediction ?? null;
  } catch (err) {
    console.error('fetchLatestPrediction() failed', err);
    return null;
  }
}

export async function fetchAllPredictions(): Promise<RiskPrediction[]> {
  try {
    const res = await apiFetch('/api/faculty/predictions', { credentials: 'include' });
    if (!res.ok) {
      console.error('fetchAllPredictions() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { predictions: RiskPrediction[] };
    return json.predictions ?? [];
  } catch (err) {
    console.error('fetchAllPredictions() failed', err);
    return [];
  }
}

export interface LearningRecommendation {
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

export async function fetchMyRecommendations(): Promise<LearningRecommendation[]> {
  try {
    const res = await apiFetch('/api/student/recommendations', { credentials: 'include' });
    if (!res.ok) {
      console.error('fetchMyRecommendations() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { recommendations: LearningRecommendation[] };
    return json.recommendations ?? [];
  } catch (err) {
    console.error('fetchMyRecommendations() failed', err);
    return [];
  }
}

export async function dismissRecommendation(id: string): Promise<boolean> {
  try {
    const res = await apiFetch('/api/student/recommendations', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    return res.ok;
  } catch (err) {
    console.error('dismissRecommendation() failed', err);
    return false;
  }
}

/** Fraction of an ML job done, 0 to 1, as the service reports its steps. */
export type MlProgressHandler = (fraction: number) => void;

async function postMlJob(
  path: string,
  action: 'predict' | 'recommend',
  onProgress?: MlProgressHandler,
): Promise<{ result?: Record<string, unknown>; error?: string }> {
  try {
    const res = await apiFetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    // Failures before the run starts are plain JSON; a started run streams.
    if (!res.ok || !res.body || !res.headers.get('content-type')?.includes(NDJSON)) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return { error: json.error || 'ML run failed' };
    }
    for await (const line of readNdjson(res.body)) {
      const event = line as MlEvent;
      if ('error' in event) return { error: event.error };
      if ('result' in event) return { result: event.result };
      if (event.total > 0) onProgress?.(event.done / event.total);
    }
    return { error: 'ML run ended without a result. Please try again.' };
  } catch (err) {
    console.error('postMlJob() failed', path, err);
    return { error: 'ML run failed. Please try again.' };
  }
}

/** Admin: runs across the whole cohort. */
export async function runMlJob(
  action: 'predict' | 'recommend',
  onProgress?: MlProgressHandler,
): Promise<{ result?: Record<string, unknown>; error?: string }> {
  return postMlJob('/api/admin/ml', action, onProgress);
}

/** Faculty: the same jobs, scoped server-side to the caller's own sections. */
export async function runFacultyMlJob(
  action: 'predict' | 'recommend',
  onProgress?: MlProgressHandler,
): Promise<{ result?: Record<string, unknown>; error?: string }> {
  return postMlJob('/api/faculty/ml', action, onProgress);
}

// Faculty API Functions
export async function fetchFacultyDashboard(): Promise<{
  stats: FacultyStats;
  recent_activities: AuditLog[];
  overview: FacultyOverview | null;
} | null> {
  try {
    const res = await apiFetch('/api/faculty/dashboard', { credentials: 'include' });
    const json = (await res.json()) as {
      stats?: FacultyStats;
      recent_activities?: AuditLog[];
      overview?: FacultyOverview;
      error?: string;
    };
    if (!res.ok || !json.stats) {
      console.error('fetchFacultyDashboard() failed', json.error ?? res.status);
      return null;
    }
    return {
      stats: json.stats,
      recent_activities: json.recent_activities ?? [],
      overview: json.overview ?? null,
    };
  } catch (err) {
    console.error('fetchFacultyDashboard() failed', err);
    return null;
  }
}

export async function fetchFacultyStudents(riskLevel?: string, search?: string): Promise<FacultyStudent[]> {
  try {
    const res = await apiFetch('/api/faculty/students', { credentials: 'include' });
    const json = (await res.json()) as { students?: FacultyStudent[]; error?: string };
    if (!res.ok) {
      console.error('fetchFacultyStudents() failed', json.error);
      return [];
    }

    let students = json.students ?? [];

    // Risk level is not yet stored in the database; filtering by it is a no-op for now.
    if (riskLevel && riskLevel !== 'all') {
      // Placeholder: keep all students until risk scoring is implemented.
    }

    if (search) {
      const q = search.toLowerCase();
      students = students.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    }

    return students;
  } catch (err) {
    console.error('fetchFacultyStudents() failed', err);
    return [];
  }
}

export async function fetchFacultyStudentDetail(studentId: string): Promise<{
  student: FacultyStudent;
  performance_history: StudentQuizAttempt[];
  competencies: Record<string, number>;
} | null> {
  try {
    const res = await apiFetch(`/api/faculty/students/${studentId}`, { credentials: 'include' });
    const json = (await res.json()) as {
      student?: FacultyStudent;
      performance_history?: StudentQuizAttempt[];
      error?: string;
    };
    if (!res.ok || !json.student) {
      console.error('fetchFacultyStudentDetail() failed', json.error);
      return null;
    }

    return {
      student: json.student,
      // The student's submitted quiz attempts. Scenario runs are a separate
      // tab and come from fetchStudentScenarioHistory().
      performance_history: json.performance_history ?? [],
      // Real competency data comes from fetchCompetencyScores(); kept for shape compat.
      competencies: {},
    };
  } catch (err) {
    console.error('fetchFacultyStudentDetail() failed', err);
    return null;
  }
}

export async function fetchAtRiskStudents(): Promise<FacultyStudent[]> {
  const students = await fetchFacultyStudents();
  return students.filter((s) => s.risk_level === 'at_risk');
}

export async function fetchFacultyScenarios(): Promise<SimulationScenario[]> {
  try {
    const res = await apiFetch('/api/faculty/scenarios', {
      credentials: 'include',
    });
    const json = (await res.json()) as { scenarios?: SimulationScenario[]; error?: string };
    if (!res.ok) {
      console.error('fetchFacultyScenarios() failed', json.error);
      return [];
    }
    return json.scenarios ?? [];
  } catch (err) {
    console.error('fetchFacultyScenarios() failed', err);
    return [];
  }
}

export async function createScenario(
  scenario: Partial<SimulationScenario> & { skills?: SkillSelection[] },
): Promise<SimulationScenario | null> {
  try {
    const res = await apiFetch('/api/faculty/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(scenario),
    });
    const json = (await res.json()) as { scenario?: SimulationScenario; error?: string };
    if (!res.ok || !json.scenario) {
      console.error('createScenario() failed', json.error);
      return null;
    }
    return json.scenario;
  } catch (err) {
    console.error('createScenario() failed', err);
    return null;
  }
}

/** Scenario categories, alphabetical with General last. */
export async function fetchScenarioCategories(): Promise<string[]> {
  try {
    const res = await apiFetch('/api/faculty/scenarios/categories', { credentials: 'include' });
    const json = (await res.json()) as { categories?: string[] };
    return res.ok ? (json.categories ?? []) : [];
  } catch (err) {
    console.error('fetchScenarioCategories() failed', err);
    return [];
  }
}

/**
 * Creates categories, reusing any that already exist in another case.
 * `created` is each requested name's stored spelling, in order.
 */
export async function createScenarioCategories(
  names: string[],
  source: 'lesson' | 'faculty',
): Promise<{ created: string[]; categories: string[] } | { error: string }> {
  try {
    const res = await apiFetch('/api/faculty/scenarios/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ names, source }),
    });
    const json = (await res.json()) as { created?: string[]; categories?: string[]; error?: string };
    if (!res.ok || !json.created) return { error: json.error || `Request failed (${res.status})` };
    return { created: json.created, categories: json.categories ?? [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unable to create categories' };
  }
}

/** A topic detected in a lesson, with the category it maps to. */
export interface LessonTopic {
  topic: string;
  /** An existing category's stored spelling, or a proposed new one. */
  category: string;
  is_new: boolean;
}

export interface AnalyzedLesson {
  /** The lesson's extracted text, sent back when generating from it. */
  lessonText: string;
  topics: LessonTopic[];
  /** Set when topic detection came back empty or failed; the text is still usable. */
  warning?: string;
}

/** Uploads a lesson, returning its text and the topics (candidate categories) it covers. */
export async function analyzeLesson(file: File): Promise<AnalyzedLesson | { error: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch('/api/faculty/scenarios/analyze-lesson', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const json = (await res.json()) as {
      lesson_text?: string;
      topics?: LessonTopic[];
      warning?: string;
      error?: string;
    };
    if (!res.ok || typeof json.lesson_text !== 'string') {
      return { error: json.error || `Request failed (${res.status})` };
    }
    return { lessonText: json.lesson_text, topics: json.topics ?? [], warning: json.warning };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unable to read the lesson' };
  }
}

/**
 * A lesson, when given, grounds the scenario in its text (the prompt may then
 * be empty); its category, when set, is the topic the case must centre on.
 */
export async function generateAIScenario(
  prompt: string,
  patientId?: string,
  lesson?: { text: string; category?: string | null } | null,
): Promise<(Partial<SimulationScenario> & { skills?: string[] }) | { error: string }> {
  try {
    const res = await apiFetch('/api/faculty/scenarios/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        prompt,
        patient_id: patientId,
        lesson_text: lesson?.text,
        category: lesson?.category ?? undefined,
      }),
    });

    const json = (await res.json()) as {
      scenario?: Partial<SimulationScenario> & { skills?: string[] };
      error?: string;
    };
    if (!res.ok || !json.scenario) {
      return { error: json.error || `Request failed (${res.status})` };
    }

    return {
      skills: json.scenario.skills ?? [],
      title: json.scenario.title || 'AI Generated Scenario',
      description: json.scenario.description || prompt,
      difficulty: json.scenario.difficulty || 'intermediate',
      // Must stay on the scenario_category enum or the save is rejected.
      category: json.scenario.category || 'General',
      patient_case: json.scenario.patient_case || { generated_by_ai: true },
      learning_objectives: json.scenario.learning_objectives || ['Demonstrate clinical assessment skills'],
      is_ai_generated: true,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unable to generate scenario' };
  }
}

export interface ScenarioBatchOptions {
  count: number;
  /** Empty spreads the batch across every category. */
  categories?: string[];
  /** Omit to cycle beginner → intermediate → advanced. */
  difficulty?: string;
  topic?: string;
  /** Titles to steer away from — used to chain sub-batches without repeats. */
  avoidTitles?: string[];
  /** Extracted lesson text; every scenario is then grounded in it. */
  lessonText?: string;
}

/** An unsaved scenario returned by batch generation, ready for review. */
export interface ScenarioDraft {
  title: string;
  description: string;
  difficulty: string;
  category: string;
  patient_case: Record<string, unknown>;
  learning_objectives: string[];
  patient_id: string | null;
  /** Taylor's skills the AI detected in the case. */
  skills?: string[];
}

/** Generates a library of scenarios in one request. Nothing is saved until createScenario(). */
export async function generateScenarioBatch(
  options: ScenarioBatchOptions,
  signal?: AbortSignal,
): Promise<{ scenarios: ScenarioDraft[]; warning?: string } | { error: string }> {
  try {
    const res = await apiFetch('/api/faculty/scenarios/generate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal,
      body: JSON.stringify({
        count: options.count,
        categories: options.categories,
        difficulty: options.difficulty,
        topic: options.topic,
        avoid_titles: options.avoidTitles,
        lesson_text: options.lessonText,
      }),
    });

    const json = (await res.json()) as {
      scenarios?: ScenarioDraft[];
      warning?: string;
      error?: string;
    };

    if (!res.ok || !json.scenarios) {
      return { error: json.error || `Request failed (${res.status})` };
    }

    return { scenarios: json.scenarios, warning: json.warning };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unable to generate scenarios' };
  }
}

export async function suggestAIScenario(
  difficulty?: string,
  category?: string,
  patientId?: string,
): Promise<
  | { scenario: Partial<SimulationScenario>; patient_id: string; prompt: string }
  | { error: string }
> {
  try {
    const res = await apiFetch('/api/faculty/scenarios/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ difficulty, category, patient_id: patientId }),
    });

    const json = (await res.json()) as {
      scenario?: Partial<SimulationScenario>;
      patient_id?: string;
      prompt?: string;
      error?: string;
    };

    if (!res.ok || !json.scenario || !json.patient_id || !json.prompt) {
      return { error: json.error || `Request failed (${res.status})` };
    }

    return {
      scenario: json.scenario,
      patient_id: json.patient_id,
      prompt: json.prompt,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unable to suggest scenario' };
  }
}

export async function updateScenario(
  id: string,
  scenario: Partial<SimulationScenario>,
): Promise<SimulationScenario | null> {
  try {
    const res = await apiFetch(`/api/faculty/scenarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(scenario),
    });
    const json = (await res.json()) as { scenario?: SimulationScenario; error?: string };
    if (!res.ok || !json.scenario) {
      console.error('updateScenario() failed', json.error);
      return null;
    }
    return json.scenario;
  } catch (err) {
    console.error('updateScenario() failed', err);
    return null;
  }
}

export async function deleteScenario(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/faculty/scenarios/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok;
  } catch (err) {
    console.error('deleteScenario() failed', err);
    return false;
  }
}

export async function fetchScenarioById(id: string): Promise<SimulationScenario | null> {
  try {
    const res = await apiFetch(`/api/scenarios/${id}`, {
      credentials: 'include',
    });
    const json = (await res.json()) as { scenario?: SimulationScenario; error?: string };
    if (!res.ok || !json.scenario) {
      console.error('fetchScenarioById() failed', json.error);
      return null;
    }
    return json.scenario;
  } catch (err) {
    console.error('fetchScenarioById() failed', err);
    return null;
  }
}

export async function fetchFacultyPatients(search?: string): Promise<FacultyPatient[]> {
  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    const query = params.toString();
    const res = await apiFetch(`/api/faculty/patients${query ? `?${query}` : ''}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('fetchFacultyPatients() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { patients: FacultyPatient[] };
    return json.patients ?? [];
  } catch (err) {
    console.error('fetchFacultyPatients() failed', err);
    return [];
  }
}

export async function createFacultyPatient(
  patient: Partial<FacultyPatient>,
): Promise<{ patient?: FacultyPatient; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patient),
    });

    const json = (await res.json()) as { patient?: FacultyPatient; error?: string };
    if (!res.ok) {
      return { error: json.error || 'Unable to create patient' };
    }
    return { patient: json.patient };
  } catch (err) {
    console.error('createFacultyPatient() failed', err);
    return { error: 'Unable to create patient. Please try again.' };
  }
}

export async function updateFacultyPatient(
  id: string,
  patient: Partial<FacultyPatient>,
): Promise<{ patient?: FacultyPatient; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/patients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, ...patient }),
    });

    const json = (await res.json()) as { patient?: FacultyPatient; error?: string };
    if (!res.ok) {
      return { error: json.error || 'Unable to update patient' };
    }
    return { patient: json.patient };
  } catch (err) {
    console.error('updateFacultyPatient() failed', err);
    return { error: 'Unable to update patient. Please try again.' };
  }
}

/**
 * Check a patient in or out. Check-out discharges and frees the bed;
 * check-in re-admits a discharged patient, optionally into a room.
 */
export async function setPatientAdmission(
  id: string,
  action: 'check_in' | 'check_out',
  roomId?: string | null,
): Promise<{ patient?: FacultyPatient; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/patients/admission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, action, room_id: roomId ?? null }),
    });
    const json = (await res.json()) as { patient?: FacultyPatient; error?: string };
    if (!res.ok) {
      return { error: json.error || 'Unable to update admission status' };
    }
    return { patient: json.patient };
  } catch (err) {
    console.error('setPatientAdmission() failed', err);
    return { error: 'Unable to update admission status. Please try again.' };
  }
}

/**
 * Places patients into rooms without exceeding capacity (used after saving a
 * generated scenario library). mode 'fill' packs rooms; 'spread' balances them.
 */
export async function assignPatientRooms(
  patientIds: string[],
  mode: 'fill' | 'spread',
): Promise<{ assigned: number; unassigned: number } | { error: string }> {
  try {
    const res = await apiFetch('/api/faculty/patients/assign-rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ patient_ids: patientIds, mode }),
    });
    const json = (await res.json()) as { assigned?: number; unassigned?: number; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to assign rooms' };
    return { assigned: json.assigned ?? 0, unassigned: json.unassigned ?? 0 };
  } catch (err) {
    console.error('assignPatientRooms() failed', err);
    return { error: 'Unable to assign rooms. Please try again.' };
  }
}

export async function deleteFacultyPatient(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/patients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id }),
    });

    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok) {
      return { error: json.error || 'Unable to delete patient' };
    }
    return { success: true };
  } catch (err) {
    console.error('deleteFacultyPatient() failed', err);
    return { error: 'Unable to delete patient. Please try again.' };
  }
}

/** One admission-lifecycle entry on a patient's timeline, from the audit trail. */
export interface PatientEvent {
  id: string;
  action: string;
  created_at: string;
  actor_name: string;
  details: Record<string, unknown>;
}

/** One of the signed-in student's own shifts, with how they were marked. */
export interface StudentAttendanceRow {
  id: string;
  attendance_status: ShiftAttendanceStatus;
  checked_in_at: string | null;
  notes: string | null;
  shifts: {
    id: string;
    label: string | null;
    shift_type: 'am' | 'pm' | 'night' | 'custom';
    starts_at: string;
    ends_at: string;
    status: 'scheduled' | 'cancelled';
    room?: { name: string; room_number: string } | null;
  } | null;
}

export async function fetchMyAttendance(): Promise<{
  shifts: StudentAttendanceRow[];
  tally: AttendanceTally;
} | null> {
  try {
    const res = await apiFetch('/api/student/attendance', { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as { shifts: StudentAttendanceRow[]; tally: AttendanceTally };
  } catch (err) {
    console.error('fetchMyAttendance() failed', err);
    return null;
  }
}

// Shifts and attendance (migration 029)
export interface FacultyShift {
  id: string;
  section_id: string | null;
  room_id: string | null;
  label: string | null;
  shift_type: 'am' | 'pm' | 'night' | 'custom';
  starts_at: string;
  ends_at: string;
  notes: string | null;
  status: 'scheduled' | 'cancelled';
  created_at: string;
  section?: { id: string; name: string } | null;
  room?: { id: string; name: string; room_number: string } | null;
  /** One entry per rostered student, for the list's tallies. */
  statuses: ShiftAttendanceStatus[];
}

export interface ShiftRosterEntry {
  id: string;
  student_id: string;
  attendance_status: ShiftAttendanceStatus;
  checked_in_at: string | null;
  notes: string | null;
  users?: { name: string; email: string } | null;
}

export async function fetchShifts(): Promise<FacultyShift[]> {
  try {
    const res = await apiFetch('/api/faculty/shifts', { credentials: 'include' });
    if (!res.ok) {
      console.error('fetchShifts() failed', res.status);
      return [];
    }
    const json = (await res.json()) as { shifts: FacultyShift[] };
    return json.shifts ?? [];
  } catch (err) {
    console.error('fetchShifts() failed', err);
    return [];
  }
}

export async function createShift(input: {
  section_id: string;
  shift_type: string;
  starts_at: string;
  ends_at: string;
  room_id?: string | null;
  label?: string | null;
  notes?: string | null;
}): Promise<{ shift?: FacultyShift; assigned?: number; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as { shift?: FacultyShift; assigned?: number; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to create shift' };
    return { shift: json.shift, assigned: json.assigned };
  } catch (err) {
    console.error('createShift() failed', err);
    return { error: 'Unable to create shift. Please try again.' };
  }
}

export async function fetchShiftRoster(
  shiftId: string,
): Promise<{ shift: FacultyShift; roster: ShiftRosterEntry[] } | null> {
  try {
    const res = await apiFetch(`/api/faculty/shifts/${shiftId}`, { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as { shift: FacultyShift; roster: ShiftRosterEntry[] };
  } catch (err) {
    console.error('fetchShiftRoster() failed', err);
    return null;
  }
}

/** Marks attendance for one or many students, and/or cancels the shift. */
export async function updateShift(
  shiftId: string,
  payload: {
    marks?: { assignment_id: string; status: ShiftAttendanceStatus; notes?: string }[];
    status?: 'cancelled' | 'scheduled';
  },
): Promise<{ updated?: number; error?: string }> {
  try {
    const res = await apiFetch(`/api/faculty/shifts/${shiftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { updated?: number; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to update the shift' };
    return { updated: json.updated };
  } catch (err) {
    console.error('updateShift() failed', err);
    return { error: 'Unable to update the shift. Please try again.' };
  }
}

export async function deleteShift(shiftId: string): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(`/api/faculty/shifts/${shiftId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      return { error: json.error || 'Unable to delete the shift' };
    }
    return {};
  } catch (err) {
    console.error('deleteShift() failed', err);
    return { error: 'Unable to delete the shift. Please try again.' };
  }
}

/** One AI-drafted follow-up action on a discharge summary. */
export interface FollowUpRecommendation {
  title: string;
  detail: string;
}

/** A completed stay, materialised at check-out (migration 037). */
export interface DischargeSummary {
  id: string;
  patient_id: string;
  admitted_at: string | null;
  discharged_at: string;
  diagnosis: string;
  room_label: string;
  vitals_digest: {
    readings?: number;
    flagged?: number;
    critical?: number;
    stats?: Record<string, { min: number; max: number; avg: number; n: number }>;
    findings?: { message: string; severity: string; recommendation?: string }[];
  };
  ehr_digest: {
    tpr?: number;
    ivf?: number;
    ivf_ongoing?: number;
    notes?: number;
    notes_reviewed?: number;
  };
  follow_up: FollowUpRecommendation[];
  ai_model: string | null;
  ai_generated_at: string | null;
  created_at: string;
}

/** Drafts follow-up recommendations into an existing summary. */
export async function generateFollowUps(
  summaryId: string,
): Promise<{ summary?: DischargeSummary; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/patients/discharge-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ summary_id: summaryId }),
    });
    const json = (await res.json()) as { summary?: DischargeSummary; error?: string };
    if (!res.ok) return { error: json.error || 'Unable to generate recommendations' };
    return { summary: json.summary };
  } catch (err) {
    console.error('generateFollowUps() failed', err);
    return { error: 'Unable to generate recommendations. Please try again.' };
  }
}

/** A patient's whole chart, as served by /api/faculty/patients/[id]. */
export interface PatientChart {
  patient: FacultyPatient & { medical_history?: string | null };
  vitals: VitalReading[];
  tpr: EhrRecord[];
  ivf: EhrRecord[];
  notes: EhrRecord[];
  events: PatientEvent[];
  /** Completed stays; empty unless the patient is currently discharged. */
  discharge_summaries: DischargeSummary[];
}

export async function fetchFacultyPatientDetail(patientId: string): Promise<PatientChart | null> {
  try {
    const res = await apiFetch(`/api/faculty/patients/${patientId}`, { credentials: 'include' });
    if (!res.ok) {
      if (res.status !== 404) console.error('fetchFacultyPatientDetail() failed', res.status);
      return null;
    }
    return (await res.json()) as PatientChart;
  } catch (err) {
    console.error('fetchFacultyPatientDetail() failed', err);
    return null;
  }
}

export async function fetchFacultyReports(): Promise<FacultyReport[]> {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  return [
    {
      id: 'report-001',
      student_id: 'student-001',
      student_name: 'Maria Cruz',
      report_type: 'competency',
      generated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      pdf_url: null,
    },
    {
      id: 'report-002',
      student_id: 'student-002',
      student_name: 'Juan Reyes',
      report_type: 'performance',
      generated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      pdf_url: null,
    },
  ];
}

export async function generateFacultyReport(studentId: string, reportType: string = 'competency'): Promise<FacultyReport | null> {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return {
    id: `report-${Date.now()}`,
    student_id: studentId,
    student_name: 'Student Name',
    report_type: reportType,
    generated_at: new Date().toISOString(),
    pdf_url: null,
  };
}

export interface ServerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// Server notification_type enum → the UI's display categories.
const NOTIFICATION_TYPE_MAP: Record<string, FacultyNotification['type']> = {
  vitals_anomaly: 'alert',
  at_risk_flag: 'alert',
  assistance_request: 'alert',
  deadline_reminder: 'warning',
  performance_validated: 'success',
  assignment_created: 'info',
  system: 'info',
};

/** Shared by the polled fetch and the live SSE stream. */
export function toFacultyNotification(n: ServerNotification): FacultyNotification {
  return {
    id: n.id,
    title: n.title,
    message: n.body,
    type: NOTIFICATION_TYPE_MAP[n.type] ?? 'info',
    is_read: n.read_at !== null,
    created_at: n.created_at,
    student_id: typeof n.data?.student_id === 'string' ? n.data.student_id : undefined,
  };
}

export async function fetchNotifications(): Promise<{ notifications: FacultyNotification[]; total: number; unread: number } | null> {
  try {
    const res = await apiFetch('/api/notifications', { credentials: 'include' });
    if (!res.ok) {
      console.error('fetchNotifications() failed', res.status);
      return null;
    }
    const json = (await res.json()) as { notifications: ServerNotification[]; unread: number };
    const notifications = (json.notifications ?? []).map(toFacultyNotification);
    return { notifications, total: notifications.length, unread: json.unread ?? 0 };
  } catch (err) {
    console.error('fetchNotifications() failed', err);
    return null;
  }
}

export async function fetchFacultyNotifications(): Promise<{ notifications: FacultyNotification[]; total: number; unread: number } | null> {
  return fetchNotifications();
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  try {
    const res = await apiFetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: notificationId }),
    });
    return res.ok;
  } catch (err) {
    console.error('markNotificationRead() failed', err);
    return false;
  }
}

export async function markAllNotificationsRead(): Promise<boolean> {
  try {
    const res = await apiFetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ all: true }),
    });
    return res.ok;
  } catch (err) {
    console.error('markAllNotificationsRead() failed', err);
    return false;
  }
}

export async function fetchFacultyAlerts(status?: string): Promise<{ alerts: FacultyAlert[]; total: number; pending: number } | null> {
  try {
    const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    const res = await apiFetch(`/api/faculty/alerts${query}`, { credentials: 'include' });
    const json = (await res.json()) as {
      alerts?: FacultyAlert[];
      total?: number;
      pending?: number;
      error?: string;
    };
    if (!res.ok) {
      console.error('fetchFacultyAlerts() failed', json.error ?? res.status);
      return null;
    }
    return {
      alerts: json.alerts ?? [],
      total: json.total ?? 0,
      pending: json.pending ?? 0,
    };
  } catch (err) {
    console.error('fetchFacultyAlerts() failed', err);
    return null;
  }
}

export async function updateAlertStatus(alertId: string, status: string): Promise<boolean> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return true;
}

export async function createAlert(alert: Partial<FacultyAlert>): Promise<FacultyAlert | null> {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  return {
    id: `alert-${Date.now()}`,
    student_id: alert.student_id || '',
    student_name: alert.student_name || '',
    alert_type: alert.alert_type || 'Manual Alert',
    severity: alert.severity || 'medium',
    description: alert.description || '',
    status: 'pending',
    created_at: new Date().toISOString(),
  };
}

export async function fetchAuditTrail(action?: string): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (action) params.set('action', action);
  const res = await apiFetch(`/api/faculty/audit?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.logs ?? [];
}

export async function logAuditAction(payload: AuditLogInsert): Promise<void> {
  try {
    await apiFetch('/api/faculty/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // silently fail — audit should never break the app
  }
}

export function getCurrentFacultyUser(): { id: string; name: string } | null {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem('icare_user');
  if (!userStr) return null;
  try {
    const user = JSON.parse(userStr);
    return { id: user.id, name: user.name };
  } catch {
    return null;
  }
}

export async function getClinicalDecisionSupport(patientCase: any): Promise<any | null> {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return {
    diagnosis_support: ['Acute Myocardial Infarction', 'Unstable Angina'],
    treatment_recommendations: ['Administer aspirin', 'Start heparin drip', 'Prepare for cardiac catheterization'],
    monitoring_parameters: ['Cardiac enzymes', 'ECG every 15 minutes', 'Vital signs every 5 minutes'],
    educational_resources: ['MI Management Guidelines', 'Acute Cardiac Care Protocol'],
  };
}

export async function fetchScenarioAssignments(scenarioId?: string): Promise<ScenarioAssignment[]> {
  try {
    const url = scenarioId
      ? `/api/faculty/scenarios/assignments?scenario_id=${encodeURIComponent(scenarioId)}`
      : '/api/faculty/scenarios/assignments';
    const res = await apiFetch(url, { credentials: 'include' });
    const json = (await res.json()) as { assignments?: ScenarioAssignment[]; error?: string };
    if (!res.ok) {
      console.error('fetchScenarioAssignments() failed', json.error);
      return [];
    }
    const assignments = json.assignments ?? [];
    return scenarioId ? assignments.filter((a) => a.scenario_id === scenarioId) : assignments;
  } catch (err) {
    console.error('fetchScenarioAssignments() failed', err);
    return [];
  }
}

export interface FacultyScenarioTask {
  id: string;
  title: string;
  description: string;
  category: 'assessment' | 'intervention' | 'medication' | 'communication' | 'documentation';
  points: number;
  verification: 'system' | 'faculty';
  system_trigger: 'vitals' | 'charting' | null;
  sort_order: number;
  /** False for a task faculty rated "not performed", though it has a row. */
  is_completed: boolean;
  completed_via: 'system' | 'faculty' | null;
  completed_at: string | null;
  /** Faculty's verbal rating; null when unrated. Students get it once finalized. */
  rating: TaskRating | null;
  remarks: string | null;
}

/** One row of a task's sub-task checklist, with this assignment's rating of it. */
export interface GradingTaskStep {
  id: string;
  title: string;
  /** The Taylor's checklist steps it condenses, e.g. "Skill 1-7, steps 12–15". */
  source: string;
  rating: TaskRating | null;
}

/** A task on the faculty grading sheet: its completion state plus its sub-tasks. */
export interface GradingTask extends FacultyScenarioTask {
  /** Empty for a task graded as a whole. */
  steps: GradingTaskStep[];
}

/** A student assignment's scenario tasks with their completion state (faculty view). */
export async function fetchFacultyAssignmentTasks(assignmentId: string): Promise<{
  tasks: GradingTask[];
  status: string;
  ratingsEnabled: boolean;
  stepsEnabled: boolean;
  /** What each level means for this scenario (its own rubric, or the book's). */
  rubric: Rubric;
} | null> {
  try {
    const res = await apiFetch(`/api/faculty/scenarios/assignments/${assignmentId}/tasks`, {
      credentials: 'include',
    });
    const json = (await res.json()) as {
      tasks?: GradingTask[];
      status?: string;
      ratings_enabled?: boolean;
      steps_enabled?: boolean;
      rubric?: unknown;
      error?: string;
    };
    if (!res.ok) {
      console.error('fetchFacultyAssignmentTasks() failed', json.error);
      return null;
    }
    return {
      tasks: (json.tasks ?? []).map((t) => ({ ...t, steps: t.steps ?? [] })),
      status: json.status ?? 'pending',
      ratingsEnabled: json.ratings_enabled ?? true,
      stepsEnabled: json.steps_enabled ?? true,
      rubric: resolveRubric(json.rubric),
    };
  } catch (err) {
    console.error('fetchFacultyAssignmentTasks() failed', err);
    return null;
  }
}

type GradeSaveResult =
  | { ok: true; score?: number; rating: TaskRating | null }
  | { ok: false; error: string };

async function putTaskGrade(assignmentId: string, body: object, label: string): Promise<GradeSaveResult> {
  try {
    const res = await apiFetch(`/api/faculty/scenarios/assignments/${assignmentId}/tasks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      score?: number;
      rating?: TaskRating | null;
    };
    if (!res.ok) {
      console.error(`${label}() failed`, json.error);
      return { ok: false, error: json.error ?? 'Unable to save rating' };
    }
    // `score` is present only when the assignment was already finalized — a
    // correction to a locked grade, kept in sync with what students and
    // analytics read. `rating` is the task's overall level after the save.
    return { ok: true, score: json.score, rating: json.rating ?? null };
  } catch (err) {
    console.error(`${label}() failed`, err);
    return { ok: false, error: 'Unable to save rating' };
  }
}

/**
 * Set (or with `rating: null`, clear) faculty's verbal rating and/or note for
 * one task; a field left out keeps its saved value. Resolves to the server's
 * error message on failure, so a missing migration reads as that and not a
 * generic failure.
 */
export async function saveTaskRating(
  assignmentId: string,
  taskId: string,
  grade: { rating?: TaskRating | null; remarks?: string | null },
): Promise<GradeSaveResult> {
  return putTaskGrade(assignmentId, { task_id: taskId, ...grade }, 'saveTaskRating');
}

/**
 * Rate (or with `rating: null`, clear) some of a task's sub-tasks — one per
 * click, or every one at once. The task's overall level follows from them.
 */
export async function saveStepRatings(
  assignmentId: string,
  taskId: string,
  steps: { step_id: string; rating: TaskRating | null }[],
): Promise<GradeSaveResult> {
  return putTaskGrade(assignmentId, { task_id: taskId, steps }, 'saveStepRatings');
}

/** Lock the assignment and score it from each task's rated share of its points. */
export async function finalizeScenarioAssignment(
  assignmentId: string,
): Promise<{ assignment: ScenarioAssignment; score: number } | null> {
  try {
    const res = await apiFetch(`/api/faculty/scenarios/assignments/${assignmentId}/finalize`, {
      method: 'POST',
      credentials: 'include',
    });
    const json = (await res.json()) as { assignment?: ScenarioAssignment; score?: number; error?: string };
    if (!res.ok || !json.assignment) {
      console.error('finalizeScenarioAssignment() failed', json.error);
      return null;
    }
    return { assignment: json.assignment, score: json.score ?? json.assignment.score ?? 0 };
  } catch (err) {
    console.error('finalizeScenarioAssignment() failed', err);
    return null;
  }
}

export async function assignScenarioToStudents(
  scenarioId: string,
  studentIds: string[],
  deadline: string,
  required: boolean,
): Promise<ScenarioAssignment[]> {
  try {
    const res = await apiFetch(`/api/faculty/scenarios/${scenarioId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ student_ids: studentIds, deadline, required }),
    });
    const json = (await res.json()) as { assignments?: ScenarioAssignment[]; error?: string };
    if (!res.ok || !json.assignments) {
      console.error('assignScenarioToStudents() failed', json.error);
      return [];
    }
    return json.assignments;
  } catch (err) {
    console.error('assignScenarioToStudents() failed', err);
    return [];
  }
}

export async function fetchStudentScenarioAssignments(_studentId: string): Promise<ScenarioAssignment[]> {
  try {
    const res = await apiFetch('/api/student/scenarios', { credentials: 'include' });
    const json = (await res.json()) as { assignments?: ScenarioAssignment[]; error?: string };
    if (!res.ok) {
      console.error('fetchStudentScenarioAssignments() failed', json.error);
      return [];
    }
    return json.assignments ?? [];
  } catch (err) {
    console.error('fetchStudentScenarioAssignments() failed', err);
    return [];
  }
}

export interface StudentScenarioTasksResult {
  tasks: FacultyScenarioTask[];
  assignment: {
    id: string;
    status: string;
    submitted_at: string | null;
    completed_at: string | null;
    score: number | null;
    time_taken: number | null;
  };
}

/** A student's own scenario tasks with their live completion state. */
export async function fetchStudentScenarioTasks(
  assignmentId: string,
): Promise<StudentScenarioTasksResult | null> {
  try {
    const res = await apiFetch(`/api/student/scenarios/${assignmentId}/tasks`, {
      credentials: 'include',
    });
    const json = (await res.json()) as {
      tasks?: FacultyScenarioTask[];
      assignment?: StudentScenarioTasksResult['assignment'];
      error?: string;
    };
    if (!res.ok || !json.assignment) {
      console.error('fetchStudentScenarioTasks() failed', json.error);
      return null;
    }
    return { tasks: json.tasks ?? [], assignment: json.assignment };
  } catch (err) {
    console.error('fetchStudentScenarioTasks() failed', err);
    return null;
  }
}

/** Hand the assignment in for faculty review — faculty verify and score it. */
export async function submitScenarioForReview(
  assignmentId: string,
  timeTaken: number,
): Promise<ScenarioAssignment | null> {
  try {
    const res = await apiFetch(`/api/student/scenarios/${assignmentId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ time_taken: timeTaken }),
    });
    const json = (await res.json()) as { assignment?: ScenarioAssignment; error?: string };
    if (!res.ok || !json.assignment) {
      console.error('submitScenarioForReview() failed', json.error);
      return null;
    }
    return json.assignment;
  } catch (err) {
    console.error('submitScenarioForReview() failed', err);
    return null;
  }
}

/** "" means unrecorded — the API stores null and mobile drops the honorific. */
export type StudentSex = 'male' | 'female' | '';

export async function createFacultyStudent(
  name: string,
  email: string,
  sectionId: string,
  sex: StudentSex = '',
): Promise<{ data?: CreateStudentResponse; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, section_id: sectionId, sex }),
    });

    const json = await res.json() as { student?: CreateStudentResponse['student']; password?: string; warning?: string; error?: string };

    if (!res.ok) {
      return { error: json.error || 'Unable to create student' };
    }

    return { data: { student: json.student!, password: json.password, warning: json.warning } };
  } catch (err) {
    console.error('createFacultyStudent() failed', err);
    return { error: 'Unable to create student. Please try again.' };
  }
}

export interface StudentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  picture_url: string | null;
  sex: 'male' | 'female' | null;
  section_id: string | null;
  section: string | null;
}

export interface Section {
  id: string;
  name: string;
}

/** All sections (faculty/admin). */
export async function fetchSections(): Promise<Section[]> {
  try {
    const res = await apiFetch('/api/sections', { credentials: 'include' });
    const json = (await res.json()) as { sections?: Section[]; error?: string };
    if (!res.ok) {
      console.error('fetchSections() failed', json.error);
      return [];
    }
    return json.sections ?? [];
  } catch (err) {
    console.error('fetchSections() failed', err);
    return [];
  }
}

/** The signed-in faculty member's assigned sections (admin: all sections). */
export async function fetchFacultySections(): Promise<Section[]> {
  try {
    const res = await apiFetch('/api/faculty/sections', { credentials: 'include' });
    const json = (await res.json()) as { sections?: Section[]; error?: string };
    if (!res.ok) {
      console.error('fetchFacultySections() failed', json.error);
      return [];
    }
    return json.sections ?? [];
  } catch (err) {
    console.error('fetchFacultySections() failed', err);
    return [];
  }
}

export async function fetchAllStudentUsers(): Promise<StudentUser[]> {
  try {
    const res = await apiFetch('/api/faculty/students');
    const json = await res.json();

    if (!res.ok) {
      console.error('fetchAllStudentUsers() failed', json.error);
      return [];
    }

    return json.students ?? [];
  } catch (err) {
    console.error('fetchAllStudentUsers() failed', err);
    return [];
  }
}

export async function updateStudentUser(
  id: string,
  name: string,
  email: string,
  sectionId?: string,
  sex?: StudentSex,
): Promise<{ data?: StudentUser; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/students', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, email, section_id: sectionId, sex }),
    });

    const json = await res.json();

    if (!res.ok) {
      return { error: json.error || 'Unable to update student' };
    }

    return { data: json.student };
  } catch (err) {
    console.error('updateStudentUser() failed', err);
    return { error: 'Unable to update student. Please try again.' };
  }
}

export async function deleteStudentUser(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/faculty/students', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    const json = await res.json();

    if (!res.ok) {
      return { error: json.error || 'Unable to delete student' };
    }

    return { success: true };
  } catch (err) {
    console.error('deleteStudentUser() failed', err);
    return { error: 'Unable to delete student. Please try again.' };
  }
}

export async function fetchStudentScenarioHistory(studentId: string): Promise<ScenarioPerformance[]> {
  try {
    const res = await apiFetch(`/api/faculty/scenarios/assignments?student_id=${encodeURIComponent(studentId)}`, {
      credentials: 'include',
    });
    const json = (await res.json()) as { assignments?: ScenarioAssignment[]; error?: string };
    if (!res.ok) {
      console.error('fetchStudentScenarioHistory() failed', json.error);
      return [];
    }

    const completed = (json.assignments ?? []).filter((a) => a.status === 'completed');
    return completed.map((a) => ({
      id: a.id,
      student_id: a.student_id,
      student_name: a.student_name,
      scenario_id: a.scenario_id,
      scenario_title: a.scenario_title,
      score: a.score ?? 0,
      max_score: 100,
      time_taken: a.time_taken ?? 0,
      completed_tasks: a.completed_tasks ?? null,
      total_tasks: a.total_tasks ?? null,
      completed_at: a.completed_at ?? a.assigned_at,
    }));
  } catch (err) {
    console.error('fetchStudentScenarioHistory() failed', err);
    return [];
  }
}

export interface StudentAISummary {
  overview: string;
  strengths: string[];
  areas_for_improvement: string[];
  recommendations: string[];
}

export async function generateStudentSummary(
  studentId: string,
): Promise<{ summary?: StudentAISummary; generated_at?: string; error?: string }> {
  try {
    const res = await apiFetch(`/api/faculty/students/${studentId}/summary`, {
      method: 'POST',
      credentials: 'include',
    });
    const json = (await res.json()) as {
      summary?: StudentAISummary;
      generated_at?: string;
      error?: string;
    };

    if (!res.ok || !json.summary) {
      return { error: json.error || 'Unable to generate summary' };
    }

    return { summary: json.summary, generated_at: json.generated_at };
  } catch (err) {
    console.error('generateStudentSummary() failed', err);
    return { error: 'Unable to generate summary. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Taylor's skills catalog and skill-built scenarios
// ---------------------------------------------------------------------------

export interface SkillSummary {
  /** "1-7" */
  id: string;
  chapter: number;
  chapterId: string;
  /** The skill area (chapter), e.g. "Vital Signs". */
  area: string;
  title: string;
}

export interface SkillDetail extends SkillSummary {
  goal: string;
  steps: { id: string | null; position: number; stepNo: number; section: string | null; text: string }[];
  variants: { sections: string[]; alternatives: boolean; defaults: string[] };
}

/** A skill chosen for a scenario, with the variants to include (defaults when omitted). */
export interface SkillSelection {
  id: string;
  sections?: string[];
}

export interface SkillSuggestion {
  id: string;
  reason: string;
}

export async function fetchSkillCatalog(): Promise<SkillSummary[]> {
  try {
    const res = await apiFetch('/api/skills', { credentials: 'include' });
    const json = (await res.json()) as { skills?: SkillSummary[] };
    return res.ok ? (json.skills ?? []) : [];
  } catch (err) {
    console.error('fetchSkillCatalog() failed', err);
    return [];
  }
}

export async function fetchSkillDetails(ids: string[]): Promise<SkillDetail[]> {
  if (ids.length === 0) return [];
  try {
    const res = await apiFetch(`/api/skills?ids=${encodeURIComponent(ids.join(','))}`, { credentials: 'include' });
    const json = (await res.json()) as { skills?: SkillDetail[] };
    return res.ok ? (json.skills ?? []) : [];
  } catch (err) {
    console.error('fetchSkillDetails() failed', err);
    return [];
  }
}

/** The Taylor's skills a scenario calls for, detected from its text. */
export async function suggestScenarioSkills(input: {
  title: string;
  description?: string;
  learning_objectives?: string[];
  patient_id?: string | null;
  lesson_text?: string | null;
}): Promise<{ suggestions: SkillSuggestion[]; source: 'ai' | 'keywords' } | { error: string }> {
  try {
    const res = await apiFetch('/api/faculty/scenarios/suggest-skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as { suggestions?: SkillSuggestion[]; source?: 'ai' | 'keywords'; error?: string };
    if (!res.ok) return { error: json.error ?? 'Unable to detect skills' };
    return { suggestions: json.suggestions ?? [], source: json.source ?? 'keywords' };
  } catch (err) {
    console.error('suggestScenarioSkills() failed', err);
    return { error: 'Unable to detect skills' };
  }
}

export interface ScenarioSkillTask {
  id: string;
  title: string;
  skill_id: string | null;
  /** How many students already have a grade on it. */
  graded: number;
}

export async function fetchScenarioSkillTasks(scenarioId: string): Promise<ScenarioSkillTask[] | null> {
  try {
    const res = await apiFetch(`/api/faculty/scenarios/${scenarioId}/skills`, { credentials: 'include' });
    const json = (await res.json()) as { tasks?: ScenarioSkillTask[] };
    return res.ok ? (json.tasks ?? []) : null;
  } catch (err) {
    console.error('fetchScenarioSkillTasks() failed', err);
    return null;
  }
}

export async function addScenarioSkills(
  scenarioId: string,
  skills: SkillSelection[],
): Promise<{ added: number } | { error: string }> {
  try {
    const res = await apiFetch(`/api/faculty/scenarios/${scenarioId}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ skills }),
    });
    const json = (await res.json()) as { added?: number; error?: string };
    return res.ok ? { added: json.added ?? 0 } : { error: json.error ?? 'Unable to add the skills' };
  } catch (err) {
    console.error('addScenarioSkills() failed', err);
    return { error: 'Unable to add the skills' };
  }
}

export async function removeScenarioTask(scenarioId: string, taskId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/faculty/scenarios/${scenarioId}/skills?task_id=${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok;
  } catch (err) {
    console.error('removeScenarioTask() failed', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export interface TeamMemberInfo {
  id: string;
  name: string;
  picture_url: string | null;
  sex: 'male' | 'female' | null;
}

export interface FacultyTeam {
  id: string;
  section_id: string;
  name: string;
  /** Supervising faculty member, or null. */
  faculty_id: string | null;
  faculty_name: string | null;
  members: TeamMemberInfo[];
}

export interface TeamsOverview {
  /** False before migration 048. */
  enabled: boolean;
  /** False before migration 051 (faculty per group). */
  faculty_enabled: boolean;
  /** The signed-in user, so a faculty member can pick out their own groups. */
  viewer_id: string;
  /** Every faculty member, for an admin assigning groups; empty for faculty. */
  faculty: { id: string; name: string }[];
  sections: { id: string; name: string }[];
  teams: FacultyTeam[];
  students: (TeamMemberInfo & { section_id: string; team_id: string | null })[];
}

export async function fetchFacultyTeams(): Promise<TeamsOverview | null> {
  try {
    const res = await apiFetch('/api/faculty/teams', { credentials: 'include' });
    const json = (await res.json()) as TeamsOverview & { error?: string };
    if (!res.ok) {
      console.error('fetchFacultyTeams() failed', json.error);
      return null;
    }
    return json;
  } catch (err) {
    console.error('fetchFacultyTeams() failed', err);
    return null;
  }
}

async function teamRequest(url: string, method: string, body?: unknown): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await apiFetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: json.error ?? 'Something went wrong' };
  } catch (err) {
    console.error(`${method} ${url} failed`, err);
    return { error: 'Something went wrong' };
  }
}

export const createTeam = (sectionId: string, name: string) =>
  teamRequest('/api/faculty/teams', 'POST', { section_id: sectionId, name });

export const renameTeam = (teamId: string, name: string) =>
  teamRequest(`/api/faculty/teams/${teamId}`, 'PATCH', { name });

export const assignTeamFaculty = (teamId: string, facultyId: string | null) =>
  teamRequest(`/api/faculty/teams/${teamId}`, 'PATCH', { faculty_id: facultyId });

export const deleteTeam = (teamId: string) => teamRequest(`/api/faculty/teams/${teamId}`, 'DELETE');

export const moveStudentToTeam = (studentId: string, teamId: string | null) =>
  teamRequest('/api/faculty/teams/members', 'PUT', { student_id: studentId, team_id: teamId });

export const autoSplitTeams = (sectionId: string, count: number) =>
  teamRequest('/api/faculty/teams/auto', 'POST', { section_id: sectionId, count });

/** One group's averages over its members' individual grades. */
export interface GroupSummary {
  team_id: string;
  name: string;
  section_id: string;
  section_name: string | null;
  faculty_id: string | null;
  faculty_name: string | null;
  members: number;
  scenarios: { assigned: number; graded: number; cases: number; average: number | null };
  assessments: { taken: number; average: number | null };
}

export async function fetchGroupSummaries(): Promise<{ viewer_id: string | null; groups: GroupSummary[] } | null> {
  try {
    const res = await apiFetch('/api/faculty/teams/summary', { credentials: 'include' });
    const json = (await res.json()) as { viewer_id?: string; groups?: GroupSummary[]; error?: string };
    if (!res.ok) {
      console.error('fetchGroupSummaries() failed', json.error);
      return null;
    }
    return { viewer_id: json.viewer_id ?? null, groups: json.groups ?? [] };
  } catch (err) {
    console.error('fetchGroupSummaries() failed', err);
    return null;
  }
}

/** One member's case in a group split. */
export interface GroupCasePlan {
  student_id: string;
  student_name: string;
  scenario_id: string;
  scenario_title: string;
  patient_name: string | null;
}

/**
 * Give a group its cases: each member gets a different scenario from the pool.
 * With `preview` nothing is written; the same input then assigns the same split.
 */
export async function assignGroupCases(
  teamId: string,
  input: { scenario_ids: string[]; deadline?: string; required?: boolean; preview?: boolean },
): Promise<{ plan: GroupCasePlan[] } | { error: string }> {
  try {
    const res = await apiFetch(`/api/faculty/teams/${teamId}/assign-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as { plan?: GroupCasePlan[]; error?: string };
    if (!res.ok || !json.plan) return { error: json.error ?? 'Something went wrong' };
    return { plan: json.plan };
  } catch (err) {
    console.error('assignGroupCases() failed', err);
    return { error: 'Something went wrong' };
  }
}

// ---------------------------------------------------------------------------
// Reflections and goals
// ---------------------------------------------------------------------------

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
  source_type?: ReflectionSource | null;
  source_id?: string | null;
}

export interface ReflectionState {
  enabled: boolean;
  work: { title: string; score: number | null; graded_at: string | null; items: GradedItem[] };
  reflection: { text: string; updated_at: string } | null;
  goals: StudentGoal[];
  feedback: ReflectionFeedback | null;
  feedback_stale: boolean;
}

export async function fetchReflection(source: ReflectionSource, sourceId: string): Promise<ReflectionState | null> {
  try {
    const res = await apiFetch(`/api/student/reflections?source_type=${source}&source_id=${encodeURIComponent(sourceId)}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as ReflectionState;
  } catch (err) {
    console.error('fetchReflection() failed', err);
    return null;
  }
}

export async function requestReflectionFeedback(
  source: ReflectionSource,
  sourceId: string,
): Promise<ReflectionFeedback | { error: string }> {
  try {
    const res = await apiFetch('/api/student/reflections/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ source_type: source, source_id: sourceId }),
    });
    const json = (await res.json()) as { feedback?: ReflectionFeedback; error?: string };
    return res.ok && json.feedback ? json.feedback : { error: json.error ?? 'Unable to get feedback' };
  } catch (err) {
    console.error('requestReflectionFeedback() failed', err);
    return { error: 'Unable to get feedback' };
  }
}

export async function saveReflection(
  source: ReflectionSource,
  sourceId: string,
  reflection: string,
  goals: { text: string; skill_id: string | null }[],
): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await apiFetch('/api/student/reflections', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ source_type: source, source_id: sourceId, reflection, goals }),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: json.error ?? 'Unable to save' };
  } catch (err) {
    console.error('saveReflection() failed', err);
    return { error: 'Unable to save' };
  }
}

export async function fetchStudentGoals(): Promise<StudentGoal[]> {
  try {
    const res = await apiFetch('/api/student/goals', { credentials: 'include' });
    const json = (await res.json()) as { goals?: StudentGoal[] };
    return res.ok ? (json.goals ?? []) : [];
  } catch (err) {
    console.error('fetchStudentGoals() failed', err);
    return [];
  }
}

export async function setGoalStatus(goalId: string, status: 'open' | 'met'): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/student/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    return res.ok;
  } catch (err) {
    console.error('setGoalStatus() failed', err);
    return false;
  }
}

export interface FacultyReflection {
  id: string;
  source_type: ReflectionSource;
  title: string;
  score: number | null;
  reflection: string;
  feedback_summary: string | null;
  updated_at: string;
  goals: { id: string; text: string; skill_id: string | null; status: 'open' | 'met'; met_at: string | null }[];
}

export async function fetchStudentReflections(studentId: string): Promise<{ enabled: boolean; reflections: FacultyReflection[] }> {
  try {
    const res = await apiFetch(`/api/faculty/students/${studentId}/reflections`, { credentials: 'include' });
    const json = (await res.json()) as { enabled?: boolean; reflections?: FacultyReflection[] };
    return res.ok ? { enabled: json.enabled ?? true, reflections: json.reflections ?? [] } : { enabled: true, reflections: [] };
  } catch (err) {
    console.error('fetchStudentReflections() failed', err);
    return { enabled: true, reflections: [] };
  }
}
