"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  SimulationScenario,
  ScenarioTask,
  ScenarioAssignment,
  submitScenarioPerformance,
  fetchScenarioById,
  fetchStudentScenarioAssignments,
} from "../../lib/api";

const defaultTasks: ScenarioTask[] = [
  { id: "t1", title: "Assess Patient Vital Signs", description: "Measure heart rate, blood pressure, temperature, and respiratory rate", category: "assessment", points: 10, is_completed: false },
  { id: "t2", title: "Review Medical History", description: "Check patient's allergies, current medications, and past conditions", category: "assessment", points: 10, is_completed: false },
  { id: "t3", title: "Perform Physical Examination", description: "Conduct head-to-toe physical assessment", category: "assessment", points: 15, is_completed: false },
  { id: "t4", title: "Administer Medication", description: "Give prescribed medication with proper technique", category: "medication", points: 15, is_completed: false },
  { id: "t5", title: "Develop Care Plan", description: "Create nursing care plan based on patient needs", category: "intervention", points: 15, is_completed: false },
  { id: "t6", title: "Document Assessment", description: "Accurately document all findings in patient chart", category: "documentation", points: 10, is_completed: false },
  { id: "t7", title: "Communicate with Patient", description: "Explain procedure and provide health education", category: "communication", points: 10, is_completed: false },
  { id: "t8", title: "Notify Healthcare Team", description: "Report significant findings to physician", category: "communication", points: 15, is_completed: false },
];

export default function ScenarioRunnerClient() {
  const router = useRouter();
  const params = useParams();
  const scenarioId = params.id as string;

  const [scenario, setScenario] = useState<SimulationScenario | null>(null);
  const [assignment, setAssignment] = useState<ScenarioAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<ScenarioTask[]>(defaultTasks);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [activeSection, setActiveSection] = useState<"patient" | "tasks" | "objectives">("patient");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [scenarioData, assignments] = await Promise.all([
        fetchScenarioById(scenarioId),
        fetchStudentScenarioAssignments(""),
      ]);

      if (!scenarioData) {
        setError("Scenario not found or you do not have access.");
        setLoading(false);
        return;
      }

      const matchingAssignment = assignments.find((a) => a.scenario_id === scenarioId);
      if (!matchingAssignment) {
        setError("You have not been assigned this scenario.");
        setLoading(false);
        return;
      }

      setScenario(scenarioData);
      setAssignment(matchingAssignment);
      setLoading(false);
    }

    void load();
  }, [scenarioId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getDifficultyMultiplier = (difficulty: string) => {
    switch (difficulty) {
      case 'advanced': return 1.2;
      case 'intermediate': return 1.0;
      case 'beginner': return 0.8;
      default: return 1.0;
    }
  };

  const calculateScore = () => {
    const totalPoints = tasks.reduce((sum, task) => sum + task.points, 0);
    const earnedPoints = tasks.filter(t => completedTasks.includes(t.id)).reduce((sum, task) => sum + task.points, 0);
    const multiplier = getDifficultyMultiplier(scenario?.difficulty || 'beginner');
    return Math.round((earnedPoints / totalPoints) * 100 * multiplier);
  };

  const toggleTask = (taskId: string) => {
    if (isCompleted) return;
    setCompletedTasks(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleComplete = async () => {
    if (!assignment) return;
    const score = calculateScore();
    const performance = await submitScenarioPerformance(
      assignment.id,
      completedTasks,
      elapsedTime
    );
    setIsCompleted(true);
    if (performance) {
      alert(`Simulation completed!\nScore: ${performance.score}%\nTime: ${formatTime(performance.time_taken)}`);
    } else {
      alert(`Simulation completed!\nScore: ${score}%\nTime: ${formatTime(elapsedTime)}`);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'assessment': return 'bg-blue-100 text-blue-700';
      case 'intervention': return 'bg-purple-100 text-purple-700';
      case 'medication': return 'bg-red-100 text-red-700';
      case 'communication': return 'bg-green-100 text-green-700';
      case 'documentation': return 'bg-amber-100 text-amber-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const progress = (completedTasks.length / tasks.length) * 100;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading scenario...</p>
        </div>
      </div>
    );
  }

  if (error || !scenario) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <p className="text-red-600 mb-4">{error || "Unable to load scenario."}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const patientCase = scenario.patient_case || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-surface border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push("/dashboard")}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{scenario.title}</h1>
              <p className="text-sm text-gray-500">{scenario.category}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-500">Elapsed Time</p>
              <p className="text-xl font-mono font-bold text-gray-900">{formatTime(elapsedTime)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Progress</p>
              <p className="text-xl font-bold text-brand-600">{Math.round(progress)}%</p>
            </div>
            <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-brand-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="border-b border-gray-100">
                <div className="flex">
                  {[
                    { key: "patient", label: "Patient Case" },
                    { key: "tasks", label: "Tasks" },
                    { key: "objectives", label: "Learning Objectives" }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveSection(tab.key as any)}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${
                        activeSection === tab.key
                          ? "bg-brand-600/5 text-brand-600 border-b-2 border-brand-600"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6">
                {activeSection === "patient" && (
                  <div className="space-y-6">
                    {patientCase.chief_complaint && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-red-100 rounded-lg">
                            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-semibold text-red-800">Chief Complaint</p>
                            <p className="text-red-700">{patientCase.chief_complaint}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {patientCase.vitals && Object.keys(patientCase.vitals).length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Vital Signs</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          {Object.entries(patientCase.vitals).map(([key, value]) => (
                            <div key={key} className="bg-gray-50 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500 capitalize">{key.replace(/_/g, ' ')}</p>
                              <p className="font-semibold text-gray-800">{String(value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {patientCase.medical_history && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-2">Medical History</h3>
                        <p className="text-gray-600">{patientCase.medical_history}</p>
                      </div>
                    )}

                    {patientCase.physical_exam && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-2">Physical Examination</h3>
                        <p className="text-gray-600">{patientCase.physical_exam}</p>
                      </div>
                    )}

                    {patientCase.diagnosis && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-2">Diagnosis</h3>
                        <p className="text-gray-800 font-medium">{patientCase.diagnosis}</p>
                      </div>
                    )}

                    {patientCase.treatment_plan && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-2">Treatment Plan</h3>
                        <p className="text-gray-600">{patientCase.treatment_plan}</p>
                      </div>
                    )}
                  </div>
                )}

                {activeSection === "tasks" && (
                  <div className="space-y-3">
                    {tasks.map((task) => (
                      <div 
                        key={task.id}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          completedTasks.includes(task.id)
                            ? "border-green-500 bg-green-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                        onClick={() => toggleTask(task.id)}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            completedTasks.includes(task.id)
                              ? "border-green-500 bg-green-500 text-white"
                              : "border-gray-300"
                          }`}>
                            {completedTasks.includes(task.id) && (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={`font-medium ${completedTasks.includes(task.id) ? "text-green-800" : "text-gray-800"}`}>
                                {task.title}
                              </p>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getCategoryColor(task.category)}`}>
                                {task.category}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">{task.description}</p>
                            <p className="text-xs text-gray-400 mt-1">{task.points} points</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === "objectives" && (
                  <ul className="space-y-3">
                    {scenario.learning_objectives?.map((objective, index) => (
                      <li key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-6 h-6 rounded-full bg-brand-600/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-medium text-brand-600">{index + 1}</span>
                        </div>
                        <p className="text-gray-700">{objective}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Completion Summary</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  scenario.difficulty === 'advanced' ? 'bg-red-100 text-red-700' :
                  scenario.difficulty === 'intermediate' ? 'bg-amber-100 text-amber-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {scenario.difficulty} difficulty
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-2xl font-bold text-gray-900">{completedTasks.length}</p>
                  <p className="text-sm text-gray-500">Tasks Completed</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-2xl font-bold text-gray-900">{tasks.length - completedTasks.length}</p>
                  <p className="text-sm text-gray-500">Tasks Remaining</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-2xl font-bold text-brand-600">{calculateScore()}%</p>
                  <p className="text-sm text-gray-500">Projected Score</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24">
              <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button 
                  onClick={() => setActiveSection("patient")}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${
                    activeSection === "patient" ? "bg-brand-600/10 text-brand-600" : "hover:bg-gray-50"
                  }`}
                >
                  View Patient Case
                </button>
                <button 
                  onClick={() => setActiveSection("tasks")}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${
                    activeSection === "tasks" ? "bg-brand-600/10 text-brand-600" : "hover:bg-gray-50"
                  }`}
                >
                  View Tasks ({completedTasks.length}/{tasks.length})
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                {isCompleted ? (
                  <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-2">Simulation Complete!</h4>
                    <p className="text-sm text-gray-500 mb-4">Final Score: {calculateScore()}%</p>
                    <button 
                      onClick={() => router.push("/dashboard")}
                      className="w-full px-4 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleComplete}
                    disabled={completedTasks.length === 0}
                    className="w-full px-4 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Complete Simulation
                  </button>
                )}
              </div>
            </div>

            <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Category Legend</h3>
              <div className="space-y-2">
                {[
                  { category: "assessment", label: "Assessment" },
                  { category: "intervention", label: "Intervention" },
                  { category: "medication", label: "Medication" },
                  { category: "communication", label: "Communication" },
                  { category: "documentation", label: "Documentation" }
                ].map(({ category, label }) => (
                  <div key={category} className="flex items-center gap-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getCategoryColor(category)}`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
