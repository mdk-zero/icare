/**
 * Assign existing questions to criteria, and repair the attempt scores that
 * were computed before that link existed (migration 026, Phase 2).
 *
 * Before 026 a criterion found its questions indirectly, through a shared
 * competency_id. Any question tagged with two competencies therefore counted
 * toward every criterion sharing them, so criteria double-counted each other's
 * questions — in the worst case three criteria on one assessment all scored
 * against all ten questions and their 40/30/30 weights meant nothing.
 *
 * This does four things:
 *
 *   1. Gives every question a criteria_id. Where exactly one criterion claims
 *      a question that is unambiguous. Where several do, the questions sharing
 *      that same collision are split contiguously and evenly in position
 *      order — authoring order is the best evidence of intent we have, and it
 *      recovers the originally intended mapping on the seeded assessments.
 *   2. Sets assessments.total_questions to the current bank size, so selection
 *      keeps serving every question and behaviour is unchanged until faculty
 *      deliberately lower it.
 *   3. Records attempt_questions for past submitted attempts (they were served
 *      the whole bank), so grading has a served set to score against.
 *   4. Recomputes attempt_criteria_scores and competency_scores for those
 *      attempts against the corrected mapping, so the ML recommender stops
 *      reading weakness numbers produced by the double-counting.
 *
 * Every guess it makes is printed. Run --dry first and read the report.
 *
 *   npm run db:backfill-criteria -- --dry   # report only, no writes
 *   npm run db:backfill-criteria            # apply
 *
 * Idempotent: re-running assigns nothing new, skips attempts that already have
 * a served set, and recomputes scores to the same values.
 */
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { deriveCompetencyScoresForAttempt } from '../app/lib/competency';

config({ path: '.env.local' });

/**
 * An in_progress attempt older than this with nothing recorded is an artifact
 * of the quiz screen creating an attempt from a mount effect, not a real sitting.
 */
const ABANDONED_AFTER_HOURS = 24;

interface Criterion {
  id: string;
  name: string;
  weight: number;
  competency_id: string;
  sort_order: number;
}

interface Question {
  id: string;
  assessment_id: string;
  position: number;
  criteria_id: string | null;
}

type Origin = 'direct' | 'split' | 'rebalanced';

interface Assignment {
  questionId: string;
  criterionId: string;
  origin: Origin;
}

// ---------------------------------------------------------------
// Assignment planning (pure — no I/O, so the report is the same as the write)
// ---------------------------------------------------------------

/** n items across k buckets: base each, the first (n mod k) buckets get one extra. */
function splitSizes(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

function planAssignments(
  criteria: Criterion[],
  questions: Question[],
  competenciesByQuestion: Map<string, Set<string>>,
): { assignments: Assignment[]; unassigned: Question[]; notes: string[] } {
  const notes: string[] = [];
  const ordered = [...questions].sort((a, b) => a.position - b.position);

  // Which criteria could claim each question, under the old competency match.
  const candidates = new Map<string, Criterion[]>();
  for (const q of ordered) {
    const comps = competenciesByQuestion.get(q.id) ?? new Set<string>();
    candidates.set(
      q.id,
      criteria.filter((c) => comps.has(c.competency_id)),
    );
  }

  const unassigned = ordered.filter((q) => (candidates.get(q.id) ?? []).length === 0);
  const assignments: Assignment[] = [];

  // Group questions by the exact set of criteria competing for them, so a
  // collision is resolved once across all the questions it affects rather than
  // question by question.
  const groups = new Map<string, Question[]>();
  for (const q of ordered) {
    const matched = candidates.get(q.id) ?? [];
    if (matched.length === 0) continue;
    const key = matched
      .map((c) => c.id)
      .sort()
      .join('|');
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }

  for (const [key, groupQuestions] of groups) {
    const matched = key
      .split('|')
      .map((id) => criteria.find((c) => c.id === id)!)
      .sort((a, b) => a.sort_order - b.sort_order);

    if (matched.length === 1) {
      for (const q of groupQuestions) {
        assignments.push({ questionId: q.id, criterionId: matched[0].id, origin: 'direct' });
      }
      continue;
    }

    const sizes = splitSizes(groupQuestions.length, matched.length);
    let cursor = 0;
    matched.forEach((criterion, i) => {
      const slice = groupQuestions.slice(cursor, cursor + sizes[i]);
      cursor += sizes[i];
      for (const q of slice) {
        assignments.push({ questionId: q.id, criterionId: criterion.id, origin: 'split' });
      }
    });
    notes.push(
      `${groupQuestions.length} question(s) matched ${matched.length} criteria ` +
        `(${matched.map((c) => `"${c.name}"`).join(', ')}) — split ${sizes.join('/')} by position`,
    );
  }

  // A criterion left with nothing would block publishing and score as a
  // permanent 0. Pull one question back from whichever colliding criterion has
  // the most to spare.
  const countOf = (criterionId: string) =>
    assignments.filter((a) => a.criterionId === criterionId).length;

  for (const starved of criteria) {
    if (countOf(starved.id) > 0) continue;

    const reachable = assignments.filter((a) =>
      (candidates.get(a.questionId) ?? []).some((c) => c.id === starved.id),
    );
    if (reachable.length === 0) {
      notes.push(
        `! "${starved.name}" (weight ${starved.weight}) has no candidate questions at all — ` +
          `it needs questions authored or the criterion removed`,
      );
      continue;
    }

    // Take from the largest donor, and take its last question by position so
    // the donor keeps a contiguous run.
    const donorId = reachable
      .map((a) => a.criterionId)
      .reduce((best, id) => (countOf(id) > countOf(best) ? id : best), reachable[0].criterionId);
    if (countOf(donorId) <= 1) {
      notes.push(`! "${starved.name}" has no donor with a question to spare`);
      continue;
    }

    const donorQuestions = reachable
      .filter((a) => a.criterionId === donorId)
      .sort(
        (a, b) =>
          ordered.find((q) => q.id === a.questionId)!.position -
          ordered.find((q) => q.id === b.questionId)!.position,
      );
    const moved = donorQuestions[donorQuestions.length - 1];
    if (!moved) continue;

    moved.criterionId = starved.id;
    moved.origin = 'rebalanced';
    notes.push(
      `! "${starved.name}" would have had 0 questions; moved position ` +
        `${ordered.find((q) => q.id === moved.questionId)!.position} from ` +
        `"${criteria.find((c) => c.id === donorId)!.name}"`,
    );
  }

  return { assignments, unassigned, notes };
}

// ---------------------------------------------------------------

async function assertSchema(supabase: SupabaseClient) {
  const probes: [string, string][] = [
    ['questions', 'criteria_id'],
    ['assessments', 'total_questions'],
    ['assessments', 'max_attempts'],
    ['assessment_criteria', 'min_questions'],
    ['attempt_questions', 'id'],
  ];
  const missing: string[] = [];
  for (const [table, column] of probes) {
    const { error } = await supabase.from(table).select(column).limit(1);
    if (error) missing.push(`${table}.${column} (${error.message})`);
  }
  if (missing.length > 0) {
    console.error('Migration 026 does not appear to be applied. Missing:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error('\nApply web/supabase/migrations/026_adaptive_assessments.sql first.');
    process.exit(1);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await assertSchema(supabase);
  console.log(dryRun ? '=== DRY RUN — no writes ===\n' : '=== APPLYING ===\n');

  const [{ data: assessments }, { data: allCriteria }, { data: allQuestions }, { data: allQc }] =
    await Promise.all([
      supabase.from('assessments').select('id, title, is_published, total_questions').order('title'),
      supabase
        .from('assessment_criteria')
        .select('id, assessment_id, name, weight, competency_id, sort_order')
        .order('sort_order'),
      supabase.from('questions').select('id, assessment_id, position, criteria_id'),
      supabase.from('question_competencies').select('question_id, competency_id'),
    ]);

  const competenciesByQuestion = new Map<string, Set<string>>();
  for (const row of allQc ?? []) {
    const set = competenciesByQuestion.get(row.question_id) ?? new Set<string>();
    set.add(row.competency_id);
    competenciesByQuestion.set(row.question_id, set);
  }

  // ---------- 1 + 2: questions -> criteria, and the fixed paper size ----------
  let totalAssigned = 0;
  let totalUnassigned = 0;
  const questionCriteria = new Map<string, string>(); // question_id -> criteria_id

  for (const assessment of assessments ?? []) {
    const criteria = (allCriteria ?? []).filter(
      (c) => c.assessment_id === assessment.id,
    ) as Criterion[];
    const questions = (allQuestions ?? []).filter(
      (q) => q.assessment_id === assessment.id,
    ) as Question[];

    console.log(
      `=== ${assessment.is_published ? 'PUBLISHED' : 'draft'} "${assessment.title}" ` +
        `(${questions.length} questions, ${criteria.length} criteria) ===`,
    );

    if (criteria.length === 0) {
      console.log('  ! no criteria defined — every question left unassigned\n');
      totalUnassigned += questions.length;
      continue;
    }

    const { assignments, unassigned, notes } = planAssignments(
      criteria,
      questions,
      competenciesByQuestion,
    );

    const positionOf = new Map(questions.map((q) => [q.id, q.position]));
    for (const criterion of criteria) {
      const mine = assignments
        .filter((a) => a.criterionId === criterion.id)
        .sort((a, b) => positionOf.get(a.questionId)! - positionOf.get(b.questionId)!);
      const origins = new Set(mine.map((a) => a.origin));
      const tag = origins.has('rebalanced')
        ? 'moved '
        : origins.has('split')
          ? 'split '
          : 'direct';
      console.log(
        `  [${tag}] "${criterion.name}" w=${criterion.weight}  ${String(mine.length).padStart(2)} question(s)  ` +
          `pos ${mine.map((a) => positionOf.get(a.questionId)).join(',') || '—'}`,
      );
    }
    for (const note of notes) console.log(`    ${note}`);
    if (unassigned.length > 0) {
      console.log(
        `    ! ${unassigned.length} question(s) unassigned (pos ${unassigned
          .map((q) => q.position)
          .join(',')}) — no criterion's competency matches; publishing will be blocked until faculty assign them`,
      );
    }

    const targetTotal = questions.length;
    console.log(
      `    total_questions: ${assessment.total_questions ?? 'null'} -> ${targetTotal}` +
        (assessment.total_questions === targetTotal ? ' (unchanged)' : ''),
    );

    for (const a of assignments) questionCriteria.set(a.questionId, a.criterionId);
    totalAssigned += assignments.length;
    totalUnassigned += unassigned.length;

    if (!dryRun) {
      // One update per criterion rather than per question.
      const byCriterion = new Map<string, string[]>();
      for (const a of assignments) {
        byCriterion.set(a.criterionId, [...(byCriterion.get(a.criterionId) ?? []), a.questionId]);
      }
      for (const [criterionId, questionIds] of byCriterion) {
        const { error } = await supabase
          .from('questions')
          .update({ criteria_id: criterionId })
          .in('id', questionIds);
        if (error) throw new Error(`Failed to assign criteria: ${error.message}`);
      }
      const { error: totalError } = await supabase
        .from('assessments')
        .update({ total_questions: targetTotal })
        .eq('id', assessment.id);
      if (totalError) throw new Error(`Failed to set total_questions: ${totalError.message}`);
    }
    console.log('');
  }

  console.log(`Questions assigned: ${totalAssigned}, left unassigned: ${totalUnassigned}\n`);

  // ---------- 3: abandoned attempts ----------
  const { data: attempts } = await supabase
    .from('assessment_attempts')
    .select('id, assessment_id, student_id, status, started_at')
    .order('started_at');

  const cutoff = Date.now() - ABANDONED_AFTER_HOURS * 3_600_000;
  const abandoned: typeof attempts = [];
  for (const attempt of attempts ?? []) {
    if (attempt.status !== 'in_progress') continue;
    if (new Date(attempt.started_at).getTime() >= cutoff) continue;
    const { count } = await supabase
      .from('attempt_answers')
      .select('question_id', { count: 'exact', head: true })
      .eq('attempt_id', attempt.id);
    if ((count ?? 0) === 0) abandoned.push(attempt);
  }

  console.log('=== abandoned in_progress attempts ===');
  if (abandoned.length === 0) {
    console.log('  none\n');
  } else {
    for (const attempt of abandoned) {
      const ageDays = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 86_400_000);
      console.log(
        `  delete attempt ${attempt.id.slice(0, 8)} student=${attempt.student_id.slice(0, 8)} ` +
          `started=${attempt.started_at.slice(0, 10)} (${ageDays}d old, 0 answers)`,
      );
    }
    // Deleted rather than expired: these are artifacts of the quiz screen
    // starting an attempt from a mount effect, and 'expired' will count
    // against the student's retry limit once Phase 4 enforces it.
    console.log('  (deleted, not expired — expired attempts consume a retry)\n');
    if (!dryRun) {
      const { error } = await supabase
        .from('assessment_attempts')
        .delete()
        .in(
          'id',
          abandoned.map((a) => a.id),
        );
      if (error) throw new Error(`Failed to delete abandoned attempts: ${error.message}`);
    }
  }

  // ---------- 4: served sets + recomputed scores ----------
  const submitted = (attempts ?? []).filter((a) => a.status === 'submitted');
  console.log(`=== ${submitted.length} submitted attempt(s) ===`);

  for (const attempt of submitted) {
    const [{ data: answers }, { data: served }] = await Promise.all([
      supabase
        .from('attempt_answers')
        .select('question_id, is_correct')
        .eq('attempt_id', attempt.id),
      supabase.from('attempt_questions').select('question_id').eq('attempt_id', attempt.id),
    ]);

    const positionOf = new Map((allQuestions ?? []).map((q) => [q.id, q.position]));
    const answered = (answers ?? [])
      .filter((a) => positionOf.has(a.question_id))
      .sort((a, b) => positionOf.get(a.question_id)! - positionOf.get(b.question_id)!);

    if (answered.length === 0) {
      console.log(`  ${attempt.id.slice(0, 8)}: no answers, skipped`);
      continue;
    }

    const needsServedSet = (served ?? []).length === 0;
    console.log(
      `  ${attempt.id.slice(0, 8)}: ${answered.length} answers, served set ` +
        (needsServedSet ? 'to write' : 'already present'),
    );

    if (!dryRun && needsServedSet) {
      // position is a fresh 0-based index, not questions.position — that column
      // comes from a row count and can repeat, which would trip the
      // (attempt_id, position) unique constraint.
      const rows = answered.map((a, index) => ({
        attempt_id: attempt.id,
        question_id: a.question_id,
        criteria_id: questionCriteria.get(a.question_id) ?? null,
        position: index,
      }));
      const { error } = await supabase.from('attempt_questions').insert(rows);
      if (error) throw new Error(`Failed to write attempt_questions: ${error.message}`);
    }

    // Recompute the criteria breakdown from the served set.
    const criteria = (allCriteria ?? []).filter(
      (c) => c.assessment_id === attempt.assessment_id,
    ) as Criterion[];
    const correctByQuestion = new Map((answers ?? []).map((a) => [a.question_id, a.is_correct]));

    const breakdown = criteria.map((criterion) => {
      const mine = answered.filter((a) => questionCriteria.get(a.question_id) === criterion.id);
      const total = mine.length;
      const correct = mine.filter((a) => correctByQuestion.get(a.question_id)).length;
      const score = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;
      return {
        attempt_id: attempt.id,
        criteria_id: criterion.id,
        competency_id: criterion.competency_id,
        criteria_name: criterion.name,
        weight: criterion.weight,
        correct,
        total,
        score,
        weighted_score: Math.round(score * (Number(criterion.weight) / 100) * 100) / 100,
      };
    });

    for (const row of breakdown) {
      console.log(
        `      "${row.criteria_name}": ${row.correct}/${row.total} = ${row.score}%` +
          (row.total === 0 ? '   (no questions — carries no evidence)' : ''),
      );
    }

    if (!dryRun) {
      // Replace rather than merge: the old rows were computed by competency
      // matching and can name totals that no longer exist. Scoped to
      // source='assessment' so a faculty validation can never be caught by it.
      await supabase
        .from('competency_scores')
        .delete()
        .eq('attempt_id', attempt.id)
        .eq('source', 'assessment');
      await supabase.from('attempt_criteria_scores').delete().eq('attempt_id', attempt.id);
      const { error } = await supabase.from('attempt_criteria_scores').insert(breakdown);
      if (error) throw new Error(`Failed to write criteria scores: ${error.message}`);
      const written = await deriveCompetencyScoresForAttempt(supabase, attempt.id);
      console.log(`      -> ${written} competency score(s) derived`);
    }
  }

  console.log(
    dryRun
      ? '\nDry run complete. Re-run without --dry to apply.'
      : '\nDone.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
