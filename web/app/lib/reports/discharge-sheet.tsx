/**
 * The body of a Discharge Summary, shared by the real builder and the demo's
 * so both lay out the same page. A stored summary is a point-in-time record,
 * so everything here comes from what was saved at discharge. Free of
 * server-only code.
 */
import { Text } from '@react-pdf/renderer';
import { TONE } from './bands';
import { Note, Section, StatGrid, Table, countTile, styles, type Cell, type MetaRow } from './kit-ui';
import { dateLabel } from './view';

export interface DischargeFinding {
  message: string;
  severity: string;
  recommendation?: string;
}

export interface DischargeDigest {
  readings?: number;
  flagged?: number;
  critical?: number;
  stats?: Record<string, { min: number; max: number; avg: number; n: number }>;
  findings?: DischargeFinding[];
}

export interface FollowUp {
  title?: string;
  detail?: string;
}

const VITAL_LABELS: Record<string, string> = {
  heart_rate: 'Heart rate (bpm)',
  bp_systolic: 'Systolic BP (mmHg)',
  bp_diastolic: 'Diastolic BP (mmHg)',
  temperature_c: 'Temperature (°C)',
  respiratory_rate: 'Respiratory rate (/min)',
  oxygen_saturation: 'Oxygen saturation (%)',
};

/** Whole days between admission and discharge; null when either date is missing. */
export function stayDays(admittedAt: string | null, dischargedAt: string | null): number | null {
  if (!admittedAt || !dischargedAt) return null;
  return Math.max(0, Math.floor((new Date(dischargedAt).getTime() - new Date(admittedAt).getTime()) / 86_400_000));
}

/** The meta block of a Discharge Summary. */
export function dischargeMeta(s: { diagnosis: string | null; room: string | null; admittedAt: string | null; dischargedAt: string | null }): MetaRow[] {
  return [
    { label: 'Diagnosis', value: s.diagnosis || '—' },
    { label: 'Room', value: s.room || '—' },
    { label: 'Admitted', value: dateLabel(s.admittedAt) },
    { label: 'Discharged', value: dateLabel(s.dischargedAt) },
  ];
}

export function DischargeReportBody({
  days,
  vitals,
  followUp,
  aiDraftedAt,
}: {
  days: number | null;
  vitals: DischargeDigest;
  followUp: FollowUp[];
  /** When the follow-up was AI-drafted (an ISO date); null if it was not. */
  aiDraftedAt: string | null;
}) {
  const flagged = vitals.flagged ?? 0;
  const critical = vitals.critical ?? 0;
  // Older stored summaries have no critical count, so the tile is left out rather than reading 0.
  const tiles = [
    countTile('Length of stay', days === null ? '—' : days, days === null ? undefined : days === 1 ? 'day' : 'days'),
    countTile('Vitals readings', vitals.readings ?? 0),
    countTile('Flagged', flagged, undefined, { color: flagged > 0 ? TONE.practice : undefined }),
    ...(vitals.critical === undefined ? [] : [countTile('Critical', critical, undefined, { color: critical > 0 ? TONE.low : undefined })]),
  ];
  const findings = [...(vitals.findings ?? [])].sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'));
  const vitalRows = Object.entries(vitals.stats ?? {}).map(([key, stat]): Cell[] => [VITAL_LABELS[key] ?? key, stat.min, stat.avg.toFixed(1), stat.max, stat.n]);

  return (
    <>
      <StatGrid items={tiles} />

      <Section title="Abnormal findings" caption={findings.length > 1 ? "Critical findings first." : undefined} />
      <Table
        head={['Severity', 'Finding', 'Recommended action']}
        widths={[1, 3, 3]}
        rows={findings.map((f): Cell[] => [
          f.severity === 'critical' ? { tag: 'Critical', tone: 'low' } : { tag: 'Abnormal', tone: 'practice' },
          f.message,
          f.recommendation || '—',
        ])}
        emptyText="No readings fell outside their reference range."
      />

      <Section title="Vital signs over the stay" />
      <Table head={['Vital', 'Min', 'Avg', 'Max', 'Readings']} widths={[3, 1, 1, 1, 1]} rows={vitalRows} emptyText="No vital signs were charted during this stay." />

      <Section title="Follow-up recommendations" />
      {followUp.length === 0 ? (
        <Text style={styles.empty}>No follow-up recommendations have been drafted for this discharge.</Text>
      ) : (
        <Table head={['Action', 'Detail']} widths={[2, 4]} rows={followUp.map((f, i): Cell[] => [`${i + 1}. ${f.title ?? ''}`, f.detail ?? ''])} />
      )}
      {followUp.length > 0 && aiDraftedAt && (
        <Note>
          Follow-up recommendations were AI-drafted on {dateLabel(aiDraftedAt)} from the recorded data above, and are intended for review by the
          supervising instructor.
        </Note>
      )}
      <Note>Simulated patient record for teaching.</Note>
    </>
  );
}
