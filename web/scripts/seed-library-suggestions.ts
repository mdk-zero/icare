/**
 * Loads the curated YouTube skill demos (library_suggestions, migration 061)
 * from scripts/data/library-suggestions.json. Instructors see them under each
 * skill in the Library and publish the ones they want; students never see a
 * suggestion itself.
 *
 * Every video is re-checked with YouTube's oEmbed endpoint before it is
 * written: one that was removed, made private, or had embedding turned off
 * can't play in the app, so it is skipped and reported. Titles and channels
 * are refreshed from the same response.
 *
 * Safe to re-run: rows upsert on (skill, video). A suggestion no longer in the
 * JSON is deleted; materials already published from it are separate rows and
 * stay.
 *
 *   npx tsx scripts/seed-library-suggestions.ts
 *   npx tsx scripts/seed-library-suggestions.ts --check   (verify only, write nothing)
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import catalog from './data/library-suggestions.json';
import skills from './data/taylor-skills.json';
import { verifyYouTube } from '../app/lib/library';

config({ path: '.env.local' });

interface Suggestion {
  skill_id: string;
  youtube_id: string;
  title: string;
  channel: string;
}

async function main() {
  const known = new Set((skills as { id: string }[]).map((s) => s.id));
  const entries = catalog as Suggestion[];
  const unknown = entries.filter((e) => !known.has(e.skill_id));
  if (unknown.length > 0) {
    console.error(`Not in the skills catalog: ${unknown.map((e) => e.skill_id).join(', ')}`);
    process.exit(1);
  }

  const verified: (Suggestion & { sort_order: number })[] = [];
  const dropped: string[] = [];
  const order = new Map<string, number>();
  for (const e of entries) {
    const info = await verifyYouTube(e.youtube_id);
    if (!info) {
      dropped.push(`${e.skill_id} ${e.youtube_id} (${e.title})`);
      continue;
    }
    const n = order.get(e.skill_id) ?? 0;
    order.set(e.skill_id, n + 1);
    verified.push({ ...e, title: info.title || e.title, channel: info.channel || e.channel, sort_order: n });
  }

  const covered = new Set(verified.map((v) => v.skill_id));
  const bare = [...known].filter((id) => !covered.has(id));
  console.log(`${verified.length} of ${entries.length} videos playable, covering ${covered.size} of ${known.size} skills.`);
  if (dropped.length) console.log(`Skipped (unavailable or not embeddable):\n  ${dropped.join('\n  ')}`);
  if (bare.length) console.log(`No suggestion for: ${bare.join(', ')}`);
  if (process.argv.includes('--check')) {
    console.log('Nothing written.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { error } = await supabase.from('library_suggestions').upsert(verified, { onConflict: 'skill_id,youtube_id' });
  if (error) {
    console.error('Failed to write library_suggestions:', error.message);
    if (error.code === 'PGRST205' || error.code === '42P01') console.error('Apply migration 061 first.');
    process.exit(1);
  }

  const { data: existing } = await supabase.from('library_suggestions').select('id, skill_id, youtube_id');
  const keep = new Set(verified.map((v) => `${v.skill_id}|${v.youtube_id}`));
  const stale = (existing ?? []).filter((r) => !keep.has(`${r.skill_id}|${r.youtube_id}`)).map((r) => r.id as string);
  if (stale.length) {
    const { error: delError } = await supabase.from('library_suggestions').delete().in('id', stale);
    if (delError) console.error('Failed to remove old suggestions:', delError.message);
  }
  console.log(`Wrote ${verified.length} suggestions${stale.length ? `, removed ${stale.length} old ones` : ''}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
