"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "../../components/PageHeader";

interface StudentPerformance {
  id: string;
  name: string;
  email: string;
  quizzes_completed: number;
  average_score: number | null;
  at_risk: boolean;
  last_login_at: string | null;
}

function formatLastActive(value: string | null): string {
  if (!value) return "Never";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const FilterSelect = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="px-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all cursor-pointer"
  >
    {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
  </select>
);

const EnrollStudentModal = ({ isOpen, onClose, onEnroll }: { isOpen: boolean; onClose: () => void; onEnroll: (name: string, email: string) => Promise<string | null> }) => {
  const [formData, setFormData] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState<{ name?: string; email?: string; server?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: { name?: string; email?: string } = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = "Invalid email format";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const serverError = await onEnroll(formData.name.trim(), formData.email.trim());
    setSubmitting(false);
    if (serverError) {
      setErrors({ server: serverError });
      return;
    }
    setFormData({ name: "", email: "" });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-md mx-4 overflow-hidden border border-hairline" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Enroll New Student</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className={`w-full px-4 py-2.5 bg-surface border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all text-gray-700 placeholder:text-gray-400 ${errors.name ? 'border-rose-400' : 'border-gray-200'}`}
              placeholder="Enter student's full name"
            />
            {errors.name && <p className="mt-1 text-sm text-rose-500">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className={`w-full px-4 py-2.5 bg-surface border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all text-gray-700 placeholder:text-gray-400 ${errors.email ? 'border-rose-400' : 'border-gray-200'}`}
              placeholder="student@icare.edu"
            />
            {errors.email && <p className="mt-1 text-sm text-rose-500">{errors.email}</p>}
          </div>
          {errors.server && <p className="text-sm text-rose-500">{errors.server}</p>}
          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 hover:shadow-lg disabled:opacity-60 transition-all">
              {submitting ? "Enrolling…" : "Enroll Student"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function StudentManagementClient() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/students", { credentials: "include" })
      .then(async (res) => {
        if (res.ok) {
          const json = (await res.json()) as { students: StudentPerformance[] };
          setStudents(json.students ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  /** Provisions the account via the admin users API; returns an error message or null. */
  const handleEnrollStudent = useCallback(async (name: string, email: string): Promise<string | null> => {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, role: "student" }),
    });
    const json = (await res.json()) as {
      user?: { id: string; name: string; email: string; last_login_at: string | null };
      password?: string;
      error?: string;
    };
    if (!res.ok || !json.user) {
      return json.error ?? "Failed to enroll student";
    }
    setStudents((prev) => [
      {
        id: json.user!.id,
        name: json.user!.name,
        email: json.user!.email,
        quizzes_completed: 0,
        average_score: null,
        at_risk: false,
        last_login_at: null,
      },
      ...prev,
    ]);
    if (json.password) setTempPassword({ email: json.user.email, password: json.password });
    return null;
  }, []);

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         student.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === "all" ||
                         (filterStatus === "at-risk" && student.at_risk) ||
                         (filterStatus === "safe" && !student.at_risk);
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortBy === "name") comparison = a.name.localeCompare(b.name);
    else if (sortBy === "average_score") comparison = (a.average_score ?? -1) - (b.average_score ?? -1);
    else if (sortBy === "quizzes_completed") comparison = a.quizzes_completed - b.quizzes_completed;
    else if (sortBy === "last_active")
      comparison =
        new Date(a.last_login_at ?? 0).getTime() - new Date(b.last_login_at ?? 0).getTime();
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return (
    <div>
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z M12 14l9-5-9-5-9 5 9 5z M12 22v-6" />
            </svg>
          ),
          label: "Student Management",
        }}
        title="Student Management"
        subtitle="View and manage nursing student accounts, track performance, and identify at-risk students"
        action={{
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          ),
          onClick: () => setIsEnrollModalOpen(true),
          label: "Enroll Student",
        }}
      />

      {tempPassword && (
        <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-4">
          <span>
            Temporary password for <strong>{tempPassword.email}</strong>:{" "}
            <code className="font-mono bg-surface px-2 py-0.5 rounded border border-amber-200">{tempPassword.password}</code>{" "}
            — an invitation email was attempted; keep this as backup.
          </span>
          <button
            onClick={() => setTempPassword(null)}
            className="text-amber-700 hover:text-amber-900 font-medium shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface rounded-xl p-4 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-600/10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{students.length}</p>
              <p className="text-xs text-gray-500">Total Students</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{students.filter(s => !s.at_risk).length}</p>
              <p className="text-xs text-gray-500">Safe Students</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{students.filter(s => s.at_risk).length}</p>
              <p className="text-xs text-gray-500">At Risk</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-600/10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{students.reduce((sum, s) => sum + s.quizzes_completed, 0)}</p>
              <p className="text-xs text-gray-500">Total Quizzes</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-6">
        <button onClick={() => setIsEnrollModalOpen(true)} className="flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 hover:shadow-lg transition-all duration-300">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          <span className="hidden sm:inline">Enroll Student</span>
          <span className="sm:hidden">Enroll</span>
        </button>
        <div className="flex-1 relative">
          <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-surface border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all placeholder:text-gray-400 text-gray-700"
          />
        </div>
        <FilterSelect
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: 'all', label: 'All Students' },
            { value: 'at-risk', label: 'At Risk' },
            { value: 'safe', label: 'Safe' },
          ]}
        />
      </div>

      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-subtle border-b border-gray-100">
              <tr>
                <th className="text-left py-4 px-4 sm:px-6 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <button onClick={() => { setSortBy('name'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="flex items-center gap-1 hover:text-brand-600 transition-colors">
                    Student
                    {sortBy === 'name' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </th>
                <th className="text-left py-4 px-4 sm:px-6 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <button onClick={() => { setSortBy('quizzes_completed'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="flex items-center gap-1 hover:text-brand-600 transition-colors">
                    Quizzes
                    {sortBy === 'quizzes_completed' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </th>
                <th className="text-left py-4 px-4 sm:px-6 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <button onClick={() => { setSortBy('average_score'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="flex items-center gap-1 hover:text-brand-600 transition-colors">
                    Avg. Score
                    {sortBy === 'average_score' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </th>
                <th className="text-left py-4 px-4 sm:px-6 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left py-4 px-4 sm:px-6 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  <button onClick={() => { setSortBy('last_active'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="flex items-center gap-1 hover:text-brand-600 transition-colors">
                    Last Active
                    {sortBy === 'last_active' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">Loading students…</td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">No students found</td>
                </tr>
              ) : (
              filteredStudents.map((student) => (
                <tr 
                  key={student.id} 
                  className="hover:bg-subtle transition-colors group cursor-pointer"
                  onClick={() => router.push(`/admin/students/${student.id}`)}
                >
                  <td className="py-4 px-4 sm:px-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${student.at_risk ? 'bg-rose-50 text-rose-600' : 'bg-brand-600/10 text-brand-600'}`}>
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{student.name}</p>
                        <p className="text-sm text-gray-500">{student.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 sm:px-6">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-600 rounded-full" style={{ width: `${(student.quizzes_completed / 10) * 100}%` }} />
                      </div>
                      <span className="text-gray-600 font-medium text-sm">{student.quizzes_completed}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 sm:px-6">
                    {student.average_score === null ? (
                      <span className="text-gray-400 text-sm">No attempts</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${student.average_score >= 70 ? 'bg-brand-600' : 'bg-rose-500'}`} style={{ width: `${student.average_score}%` }} />
                        </div>
                        <span className={`font-semibold text-sm ${student.average_score >= 70 ? 'text-brand-600' : 'text-rose-600'}`}>{student.average_score}%</span>
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-4 sm:px-6">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${student.at_risk ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {student.at_risk ? '⚠ At Risk' : '✓ Safe'}
                    </span>
                  </td>
                  <td className="py-4 px-4 sm:px-6 text-gray-500 text-sm hidden sm:table-cell">{formatLastActive(student.last_login_at)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>
      <EnrollStudentModal isOpen={isEnrollModalOpen} onClose={() => setIsEnrollModalOpen(false)} onEnroll={handleEnrollStudent} />
    </div>
  );
}