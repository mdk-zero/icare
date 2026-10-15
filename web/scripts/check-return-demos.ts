/**
 * Behavioural checks for Return Demonstrations: the scenario kind helpers
 * that keep them out of Patient Case screens (and keep Patient Cases
 * working before migration 072), the rules for making, assigning and
 * editing one, and where they land in courses and the demo.
 * There is no test runner in this repo.
 *
 *   npm run check:return-demos
 *
 * Exits non-zero if any expectation fails.
 */
import {
  kindOf,
  isReturnDemo,
  kindParam,
  ofKind,
  scenarioKinds,
  scenarioKindsReady,
  type ScenarioKind,
} from '../app/lib/scenario-kind';
import { assignableStudents, mergeAssignees, parseReturnDemoInput, skillDiff } from '../app/lib/return-demos';
import { existsSync, readFileSync } from 'node:fs';
import { autoSplit } from '../app/lib/course-grading';
import { requirementNames, skillCoverage } from '../app/lib/course-progress';
import { loadActivityItems } from '../app/lib/courses';
import { join } from 'node:path';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

/** A Supabase client whose every query chain resolves to `result`. */
function stubClient(result: unknown): never {
  const proxy: unknown = new Proxy(() => undefined, {
    get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => void) => resolve(result) : proxy),
    apply: () => proxy,
  });
  return proxy as never;
}

/** A Supabase client whose query chain resolves to the result given for the table it reads. */
function tableStub(byTable: Record<string, unknown>): never {
  const chain = (result: unknown): unknown => {
    const proxy: unknown = new Proxy(() => undefined, {
      get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => void) => resolve(result) : proxy),
      apply: () => proxy,
    });
    return proxy;
  };
  // A table given a list answers its reads in turn (the last one repeats).
  const calls = new Map<string, number>();
  const next = (table: string) => {
    const given = byTable[table] ?? { data: [], error: null };
    if (!Array.isArray(given)) return given;
    const n = calls.get(table) ?? 0;
    calls.set(table, n + 1);
    return given[Math.min(n, given.length - 1)];
  };
  return { from: (table: string) => chain(next(table)) } as never;
}

async function main() {
  console.log('scenario-kind');
  eq('no kind param means Patient Cases', kindParam(null), 'patient_case');
  eq('return_demo param', kindParam('return_demo'), 'return_demo');
  eq('all param', kindParam('all'), 'all');
  eq('an unknown param falls back to Patient Cases', kindParam('quiz'), 'patient_case');
  const kinds = new Map<string, ScenarioKind>([['s1', 'patient_case'], ['s2', 'return_demo']]);
  const rows = [{ id: 'a1', scenario_id: 's1' }, { id: 'a2', scenario_id: 's2' }, { id: 'a3', scenario_id: 's9' }];
  eq('an unknown scenario reads as a Patient Case', kindOf(kinds, 's9'), 'patient_case');
  eq('Patient Cases keep unknown ids', ofKind(rows, kinds, 'patient_case', (r) => r.scenario_id).map((r) => r.id), ['a1', 'a3']);
  eq('Return Demos only', ofKind(rows, kinds, 'return_demo', (r) => r.scenario_id).map((r) => r.id), ['a2']);
  eq('all keeps every row', ofKind(rows, kinds, 'all', (r) => r.scenario_id).length, 3);
  const before072 = stubClient({ data: null, error: { code: '42703', message: 'column scenarios.kind does not exist' } });
  eq('before 072 every scenario is a Patient Case', [...(await scenarioKinds(before072, ['s1', 's2'])).values()], ['patient_case', 'patient_case']);
  check('scenarioKindsReady is false before 072', !(await scenarioKindsReady(before072)));
  const after072 = stubClient({ data: [{ id: 's1', kind: 'patient_case' }, { id: 's2', kind: 'return_demo' }], error: null });
  eq('after 072 kinds are read', Object.fromEntries(await scenarioKinds(after072, ['s1', 's2'])), { s1: 'patient_case', s2: 'return_demo' });
  check('scenarioKindsReady is true after 072', await scenarioKindsReady(after072));
  let threw = false;
  try {
    await scenarioKinds(stubClient({ data: null, error: { code: '57014', message: 'timeout' } }), ['s1']);
  } catch {
    threw = true;
  }
  check('any other read error is thrown, not read as Patient Cases', threw);

  check('isReturnDemo reads the kind', await isReturnDemo(after072, 's2'));
  check('…a Patient Case is not one', !(await isReturnDemo(after072, 's1')));
  check('…and before 072 nothing is', !(await isReturnDemo(before072, 's2')));

  console.log('\nreaders');
  const allPatientCases = new Map(rows.map((r) => [r.scenario_id, 'patient_case' as const]));
  eq('a kind map from before 072 keeps every assignment as a Patient Case', ofKind(rows, allPatientCases, 'patient_case', (r) => r.scenario_id).length, 3);
  eq('…and shows no Return Demonstrations', ofKind(rows, allPatientCases, 'return_demo', (r) => r.scenario_id).length, 0);

  console.log('\nreturn-demo rules');
  eq('title is required', parseReturnDemoInput({ skills: ['1-1'] }), { ok: false, error: 'Title is required' });
  eq('a skill is required', parseReturnDemoInput({ title: 'VS', skills: [] }), { ok: false, error: 'Pick at least one skill' });
  eq('skills are required on create', parseReturnDemoInput({ title: 'VS' }), { ok: false, error: 'Pick at least one skill' });
  eq('long titles refused', parseReturnDemoInput({ title: 'x'.repeat(201), skills: ['1-1'] }), { ok: false, error: 'Keep the title under 200 characters' });
  const ok = parseReturnDemoInput({ title: '  Vital Signs ', skills: ['1-1', { id: '1-1' }, '1-4'], offering_id: 'o1' });
  eq('title trimmed, skills de-duplicated in order', ok.ok && [ok.value.title, ok.value.skills!.map((s) => s.skillId)], ['Vital Signs', ['1-1', '1-4']]);
  eq('a created one has a description and course', ok.ok && [ok.value.description, ok.value.offering_id], ['', 'o1']);
  eq('a partial edit carries only what it names', parseReturnDemoInput({ description: 'x' }, { partial: true }), { ok: true, value: { description: 'x' } });
  eq('a partial edit cannot empty the skills', parseReturnDemoInput({ skills: [] }, { partial: true }), { ok: false, error: 'Pick at least one skill' });
  eq('a partial edit cannot blank the title', parseReturnDemoInput({ title: '  ' }, { partial: true }), { ok: false, error: 'Title is required' });

  const merged = mergeAssignees({
    teamMembers: new Map([['t1', ['s1', 's2']]]),
    studentIds: ['s2', 's3', 's4'],
    teamOf: new Map([['s3', 't2']]),
    already: new Set(['s1']),
  });
  eq('group members tagged with the group, picks with their own group, nobody twice', merged.rows, [
    { student_id: 's2', team_id: 't1' },
    { student_id: 's3', team_id: 't2' },
    { student_id: 's4', team_id: null },
  ]);
  eq('students who already have it are skipped once', merged.skipped, 1);

  const diff = skillDiff(
    [
      { id: 'k1', skill_id: '1-1', title: 'Assessing Body Temperature (Skill 1-1)' },
      { id: 'k2', skill_id: '1-4', title: 'Pulse (Skill 1-4)' },
      { id: 'k3', skill_id: '1-6', title: 'Respiration (Skill 1-6)' },
    ],
    [{ skillId: '1-4' }, { skillId: '1-7' }],
    new Set(['k3']),
  );
  eq('adds new skills, removes ungraded dropped ones, blocks graded ones', diff, {
    add: [{ skillId: '1-7' }],
    remove: ['k1'],
    blocked: ['Respiration (Skill 1-6)'],
  });

  const overview = {
    viewer_id: 'f1',
    teams: [{ id: 't1', faculty_id: 'f1' }, { id: 't9', faculty_id: 'f2' }],
    students: [{ id: 's1', team_id: 't1' }, { id: 's2', team_id: null }, { id: 's3', team_id: 't9' }],
  } as never;
  const assignable = assignableStudents(overview);
  eq('only own groups and their members are assignable', [assignable.teams.map((t) => t.id), assignable.students.map((s) => s.id)], [['t1'], ['s1']]);

  console.log('\ncourses');
  eq(
    'Return Demonstrations are their own automatic part, last',
    autoSplit([
      { id: 'c1', activity_type: 'scenario' },
      { id: 'r1', activity_type: 'return_demo' },
      { id: 'q1', activity_type: 'assessment' },
    ]).parts.map((p) => [p.name, p.items]),
    [['Patient Cases', ['c1']], ['Quizzes', ['q1']], ['Case Presentations', []], ['Return Demonstrations', ['r1']]],
  );
  eq(
    'items are named Return Demonstration #N',
    requirementNames([{ kind: 'activity', activity_type: 'return_demo' }, { kind: 'activity', activity_type: 'return_demo' }]),
    ['Return Demonstration #1', 'Return Demonstration #2'],
  );
  eq('old skill items are Skills now', requirementNames([{ kind: 'skill', activity_type: null }]), ['Skill #1']);
  const cov = skillCoverage([
    { id: 'r1', kind: 'activity', activity_type: 'return_demo', skill_id: null, skill_ids: ['1-1', '1-4'] },
    { id: 'k1', kind: 'skill', activity_type: null, skill_id: '1-4' },
  ]);
  eq('a Return Demonstration covers each of its skills', cov.get('1-1'), [{ id: 'r1', name: 'Return Demonstration #1' }]);
  eq('coverage merges both kinds of item', cov.get('1-4')?.map((c) => c.id), ['r1', 'k1']);
  const items = await loadActivityItems(
    tableStub({
      scenarios: {
        data: [
          { id: 'c1', offering_id: 'o1', created_at: '2026-10-01', kind: 'patient_case' },
          { id: 'r1', offering_id: 'o1', created_at: '2026-10-02', kind: 'return_demo' },
        ],
        error: null,
      },
      assessments: { data: [], error: null },
      case_presentations: { data: [], error: null },
    }),
    ['o1'],
  );
  const before072Items = await loadActivityItems(
    tableStub({
      scenarios: [
        { data: null, error: { code: '42703', message: 'column scenarios.kind does not exist' } },
        { data: [{ id: 'c1', offering_id: 'o1', created_at: '2026-10-01' }], error: null },
      ],
      assessments: { data: [], error: null },
      case_presentations: { data: [], error: null },
    }),
    ['o1'],
  );
  eq('before 072 every scenario is a Patient Case item', before072Items?.map((i) => [i.id, i.activity_type]), [['c1', 'scenario']]);
  eq('loadActivityItems files by kind', items?.map((i) => [i.id, i.activity_type, i.scenario_id]), [['c1', 'scenario', 'c1'], ['r1', 'return_demo', 'r1']]);

  console.log('\nroutes');
  const methods = (file: string) => {
    const path = join(__dirname, '../app/api/faculty/return-demos', file);
    if (!existsSync(path)) return 'missing';
    return [...readFileSync(path, 'utf8').matchAll(/export async function (GET|POST|PATCH|DELETE)\b/g)].map((m) => m[1]);
  };
  eq('list and create', methods('route.ts'), ['GET', 'POST']);
  eq('read, edit and delete one', methods('[id]/route.ts'), ['GET', 'PATCH', 'DELETE']);
  eq('assign one', methods('[id]/assign/route.ts'), ['POST']);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

void main();
