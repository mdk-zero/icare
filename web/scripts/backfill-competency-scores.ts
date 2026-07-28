/**
 * Derive competency scores from assessment attempts submitted before the
 * roll-up existed.
 *
 * Attempts already stored their per-criterion breakdown in
 * `attempt_criteria_scores`; this turns each of those into `competency_scores`
 * rows with source='assessment' so the faculty competencies tab is populated
 * without waiting for students to sit new quizzes.
 *
 * Idempotent — an attempt that already has derived rows is skipped, so it is
 * safe to re-run.
 *
 *   npm run db:backfill-competencies            # apply
 *   npm run db:backfill-competencies -- --dry   # report only
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { deriveCompetencyScoresForAttempt } from '../app/lib/competency';

config({ path: '.env.local' });

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

  // Only attempts that actually produced a criteria breakdown can yield
  // competency scores.
  const { data: rows, error } = await supabase
    .from('attempt_criteria_scores')
    .select('attempt_id');
  if (error) {
    console.error('Failed to read attempt_criteria_scores:', error.message);
    process.exit(1);
  }

  const attemptIds = [...new Set((rows ?? []).map((r) => r.attempt_id))];
  console.log(`${attemptIds.length} attempt(s) with a criteria breakdown.`);

  if (dryRun) {
    const { count } = await supabase
      .from('competency_scores')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'assessment');
    console.log(`Dry run — ${count ?? 0} assessment-derived score(s) already exist. No writes.`);
    return;
  }

  let written = 0;
  let touched = 0;
  for (const attemptId of attemptIds) {
    const n = await deriveCompetencyScoresForAttempt(supabase, attemptId);
    if (n > 0) {
      touched += 1;
      written += n;
    }
  }

  console.log(
    `Done. Wrote ${written} competency score(s) across ${touched} attempt(s); ` +
      `${attemptIds.length - touched} already had scores or carried no usable evidence.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
