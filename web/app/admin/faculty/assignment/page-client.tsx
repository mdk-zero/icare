"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Faculty {
  id: string;
  name: string;
  email: string;
  student_ids: string[];
}

interface Student {
  id: string;
  name: string;
  email: string;
}

export default function AssignStudentsClient() {
  const router = useRouter();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    const [facultyRes, studentsRes] = await Promise.all([
      fetch("/api/admin/faculty", { credentials: "include" }),
      fetch("/api/admin/students", { credentials: "include" }),
    ]);
    let loaded: Faculty[] = [];
    if (facultyRes.ok) {
      const json = (await facultyRes.json()) as { faculty: Faculty[] };
      loaded = json.faculty ?? [];
      setFaculty(loaded);
    }
    if (studentsRes.ok) {
      const json = (await studentsRes.json()) as { students: Student[] };
      setStudents(json.students ?? []);
    }
    if (loaded.length > 0) {
      setSelectedFaculty(loaded[0]);
      setSelectedStudents([...loaded[0].student_ids]);
    }
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleFacultySelect = (member: Faculty) => {
    if (hasChanges && !window.confirm("Discard unsaved roster changes?")) return;
    setSelectedFaculty(member);
    setSelectedStudents([...member.student_ids]);
    setHasChanges(false);
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    );
    setHasChanges(true);
  };

  const assignedElsewhere = (studentId: string): Faculty | undefined =>
    faculty.find((f) => f.id !== selectedFaculty?.id && f.student_ids.includes(studentId));

  const handleSave = async () => {
    if (!selectedFaculty) return;
    setBusy(true);
    const res = await fetch(`/api/admin/faculty/${selectedFaculty.id}/students`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ student_ids: selectedStudents }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      flash(json.error ?? "Failed to save roster");
      return;
    }
    setFaculty((prev) =>
      prev.map((f) => (f.id === selectedFaculty.id ? { ...f, student_ids: [...selectedStudents] } : f)),
    );
    setHasChanges(false);
    flash(`Roster saved for ${selectedFaculty.name}`);
  };

  const handleBack = () => {
    if (hasChanges && !window.confirm("Discard unsaved roster changes?")) return;
    router.push("/admin/faculty");
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assign Students to Faculty</h1>
          <p className="text-gray-500">Manage student-faculty rosters</p>
        </div>
      </div>

      {message && (
        <div className="mb-4 bg-[#1B6B7B]/10 border border-[#1B6B7B]/30 text-[#155663] px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-[#1B6B7B] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : faculty.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] text-center text-gray-400">
          No faculty accounts yet — create one from Faculty Management first.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-4 border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Faculty Members</h2>
              <div className="space-y-2">
                {faculty.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => handleFacultySelect(member)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                      selectedFaculty?.id === member.id
                        ? "bg-[#1B6B7B] text-white"
                        : "hover:bg-gray-50 text-gray-800"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold shrink-0 ${
                        selectedFaculty?.id === member.id
                          ? "bg-white/20 text-white"
                          : "bg-[#1B6B7B]/10 text-[#1B6B7B]"
                      }`}
                    >
                      {member.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{member.name}</p>
                      <p className={`text-sm truncate ${selectedFaculty?.id === member.id ? "text-white/70" : "text-gray-500"}`}>
                        {member.student_ids.length} student{member.student_ids.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl p-4 border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedFaculty ? `${selectedFaculty.name}'s Roster` : "Select a faculty member"}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedStudents.length} of {students.length} students selected
                  </p>
                </div>
                <button
                  onClick={handleSave}
                  disabled={busy || !hasChanges}
                  className="px-5 py-2.5 bg-[#1B6B7B] text-white rounded-lg font-medium hover:bg-[#145a63] transition-all disabled:opacity-50 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                >
                  {busy ? "Saving…" : "Save Roster"}
                </button>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {students.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">No student accounts yet</p>
                ) : (
                  students.map((student) => {
                    const other = assignedElsewhere(student.id);
                    return (
                      <label
                        key={student.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedStudents.includes(student.id)
                            ? "border-[#1B6B7B] bg-[#1B6B7B]/5"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(student.id)}
                          onChange={() => toggleStudent(student.id)}
                          className="w-4 h-4 text-[#1B6B7B] rounded focus:ring-[#1B6B7B]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{student.name}</p>
                          <p className="text-sm text-gray-500 truncate">{student.email}</p>
                        </div>
                        {other && (
                          <span className="text-xs text-gray-400 shrink-0">
                            Also with {other.name}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
