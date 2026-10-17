/**
 * Precomputes the demo's Return Demonstration tasks
 * (app/lib/demo/fixtures/return-demo-tasks.json): each one's Taylor's skills,
 * built into tasks and sub-tasks exactly as the app builds them. Re-run after
 * changing RETURN_DEMO_SPECS in return-demos-data.ts.
 *
 *   npx tsx scripts/demo-return-demo-tasks.ts
 */
import { writeFileSync } from 'node:fs';
import catalog from './data/taylor-skills.json';
import { skillTaskFields, skillTaskSteps } from '../app/lib/skill-tasks';
import { RETURN_DEMO_SPECS } from '../app/lib/demo/fixtures/return-demos-data';

type Skill = { id: string; title: string; goal: string; steps: { number: number; section: string | null; text: string }[] };
const SKILLS = new Map((catalog as Skill[]).map((s) => [s.id, s]));

const out = RETURN_DEMO_SPECS.map((spec) => ({
  title: spec.title,
  tasks: spec.skills.map((id) => {
    const skill = SKILLS.get(id)!;
    const steps = skill.steps.map((st, i) => ({ position: i + 1, stepNo: st.number, section: st.section, text: st.text }));
    return {
      skill_id: id,
      ...skillTaskFields(skill),
      steps: skillTaskSteps(id, steps).map((st, i) => ({ title: st.title, source: st.source, position: i + 1 })),
    };
  }),
}));

writeFileSync('app/lib/demo/fixtures/return-demo-tasks.json', JSON.stringify(out) + '\n');
console.log(`Wrote ${out.length} Return Demonstrations, ${out.reduce((n, d) => n + d.tasks.length, 0)} tasks`);
