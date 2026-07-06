"use client";

import { useState, useEffect } from "react";
import { fetchFacultyAnalytics, FacultyAnalytics } from "../../lib/api";
import {
  SkeletonStatCard,
  SkeletonChartArea,
  SkeletonCompetencyGrid,
  SkeletonInsightCard,
} from "../../components/skeletons";
import PageHeader from "../../components/PageHeader";

export default function FacultyAnalyticsClient() {
  const [analytics, setAnalytics] = useState<FacultyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    const data = await fetchFacultyAnalytics();
    setAnalytics(data);
    setLoading(false);
  };

  const getInsightColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-50 border-red-200 text-red-700';
      case 'medium': return 'bg-amber-50 border-amber-200 text-amber-700';
      case 'low': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      default: return 'bg-gray-50 border-gray-200 text-gray-700';
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'risk': return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
      case 'recommendation': return 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z';
      case 'success': return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
      default: return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6 animate-pulse">
          <div className="space-y-3">
            <div className="h-5 w-32 bg-gray-200 rounded-full" />
            <div className="h-8 w-64 bg-gray-200 rounded" />
            <div className="h-4 w-96 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChartArea />
          <SkeletonChartArea />
        </div>
        <SkeletonCompetencyGrid />
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 animate-pulse">
          <div className="h-5 w-24 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonInsightCard key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          ),
          label: "ML Insights",
        }}
        title="ML-Powered Analytics"
        subtitle="Machine learning-driven performance predictions and insights"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-50 rounded-xl">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{analytics?.cohort_performance.average_score ?? 0}%</p>
          <p className="text-gray-500 text-sm mt-1">Cohort Average</p>
          <div className="mt-3">
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
              {analytics?.cohort_performance.improvement_trend}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-50 rounded-xl">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{analytics?.cohort_performance.total_quizzes ?? 0}</p>
          <p className="text-gray-500 text-sm mt-1">Total Quizzes</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-50 rounded-xl">
              <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{analytics?.cohort_performance.completion_rate ?? 0}%</p>
          <p className="text-gray-500 text-sm mt-1">Completion Rate</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-50 rounded-xl">
              <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{(analytics?.risk_distribution.high ?? 0) + (analytics?.risk_distribution.medium ?? 0)}</p>
          <p className="text-gray-500 text-sm mt-1">At-Risk Students</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Distribution</h3>
          <div className="flex items-center justify-center">
            <div className="relative w-48 h-48">
              <svg className="w-48 h-48 transform -rotate-90">
                <circle cx="96" cy="96" r="70" fill="none" stroke="#f3f4f6" strokeWidth="20" />
                {analytics && (
                  <>
                    <circle cx="96" cy="96" r="70" fill="none" stroke="#10b981" strokeWidth="20" 
                      strokeDasharray={`${(analytics.risk_distribution.low / (analytics.risk_distribution.low + analytics.risk_distribution.medium + analytics.risk_distribution.high)) * 440} 440`} 
                      strokeLinecap="round" />
                    <circle cx="96" cy="96" r="70" fill="none" stroke="#f59e0b" strokeWidth="20" 
                      strokeDasharray={`${(analytics.risk_distribution.medium / (analytics.risk_distribution.low + analytics.risk_distribution.medium + analytics.risk_distribution.high)) * 440} 440`} 
                      strokeDashoffset={`-${(analytics.risk_distribution.low / (analytics.risk_distribution.low + analytics.risk_distribution.medium + analytics.risk_distribution.high)) * 440}`}
                      strokeLinecap="round" />
                    <circle cx="96" cy="96" r="70" fill="none" stroke="#ef4444" strokeWidth="20" 
                      strokeDasharray={`${(analytics.risk_distribution.high / (analytics.risk_distribution.low + analytics.risk_distribution.medium + analytics.risk_distribution.high)) * 440} 440`} 
                      strokeDashoffset={`-${((analytics.risk_distribution.low + analytics.risk_distribution.medium) / (analytics.risk_distribution.low + analytics.risk_distribution.medium + analytics.risk_distribution.high)) * 440}`}
                      strokeLinecap="round" />
                  </>
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-bold text-gray-800">{analytics ? analytics.risk_distribution.low + analytics.risk_distribution.medium + analytics.risk_distribution.high : 0}</p>
                <p className="text-sm text-gray-500">Students</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-full" />
              <span className="text-sm text-gray-600">Low ({analytics?.risk_distribution.low ?? 0})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-500 rounded-full" />
              <span className="text-sm text-gray-600">Medium ({analytics?.risk_distribution.medium ?? 0})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span className="text-sm text-gray-600">High ({analytics?.risk_distribution.high ?? 0})</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trend</h3>
          <div className="h-40 flex items-end justify-between gap-2 px-2">
            {analytics?.performance_trend.map((item, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                <div 
                  className="w-full bg-gradient-to-t from-[#1B6B7B] to-[#2a8a98] rounded-t transition-all duration-300 hover:opacity-80"
                  style={{ height: `${item.average}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3 px-2">
            {analytics?.performance_trend.map((item, idx) => (
              <span key={idx} className="text-xs text-gray-400">{item.week}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Competency Breakdown</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {analytics && Object.entries(analytics.competency_breakdown).map(([key, value]) => (
            <div key={key} className="text-center">
              <div className="relative w-20 h-20 mx-auto">
                <svg className="w-20 h-20 transform -rotate-90">
                  <circle cx="40" cy="40" r="16" fill="none" stroke="#f3f4f6" strokeWidth="4" />
                  <circle cx="40" cy="40" r="16" fill="none" stroke="#1B6B7B" strokeWidth="4"
                    strokeDasharray={`${(value / 100) * 100} 100`}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-semibold text-gray-800">{value}%</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2 capitalize">{key.replace('_', ' ')}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">ML Insights</h3>
        <div className="space-y-3">
          {analytics?.ml_insights.map((insight, idx) => (
            <div key={idx} className={`flex items-start gap-4 p-4 rounded-xl border ${getInsightColor(insight.priority)}`}>
              <div className="w-8 h-8 rounded-full bg-white/50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getInsightIcon(insight.type)} />
                </svg>
              </div>
              <div>
                <p className="font-medium">{insight.message}</p>
                <p className="text-xs opacity-75 mt-1 capitalize">Priority: {insight.priority}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}