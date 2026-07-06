"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'faculty' | 'admin';
}

function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem('icare_user');
  return userStr ? JSON.parse(userStr) : null;
}

function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('icare_user');
    localStorage.removeItem('icare_token');
    void fetch('/api/auth/logout', { method: 'POST' });
  }
}

interface PerformanceEntry {
  id: string;
  quiz_title: string;
  score: number;
  date: string;
  time: string;
}

const mockPerformance: PerformanceEntry[] = [
  { id: "1", quiz_title: "Vital Signs Assessment", score: 90, date: "Today, 10:30 AM", time: "10 min" },
  { id: "2", quiz_title: "Patient Documentation", score: 80, date: "Yesterday, 2:15 PM", time: "15 min" },
  { id: "3", quiz_title: "Clinical Decision Making", score: 70, date: "Apr 24, 9:00 AM", time: "20 min" },
  { id: "4", quiz_title: "Vital Signs Assessment", score: 85, date: "Apr 23, 11:00 AM", time: "8 min" },
  { id: "5", quiz_title: "Patient Documentation", score: 75, date: "Apr 22, 3:30 PM", time: "12 min" },
];

export default function PerformancePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [performance] = useState<PerformanceEntry[]>(mockPerformance);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push("/login");
    } else {
      setUser(currentUser);
    }
  }, [router]);

  const averageScore = Math.round(performance.reduce((sum, p) => sum + p.score, 0) / performance.length);
  const totalTime = performance.reduce((sum, p) => sum + parseInt(p.time), 0);
  const completedQuizzes = performance.length;

  const getScoreColor = (score: number): string => {
    if (score >= 80) return "text-green-600 bg-green-100";
    if (score >= 60) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="w-64 bg-[#1B6B7B] text-white flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-bold">iCARE++</h1>
          <p className="text-sm text-white/70">Student Portal</p>
        </div>
        
        <nav className="flex-1 p-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 hover:bg-white/10"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Dashboard
          </button>
          <button
            onClick={() => router.push("/patients")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 hover:bg-white/10"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Patients
          </button>
          <button
            onClick={() => router.push("/quizzes")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 hover:bg-white/10"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Quizzes
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 bg-white/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Performance
          </button>
        </nav>
        
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-white/70">{user.role}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">My Performance</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-[#1B6B7B]">{averageScore}%</span>
              </div>
              <p className="font-medium text-gray-800">Average Score</p>
              <p className="text-sm text-gray-500">Across all quizzes</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-green-600">{completedQuizzes}</span>
              </div>
              <p className="font-medium text-gray-800">Quizzes Completed</p>
              <p className="text-sm text-gray-500">Total attempts</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-purple-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-purple-600">{totalTime}m</span>
              </div>
              <p className="font-medium text-gray-800">Total Study Time</p>
              <p className="text-sm text-gray-500">Minutes invested</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Performance History</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {performance.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-800">{entry.quiz_title}</p>
                    <p className="text-sm text-gray-500">{entry.date} • {entry.time}</p>
                  </div>
                  <div className={`px-4 py-2 rounded-lg font-semibold ${getScoreColor(entry.score)}`}>
                    {entry.score}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium text-green-800">Great Progress!</p>
                <p className="text-sm text-green-600/70">
                  Keep practicing to improve your clinical competencies.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}