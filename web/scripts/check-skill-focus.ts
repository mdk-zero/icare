/**
 * Behavioural checks for app/lib/skill-focus.ts: which skills the mobile
 * Library lists under "Needs improvement".
 *
 * The rules are small but easy to get backwards — the quiz cutoff, N/A being
 * no evidence, only the latest result deciding — so the pure core is checked
 * on synthetic results, then every student with graded work is run through
 * the loader against the real database (read-only) for a sanity pass.
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
  judgeSkills,
  loadSkillFocus,
  quizEvidence,
  type SkillEvidence,
} from '../app/lib/skill-focus';
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

  console.log('\n=== only the latest result decides ===');
  const judge = (entries: Record<string, (SkillEvidence | null)[]>) =>
    judgeSkills(new Map(Object.entries(entries).map(([k, v]) => [k, v.filter((e): e is SkillEvidence => !!e)])));
  {
    const r = judge({ '1-1': [quiz('2026-10-01', 4, 10), rated('2026-10-05', 'excellent')] });
    check('a later good result clears a skill', r.length === 0);
  }
  {
    const r = judge({ '1-1': [rated('2026-10-01', 'excellent'), quiz('2026-10-05', 4, 10)] });
    check('a later weak result flags it again', r.length === 1 && r[0].evidence.length === 1);
  }
  {
    const r = judge({
      '1-1': [quiz('2026-09-01', 4, 10), rated('2026-09-10', 'satisfactory'), quiz('2026-10-01', 5, 10), rated('2026-10-03', 'needs_practice')],
    });
    check(
      'evidence is every weak result since the last good one, newest first',
      r[0]?.evidence.map((e) => e.at).join() === '2026-10-03,2026-10-01',
    );
  }
  {
    const r = judge({
      '1-1': [quiz('2026-09-01', 4, 10)],
      '2-3': [rated('2026-10-02', 'needs_practice')],
      '3-1': [quiz('2026-10-01', 9, 10)],
    });
    check('newest-flagged skill first, good skills left out', r.map((s) => s.skillId).join() === '2-3,1-1');
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
    const prompt = buildSkillTipsPrompt(
      [
        {
          skill_id: '1-7',
          title: 'Assessing Brachial Artery Blood Pressure',
          chapter: 1,
          area: 'Vital Signs',
          evidence: [rated('2026-10-03', 'needs_practice')!, quiz('2026-10-01', 2, 3)],
          quiz_ids: [],
        },
      ],
      new Map([['1-7', 'Accurate blood pressure.']]),
    );
    check('the prompt names the steps and the quiz score', prompt.includes('"Step 1"') && prompt.includes('67%'));
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
        for (const s of skills) {
          const sane =
            s.evidence.length > 0 &&
            s.evidence.every((e) => e.weak) &&
            s.evidence.every((e) => (e.kind === 'quiz' ? (e.score ?? 100) < QUIZ_NEEDS_IMPROVEMENT_BELOW : e.needs_practice.length > 0));
          if (!sane) check(`student ${id.slice(0, 8)} skill ${s.skill_id} evidence is all weak`, false);
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
