import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Overview | iCARE++",
};

interface StudentPerformance {
  id: string;
  name: string;
  email: string;
  quizzes_completed: number;
  average_score: number;
  at_risk: boolean;
  last_active: string;
}

interface Room {
  id: string;
  name: string;
  capacity: number;
  status: 'active' | 'inactive';
  students_assigned: number;
  floor: number;
}

interface Faculty {
  id: string;
  name: string;
  email: string;
  department: string;
  specialization: string;
  status: 'active' | 'inactive';
  student_count: number;
  years_experience: number;
}

interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'faculty' | 'administrator' | 'super_admin';
  status: 'active' | 'inactive';
  created_at: string;
  last_login: string;
}

const mockStudents: StudentPerformance[] = [
  { id: "1", name: "John Smith", email: "john@icare.edu", quizzes_completed: 8, average_score: 88, at_risk: false, last_active: "Today" },
  { id: "2", name: "Sarah Johnson", email: "sarah@icare.edu", quizzes_completed: 6, average_score: 75, at_risk: false, last_active: "Yesterday" },
  { id: "3", name: "Mike Williams", email: "mike@icare.edu", quizzes_completed: 3, average_score: 45, at_risk: true, last_active: "3 days ago" },
  { id: "4", name: "Emily Brown", email: "emily@icare.edu", quizzes_completed: 9, average_score: 92, at_risk: false, last_active: "Today" },
  { id: "5", name: "David Lee", email: "david@icare.edu", quizzes_completed: 5, average_score: 62, at_risk: true, last_active: "2 days ago" },
  { id: "6", name: "Lisa Garcia", email: "lisa@icare.edu", quizzes_completed: 7, average_score: 81, at_risk: false, last_active: "Today" },
  { id: "7", name: "James Wilson", email: "james@icare.edu", quizzes_completed: 4, average_score: 55, at_risk: true, last_active: "1 week ago" },
  { id: "8", name: "Anna Martinez", email: "anna@icare.edu", quizzes_completed: 8, average_score: 85, at_risk: false, last_active: "Today" },
];

const mockRooms: Room[] = [
  { id: "1", name: "Room 1", capacity: 10, status: "active", students_assigned: 8, floor: 1 },
  { id: "2", name: "Room 2", capacity: 10, status: "active", students_assigned: 6, floor: 1 },
  { id: "3", name: "Room 3", capacity: 8, status: "active", students_assigned: 8, floor: 2 },
  { id: "4", name: "Room 4", capacity: 8, status: "inactive", students_assigned: 0, floor: 2 },
  { id: "5", name: "Room 5", capacity: 12, status: "active", students_assigned: 5, floor: 2 },
  { id: "6", name: "Room 6", capacity: 10, status: "active", students_assigned: 7, floor: 3 },
];

const mockFaculty: Faculty[] = [
  { id: "1", name: "Dr. Maria Santos", email: "maria.santos@icare.edu", department: "Nursing", specialization: "Medical-Surgical Nursing", status: "active", student_count: 15, years_experience: 12 },
  { id: "2", name: "Prof. James Rivera", email: "james.rivera@icare.edu", department: "Nursing", specialization: "Maternal and Child Health", status: "active", student_count: 12, years_experience: 8 },
  { id: "3", name: "Ms. Anna Cruz", email: "anna.cruz@icare.edu", department: "Nursing", specialization: "Psychiatric Nursing", status: "active", student_count: 10, years_experience: 5 },
  { id: "4", name: "Mr. Robert Tan", email: "robert.tan@icare.edu", department: "Nursing", specialization: "Community Health", status: "inactive", student_count: 0, years_experience: 15 },
  { id: "5", name: "Dr. Carmen Lim", email: "carmen.lim@icare.edu", department: "Nursing", specialization: "Nursing Informatics", status: "active", student_count: 18, years_experience: 10 },
];

const mockUsers: UserAccount[] = [
  { id: "1", name: "John Smith", email: "john.smith@icare.edu", role: "student", status: "active", created_at: "2024-01-15", last_login: "2024-03-20" },
  { id: "9", name: "Dr. Maria Santos", email: "maria.santos@icare.edu", role: "administrator", status: "active", created_at: "2023-06-01", last_login: "2024-03-20" },
  { id: "13", name: "Admin Super", email: "admin.super@icare.edu", role: "super_admin", status: "active", created_at: "2023-01-01", last_login: "2024-03-20" },
];

export default function AdminDashboard() {
  const students = mockStudents;
  const rooms = mockRooms;
  const faculty = mockFaculty;
  const users = mockUsers;

  const atRiskStudents = students.filter(s => s.at_risk);
  const totalStudents = students.length;
  const averageScore = Math.round(students.reduce((sum, s) => sum + s.average_score, 0) / students.length);
  const totalQuizzes = students.reduce((sum, s) => sum + s.quizzes_completed, 0);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-[#1B6B7B] rounded-full text-xs sm:text-sm font-medium w-fit mb-3">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Admin Dashboard
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome back, Dean</h1>
            <p className="text-gray-500 mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} • Here's what's happening today
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <button className="w-12 h-12 sm:w-14 sm:h-14 bg-[#1B6B7B] hover:bg-[#145a63] transition-colors rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#1B6B7B]/20">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <span className="px-2 py-1 bg-[#1B6B7B]/10 text-[#1B6B7B] rounded-full text-xs font-medium">+12%</span>
          </div>
          <p className="text-4xl font-bold text-gray-800 mb-1">{totalStudents}</p>
          <p className="text-gray-500 text-sm">Total Students</p>
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">Monthly Growth</p>
            <div className="flex items-end gap-1 h-8">
              {[60, 75, 70, 85, 100].map((v, i) => (
                <div key={i} className="flex-1 bg-gray-100 rounded-t">
                  <div className="w-full bg-[#1B6B7B] rounded-t" style={{ height: `${v}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <span className="px-2 py-1 bg-rose-50 text-rose-600 rounded-full text-xs font-medium">Needs attention</span>
          </div>
          <p className="text-4xl font-bold text-gray-800 mb-1">{atRiskStudents.length}</p>
          <p className="text-gray-500 text-sm">Students at Risk</p>
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">Risk Trend (5 weeks)</p>
            <div className="h-8 flex items-end gap-1">
              {[3, 4, 2, 3, 3].map((v, i) => (
                <div key={i} className="flex-1 bg-gray-100 rounded-t">
                  <div className="w-full bg-rose-400 rounded-t" style={{ height: `${(v / 4) * 100}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="px-2 py-1 bg-[#1B6B7B]/10 text-[#1B6B7B] rounded-full text-xs font-medium">+8%</span>
          </div>
          <p className="text-4xl font-bold text-gray-800 mb-1">{averageScore}%</p>
          <p className="text-gray-500 text-sm">Average Score</p>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Passing threshold: 75%</span>
              <span className={`text-xs font-medium ${averageScore >= 75 ? 'text-emerald-600' : 'text-rose-600'}`}>{averageScore >= 75 ? 'Above threshold' : 'Below threshold'}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#1B6B7B] to-[#2a8a98] rounded-full" style={{ width: `${Math.min(averageScore, 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="px-2 py-1 bg-[#1B6B7B]/10 text-[#1B6B7B] rounded-full text-xs font-medium">Active</span>
          </div>
          <p className="text-4xl font-bold text-gray-800 mb-1">{totalQuizzes}</p>
          <p className="text-gray-500 text-sm">Quizzes Completed</p>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Target: 100 quizzes</span>
              <span className="text-xs font-medium text-[#1B6B7B]">{totalQuizzes >= 100 ? 'Target reached' : `${Math.round((totalQuizzes / 100) * 100)}% of target`}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#1B6B7B] to-[#2a8a98] rounded-full" style={{ width: `${Math.min(totalQuizzes, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="md:col-span-2 lg:col-span-2 bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">Weekly Activity Heatmap</h3>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-3 h-3 bg-[#1B6B7B]/10 rounded" />
                <div className="w-3 h-3 bg-[#1B6B7B]/30 rounded" />
                <div className="w-3 h-3 bg-[#1B6B7B]/50 rounded" />
                <div className="w-3 h-3 bg-[#1B6B7B]/70 rounded" />
                <div className="w-3 h-3 bg-[#1B6B7B] rounded" />
              </div>
              <span>More</span>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-4 sm:grid-cols-7 gap-1 sm:gap-2 auto-rows-fr overflow-x-auto">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, dayIdx) => (
              <div key={day} className="flex flex-col">
                <p className="text-xs font-medium text-gray-600 mb-1 text-center">{day}</p>
                <div className="flex-1 flex flex-col gap-1">
                  {['9AM', '12PM', '3PM', '6PM'].map((time) => {
                    const intensity = Math.random();
                    const bgClass = intensity > 0.75 ? 'bg-[#1B6B7B]' : intensity > 0.5 ? 'bg-[#1B6B7B]/70' : intensity > 0.25 ? 'bg-[#1B6B7B]/50' : 'bg-[#1B6B7B]/20';
                    return (
                      <div key={time} className={`flex-1 rounded ${bgClass}`} />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {['9AM', '12PM', '3PM', '6PM'].map(time => (
              <span key={time} className="text-[10px] text-gray-400">{time}</span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          </div>
          <div className="space-y-3">
            <Link href="/admin/student-management" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1B6B7B]/5 transition-colors text-left group">
              <div className="w-8 h-8 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center group-hover:bg-[#1B6B7B] group-hover:text-white transition-all">
                <svg className="w-4 h-4 text-[#1B6B7B] group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-[#1B6B7B]">Enroll Student</span>
            </Link>
            <Link href="/admin/reports" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1B6B7B]/5 transition-colors text-left group">
              <div className="w-8 h-8 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center group-hover:bg-[#1B6B7B] group-hover:text-white transition-all">
                <svg className="w-4 h-4 text-[#1B6B7B] group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-[#1B6B7B]">Generate Report</span>
            </Link>
            <Link href="/admin/analytics" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1B6B7B]/5 transition-colors text-left group">
              <div className="w-8 h-8 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center group-hover:bg-[#1B6B7B] group-hover:text-white transition-all">
                <svg className="w-4 h-4 text-[#1B6B7B] group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-[#1B6B7B]">View Analytics</span>
            </Link>
            <Link href="/admin/rooms" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1B6B7B]/5 transition-colors text-left group">
              <div className="w-8 h-8 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center group-hover:bg-[#1B6B7B] group-hover:text-white transition-all">
                <svg className="w-4 h-4 text-[#1B6B7B] group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-[#1B6B7B]">Manage Rooms</span>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          </div>
          <div className="space-y-4">
            {[
              { user: 'Emily Brown', action: 'completed quiz', time: '2 min ago', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
              { user: 'John Smith', action: 'logged in', time: '15 min ago', icon: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1' },
              { user: 'Dr. Maria Santos', action: 'added question', time: '1 hour ago', icon: 'M12 4v16m8-8H4' },
              { user: 'Sarah Johnson', action: 'submitted feedback', time: '2 hours ago', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
            ].map((activity, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={activity.icon} />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">
                    <span className="font-medium">{activity.user}</span> {activity.action}
                  </p>
                  <p className="text-xs text-gray-500">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">Room Capacity</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Occupancy %</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">Current student occupancy per room</p>
          <div className="space-y-4">
            {rooms.slice(0, 4).map((room) => {
              const percentage = (room.students_assigned / room.capacity) * 100;
              const isFull = percentage >= 90;
              return (
                <div key={room.id} className="group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">{room.name} <span className="text-gray-400 text-xs">Floor {room.floor}</span></span>
                    <span className={`text-sm font-medium ${isFull ? 'text-rose-600' : 'text-gray-500'}`}>{room.students_assigned}/{room.capacity}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-rose-500' : 'bg-gradient-to-r from-[#1B6B7B] to-[#2a8a98]'}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">Quiz Performance Trend</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Last 12 Weeks</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">Weekly quiz completion rate (%)</p>
          <div className="h-36 flex items-end justify-between gap-2 px-2">
            {[65, 78, 82, 71, 88, 95, 82, 76, 90, 85, 92, 88].map((val, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                <div
                  className="w-full bg-gradient-to-t from-[#1B6B7B] to-[#2a8a98] rounded-t transition-all duration-300 hover:opacity-80 group-hover:from-[#145a63]"
                  style={{ height: `${val}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3 px-2">
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].slice(0, 4).map(m => (
              <span key={m} className="text-xs text-gray-400">{m}</span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">Student Distribution</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Overview</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">Safe vs At-Risk breakdown</p>
          <div className="flex items-center justify-center">
            <div className="relative w-40 h-40">
              {(() => {
                const safeCount = students.filter(s => !s.at_risk).length;
                const atRiskCount = students.filter(s => s.at_risk).length;
                const total = students.length;
                const circumference = 440;
                const safeDash = (safeCount / total) * circumference;
                const atRiskDash = (atRiskCount / total) * circumference;
                return (
                  <svg className="w-40 h-40 transform -rotate-90">
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#f3f4f6" strokeWidth="20" />
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#1B6B7B" strokeWidth="20" strokeDasharray={`${safeDash} ${circumference}`} strokeLinecap="round" className="transition-all duration-1000" />
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#ff2056" strokeWidth="20" strokeDasharray={`${atRiskDash} ${circumference}`} strokeDashoffset={`-${safeDash}`} strokeLinecap="round" className="transition-all duration-1000" />
                  </svg>
                );
              })()}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-bold text-gray-800">{students.length}</p>
                <p className="text-sm text-gray-500">Students</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#1B6B7B] rounded-full" />
              <span className="text-sm text-gray-600">Safe: {students.filter(s => !s.at_risk).length}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-rose-500 rounded-full" />
              <span className="text-sm text-gray-600">At Risk: {students.filter(s => s.at_risk).length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link href="/admin/rooms" className="cursor-pointer">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#1B6B7B]/10 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{rooms.filter(r => r.status === 'active').length}</p>
                <p className="text-sm text-gray-500 font-medium">Active Rooms</p>
              </div>
            </div>
          </div>
        </Link>
        <Link href="/admin/faculty" className="cursor-pointer">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#1B6B7B]/10 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{faculty.filter(f => f.status === 'active').length}</p>
                <p className="text-sm text-gray-500 font-medium">Active Faculty</p>
              </div>
            </div>
          </div>
        </Link>
        <Link href="/admin/users" className="cursor-pointer">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#1B6B7B]/10 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{users.filter(u => u.status === 'active').length}</p>
                <p className="text-sm text-gray-500 font-medium">Active Users</p>
              </div>
            </div>
          </div>
        </Link>
        <Link href="/admin/reports" className="cursor-pointer">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#1B6B7B]/10 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">4</p>
                <p className="text-sm text-gray-500 font-medium">Report Types</p>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {atRiskStudents.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Students Requiring Attention</h3>
                <p className="text-sm text-gray-500">{atRiskStudents.length} students at risk</p>
              </div>
            </div>
            <Link
              href="/admin/student-management"
              className="text-rose-600 hover:text-rose-700 font-medium flex items-center gap-2 px-4 py-2 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors"
            >
              View All
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {atRiskStudents.map((student) => (
              <div key={student.id} className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 font-bold text-lg">
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{student.name}</p>
                    <p className="text-sm text-gray-500">{student.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-bold text-rose-600 text-lg">{student.average_score}%</p>
                    <p className="text-sm text-gray-500">{student.quizzes_completed} quizzes</p>
                  </div>
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
