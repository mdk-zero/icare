/**
 * Behavioural checks for the case-presentation helpers: initials
 * normalisation (the privacy line), rubric scoring, the submit gate and the
 * observations whitelist. There is no test runner in this repo.
 *
 *   npx tsx scripts/check-case-logic.ts
 *
 * Exits non-zero if any expectation fails.
 */
import { normalizeInitials } from '../app/lib/case-privacy';
import {
  caseScore,
  allCriteriaRated,
  missingCaseFields,
  sanitizeObservations,
  isLateSubmission,
  MAX_OBSERVATIONS,
} from '../app/lib/case-rubric';
import type { TaskRating } from '../app/lib/task-ratings';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

console.log('normalizeInitials');
eq('"JD" stays', normalizeInitials('JD'), 'JD');
eq('"j.d." → JD', normalizeInitials('j.d.'), 'JD');
eq('"j d c" → JDC', normalizeInitials('j d c'), 'JDC');
eq('full name rejected', normalizeInitials('Juan Dela Cruz'), null);
eq('single letter rejected', normalizeInitials('J'), null);
eq('digits only rejected', normalizeInitials('12'), null);
eq('empty rejected', normalizeInitials(''), null);

console.log('caseScore');
const all = (r: TaskRating) =>
  new Map<string, TaskRating>(['profile', 'assessment', 'diagnoses', 'interventions', 'delivery'].map((k) => [k, r]));
eq('all excellent = 100', caseScore(all('excellent')), 100);
eq('all satisfactory = 75', caseScore(all('satisfactory')), 75);
eq('all needs practice = 50', caseScore(all('needs_practice')), 50);
const mixed = all('excellent');
mixed.set('delivery', 'needs_practice');
eq('4 excellent + 1 needs practice = 90', caseScore(mixed), 90);
const partial = all('excellent');
partial.delete('delivery');
eq('unrated criterion earns 0 → 80', caseScore(partial), 80);
eq('partial is not fully rated', allCriteriaRated(partial), false);
eq('all rated', allCriteriaRated(all('satisfactory')), true);
eq('unknown criterion ignored', caseScore(new Map([['bogus', 'excellent' as TaskRating]])), 0);

console.log('missingCaseFields');
eq('empty row lists all 7', missingCaseFields({}).length, 7);
eq(
  'complete row → none',
  missingCaseFields({
    patient_initials: 'JD',
    age: 0,
    sex: 'male',
    admitting_diagnosis: 'CAP',
    chief_complaint: 'Cough',
    nursing_diagnoses: 'Ineffective airway clearance',
    interventions: 'Positioning',
  }),
  [],
);
eq('whitespace counts as missing', missingCaseFields({ chief_complaint: '   ' }).includes('Chief complaint'), true);

console.log('sanitizeObservations');
const cleaned = sanitizeObservations({
  vitals: [{ heart_rate: '88', patient_name: 'Juan Dela Cruz', notes: 'ok', observed_at: 'nonsense' }],
  tpr: 'not a list',
  ivf: [{ solution: '' }, { solution: 'PNSS 1L', rate_ml_hr: 30 }],
  extra: [1, 2, 3],
});
eq('unknown key dropped', Object.keys(cleaned.vitals[0]).includes('patient_name'), false);
eq('numeric string coerced', cleaned.vitals[0].heart_rate, 88);
eq('bad date → null', cleaned.vitals[0].observed_at, null);
eq('non-list → []', cleaned.tpr, []);
eq('IVF without a solution dropped', cleaned.ivf.length, 1);
eq('only the three lists survive', Object.keys(cleaned), ['vitals', 'tpr', 'ivf']);
eq(
  'capped at MAX_OBSERVATIONS',
  sanitizeObservations({ tpr: Array.from({ length: 80 }, () => ({ pulse: 70 })) }).tpr.length,
  MAX_OBSERVATIONS,
);
eq('garbage input → empty lists', sanitizeObservations(null), { vitals: [], tpr: [], ivf: [] });

console.log('isLateSubmission');
eq('after deadline is late', isLateSubmission('2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z'), true);
eq('before deadline is on time', isLateSubmission('2026-09-30T00:00:00Z', '2026-10-01T00:00:00Z'), false);
eq('no deadline is never late', isLateSubmission('2026-09-30T00:00:00Z', null), false);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
