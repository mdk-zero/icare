import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * What a scenario is (migration 072). A Patient Case is built on a patient;
 * a Return Demonstration is the same Taylor's skill checklist with no
 * patient and no story. Both live in `scenarios` and share its tasks,
 * assignments and grading, so screens that mean one of them filter by kind.
 *
 * Before 072 there is no kind column, and every scenario is a Patient Case:
 * the helpers here answer that way, so Patient Case screens keep working on
 * a deploy that goes out before the migration.
 */
export type ScenarioKind = 'patient_case' | 'return_demo';

export const SCENARIO_KIND_NOUN: Record<ScenarioKind, string> = {
  patient_case: 'Patient Case',
  return_demo: 'Return Demonstration',
};

/** Where space is short: attendance rows, the mobile Home, the Overview. */
export const SCENARIO_KIND_SHORT: Record<ScenarioKind, string> = {
  patient_case: 'Patient Case',
  return_demo: 'Return Demo',
};

export const RETURN_DEMOS_NEED_MIGRATION = 'Return Demonstrations need database migration 072 applied first.';

/** A `?kind=` query value: Return Demonstrations, both, or (by default) Patient Cases. */
export function kindParam(value: string | null): ScenarioKind | 'all' {
  return value === 'return_demo' || value === 'all' ? value : 'patient_case';
}

/** No kind column yet: 42703 from Postgres, PGRST204 from PostgREST. */
export function isMissingKindColumn(error: { code?: string } | null): boolean {
  return !!error && (error.code === '42703' || error.code === 'PGRST204');
}

/** Whether 072 is applied, so Return Demonstrations can be written. */
export async function scenarioKindsReady(supabase: Supabase): Promise<boolean> {
  const { error } = await supabase.from('scenarios').select('kind').limit(1);
  if (!error) return true;
  if (isMissingKindColumn(error)) return false;
  throw new Error(`Unable to read scenarios: ${error.message}`);
}

const CHUNK = 300;

/** Scenario id -> kind. Every id is a Patient Case before 072; ids not found are left out. */
export async function scenarioKinds(supabase: Supabase, ids: readonly string[]): Promise<Map<string, ScenarioKind>> {
  const kinds = new Map<string, ScenarioKind>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const part = unique.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('scenarios').select('id, kind').in('id', part);
    if (error) {
      if (!isMissingKindColumn(error)) throw new Error(`Unable to read scenario kinds: ${error.message}`);
      for (const id of unique) kinds.set(id, 'patient_case');
      return kinds;
    }
    for (const row of (data ?? []) as { id: string; kind: string | null }[]) {
      kinds.set(row.id, row.kind === 'return_demo' ? 'return_demo' : 'patient_case');
    }
  }
  return kinds;
}

/** A scenario's kind; one the map doesn't know (deleted, or unread) is a Patient Case. */
export function kindOf(kinds: ReadonlyMap<string, ScenarioKind>, scenarioId: string): ScenarioKind {
  return kinds.get(scenarioId) ?? 'patient_case';
}

/** Whether one scenario is a Return Demonstration; Patient Case routes refuse those. */
export async function isReturnDemo(supabase: Supabase, scenarioId: string): Promise<boolean> {
  return kindOf(await scenarioKinds(supabase, [scenarioId]), scenarioId) === 'return_demo';
}

/** The rows whose scenario is of the given kind ('all' keeps every row). */
export function ofKind<T>(
  rows: readonly T[],
  kinds: ReadonlyMap<string, ScenarioKind>,
  kind: ScenarioKind | 'all',
  scenarioIdOf: (row: T) => string,
): T[] {
  return kind === 'all' ? [...rows] : rows.filter((row) => kindOf(kinds, scenarioIdOf(row)) === kind);
}
