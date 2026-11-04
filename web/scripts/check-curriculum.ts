/**
 * Behavioural checks for the curriculum rules (app/lib/curriculum.ts): turning
 * an AI reading of a PDF into courses without losing or inventing anything,
 * storing requisites, and what gets flagged for a person to check.
 * There is no test runner in this repo.
 *
 *   npx tsx scripts/check-curriculum.ts
 *
 * Exits non-zero if any expectation fails.
 */
import {
  catalogOf,
  curriculumIssues,
  curriculumStats,
  parseCurriculumCourse,
  readImportedCurriculum,
  requisitePlacement,
  requisiteProblem,
  requisiteRows,
  type CurriculumCourseRow,
} from '../app/lib/curriculum';
import { NCM_LAB_COURSES, curriculumGroup, isLabCourse } from '../app/lib/bsn-curriculum';

let failures = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) return;
  failures += 1;
  console.error(`FAIL  ${label}`, detail);
}

function row(id: string, year: number, term: number, more: Partial<CurriculumCourseRow> = {}): CurriculumCourseRow {
  return {
    id,
    code: id,
    title: `Title of ${id}`,
    year_level: year,
    term,
    lecture_units: 3,
    lab_units: 0,
    requisite_note: '',
    position: 0,
    prerequisite_ids: [],
    corequisite_ids: [],
    ...more,
  };
}

// ---- Reading the model's answer ---------------------------------------------

const reading = readImportedCurriculum(
  {
    name: '  BS   Nursing  ',
    notes: ['Page 2 is faint.', ''],
    terms: [
      {
        year: 1,
        term: 1,
        stated_units: '23',
        courses: [
          ['NCM 100', 'Foundations', 3, 0, ['None'], []],
          ['NSTP 1', 'Service', '(3)', 0, [], []],
          ['NCM 101', 'Health Assessment', 3, 0, ['NCM100'], ['NCM 101L']],
          ['NCM 101L', 'Skills Lab', 0, 1, [], ['ncm-101']],
          ['NCM 102', 'Both ways', 1, 0, ['NCM 100, NCM 101'], []],
          ['NCM 103', 'Unknown code', 1, 0, ['NCM 999'], []],
          ['NCM 104', 'Standing', 1, 0, ['3rd Year Standing'], []],
          ['NCM 105', 'Sentence', 1, 0, ['All 1st and 2nd year courses'], []],
          ['NCM 106', 'Either', 1, 0, ['NCM 100 or NCM 101'], []],
          ['NCM 107', 'Self', 1, 0, ['NCM 107'], []],
          ['NCM 108', 'Pair', 1, 0, ['NCM 100'], ['NCM 100']],
          ['ELECT', 'Elective one', 3, 0],
          ['ELECT', 'Elective two', 3, 0],
          ['', 'No code at all', 3, 0],
          ['', '', 3, 0],
          'junk row',
          ['LARGE', 'Too many units', 500, -1],
        ],
      },
      { year: 9, term: 1, courses: [['BAD', 'Year out of range', 3, 0]] },
      { year: 1, term: 7, courses: [['BAD2', 'Term out of range', 3, 0]] },
      { year: 2, term: 3, stated_units: null, courses: [['MID', 'Midyear', 3, 0]] },
    ],
  },
  'fallback',
);
const read = (code: string) => reading.courses.find((c) => c.code === code);

check('the name is tidied', reading.name === 'BS Nursing', reading.name);
check('a nameless reading takes the fallback', readImportedCurriculum({ terms: [] }, 'file name').name === 'file name');
check('rows out of range or junk are dropped', !read('BAD') && !read('BAD2') && !reading.courses.some((c) => c.title === ''));
check('stated units are kept as printed', reading.analysis.stated_units[0]?.units === 23, reading.analysis.stated_units);
check('a term with no printed total states nothing', reading.analysis.stated_units.length === 1);
check('blank notes are dropped', reading.analysis.notes[0] === 'Page 2 is faint.' && !reading.analysis.notes.includes(''));
check('units in parentheses are read', read('NSTP 1')?.lecture_units === 3);
check('impossible units become zero', read('LARGE')?.lecture_units === 0 && read('LARGE')?.lab_units === 0);
check('"None" is no requisite', read('NCM 100')?.prerequisites.length === 0 && read('NCM 100')?.requisite_note === '');
check('a differently written code still matches', read('NCM 101')?.prerequisites[0] === 'NCM 100');
check('a co-requisite matches its course', read('NCM 101L')?.corequisites[0] === 'NCM 101');
check('codes in one cell are split', read('NCM 102')?.prerequisites.join() === 'NCM 100,NCM 101', read('NCM 102'));
check('a code not in the reading stays visible', read('NCM 103')?.requisite_note === 'Pre-req: NCM 999', read('NCM 103'));
check('a standing stays in words', read('NCM 104')?.requisite_note === '3rd Year Standing');
check('a sentence with "and" is not cut up', read('NCM 105')?.requisite_note === 'All 1st and 2nd year courses');
check('an either-or stays whole', read('NCM 106')?.requisite_note === 'NCM 100 or NCM 101' && read('NCM 106')?.prerequisites.length === 0);
check('a course cannot require itself', read('NCM 107')?.prerequisites.length === 0);
check('a pair is not both kinds', read('NCM 108')?.prerequisites.length === 1 && read('NCM 108')?.corequisites.length === 0);
check('a repeated code keeps both courses', read('ELECT')?.title === 'Elective one' && read('ELECT (2)')?.title === 'Elective two');
check('a repeated code is noted', reading.analysis.notes.some((n) => n.includes('ELECT')));
check('a course with no code takes its title', read('No code at all')?.title === 'No code at all');
check('midyear is a term', read('MID')?.term === 3 && read('MID')?.year_level === 2);
check('positions follow the document', reading.courses.every((c, i) => c.position === i));
check('no course goes missing', reading.courses.length === 16, reading.courses.length);

// ---- Storing requisites -------------------------------------------------------

const rows = requisiteRows([
  { id: 'a', prerequisite_ids: ['b'], corequisite_ids: ['c'] },
  { id: 'b', prerequisite_ids: [], corequisite_ids: ['a'] },
  { id: 'c', prerequisite_ids: [], corequisite_ids: [] },
]);
const has = (course: string, requires: string, kind: string) =>
  rows.some((r) => r.course_id === course && r.requires_id === requires && r.kind === kind);
check('a pre-requisite is one way', has('a', 'b', 'pre') && !has('b', 'a', 'pre'));
check('a co-requisite goes both ways', has('a', 'c', 'co') && has('c', 'a', 'co'));
check('a pre-requisite beats a co-requisite on the same pair', !has('a', 'b', 'co'));
check('no two rows share a pair', new Set(rows.map((r) => `${r.course_id}:${r.requires_id}`)).size === rows.length);

// ---- What gets flagged ----------------------------------------------------------

const keys = (courses: CurriculumCourseRow[], analysis?: Parameters<typeof curriculumIssues>[1]) =>
  curriculumIssues(courses, analysis).map((i) => i.key);

check(
  'a sound plan flags nothing',
  keys([
    row('a', 1, 1),
    row('b', 1, 2, { prerequisite_ids: ['a'] }),
    row('c', 2, 1, { corequisite_ids: ['d'] }),
    row('d', 2, 1, { corequisite_ids: ['c'] }),
    row('e', 2, 3, { prerequisite_ids: ['c'] }),
    row('f', 3, 1, { prerequisite_ids: ['e'] }),
  ]).length === 0,
);
check('a pre-requisite in the same term', keys([row('a', 1, 1, { prerequisite_ids: ['b'] }), row('b', 1, 1)]).includes('pre-same:a:b'));
check('a pre-requisite in a later term', keys([row('a', 1, 1, { prerequisite_ids: ['b'] }), row('b', 2, 1)]).includes('pre-later:a:b'));
check('midyear comes before the next year', !keys([row('a', 2, 1, { prerequisite_ids: ['b'] }), row('b', 1, 3)]).some((k) => k.startsWith('pre-')));
const coApart = keys([row('a', 1, 1, { corequisite_ids: ['b'] }), row('b', 1, 2, { corequisite_ids: ['a'] })]);
check('co-requisites in different terms, once', coApart.length === 1 && coApart[0] === 'co:a:b', coApart);
const loop = keys([row('a', 1, 1, { prerequisite_ids: ['b'] }), row('b', 2, 1, { prerequisite_ids: ['c'] }), row('c', 3, 1, { prerequisite_ids: ['a'] })]);
check('a loop of pre-requisites', loop.filter((k) => k.startsWith('loop:')).length === 1, loop);
check('a course needing itself through two others is not a false loop', !keys([row('a', 1, 1), row('b', 2, 1, { prerequisite_ids: ['a'] }), row('c', 3, 1, { prerequisite_ids: ['a', 'b'] })]).some((k) => k.startsWith('loop:')));
check('a named course that is missing', keys([row('a', 1, 1, { requisite_note: 'Pre-req: NCM 999' })]).includes('missing:a'));
check('a named course that exists', !keys([row('a', 1, 1, { requisite_note: 'NCM 100 or NCM 101' }), row('NCM 100', 1, 1), row('NCM 101', 1, 1)]).includes('missing:a'));
check('a standing is not a missing course', !keys([row('a', 1, 1, { requisite_note: '3rd Year Standing' })]).includes('missing:a'));
check('no units', keys([row('a', 1, 1, { lecture_units: 0 })]).includes('units0:a'));

const stated = { stated_units: [{ year_level: 1, term: 1, units: 6 }], notes: [] };
check('a printed total that matches', !keys([row('a', 1, 1), row('b', 1, 1)], stated).includes('units:1:1'));
check('a printed total that does not', keys([row('a', 1, 1)], stated).includes('units:1:1'));
check('half units add up cleanly', !keys([row('a', 1, 1, { lecture_units: 0.1, lab_units: 0.2 })], { stated_units: [{ year_level: 1, term: 1, units: 0.3 }], notes: [] }).includes('units:1:1'));

// ---- A course as typed ------------------------------------------------------------

const good = { code: ' NCM  101 ', title: 'Health', year_level: 1, term: 2, lecture_units: '3', lab_units: 1.25 };
const parsed = parseCurriculumCourse(good);
check('a course parses and tidies', parsed.ok && parsed.value.code === 'NCM 101' && parsed.value.lecture_units === 3, parsed);
const invalid = (more: Record<string, unknown>) => !parseCurriculumCourse({ ...good, ...more }).ok;
check('no code', invalid({ code: '  ' }));
check('no title', invalid({ title: '' }));
check('year out of range', invalid({ year_level: 7 }));
check('term out of range', invalid({ term: 4 }));
check('negative units', invalid({ lab_units: -1 }));
check('too many units', invalid({ lecture_units: 100 }));
check('the same course as both kinds', invalid({ prerequisite_ids: ['x'], corequisite_ids: ['x'] }));
check('requisites of the wrong type', invalid({ prerequisite_ids: 'x' }));

const list = [row('a', 1, 1), row('b', 1, 2, { prerequisite_ids: ['c'] }), row('c', 2, 1)];
check('requisites here pass', requisiteProblem(list, 'b', ['a'], []) === null);
check('a requisite from elsewhere', requisiteProblem(list, 'b', ['zzz'], []) !== null);
check('requiring itself', requisiteProblem(list, 'b', ['b'], []) !== null);
check('a co-requisite that needs this first', requisiteProblem(list, 'c', [], ['b']) !== null);

const warnings = requisitePlacement({ year_level: 1, term: 2 }, [row('a', 1, 2), row('later', 2, 1), row('fine', 1, 1)], [row('other', 2, 1), row('same', 1, 2)]);
check('the form warns of what is out of place, and only that', warnings.length === 3, warnings);

// ---- The tiles and the picker -----------------------------------------------------

const stats = curriculumStats([row('a', 1, 1, { lab_units: 1, corequisite_ids: ['b'] }), row('b', 2, 1, { corequisite_ids: ['a'], prerequisite_ids: ['a'] })]);
check('tiles count a co-requisite pair once', stats.corequisites === 1 && stats.prerequisites === 1, stats);
check('tiles add the units', stats.units === 7 && stats.lecture === 6 && stats.lab === 1, stats);
check('the catalog is in curriculum order', catalogOf([row('NCM 2L', 2, 1), row('NCM 1L', 1, 1)])[0].code === 'NCM 1L');
check('the picker names a midyear term', curriculumGroup({ year: 2, semester: 3 }) === 'Second Year · Midyear');

// ---- Only lab courses are assigned ----------------------------------------------------

for (const code of ['NCM 101L', 'NCM 104L', 'ncm 101l', 'NCM 101 L', 'NCM101L', ' NCM 121L ']) {
  check(`${code} is a lab course`, isLabCourse(code));
}
for (const code of ['NCM 101', 'GE 1', 'PATHFIT 2', 'BIOL 101', 'BIOL', 'SKILL', 'L', '']) {
  check(`${code || 'an empty code'} is not a lab course`, !isLabCourse(code));
}
const catalog = catalogOf([row('NCM 101', 1, 2), row('NCM 101L', 1, 2), row('GE 1', 1, 1), row('NCM 103L', 1, 2)]);
check('the catalog holds only the lab courses', catalog.map((c) => c.code).join() === 'NCM 101L,NCM 103L', catalog);
check('a curriculum with no lab courses offers nothing', catalogOf([row('NCM 101', 1, 2)]).length === 0);
check('the built-in list is all lab courses', NCM_LAB_COURSES.every((c) => isLabCourse(c.code)));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('All curriculum checks passed');
