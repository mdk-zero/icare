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
  kindParam,
  ofKind,
  scenarioKinds,
  scenarioKindsReady,
  type ScenarioKind,
} from '../app/lib/scenario-kind';

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

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

void main();
