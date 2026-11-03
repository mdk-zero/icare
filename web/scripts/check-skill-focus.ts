/**
 * Behavioural checks for app/lib/skill-focus.ts: which skills the mobile
 * Library lists under "Needs improvement".
 *
 * The rules are small but easy to get backwards — the quiz cutoff, N/A being
 * no evidence, BKT mastery deciding which skills are listed and in what
 * order — so the pure core is checked on synthetic results, then every
 * student with graded work is run through the loader against the real
 * database (read-only) for a sanity pass.
 *
 *   npm run check:focus
 *
 * Exits non-zero when an expectation fails. The database section is skipped
 * when Supabase credentials are absent.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  QUIZ_NEEDS_IMPROVEMENT_BELOW,
  checklistEvidence,
  loadSkillFocus,
  quizEvidence,
  rankByMastery,
} from '../app/lib/skill-focus';
import { MASTERY_THRESHOLD } from '../app/lib/bkt';
import { buildSkillTipsPrompt, sanitizeSkillTips } from '../app/lib/skill-tips';

config({ path: '.env.local' });

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const quiz = (at: string, correct: number, total: number) => quizEvidence('Quiz', at, correct, total)!;
const rated = (at: string, ...ratings: string[]) =>
  checklistEvidence(
    'patient_case',
    'Case',
    at,
    ratings.map((rating, i) => ({ label: `Step ${i + 1}`, rating })),
  );

async function main() {
  console.log('\n=== quiz cutoff ===');
  check(`under ${QUIZ_NEEDS_IMPROVEMENT_BELOW}% is weak`, quiz('2026-10-01', 7, 10).weak);
  check(`exactly ${QUIZ_NEEDS_IMPROVEMENT_BELOW}% is not`, !quiz('2026-10-01', 3, 4).weak);
  check('no questions is no evidence', quizEvidence('Quiz', '2026-10-01', 0, 0) === null);

  console.log('\n=== checklist ratings ===');
  check('one step at Needs Practice is weak', !!rated('2026-10-01', 'excellent', 'needs_practice')?.weak);
  check('Satisfactory and Excellent are not', rated('2026-10-01', 'satisfactory', 'excellent')?.weak === false);
  check('N/A alone is no evidence', rated('2026-10-01', 'not_applicable') === null);
  check(
    'the steps to practise are named',
    rated('2026-10-01', 'needs_practice', 'excellent', 'needs_practice')?.needs_practice.join() === 'Step 1,Step 3',
  );

  console.log('\n=== BKT mastery decides ===');
  const m = (skill_id: string, mastery: number) => ({ skill_id, mastery });
  {
    const r = rankByMastery([m('1-1', 0.6), m('2-3', 0.2), m('3-1', MASTERY_THRESHOLD)], new Map());
    check(`least mastered first, mastered (${MASTERY_THRESHOLD}) left out`, r.map((s) => s.skillId).join() === '2-3,1-1');
  }
  {
    const r = rankByMastery([m('1-10', 0.4), m('1-2', 0.4)], new Map());
    check('a tie goes by skill number', r.map((s) => s.skillId).join() === '1-2,1-10');
  }
  {
    const r = rankByMastery(
      [m('1-1', 0.5)],
      new Map([['1-1', [quiz('2026-09-01', 9, 10), rated('2026-10-03', 'needs_practice')!]]]),
    );
    check(
      "a skill's results come newest first, good ones too",
      r[0]?.evidence.map((e) => e.at).join() === '2026-10-03,2026-09-01',
    );
  }
  {
    const r = rankByMastery([m('1-1', 0.3)], new Map());
    check('a skill with mastery but no shown results is still listed', r.length === 1 && r[0].evidence.length === 0);
  }

  console.log('\n=== AI tip guard ===');
  {
    const weak = new Set(['1-7', '4-1']);
    const tips = sanitizeSkillTips(
      {
        tips: [
          { title: 'Deflate the cuff slowly', tip: 'Release 2-3 mmHg per second.', skill_id: 'Skill 1-7' },
          { title: 'Invented', tip: 'About a skill they were never flagged on.', skill_id: '9-9' },
          { title: 'Again', tip: 'A second tip on the same skill.', skill_id: '1-7' },
          { title: '', tip: 'No title.', skill_id: '4-1' },
          { title: 'Lather for 20 seconds', tip: 'Cover every surface.', skill_id: '4-1' },
        ],
      },
      weak,
      4,
    );
    check('keeps one tip per flagged skill, drops invented and empty ones', tips.map((t) => t.skill_id).join() === '1-7,4-1');
    check('a non-array answer gives no tips', sanitizeSkillTips({ tips: 'none' }, weak, 4).length === 0);
    const withOverall = sanitizeSkillTips(
      {
        tips: [
          { title: 'Practise checklists first', tip: 'Your Return Demos trail your quizzes.', skill_id: 'overall' },
          { title: 'Again', tip: 'A second overall tip.', skill_id: 'overall' },
          { title: 'Deflate the cuff slowly', tip: 'Release 2-3 mmHg per second.', skill_id: '1-7' },
        ],
      },
      weak,
      5,
    );
    check('one overall tip is kept alongside the skill tips', withOverall.map((t) => t.skill_id).join() === 'overall,1-7');
    const prompt = buildSkillTipsPrompt(
      [
        {
          skill_id: '1-7',
          title: 'Assessing Brachial Artery Blood Pressure',
          chapter: 1,
          area: 'Vital Signs',
          evidence: [rated('2026-10-03', 'needs_practice')!, quiz('2026-10-01', 2, 3)],
          quiz_ids: [],
          mastery: 0.4,
        },
      ],
      new Map([['1-7', 'Accurate blood pressure.']]),
      undefined,
      [
        { id: 'm1', skill_id: '1-7', kind: 'video', title: 'Taking a Blood Pressure', description: 'Cuff size and deflation.' },
        { id: 'm2', skill_id: '9-9', kind: 'note', title: 'Another skill', description: '' },
      ],
    );
    check('the prompt lists the skill’s own materials only', prompt.includes('"Taking a Blood Pressure"') && !prompt.includes('Another skill'));
    check(
      'the prompt is general: no quiz, case or step it came from',
      !prompt.includes('"Step 1"') && !prompt.includes('67%') && !prompt.includes('Quiz "'),
    );
  }

  // ---------- against the real database ----------
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('\n=== real data === skipped (no Supabase credentials)');
  } else {
    console.log('\n=== real data (read-only) ===');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: graded } = await supabase.from('assessment_attempts').select('student_id').eq('status', 'submitted');
    const { data: cases } = await supabase.from('scenario_assignments').select('student_id');
    const students = [...new Set([...(graded ?? []), ...(cases ?? [])].map((r) => r.student_id as string))];
    let flagged = 0;
    for (const id of students) {
      try {
        const skills = await loadSkillFocus(supabase, id);
        if (skills.length > 0) flagged++;
        for (const [i, s] of skills.entries()) {
          const sane = s.mastery >= 0 && s.mastery < MASTERY_THRESHOLD && (i === 0 || skills[i - 1].mastery <= s.mastery);
          if (!sane) check(`student ${id.slice(0, 8)} skill ${s.skill_id} is unmastered and in order`, false);
        }
      } catch (err) {
        check(`student ${id.slice(0, 8)} loads`, false, err instanceof Error ? err.message : String(err));
      }
    }
    console.log(`  ${students.length} students with graded work; ${flagged} have skills that need improvement`);
    check('every student loads', failures === 0);
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} CHECK(S) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
