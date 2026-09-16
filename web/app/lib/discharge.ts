import type { getSupabaseAdmin } from './supabase/server';
import { summarizeAnomalyReasons } from './vitals/rules';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Builds and stores a patient's discharge summary.
 *
 * The digest is materialised at check-out rather than recomputed on read: the
 * readings, sheets and notes behind it can be edited or deleted later, and a
 * discharge summary has to keep saying what was true at discharge.
 *
 * Nothing here calls an AI. Follow-up recommendations are drafted afterwards
 * (see /api/faculty/patients/discharge-summary), so a slow or failed model call
 * can never block or fail a check-out.
 */

export interface VitalStat {
  min: number;
  max: number;
  avg: number;
  /** Reading count this stat was computed from. */
  n: number;
}

export interface VitalsDigest {
  readings: number;
  flagged: number;
  critical: number;
  /** Per-vital extremes over the stay; absent when never charted. */
  stats: Record<string, VitalStat>;
  /** Distinct findings raised during the stay, most severe first. */
  findings: { message: string; severity: string; recommendation?: string }[];
}

export interface EhrDigest {
  tpr: number;
  ivf: number;
  notes: number;
  notes_reviewed: number;
  /** IVF lines still running at discharge — worth flagging on the summary. */
  ivf_ongoing: number;
}

const TRENDED: { key: string; column: string }[] = [
  { key: 'heart_rate', column: 'heart_rate' },
  { key: 'bp_systolic', column: 'bp_systolic' },
  { key: 'bp_diastolic', column: 'bp_diastolic' },
  { key: 'temperature_c', column: 'temperature_c' },
  { key: 'respiratory_rate', column: 'respiratory_rate' },
  { key: 'oxygen_saturation', column: 'oxygen_saturation' },
];

function round(value: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/**
 * Digest of one stay. `since` bounds it to the current admission so a
 * re-admitted patient's summary does not fold in their previous stay.
 */
export async function buildStayDigest(
  supabase: Supabase,
  patientId: string,
  since: string | null,
): Promise<{ vitals: VitalsDigest; ehr: EhrDigest }> {
  const inStay = <T extends { gte: (col: string, v: string) => T }>(query: T): T =>
    since ? query.gte('created_at', since) : query;

  const [vitalsRes, tprRes, ivfRes, notesRes] = await Promise.all([
    (() => {
      let q = supabase
        .from('vital_sign_readings')
        .select('heart_rate, bp_systolic, bp_diastolic, temperature_c, respiratory_rate, oxygen_saturation, is_anomaly, anomaly_reasons')
        .eq('patient_id', patientId);
      if (since) q = q.gte('recorded_at', since);
      return q;
    })(),
    inStay(supabase.from('tpr_records').select('id', { count: 'exact', head: true }).eq('patient_id', patientId)),
    (() => {
      let q = supabase.from('ivf_records').select('status').eq('patient_id', patientId);
      if (since) q = q.gte('created_at', since);
      return q;
    })(),
    (() => {
      let q = supabase.from('progress_notes').select('reviewed_at').eq('patient_id', patientId);
      if (since) q = q.gte('created_at', since);
      return q;
    })(),
  ]);

  const readings = (vitalsRes.data ?? []) as Record<string, unknown>[];

  const stats: Record<string, VitalStat> = {};
  for (const { key, column } of TRENDED) {
    const values = readings
      .map((r) => r[column])
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    if (values.length === 0) continue;
    stats[key] = {
      min: round(Math.min(...values)),
      max: round(Math.max(...values)),
      avg: round(values.reduce((sum, v) => sum + v, 0) / values.length),
      n: values.length,
    };
  }

  // One entry per distinct finding: an unstable patient charted hourly would
  // otherwise repeat the same message dozens of times on their summary.
  const byMessage = new Map<string, { message: string; severity: string; recommendation?: string }>();
  let flagged = 0;
  let critical = 0;
  for (const reading of readings) {
    if (!reading.is_anomaly) continue;
    flagged++;
    const parsed = summarizeAnomalyReasons(reading.anomaly_reasons);
    if (parsed.critical) critical++;
    for (const reason of parsed.all) {
      if (!byMessage.has(reason.message)) {
        byMessage.set(reason.message, {
          message: reason.message,
          severity: reason.severity,
          recommendation: reason.recommendation,
        });
      }
    }
  }
  const findings = [...byMessage.values()].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1,
  );

  const ivfRows = (ivfRes.data ?? []) as { status?: string | null }[];
  const noteRows = (notesRes.data ?? []) as { reviewed_at?: string | null }[];

  return {
    vitals: { readings: readings.length, flagged, critical, stats, findings },
    ehr: {
      tpr: tprRes.count ?? 0,
      ivf: ivfRows.length,
      ivf_ongoing: ivfRows.filter((r) => r.status === 'ongoing').length,
      notes: noteRows.length,
      notes_reviewed: noteRows.filter((r) => !!r.reviewed_at).length,
    },
  };
}
