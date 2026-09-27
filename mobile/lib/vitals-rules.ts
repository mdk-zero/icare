// Vital sign reference ranges and the anomaly shape the server reports
// (web/app/lib/vitals/rules.ts evaluates readings). Students no longer chart on
// the ward, so the app only uses these to type the ward's latest vitals and to
// bound what a hospital case's observation forms accept.
// Adult clinical reference ranges; not a diagnostic tool.

export interface VitalSignsInput {
  heart_rate?: number | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  temperature_c?: number | null;
  respiratory_rate?: number | null;
  oxygen_saturation?: number | null;
  pain_score?: number | null;
}

export type AnomalySeverity = 'warning' | 'critical';

export interface AnomalyReason {
  field: keyof VitalSignsInput;
  value: number;
  severity: AnomalySeverity;
  message: string;
  /**
   * The nursing action the reading calls for, authored server-side next to the
   * thresholds (web: app/lib/vitals/rules.ts).
   *
   * Absent from readings this file flags locally: offline evaluation is a
   * provisional preview, and the server re-evaluates on sync and stores the
   * authoritative reasons. Duplicating the advice text here would double the
   * drift surface this file already carries for the thresholds, so the UI
   * simply omits the line until the reading has synced.
   */
  recommendation?: string;
}

export interface VitalRule {
  field: keyof VitalSignsInput;
  label: string;
  unit: string;
  /** Normal range (inclusive). Outside it => warning. */
  low: number;
  high: number;
  /** Beyond these => critical. */
  criticalLow?: number;
  criticalHigh?: number;
  /** Hard input bounds (mirrors the DB check constraints). */
  min: number;
  max: number;
}

export const VITAL_RULES: VitalRule[] = [
  { field: 'heart_rate', label: 'Heart rate', unit: 'bpm', low: 60, high: 100, criticalLow: 40, criticalHigh: 130, min: 0, max: 400 },
  { field: 'bp_systolic', label: 'Systolic BP', unit: 'mmHg', low: 90, high: 140, criticalLow: 80, criticalHigh: 180, min: 0, max: 400 },
  { field: 'bp_diastolic', label: 'Diastolic BP', unit: 'mmHg', low: 60, high: 90, criticalLow: 50, criticalHigh: 120, min: 0, max: 300 },
  { field: 'temperature_c', label: 'Temperature', unit: '°C', low: 36.1, high: 37.5, criticalLow: 35.0, criticalHigh: 39.5, min: 20, max: 46 },
  { field: 'respiratory_rate', label: 'Respiratory rate', unit: '/min', low: 12, high: 20, criticalLow: 8, criticalHigh: 30, min: 0, max: 120 },
  { field: 'oxygen_saturation', label: 'Oxygen saturation', unit: '%', low: 95, high: 100, criticalLow: 90, min: 0, max: 100 },
];
