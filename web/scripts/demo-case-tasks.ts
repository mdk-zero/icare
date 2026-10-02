/**
 * Precomputes the demo's case tasks (app/lib/demo/fixtures/case-tasks.json):
 * each demo case's Taylor's skills, built into tasks and sub-tasks exactly as
 * the app builds them. Re-run after changing the cases in cases-data.ts.
 *
 *   npx tsx scripts/demo-case-tasks.ts
 */
import { writeFileSync } from 'node:fs';
import catalog from './data/taylor-skills.json';
import { skillTaskFields, skillTaskSteps } from '../app/lib/skill-tasks';
import { CASES } from '../app/lib/demo/fixtures/cases-data';

type Skill = { id: string; title: string; goal: string; steps: { number: number; section: string | null; text: string }[] };
const SKILLS = new Map((catalog as Skill[]).map((s) => [s.id, s]));

const out = CASES.map((c) => ({
  title: c.scenario.title,
  tasks: c.scenario.skills.map((pick) => {
    const id = typeof pick === 'string' ? pick : pick.id;
    const skill = SKILLS.get(id)!;
    const steps = skill.steps.map((st, i) => ({ position: i + 1, stepNo: st.number, section: st.section, text: st.text }));
    return {
      skill_id: id,
      ...skillTaskFields(skill),
      steps: skillTaskSteps(id, steps, typeof pick === 'string' ? undefined : pick.sections).map((st, i) => ({
        title: st.title,
        source: st.source,
        position: i + 1,
      })),
    };
  }),
}));

writeFileSync('app/lib/demo/fixtures/case-tasks.json', JSON.stringify(out) + '\n');
console.log(`Wrote ${out.length} cases, ${out.reduce((n, c) => n + c.tasks.length, 0)} tasks`);
