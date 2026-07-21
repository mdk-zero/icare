"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faClipboard,
  faTriangleExclamation,
  faFlask,
  faFileLines,
  faClipboardCheck,
  faCircleInfo,
  faRightToBracket,
  faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import { fetchAuditTrail, AuditLog } from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import Card from "../../components/Card";
import { SkeletonTable } from "../../components/skeletons";

export default function FacultyAuditClient() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");

  const loadAuditTrail = useCallback(async () => {
    setLoading(true);
    const action = actionFilter !== "all" ? actionFilter : undefined;
    const data = await fetchAuditTrail(action);
    setAuditLogs(data);
    setLoading(false);
  }, [actionFilter]);

  useEffect(() => {
    loadAuditTrail();
  }, [loadAuditTrail]);

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTabColor = (tab: string) => {
    const t = tab.toLowerCase();
    if (t === 'students' || t === 'student_detail') return 'bg-blue-50 text-blue-700';
    if (t === 'scenarios') return 'bg-purple-50 text-purple-700';
    if (t === 'reports') return 'bg-blue-50 text-blue-700';
    if (t === 'notifications') return 'bg-amber-50 text-amber-700';
    if (t === 'settings') return 'bg-gray-50 text-gray-700';
    if (t === 'overview') return 'bg-emerald-50 text-emerald-700';
    if (t === 'analytics') return 'bg-indigo-50 text-indigo-700';
    if (t === 'patients') return 'bg-rose-50 text-rose-700';
    if (t === 'audit') return 'bg-cyan-50 text-cyan-700';
    if (t === 'authentication') return 'bg-orange-50 text-orange-700';
    return 'bg-gray-50 text-gray-700';
  };

  const getActionColor = (action: string) => {
    const lowerAction = action.toLowerCase();
    if (lowerAction.includes('alert')) return 'bg-red-50 text-red-700';
    if (lowerAction.includes('scenario')) return 'bg-purple-50 text-purple-700';
    if (lowerAction.includes('report')) return 'bg-blue-50 text-blue-700';
    if (lowerAction.includes('review')) return 'bg-emerald-50 text-emerald-700';
    if (lowerAction === 'login') return 'bg-green-50 text-green-700';
    if (lowerAction === 'logout') return 'bg-gray-100 text-gray-700';
    return 'bg-gray-50 text-gray-700';
  };

  const getActionIcon = (action: string): IconDefinition => {
    const lowerAction = action.toLowerCase();
    if (lowerAction.includes('alert')) return faTriangleExclamation;
    if (lowerAction.includes('scenario')) return faFlask;
    if (lowerAction.includes('report')) return faFileLines;
    if (lowerAction.includes('reviewed')) return faClipboardCheck;
    if (lowerAction === 'login') return faRightToBracket;
    if (lowerAction === 'logout') return faRightFromBracket;
    return faCircleInfo;
  };

  return (
    <div>
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          ),
          label: "Audit Trail",
        }}
        title="Audit Trail"
        subtitle="Complete history of all faculty activities and interactions"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatTile
          icon={<FontAwesomeIcon icon={faClipboard} className="w-5 h-5" />}
          value={auditLogs.length}
          label="Total Activities"
          iconBg="bg-brand-600/10"
          iconColor="text-brand-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5" />}
          value={auditLogs.filter(a => a.action.toLowerCase().includes('alert')).length}
          label="Alert Activities"
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faFlask} className="w-5 h-5" />}
          value={auditLogs.filter(a => a.action.toLowerCase().includes('scenario')).length}
          label="Scenario Activities"
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
      </div>

      <div className="flex items-center justify-between mb-4">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all cursor-pointer"
        >
          <option value="all">All Actions</option>
          <option value="alert">Alerts</option>
          <option value="scenario">Scenarios</option>
          <option value="report">Reports</option>
          <option value="review">Reviews</option>
          <option value="login">Logins</option>
          <option value="logout">Logouts</option>
        </select>
        <p className="text-xs text-gray-400">
          The audit trail is append-only and cannot be edited or deleted.
        </p>
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : (
        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-subtle border-b border-gray-100">
                <tr>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Faculty</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No audit logs found
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-subtle transition-colors">
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${getTabColor(log.tab)}`}>
                          {log.tab.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getActionColor(log.action)}`}>
                          <FontAwesomeIcon icon={getActionIcon(log.action)} className="w-4 h-4 mr-1" />
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{log.details}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                            {log.faculty_name.charAt(0)}
                          </div>
                          <span className="text-gray-800">{log.faculty_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-sm">{formatTimestamp(log.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}