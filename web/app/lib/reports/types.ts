/** One entry in the Reports page's "Recent" list — see /api/reports/recent. */
export interface RecentReport {
  type: string;
  /** null for a whole-scope report (roster, admin summary, "all faculty"). */
  target_id: string | null;
  subject: string;
  format: 'pdf' | 'csv';
  created_at: string;
}
