/**
 * Loads the Taylor's skills catalog (migration 045) from
 * scripts/data/taylor-skills.json — the skills of Chapters 1, 14 and 15 of Lynn & LeBon, "Skill
 * Checklists for Taylor's Clinical Nursing Skills" (3rd ed.), with every
 * checklist step word for word. extract-taylor-skills.ts produced the JSON
 * from the PDF in docs/.
 *
 * Safe to re-run. Skills upsert on their number and steps on (skill, position),
 * so a step keeps its id and any scenario sub-task linked to it stays linked.
 * Steps past a skill's new last position are deleted.
 *
 *   npx tsx scripts/seed-taylor-skills.ts
 *   npx tsx scripts/seed-taylor-skills.ts --check   (validate the JSON only)
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { TAYLORS_CHAPTERS } from './taylors-chapters';
import { validate, type ExtractedSkill } from './extract-taylor-skills';
import catalog from './data/taylor-skills.json';

config({ path: '.env.local' });

const skills = catalog as ExtractedSkill[];

async function main() {
  const problems = validate(skills);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const stepTotal = skills.reduce((n, s) => n + s.steps.length, 0);
  if (process.argv.includes('--check')) {
    console.log(`Catalog OK: ${skills.length} skills, ${stepTotal} steps. Nothing written.`);
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // The chapters must already be the skill areas 041 seeded, under the same ids.
  const { data: areas, error: areasError } = await supabase.from('competency_areas').select('id');
  if (areasError) {
    console.error('Failed to read competency_areas:', areasError.message);
    process.exit(1);
  }
  const areaIds = new Set((areas ?? []).map((a) => a.id));
  const missing = TAYLORS_CHAPTERS.filter((c) => !areaIds.has(c.id));
  if (missing.length > 0) {
    console.error(`competency_areas lacks ${missing.length} Taylor's chapters. Apply migration 041 first.`);
    process.exit(1);
  }

  const chapterId = new Map(TAYLORS_CHAPTERS.map((c) => [c.chapter, c.id]));
  const { error: skillError } = await supabase.from('taylor_skills').upsert(
    skills.map((s) => ({
      id: s.id,
      chapter_id: chapterId.get(s.chapter)!,
      chapter: s.chapter,
      number: s.number,
      title: s.title,
      goal: s.goal,
    })),
    { onConflict: 'id' },
  );
  if (skillError) {
    console.error('Failed to write skills (is migration 045 applied?):', skillError.message);
    process.exit(1);
  }

  for (const s of skills) {
    const rows = s.steps.map((st, i) => ({
      skill_id: s.id,
      position: i + 1,
      step_no: st.number,
      section: st.section,
      text: st.text,
    }));
    const { error } = await supabase.from('taylor_skill_steps').upsert(rows, { onConflict: 'skill_id,position' });
    if (error) {
      console.error(`Failed to write steps of Skill ${s.id}:`, error.message);
      process.exit(1);
    }
    const { error: pruneError } = await supabase
      .from('taylor_skill_steps')
      .delete()
      .eq('skill_id', s.id)
      .gt('position', rows.length);
    if (pruneError) {
      console.error(`Failed to prune steps of Skill ${s.id}:`, pruneError.message);
      process.exit(1);
    }
  }

  console.log(`Wrote ${skills.length} skills and ${stepTotal} steps.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
