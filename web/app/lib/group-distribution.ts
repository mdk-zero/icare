/**
 * Giving a group its cases: every member gets one scenario of their own, no
 * two members of the group share one, and nobody is handed a case they have
 * already had. Each scenario has its own patient, so a different case is a
 * different patient too.
 *
 * It is a bipartite matching (members to cases) solved with augmenting paths.
 * Groups and case lists are small, so this is instant. The result is
 * deterministic for the same input, which keeps a preview and the real assign
 * in agreement.
 */

export interface DistributionResult {
  /** member id → scenario id, for everyone who could be placed. */
  assignment: Map<string, string>;
  /** Members left without a case. */
  unplaced: string[];
}

/**
 * @param members the group's student ids, in a stable order
 * @param scenarioIds the pool of cases to hand out, in the faculty's order
 * @param history member id → scenario ids they already have
 */
export function distributeCases(
  members: readonly string[],
  scenarioIds: readonly string[],
  history: ReadonlyMap<string, ReadonlySet<string>>,
): DistributionResult {
  const pool = [...new Set(scenarioIds)];
  const options = new Map<string, string[]>();
  for (const member of members) {
    const had = history.get(member);
    options.set(member, pool.filter((s) => !had?.has(s)));
  }

  const caseOwner = new Map<string, string>();
  const tryPlace = (member: string, seen: Set<string>): boolean => {
    for (const scenario of options.get(member) ?? []) {
      if (seen.has(scenario)) continue;
      seen.add(scenario);
      const owner = caseOwner.get(scenario);
      if (owner === undefined || tryPlace(owner, seen)) {
        caseOwner.set(scenario, member);
        return true;
      }
    }
    return false;
  };

  // Members with the fewest options go first, so the greedy start leaves
  // augmenting paths less to fix. Ties keep the given order.
  const order = [...members].sort(
    (a, b) => (options.get(a)?.length ?? 0) - (options.get(b)?.length ?? 0),
  );
  const unplaced: string[] = [];
  for (const member of order) {
    if (!tryPlace(member, new Set())) unplaced.push(member);
  }

  const assignment = new Map<string, string>();
  for (const [scenario, member] of caseOwner) assignment.set(member, scenario);
  return { assignment, unplaced: members.filter((m) => unplaced.includes(m)) };
}
