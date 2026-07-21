// Change this to your server's IP when testing on a physical device
// Android emulator: 10.0.2.2, iOS simulator: localhost
import { Platform } from 'react-native';

const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_BASE_URL = `http://${DEV_HOST}:3001/api`;

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function apiPost<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function apiPut<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Auth
export function loginApi(email: string, password: string) {
  return apiPost<{ user: any }>('/auth/login', { email, password });
}

export function registerApi(data: { name: string; email: string; password: string; cohort?: string; studentId?: string }) {
  return apiPost<{ user: any }>('/auth/register', data);
}

// Patients
export function getPatients() {
  return apiGet<any[]>('/patients');
}

export function getPatientById(id: string) {
  return apiGet<any>(`/patients/${id}`);
}

// Vital Signs
export function getVitalSignsForPatient(patientId: string) {
  return apiGet<any[]>(`/vitals/patient/${patientId}`);
}

// Tasks
export function getTasks(status?: string) {
  const qs = status ? `?status=${status}` : '';
  return apiGet<any[]>(`/tasks${qs}`);
}

export function updateTaskStatus(id: string, status: string) {
  return apiPut<any>(`/tasks/${id}`, { status });
}

// Quizzes
export function getQuizzes() {
  return apiGet<any[]>('/quizzes');
}

export function getQuizQuestions(quizId: string) {
  return apiGet<any[]>(`/quizzes/${quizId}/questions`);
}

// EHR
export function getEHRForPatient(patientId: string) {
  return apiGet<any[]>(`/ehr/patient/${patientId}`);
}

// Performance
export function getPerformanceLogs(userId?: string) {
  const qs = userId ? `?userId=${userId}` : '';
  return apiGet<any[]>(`/progress${qs}`);
}

// TPR
export function getTPRForPatient(patientId: string) {
  return apiGet<any[]>(`/tpr/patient/${patientId}`);
}

// IVF
export function getIVFForPatient(patientId: string) {
  return apiGet<any[]>(`/ivf/patient/${patientId}`);
}

// Notifications
export function getNotifications(userId?: string) {
  const qs = userId ? `?userId=${userId}` : '';
  return apiGet<any[]>(`/notifications${qs}`);
}

export function markNotificationRead(id: string) {
  return apiPut<any>(`/notifications/${id}/read`);
}

// Health
export function healthCheck() {
  return apiGet<{ status: string }>('/health');
}
