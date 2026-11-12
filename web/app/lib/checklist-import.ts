/**
 * A skills checklist the instructor brings as a file (PDF or Excel) instead
 * of picking Taylor's skills: the school's own evaluation tool, such as the
 * EINC or PhilPEN checklists. Read into rows the instructor checks and edits
 * before saving: section headings and numbered steps, in order.
 *
 * On a Return Demonstration each section becomes a task and its steps the
 * sub-tasks graded on the usual scale, so grading, the student's view and the
 * reports work as they do for skills. Steps before the first heading go in a
 * task named after the checklist.
 *
 * Pure, so the routes, the instructor form and the demo share it.
 */

export type ChecklistRowKind = 'section' | 'step';

export interface ChecklistRow {
  kind: ChecklistRowKind;
  text: string;
}

export interface ReadChecklist {
  /** A title the file suggests, e.g. "Essential Intrapartum Newborn Care"; empty when none stands out. */
  title: string;
  rows: ChecklistRow[];
}

export const CHECKLIST_LIMITS = {
  rows: 300,
  text: 600,
  /** Bytes; the upload route refuses anything bigger. */
  fileBytes: 10 * 1024 * 1024,
};

/** What the file picker offers. */
export const CHECKLIST_ACCEPT =
  '.pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Rows from a request body; blank and unknown rows are dropped, long ones cut. */
export function parseChecklistRows(value: unknown): ChecklistRow[] {
  if (!Array.isArray(value)) return [];
  const out: ChecklistRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { kind, text } = item as { kind?: unknown; text?: unknown };
    if ((kind !== 'section' && kind !== 'step') || typeof text !== 'string') continue;
    const tidy = clean(text).slice(0, CHECKLIST_LIMITS.text);
    if (tidy) out.push({ kind, text: tidy });
    if (out.length >= CHECKLIST_LIMITS.rows) break;
  }
  return out;
}

export const stepCount = (rows: readonly ChecklistRow[]) => rows.filter((r) => r.kind === 'step').length;

/**
 * The tasks a checklist becomes: one per section that has steps, in order.
 * Steps before the first heading go in one named `title`; a heading with no
 * steps under it is dropped.
 */
export function checklistTasks(rows: readonly ChecklistRow[], title: string): { title: string; steps: string[] }[] {
  const tasks: { title: string; steps: string[] }[] = [];
  let current: { title: string; steps: string[] } | null = null;
  for (const row of rows) {
    if (row.kind === 'section') {
      current = { title: row.text, steps: [] };
      tasks.push(current);
    } else {
      if (!current) {
        current = { title: title.trim() || 'Checklist', steps: [] };
        tasks.push(current);
      }
      current.steps.push(row.text);
    }
  }
  return tasks.filter((t) => t.steps.length > 0);
}

/** The rows a saved checklist reads back as, for editing it: each task a heading over its steps. */
export function checklistRowsFromTasks(tasks: readonly { title: string; step_titles?: readonly string[] }[]): ChecklistRow[] {
  return tasks.flatMap((t) => [
    { kind: 'section' as const, text: t.title },
    ...(t.step_titles ?? []).map((text) => ({ kind: 'step' as const, text })),
  ]);
}

// ---- reading a file's text

/** "1. Ensures…", "12) Asks…": the number and the rest. */
const NUMBERED = /^(\d{1,3})\s*[.)]\s+(\S.*)$/;
/** Column headings and form furniture, never a section. */
const FURNITURE =
  /^(procedures?|steps?|performance|remarks|score|scoring|criteria|rating|name|date|section|subject|evaluator|total|no\.?)\b/i;
/** Where the list ends: the total row, times and signatures. */
const END = /^(total\b|time started|student'?’?s signature|evaluator\b|_{4,})/i;
/** Letterhead lines that are never the checklist's title. */
const LETTERHEAD = /\b(republic|university|college|campus|department|school of|tel\.?\s*nos?|e-?mail|website)\b/i;

/** Mostly capital letters, like "PREPARING FOR DELIVERY" or "1-3 MINUTES". */
function isHeading(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3 || line.length > 90) return false;
  if (FURNITURE.test(line) || END.test(line)) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.85;
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

/** "ESSENTIAL INTRAPARTUM NEWBORN CARE" → "Essential Intrapartum Newborn Care"; mixed case is kept. */
export function titleFromCaps(text: string): string {
  const t = clean(text);
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * A checklist from a PDF's text, line by line. The list starts at the first
 * numbered step (with any heading right above it) and ends at the total or
 * signature lines; a line that is neither a step nor a heading continues the
 * step above it, since long steps wrap. The letterhead each page repeats is
 * skipped.
 */
export function checklistFromLines(lines: readonly string[]): ReadChecklist {
  const all = lines.map(clean).filter((l) => l && !/^--\s*\d+\s+of\s+\d+\s*--$/.test(l));
  const first = all.findIndex((l) => NUMBERED.test(l));
  if (first < 0) return { title: '', rows: [] };

  // The letterhead: everything above the list, which later pages repeat.
  let start = first;
  while (start > 0 && isHeading(all[start - 1])) start--;
  const header = new Set(all.slice(0, start));
  const title = [...all.slice(0, start)]
    .reverse()
    .find((l) => isHeading(l) && !LETTERHEAD.test(l) && l.split(' ').length >= 2);

  const rows: ChecklistRow[] = [];
  for (const line of all.slice(start)) {
    if (END.test(line)) break;
    if (header.has(line) || /\bpage \d+ of \d+\b/i.test(line)) continue;
    const numbered = NUMBERED.exec(line);
    if (numbered) rows.push({ kind: 'step', text: numbered[2] });
    else if (isHeading(line)) rows.push({ kind: 'section', text: line });
    else if (rows.length > 0 && rows[rows.length - 1].kind === 'step') {
      rows[rows.length - 1].text = `${rows[rows.length - 1].text} ${line}`;
    }
  }
  return { title: title ? titleFromCaps(title) : '', rows: parseChecklistRows(rows) };
}

/**
 * A checklist from a spreadsheet's rows (each a list of its non-empty cells'
 * text, left to right). A row with a number and text is a step; text alone in
 * capitals is a heading, otherwise a step; score columns (3 2 1) are ignored.
 * Reading starts below the "Procedure" heading row when there is one.
 */
export function checklistFromGrid(grid: readonly (readonly string[])[]): ReadChecklist {
  const rows: ChecklistRow[] = [];
  const cells = grid.map((r) => r.map(clean).filter(Boolean));
  const headerAt = cells.findIndex((r) => r.some((c) => /^(procedures?|steps?|performance criteria|tasks?)$/i.test(c)));
  const firstStep = cells.findIndex((r) => r.some((c) => c.length > 3 && !/^\d+$/.test(c)) && /^\d{1,3}\.?$/.test(r[0] ?? ''));
  const start = headerAt >= 0 ? headerAt + 1 : Math.max(0, firstStep);

  const above = cells.slice(0, start).flat();
  const titleCell = above.find((c) => c.length > 8 && !/:$/.test(c) && !FURNITURE.test(c) && !LETTERHEAD.test(c));
  // A cell's first line: the title row often carries a subtitle below it.
  const title = titleCell ? titleFromCaps((grid.flat().find((c) => clean(c) === titleCell) ?? titleCell).split('\n')[0]) : '';

  for (const r of cells.slice(start)) {
    const text = r.filter((c) => !/^\d{1,3}\.?$/.test(c)).sort((a, b) => b.length - a.length)[0];
    if (!text) continue;
    if (END.test(text) || r.some((c) => /^total( score)?$/i.test(c))) break;
    if (FURNITURE.test(text) && text.length < 30) continue;
    const step = text.replace(/^\|\s*/, '').replace(/^\d{1,3}\s*[.)]\s+/, '');
    const numbered = /^\d{1,3}\.?$/.test(r[0] ?? '') || NUMBERED.test(text);
    rows.push({ kind: !numbered && isHeading(step) ? 'section' : 'step', text: step });
  }
  return { title, rows: parseChecklistRows(rows) };
}
