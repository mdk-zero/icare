"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "../../components/PageHeader";

interface SectionRef {
  id: string;
  name: string;
}

interface Faculty {
  id: string;
  name: string;
  email: string;
  created_at: string;
  last_login_at: string | null;
  sections: SectionRef[];
  student_count: number;
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FacultyClient() {
  const router = useRouter();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [sections, setSections] = useState<SectionRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newFaculty, setNewFaculty] = useState({ name: "", email: "" });

  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    const [facultyRes, sectionsRes] = await Promise.all([
      fetch("/api/admin/faculty", { credentials: "include" }),
      fetch("/api/sections", { credentials: "include" }),
    ]);
    if (facultyRes.ok) {
      const json = (await facultyRes.json()) as { faculty: Faculty[] };
      setFaculty(json.faculty ?? []);
    }
    if (sectionsRes.ok) {
      const json = (await sectionsRes.json()) as { sections: SectionRef[] };
      setSections(json.sections ?? []);
    }
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleAddFaculty = async () => {
    if (!newFaculty.name.trim() || !newFaculty.email.trim()) {
      flash("Name and email are required");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...newFaculty, role: "faculty" }),
    });
    setBusy(false);
    const json = (await res.json()) as {
      user?: { id: string; name: string; email: string; created_at: string; last_login_at: string | null };
      password?: string;
      error?: string;
    };
    if (!res.ok || !json.user) {
      flash(json.error ?? "Failed to create faculty");
      return;
    }
    setFaculty((prev) => [...prev, { ...json.user!, sections: [], student_count: 0 }]);
    setShowAddModal(false);
    setNewFaculty({ name: "", email: "" });
    if (json.password) setTempPassword({ email: json.user.email, password: json.password });
    flash("Faculty account created");
  };

  const openAssignModal = (member: Faculty) => {
    setSelectedFaculty(member);
    setSelectedSections(member.sections.map((s) => s.id));
  };

  const toggleSection = (sectionId: string) => {
    setSelectedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
    );
  };

  const handleSaveAssignments = async () => {
    if (!selectedFaculty) return;
    setBusy(true);
    const res = await fetch(`/api/admin/faculty/${selectedFaculty.id}/sections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ section_ids: selectedSections }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      flash(json.error ?? "Failed to save sections");
      return;
    }
    setSelectedFaculty(null);
    flash("Sections updated");
    // Reload so section names and student counts stay accurate.
    await loadData();
  };

  const facultyWithoutSections = faculty.filter((f) => f.sections.length === 0).length;

  return (
    <div>
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
          label: "Faculty Management",
        }}
        title="Faculty Management"
        subtitle="Manage faculty accounts and their handled sections"
        action={{
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          ),
          onClick: () => setShowAddModal(true),
          label: "Add Faculty",
        }}
      />

      {message && (
        <div className="mb-4 bg-brand-600/10 border border-brand-600/30 text-[#155663] px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      {tempPassword && (
        <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-4">
          <span>
            Temporary password for <strong>{tempPassword.email}</strong>:{" "}
            <code className="font-mono bg-surface px-2 py-0.5 rounded border border-amber-200">{tempPassword.password}</code>{" "}
            — share it with the faculty member; they must change it at first login.
          </span>
          <button
            onClick={() => setTempPassword(null)}
            className="text-amber-700 hover:text-amber-900 font-medium shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {[
          { label: "Total Faculty", count: faculty.length },
          { label: "Sections", count: sections.length },
          { label: "Faculty Without Sections", count: facultyWithoutSections },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-surface rounded-xl p-5 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-brand-600/10 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{stat.count}</p>
                <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-subtle border-b border-gray-100">
              <tr>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Faculty Member</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Sections</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Students</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Last Login</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">Loading faculty…</td>
                </tr>
              ) : faculty.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    No faculty accounts yet — add one to get started
                  </td>
                </tr>
              ) : (
                faculty.map((member) => (
                  <tr key={member.id} className="hover:bg-subtle transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-600/10 rounded-full flex items-center justify-center text-brand-600 font-semibold">
                          {member.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{member.name}</p>
                          <p className="text-sm text-gray-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {member.sections.length === 0 ? (
                        <span className="text-sm text-gray-400">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {member.sections.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-600/10 text-brand-600 border border-brand-600/20"
                            >
                              {s.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-800 font-medium">{member.student_count}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{formatDate(member.created_at)}</td>
                    <td className="py-3 px-4 text-gray-600">{formatDate(member.last_login_at)}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => openAssignModal(member)}
                        className="text-brand-600 font-medium hover:text-brand-700 transition-colors"
                      >
                        Assign Sections
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-4 w-full max-w-lg mx-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Faculty</h3>
            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={newFaculty.name}
                  onChange={(e) => setNewFaculty({ ...newFaculty, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                  placeholder="Dr. Juan dela Cruz"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={newFaculty.email}
                  onChange={(e) => setNewFaculty({ ...newFaculty, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                  placeholder="faculty@icare.edu"
                />
                <p className="text-xs text-gray-400 mt-2">
                  A temporary password is generated and shown here once; they must change it at first login.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFaculty}
                disabled={busy}
                className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-60 transition-all"
              >
                {busy ? "Creating…" : "Add Faculty"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedFaculty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-4 w-full max-w-lg mx-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline max-h-[80vh] overflow-hidden flex flex-col">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Assign Sections to {selectedFaculty.name}
              </h3>
              <p className="text-sm text-gray-500">
                This faculty member handles every student in the checked sections
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {sections.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  No sections yet — create them on the{" "}
                  <button
                    onClick={() => router.push("/admin/faculty/assignment")}
                    className="text-brand-600 font-medium hover:underline"
                  >
                    Sections page
                  </button>
                </p>
              ) : (
                sections.map((section) => {
                  const otherFaculty = faculty.filter(
                    (f) =>
                      f.id !== selectedFaculty.id &&
                      f.sections.some((s) => s.id === section.id),
                  );
                  return (
                    <label
                      key={section.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedSections.includes(section.id)
                          ? "border-brand-600 bg-brand-600/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSections.includes(section.id)}
                        onChange={() => toggleSection(section.id)}
                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-600"
                      />
                      <p className="flex-1 font-medium text-gray-800">Section {section.name}</p>
                      {otherFaculty.length > 0 && (
                        <span className="text-xs text-gray-400 shrink-0">
                          Also with {otherFaculty.map((f) => f.name).join(", ")}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                {selectedSections.length} section{selectedSections.length !== 1 ? "s" : ""} selected
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedFaculty(null)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAssignments}
                  disabled={busy}
                  className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-all disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save Sections"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
