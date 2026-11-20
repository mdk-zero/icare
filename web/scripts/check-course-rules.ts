/**
 * Behavioural checks for the course rules (app/lib/course-rules.ts): a Dean's
 * courses keep to their curriculum's semester and year level, and a Dean has
 * one term per semester of an academic year.
 * There is no test runner in this repo.
 *
 *   npx tsx scripts/check-course-rules.ts
 *
 * Exits non-zero if any expectation fails.
 */
import {
  addedSectionsProblem,
  catalogOrDefault,
  courseCodeProblem,
  fitsSection,
  fitsTerm,
  offeringProblem,
  sameSemesterTerm,
  sectionYear,
  termNameProblem,
  termSemester,
} from '../app/lib/course-rules';
import { NCM_LAB_COURSES, type CurriculumCourse } from '../app/lib/bsn-curriculum';

let failures = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) return;
  failures += 1;
  console.error(`FAIL  ${label}`, detail);
}

const catalog = NCM_LAB_COURSES;
const ncm112 = catalog.find((c) => c.code === 'NCM 112L') as CurriculumCourse;

// Reading a term's semester and a section's year from their names.
check('1st Semester AY 2026–2027 is semester 1', termSemester('1st Semester AY 2026–2027') === 1);
check('2nd Semester 2026-2027 is semester 2', termSemester('2nd Semester 2026-2027') === 2);
check('Midterm is the curriculum midyear', termSemester('Midterm AY 2026–2027') === 3);
check('a name without a semester says nothing', termSemester('App Review Term') === null);
check('BSN 3101 is third year', sectionYear('BSN 3101') === 3);
check('BSN-2105 is second year', sectionYear('BSN-2105') === 2);
check('a name without a section number says nothing', sectionYear('Test-Section') === null && sectionYear('App Review') === null);
check('a five-digit number is not a section number', sectionYear('Room 31010') === null);

// Creating a course.
check('a curriculum lab course can be added', courseCodeProblem(catalog, 'ncm  112l') === null);
check('a lecture course cannot', courseCodeProblem(catalog, 'NCM 101') !== null);
check('a code outside the curriculum cannot', courseCodeProblem(catalog, 'NCM 999L') !== null);

// Assigning a course: the semester.
check('NCM 112L fits a first semester', fitsTerm(ncm112, '1st Semester AY 2026–2027'));
check('NCM 112L does not fit a second semester', !fitsTerm(ncm112, '2nd Semester AY 2026–2027'));
check('a term that does not say its semester passes', fitsTerm(ncm112, 'App Review Term'));
const wrongTerm = offeringProblem({ catalog, code: 'NCM 101L', termName: '1st Semester AY 2026–2027' });
check('NCM 101L in a first semester is refused, naming its semester', !!wrongTerm?.includes('Second Semester'), wrongTerm);
check(
  'NCM 101L in a second semester is fine',
  offeringProblem({ catalog, code: 'NCM 101L', termName: '2nd Semester AY 2026–2027' }) === null,
);
check(
  'a course outside the curriculum cannot be assigned',
  offeringProblem({ catalog, code: 'NCM 101', termName: '2nd Semester AY 2026–2027' }) !== null,
);

// Assigning a course: the sections' year.
check('NCM 112L fits a third-year section', fitsSection(ncm112, 'BSN 3101'));
check('NCM 112L does not fit a second-year section', !fitsSection(ncm112, 'BSN 2101'));
check('a section without a year passes', fitsSection(ncm112, 'Test-Section'));
const wrongYear = offeringProblem({
  catalog,
  code: 'NCM 112L',
  termName: '1st Semester AY 2026–2027',
  sectionNames: ['BSN 3101', 'BSN 2101'],
});
check('a wrong-year section is refused, naming it', !!wrongYear?.includes('BSN 2101'), wrongYear);
check(
  'right semester and year passes',
  offeringProblem({ catalog, code: 'NCM 112L', termName: '1st Semester AY 2026–2027', sectionNames: ['BSN 3101', 'BSN 3102'] }) ===
    null,
);

// Editing an assignment: only what is added is checked.
check('adding a wrong-year section is refused', addedSectionsProblem(catalog, 'NCM 112L', ['BSN 1101']) !== null);
check('adding nothing (only removing) is fine', addedSectionsProblem(catalog, 'NCM 112L', []) === null);
check('a course from before the rules keeps working', addedSectionsProblem(catalog, 'NCM 101', ['BSN 3101']) === null);

// Terms.
check('a picker-made name is fine', termNameProblem('1st Semester AY 2026–2027') === null);
check('a name that does not say the semester is refused', termNameProblem('Summer term') !== null);
const terms = [
  { id: 't1', name: '1st Semester 2026-2027' },
  { id: 't2', name: '2nd Semester AY 2026–2027' },
  { id: 't3', name: 'App Review Term' },
];
check('the same semester written another way is a twin', sameSemesterTerm(terms, '1st Semester AY 2026–2027')?.id === 't1');
check('another academic year is not', sameSemesterTerm(terms, '1st Semester AY 2027–2028') === null);
check('a term is not its own twin', sameSemesterTerm(terms, '1st Semester AY 2026–2027', 't1') === null);

// The catalog falls back to the built-in list.
check('no curriculum in use means the built-in list', catalogOrDefault(null) === NCM_LAB_COURSES);
check('an empty curriculum means the built-in list', catalogOrDefault([]) === NCM_LAB_COURSES);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('course rules: all checks passed');
