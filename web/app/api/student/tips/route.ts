import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { fetchTaskCompletions } from '@/app/lib/scenario-tasks';
import { isPerformed } from '@/app/lib/task-ratings';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';

/**
 * Short AI study tips for the scenarios a student currently has open.
 *
 * The mobile Tasks screen reads this on every mount, so the result is cached
 * in student_ai_tips (migration 025) against a fingerprint of the student's
 * assignment state. A call only reaches the model when that state changes or
 * the cached copy ages past TTL_HOURS — otherwise this is a single-row read.
 *
 * Like the other AI routes, the grounding data is gathered server-side from
 * the session's own rows: nothing about which scenarios to describe comes
 * from the caller.
 */

// A single generation plus the Gemini/OpenRouter fallback chain can outrun the
// default 10s budget; the students hitting this are on mobile networks.
export const maxDuration = 30;

const TTL_HOURS = 12;
const MAX_TIPS = 4;
const MAX_TITLE_CHARS = 60;
const MAX_TIP_CHARS = 180;
/** Enough history to colour the tips without bloating the prompt. */
const RECENT_COMPLETED = 5;

const OPEN_STATUSES = ['pending', 'in_progress', 'overdue'];

interface Tip {
  title: string;
  tip: string;
  scenario_title: string | null;
}

interface AssignmentRow {
  id: string;
  scenario_id: string;
  status: string;
  required: boolean;
  deadline: string | null;
  assigned_at: string;
  score: number | null;
  completed_at: string | null;
}

interface ScenarioRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  learning_objectives: unknown;
}

interface TaskRow {
  scenario_id: string;
  title: string;
  category: string;
}

/** Days until the deadline, or null when there isn't one. */
function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / 86_400_000);
}

function deadlineLabel(deadline: string | null): string {
  const days = daysUntil(deadline);
  if (days === null) return 'no deadline';
  if (days < 0) return `overdue by ${Math.abs(days)} day(s)`;
  if (days === 0) return 'due today';
  return `due in ${days} day(s)`;
}

function objectiveList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : [];
}

/**
 * Identifies the assignment state the tips describe. Anything that would make
 * the advice stale — a new assignment, a status change, a moved deadline, a
 * task getting checked off — has to be in here.
 */
function buildFingerprint(
  open: AssignmentRow[],
  completedCountByAssignment: Map<string, number>,
  completed: AssignmentRow[],
): string {
  const openPart = open
    .map((a) =>
      [a.id, a.status, a.deadline ?? '-', a.required ? 'req' : 'opt', completedCountByAssignment.get(a.id) ?? 0].join(
        ':',
      ),
    )
    .sort()
    .join('|');
  const donePart = completed
    .map((a) => `${a.id}:${a.score ?? '-'}`)
    .sort()
    .join('|');
  return createHash('sha1').update(`${openPart}#${donePart}`).digest('hex');
}

function buildPrompt(
  open: AssignmentRow[],
  scenariosById: Map<string, ScenarioRow>,
  tasksByScenario: Map<string, TaskRow[]>,
  completedCountByAssignment: Map<string, number>,
  completed: AssignmentRow[],
): string {
  const assignmentBlock = open
    .map((a) => {
      const scenario = scenariosById.get(a.scenario_id);
      const tasks = tasksByScenario.get(a.scenario_id) ?? [];
      const done = completedCountByAssignment.get(a.id) ?? 0;
      const objectives = objectiveList(scenario?.learning_objectives);


      const lines = [
        `- Patient Case: "${scenario?.title ?? 'Unknown patient case'}"`,
        `  Category: ${scenario?.category ?? 'unknown'}`,
        `  Status: ${a.status}, ${a.required ? 'required' : 'optional'}, ${deadlineLabel(a.deadline)}`,
        `  Task progress: ${done} of ${tasks.length} checked off`,
      ];
      if (scenario?.description) {
        lines.push(`  Description: ${scenario.description.slice(0, 400)}`);
      }
      if (objectives.length > 0) {
        lines.push(`  Learning objectives: ${objectives.slice(0, 5).join('; ')}`);
      }
      // Every task is rated in person by the instructor during RetDem.
      if (tasks.length > 0) {
        lines.push(
          `  Tasks the instructor rates as the student demonstrates them: ${tasks.map((t) => t.title).join('; ')}`,
        );
      }
      return lines.join('\n');
    })
    .join('\n\n');

  const scoredHistory = completed.filter((a) => typeof a.score === 'number');
  const historyBlock =
    scoredHistory.length > 0
      ? scoredHistory
          .map((a) => `- "${scenariosById.get(a.scenario_id)?.title ?? 'Unknown patient case'}": scored ${a.score}%`)
          .join('\n')
      : '(no patient cases finished and scored yet)';

  return `You are a clinical instructor coaching one nursing student through the patient cases currently assigned to them. Base every tip on the assignments below. Never invent a patient case, a task, a patient, or a score that is not listed.

Scenarios this student has open right now:

${assignmentBlock}

Scenarios this student has already completed:
${historyBlock}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "tips": [
    { "title": "string", "tip": "string", "scenario_title": "string or null" }
  ]
}

Guidelines:
- Return ${Math.min(MAX_TIPS, Math.max(2, open.length + 1))} tips, ordered most useful first.
- "title" is an imperative phrase of at most 5 words, e.g. "Rehearse your hand hygiene".
- "tip" is ONE sentence, at most 25 words, giving concrete clinical or workflow advice the student can act on today. Be specific to the patient case's category, objectives, and task list — never generic study advice like "review your notes".
- "scenario_title" must be copied exactly from one of the open patient cases above when the tip is about that patient case, or null when the tip spans several of them.
- Prioritise required patient cases and near or passed deadlines. Say plainly when something is overdue.
- At most one tip may be about workflow (deadlines, ordering what to practise); the rest must be clinical.
- If a past score is low, one tip may address that weakness, but only in terms of the patient cases listed above.
- Plain, encouraging, professional language for a student nurse. This is simulation training, so give no medical advice about real patients.`;
}

function sanitizeTips(generated: Record<string, unknown>, openTitles: Set<string>): Tip[] {
  const raw = Array.isArray(generated.tips) ? generated.tips : [];

  return raw
    .map((entry): Tip | null => {
      if (!entry || typeof entry !== 'object') return null;
      const { title, tip, scenario_title: scenarioTitle } = entry as Record<string, unknown>;
      if (typeof title !== 'string' || typeof tip !== 'string') return null;

      const cleanTitle = title.trim().slice(0, MAX_TITLE_CHARS);
      const cleanTip = tip.trim().slice(0, MAX_TIP_CHARS);
      if (!cleanTitle || !cleanTip) return null;

      // Only let through a scenario the student actually has open, so a
      // hallucinated title can't be rendered as one of their assignments.
      const cleanScenario =
        typeof scenarioTitle === 'string' && openTitles.has(scenarioTitle.trim())
          ? scenarioTitle.trim()
          : null;

      return { title: cleanTitle, tip: cleanTip, scenario_title: cleanScenario };
    })
    .filter((t): t is Tip => t !== null)
    .slice(0, MAX_TIPS);
}

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

    const { data: allAssignments, error: assignmentsError } = await supabase
      .from('scenario_assignments')
      .select('id, scenario_id, status, required, deadline, assigned_at, score, completed_at')
      .eq('student_id', session.uid)
      .order('assigned_at', { ascending: false });

    if (assignmentsError) {
      console.error('Failed to fetch assignments for tips', assignmentsError);
      return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
    }

    const assignments = (allAssignments ?? []) as AssignmentRow[];
    const open = assignments.filter((a) => OPEN_STATUSES.includes(a.status));

    // Nothing assigned: an AI call would only paraphrase "no tasks", so answer
    // directly rather than spending a request on it.
    if (open.length === 0) {
      return NextResponse.json({ tips: [], generated_at: null });
    }

    const completed = assignments.filter((a) => a.status === 'completed').slice(0, RECENT_COMPLETED);

    const scenarioIds = [...new Set([...open, ...completed].map((a) => a.scenario_id))];
    const openScenarioIds = [...new Set(open.map((a) => a.scenario_id))];
    const openAssignmentIds = open.map((a) => a.id);

    const [scenariosRes, tasksRes, completionsRes, cacheRes] = await Promise.all([
      supabase
        .from('scenarios')
        .select('id, title, description, category, learning_objectives')
        .in('id', scenarioIds),
      supabase
        .from('scenario_tasks')
        .select('scenario_id, title, category')
        .in('scenario_id', openScenarioIds)
        .order('sort_order', { ascending: true }),
      fetchTaskCompletions(supabase, openAssignmentIds).then(({ rows, error }) => ({
        data: rows,
        error,
      })),
      supabase
        .from('student_ai_tips')
        .select('tips, fingerprint, generated_at')
        .eq('student_id', session.uid)
        .maybeSingle(),
    ]);

    if (scenariosRes.error || tasksRes.error || completionsRes.error) {
      console.error(
        'Failed to fetch tip grounding data',
        scenariosRes.error,
        tasksRes.error,
        completionsRes.error,
      );
      return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
    }

    const scenariosById = new Map(((scenariosRes.data ?? []) as ScenarioRow[]).map((s) => [s.id, s]));

    const tasksByScenario = new Map<string, TaskRow[]>();
    for (const task of (tasksRes.data ?? []) as TaskRow[]) {
      const list = tasksByScenario.get(task.scenario_id) ?? [];
      list.push(task);
      tasksByScenario.set(task.scenario_id, list);
    }

    const completedCountByAssignment = new Map<string, number>();
    for (const row of (completionsRes.data ?? []).filter((c) => isPerformed(c))) {
      const id = row.assignment_id;
      completedCountByAssignment.set(id, (completedCountByAssignment.get(id) ?? 0) + 1);
    }

    cached = cacheRes.data ?? null;

    const fingerprint = buildFingerprint(open, completedCountByAssignment, completed);

    if (cached && cached.fingerprint === fingerprint) {
      const ageHours = (Date.now() - new Date(cached.generated_at).getTime()) / 3_600_000;
      if (ageHours < TTL_HOURS && Array.isArray(cached.tips) && cached.tips.length > 0) {
        return NextResponse.json({ tips: cached.tips, generated_at: cached.generated_at });
      }
    }

    const openTitles = new Set(
      open.map((a) => scenariosById.get(a.scenario_id)?.title).filter((t): t is string => Boolean(t)),
    );

    const generated = await callAI(
      buildPrompt(open, scenariosById, tasksByScenario, completedCountByAssignment, completed),
    );
    const tips = sanitizeTips(generated, openTitles);

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

    // Stale tips beat an error banner: the student's assignments have moved
    // on, but yesterday's advice about them is still worth reading.
    if (cached && Array.isArray(cached.tips) && cached.tips.length > 0) {
      return NextResponse.json({ tips: cached.tips, generated_at: cached.generated_at, stale: true });
    }

    const { error, status } = aiErrorResponse(err, 'tips');
    return NextResponse.json({ error }, { status });
  }
}
