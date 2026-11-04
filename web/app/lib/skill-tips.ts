import type { FocusSkill } from './skill-focus';
import type { MaterialBrief } from './library';
import type { StudyProfile } from './study-profile';

/**
 * The prompt and the output guard for the AI study tips in the mobile
 * Library (/api/student/tips): first an overall tip on what to study next,
 * then one tip per skill that needs improvement, each pointing the student to
 * that skill's Library materials. The tips are general: the student's overall
 * mastery and each weak skill, never which quiz, Patient Case or Return
 * Demonstration it came from. Pure, so the guard can be checked without
 * spending a model call.
 */

/** The skill_id the overall tip carries. */
export const OVERALL_TIP_ID = 'overall';

const MAX_TITLE_CHARS = 60;
const MAX_TIP_CHARS = 220;
/** Per skill, enough materials to choose from without bloating the prompt. */
const MAX_MATERIALS_PER_SKILL = 4;

const KIND_NOUN: Record<string, string> = { video: 'video', note: 'note', pdf: 'PDF', slides: 'slides', link: 'link' };

export interface SkillTip {
  title: string;
  tip: string;
  /** The skill this tip is about. */
  skill_id: string;
}

/** The student's overall standing, as the prompt describes it: mastery only, no sources. */
function overallBlock(p: StudyProfile): string {
  const lines = [
    `- Overall mastery: ${p.mastery === null ? 'not estimated yet' : `${Math.round(p.mastery * 100)}%`}, ${p.mastered} of ${p.skills} skills mastered`,
  ];
  if (p.chapters.length > 0) {
    lines.push(
      `- By chapter, weakest first: ${p.chapters
        .slice(0, 6)
        .map((c) => `Chapter ${c.chapter} ${c.area} ${Math.round(c.mastery * 100)}%`)
        .join('; ')}`,
    );
  }
  return lines.join('\n');
}

function materialLine(m: MaterialBrief): string {
  const about = m.description.trim().replace(/\s+/g, ' ').slice(0, 160);
  return `  - ${KIND_NOUN[m.kind] ?? m.kind} "${m.title}"${about ? `: ${about}` : ''}`;
}

export function buildSkillTipsPrompt(
  skills: FocusSkill[],
  goals: Map<string, string>,
  overall?: StudyProfile,
  materials: readonly MaterialBrief[] = [],
): string {
  const skillBlock = skills
    .map((s) => {
      const lines = [`- Skill ${s.skill_id} "${s.title}" (${s.area}), ${Math.round(s.mastery * 100)}% mastered`];
      const goal = goals.get(s.skill_id);
      if (goal) lines.push(`  Taylor's goal: ${goal.slice(0, 300)}`);
      const own = materials.filter((m) => m.skill_id === s.skill_id).slice(0, MAX_MATERIALS_PER_SKILL);
      lines.push(own.length ? `  Library materials:\n${own.map(materialLine).join('\n')}` : '  Library materials: none yet');
      return lines.join('\n');
    })
    .join('\n\n');

  const overallSection = overall
    ? `This student's overall standing:

${overallBlock(overall)}

`
    : '';

  return `You are a clinical instructor coaching one nursing student on the Taylor's skills they haven't mastered yet. Keep it general: talk about the skill and what to study, never about where the weakness showed (no quizzes, Patient Cases, Return Demonstrations, ratings or scores). Never invent a skill or a Library material that is not listed.

${overallSection}Skills to improve, least mastered first, with the Library materials the student can open for each:

${skillBlock}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "tips": [
    { "title": "string", "tip": "string", "skill_id": "string" }
  ]
}

Guidelines:
${
    overall
      ? `- First, one overall tip with "skill_id": "${OVERALL_TIP_ID}": what to study first and why, from the weakest skills and chapter above.
`
      : ''
  }- Then exactly one tip per skill listed, in the same order.
- "skill_id" is copied exactly from the skill the tip is about, e.g. "1-7".
- "title" is an imperative phrase of at most 5 words, e.g. "Watch the cuff video".
- "tip" is ONE or two sentences, at most 35 words. When the skill has Library materials, name the one to study by its title and say what to focus on in it; with none, give one concrete point of Taylor's technique to practise.
- Follow Taylor's technique for the skill; never generic study advice like "review your notes".
- Plain, encouraging, professional language for a student nurse. This is simulation training, so give no medical advice about real patients.`;
}

export function sanitizeSkillTips(
  generated: Record<string, unknown>,
  skillIds: ReadonlySet<string>,
  max: number,
): SkillTip[] {
  const raw = Array.isArray(generated.tips) ? generated.tips : [];
  const seen = new Set<string>();

  return raw
    .map((entry): SkillTip | null => {
      if (!entry || typeof entry !== 'object') return null;
      const { title, tip, skill_id: skillId } = entry as Record<string, unknown>;
      if (typeof title !== 'string' || typeof tip !== 'string' || typeof skillId !== 'string') return null;

      const cleanTitle = title.trim().slice(0, MAX_TITLE_CHARS);
      const cleanTip = tip.trim().slice(0, MAX_TIP_CHARS);
      const cleanSkill = skillId.trim().replace(/^Skill\s+/i, '');
      // Only a skill the student was actually flagged on (or the overall
      // tip), once: a hallucinated id can't be rendered under one of their skills.
      const known = skillIds.has(cleanSkill) || cleanSkill === OVERALL_TIP_ID;
      if (!cleanTitle || !cleanTip || !known || seen.has(cleanSkill)) return null;
      seen.add(cleanSkill);

      return { title: cleanTitle, tip: cleanTip, skill_id: cleanSkill };
    })
    .filter((t): t is SkillTip => t !== null)
    .slice(0, max);
}
