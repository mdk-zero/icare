/**
 * The grading split (migration 067): how an instructor divides a course's
 * grade into weighted parts ("Written Exams 30%"), with checklist items
 * filed straight under a part. Each item takes a share of its part's
 * percent: an even share by default, or one the instructor sets
 * (item_weights), which must add up to the part.
 *
 * Splits saved before items had their own share used components
 * ("Midterm 15%") inside a part. readStoredSplit turns those into item
 * shares (a component's percent divided among its items), so the grade
 * comes out the same and the next save stores the new shape. This
 * module is pure — no server imports — so the API routes, the course pages
 * and the in-browser demo all judge a split and work out grades the same
 * way.
 *
 * Grades are never stored. They come from the ItemProgress evaluate()
 * already gives each item, so a regrade or an entered score moves the grade
 * straight away.
 */

import { entryMode, type ItemProgress, type Parsed, type RequirementRow } from './course-progress';

export interface GradeComponent {
  id: string;
  name: string;
  /** Percent of the final grade, not of the part. */
  weight: number;
  /** Requirement ids filed here. */
  items: string[];
}

/** A part holds items itself only while it has no components. */
export interface GradePart extends GradeComponent {
  components: GradeComponent[];
  /**
   * Each item's share, as a percent of the final grade, adding up to the
   * part's weight. Absent: the part's percent is shared evenly.
   */
  item_weights?: Record<string, number>;
}

export interface GradingSplit {
  parts: GradePart[];
  /**
   * Made by the system from the course's activities (070), not by the
   * instructor: Patient Cases, Quizzes and Case Presentations, each the
   * average of its items, and the final grade the average of every item.
   * Part weights are then only each part's share of the items, for display.
   */
  auto?: boolean;
}

/** The parts of an automatic split, in order, and the activity each is made of. */
export const AUTO_PARTS = [
  { id: 'patient-cases', name: 'Patient Cases', type: 'scenario' },
  { id: 'quizzes', name: 'Quizzes', type: 'assessment' },
  { id: 'case-presentations', name: 'Case Presentations', type: 'case_presentation' },
] as const;

/**
 * The automatic split for a course whose items are its activities (070):
 * each item goes under its kind's part, and a part's weight is its share of
 * all the items, since every item counts the same.
 */
export function autoSplit(requirements: readonly Pick<RequirementRow, 'id' | 'activity_type'>[]): GradingSplit {
  const total = requirements.filter((r) => AUTO_PARTS.some((p) => p.type === r.activity_type)).length;
  return {
    auto: true,
    parts: AUTO_PARTS.map((p) => {
      const items = requirements.filter((r) => r.activity_type === p.type).map((r) => r.id);
      return {
        id: p.id,
        name: p.name,
        weight: total ? Math.round((items.length / total) * 10000) / 100 : 0,
        items,
        components: [],
      };
    }),
  };
}

export interface StudentGrade {
  /** The weighted grade so far, or null with nothing scored. */
  grade: number | null;
  /** Sum of the weights of leaves with a score: "85% of the grade scored so far". */
  scored_weight: number;
  parts: Record<string, number | null>;
  components: Record<string, number | null>;
}

export interface GradeResult {
  /** The stored split breaks a rule (its weights don't add up), so no grades are given. */
  invalid: boolean;
  grades: Record<string, StudentGrade>;
}

export const GRADING_LIMITS = { parts: 10, components: 10, name: 60 } as const;

/** Weights carry two decimals, so sums are compared in whole hundredths: 99.99 is not 100. */
const hundredths = (n: number) => Math.round(n * 100);
const MAX_ID = 64;

export const GRADING_ENDED_LOCK = 'This term has ended, so its grading split is locked. Scores can still be changed.';
export const GRADING_NEEDS_MIGRATION = 'The grading split needs database migration 067 (course grading) applied first.';
export const EXAMS_NEED_MIGRATION = 'Written Exams need database migration 067 (course grading) applied first.';
export const GRADING_CHANGED = 'The grading split changed since you opened it. Reload to see the latest.';

/** Attendance (activities attended) has no score, so it can't count toward a grade. */
export function isGradeable(req: Pick<RequirementRow, 'kind' | 'activity_type'>): boolean {
  return entryMode(req) === 'score';
}

/** The score an item adds to its component: a count's average, otherwise the best score. */
export function itemScore(req: RequirementRow, item: ItemProgress | undefined): number | null {
  if (!item || !isGradeable(req)) return null;
  return req.kind === 'count' ? item.avg_score : item.best_score;
}

const leavesOf = (split: GradingSplit): GradeComponent[] =>
  split.parts.flatMap((p) => (p.components.length ? p.components : [p]));

const percent = (n: number) => `${Math.round(n * 100) / 100}%`;
const sum = (rows: { weight: number }[]) => rows.reduce((total, r) => total + r.weight, 0);

/** The first rule a split breaks, or null. Checks the split alone, not which items exist. */
export function splitProblem(split: GradingSplit): string | null {
  // The system made it, so there is nothing for the instructor to get wrong.
  if (split.auto) return null;
  const { parts } = split;
  if (parts.length > GRADING_LIMITS.parts) return `A split can have at most ${GRADING_LIMITS.parts} parts`;
  for (const p of parts) {
    if (p.components.length > GRADING_LIMITS.components) {
      return `"${p.name}" can have at most ${GRADING_LIMITS.components} components`;
    }
  }

  const named = parts.flatMap((p) => [p, ...p.components]);
  if (named.some((x) => !x.name.trim())) return 'Every part and component needs a name';
  if (named.some((x) => x.name.trim().length > GRADING_LIMITS.name)) {
    return `Names can be at most ${GRADING_LIMITS.name} characters`;
  }
  const repeated = (rows: GradeComponent[]) => {
    const seen = new Set<string>();
    for (const r of rows) {
      const key = r.name.trim().toLowerCase();
      if (seen.has(key)) return r.name.trim();
      seen.add(key);
    }
    return null;
  };
  const samePart = repeated(parts);
  if (samePart) return `Two parts are both called "${samePart}"`;
  for (const p of parts) {
    const same = repeated(p.components);
    if (same) return `Two components in "${p.name.trim()}" are both called "${same}"`;
  }

  const badWeight = named.find((x) => !(Number.isFinite(x.weight) && x.weight > 0 && x.weight <= 100));
  if (badWeight) {
    return badWeight.weight > 100
      ? `"${badWeight.name.trim()}" can be at most 100%`
      : `"${badWeight.name.trim()}" needs a percent above 0`;
  }
  const total = sum(parts);
  if (hundredths(total) !== 10000) return `The parts add up to ${percent(total)}, not 100%`;
  for (const p of parts) {
    if (!p.components.length) continue;
    const inside = sum(p.components);
    if (hundredths(inside) !== hundredths(p.weight)) {
      return `The components of "${p.name.trim()}" add up to ${percent(inside)}, not ${percent(p.weight)}`;
    }
  }

  for (const p of parts) {
    if (!p.item_weights) continue;
    const name = p.name.trim();
    if (p.components.length) return `"${name}" has components, so its items can't have their own percents`;
    const shares = p.item_weights;
    if (Object.keys(shares).length !== p.items.length || p.items.some((id) => !(id in shares))) {
      return `Every item in "${name}" needs a percent`;
    }
    const bad = p.items.find((id) => !(Number.isFinite(shares[id]) && shares[id] > 0 && shares[id] <= 100));
    if (bad !== undefined) return `Each item in "${name}" needs a percent above 0`;
    const inside = sum(p.items.map((id) => ({ weight: shares[id] })));
    if (hundredths(inside) !== hundredths(p.weight)) {
      return `The items in "${name}" add up to ${percent(inside)}, not ${percent(p.weight)}`;
    }
  }

  const split_ = parts.find((p) => p.components.length && p.items.length);
  if (split_) return `"${split_.name.trim()}" has components, so its items go in one of them`;
  const filed = leavesOf(split).flatMap((l) => l.items);
  if (new Set(filed).size !== filed.length) return 'An item is filed twice';
  const ids = named.map((x) => x.id);
  if (new Set(ids).size !== ids.length) return 'The split has a repeated id; reload and try again';
  return null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID;
const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** One part or component from a request body, or null when its shape is wrong. */
function readNode(value: unknown): GradeComponent | null {
  if (!isObject(value) || !isId(value.id) || typeof value.name !== 'string' || !isIdList(value.items)) return null;
  const weight = typeof value.weight === 'number' ? value.weight : Number(value.weight);
  return {
    id: value.id,
    name: value.name.trim(),
    weight: Number.isFinite(weight) ? Math.round(weight * 100) / 100 : NaN,
    items: [...value.items],
  };
}

/** A part's item_weights from a request or the database, or undefined when absent. */
function readItemWeights(raw: Record<string, unknown>): Record<string, number> | undefined {
  const value = raw.item_weights;
  if (!isObject(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [id, w] of Object.entries(value)) {
    const n = typeof w === 'number' ? w : Number(w);
    out[id] = Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }
  return out;
}

/** A part with its item shares set, or with the key left out for an even split. */
export function withItemWeights(part: GradePart, weights: Record<string, number> | null | undefined): GradePart {
  const rest: GradePart = { id: part.id, name: part.name, weight: part.weight, items: part.items, components: part.components };
  return weights ? { ...rest, item_weights: weights } : rest;
}

/**
 * The part's percent divided evenly among its items, to the hundredth, with
 * the last item taking the rounding so the shares still add up.
 */
export function evenShares(items: string[], weight: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!items.length || !Number.isFinite(weight)) return out;
  const each = Math.floor((weight / items.length) * 100) / 100;
  items.forEach((id, i) => {
    out[id] = i === items.length - 1 ? Math.round((weight - each * (items.length - 1)) * 100) / 100 : each;
  });
  return out;
}

/** Each item's share of the final grade in a part: the shares set, or an even split. */
export function itemShares(part: GradePart): Record<string, number> {
  return part.item_weights ?? evenShares(part.items, part.weight);
}

/**
 * A split with components turned into item shares: each component's
 * percent is divided evenly among its items, and the items move up into the
 * part. A component with no items has nothing to share its percent with, so
 * that part falls back to an even split of its whole percent.
 */
export function flattenSplit(split: GradingSplit): GradingSplit {
  return {
    parts: split.parts.map((p) => {
      if (!p.components.length) return p;
      const base: GradePart = { id: p.id, name: p.name, weight: p.weight, items: p.components.flatMap((c) => c.items), components: [] };
      if (p.components.some((c) => !c.items.length)) return base;
      const weights: Record<string, number> = {};
      for (const c of p.components) Object.assign(weights, evenShares(c.items, c.weight));
      return withItemWeights(base, weights);
    }),
  };
}

/**
 * Check a split sent by the Grading tab against the offering's checklist.
 * `{ parts: [] }` clears the split (null).
 */
export function parseGrading(body: unknown, requirements: readonly RequirementRow[]): Parsed<GradingSplit | null> {
  const invalid = { ok: false as const, error: 'Invalid grading split' };
  if (!isObject(body) || !Array.isArray(body.parts)) return invalid;
  const parts: GradePart[] = [];
  for (const raw of body.parts) {
    const part = readNode(raw);
    if (!part || !isObject(raw) || !Array.isArray(raw.components)) return invalid;
    const components: GradeComponent[] = [];
    for (const c of raw.components) {
      const component = readNode(c);
      if (!component) return invalid;
      components.push(component);
    }
    parts.push(withItemWeights({ ...part, components }, readItemWeights(raw)));
  }
  if (parts.length === 0) return { ok: true, value: null };

  const split: GradingSplit = { parts };
  const problem = splitProblem(split);
  if (problem) return { ok: false, error: problem };

  const byId = new Map(requirements.map((r) => [r.id, r]));
  const filed = leavesOf(split).flatMap((l) => l.items);
  if (filed.some((id) => !byId.has(id))) return { ok: false, error: "An item isn't on this checklist" };
  if (filed.some((id) => !isGradeable(byId.get(id)!))) {
    return { ok: false, error: "Attendance has no score, so it can't count toward the grade" };
  }
  return { ok: true, value: split };
}

/** A split as stored in course_offerings.grading, if it has the right shape. Its sums are not checked here. */
export function readStoredSplit(value: unknown): GradingSplit | null {
  if (!isObject(value) || !Array.isArray(value.parts)) return null;
  const parts: GradePart[] = [];
  for (const raw of value.parts) {
    const part = readNode(raw);
    if (!part || !isObject(raw) || !Array.isArray(raw.components)) return null;
    const components = raw.components.map(readNode);
    if (components.some((c) => c === null)) return null;
    parts.push(withItemWeights({ ...part, components: components as GradeComponent[] }, readItemWeights(raw)));
  }
  return parts.length ? flattenSplit({ parts }) : null;
}

const mean = (scores: (number | null)[]) => {
  const real = scores.filter((s): s is number => s !== null);
  return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
};

/** Weighted mean over the rows that have a score, rescaled over their weights. */
const weighted = (rows: { weight: number; score: number | null }[]) => {
  const scored = rows.filter((r): r is { weight: number; score: number } => r.score !== null);
  const total = sum(scored);
  return scored.length && total > 0 ? scored.reduce((acc, r) => acc + r.weight * r.score, 0) / total : null;
};

/**
 * Every student's grade under the split. Unscored work is left out, level by
 * level: an empty component drops out within its part, so the part keeps its
 * whole share once anything in it is scored, and an empty part drops out of
 * the whole. Ids no longer on the checklist are ignored.
 */
export function computeGrades(
  split: GradingSplit | null,
  requirements: readonly RequirementRow[],
  progress: Record<string, Record<string, ItemProgress>>,
): GradeResult {
  if (!split) return { invalid: false, grades: {} };
  if (splitProblem(split)) return { invalid: true, grades: {} };
  const byId = new Map(requirements.map((r) => [r.id, r]));
  if (split.auto) return autoGrades(split, byId, progress);

  const grades: Record<string, StudentGrade> = {};
  for (const [studentId, row] of Object.entries(progress)) {
    const leaf = (items: string[]) =>
      mean(items.map((id) => byId.get(id)).filter((r): r is RequirementRow => !!r).map((r) => itemScore(r, row[r.id])));
    const parts: Record<string, number | null> = {};
    const components: Record<string, number | null> = {};
    let scoredWeight = 0;
    for (const p of split.parts) {
      if (p.components.length) {
        for (const c of p.components) {
          components[c.id] = leaf(c.items);
          if (components[c.id] !== null) scoredWeight += c.weight;
        }
        parts[p.id] = weighted(p.components.map((c) => ({ weight: c.weight, score: components[c.id] })));
      } else if (p.item_weights) {
        const shares = p.item_weights;
        const rows = p.items
          .map((id) => byId.get(id))
          .filter((r): r is RequirementRow => !!r)
          .map((r) => ({ weight: shares[r.id] ?? 0, score: itemScore(r, row[r.id]) }));
        parts[p.id] = weighted(rows);
        for (const r of rows) if (r.score !== null) scoredWeight += r.weight;
      } else {
        parts[p.id] = leaf(p.items);
        if (parts[p.id] !== null) scoredWeight += p.weight;
      }
    }
    grades[studentId] = {
      grade: weighted(split.parts.map((p) => ({ weight: p.weight, score: parts[p.id] }))),
      scored_weight: Math.round(scoredWeight * 100) / 100,
      parts,
      components,
    };
  }
  return { invalid: false, grades };
}

/**
 * Grades under an automatic split: each part is the plain average of its
 * scored items, and the final grade the average of every scored item, so a
 * part with more items counts for more. Unscored items are left out, so a
 * grade reads as the grade so far; scored_weight is the share of items with
 * a score.
 */
function autoGrades(
  split: GradingSplit,
  byId: Map<string, RequirementRow>,
  progress: Record<string, Record<string, ItemProgress>>,
): GradeResult {
  const ids = split.parts.flatMap((p) => p.items).filter((id) => byId.has(id));
  const grades: Record<string, StudentGrade> = {};
  for (const [studentId, row] of Object.entries(progress)) {
    const score = (id: string) => itemScore(byId.get(id)!, row[id]);
    const parts: Record<string, number | null> = {};
    for (const p of split.parts) parts[p.id] = mean(p.items.filter((id) => byId.has(id)).map(score));
    const scores = ids.map(score);
    const scored = scores.filter((s) => s !== null).length;
    grades[studentId] = {
      grade: mean(scores),
      scored_weight: ids.length ? Math.round((scored / ids.length) * 10000) / 100 : 0,
      parts,
      components: {},
    };
  }
  return { invalid: false, grades };
}

/** Where an item can be filed: "Written Exams › Midterm", or a part with no components. */
export function gradingLeaves(split: GradingSplit | null): { id: string; label: string }[] {
  if (!split) return [];
  return split.parts.flatMap((p) =>
    p.components.length ? p.components.map((c) => ({ id: c.id, label: `${p.name} › ${c.name}` })) : [{ id: p.id, label: p.name }],
  );
}

/** The leaf an item is filed under, or null. */
export function leafOf(split: GradingSplit | null, requirementId: string): string | null {
  if (!split) return null;
  return leavesOf(split).find((l) => l.items.includes(requirementId))?.id ?? null;
}

/** Why an item can't be filed under `leafId`, or null when it can. */
export function gradeLeafProblem(split: GradingSplit | null, leafId: string): string | null {
  const part = split?.parts.find((p) => p.id === leafId);
  if (part) return part.components.length ? `"${part.name}" has components; pick one of them` : null;
  if (split?.parts.some((p) => p.components.some((c) => c.id === leafId))) return null;
  return 'That grading component no longer exists. Reload and try again.';
}

/**
 * The split without ids no longer on the checklist. A save that removed an
 * item but not its id (a failed second write, two tabs racing) would
 * otherwise leave a split nothing can save.
 */
export function dropUnknown(split: GradingSplit | null, requirements: readonly RequirementRow[]): GradingSplit | null {
  if (!split) return null;
  const known = new Set(requirements.map((r) => r.id));
  return keepItems(split, (id) => known.has(id));
}

/**
 * The split with only the items `keep` accepts. A part that lost an item
 * goes back to an even split, since its set shares no longer add up.
 */
function keepItems(split: GradingSplit, keep: (id: string) => boolean): GradingSplit {
  return {
    parts: split.parts.map((p) => {
      const items = p.items.filter(keep);
      const next = { ...p, items, components: p.components.map((c) => ({ ...c, items: c.items.filter(keep) })) };
      return items.length === p.items.length ? next : withItemWeights(next, null);
    }),
  };
}

/**
 * The split with every item unfiled that is no longer on the checklist or can
 * no longer be graded (turned into attendance): what the item routes do to the
 * stored split when an item is removed or changed. Order and the rest stay.
 */
export function settle(split: GradingSplit | null, requirements: readonly RequirementRow[]): GradingSplit | null {
  if (!split) return null;
  const counts = new Set(requirements.filter(isGradeable).map((r) => r.id));
  return keepItems(split, (id) => counts.has(id));
}

/**
 * Whether a save's `base` still describes the stored split. It may match the
 * split as stored, or the split with removed and attendance items taken out
 * (what the Grading tab sends, see saveBase): an id left behind by a removed
 * item must never make the split impossible to save or clear.
 */
export function baseMatches(base: unknown, stored: GradingSplit | null, requirements: readonly RequirementRow[]): boolean {
  if (typeof base !== 'string') return false;
  return base === gradingSignature(stored) || base === gradingSignature(settle(stored, requirements));
}

/** The split with the item taken out of every leaf and, unless leafId is null, filed under leafId. */
export function fileItem(split: GradingSplit, requirementId: string, leafId: string | null): GradingSplit {
  // Already there: keep its place, and leave the split untouched.
  if (leafId !== null && leafOf(split, requirementId) === leafId) return split;
  const place = (node: GradeComponent) => {
    const items = node.items.filter((id) => id !== requirementId);
    return node.id === leafId ? [...items, requirementId] : items;
  };
  return {
    parts: split.parts.map((p) => {
      const items = p.components.length ? p.items.filter((id) => id !== requirementId) : place(p);
      const next = { ...p, items, components: p.components.map((c) => ({ ...c, items: place(c) })) };
      // A part that gained or lost an item goes back to an even split of its percent.
      const changed = items.length !== p.items.length || items.some((id, i) => id !== p.items[i]);
      return changed ? withItemWeights(next, null) : next;
    }),
  };
}

/**
 * Where an item goes after it is saved: attendance is always taken out, an
 * undefined leaf leaves it where it was, and otherwise it moves to leafId
 * (null: not counted).
 */
export function refile(split: GradingSplit, req: RequirementRow, leafId: string | null | undefined): GradingSplit {
  if (!isGradeable(req)) return fileItem(split, req.id, null);
  if (leafId === undefined) return split;
  return fileItem(split, req.id, leafId);
}

/** Add a component to a part. A part's first component takes over the items the part held itself. */
export function addComponent(split: GradingSplit, partId: string, component: GradeComponent): GradingSplit {
  return {
    parts: split.parts.map((p) => {
      if (p.id !== partId) return p;
      if (p.components.length) return { ...p, components: [...p.components, component] };
      return { ...p, items: [], components: [{ ...component, items: [...component.items, ...p.items] }] };
    }),
  };
}

/** The usual start: Written Exams 30% and Laboratory & Skills 70%, with no components yet. */
export function presetSplit(newId: () => string): GradingSplit {
  return {
    parts: [
      { id: newId(), name: 'Written Exams', weight: 30, items: [], components: [] },
      { id: newId(), name: 'Laboratory & Skills', weight: 70, items: [], components: [] },
    ],
  };
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
};

/**
 * A split's content as a string that ignores key order (jsonb reorders
 * keys), so the Grading tab can say which version its edits started from.
 */
export function gradingSignature(split: GradingSplit | null): string {
  return JSON.stringify(canonical(split ?? null));
}

/** For the audit log: "Written Exams 30% · Laboratory & Skills 70%", or "cleared". */
export function gradingSummary(split: GradingSplit | null): string {
  return split ? split.parts.map((p) => `${p.name} ${percent(p.weight)}`).join(' · ') : 'cleared';
}

/** A checklist item's "Counts toward" from a request: absent leaves it where it is, null or "" unfiles it. */
export function parseGradeLeaf(value: unknown): Parsed<string | null | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === '') return { ok: true, value: null };
  if (isId(value)) return { ok: true, value };
  return { ok: false, error: 'Choose what this counts toward' };
}

/** "82.3%": a grade to one decimal at most. */
export function formatGrade(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}
