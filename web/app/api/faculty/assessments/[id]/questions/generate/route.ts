import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';

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

  let body: { topic?: unknown; count?: unknown };
  try {
    body = (await request.json()) as { topic?: unknown; count?: unknown };
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
      supabase.from('competency_areas').select('id, name').order('name'),
    ]);

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const competencyList = (competencies ?? []) as { id: string; name: string }[];
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
