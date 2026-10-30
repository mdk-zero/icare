import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import { focusFingerprint, loadSkillFocus } from '@/app/lib/skill-focus';
import { buildSkillTipsPrompt, sanitizeSkillTips } from '@/app/lib/skill-tips';
import { getSkills } from '@/app/lib/taylor-skills';

/**
 * Short AI study tips for the skills a student needs to improve on, shown in
 * the "Needs improvement" section of the mobile Library: one tip per skill,
 * grounded in the quiz scores and the Needs Practice ratings that flag it
 * (skill-focus.ts) and in Taylor's own goal for the skill.
 *
 * The Library reads this on every visit, so the result is cached in
 * student_ai_tips (migration 025) against a fingerprint of the focus list. A
 * call only reaches the model when that list changes or the cached copy ages
 * past TTL_HOURS — otherwise this is a single-row read.
 *
 * Like the other AI routes, the grounding data is gathered server-side from
 * the session's own rows: nothing about which skills to describe comes from
 * the caller.
 */

// A single generation plus the Gemini/OpenRouter fallback chain can outrun the
// default 10s budget; the students hitting this are on mobile networks.
export const maxDuration = 30;

const TTL_HOURS = 12;
/** One tip per skill, for the most recently flagged ones. */
const MAX_TIPS = 4;

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let cached: { tips: unknown; fingerprint: string; generated_at: string } | null = null;

  try {
    const supabase = getSupabaseAdmin();

    const skills = (await loadSkillFocus(supabase, session.uid)).slice(0, MAX_TIPS);

    // Nothing needs improvement: an AI call would only paraphrase "well done",
    // so answer directly rather than spending a request on it.
    if (skills.length === 0) {
      return NextResponse.json({ tips: [], generated_at: null });
    }

    const fingerprint = focusFingerprint(skills);
    const { data: cacheRow } = await supabase
      .from('student_ai_tips')
      .select('tips, fingerprint, generated_at')
      .eq('student_id', session.uid)
      .maybeSingle();
    cached = cacheRow ?? null;

    if (cached && cached.fingerprint === fingerprint) {
      const ageHours = (Date.now() - new Date(cached.generated_at).getTime()) / 3_600_000;
      if (ageHours < TTL_HOURS && Array.isArray(cached.tips) && cached.tips.length > 0) {
        return NextResponse.json({ tips: cached.tips, generated_at: cached.generated_at });
      }
    }

    const details = await getSkills(
      supabase,
      skills.map((s) => s.skill_id),
    );
    const goals = new Map(details.map((d) => [d.id, d.goal]));

    const generated = await callAI(buildSkillTipsPrompt(skills, goals));
    const tips = sanitizeSkillTips(generated, new Set(skills.map((s) => s.skill_id)), MAX_TIPS);

    if (tips.length === 0) {
      throw new Error('AI returned no usable tips');
    }

    const generatedAt = new Date().toISOString();
    const { error: upsertError } = await supabase
      .from('student_ai_tips')
      .upsert({ student_id: session.uid, tips, fingerprint, generated_at: generatedAt });

    // A failed write only costs the cache, not the response.
    if (upsertError) {
      console.error('Failed to cache student AI tips', upsertError);
    }

    return NextResponse.json({ tips, generated_at: generatedAt });
  } catch (err) {
    console.error('Generate student tips failed', err);

    // Stale tips beat an error banner, but only ones about skills: tips cached
    // before this route moved to the Library were about open patient cases.
    const staleTips = Array.isArray(cached?.tips)
      ? (cached.tips as Record<string, unknown>[]).filter((t) => typeof t?.skill_id === 'string')
      : [];
    if (cached && staleTips.length > 0) {
      return NextResponse.json({ tips: staleTips, generated_at: cached.generated_at, stale: true });
    }

    const { error, status } = aiErrorResponse(err, 'tips');
    return NextResponse.json({ error }, { status });
  }
}
