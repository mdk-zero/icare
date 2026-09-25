import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import { getSkills, isSkillId, type SkillDetail } from '@/app/lib/taylor-skills';
import { ACTIVE_SKILL_AREA_IDS } from '@/scripts/taylors-chapters';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_QUESTIONS = 10;

interface GeneratedDraft {
  content: string;
  options: string[];
  correct_index: number;
  question_type: string;
  points: number;
  explanation: string;
  competency_ids: string[];
  /** Set when generated from a skill checklist: the criterion assessing that skill. */
  criteria_id?: string | null;
}

/**
 * Prompt for questions written from one Taylor's skill checklist. Each
 * question tests one numbered step, and its explanation opens by citing it,
 * the same convention the seeded skill assessments follow.
 */
function buildSkillPrompt(skill: SkillDetail, topic: string, count: number): string {
  const steps = skill.steps
    .map((st) => `${st.section ? `[${st.section}] ` : ''}Step ${st.stepNo}: ${st.text}`)
    .join('\n');
  return `You are a clinical nursing educator writing a skill assessment for nursing students. Every question must be answerable from this Taylor's skill checklist alone:

Skill ${skill.id}: ${skill.title}
Goal: ${skill.goal}
${steps}
${topic ? `\nFaculty focus request: "${topic.replace(/"/g, '\\"')}"\n` : ''}
Write exactly ${count} multiple-choice questions, each testing one step (or two adjacent steps) of the checklist above. Prefer steps that carry a specific technique, sequence, number, or safety check over generic steps like hand hygiene. Return ONLY a valid JSON object, no markdown:

{
  "questions": [
    {
      "content": "the question text",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_index": 0,
      "explanation": "Skill ${skill.id}, step N: what the checklist says, in one or two sentences"
    }
  ]
}

Rules:
- The correct option must be what the checklist says; distractors must be plausible but contradict it.
- Exactly 4 options; vary which index is correct.
- Every explanation MUST start with "Skill ${skill.id}, step " and the step number it comes from${skill.steps.some((st) => st.section) ? ' (name the variant for a variant step, e.g. "Skill 1-1, oral step 12")' : ''}.
- Never mention "the checklist" or "the book" in the question itself; write it as a clinical question.`;
}

function buildPrompt(
  assessment: { title: string; description: string; category: string; difficulty: string },
  competencyNames: string[],
  topic: string,
  count: number,
): string {
  return `You are a clinical nursing education expert writing exam questions for nursing students.

Assessment context:
- Title: ${assessment.title}
- Category: ${assessment.category}
- Difficulty: ${assessment.difficulty}${assessment.description ? `\n- Description: ${assessment.description}` : ''}${topic ? `\n- Faculty focus request: "${topic.replace(/"/g, '\\"')}"` : ''}

Write exactly ${count} multiple-choice questions. Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "questions": [
    {
      "content": "the question text",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_index": 0,
      "explanation": "why the correct answer is right",
      "competency": "one name from the competency list below, or null"
    }
  ]
}

Competency list: ${competencyNames.length > 0 ? competencyNames.join(', ') : '(none defined)'}

Guidelines:
- Questions must match the assessment's difficulty and category and be clinically accurate.
- Exactly 4 plausible options per question; only one is correct; correct_index is 0-based.
- Vary which option index is correct across questions.
- Explanations should teach, briefly citing the clinical rationale.
- Never invent competency names outside the provided list.`;
}

function sanitizeDrafts(
  input: Record<string, unknown>,
  competencies: { id: string; name: string }[],
): GeneratedDraft[] {
  const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
  const byName = new Map(competencies.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const drafts: GeneratedDraft[] = [];

  for (const raw of rawQuestions) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as Record<string, unknown>;
    const content = typeof q.content === 'string' ? q.content.trim() : '';
    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
      : [];
    const correctIndex = Number(q.correct_index);
    if (!content || options.length < 2) continue;
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      continue;
    }
    const competencyId =
      typeof q.competency === 'string'
        ? byName.get(q.competency.trim().toLowerCase())
        : undefined;

    drafts.push({
      content,
      options,
      correct_index: correctIndex,
      question_type: 'multiple_choice',
      points: 1,
      explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
      competency_ids: competencyId ? [competencyId] : [],
    });
  }

  return drafts.slice(0, MAX_QUESTIONS);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assessmentId } = await params;

  let body: { topic?: unknown; count?: unknown; skill_id?: unknown };
  try {
    body = (await request.json()) as { topic?: unknown; count?: unknown; skill_id?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const requested = Number(body.count);
  const count = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 1), MAX_QUESTIONS)
    : 5;

  try {
    const supabase = getSupabaseAdmin();

    const [{ data: assessment }, { data: competencies }] = await Promise.all([
      supabase
        .from('assessments')
        .select('title, description, category, difficulty')
        .eq('id', assessmentId)
        .maybeSingle(),
      supabase.from('competency_areas').select('id, name').in('id', [...ACTIVE_SKILL_AREA_IDS]).order('name'),
    ]);

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const competencyList = (competencies ?? []) as { id: string; name: string }[];

    // Written from one skill's checklist: every question cites its step, is
    // tagged with the skill's area, and goes to the criterion for that skill.
    if (isSkillId(body.skill_id)) {
      const [skill] = await getSkills(supabase, [body.skill_id]);
      const { data: criteria } = await supabase
        .from('assessment_criteria')
        .select('id, name')
        .eq('assessment_id', assessmentId);
      const criterion = (criteria ?? []).find((c) =>
        new RegExp(`^Skills? [^·]*\\b${skill.id.replace('-', '\\-')}\\b`).test(c.name as string),
      );
      const raw = await callAI(buildSkillPrompt(skill, topic, count));
      const citation = `Skill ${skill.id}`;
      const questions = sanitizeDrafts(raw, []).map((q) => ({
        ...q,
        explanation: q.explanation.startsWith(citation) ? q.explanation : `${citation}: ${q.explanation}`,
        competency_ids: [skill.chapterId],
        criteria_id: (criterion?.id as string | undefined) ?? null,
      }));
      if (questions.length === 0) {
        return NextResponse.json(
          { error: 'The AI response did not contain usable questions. Please try again.' },
          { status: 502 },
        );
      }
      return NextResponse.json({ questions });
    }

    const generated = await callAI(
      buildPrompt(
        assessment as { title: string; description: string; category: string; difficulty: string },
        competencyList.map((c) => c.name),
        topic,
        count,
      ),
    );

    const questions = sanitizeDrafts(generated, competencyList);
    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'The AI response did not contain usable questions. Please try again.' },
        { status: 502 },
      );
    }

    // Drafts only — nothing is persisted until faculty reviews and saves each one.
    return NextResponse.json({ questions });
  } catch (err) {
    console.error('Generate AI questions failed', err);
    const { error, status } = aiErrorResponse(err, 'questions');
    return NextResponse.json({ error }, { status });
  }
}
