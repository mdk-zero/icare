/**
 * Behavioural checks for the semester requirements engine (evaluate() in
 * app/lib/course-progress.ts): the term window, minimum scores, quiz retakes,
 * counts, skill evidence, skills_only, manual ticks and instructor overrides.
 * There is no test runner in this repo.
 *
 *   npx tsx scripts/check-course-progress.ts
 *
 * Exits non-zero if any expectation fails.
 */
import {
  evaluate,
  inTerm,
  parseRequirement,
  requirementLabel,
  requirementNames,
  summarize,
  type ProgressFacts,
  type RequirementRow,
} from '../app/lib/course-progress';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

const term = { starts_on: '2026-08-10', ends_on: '2026-12-18' };
const S = 'student-1';
const blank = {
  offering_id: 'o',
  title: '',
  activity_type: null,
  scenario_id: null,
  assessment_id: null,
  presentation_id: null,
  target_count: null,
  skill_id: null,
  min_score: null,
  skills_only: false,
} as const;
let n = 0;
const req = (fields: Partial<RequirementRow> & Pick<RequirementRow, 'kind'>): RequirementRow => ({
  ...blank,
  id: `r${++n}`,
  position: n,
  ...fields,
});
const facts = (over: Partial<ProgressFacts>): ProgressFacts => ({
  cases: [],
  attempts: [],
  quizSkills: {},
  presentations: [],
  shifts: [],
  checks: [],
  ...over,
});
const one = (r: RequirementRow, f: ProgressFacts, skills: string[] = []) => evaluate([r], skills, term, [S], f)[S][r.id];

console.log('term window (Manila days)');
eq('first minute of the first day counts', inTerm('2026-08-10T00:00:00+08:00', term), true);
eq('the evening before (UTC still the 9th) does not', inTerm('2026-08-09T15:59:00Z', term), false);
eq('last minute of the last day counts', inTerm('2026-12-18T23:59:00+08:00', term), true);
eq('midnight after the last day does not', inTerm('2026-12-19T00:00:00+08:00', term), false);

console.log('activity: Patient Case');
const caseItem = req({ kind: 'activity', activity_type: 'scenario', scenario_id: 'sc1' });
eq('graded in term → done', one(caseItem, facts({ cases: [{ student_id: S, scenario_id: 'sc1', score: 40, completed_at: '2026-09-01T02:00:00Z', skills: [] }] })).done, true);
eq('graded before term → not done', one(caseItem, facts({ cases: [{ student_id: S, scenario_id: 'sc1', score: 90, completed_at: '2026-07-01T02:00:00Z', skills: [] }] })).done, false);
const caseMin = req({ kind: 'activity', activity_type: 'scenario', scenario_id: 'sc1', min_score: 75 });
eq('below the minimum → not done', one(caseMin, facts({ cases: [{ student_id: S, scenario_id: 'sc1', score: 74, completed_at: '2026-09-01T02:00:00Z', skills: [] }] })).done, false);
eq('at the minimum → done', one(caseMin, facts({ cases: [{ student_id: S, scenario_id: 'sc1', score: 75, completed_at: '2026-09-01T02:00:00Z', skills: [] }] })).done, true);

console.log('activity: Quiz retakes');
const quizItem = req({ kind: 'activity', activity_type: 'assessment', assessment_id: 'q1', min_score: 75 });
const retakes = facts({
  attempts: [
    { student_id: S, assessment_id: 'q1', score: 60, submitted_at: '2026-09-01T01:00:00Z', skill_scores: {} },
    { student_id: S, assessment_id: 'q1', score: 80, submitted_at: '2026-09-03T01:00:00Z', skill_scores: {} },
    { student_id: S, assessment_id: 'q1', score: 50, submitted_at: '2026-09-05T01:00:00Z', skill_scores: {} },
  ],
});
const quiz = one(quizItem, retakes);
eq('a passing retake meets it', quiz.done, true);
eq('a later lower retake does not undo it', quiz.done_at, '2026-09-03T01:00:00Z');
eq('best score is the highest attempt', quiz.best_score, 80);

console.log('count');
const threeCases = req({ kind: 'count', activity_type: 'scenario', target_count: 3 });
const caseFacts = facts({
  cases: [
    { student_id: S, scenario_id: 'a', score: 90, completed_at: '2026-09-01T00:00:00Z', skills: [{ skill_id: '1-7', credit: 1 }] },
    { student_id: S, scenario_id: 'b', score: 70, completed_at: '2026-09-10T00:00:00Z', skills: [{ skill_id: '14-1', credit: 0.67 }] },
    { student_id: S, scenario_id: 'c', score: 80, completed_at: '2026-10-01T00:00:00Z', skills: [] },
    { student_id: S, scenario_id: 'd', score: 95, completed_at: '2026-01-01T00:00:00Z', skills: [] },
  ],
});
const counted = one(threeCases, caseFacts);
eq('counts only graded work inside the term', [counted.current, counted.target, counted.done], [3, 3, true]);
eq('done on the date the third one was graded', counted.done_at, '2026-10-01T00:00:00Z');
const onlySkills = req({ kind: 'count', activity_type: 'scenario', target_count: 1, skills_only: true });
eq('skills_only counts cases covering a course skill', one(onlySkills, caseFacts, ['14-1']).current, 1);
eq('skills_only with no matching skills counts none', one(onlySkills, caseFacts, ['5-1']).current, 0);
const twoQuizzes = req({ kind: 'count', activity_type: 'assessment', target_count: 2, min_score: 75 });
eq('each Quiz counts once, however many attempts', one(twoQuizzes, retakes).current, 1);
eq('the average is over cases inside the term', counted.avg_score, 80);
eq('the average follows skills_only', one(onlySkills, caseFacts, ['14-1']).avg_score, 70);
const failedQuiz = facts({
  attempts: [
    ...retakes.attempts,
    { student_id: S, assessment_id: 'q2', score: 40, submitted_at: '2026-09-04T01:00:00Z', skill_scores: {} },
  ],
});
eq('the average takes each Quiz at its best attempt, failed ones too', one(twoQuizzes, failedQuiz).avg_score, 60);
const shifts = req({ kind: 'count', activity_type: 'shift', target_count: 2 });
const attended = one(shifts, facts({ shifts: [{ student_id: S, starts_at: '2026-09-01T00:00:00Z' }, { student_id: S, starts_at: '2027-01-05T00:00:00Z' }] }));
eq('shifts attended inside the term', attended.current, 1);
eq('shifts have no score to average', attended.avg_score, null);

console.log('skill');
const skill = req({ kind: 'skill', skill_id: '1-7', min_score: 50 });
const needsPractice = facts({
  cases: [{ student_id: S, scenario_id: 'a', score: 40, completed_at: '2026-09-01T00:00:00Z', skills: [{ skill_id: '1-7', credit: 1 / 3 }] }],
});
const np = one(skill, needsPractice);
eq('Needs Practice does not meet "Satisfactory or better"', [np.done, np.level], [false, 'Needs Practice']);
eq('any graded work (null) accepts it', one({ ...skill, min_score: null }, needsPractice).done, true);
eq(
  'a task not performed is no evidence',
  one({ ...skill, min_score: null }, facts({ cases: [{ student_id: S, scenario_id: 'a', score: 0, completed_at: '2026-09-01T00:00:00Z', skills: [{ skill_id: '1-7', credit: 0 }] }] })).done,
  false,
);
const quizSkill = facts({
  quizSkills: { q9: ['1-7'] },
  attempts: [{ student_id: S, assessment_id: 'q9', score: 40, submitted_at: '2026-09-02T00:00:00Z', skill_scores: { '1-7': 90 } }],
});
const qs = one(skill, quizSkill);
eq('a Quiz criterion on the skill is evidence, at its own score', [qs.done, qs.best_score, qs.level], [true, 90, 'Excellent']);

console.log('manual and overrides');
const manual = req({ kind: 'manual', title: 'Return demo sheet' });
eq('manual is open until ticked', one(manual, facts({})).done, false);
const ticked = one(manual, facts({ checks: [{ requirement_id: manual.id, student_id: S, checked_by: 'f', checked_at: '2026-09-09T00:00:00Z', note: '' }] }));
eq('manual ticked → done by the instructor', [ticked.done, ticked.source], [true, 'instructor']);
const override = one(caseItem, facts({ checks: [{ requirement_id: caseItem.id, student_id: S, checked_by: 'f', checked_at: '2026-09-09T00:00:00Z', note: 'Done on paper' }] }));
eq('an override marks an automatic item done, with its note', [override.done, override.source, override.note], [true, 'instructor', 'Done on paper']);
const both = one(
  caseItem,
  facts({
    cases: [{ student_id: S, scenario_id: 'sc1', score: 90, completed_at: '2026-09-01T00:00:00Z', skills: [] }],
    checks: [{ requirement_id: caseItem.id, student_id: S, checked_by: 'f', checked_at: '2026-09-09T00:00:00Z', note: 'x' }],
  }),
);
eq('graded work wins over an override', both.source, 'graded');
const removed = req({ kind: 'activity', activity_type: 'scenario' });
eq('a removed activity can never be met by graded work', one(removed, caseFacts).done, false);

console.log('summarize');
const all = [caseItem, manual];
eq('counts the met items', summarize(evaluate(all, [], term, [S], caseFacts)[S], all), { done: 0, total: 2 });

console.log('parseRequirement');
eq('manual needs a title', parseRequirement({ kind: 'manual', title: ' ' }).ok, false);
eq('count needs a whole number', parseRequirement({ kind: 'count', activity_type: 'scenario', target_count: 2.5 }).ok, false);
const shiftParsed = parseRequirement({ kind: 'count', activity_type: 'shift', target_count: 4, min_score: 80, skills_only: true });
eq('shift counts drop the score and skills_only', shiftParsed.ok && [shiftParsed.value.min_score, shiftParsed.value.skills_only], [null, false]);
const activityParsed = parseRequirement({ kind: 'activity', activity_type: 'assessment', assessment_id: 'q1', scenario_id: 'stray' });
eq('activity keeps only its own link', activityParsed.ok && [activityParsed.value.assessment_id, activityParsed.value.scenario_id], ['q1', null]);

console.log('requirementLabel');
const names = { scenarios: { sc1: 'Asthma' }, quizzes: { q1: 'Vital Signs' }, presentations: {}, skills: { '1-7': 'Assessing Blood Pressure' } };
eq('count of quizzes with a pass mark', requirementLabel(req({ kind: 'count', activity_type: 'assessment', target_count: 3, min_score: 75 }), names), '3 Quizzes passed at 75%+');
eq('one shift', requirementLabel(req({ kind: 'count', activity_type: 'shift', target_count: 1 }), names), '1 shift attended');
eq('activity with a minimum', requirementLabel(caseMin, names), 'Patient Case: Asthma · 75%+');
eq('skill with a level', requirementLabel(skill, names), 'Skill 1-7 · Assessing Blood Pressure (satisfactory or better)');
eq('removed activity', requirementLabel(removed, names), 'Removed Patient Case');

console.log('requirementNames');
eq(
  'numbered within each topic, in checklist order',
  requirementNames([
    req({ kind: 'count', activity_type: 'assessment', target_count: 3 }),
    req({ kind: 'skill', skill_id: '1-1' }),
    req({ kind: 'activity', activity_type: 'assessment', assessment_id: 'q1' }),
    req({ kind: 'skill', skill_id: '1-4' }),
    req({ kind: 'count', activity_type: 'scenario', target_count: 2 }),
    req({ kind: 'activity', activity_type: 'case_presentation', presentation_id: 'p1' }),
    req({ kind: 'count', activity_type: 'shift', target_count: 4 }),
    req({ kind: 'manual', title: 'Return demonstration' }),
  ]),
  ['Quiz #1', 'Skill #1', 'Quiz #2', 'Skill #2', 'Patient Case #1', 'Case Presentation #1', 'Attendance #1', 'Lab Activity #1'],
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
