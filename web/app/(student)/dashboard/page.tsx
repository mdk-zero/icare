"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  getCurrentUser,
  User,
  Patient,
  fetchPatients,
  fetchStudentScenarioAssignments,
  fetchStudentAssessments,
  fetchMyRecommendations,
  dismissRecommendation,
  LearningRecommendation,
  StudentAssessment,
} from "../../lib/api";

interface ScenarioAssignment {
  id: string;
  scenario_id: string;
  scenario_title: string;
  assigned_at: string;
  deadline: string;
  status: "pending" | "in_progress" | "completed" | "overdue";
  required: boolean;
  score?: number;
}

export default function StudentDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(getCurrentUser);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [quizzes, setQuizzes] = useState<StudentAssessment[]>([]);
  const [recommendations, setRecommendations] = useState<LearningRecommendation[]>([]);
  const [scenarioAssignments, setScenarioAssignments] = useState<
    ScenarioAssignment[]
  >([]);

  const activeTab = searchParams.get("tab") || "dashboard";

  const loadScenarioAssignments = useCallback(async (studentId: string) => {
    const assignments = await fetchStudentScenarioAssignments(studentId);
    setScenarioAssignments(assignments);
  }, []);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(currentUser);
    loadScenarioAssignments(currentUser.id);
    fetchStudentAssessments().then(setQuizzes);
    fetchMyRecommendations().then(setRecommendations);
    fetchPatients().then(setPatients);
  }, [router, loadScenarioAssignments]);

  const handleDismissRecommendation = async (id: string) => {
    setRecommendations((prev) => prev.filter((rec) => rec.id !== id));
    await dismissRecommendation(id);
  };

  const getVitalStatus = (
    vital: number | null,
    type: string
  ): { status: string; color: string } => {
    if (vital === null) return { status: "N/A", color: "text-gray-400" };

    const ranges = {
      heart_rate: { low: 60, high: 100 },
      temperature: { low: 36.1, high: 37.2 },
      respiratory_rate: { low: 12, high: 20 },
      oxygen_saturation: { low: 95, high: 100 },
    };

    const range = ranges[type as keyof typeof ranges];
    if (!range) return { status: "Normal", color: "text-green-600" };

    if (vital < range.low) return { status: "Low", color: "text-yellow-600" };
    if (vital > range.high) return { status: "High", color: "text-red-600" };
    return { status: "Normal", color: "text-green-600" };
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      {activeTab === "dashboard" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{patients.length}</p>
                  <p className="text-sm text-gray-500">Assigned Patients</p>
                </div>
              </div>
            </div>

            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">3</p>
                  <p className="text-sm text-gray-500">Quizzes Completed</p>
                </div>
              </div>
            </div>

            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-purple-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">85%</p>
                  <p className="text-sm text-gray-500">Average Score</p>
                </div>
              </div>
            </div>

            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-orange-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">2h</p>
                  <p className="text-sm text-gray-500">Study Time Today</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-4">
                Recent Patients
              </h3>
              {patients.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">
                  No patients yet — they appear here once a faculty member
                  assigns you a scenario linked to one.
                </p>
              ) : (
              <div className="space-y-3">
                {patients.slice(0, 3).map((patient) => (
                  <div
                    key={patient.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
                        {patient.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">
                          {patient.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {patient.room_number}
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                      {patient.diagnosis}
                    </span>
                  </div>
                ))}
              </div>
              )}
            </div>

            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-4">
                Recommended for You
              </h3>
              {recommendations.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">
                  No recommendations yet — take a quiz so the recommender can
                  learn your strengths. New picks arrive nightly.
                </p>
              ) : (
                <div className="space-y-3">
                  {recommendations.slice(0, 5).map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {rec.assessments?.title ?? "Quiz"}
                        </p>
                        <p className="text-xs text-gray-500">{rec.reason}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {rec.assessments && (
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              rec.assessments.difficulty === "beginner"
                                ? "bg-green-100 text-green-700"
                                : rec.assessments.difficulty === "intermediate"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {rec.assessments.difficulty}
                          </span>
                        )}
                        <button
                          onClick={() => router.push(`/quizzes/${rec.assessment_id}`)}
                          className="px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-[#155663] transition-colors"
                        >
                          Start
                        </button>
                        <button
                          onClick={() => handleDismissRecommendation(rec.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Dismiss recommendation"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === "patients" && (
        <div className="space-y-4">
          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Patient List</h3>
              <span className="text-sm text-gray-500">
                {patients.length} patients assigned
              </span>
            </div>
            {patients.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">
                No patients yet — they appear here once a faculty member
                assigns you a scenario linked to one.
              </p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">
                      Patient
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">
                      Room
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">
                      Diagnosis
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">
                      HR
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">
                      BP
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">
                      Temp
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">
                      RR
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">
                      SpO2
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-medium">
                            {patient.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">
                              {patient.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {patient.age}yo {patient.gender}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {patient.room_number}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                          {patient.diagnosis}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 font-medium ${
                          getVitalStatus(patient.vital_signs.heart_rate, "heart_rate").color
                        }`}
                      >
                        {patient.vital_signs.heart_rate ?? "—"}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {patient.vital_signs.blood_pressure ?? "—"}
                      </td>
                      <td
                        className={`py-3 px-4 font-medium ${
                          getVitalStatus(patient.vital_signs.temperature, "temperature").color
                        }`}
                      >
                        {patient.vital_signs.temperature ?? "—"}°C
                      </td>
                      <td
                        className={`py-3 px-4 font-medium ${
                          getVitalStatus(
                            patient.vital_signs.respiratory_rate,
                            "respiratory_rate"
                          ).color
                        }`}
                      >
                        {patient.vital_signs.respiratory_rate ?? "—"}
                      </td>
                      <td
                        className={`py-3 px-4 font-medium ${
                          getVitalStatus(
                            patient.vital_signs.oxygen_saturation,
                            "oxygen_saturation"
                          ).color
                        }`}
                      >
                        {patient.vital_signs.oxygen_saturation ?? "—"}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "quizzes" && (
        <div className="space-y-4">
          {quizzes.length === 0 && (
            <div className="bg-surface p-10 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-500">
              No quizzes are available yet. Assigned quizzes will appear here.
            </div>
          )}
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-800">
                      {quiz.title}
                    </h3>
                    {quiz.assignment && (
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          quiz.assignment.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : quiz.assignment.status === "overdue"
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {quiz.assignment.status === "completed"
                          ? "Completed"
                          : quiz.assignment.status === "overdue"
                          ? "Overdue"
                          : "Assigned"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-2">
                    {quiz.description}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-sm rounded">
                      {quiz.category}
                    </span>
                    <span
                      className={`px-2 py-1 text-sm rounded ${
                        quiz.difficulty === "beginner"
                          ? "bg-green-100 text-green-700"
                          : quiz.difficulty === "intermediate"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {quiz.difficulty}
                    </span>
                    <span className="text-sm text-gray-400">
                      {quiz.question_count} question{quiz.question_count === 1 ? "" : "s"}
                    </span>
                    {quiz.assignment?.deadline && (
                      <span className="text-sm text-gray-400">
                        Due {new Date(quiz.assignment.deadline).toLocaleDateString()}
                      </span>
                    )}
                    {quiz.best_score !== null && (
                      <span className="text-sm font-medium text-brand-600">
                        Best: {quiz.best_score}%
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/quizzes/${quiz.id}`)}
                  className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-[#155663] transition-colors shrink-0"
                >
                  {quiz.attempt_count > 0 ? "Retake Quiz" : "Start Quiz"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "scenarios" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
              <p className="text-4xl font-bold text-brand-600">
                {scenarioAssignments.filter((a) => a.status === "pending").length}
              </p>
              <p className="text-gray-500 mt-2">Pending</p>
            </div>
            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
              <p className="text-4xl font-bold text-brand-600">
                {scenarioAssignments.filter((a) => a.status === "in_progress").length}
              </p>
              <p className="text-gray-500 mt-2">In Progress</p>
            </div>
            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
              <p className="text-4xl font-bold text-emerald-600">
                {scenarioAssignments.filter((a) => a.status === "completed").length}
              </p>
              <p className="text-gray-500 mt-2">Completed</p>
            </div>
          </div>

          <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">
              Assigned Scenarios
            </h3>
            {scenarioAssignments.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No scenarios assigned yet
              </p>
            ) : (
              <div className="space-y-3">
                {scenarioAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                  >
                    <div>
                      <h4 className="font-medium text-gray-800">
                        {assignment.scenario_title}
                      </h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            assignment.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : assignment.status === "in_progress"
                              ? "bg-blue-100 text-blue-700"
                              : assignment.status === "overdue"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {assignment.status.replace("_", " ")}
                        </span>
                        {assignment.required && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                            Required
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          Due: {assignment.deadline}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {assignment.score !== undefined && (
                        <span
                          className={`text-lg font-bold ${
                            assignment.score >= 80
                              ? "text-emerald-600"
                              : assignment.score >= 60
                              ? "text-amber-600"
                              : "text-red-600"
                          }`}
                        >
                          {assignment.score}%
                        </span>
                      )}
                      <button
                        onClick={() =>
                          router.push(`/scenarios/${assignment.scenario_id}`)
                        }
                        className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-[#155663] transition-colors"
                      >
                        {assignment.status === "completed"
                          ? "Review"
                          : assignment.status === "in_progress"
                          ? "Continue"
                          : "Start"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "performance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
              <p className="text-4xl font-bold text-brand-600">85%</p>
              <p className="text-gray-500 mt-2">Average Score</p>
            </div>
            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
              <p className="text-4xl font-bold text-brand-600">3</p>
              <p className="text-gray-500 mt-2">Quizzes Completed</p>
            </div>
            <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
              <p className="text-4xl font-bold text-brand-600">12m</p>
              <p className="text-gray-500 mt-2">Avg. Time per Quiz</p>
            </div>
          </div>

          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-4">
              Performance History
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-800">
                    Vital Signs Assessment
                  </p>
                  <p className="text-sm text-gray-500">Today, 10:30 AM</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-600">90%</p>
                  <p className="text-sm text-gray-500">10 min</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-800">
                    Patient Documentation
                  </p>
                  <p className="text-sm text-gray-500">Yesterday, 2:15 PM</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-600">80%</p>
                  <p className="text-sm text-gray-500">15 min</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-800">
                    Clinical Decision Making
                  </p>
                  <p className="text-sm text-gray-500">Apr 24, 9:00 AM</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-yellow-600">70%</p>
                  <p className="text-sm text-gray-500">20 min</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
