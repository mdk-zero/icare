/**
 * Behavioural checks for deadline attendance (app/lib/attendance.ts): the
 * status of each RetDem, Quiz and Case Presentation against its deadline,
 * the tally and rate, the profile's row order, excuses, and how a deadline
 * typed into a form becomes a timestamp.
 * There is no test runner in this repo.
 *
 *   npm run check:attendance   (runs under TZ=Asia/Manila)
 *
 * Exits non-zero if any expectation fails.
 */
import {
  attendanceRows,
  attendanceStatus,
  attendedCount,
  byActivity,
  collectActivities,
  isMissingExcusesTable,
  parseExcuse,
  tallyAttendance,
  MAX_EXCUSE_REASON,
  type ActivityFact,
  type ActivitySources,
  type AttendanceRow,
  type ExcuseFact,
} from '../app/lib/attendance';
import { deadlineFromInput, parseDeadline } from '../app/lib/deadline-input';
import { seed } from '../app/lib/demo/fixtures';
import { demoAttendanceRows } from '../app/lib/demo/handlers/derive';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

const D = '2026-10-10T09:00:00.000Z';
const BEFORE = Date.parse('2026-10-09T00:00:00Z');
const AFTER = Date.parse('2026-10-11T00:00:00Z');
const DAY = 86_400_000;

console.log('status');
eq('no deadline', attendanceStatus({ deadline: null, done_at: D, excused: false }, AFTER), 'no_deadline');
eq('done before the deadline', attendanceStatus({ deadline: D, done_at: '2026-10-10T08:00:00Z', excused: false }, AFTER), 'present');
eq('done exactly at the deadline', attendanceStatus({ deadline: D, done_at: D, excused: false }, AFTER), 'present');
eq('done a second late', attendanceStatus({ deadline: D, done_at: '2026-10-10T09:00:01Z', excused: false }, AFTER), 'late');
eq('not done, deadline ahead', attendanceStatus({ deadline: D, done_at: null, excused: false }, BEFORE), 'upcoming');
eq('not done, deadline passed', attendanceStatus({ deadline: D, done_at: null, excused: false }, AFTER), 'absent');
eq('not done, excused', attendanceStatus({ deadline: D, done_at: null, excused: true }, AFTER), 'excused');
eq('done late wins over an excuse', attendanceStatus({ deadline: D, done_at: '2026-10-10T12:00:00Z', excused: true }, AFTER), 'late');
eq('excused but not due yet', attendanceStatus({ deadline: D, done_at: null, excused: true }, BEFORE), 'upcoming');

console.log('tally');
eq(
  'one of each',
  tallyAttendance(['present', 'late', 'absent', 'excused', 'upcoming', 'no_deadline']),
  { present: 1, late: 1, absent: 1, excused: 1, rate: 67 },
);
eq('nothing counted: no rate', tallyAttendance([]).rate, null);
eq('excused and upcoming only: no rate', tallyAttendance(['excused', 'upcoming']).rate, null);
eq('attended = present + late', attendedCount(['present', 'late', 'absent', 'excused']), 2);

console.log('collecting activities');
const sources: ActivitySources = {
  scenarioAssignments: [
    { id: 'sa1', student_id: 's1', scenario_id: 'asthma', title: 'Asthma', deadline: D },
    { id: 'sa2', student_id: 's1', scenario_id: 'cellulitis', title: 'Cellulitis', deadline: D },
  ],
  completions: [
    { assignment_id: 'sa1', completed_at: '2026-10-10T10:00:00.000Z' },
    { assignment_id: 'sa1', completed_at: '2026-10-10T09:00:00.000Z' },
  ],
  quizAssignments: [{ id: 'qa1', student_id: 's1', assessment_id: 'q1', title: 'Vital Signs', deadline: null, default_deadline: D }],
  attempts: [
    { student_id: 's1', assessment_id: 'q1', status: 'in_progress', submitted_at: null },
    { student_id: 's1', assessment_id: 'q1', status: 'expired', submitted_at: '2026-10-08T00:00:00.000Z' },
    { student_id: 's2', assessment_id: 'q1', status: 'submitted', submitted_at: '2026-10-07T00:00:00.000Z' },
    { student_id: 's1', assessment_id: 'q2', status: 'submitted', submitted_at: '2026-10-06T00:00:00.000Z' },
    { student_id: 's1', assessment_id: 'q1', status: 'submitted', submitted_at: '2026-10-10T07:00:00.000Z' },
    { student_id: 's1', assessment_id: 'q1', status: 'submitted', submitted_at: '2026-10-09T07:00:00.000Z' },
  ],
  caseSubmissions: [
    { student_id: 's1', presentation_id: 'cp1', title: 'Hospital Duty', deadline: D, submitted_at: '2026-10-09T12:00:00.000Z' },
  ],
};
const collected = collectActivities(sources);
const find = (kind: string, id: string) => collected.find((a) => a.kind === kind && a.activity_id === id);
eq('RetDem done at its first graded task', find('scenario', 'sa1')?.done_at, '2026-10-10T09:00:00.000Z');
eq('RetDem with no graded task is not done', find('scenario', 'sa2')?.done_at, null);
eq('quiz takes the quiz default deadline', find('assessment', 'qa1')?.deadline, D);
eq('quiz done at its earliest submitted attempt', find('assessment', 'qa1')?.done_at, '2026-10-09T07:00:00.000Z');
eq('case presentation is keyed by presentation', find('case_presentation', 'cp1')?.student_id, 's1');
eq('case presentation done when handed in', find('case_presentation', 'cp1')?.done_at, '2026-10-09T12:00:00.000Z');
eq('one activity per assignment or submission', collected.length, 4);
eq('a RetDem knows its patient case', find('scenario', 'sa1')?.source_id, 'asthma');
eq('a quiz knows its quiz', find('assessment', 'qa1')?.source_id, 'q1');
eq('a case presentation is its own source', find('case_presentation', 'cp1')?.source_id, 'cp1');

console.log('rows');
const NOW = Date.parse('2026-10-10T00:00:00Z');
const at = (days: number) => new Date(NOW + days * DAY).toISOString();
const act = (id: string, deadline: string | null, done_at: string | null, student_id = 's1'): ActivityFact => ({
  student_id,
  kind: 'scenario',
  activity_id: id,
  source_id: id,
  title: id,
  deadline,
  done_at,
});
const excuse = (id: string, student_id = 's1'): ExcuseFact => ({
  student_id,
  kind: 'scenario',
  activity_id: id,
  reason: 'Medical certificate',
  excused_by_name: 'Michael Smith',
  created_at: at(0),
});
const activities = [
  act('later', at(2), null),
  act('present', at(-3), at(-4)),
  act('none', null, null),
  act('absent', at(-1), null),
  act('sooner', at(1), null),
];
eq(
  'upcoming soonest first, then past newest first, then no deadline',
  attendanceRows(activities, [], NOW).map((r) => r.activity_id),
  ['sooner', 'later', 'absent', 'present', 'none'],
);
const withExcuses = attendanceRows(activities, [excuse('absent'), excuse('present'), excuse('gone')], NOW);
const row = (id: string) => withExcuses.find((r) => r.activity_id === id);
eq('an excused absence', row('absent')?.status, 'excused');
eq('the excuse rides on the row', row('absent')?.excuse?.reason, 'Medical certificate');
eq('an excuse on a present row is not shown', row('present')?.excuse, null);
eq('an excuse with no activity adds no row', withExcuses.length, 5);
eq(
  "another student's excuse doesn't apply",
  attendanceRows([act('absent', at(-1), null, 's2')], [excuse('absent', 's1')], NOW)[0].status,
  'absent',
);

console.log('by activity, for the section report');
const sectionRow = (student_id: string, kind: AttendanceRow['kind'], source_id: string, deadline: string | null, status: AttendanceRow['status']): AttendanceRow => ({
  student_id,
  kind,
  activity_id: `${source_id}-${student_id}`,
  source_id,
  title: source_id,
  deadline,
  done_at: null,
  status,
  excuse: null,
});
const D1 = '2026-10-01T09:00:00.000Z';
const D2 = '2026-10-05T09:00:00.000Z';
const grouped = byActivity([
  sectionRow('s1', 'scenario', 'asthma', D1, 'present'),
  sectionRow('s2', 'scenario', 'asthma', D1, 'present'),
  sectionRow('s3', 'scenario', 'asthma', D1, 'absent'),
  sectionRow('s1', 'assessment', 'vitals', D2, 'late'),
  sectionRow('s2', 'assessment', 'vitals', D2, 'excused'),
  sectionRow('s3', 'assessment', 'vitals', D2, 'excused'),
  sectionRow('s1', 'scenario', 'fever', null, 'no_deadline'),
]);
eq('each activity once, newest deadline first', grouped.map((g) => g.source_id), ['vitals', 'asthma']);
eq('the quiz tally', grouped[0]?.tally, { present: 0, late: 1, absent: 0, excused: 2, rate: 100 });
eq('the RetDem tally', grouped[1]?.tally, { present: 2, late: 0, absent: 1, excused: 0, rate: 67 });
eq('the same case with another deadline is another row', byActivity([
  sectionRow('s1', 'scenario', 'asthma', D1, 'present'),
  sectionRow('s2', 'scenario', 'asthma', D2, 'present'),
]).length, 2);

console.log('excuse requests');
const ok = parseExcuse({ kind: 'scenario', activity_id: 'a', reason: '  Sick  ' });
eq('a valid excuse, trimmed', ok.ok ? ok.value : ok.error, { kind: 'scenario', activity_id: 'a', reason: 'Sick' });
for (const [label, body] of [
  ['no reason', { kind: 'scenario', activity_id: 'a' }],
  ['a blank reason', { kind: 'scenario', activity_id: 'a', reason: '   ' }],
] as const) {
  const r = parseExcuse(body);
  check(`${label} is refused`, !r.ok && /reason/i.test(r.error), r.ok ? 'accepted' : r.error);
}
check('a reason over the limit is refused', !parseExcuse({ kind: 'scenario', activity_id: 'a', reason: 'x'.repeat(MAX_EXCUSE_REASON + 1) }).ok);
check('a shift is not an activity', !parseExcuse({ kind: 'shift', activity_id: 'a', reason: 'Sick' }).ok);
check('an activity is required', !parseExcuse({ kind: 'scenario', reason: 'Sick' }).ok);
check('missing table (42P01)', isMissingExcusesTable({ code: '42P01' }));
check('missing table (PGRST205)', isMissingExcusesTable({ code: 'PGRST205' }));
check('a duplicate is not a missing table', !isMissingExcusesTable({ code: '23505' }));
check('no error is not a missing table', !isMissingExcusesTable(null));

console.log('deadlines typed into forms (Asia/Manila)');
eq('a date means the end of that day', deadlineFromInput('2026-10-10'), '2026-10-10T15:59:00.000Z');
eq('a date and time is local time', deadlineFromInput('2026-10-10T17:00'), '2026-10-10T09:00:00.000Z');
eq('empty', deadlineFromInput(''), null);
eq('unreadable', deadlineFromInput('nope'), null);

console.log('deadlines sent to the API');
const deadlineError = (r: ReturnType<typeof parseDeadline>) => (r.ok ? null : r.error);
eq('no deadline is refused', deadlineError(parseDeadline(undefined)), 'Set a deadline');
eq('a blank deadline is refused', deadlineError(parseDeadline('  ')), 'Set a deadline');
eq('optional: none is fine', parseDeadline('', { optional: true }), { ok: true, value: null });
eq('an unreadable deadline', deadlineError(parseDeadline('soon')), 'Invalid deadline');
eq('a timestamp', parseDeadline('2026-10-10T09:00:00.000Z'), { ok: true, value: '2026-10-10T09:00:00.000Z' });

console.log('the demo has every kind of attendance');
const demo = seed();
check('the demo seeds an excused absence', (demo.excuses?.length ?? 0) >= 1, `${demo.excuses?.length ?? 0} excuses`);
const demoStatuses = new Set(demoAttendanceRows(demo, demo.users.filter((u) => u.role === 'student').map((u) => u.id)).map((r) => r.status));
for (const status of ['present', 'late', 'absent', 'excused', 'upcoming'] as const) {
  check(`the demo has a ${status} activity`, demoStatuses.has(status), [...demoStatuses].join(', '));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
