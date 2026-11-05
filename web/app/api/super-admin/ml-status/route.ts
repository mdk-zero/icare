import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingMigration, requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { countSources, type BktSource } from '@/app/lib/bkt';

/**
 * The models the ML service has registered as active, which of them issued the
 * latest low-performing flag (the ML service switches on its own, so that can
 * be either at-risk kind), and how the last whole-cohort run left the BKT fit
 * (bkt_parameters, 084). `bkt` is null before 084.
 */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;

  const supabase = getSupabaseAdmin();
  const [models, fits, latest] = await Promise.all([
    supabase.from('ml_models').select('id, kind, name, version, is_baseline, metrics').eq('status', 'active'),
    supabase.from('bkt_parameters').select('source, answers, fitted_at'),
    supabase.from('performance_predictions').select('model_id').order('predicted_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (models.error) {
    console.error('Failed to read the model registry', models.error);
    return NextResponse.json({ error: 'Unable to read the model registry' }, { status: 500 });
  }
  if (fits.error && !isMissingMigration(fits.error)) {
    console.error('Failed to read the BKT parameters', fits.error);
  }

  const rows = fits.error ? null : ((fits.data ?? []) as { source: BktSource; answers: number; fitted_at: string }[]);
  return NextResponse.json({
    models: models.data ?? [],
    in_use_model_id: latest.data?.model_id ?? null,
    bkt: rows && {
      skills: rows.length,
      ...countSources(rows),
      answers: rows.reduce((sum, r) => sum + r.answers, 0),
      fitted_at: rows.reduce<string | null>((latest, r) => (latest && latest > r.fitted_at ? latest : r.fitted_at), null),
    },
  });
}
