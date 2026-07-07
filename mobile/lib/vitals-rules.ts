// Rule-based vital signs anomaly detection (manuscript F3, Objective 2.3).
// Pure TypeScript with no server dependencies so the same thresholds can be
// bundled into the mobile app later for offline flagging (PLAN Phase 5.5).
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

/** Pain is scored, not ranged: 7+ on the 0–10 scale is flagged as severe. */
const SEVERE_PAIN_THRESHOLD = 7;

export interface VitalsEvaluation {
  is_anomaly: boolean;
  reasons: AnomalyReason[];
}

export function evaluateVitals(input: VitalSignsInput): VitalsEvaluation {
  const reasons: AnomalyReason[] = [];

  for (const rule of VITAL_RULES) {
    const value = input[rule.field];
    if (value === null || value === undefined || Number.isNaN(value)) continue;

    if (rule.criticalLow !== undefined && value < rule.criticalLow) {
      reasons.push({
        field: rule.field,
        value,
        severity: 'critical',
        message: `${rule.label} ${value} ${rule.unit} is critically low (below ${rule.criticalLow})`,
      });
    } else if (rule.criticalHigh !== undefined && value > rule.criticalHigh) {
      reasons.push({
        field: rule.field,
        value,
        severity: 'critical',
        message: `${rule.label} ${value} ${rule.unit} is critically high (above ${rule.criticalHigh})`,
      });
    } else if (value < rule.low) {
      reasons.push({
        field: rule.field,
        value,
        severity: 'warning',
        message: `${rule.label} ${value} ${rule.unit} is below the normal range (${rule.low}–${rule.high})`,
      });
    } else if (value > rule.high) {
      reasons.push({
        field: rule.field,
        value,
        severity: 'warning',
        message: `${rule.label} ${value} ${rule.unit} is above the normal range (${rule.low}–${rule.high})`,
      });
    }
  }

  const pain = input.pain_score;
  if (pain !== null && pain !== undefined && !Number.isNaN(pain) && pain >= SEVERE_PAIN_THRESHOLD) {
    reasons.push({
      field: 'pain_score',
      value: pain,
      severity: 'warning',
      message: `Pain score ${pain}/10 indicates severe pain`,
    });
  }

  return { is_anomaly: reasons.length > 0, reasons };
}
