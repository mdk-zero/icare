/**
 * What a per-student or per-group report is about. The Reports page opens an
 * activity as a folder (a Return Demonstration, a Patient Case, a quiz) and
 * pulls the report of one student or one group in it, so the target id carries
 * both: "<activity>:student:<student>" or "<activity>:group:<team>".
 */
export type ReportTarget =
  | { kind: 'student'; parentId: string; studentId: string }
  | { kind: 'group'; parentId: string; teamId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID.test(value);

export function targetId(target: ReportTarget): string {
  return target.kind === 'student'
    ? `${target.parentId}:student:${target.studentId}`
    : `${target.parentId}:group:${target.teamId}`;
}

export function parseTarget(id: string): ReportTarget | null {
  const [parentId, kind, subject, ...rest] = id.split(':');
  if (rest.length > 0 || !UUID.test(parentId ?? '') || !UUID.test(subject ?? '')) return null;
  if (kind === 'student') return { kind, parentId, studentId: subject };
  if (kind === 'group') return { kind, parentId, teamId: subject };
  return null;
}
