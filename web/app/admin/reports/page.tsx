import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileLines,
  faTriangleExclamation,
  faChartColumn,
  faClock,
  faChevronRight,
  faFilePdf,
  faFileExcel,
  faFileCsv,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export const metadata = {
  title: "Reports | iCARE++",
};

export default function ReportsPage() {
  const reportTypes: { title: string; desc: string; href: string; icon: IconDefinition }[] = [
    { title: 'Competency Report', desc: 'Per-student competency PDF — open a student profile to download', href: '/admin/student-management', icon: faFileLines },
    { title: 'At-Risk Students', desc: 'List students needing intervention', href: '/admin/student-management', icon: faTriangleExclamation },
    { title: 'Analytics Summary', desc: 'Warehouse-backed performance analytics', href: '/admin/analytics', icon: faChartColumn },
    { title: 'Activity Log', desc: 'Filterable append-only audit trail of all roles', href: '/admin/audit', icon: faClock },
  ];

  return (
    <div>
      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-4 sm:p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-brand-600 rounded-full text-xs sm:text-sm font-medium w-fit mb-3">
              <FontAwesomeIcon icon={faFileLines} className="w-3.5 h-3.5" />
              Reports
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Reports & Export</h1>
            <p className="text-gray-500 mt-1">Generate competency reports, analytics summaries, and access audit trails</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reportTypes.map((report, idx) => (
          <Link key={idx} href={report.href} className="bg-surface p-6 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 text-left group block">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-brand-600/10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <FontAwesomeIcon icon={report.icon} className="w-7 h-7 text-brand-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{report.title}</h3>
                <p className="text-sm text-gray-500">{report.desc}</p>
              </div>
              <FontAwesomeIcon icon={faChevronRight} className="w-5 h-5 text-gray-400 group-hover:text-brand-600 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 bg-surface rounded-xl p-6 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Options</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-200 transition-all">
            <FontAwesomeIcon icon={faFilePdf} className="w-5 h-5 text-gray-600" />
            <span className="text-gray-700 font-medium">Export PDF</span>
          </button>
          <button className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-200 transition-all">
            <FontAwesomeIcon icon={faFileExcel} className="w-5 h-5 text-gray-600" />
            <span className="text-gray-700 font-medium">Export Excel</span>
          </button>
          <button className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-200 transition-all">
            <FontAwesomeIcon icon={faFileCsv} className="w-5 h-5 text-gray-600" />
            <span className="text-gray-700 font-medium">Export CSV</span>
          </button>
        </div>
      </div>
    </div>
  );
}