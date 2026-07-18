import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface QuizAttempt {
  quiz_title: string;
  score: number | null;
  submitted_at: string | null;
}

interface ScenarioRecord {
  scenario_title: string;
  status: string;
  score: number | null;
  completed_at: string | null;
}

interface CompetencyRecord {
  area: string;
  score: number;
  source: string | null;
  created_at: string;
}

interface PredictionRecord {
  risk: string;
  probability: number | null;
  explanations: unknown;
  predicted_at: string;
}

function buildPrompt(input: {
  name: string;
  quizAttempts: QuizAttempt[];
  scenarios: ScenarioRecord[];
  competencies: CompetencyRecord[];
  prediction: PredictionRecord | null;
}): string {
  const { name, quizAttempts, scenarios, competencies, prediction } = input;

  const quizBlock = quizAttempts.length > 0
    ? quizAttempts
        .map((a) => `- ${a.quiz_title}: ${a.score ?? 'ungraded'}%${a.submitted_at ? ` (${a.submitted_at.slice(0, 10)})` : ''}`)
        .join('\n')
    : '(no quiz attempts yet)';

  const scenarioBlock = scenarios.length > 0
    ? scenarios
        .map((s) => `- ${s.scenario_title} [${s.status}]${s.score != null ? `: ${s.score}%` : ''}${s.completed_at ? ` (${s.completed_at.slice(0, 10)})` : ''}`)
        .join('\n')
    : '(no scenario assignments yet)';

  const competencyBlock = competencies.length > 0
    ? competencies
        .map((c) => `- ${c.area}: ${c.score}%${c.source ? ` (source: ${c.source})` : ''} (${c.created_at.slice(0, 10)})`)
        .join('\n')
    : '(no validated competency scores yet)';

  const predictionBlock = prediction
    ? `Classification: ${prediction.risk === 'at_risk' ? 'AT RISK' : 'SAFE'}${prediction.probability != null ? ` (risk probability ${Math.round(prediction.probability * 100)}%)` : ''}, predicted ${prediction.predicted_at.slice(0, 10)}.\nTop factors: ${JSON.stringify(prediction.explanations)}`
    : '(no ML risk prediction yet)';

  return `You are a clinical nursing education expert. Write a concise performance summary of the nursing student "${name}" for their faculty instructor, based only on the data below.

Quiz attempts (newest first):
${quizBlock}

Simulation scenarios (newest first):
${scenarioBlock}

Faculty-validated competency scores (newest first, most recent per area listed first):
${competencyBlock}

ML at-risk prediction:
${predictionBlock}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "overview": "string",
  "strengths": ["string"],
  "areas_for_improvement": ["string"],
  "recommendations": ["string"]
}

Guidelines:
- "overview" is 2-4 sentences describing overall performance and engagement.
- Each array has 2-4 short, specific items grounded in the data above; never invent scores or activities.
- "recommendations" are concrete next steps the faculty member can take with this student.
- If there is little or no data, say so plainly in the overview and base recommendations on getting the student started.
- Plain, professional language for an educator audience; no medical advice about real patients.`;
}

function pickStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : [];
}

function sanitizeSummary(input: Record<string, unknown>): {
  overview: string;
  strengths: string[];
  areas_for_improvement: string[];
  recommendations: string[];
} {
  return {
    overview: typeof input.overview === 'string' ? input.overview : 'No summary available.',
    strengths: pickStringArray(input.strengths),
    areas_for_improvement: pickStringArray(input.areas_for_improvement),
    recommendations: pickStringArray(input.recommendations),
  };
}

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: student, error: studentError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', id)
      .eq('role', 'student')
      .maybeSingle();

    if (studentError) {
      console.error('Failed to fetch student for summary', studentError);
      return NextResponse.json({ error: 'Unable to fetch student' }, { status: 500 });
    }
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Faculty can only summarize students in their roster.
    if (session.role === 'faculty') {
      const { data: rosterRow } = await supabase
        .from('faculty_students')
        .select('id')
        .eq('faculty_id', session.uid)
        .eq('student_id', id)
        .maybeSingle();

      if (!rosterRow) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const [attemptsRes, assignmentsRes, scoresRes, predictionRes] = await Promise.all([
      supabase
        .from('assessment_attempts')
        .select('score, submitted_at, assessments(title)')
        .eq('student_id', id)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .limit(15),
      supabase
        .from('scenario_assignments')
        .select('scenario_id, status, score, completed_at')
        .eq('student_id', id)
        .order('assigned_at', { ascending: false })
        .limit(15),
      supabase
        .from('competency_scores')
        .select('score, source, created_at, competency_areas(name)')
        .eq('student_id', id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('performance_predictions')
        .select('risk, probability, explanations, predicted_at')
        .eq('student_id', id)
        .order('predicted_at', { ascending: false })
        .limit(1),
    ]);

    const quizAttempts: QuizAttempt[] = (attemptsRes.data ?? []).map((a) => ({
      quiz_title: (a.assessments as unknown as { title?: string } | null)?.title ?? 'Assessment',
      score: a.score !== null ? Math.round(Number(a.score)) : null,
      submitted_at: a.submitted_at,
    }));

    const scenarioIds = [...new Set((assignmentsRes.data ?? []).map((a) => a.scenario_id))];
    const scenarioTitles = new Map<string, string>();
    if (scenarioIds.length > 0) {
      const { data: scenarioRows } = await supabase
        .from('scenarios')
        .select('id, title')
        .in('id', scenarioIds);
      for (const row of scenarioRows ?? []) scenarioTitles.set(row.id, row.title);
    }

    const scenarios: ScenarioRecord[] = (assignmentsRes.data ?? []).map((a) => ({
      scenario_title: scenarioTitles.get(a.scenario_id) ?? 'Scenario',
      status: a.status,
      score: a.score !== null && a.score !== undefined ? Math.round(Number(a.score)) : null,
      completed_at: a.completed_at,
    }));

    const competencies: CompetencyRecord[] = (scoresRes.data ?? []).map((c) => ({
      area: (c.competency_areas as unknown as { name?: string } | null)?.name ?? 'Competency',
      score: Math.round(Number(c.score)),
      source: c.source,
      created_at: c.created_at,
    }));

    const predictionRow = predictionRes.data?.[0];
    const prediction: PredictionRecord | null = predictionRow
      ? {
          risk: predictionRow.risk,
          probability: predictionRow.probability,
          explanations: predictionRow.explanations,
          predicted_at: predictionRow.predicted_at,
        }
      : null;

    const generated = await callAI(
      buildPrompt({ name: student.name, quizAttempts, scenarios, competencies, prediction }),
    );
    const summary = sanitizeSummary(generated);

    return NextResponse.json({ summary, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('Generate student summary failed', err);
    const { error, status } = aiErrorResponse(err, 'summary');
    return NextResponse.json({ error }, { status });
  }
}
