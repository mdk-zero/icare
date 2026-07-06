"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Faculty {
  id: string;
  name: string;
  email: string;
  specialization: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
}

const mockFaculty: Faculty[] = [
  { id: "1", name: "Dr. Maria Santos", email: "maria.santos@icare.edu", specialization: "Medical-Surgical Nursing" },
  { id: "2", name: "Prof. James Rivera", email: "james.rivera@icare.edu", specialization: "Maternal and Child Health" },
  { id: "3", name: "Ms. Anna Cruz", email: "anna.cruz@icare.edu", specialization: "Psychiatric Nursing" },
  { id: "4", name: "Mr. Robert Tan", email: "robert.tan@icare.edu", specialization: "Community Health" },
  { id: "5", name: "Dr. Carmen Lim", email: "carmen.lim@icare.edu", specialization: "Nursing Informatics" },
];

const mockStudents: Student[] = [
  { id: "stu1", name: "Alex Thompson", email: "alex.t@icare.edu" },
  { id: "stu2", name: "Maria Garcia", email: "maria.g@icare.edu" },
  { id: "stu3", name: "James Wilson", email: "james.w@icare.edu" },
  { id: "stu4", name: "Sarah Chen", email: "sarah.c@icare.edu" },
  { id: "stu5", name: "David Brown", email: "david.b@icare.edu" },
  { id: "stu6", name: "Emily Johnson", email: "emily.j@icare.edu" },
  { id: "stu7", name: "Michael Lee", email: "michael.l@icare.edu" },
  { id: "stu8", name: "Jessica Martinez", email: "jessica.m@icare.edu" },
  { id: "stu9", name: "Daniel Kim", email: "daniel.k@icare.edu" },
  { id: "stu10", name: "Rachel Wong", email: "rachel.w@icare.edu" },
];

const mockAssignments: Record<string, string[]> = {
  "1": ["stu1", "stu2"],
  "2": ["stu3", "stu4", "stu5"],
  "3": ["stu6"],
  "4": [],
  "5": ["stu7", "stu8", "stu9", "stu10"],
};

export default function AssignStudentsClient() {
  const router = useRouter();
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(mockFaculty[0] || null);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({ ...mockAssignments });
  const [selectedStudents, setSelectedStudents] = useState<string[]>(
    selectedFaculty ? mockAssignments[selectedFaculty.id] || [] : []
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [pendingFaculty, setPendingFaculty] = useState<Faculty | null>(null);
  const [discardAction, setDiscardAction] = useState<"navigate" | "cancel" | "back" | null>(null);

  const handleFacultySelect = (faculty: Faculty) => {
    if (hasChanges) {
      setPendingFaculty(faculty);
      setDiscardAction("navigate");
      setShowDiscardModal(true);
    } else {
      setSelectedFaculty(faculty);
      setSelectedStudents(assignments[faculty.id] || []);
      setHasChanges(false);
    }
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudents((prev) => {
      const newSelection = prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId];
      return newSelection;
    });
    setHasChanges(true);
  };

  const getAssignedFacultyId = (studentId: string): string | null => {
    for (const [facultyId, studentIds] of Object.entries(assignments)) {
      if (studentIds.includes(studentId)) return facultyId;
    }
    return null;
  };

  const handleSave = () => {
    if (!selectedFaculty) return;
    const newAssignments = { ...assignments, [selectedFaculty.id]: selectedStudents };
    setAssignments(newAssignments);
    setHasChanges(false);
    alert(`Assignments saved for ${selectedFaculty.name}`);
    router.push("/admin/faculty");
  };

  const handleCancel = () => {
    if (hasChanges) {
      setDiscardAction("cancel");
      setShowDiscardModal(true);
    } else {
      router.push("/admin/faculty");
    }
  };

  const handleBack = () => {
    if (hasChanges) {
      setDiscardAction("back");
      setShowDiscardModal(true);
    } else {
      router.push("/admin/faculty");
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assign Students to Faculty</h1>
          <p className="text-gray-500">Manage student-faculty assignments</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Faculty Members</h2>
            <div className="space-y-2">
              {mockFaculty.map((faculty) => (
                <button
                  key={faculty.id}
                  onClick={() => handleFacultySelect(faculty)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selectedFaculty?.id === faculty.id
                      ? "border-[#1B6B7B] bg-[#1B6B7B]/5"
                      : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <p className="font-medium text-gray-800">{faculty.name}</p>
                  <p className="text-sm text-gray-500">{faculty.specialization}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {(assignments[faculty.id] || []).length} student(s) assigned
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selectedFaculty ? (
            <>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">All Students</h2>
                    <p className="text-sm text-gray-500">
                      Select students to assign to {selectedFaculty.name}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {selectedStudents.length} selected
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50/50 border-b border-gray-200">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 w-12">Select</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Name</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Email</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {mockStudents.map((student) => {
                        const assignedTo = getAssignedFacultyId(student.id);
                        const isAssignedToCurrentFaculty =
                          selectedStudents.includes(student.id);
                        const isAssignedToOther =
                          assignedTo && assignedTo !== selectedFaculty.id;

                        return (
                          <tr 
                            key={student.id} 
                            className={`hover:bg-gray-50/50 transition-colors ${
                              isAssignedToCurrentFaculty ? "bg-[#1B6B7B]/5" : ""
                            }`}
                          >
                            <td className="py-3 px-4">
                              <input
                                type="checkbox"
                                checked={isAssignedToCurrentFaculty}
                                onChange={() => toggleStudent(student.id)}
                                disabled={!!isAssignedToOther && !isAssignedToCurrentFaculty}
                                className="w-4 h-4 text-[#1B6B7B] rounded focus:ring-[#1B6B7B] disabled:opacity-40"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-gray-800">{student.name}</p>
                            </td>
                            <td className="py-3 px-4 text-gray-600">{student.email}</td>
                            <td className="py-3 px-4">
                              {isAssignedToOther ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                  Assigned to {mockFaculty.find(f => f.id === assignedTo)?.name}
                                </span>
                              ) : isAssignedToCurrentFaculty ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                  Selected
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                  Unassigned
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Currently Assigned to {selectedFaculty.name}
                </h2>
                {selectedStudents.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedStudents.map((studentId) => {
                      const student = mockStudents.find((s) => s.id === studentId);
                      return student ? (
                        <span
                          key={studentId}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#1B6B7B]/10 text-[#1B6B7B] rounded-full text-sm font-medium"
                        >
                          {student.name}
                          <button
                            onClick={() => toggleStudent(studentId)}
                            className="hover:text-red-500"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No students assigned yet</p>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2.5 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges}
                  className="px-4 py-2.5 bg-[#1B6B7B] text-white rounded-xl font-medium hover:bg-[#145a63] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Assignments
                </button>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
              <p className="text-gray-500">Select a faculty member from the left panel</p>
            </div>
          )}
        </div>
      </div>

      {showDiscardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">Discard Changes?</h3>
            <p className="text-gray-500 text-center mb-6">
              You have unsaved changes. Are you sure you want to discard them?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDiscardModal(false);
                  setDiscardAction(null);
                  setPendingFaculty(null);
                }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-all"
              >
                Keep Editing
              </button>
              <button
                onClick={() => {
                  setShowDiscardModal(false);
                  if (discardAction === "navigate" && pendingFaculty) {
                    setSelectedFaculty(pendingFaculty);
                    setSelectedStudents(assignments[pendingFaculty.id] || []);
                    setHasChanges(false);
                  } else {
                    router.push("/admin/faculty");
                  }
                  setDiscardAction(null);
                  setPendingFaculty(null);
                }}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-all"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}