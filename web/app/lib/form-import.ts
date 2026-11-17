import type { FormField, FormFieldType, FormOption, FormPageImage, FormSection, PagePlace } from './return-demo-forms';

/**
 * Reading an uploaded PDF form into a form the app can show (migration 095).
 * The server finds the text on each page with its position; this module
 * picks out the parts a person fills in (the ☐ boxes and the ____ blanks),
 * lays the page out as lines for the AI, and turns the AI's answer into
 * sections of fields whose places come from the boxes and blanks it found,
 * not from the model's guesses. Anything the model names that can't be
 * checked is dropped or left without a place.
 *
 * Pure, so it can be tested and the instructor's editor can reuse the rules.
 */

export const FORM_IMPORT_LIMITS = {
  pages: 4,
  fileBytes: 10 * 1024 * 1024,
  fields: 150,
  sections: 20,
  options: 12,
  label: 200,
};

export const FIELD_TYPES: readonly FormFieldType[] = ['text', 'longtext', 'number', 'date', 'bp', 'choice', 'multi'];

/** A run of text on a page, with its box in PDF points from the top left. */
export interface PageText {
  page: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A box to tick: where it is and the words after it ("Yes", "I don't know"). */
export interface FoundBox {
  id: string;
  page: number;
  x: number;
  y: number;
  size: number;
  label: string;
}

/** A blank to write on, and the words before it ("Weight (kg):"). */
export interface FoundBlank {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  label: string;
}

/**
 * Characters a printed box to tick comes out as: the Unicode boxes and
 * circles, Word's Wingdings boxes (private-use U+F06F, U+F071, U+F0A8,
 * U+F0FD, U+F0FE), and U+0000, which a PDF without a text mapping for its
 * symbol font gives (counted only when a word follows it).
 */
const BOX_GLYPHS = /[\u2610-\u2612\u25A1\u2751\u25FB\u25A2\u25CB\u25EF\uF06F\uF071\uF0A8\uF0FD\uF0FE\u0000]/;

/** The items on a page as lines, top to bottom, each item left to right. */
export function linesOf(items: readonly PageText[]): { page: number; y: number; items: PageText[] }[] {
  const lines: { page: number; y: number; items: PageText[] }[] = [];
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  for (const item of sorted) {
    const line = lines.find((l) => l.page === item.page && Math.abs(l.y - item.y) <= Math.max(2, item.h * 0.35));
    if (line) line.items.push(item);
    else lines.push({ page: item.page, y: item.y, items: [item] });
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * The boxes and blanks on the pages. A run's characters are taken as evenly
 * spaced across its width, which is close enough to put a tick on a box.
 */
export function findMarks(items: readonly PageText[]): { boxes: FoundBox[]; blanks: FoundBlank[] } {
  const boxes: FoundBox[] = [];
  const blanks: FoundBlank[] = [];
  for (const line of linesOf(items)) {
    const text = line.items.map((i) => i.str).join(' ');
    let offset = 0;
    for (const item of line.items) {
      const chars = [...item.str];
      const step = chars.length ? item.w / chars.length : 0;
      chars.forEach((ch, i) => {
        if (!BOX_GLYPHS.test(ch)) return;
        if (ch === '\u0000' && !/^\s*\p{L}/u.test(item.str.slice(i + 1))) return;
        const rest = item.str.slice(i + 1) + ' ' + text.slice(offset + item.str.length + 1);
        const label = rest.split(BOX_GLYPHS)[0].trim().slice(0, 60);
        boxes.push({ id: `B${boxes.length + 1}`, page: item.page, x: item.x + i * step, y: item.y, size: Math.max(step, item.h * 0.7), label });
      });
      for (const m of item.str.matchAll(/_{3,}/g)) {
        const before = (text.slice(0, offset) + item.str.slice(0, m.index)).replace(/_{3,}/g, ' ').trim();
        blanks.push({
          id: `U${blanks.length + 1}`,
          page: item.page,
          x: item.x + (m.index ?? 0) * step,
          y: item.y,
          w: m[0].length * step,
          label: before.split(/\s{2,}/).pop()?.slice(-60) ?? '',
        });
      }
      offset += item.str.length + 1;
    }
  }
  return { boxes, blanks };
}

/** The pages as the AI reads them: each line with its place, and the marks found. */
export function layoutForAi(
  pages: readonly { width: number; height: number }[],
  items: readonly PageText[],
  marks: { boxes: FoundBox[]; blanks: FoundBlank[] },
): string {
  const out: string[] = [];
  pages.forEach((p, n) => out.push(`Page ${n + 1}: ${Math.round(p.width)} x ${Math.round(p.height)} points.`));
  out.push('', 'Lines (page, y from top, then each run of text with its x):');
  for (const line of linesOf(items)) {
    out.push(`p${line.page + 1} y=${Math.round(line.y)}: ${line.items.map((i) => `[x=${Math.round(i.x)}] ${i.str.trim()}`).join('  ')}`);
  }
  out.push('', 'Boxes to tick (id, page, x, y, words after it):');
  for (const b of marks.boxes) out.push(`${b.id} p${b.page + 1} x=${Math.round(b.x)} y=${Math.round(b.y)} "${b.label}"`);
  out.push('', 'Blanks to write on (id, page, x, width, y, words before it):');
  for (const u of marks.blanks) out.push(`${u.id} p${u.page + 1} x=${Math.round(u.x)} w=${Math.round(u.w)} y=${Math.round(u.y)} "${u.label}"`);
  return out.join('\n');
}

export const FORM_IMPORT_PROMPT = `You read a printed form that a nursing student fills in during a skills demonstration, and list the things the student writes or ticks on it, grouped the way the form groups them.

Return JSON only, in this shape:
{"title": string, "description": string, "sections": [{"title": string, "fields": [Field]}]}

Field:
{"label": string, "type": "text" | "longtext" | "number" | "date" | "bp" | "choice" | "multi",
 "unit"?: string, "required"?: boolean,
 "blank"?: "U3",
 "cell"?: {"page": 1, "x": number, "y": number, "w": number},
 "options"?: [{"label": string, "box"?: "B7"}],
 "showIf"?: {"field": "<label of an earlier field>", "option": "<label of its option>"}}

Rules:
- One field per thing the student answers. Use the form's own wording for labels, in sentence case, without trailing colons.
- "choice" for a set of boxes where one is ticked (Yes / No / I don't know, Male / Female). "multi" for a set where several can be ticked. Give each option the id of its box.
- "number" for a measurement or count, with its unit ("kg", "cm", "years", "bpm", "°C", "%"). "bp" for a blood pressure reading like 120/80. "date" for a date. "longtext" for remarks or notes. Otherwise "text".
- A written answer goes on a blank when there is one: give its id as "blank". When the answer goes in an empty box of a table instead (for example a cell that only holds the label "Name"), give "cell": the page, and the x and y (points from the top left) where the writing starts, just below or after the label, and the width it may use.
- "If yes, taking medications?" and the like: give "showIf" naming the earlier field and its option.
- Leave out signatures, the examiner's or verifier's own fields, scores the instructor gives, and anything printed for information only.
- Use the ids exactly as listed. Never invent an id.`;

/** A raw section or field from the AI, before it is checked. */
type Raw = Record<string, unknown>;

const str = (v: unknown, max = FORM_IMPORT_LIMITS.label) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** "Date of assessment" → "date_of_assessment", unique within `taken`. */
export function slug(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'field';
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  taken.add(key);
  return key;
}

/**
 * The AI's answer as sections of fields, checked: known types only, every
 * box and blank looked up by its id (a made-up id leaves the answer without a
 * place), places kept on their page, follow-ups pointing at earlier fields.
 */
export function buildFormFromAi(
  raw: unknown,
  marks: { boxes: FoundBox[]; blanks: FoundBlank[] },
  pages: readonly FormPageImage[],
): { title: string; description: string; sections: FormSection[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Raw;
  const boxes = new Map(marks.boxes.map((b) => [b.id, b]));
  const blanks = new Map(marks.blanks.map((b) => [b.id, b]));
  const keys = new Set<string>();
  const byLabel = new Map<string, FormField>();
  const onPage = (page: unknown) => {
    const p = (num(page) ?? 1) - 1;
    return p >= 0 && p < pages.length ? p : null;
  };
  let total = 0;

  const sections: FormSection[] = [];
  for (const rs of (Array.isArray(r.sections) ? r.sections : []).slice(0, FORM_IMPORT_LIMITS.sections) as Raw[]) {
    const fields: FormField[] = [];
    for (const rf of (Array.isArray(rs?.fields) ? rs.fields : []) as Raw[]) {
      if (total >= FORM_IMPORT_LIMITS.fields) break;
      const label = str(rf?.label);
      const type = FIELD_TYPES.includes(rf?.type as FormFieldType) ? (rf.type as FormFieldType) : 'text';
      if (!label) continue;
      const field: FormField = { key: slug(label, keys), label, type };
      const unit = str(rf.unit, 20);
      if (unit && (type === 'number' || type === 'bp')) field.unit = unit;
      if (rf.required === true) field.required = true;

      if (type === 'choice' || type === 'multi') {
        const values = new Set<string>();
        const options: FormOption[] = [];
        for (const ro of (Array.isArray(rf.options) ? rf.options : []).slice(0, FORM_IMPORT_LIMITS.options) as Raw[]) {
          const optionLabel = str(ro?.label, 80);
          if (!optionLabel) continue;
          const option: FormOption = { value: slug(optionLabel, values), label: optionLabel };
          const box = boxes.get(str(ro.box, 10));
          if (box) option.at = { page: box.page, x: box.x, y: box.y };
          options.push(option);
        }
        if (options.length < 2) continue;
        field.options = options;
      } else {
        const blank = blanks.get(str(rf.blank, 10));
        const cell = rf.cell && typeof rf.cell === 'object' ? (rf.cell as Raw) : null;
        if (blank) field.at = { page: blank.page, x: blank.x + 1, y: blank.y - 1, w: blank.w };
        else if (cell) {
          const page = onPage(cell.page);
          const x = num(cell.x);
          const y = num(cell.y);
          const w = num(cell.w);
          if (page !== null && x !== null && y !== null) {
            const { width, height } = pages[page];
            if (x >= 0 && x < width && y >= 0 && y < height) {
              field.at = { page, x, y, w: Math.max(20, Math.min(w ?? 120, width - x)) };
            }
          }
        }
      }

      const showIf = rf.showIf && typeof rf.showIf === 'object' ? (rf.showIf as Raw) : null;
      const parent = showIf ? byLabel.get(str(showIf.field).toLowerCase()) : undefined;
      const parentOption = parent?.options?.find((o) => o.label.toLowerCase() === str(showIf?.option).toLowerCase());
      if (parent && parentOption) field.showIf = { field: parent.key, value: parentOption.value };

      byLabel.set(label.toLowerCase(), field);
      fields.push(field);
      total++;
    }
    if (fields.length) sections.push({ title: str(rs?.title) || `Part ${sections.length + 1}`, fields });
  }
  return { title: str(r.title), description: str(r.description, 600), sections };
}

/**
 * A form as saved, checked again on the server: the editor may have changed
 * anything. Keys stay unique, places stay on their page, follow-ups point at
 * a field before them. Null when nothing is left to fill in.
 */
export function sanitizeCustomForm(
  value: unknown,
  pages: readonly FormPageImage[],
): { title: string; description: string; sections: FormSection[] } | null {
  const v = (value && typeof value === 'object' ? value : {}) as Raw;
  const title = str(v.title);
  if (!title) return null;
  const keys = new Set<string>();
  const seen = new Map<string, FormField>();
  const place = (at: unknown): PagePlace | undefined => {
    if (!at || typeof at !== 'object') return undefined;
    const a = at as Raw;
    const page = Math.trunc(num(a.page) ?? 0);
    const x = num(a.x);
    const y = num(a.y);
    if (page < 0 || page >= pages.length || x === null || y === null) return undefined;
    const { width, height } = pages[page];
    if (x < 0 || x > width || y < 0 || y > height) return undefined;
    const w = num(a.w);
    const h = num(a.h);
    return { page, x, y, ...(w !== null && w > 0 ? { w: Math.min(w, width) } : {}), ...(h !== null && h > 0 ? { h: Math.min(h, height) } : {}) };
  };

  let total = 0;
  const sections: FormSection[] = [];
  for (const rs of (Array.isArray(v.sections) ? v.sections : []).slice(0, FORM_IMPORT_LIMITS.sections) as Raw[]) {
    const fields: FormField[] = [];
    for (const rf of (Array.isArray(rs?.fields) ? rs.fields : []) as Raw[]) {
      if (total >= FORM_IMPORT_LIMITS.fields) break;
      const label = str(rf?.label);
      if (!label || !FIELD_TYPES.includes(rf.type as FormFieldType)) continue;
      const type = rf.type as FormFieldType;
      const field: FormField = { key: slug(str(rf.key, 40) || label, keys), label, type };
      const unit = str(rf.unit, 20);
      if (unit && (type === 'number' || type === 'bp')) field.unit = unit;
      if (rf.required === true) field.required = true;
      if (type === 'choice' || type === 'multi') {
        const values = new Set<string>();
        const options = ((Array.isArray(rf.options) ? rf.options : []) as Raw[])
          .slice(0, FORM_IMPORT_LIMITS.options)
          .map((ro) => {
            const optionLabel = str(ro?.label, 80);
            if (!optionLabel) return null;
            const option: FormOption = { value: slug(str(ro.value, 40) || optionLabel, values), label: optionLabel };
            const at = place(ro.at);
            if (at) option.at = at;
            return option;
          })
          .filter((o): o is FormOption => o !== null);
        if (options.length < 2) continue;
        field.options = options;
      } else {
        const at = place(rf.at);
        if (at) field.at = at;
      }
      const showIf = rf.showIf && typeof rf.showIf === 'object' ? (rf.showIf as Raw) : null;
      const parent = showIf ? seen.get(str(showIf.field, 40)) : undefined;
      if (parent?.options?.some((o) => o.value === str(showIf?.value, 40))) {
        field.showIf = { field: parent.key, value: str(showIf!.value, 40) };
      }
      seen.set(field.key, field);
      fields.push(field);
      total++;
    }
    if (fields.length) sections.push({ title: str(rs?.title) || `Part ${sections.length + 1}`, fields });
  }
  if (sections.length === 0) return null;
  return { title, description: str(v.description, 600), sections };
}
