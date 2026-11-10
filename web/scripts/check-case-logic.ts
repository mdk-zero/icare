/**
 * Behavioural checks for the case-presentation helpers: initials
 * normalisation (the privacy line), the group rubric's weighted scoring, and
 * which files a leader may hand in. There is no test runner in this repo.
 *
 *   npx tsx scripts/check-case-logic.ts
 *
 * Exits non-zero if any expectation fails.
 */
import { normalizeInitials } from '../app/lib/case-privacy';
import {
  CASE_CRITERIA,
  caseScore,
  allCriteriaRated,
  caseFileTypeOf,
  isLateSubmission,
  type CaseLevel,
} from '../app/lib/case-rubric';

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

console.log('rubric');
eq('six criteria', CASE_CRITERIA.length, 6);
eq('weights add up to 100', CASE_CRITERIA.reduce((n, c) => n + c.weight, 0), 100);
eq(
  'every level described',
  CASE_CRITERIA.every((c) => [1, 2, 3, 4].every((l) => c.levels[l as CaseLevel].length > 0)),
  true,
);

console.log('caseScore');
const all = (level: CaseLevel) => new Map<string, number>(CASE_CRITERIA.map((c) => [c.key, level]));
eq('all Excellent = 100', caseScore(all(4)), 100);
eq('all Proficient = 75', caseScore(all(3)), 75);
eq('all Developing = 50', caseScore(all(2)), 50);
eq('all Beginning = 25', caseScore(all(1)), 25);
const mixed = all(4);
mixed.set('care_plan', 2);
eq('care plan Developing costs 15 of its 30', caseScore(mixed), 85);
const proficientPatho = all(4);
proficientPatho.set('pathophysiology', 3);
eq('pathophysiology Proficient costs 5 of its 20', caseScore(proficientPatho), 95);
const partial = all(4);
partial.delete('critical_thinking');
eq('unrated criterion earns 0 → 90', caseScore(partial), 90);
eq('partial is not fully rated', allCriteriaRated(partial), false);
eq('all rated', allCriteriaRated(all(3)), true);
eq('unknown criterion ignored', caseScore(new Map([['bogus', 4]])), 0);
eq('out-of-range level ignored', caseScore(new Map([['care_plan', 5]])), 0);

console.log('caseFileTypeOf');
eq('PDF by MIME', caseFileTypeOf('application/pdf', 'x'), 'pdf');
eq(
  'PPTX by MIME',
  caseFileTypeOf('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'x'),
  'pptx',
);
eq('PPTX by extension', caseFileTypeOf('', 'Group L - Grand Case.PPTX'), 'pptx');
eq('PDF by extension when the MIME is generic', caseFileTypeOf('application/octet-stream', 'deck.pdf'), 'pdf');
eq('old .ppt refused', caseFileTypeOf('application/vnd.ms-powerpoint', 'deck.ppt'), null);
eq('Word refused', caseFileTypeOf('', 'notes.docx'), null);

console.log('isLateSubmission');
eq('after deadline is late', isLateSubmission('2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z'), true);
eq('before deadline is on time', isLateSubmission('2026-09-30T00:00:00Z', '2026-10-01T00:00:00Z'), false);
eq('no deadline is never late', isLateSubmission('2026-09-30T00:00:00Z', null), false);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
