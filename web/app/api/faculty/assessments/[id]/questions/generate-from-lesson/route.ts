import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import { readLessonUpload } from '@/app/lib/ai/lesson';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_QUESTIONS = 20;

type QuestionType = 'multiple_choice' | 'short_answer';

interface GeneratedDraft {
  content: string;
  options: string[];
  correct_index: number;
  question_type: QuestionType;
  points: number;
  explanation: string;
  competency_ids: string[];
  criteria_id: string | null;
}

function buildPrompt(
  assessment: { title: string; description: string; category: string; difficulty: string },
  competencyNames: string[],
  lessonText: string,
  questionTypes: QuestionType[],
  count: number,
): string {
  const wantsMC = questionTypes.includes('multiple_choice');
  const wantsSA = questionTypes.includes('short_answer');
  const typeInstruction =
    wantsMC && wantsSA
      ? `Write a mix of multiple-choice and identification (short-answer) questions, roughly split evenly, totaling exactly ${count} questions.`
      : wantsSA
        ? `Write exactly ${count} identification (short-answer) questions.`
        : `Write exactly ${count} multiple-choice questions.`;

  return `You are a clinical nursing education expert writing exam questions for nursing students. You must write every question strictly from the lesson material below — never use outside knowledge, and never invent a fact, number, or term that is not present in the lesson. If the lesson does not contain enough distinct material for ${count} good questions, write as many as the material genuinely supports rather than padding with invented content.

Assessment context:
- Title: ${assessment.title}
- Category: ${assessment.category}
- Difficulty: ${assessment.difficulty}

Lesson material (this is the ONLY source you may draw questions from):
"""
${lessonText}
"""

${typeInstruction}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "questions": [
    {
      "question_type": "multiple_choice",
      "content": "the question text",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_index": 0,
      "expected_answer": "",
      "explanation": "why the correct answer is right, citing the lesson",
      "competency": "one name from the competency list below, or null"
    }
  ]
}

For an identification/short-answer question, use "question_type": "short_answer", set "options" to an empty array, "correct_index" to 0, and put the single expected answer in "expected_answer".

Competency list: ${competencyNames.length > 0 ? competencyNames.join(', ') : '(none defined)'}

Guidelines:
- Every question must be answerable strictly from the lesson material above.
- For multiple_choice: exactly 4 plausible options, only one correct, correct_index is 0-based; vary which option is correct across questions.
- For short_answer: "expected_answer" is the single correct term/phrase; restate it inside "explanation" too (e.g. "Expected answer: X — ...").
- Questions must match the assessment's difficulty and category and be clinically accurate.
- The "competency" field is REQUIRED on every question — always pick the single closest-matching name from the competency list above. Only use null if the list is empty. Never invent a name outside the provided list.`;
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
    if (!content) continue;

    const competencyId =
      typeof q.competency === 'string' ? byName.get(q.competency.trim().toLowerCase()) : undefined;

    if (q.question_type === 'short_answer') {
      const expected = typeof q.expected_answer === 'string' ? q.expected_answer.trim() : '';
      const explanation = typeof q.explanation === 'string' ? q.explanation.trim() : '';
      const mentionsExpected = expected && explanation.toLowerCase().includes(expected.toLowerCase());
      drafts.push({
        content,
        options: [],
        correct_index: 0,
        question_type: 'short_answer',
        points: 1,
        explanation:
          expected && !mentionsExpected
            ? `Expected answer: ${expected}${explanation ? ` — ${explanation}` : ''}`
            : explanation || (expected ? `Expected answer: ${expected}` : ''),
        competency_ids: competencyId ? [competencyId] : [],
        criteria_id: null,
      });
      continue;
    }

    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
      : [];
    const correctIndex = Number(q.correct_index);
    if (
      options.length < 2 ||
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex >= options.length
    ) {
      continue;
    }

    drafts.push({
      content,
      options,
      correct_index: correctIndex,
      question_type: 'multiple_choice',
      points: 1,
      explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
      competency_ids: competencyId ? [competencyId] : [],
      criteria_id: null,
    });
  }

  return drafts.slice(0, MAX_QUESTIONS);
}

/**
 * A generated question is useless sitting unassigned — it is never served
 * (see assessment-validation.ts). Rather than leave that for the faculty
 * member to notice and fix by hand, a criterion is created for any generated
 * competency this assessment doesn't already have one for, and every
 * question is wired straight to it.
 *
 * Weights: an assessment starting from zero criteria gets a clean 100% split
 * across whatever's created here — nothing to disturb. One that already has
 * criteria keeps their weights untouched (rebalancing a faculty member's
 * existing weighting scheme without being asked is not this route's call);
 * new ones land at a modest default and the existing "weights must total
 * 100%" publish check surfaces the rebalance that's now needed.
 */
async function ensureCriteriaForCompetencies(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  assessmentId: string,
  neededCompetencyIds: string[],
  competencyNameById: Map<string, string>,
): Promise<Map<string, string>> {
  const byCompetency = new Map<string, string>(); // competency_id -> criteria_id
  if (neededCompetencyIds.length === 0) return byCompetency;

  const { data: existing, error } = await supabase
    .from('assessment_criteria')
    .select('id, competency_id, weight, sort_order')
    .eq('assessment_id', assessmentId);
  if (error) {
    console.error('Failed to read existing criteria', error);
    return byCompetency;
  }

  const existingCriteria = existing ?? [];
  for (const c of existingCriteria) {
    if (c.competency_id) byCompetency.set(c.competency_id, c.id);
  }

  const toCreate = Array.from(new Set(neededCompetencyIds)).filter((id) => !byCompetency.has(id));
  if (toCreate.length === 0) return byCompetency;

  const startingFromZero = existingCriteria.length === 0;
  const evenWeight = Math.floor(100 / toCreate.length);
  const weightFor = (index: number) =>
    startingFromZero
      ? index === toCreate.length - 1
        ? 100 - evenWeight * (toCreate.length - 1) // last one absorbs the rounding remainder
        : evenWeight
      : 10;

  const maxSortOrder = existingCriteria.reduce((max, c) => Math.max(max, c.sort_order ?? 0), -1);

  const rows = toCreate.map((competencyId, index) => ({
    assessment_id: assessmentId,
    name: competencyNameById.get(competencyId) ?? 'Generated criterion',
    weight: weightFor(index),
    competency_id: competencyId,
    sort_order: maxSortOrder + 1 + index,
    min_questions: 1,
  }));

  const { data: created, error: insertError } = await supabase
    .from('assessment_criteria')
    .insert(rows)
    .select('id, competency_id');
  if (insertError) {
    console.error('Failed to auto-create criteria for generated questions', insertError);
    return byCompetency;
  }

  for (const c of created ?? []) {
    if (c.competency_id) byCompetency.set(c.competency_id, c.id);
  }
  return byCompetency;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assessmentId } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'A lesson file is required' }, { status: 400 });
  }
  const lesson = await readLessonUpload(file);
  if ('error' in lesson) {
    return NextResponse.json({ error: lesson.error }, { status: lesson.status });
  }

  const rawTypes = String(formData.get('questionTypes') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is QuestionType => t === 'multiple_choice' || t === 'short_answer');
  const questionTypes: QuestionType[] =
    rawTypes.length > 0 ? Array.from(new Set(rawTypes)) : ['multiple_choice'];

  const requestedCount = Number(formData.get('count'));
  const count = Number.isInteger(requestedCount)
    ? Math.min(Math.max(requestedCount, 1), MAX_QUESTIONS)
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
        lesson.text,
        questionTypes,
        count,
      ),
    );

    const questions = sanitizeDrafts(generated, competencyList);
    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'The AI response did not contain usable questions from this lesson. Please try again.' },
        { status: 502 },
      );
    }

    // Wire each question to a criterion for its competency, creating one if
    // this assessment doesn't already have it — see ensureCriteriaForCompetencies.
    const neededCompetencyIds = questions
      .map((q) => q.competency_ids[0])
      .filter((id): id is string => Boolean(id));
    const competencyNameById = new Map(competencyList.map((c) => [c.id, c.name]));
    const criteriaByCompetency = await ensureCriteriaForCompetencies(
      supabase,
      assessmentId,
      neededCompetencyIds,
      competencyNameById,
    );
    for (const q of questions) {
      const competencyId = q.competency_ids[0];
      q.criteria_id = competencyId ? (criteriaByCompetency.get(competencyId) ?? null) : null;
    }

    if (formData.get('save') !== 'true') {
      return NextResponse.json({ questions });
    }

    const { count: existingCount } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId);

    const { data: inserted, error: insertError } = await supabase
      .from('questions')
      .insert(
        questions.map((q, i) => ({
          assessment_id: assessmentId,
          position: (existingCount ?? 0) + i,
          content: q.content,
          options: q.options,
          correct_index: q.correct_index,
          question_type: q.question_type,
          points: q.points,
          explanation: q.explanation,
          criteria_id: q.criteria_id,
        })),
      )
      .select('id');
    if (insertError || !inserted) {
      console.error('Failed to save generated questions', insertError);
      return NextResponse.json({ error: 'Unable to save the generated questions' }, { status: 500 });
    }

    const tags = inserted.flatMap((row, i) =>
      questions[i].competency_ids.map((competency_id) => ({ question_id: row.id, competency_id })),
    );
    if (tags.length > 0) {
      const { error: tagError } = await supabase.from('question_competencies').insert(tags);
      if (tagError) console.error('Failed to tag generated question competencies', tagError);
    }

    // Serve every generated question per attempt unless faculty already chose a number.
    const { error: totalError } = await supabase
      .from('assessments')
      .update({ total_questions: (existingCount ?? 0) + inserted.length })
      .eq('id', assessmentId)
      .is('total_questions', null);
    if (totalError) console.error('Failed to set questions per attempt', totalError);

    return NextResponse.json({ questions, saved: inserted.length });
  } catch (err) {
    console.error('Generate questions from lesson failed', err);
    const { error, status } = aiErrorResponse(err, 'questions');
    return NextResponse.json({ error }, { status });
  }
}
