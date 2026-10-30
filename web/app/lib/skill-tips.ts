import type { FocusSkill, SkillEvidence } from './skill-focus';
import { SCENARIO_KIND_NOUN } from './scenario-kind';

/**
 * The prompt and the output guard for the AI study tips in the mobile
 * Library (/api/student/tips): one tip per skill that needs improvement.
 * Pure, so the guard can be checked without spending a model call.
 */

const MAX_TITLE_CHARS = 60;
const MAX_TIP_CHARS = 220;
/** Enough of each result to aim the tip without bloating the prompt. */
const MAX_STEPS_PER_RESULT = 6;

export interface SkillTip {
  title: string;
  tip: string;
  /** The skill this tip is about. */
  skill_id: string;
}

function resultLine(e: SkillEvidence): string {
  if (e.kind === 'quiz') {
    return `  Quiz "${e.title}": ${Math.round(e.score ?? 0)}% on this skill's ${e.total} question(s)`;
  }
  const steps = e.needs_practice.slice(0, MAX_STEPS_PER_RESULT).map((s) => `"${s}"`).join('; ');
  return `  ${SCENARIO_KIND_NOUN[e.kind]} "${e.title}": rated Needs Practice on ${steps}`;
}

export function buildSkillTipsPrompt(skills: FocusSkill[], goals: Map<string, string>): string {
  const skillBlock = skills
    .map((s) => {
      const lines = [`- Skill ${s.skill_id} "${s.title}" (${s.area})`];
      const goal = goals.get(s.skill_id);
      if (goal) lines.push(`  Taylor's goal: ${goal.slice(0, 300)}`);
      lines.push(...s.evidence.slice(0, 3).map(resultLine));
      return lines.join('\n');
    })
    .join('\n\n');

  return `You are a clinical instructor coaching one nursing student on the Taylor's skills their recent results show they need to improve. Base every tip on the skills and results below. Never invent a skill, a step, a quiz, a patient case, or a score that is not listed.

Skills this student needs to improve, most recently flagged first:

${skillBlock}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "tips": [
    { "title": "string", "tip": "string", "skill_id": "string" }
  ]
}

Guidelines:
- Return exactly one tip per skill listed, in the same order.
- "skill_id" is copied exactly from the skill the tip is about, e.g. "1-7".
- "title" is an imperative phrase of at most 5 words, e.g. "Deflate the cuff slowly".
- "tip" is ONE or two sentences, at most 35 words, of concrete technique the student can practise today. When steps were rated Needs Practice, address those steps by what they involve; when only a quiz score is listed, address what the skill's questions test.
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
      // Only a skill the student was actually flagged on, once: a
      // hallucinated id can't be rendered under one of their skills.
      if (!cleanTitle || !cleanTip || !skillIds.has(cleanSkill) || seen.has(cleanSkill)) return null;
      seen.add(cleanSkill);

      return { title: cleanTitle, tip: cleanTip, skill_id: cleanSkill };
    })
    .filter((t): t is SkillTip => t !== null)
    .slice(0, max);
}
