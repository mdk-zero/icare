"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { fetchFacultyStudentDetail, predictStudentRisk, logAuditAction, getCurrentFacultyUser, FacultyStudent, fetchStudentScenarioHistory } from "../../../lib/api";
import { SkeletonProfileHeader, SkeletonRiskPredictionCard, SkeletonTabContent } from "../../../components/skeletons";

interface PerformanceHistory {
  quiz_title: string;
  score: number;
  date: string;
  time_taken: number;
}

interface ScenarioPerformanceRecord {
  id: string;
  scenario_title: string;
  score: number;
  max_score: number;
  completed_at: string;
  time_taken: number;
  total_tasks: number;
  completed_tasks: string[];
}

export default function StudentDetailClient() {
  const router = useRouter();
  const params = useParams();
  const studentId = params?.id as string;
  
  const [student, setStudent] = useState<FacultyStudent | null>(null);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceHistory[]>([]);
  const [scenarioHistory, setScenarioHistory] = useState<ScenarioPerformanceRecord[]>([]);
  const [competencies, setCompetencies] = useState<Record<string, number>>({});
  const [riskPrediction, setRiskPrediction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("performance");
  const loggedRef = useRef(false);

  useEffect(() => {
    if (!studentId || loggedRef.current) return;
    loggedRef.current = true;
    const faculty = getCurrentFacultyUser();
    if (faculty) {
      logAuditAction({
        faculty_id: faculty.id,
        faculty_name: faculty.name,
        tab: 'student_detail',
        action: 'view_student',
        details: `Viewed student detail page`,
        target_type: 'student',
        target_id: studentId,
      });
    }
  }, [studentId]);

  useEffect(() => {
    if (studentId) {
      loadStudentData();
    }
  }, [studentId]);

  const loadStudentData = async () => {
    setLoading(true);
    const data = await fetchFacultyStudentDetail(studentId);
    if (data) {
      setStudent(data.student);
      setPerformanceHistory(data.performance_history);
      setCompetencies(data.competencies);
      
      const prediction = await predictStudentRisk(studentId);
      setRiskPrediction(prediction);
    }
    
    const scenarios = await fetchStudentScenarioHistory(studentId);
    setScenarioHistory(scenarios);
    
    setLoading(false);
  };

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getCompetencyColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SkeletonProfileHeader />
          </div>
          <SkeletonRiskPredictionCard />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
          <div className="border-b border-gray-100">
            <div className="flex gap-6 px-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="py-4">
                  <div className="h-4 w-20 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="p-6">
            <SkeletonTabContent />
          </div>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-gray-500">Student not found</p>
        <button 
          onClick={() => router.push('/faculty/students')}
          className="mt-4 px-4 py-2 text-[#1B6B7B] font-medium"
        >
          Back to Students
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <button 
          onClick={() => router.push('/faculty/students')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Students
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[#1B6B7B] to-[#145a63] rounded-full flex items-center justify-center text-white font-bold text-xl">
                {student.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
                <p className="text-gray-500">{student.email}</p>
                <p className="text-sm text-gray-400">{student.program} - Year {student.year}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900">{student.average_score}%</p>
                <p className="text-sm text-gray-500">Avg Score</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900">{student.quiz_count}</p>
                <p className="text-sm text-gray-500">Quizzes</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900">{student.last_activity}</p>
                <p className="text-sm text-gray-500">Last Active</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getRiskColor(student.risk_level)}`}>
                  {student.risk_level
                    ? student.risk_level.charAt(0).toUpperCase() + student.risk_level.slice(1)
                    : 'Unknown'} Risk
                </span>
              </div>
            </div>
          </div>
        </div>

        {riskPrediction && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900">ML Risk Prediction</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Risk Level</span>
                <span className={`font-medium ${riskPrediction.risk_level === 'high' ? 'text-red-600' : riskPrediction.risk_level === 'medium' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {riskPrediction.risk_level.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Confidence</span>
                <span className="font-medium text-gray-900">{riskPrediction.confidence}%</span>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-sm text-gray-500 mb-2">Risk Factors</p>
                <div className="space-y-1">
                  {riskPrediction.factors && typeof riskPrediction.factors === 'object' && Object.keys(riskPrediction.factors).filter(k => riskPrediction.factors[k]).map((key) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                      <span className="text-gray-600 capitalize">{key.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
              {riskPrediction.recommendations && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-sm text-gray-500 mb-2">Recommendations</p>
                  <ul className="space-y-1">
                    {riskPrediction.recommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="text-xs text-gray-600 flex items-start gap-2">
                        <span className="text-[#1B6B7B]">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100">
          <div className="flex gap-6 px-6">
            {['performance', 'scenarios', 'competencies'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-[#1B6B7B] text-[#1B6B7B]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'performance' && (
            <div className="space-y-4">
              {performanceHistory.map((record, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="font-medium text-gray-900">{record.quiz_title}</p>
                    <p className="text-sm text-gray-500">{record.date} • {record.time_taken} min</p>
                  </div>
                  <div className={`text-xl font-bold ${getScoreColor(record.score)}`}>
                    {record.score}%
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'scenarios' && (
            <div className="space-y-4">
              {scenarioHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No scenario performance records yet</p>
              ) : (
                scenarioHistory.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-medium text-gray-900">{record.scenario_title}</p>
                      <p className="text-sm text-gray-500">{record.completed_at} • {Math.floor(record.time_taken / 60)}m {record.time_taken % 60}s</p>
                      <p className="text-xs text-gray-400 mt-1">{record.completed_tasks?.length || 0} / {record.total_tasks || 0} tasks completed</p>
                    </div>
                    <div className={`text-xl font-bold ${getScoreColor(record.score)}`}>
                      {record.score}%
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'competencies' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(competencies).map(([key, value]) => (
                <div key={key} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900 capitalize">{key.replace('_', ' ')}</span>
                    <span className={`font-bold ${getScoreColor(value)}`}>{value}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${getCompetencyColor(value)}`}
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}