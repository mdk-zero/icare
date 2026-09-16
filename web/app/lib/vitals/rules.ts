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
  /**
   * The nursing action this reading calls for. Optional because readings
   * charted before recommendations existed carry reasons without one — every
   * consumer must tolerate its absence rather than render "undefined".
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
  /**
   * What the student should do about a reading under `low` / over `high`.
   * Standard bedside assessment steps written as study prompts for the
   * simulator — they teach the response to an abnormal value, and are not
   * clinical orders. A critical reading prefixes the escalation sentence.
   */
  adviceLow: string;
  adviceHigh: string;
}

export const VITAL_RULES: VitalRule[] = [
  {
    field: 'heart_rate', label: 'Heart rate', unit: 'bpm',
    low: 60, high: 100, criticalLow: 40, criticalHigh: 130, min: 0, max: 400,
    adviceLow:
      'Recount the pulse manually for a full minute, check whether the patient feels dizzy, faint or short of breath, and review any rate-slowing medication that is due.',
    adviceHigh:
      'Recount the pulse manually for a full minute, then look for a cause you can treat — pain, fever, anxiety, dehydration, blood loss or recent exertion.',
  },
  {
    field: 'bp_systolic', label: 'Systolic BP', unit: 'mmHg',
    low: 90, high: 140, criticalLow: 80, criticalHigh: 180, min: 0, max: 400,
    adviceLow:
      'Repeat the reading on the other arm, then assess perfusion — skin colour and warmth, capillary refill, urine output and level of consciousness. Lay the patient flat if they feel faint.',
    adviceHigh:
      'Let the patient rest five minutes and repeat, checking the cuff is the right size and at heart level. Ask about headache, chest pain or visual changes, and review antihypertensive doses.',
  },
  {
    field: 'bp_diastolic', label: 'Diastolic BP', unit: 'mmHg',
    low: 60, high: 90, criticalLow: 50, criticalHigh: 120, min: 0, max: 300,
    adviceLow:
      'Repeat with the correct cuff size and confirm against the systolic reading; assess perfusion and whether the patient is symptomatic.',
    adviceHigh:
      'Repeat after five minutes of rest and confirm cuff size and placement, then ask about headache or visual changes and review antihypertensive doses.',
  },
  {
    field: 'temperature_c', label: 'Temperature', unit: '°C',
    low: 36.1, high: 37.5, criticalLow: 35.0, criticalHigh: 39.5, min: 20, max: 46,
    adviceLow:
      'Confirm with a second route, then warm the patient — dry blankets, remove damp linen, raise the room temperature — and recheck at short intervals.',
    adviceHigh:
      'Confirm with a second route and look for a source of infection. Keep the patient hydrated, remove excess covers, and check whether an antipyretic is ordered and due.',
  },
  {
    field: 'respiratory_rate', label: 'Respiratory rate', unit: '/min',
    low: 12, high: 20, criticalLow: 8, criticalHigh: 30, min: 0, max: 120,
    adviceLow:
      'Count respirations for a full minute and check level of consciousness and oxygen saturation. Consider opioid or sedative effect, and rouse the patient if drowsy.',
    adviceHigh:
      'Count for a full minute and assess effort — accessory muscles, speaking in short sentences, breath sounds. Sit the patient upright and check oxygen saturation.',
  },
  {
    field: 'oxygen_saturation', label: 'Oxygen saturation', unit: '%',
    low: 95, high: 100, criticalLow: 90, min: 0, max: 100,
    adviceLow:
      'Check the probe site, warmth and trace quality before acting on the number. Sit the patient upright, encourage deep breathing, and give oxygen if it is ordered.',
    // Above 100% is not physiologically possible; the input bound rejects it,
    // so this exists only to satisfy the shape.
    adviceHigh: 'Recheck the probe — a saturation above 100% indicates a measurement error.',
  },
];

/** Pain is scored, not ranged: 7+ on the 0–10 scale is flagged as severe. */
const SEVERE_PAIN_THRESHOLD = 7;

export interface VitalsEvaluation {
  is_anomaly: boolean;
  reasons: AnomalyReason[];
}

/**
 * A critical reading is not a "monitor and reassess" situation, so its advice
 * leads with the escalation and keeps the assessment steps after it.
 */
const ESCALATE = 'Escalate to the supervising nurse or physician now.';

function advise(text: string, severity: AnomalySeverity): string {
  return severity === 'critical' ? `${ESCALATE} ${text}` : text;
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
        recommendation: advise(rule.adviceLow, 'critical'),
      });
    } else if (rule.criticalHigh !== undefined && value > rule.criticalHigh) {
      reasons.push({
        field: rule.field,
        value,
        severity: 'critical',
        message: `${rule.label} ${value} ${rule.unit} is critically high (above ${rule.criticalHigh})`,
        recommendation: advise(rule.adviceHigh, 'critical'),
      });
    } else if (value < rule.low) {
      reasons.push({
        field: rule.field,
        value,
        severity: 'warning',
        message: `${rule.label} ${value} ${rule.unit} is below the normal range (${rule.low}–${rule.high})`,
        recommendation: advise(rule.adviceLow, 'warning'),
      });
    } else if (value > rule.high) {
      reasons.push({
        field: rule.field,
        value,
        severity: 'warning',
        message: `${rule.label} ${value} ${rule.unit} is above the normal range (${rule.low}–${rule.high})`,
        recommendation: advise(rule.adviceHigh, 'warning'),
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
      recommendation:
        'Reassess with the same scale and ask where the pain is and what it feels like. Check when analgesia was last given and whether the next dose is due, offer comfort measures such as repositioning, and reassess afterwards.',
    });
  }

  return { is_anomaly: reasons.length > 0, reasons };
}

/**
 * Reads `vital_sign_readings.anomaly_reasons` back out of JSONB.
 *
 * The column is written by `evaluateVitals` but read as untyped JSON, and rows
 * predate the `recommendation` field, so every access is defensive: a bad or
 * legacy row degrades to fewer details rather than throwing or rendering
 * "[object Object]" (which is exactly what `String(reason)` used to produce).
 */
export function summarizeAnomalyReasons(raw: unknown): {
  /** One sentence naming what was out of range. Empty when nothing parsed. */
  text: string;
  /** True when any reason is critical — drives escalation and alert severity. */
  critical: boolean;
  /** The reason to lead with: the first critical one, else the first. */
  top: AnomalyReason | null;
  /** Every parsed reason, in stored order. */
  all: AnomalyReason[];
} {
  const rows = Array.isArray(raw) ? raw : [];
  const all: AnomalyReason[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.message !== 'string' || !r.message) continue;
    all.push({
      field: r.field as AnomalyReason['field'],
      value: typeof r.value === 'number' ? r.value : NaN,
      severity: r.severity === 'critical' ? 'critical' : 'warning',
      message: r.message,
      recommendation: typeof r.recommendation === 'string' ? r.recommendation : undefined,
    });
  }

  const critical = all.some((r) => r.severity === 'critical');
  const top = all.find((r) => r.severity === 'critical') ?? all[0] ?? null;
  const text = all.length > 0 ? `Out-of-range vitals recorded: ${all.map((r) => r.message).join('; ')}.` : '';

  return { text, critical, top, all };
}
