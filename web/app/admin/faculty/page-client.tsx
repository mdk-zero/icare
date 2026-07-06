"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

interface Student {
  id: string;
  name: string;
  email: string;
}

const mockFaculty: Faculty[] = [
  { id: "1", name: "Dr. Maria Santos", email: "maria.santos@icare.edu", department: "Nursing", specialization: "Medical-Surgical Nursing", status: "active", student_count: 15, years_experience: 12 },
  { id: "2", name: "Prof. James Rivera", email: "james.rivera@icare.edu", department: "Nursing", specialization: "Maternal and Child Health", status: "active", student_count: 12, years_experience: 8 },
  { id: "3", name: "Ms. Anna Cruz", email: "anna.cruz@icare.edu", department: "Nursing", specialization: "Psychiatric Nursing", status: "active", student_count: 10, years_experience: 5 },
  { id: "4", name: "Mr. Robert Tan", email: "robert.tan@icare.edu", department: "Nursing", specialization: "Community Health", status: "inactive", student_count: 0, years_experience: 15 },
  { id: "5", name: "Dr. Carmen Lim", email: "carmen.lim@icare.edu", department: "Nursing", specialization: "Nursing Informatics", status: "active", student_count: 18, years_experience: 10 },
];

const mockStudents: Student[] = [
  { id: "stu1", name: "Alex Thompson", email: "alex.t@icare.edu" },
  { id: "stu2", name: "Maria Garcia", email: "maria.g@icare.edu" },
  { id: "stu3", name: "James Wilson", email: "james.w@icare.edu" },
  { id: "stu4", name: "Sarah Chen", email: "sarah.c@icare.edu" },
  { id: "stu5", name: "David Brown", email: "david.b@icare.edu" },
  { id: "stu6", name: "Emily Johnson", email: "emily.j@icare.edu" },
  { id: "stu7", name: "Michael Lee", email: "michael.l@icare.edu" },
];

import PageHeader from "../../components/PageHeader";

export default function FacultyClient() {
  const router = useRouter();
  const faculty = mockFaculty;
  const [facultyFilter, setFacultyFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  
  const [newFaculty, setNewFaculty] = useState({
    name: '',
    email: '',
    specialization: '',
    department: 'Nursing',
    years_experience: 0,
  });

const filteredFaculty = faculty.filter(f => facultyFilter === "all" || f.status === facultyFilter);

  const handleAddFaculty = () => {
    if (newFaculty.name && newFaculty.email) {
      alert(`Faculty ${newFaculty.name} would be created (mock)`);
      setShowAddModal(false);
      setNewFaculty({ name: '', email: '', specialization: '', department: 'Nursing', years_experience: 0 });
    }
  };

  const handleAssignStudents = (facultyMember: Faculty) => {
    setSelectedFaculty(facultyMember);
    setSelectedStudents([]);
    setShowAssignModal(true);
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSaveAssignments = () => {
    if (selectedFaculty && selectedStudents.length > 0) {
      alert(`Assigned ${selectedStudents.length} students to ${selectedFaculty.name} (mock)`);
      setShowAssignModal(false);
      setSelectedFaculty(null);
      setSelectedStudents([]);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
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
        subtitle="Manage faculty members and monitor assignments"
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 shadow-lg shadow-gray-200/50 border border-gray-100 hover:scale-[1.02] hover:shadow-xl transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-[#1B6B7B] to-[#145a63] rounded-xl flex items-center justify-center shadow-lg shadow-[#1B6B7B]/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-800">{faculty.length}</p>
              <p className="text-xs text-gray-500 font-medium">Total Faculty</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-lg shadow-gray-200/50 border border-gray-100 hover:scale-[1.02] hover:shadow-xl transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-800">{faculty.filter(f => f.status === 'active').length}</p>
              <p className="text-xs text-gray-500 font-medium">Active Faculty</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-lg shadow-gray-200/50 border border-gray-100 hover:scale-[1.02] hover:shadow-xl transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-800">{faculty.reduce((sum, f) => sum + f.student_count, 0)}</p>
              <p className="text-xs text-gray-500 font-medium">Assigned Students</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Actions */}
      <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100">
        <select
          value={facultyFilter}
          onChange={(e) => setFacultyFilter(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/50 focus:border-[#1B6B7B] transition-all cursor-pointer font-medium"
        >
          <option value="all">All Faculty</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#1B6B7B] to-[#145a63] text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-[#1B6B7B]/30 transition-all duration-300"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Faculty
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/50 border-b border-gray-200">
              <tr>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Faculty Member</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Specialization</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Students</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Experience</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Status</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredFaculty.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center text-[#1B6B7B] font-semibold">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{member.name}</p>
                        <p className="text-sm text-gray-500">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-gray-600">{member.specialization}</td>
                  <td className="py-4 px-6">
                    <span className="text-gray-800 font-medium">{member.student_count}</span>
                  </td>
                  <td className="py-4 px-6 text-gray-600">{member.years_experience} years</td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {member.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <button 
                      onClick={() => handleAssignStudents(member)}
                      className="text-[#1B6B7B] font-medium hover:text-[#145a63] transition-colors"
                    >
                      Assign Students
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Faculty</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={newFaculty.name}
                  onChange={(e) => setNewFaculty({ ...newFaculty, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                  placeholder="Dr. John Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={newFaculty.email}
                  onChange={(e) => setNewFaculty({ ...newFaculty, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                  placeholder="john.smith@icare.edu"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Specialization</label>
                <input
                  type="text"
                  value={newFaculty.specialization}
                  onChange={(e) => setNewFaculty({ ...newFaculty, specialization: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                  placeholder="Medical-Surgical Nursing"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Years of Experience</label>
                <input
                  type="number"
                  value={newFaculty.years_experience}
                  onChange={(e) => setNewFaculty({ ...newFaculty, years_experience: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                  placeholder="5"
                />
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
                className="px-4 py-2 bg-[#1B6B7B] text-white rounded-xl font-medium hover:bg-[#145a63] transition-all"
              >
                Add Faculty
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && selectedFaculty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Assign Students to {selectedFaculty.name}</h3>
              <p className="text-sm text-gray-500">{selectedFaculty.specialization}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {mockStudents.map((student) => (
                <label
                  key={student.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedStudents.includes(student.id)
                      ? 'border-[#1B6B7B] bg-[#1B6B7B]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedStudents.includes(student.id)}
                    onChange={() => toggleStudent(student.id)}
                    className="w-4 h-4 text-[#1B6B7B] rounded focus:ring-[#1B6B7B]"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{student.name}</p>
                    <p className="text-sm text-gray-500">{student.email}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                {selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedFaculty(null);
                    setSelectedStudents([]);
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAssignments}
                  disabled={selectedStudents.length === 0}
                  className="px-4 py-2 bg-[#1B6B7B] text-white rounded-xl font-medium hover:bg-[#145a63] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}