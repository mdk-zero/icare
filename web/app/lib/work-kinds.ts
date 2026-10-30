/**
 * The kinds of graded work a student hands in, as the analytics warehouse
 * files them (dw.fact_student_work, migration 085). Pure, so the dashboards,
 * the API routes and the demo all name them the same way.
 */
export type WorkKind = 'patient_case' | 'quiz' | 'case_presentation' | 'return_demo';

/** In the order the course's automatic grading split lists them (AUTO_PARTS). */
export const WORK_KINDS: readonly { kind: WorkKind; label: string; noun: string }[] = [
  { kind: 'patient_case', label: 'Patient Cases', noun: 'patient case' },
  { kind: 'quiz', label: 'Quizzes', noun: 'quiz' },
  { kind: 'case_presentation', label: 'Case Presentations', noun: 'case presentation' },
  { kind: 'return_demo', label: 'Return Demonstrations', noun: 'return demonstration' },
];

export const WORK_KIND_LABEL: Record<WorkKind, string> = Object.fromEntries(
  WORK_KINDS.map((k) => [k.kind, k.label]),
) as Record<WorkKind, string>;

/** "Patient Cases 90% · Quizzes 80%": a student's average per kind, in the usual order. */
export function describeByKind(byKind: Partial<Record<WorkKind, number>> | undefined): string {
  if (!byKind) return '';
  return WORK_KINDS.filter((k) => byKind[k.kind] != null)
    .map((k) => `${k.label} ${Math.round(byKind[k.kind]!)}%`)
    .join(' · ');
}
