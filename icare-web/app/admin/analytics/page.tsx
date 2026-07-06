export const metadata = {
  title: "Analytics | iCARE++",
};

export default function AnalyticsPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-[#1B6B7B] rounded-full text-xs sm:text-sm font-medium w-fit mb-3">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Analytics
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-500 mt-1">Cohort-level analytics and competency reports for the College of Health Sciences</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <select className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/50">
              <option>Academic Year 2025-2026</option>
              <option>Academic Year 2024-2025</option>
              <option>Academic Year 2023-2024</option>
            </select>
            <button className="px-4 py-2 bg-[#1B6B7B] text-white font-medium rounded-xl hover:bg-[#145a63] transition-all duration-300 flex items-center gap-2 shadow-lg shadow-[#1B6B7B]/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Report
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Students", value: "8", change: "0" },
          { label: "At-Risk Students", value: "3", change: "-2" },
          { label: "Active Rooms", value: "8", change: "0" },
          { label: "Avg. Score", value: "82%", change: "+3%" },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className={`text-sm font-medium ${stat.change.startsWith('+') ? 'text-emerald-600' : stat.change.startsWith('-') ? 'text-rose-600' : 'text-gray-500'}`}>
                {stat.change}
              </span>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Weekly Quiz Performance</h3>
            </div>
            <button className="text-sm text-[#1B6B7B] hover:underline">View Details</button>
          </div>
          <div className="h-48 flex items-end justify-between gap-3 px-2">
            {[
              { day: 'Mon', value: 78 },
              { day: 'Tue', value: 85 },
              { day: 'Wed', value: 72 },
              { day: 'Thu', value: 90 },
              { day: 'Fri', value: 88 },
              { day: 'Sat', value: 65 },
              { day: 'Sun', value: 82 },
            ].map((item, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="w-full relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1B6B7B] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {item.value}%
                  </div>
                  <div className="w-full bg-gradient-to-t from-[#1B6B7B] to-[#2a8a98] rounded-t-lg transition-all duration-500 hover:opacity-80" style={{ height: `${item.value * 0.45}px` }} />
                </div>
                <span className="text-xs text-gray-500 font-medium">{item.day}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <div>
              <p className="text-2xl font-bold text-gray-800">80%</p>
              <p className="text-sm text-gray-500">Average Completion</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-600">+12%</p>
              <p className="text-sm text-gray-500">vs last week</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Score Distribution</h3>
            </div>
            <button className="text-sm text-[#1B6B7B] hover:underline">View Details</button>
          </div>
          <div className="flex items-center justify-center h-40">
            <svg viewBox="0 0 100 50" className="w-full">
              <path d="M0,50 L0,40 L20,35 L40,30 L60,20 L80,10 L100,5 L100,50 Z" fill="url(#gradient)" opacity="0.3" />
              <path d="M0,40 L20,35 L40,30 L60,20 L80,10 L100,5" stroke="#1B6B7B" strokeWidth="2" fill="none" />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#1B6B7B" />
                  <stop offset="100%" stopColor="#1B6B7B" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#1B6B7B] rounded-full" />
              <span className="text-sm text-gray-600">Score Trend</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Student Performance by Room</h3>
            </div>
            <button className="text-sm text-[#1B6B7B] hover:underline">View All</button>
          </div>
          <div className="space-y-4">
            {[
              { room: 'Room 101 - General Ward', avg: 85, students: 10, trend: 'up' },
              { room: 'Room 102 - ICU Simulation', avg: 78, students: 6, trend: 'down' },
              { room: 'Room 103 - Emergency', avg: 92, students: 8, trend: 'up' },
              { room: 'Room 104 - Pediatric', avg: 71, students: 5, trend: 'down' },
              { room: 'Room 105 - Maternity', avg: 88, students: 7, trend: 'up' },
              { room: 'Room 106 - Surgery', avg: 82, students: 6, trend: 'stable' },
              { room: 'Room 107 - Oncology', avg: 79, students: 5, trend: 'up' },
              { room: 'Room 108 - NICU', avg: 90, students: 4, trend: 'up' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-800">{item.room}</span>
                    <span className={`text-xs font-medium ${item.trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {item.trend === 'up' ? '↑' : '↓'} {item.trend === 'up' ? '+' : '-'}{Math.abs(item.avg - 80)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#1B6B7B] to-[#2a8a98] rounded-full" style={{ width: `${item.avg}%` }} />
                    </div>
                    <span className="text-sm font-bold text-gray-800 w-10">{item.avg}%</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{item.students}</p>
                  <p className="text-xs text-gray-400">students</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">At-Risk Student Trends</h3>
            </div>
            <button className="text-sm text-[#1B6B7B] hover:underline">View All</button>
          </div>
          <div className="h-32 flex items-end justify-between gap-2 px-4">
            {[5, 4, 4, 3, 3, 3, 3, 3].map((val, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="w-full relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1B6B7B] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {val} students
                  </div>
                  <div className="w-full bg-[#1B6B7B] rounded-t transition-all duration-300" style={{ height: `${val * 24}px` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 px-4">
            {['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'].map((w, i) => (
              <span key={i} className="text-[10px] text-gray-400">{w}</span>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Currently <span className="font-semibold text-rose-600">3 students</span> at risk</p>
              <button className="text-sm text-[#1B6B7B] font-medium hover:underline">View Details →</button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Competency Assessment Summary</h3>
                <p className="text-sm text-gray-500">Track nursing competency progression across all cohorts</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-[#1B6B7B] text-white font-medium rounded-xl hover:bg-[#145a63] transition-all duration-300">
              Generate Report
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left py-4 px-6 font-semibold text-gray-700">Competency</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-700">Students Assessed</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-700">Average Score</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-700">Pass Rate</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-700">Trend</th>
              </tr>
            </thead>
            <tbody>
              {[
                { competency: "Vital Signs Monitoring", assessed: 8, avg: 85, pass: "88%", trend: "up" },
                { competency: "Patient Assessment", assessed: 8, avg: 78, pass: "75%", trend: "up" },
                { competency: "IVF Administration", assessed: 7, avg: 82, pass: "86%", trend: "stable" },
                { competency: "Clinical Documentation", assessed: 8, avg: 89, pass: "100%", trend: "up" },
                { competency: "Emergency Response", assessed: 6, avg: 71, pass: "67%", trend: "down" },
              ].map((item, idx) => (
                <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-6 text-gray-800 font-medium">{item.competency}</td>
                  <td className="py-4 px-6 text-gray-600">{item.assessed}</td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1B6B7B] rounded-full" style={{ width: `${item.avg}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-800">{item.avg}%</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      parseInt(item.pass) >= 90 ? 'bg-emerald-50 text-emerald-700' :
                      parseInt(item.pass) >= 80 ? 'bg-[#1B6B7B]/10 text-[#1B6B7B]' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {item.pass}
                    </span>
                  </td>
                  <td className="py-4 px-6">
{item.trend === "up" && <span className="text-emerald-600">↑ Improving</span>}
                    {item.trend === "down" && <span className="text-rose-600">↓ Declining</span>}
                    {item.trend === "stable" && <span className="text-gray-500">→ Stable</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}