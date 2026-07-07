export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'faculty' | 'admin';
  picture_url?: string | null;
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

// Authentication Functions
export async function login(email: string, password: string): Promise<{ user: User; sessionToken: string } | null> {
  try {
    const res = await fetch('/api/auth/login', {
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

export async function register(
  name: string,
  email: string,
  password: string,
  role: User['role'],
): Promise<{ user: User; sessionToken: string } | null> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role }),
    });
    if (!res.ok) return null;
    const { user, sessionToken } = (await res.json()) as {
      user: User;
      sessionToken: string;
    };
    mirrorToStorage(user);
    return { user, sessionToken };
  } catch (err) {
    console.error('register() failed', err);
    return null;
  }
}

export interface GooglePendingProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export async function getPendingGoogleProfile(): Promise<GooglePendingProfile | null> {
  try {
    const res = await fetch('/api/auth/google/pending', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const { profile } = (await res.json()) as { profile: GooglePendingProfile };
    return profile;
  } catch (err) {
    console.error('getPendingGoogleProfile() failed', err);
    return null;
  }
}

export async function registerGoogle(
  role: User['role'],
): Promise<{ user: User; sessionToken: string } | null> {
  try {
    const res = await fetch('/api/auth/google/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });
    if (!res.ok) return null;
    const { user, sessionToken } = (await res.json()) as {
      user: User;
      sessionToken: string;
    };
    mirrorToStorage(user);
    return { user, sessionToken };
  } catch (err) {
    console.error('registerGoogle() failed', err);
    return null;
  }
}

export async function logout(): Promise<void> {
  mirrorToStorage(null);
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
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
    const res = await fetch(SESSION_ENDPOINT, { credentials: 'include' });
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
    const res = await fetch('/api/users/profile', {
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

    const res = await fetch('/api/users/avatar', {
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
    const res = await fetch(
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
    const res = await fetch('/api/users/change-password', {
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
    const res = await fetch('/api/users/change-password', {
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
    const res = await fetch('/api/users/change-password', {
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
    const res = await fetch(`/api/patients${query ? `?${query}` : ''}`, {
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
    const res = await fetch('/api/student/assessments', { credentials: 'include' });
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
    const res = await fetch(`/api/student/assessments/${assessmentId}/attempts`, {
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
    const res = await fetch(`/api/student/attempts/${attemptId}/submit`, {
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

// Faculty API Types
export interface FacultyStats {
  total_students: number;
  at_risk_students: number;
  active_alerts: number;
  completed_reviews: number;
  active_scenarios: number;
  pending_scenarios: number;
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
  student_id: string;
  name: string;
  email: string;
  program: string;
  year: number;
  average_score: number;
  quiz_count: number;
  risk_level?: 'low' | 'medium' | 'high';
  last_activity: string;
}

export interface SimulationScenario {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  category: string;
  patient_case: any;
  learning_objectives: string[];
  is_ai_generated: boolean;
  student_count: number;
  created_at: string;
}

export interface ScenarioAssignment {
  id: string;
  scenario_id: string;
  scenario_title: string;
  student_id: string;
  student_name: string;
  assigned_at: string;
  deadline: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  required: boolean;
  score?: number;
  completed_at?: string;
  time_taken?: number;
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
  completed_tasks: string[];
  total_tasks: number;
  completed_at: string;
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
  room_number: string;
  diagnosis: string;
  admission_date: string;
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
  faculty_id: string;
  faculty_name: string;
  tab: string;
  action: string;
  details: string;
  target_type?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface FacultyAnalytics {
  cohort_performance: {
    average_score: number;
    total_quizzes: number;
    completion_rate: number;
    improvement_trend: string;
  };
  risk_distribution: {
    low: number;
    medium: number;
    high: number;
  };
  competency_breakdown: Record<string, number>;
  performance_trend: { week: string; average: number }[];
  ml_insights: { type: string; message: string; priority: string }[];
}

// Mock Faculty Data
const generateMockFacultyStudents = (): FacultyStudent[] => [
  {
    id: 'fs-001',
    student_id: 'student-001',
    name: 'Maria Cruz',
    email: 'maria.cruz@student.edu',
    program: 'Bachelor of Science in Nursing',
    year: 2,
    average_score: 82,
    quiz_count: 12,
    risk_level: 'low',
    last_activity: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'fs-002',
    student_id: 'student-002',
    name: 'Juan Reyes',
    email: 'juan.reyes@student.edu',
    program: 'Bachelor of Science in Nursing',
    year: 2,
    average_score: 65,
    quiz_count: 8,
    risk_level: 'high',
    last_activity: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'fs-003',
    student_id: 'student-003',
    name: 'Anna Santos',
    email: 'anna.santos@student.edu',
    program: 'Bachelor of Science in Nursing',
    year: 2,
    average_score: 75,
    quiz_count: 10,
    risk_level: 'medium',
    last_activity: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'fs-004',
    student_id: 'student-004',
    name: 'Carlos Diaz',
    email: 'carlos.diaz@student.edu',
    program: 'Bachelor of Science in Nursing',
    year: 2,
    average_score: 88,
    quiz_count: 15,
    risk_level: 'low',
    last_activity: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
];

// Faculty API Functions
export async function fetchFacultyDashboard(): Promise<{ stats: FacultyStats; recent_activities: AuditLog[] } | null> {
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const stats: FacultyStats = {
    total_students: 48,
    at_risk_students: 8,
    active_alerts: 5,
    completed_reviews: 32,
    active_scenarios: 12,
    pending_scenarios: 4,
  };

  const recentActivities: AuditLog[] = [
    {
      id: 'audit-001',
      faculty_id: '',
      faculty_name: 'Maria Cruz',
      tab: 'overview',
      action: 'Quiz Submitted',
      details: 'Student completed Cardiac Assessment Basics',
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 'audit-002',
      faculty_id: '',
      faculty_name: 'Dr. Juan Dela Cruz',
      tab: 'scenarios',
      action: 'Scenario Assigned',
      details: 'Hypertension Crisis Response assigned to 5 students',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'audit-003',
      faculty_id: '',
      faculty_name: 'System',
      tab: 'overview',
      action: 'Alert Created',
      details: 'At-risk alert for student Juan Reyes',
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    },
  ];

  return { stats, recent_activities: recentActivities };
}

export async function fetchFacultyStudents(riskLevel?: string, search?: string): Promise<FacultyStudent[]> {
  try {
    const res = await fetch('/api/faculty/students', { credentials: 'include' });
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

export async function fetchFacultyStudentDetail(studentId: string): Promise<{ student: FacultyStudent; performance_history: any[]; competencies: Record<string, number> } | null> {
  try {
    const res = await fetch(`/api/faculty/students/${studentId}`, { credentials: 'include' });
    const json = (await res.json()) as { student?: FacultyStudent; error?: string };
    if (!res.ok || !json.student) {
      console.error('fetchFacultyStudentDetail() failed', json.error);
      return null;
    }

    return {
      student: json.student,
      performance_history: await fetchStudentScenarioHistory(studentId),
      competencies: {
        'Cardiac Assessment': 85,
        'Vital Signs': 90,
        'Patient Communication': 88,
        'Diabetes Care': 72,
        'Emergency Response': 78,
      },
    };
  } catch (err) {
    console.error('fetchFacultyStudentDetail() failed', err);
    return null;
  }
}

export async function fetchAtRiskStudents(): Promise<FacultyStudent[]> {
  await new Promise(resolve => setTimeout(resolve, 200));
  const students = generateMockFacultyStudents();
  return students.filter(s => s.risk_level === 'high' || s.risk_level === 'medium');
}

export async function fetchFacultyScenarios(): Promise<SimulationScenario[]> {
  try {
    const res = await fetch('/api/faculty/scenarios', {
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

export async function createScenario(scenario: Partial<SimulationScenario>): Promise<SimulationScenario | null> {
  try {
    const res = await fetch('/api/faculty/scenarios', {
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

export async function generateAIScenario(
  prompt: string,
  patientId?: string,
): Promise<Partial<SimulationScenario> | { error: string }> {
  try {
    const res = await fetch('/api/faculty/scenarios/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ prompt, patient_id: patientId }),
    });

    const json = (await res.json()) as { scenario?: Partial<SimulationScenario>; error?: string };
    if (!res.ok || !json.scenario) {
      return { error: json.error || `Request failed (${res.status})` };
    }

    return {
      title: json.scenario.title || 'AI Generated Scenario',
      description: json.scenario.description || prompt,
      difficulty: json.scenario.difficulty || 'intermediate',
      category: json.scenario.category || 'AI Generated',
      patient_case: json.scenario.patient_case || { generated_by_ai: true },
      learning_objectives: json.scenario.learning_objectives || ['Demonstrate clinical assessment skills'],
      is_ai_generated: true,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unable to generate scenario' };
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
    const res = await fetch('/api/faculty/scenarios/suggest', {
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
    const res = await fetch(`/api/faculty/scenarios/${id}`, {
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
    const res = await fetch(`/api/faculty/scenarios/${id}`, {
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
    const res = await fetch(`/api/scenarios/${id}`, {
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
    const res = await fetch(`/api/faculty/patients${query ? `?${query}` : ''}`, {
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
    const res = await fetch('/api/faculty/patients', {
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
    const res = await fetch('/api/faculty/patients', {
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

export async function deleteFacultyPatient(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await fetch('/api/faculty/patients', {
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

export async function fetchFacultyPatientDetail(patientId: string): Promise<{ patient: FacultyPatient; clinical_decision_support: any } | null> {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const patients = await fetchFacultyPatients();
  const patient = patients.find(p => p.id === patientId);
  
  if (!patient) return null;

  return {
    patient,
    clinical_decision_support: {
      recommendations: ['Monitor cardiac enzymes', 'Continue ECG monitoring', 'Administer antiplatelet therapy'],
      warnings: ['High heart rate - potential arrhythmia', 'Elevated blood pressure'],
    },
  };
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

export async function fetchFacultyNotifications(): Promise<{ notifications: FacultyNotification[]; total: number; unread: number } | null> {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const notifications: FacultyNotification[] = [
    {
      id: 'notif-001',
      title: 'Student Quiz Submission',
      message: 'Maria Cruz completed Cardiac Assessment Basics quiz',
      type: 'info',
      is_read: false,
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      student_id: 'student-001',
    },
    {
      id: 'notif-002',
      title: 'At-Risk Alert',
      message: 'Juan Reyes performance is declining',
      type: 'warning',
      is_read: false,
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      student_id: 'student-002',
    },
    {
      id: 'notif-003',
      title: 'Scenario Completion',
      message: 'Anna Santos completed Diabetic Patient Education scenario',
      type: 'success',
      is_read: true,
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      student_id: 'student-003',
    },
  ];

  return {
    notifications,
    total: notifications.length,
    unread: notifications.filter(n => !n.is_read).length,
  };
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return true;
}

export async function fetchFacultyAlerts(status?: string): Promise<{ alerts: FacultyAlert[]; total: number; pending: number } | null> {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const alerts: FacultyAlert[] = [
    {
      id: 'alert-001',
      student_id: 'student-002',
      student_name: 'Juan Reyes',
      alert_type: 'Low Performance',
      severity: 'high',
      description: 'Average score below 70%, requires intervention',
      status: 'pending',
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'alert-002',
      student_id: 'student-003',
      student_name: 'Anna Santos',
      alert_type: 'Low Engagement',
      severity: 'medium',
      description: 'No activity in past 48 hours',
      status: 'pending',
      created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
  ];

  let filtered = alerts;
  if (status && status !== 'all') {
    filtered = alerts.filter(a => a.status === status);
  }

  return {
    alerts: filtered,
    total: alerts.length,
    pending: alerts.filter(a => a.status === 'pending').length,
  };
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
  const res = await fetch(`/api/faculty/audit?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.logs ?? [];
}

export async function logAuditAction(payload: AuditLogInsert): Promise<void> {
  try {
    await fetch('/api/faculty/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // silently fail — audit should never break the app
  }
}

export async function clearAuditTrail(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/faculty/audit', { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.error ?? 'Failed to clear audit trail' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Network error' };
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

export async function fetchFacultyAnalytics(): Promise<FacultyAnalytics | null> {
  await new Promise(resolve => setTimeout(resolve, 300));
  
  return {
    cohort_performance: {
      average_score: 82,
      total_quizzes: 240,
      completion_rate: 85,
      improvement_trend: 'up',
    },
    risk_distribution: {
      low: 35,
      medium: 8,
      high: 5,
    },
    competency_breakdown: {
      'Cardiac Assessment': 82,
      'Vital Signs': 85,
      'Patient Communication': 80,
      'Diabetes Care': 72,
      'Emergency Response': 78,
    },
    performance_trend: [
      { week: 'Week 1', average: 78 },
      { week: 'Week 2', average: 80 },
      { week: 'Week 3', average: 82 },
      { week: 'Week 4', average: 85 },
    ],
    ml_insights: [
      { type: 'risk', message: 'Juan Reyes shows declining performance', priority: 'high' },
      { type: 'opportunity', message: 'Carlos Diaz ready for advanced scenarios', priority: 'medium' },
    ],
  };
}

export async function predictStudentRisk(studentId: string): Promise<any | null> {
  await new Promise(resolve => setTimeout(resolve, 400));
  
  return {
    student_id: studentId,
    risk_score: 0.65,
    risk_level: 'medium',
    factors: ['Lower average scores', 'Decreased engagement', 'Inconsistent performance'],
    recommendations: ['Schedule tutoring session', 'Offer peer mentoring', 'Provide additional resources'],
  };
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
    const res = await fetch(url, { credentials: 'include' });
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

export async function assignScenarioToStudents(
  scenarioId: string,
  studentIds: string[],
  deadline: string,
  required: boolean
): Promise<ScenarioAssignment[]> {
  try {
    const res = await fetch(`/api/faculty/scenarios/${scenarioId}/assign`, {
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
    const res = await fetch('/api/student/scenarios', { credentials: 'include' });
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

export async function submitScenarioPerformance(
  assignmentId: string,
  completedTasks: string[],
  timeTaken: number
): Promise<ScenarioPerformance | null> {
  try {
    // Derive a simple score from completed tasks (placeholder scoring).
    const totalTasks = 8;
    const score = Math.round((completedTasks.length / totalTasks) * 100);

    const res = await fetch(`/api/student/scenarios/${assignmentId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ score, time_taken: timeTaken }),
    });
    const json = (await res.json()) as { assignment?: ScenarioAssignment; error?: string };
    if (!res.ok || !json.assignment) {
      console.error('submitScenarioPerformance() failed', json.error);
      return null;
    }

    return {
      id: json.assignment.id,
      student_id: json.assignment.student_id,
      student_name: json.assignment.student_name,
      scenario_id: json.assignment.scenario_id,
      scenario_title: json.assignment.scenario_title,
      score: json.assignment.score ?? 0,
      max_score: 100,
      time_taken: json.assignment.time_taken ?? 0,
      completed_tasks: completedTasks,
      total_tasks: totalTasks,
      completed_at: json.assignment.completed_at ?? new Date().toISOString(),
    };
  } catch (err) {
    console.error('submitScenarioPerformance() failed', err);
    return null;
  }
}

export async function createFacultyStudent(
  name: string,
  email: string,
): Promise<{ data?: CreateStudentResponse; error?: string }> {
  try {
    const res = await fetch('/api/faculty/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
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
}

export async function fetchAllStudentUsers(): Promise<StudentUser[]> {
  try {
    const res = await fetch('/api/faculty/students');
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
): Promise<{ data?: StudentUser; error?: string }> {
  try {
    const res = await fetch('/api/faculty/students', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, email }),
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
    const res = await fetch('/api/faculty/students', {
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
    const res = await fetch(`/api/faculty/scenarios/assignments?student_id=${encodeURIComponent(studentId)}`, {
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
      completed_tasks: [],
      total_tasks: 8,
      completed_at: a.completed_at ?? a.assigned_at,
    }));
  } catch (err) {
    console.error('fetchStudentScenarioHistory() failed', err);
    return [];
  }
}
