"use client";

import { useState, useEffect } from "react";
import { fetchFacultyReports, fetchFacultyStudents, generateFacultyReport, logAuditAction, getCurrentFacultyUser, FacultyReport, FacultyStudent } from "../../lib/api";
import { SkeletonInlineStatCard, SkeletonTable } from "../../components/skeletons";
import PageHeader from "../../components/PageHeader";

export default function FacultyReportsClient() {
  const [reports, setReports] = useState<FacultyReport[]>([]);
  const [students, setStudents] = useState<FacultyStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [reportType, setReportType] = useState("competency");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [reportsData, studentsData] = await Promise.all([
      fetchFacultyReports(),
      fetchFacultyStudents()
    ]);
    setReports(reportsData);
    setStudents(studentsData);
    setLoading(false);
  };

  const handleGenerateReport = async () => {
    if (!selectedStudent) return;
    setGenerating(true);
    const newReport = await generateFacultyReport(selectedStudent, reportType);
    if (newReport) {
      setReports([...reports, newReport]);
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: 'reports',
          action: 'generate_report',
          details: `Generated ${reportType} report for ${newReport.student_name}`,
          target_type: 'report',
          target_id: newReport.id,
          metadata: { student_name: newReport.student_name, report_type: reportType },
        });
      }
    }
    setGenerating(false);
    setShowModal(false);
    setSelectedStudent("");
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
          label: "Competency Reports",
        }}
        title="Competency Reports"
        subtitle="Generate and manage student competency reports"
        action={{
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          ),
          onClick: () => setShowModal(true),
          label: "Generate Report",
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{reports.length}</p>
              <p className="text-xs text-gray-500">Total Reports</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{reports.filter(r => r.report_type === 'competency').length}</p>
              <p className="text-xs text-gray-500">Competency</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{reports.filter(r => r.report_type === 'at-risk').length}</p>
              <p className="text-xs text-gray-500">At-Risk</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Student</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Report Type</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Generated</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Status</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <p className="font-semibold text-gray-800">{report.student_name}</p>
                      <p className="text-sm text-gray-500">{report.student_id}</p>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        report.report_type === 'at-risk' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {report.report_type.charAt(0).toUpperCase() + report.report_type.slice(1)}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-gray-600">{report.generated_at}</td>
                    <td className="py-4 px-6">
                      {report.pdf_url ? (
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                          Available
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <button className="text-[#1B6B7B] font-medium hover:text-[#145a63] transition-colors">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No reports generated yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate Competency Report</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Student</label>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                >
                  <option value="">Select a student</option>
                  {students.map((student) => (
                    <option key={student.student_id} value={student.student_id}>
                      {student.name} ({student.email})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                >
                  <option value="competency">Competency Report</option>
                  <option value="at-risk">At-Risk Report</option>
                  <option value="progress">Progress Report</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateReport}
                disabled={generating || !selectedStudent}
                className="px-4 py-2 bg-[#1B6B7B] text-white rounded-xl font-medium hover:bg-[#145a63] transition-all disabled:opacity-50"
              >
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}