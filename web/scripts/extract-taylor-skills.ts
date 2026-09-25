/**
 * Extracts the skill checklists of the included chapters from Lynn & LeBon, "Skill Checklists for
 * Taylor's Clinical Nursing Skills" (3rd ed.), shipped in docs/, into
 * scripts/data/taylor-skills.json: each skill's number, title, goal, and its
 * numbered steps word for word.
 *
 * The JSON is committed, so seeding (seed-taylor-skills.ts) and the app never
 * need the PDF or pdftotext. Re-run this only if the extraction itself changes.
 *
 *   npx tsx scripts/extract-taylor-skills.ts            (needs pdftotext)
 *   npx tsx scripts/extract-taylor-skills.ts --report   (also print headings for review)
 *
 * The book restarts numbering inside a skill's variants ("Assessing Oral
 * Temperature" steps 10–15, then "Assessing Rectal Temperature" steps 10–18),
 * so a step is identified by its position, not its number, and the variant it
 * falls under is kept as its section heading.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ACTIVE_CHAPTERS, TAYLORS_CHAPTERS } from './taylors-chapters';

const PDF = join(__dirname, '..', '..', 'docs', 'Skill Checklists for Taylor_s Clinical Nursing Skills - Pamela Lynn , 3E.pdf');
const OUT = join(__dirname, 'data', 'taylor-skills.json');

/** The chapters the catalog holds; the rest of the book is left out. */
export const INCLUDED_CHAPTERS = ACTIVE_CHAPTERS;

export interface ExtractedStep {
  /** The number the book prints; repeats across a skill's variants. */
  number: number;
  /** The variant heading the step falls under, if the skill has variants. */
  section: string | null;
  text: string;
}

export interface ExtractedSkill {
  /** "5-23" */
  id: string;
  chapter: number;
  number: number;
  title: string;
  goal: string;
  steps: ExtractedStep[];
}

/** Lines that are page furniture, not checklist content. */
const BOILERPLATE: RegExp[] = [
  /^Copyright ©/,
  /^A Nursing Process Approach, 3rd edition/,
  /^Skill Checklists for Taylor's Clinical Nursing Skills:?$/,
  /^LWBK681-/,
  /^\d{1,3}$/, // page numbers
  /^(Name|Date|Unit|Position|Instructor\/Evaluator:|Comments|Excellent|Satisfactory|Needs Practice)$/,
];

/** Words pdftotext glues together when it undoes a real hyphen at a line end. */
const REPAIRS: [RegExp, string][] = [[/\bDrugInfusion\b/g, 'Drug-Infusion']];

const repair = (text: string) => REPAIRS.reduce((t, [re, fix]) => t.replace(re, fix), text);

const isBoilerplate = (line: string) => BOILERPLATE.some((re) => re.test(line));

/** Join a wrapped line onto the text before it, undoing a line-end hyphen. */
function joinLine(text: string, line: string): string {
  if (/[a-z]-$/.test(text) && /^[a-z]/.test(line)) return text.slice(0, -1) + line;
  return `${text} ${line}`;
}

/** A step's text is complete once it ends in sentence punctuation. */
const endsSentence = (text: string) => /[.?!:)”"]$/.test(text);

/**
 * A variant heading ("Assessing Oral Temperature") is one or two short
 * capitalised lines, with no closing punctuation, that start after a finished
 * sentence and lead straight into a numbered step. Returns the heading and the
 * index of the line after it, or null when the line is ordinary step text.
 */
function headingAt(lines: string[], i: number, open: string | null): { text: string; next: number } | null {
  if (open !== null && !endsSentence(open)) return null;
  const parts: string[] = [];
  let j = i;
  while (j < lines.length && parts.length < 3) {
    const line = lines[j];
    if (line === '' || /\(Continued\)$/.test(line) || /^SKILL \d+-\d+$/.test(line)) {
      j++;
      continue;
    }
    if (/^\d+\.\s/.test(line)) break;
    if (!/^[A-Z(]/.test(line) && parts.length === 0) return null;
    if (/[.,;?]\)?$/.test(line) || line.length > 90) return null;
    parts.push(line);
    j++;
  }
  if (parts.length === 0 || parts.length > 2) return null;
  if (j >= lines.length || !/^\d+\.\s/.test(lines[j])) return null;
  return { text: parts.join(' '), next: j };
}

/**
 * A long title wraps on a continuation page ("Performing Cardiopulmonary" /
 * "Resuscitation (CPR) (Continued)"), sometimes over three lines. Each
 * leading piece is part of the title with a "(Continued)" line just after.
 */
function isWrappedTitle(lines: string[], i: number, title: string): boolean {
  if (!title.includes(lines[i])) return false;
  return lines.slice(i + 1, i + 4).some((l) => /\(Continued\)$/.test(l));
}

function parseSkill(id: string, lines: string[]): ExtractedSkill {
  const [chapter, number] = id.split('-').map(Number);
  let i = 0;

  const titleParts: string[] = [];
  while (i < lines.length && !lines[i].startsWith('Goal:')) titleParts.push(lines[i++]);
  const title = titleParts.join(' ').replace(/\s*\(Continued\)$/, '').trim();

  let goal = '';
  if (i < lines.length) {
    goal = lines[i++].replace(/^Goal:\s*/, '');
    while (i < lines.length && !/^\d+\.\s/.test(lines[i]) && lines[i] !== '' && !headingAt(lines, i, goal)) {
      goal = joinLine(goal, lines[i++]);
    }
  }

  const steps: ExtractedStep[] = [];
  let section: string | null = null;
  let open: ExtractedStep | null = null;

  while (i < lines.length) {
    const line = lines[i];
    if (line === '' || line === `SKILL ${id}` || /\(Continued\)$/.test(line) || isWrappedTitle(lines, i, title)) {
      i++;
      continue;
    }

    const m = /^(\d+)\.\s+(.*)$/.exec(line);
    if (m) {
      open = { number: Number(m[1]), section, text: m[2] };
      steps.push(open);
      i++;
      continue;
    }

    const heading = headingAt(lines, i, open?.text ?? null);
    if (heading) {
      section = heading.text;
      open = null;
      i = heading.next;
      continue;
    }

    if (open) open.text = joinLine(open.text, line);
    else throw new Error(`Skill ${id}: text before the first step: "${line}"`);
    i++;
  }

  const clean = (t: string) => repair(t.replace(/\s+/g, ' ').trim());
  for (const s of steps) s.text = clean(s.text);
  return { id, chapter, number, title: clean(title), goal: clean(goal), steps };
}

export function extract(text: string): ExtractedSkill[] {
  const lines = text.split('\n').map((l) => l.replace(/\f/g, '').trim());

  // Every page of a skill repeats its "SKILL N-M" banner. Group the lines
  // between banners under the skill they belong to, dropping furniture.
  const bySkill = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of lines) {
    const banner = /^SKILL (\d+-\d+)$/.exec(line);
    if (banner) {
      current = banner[1];
      if (!bySkill.has(current)) bySkill.set(current, []);
      continue;
    }
    if (current === null || isBoilerplate(line)) continue;
    bySkill.get(current)!.push(line);
  }

  const skills = [...bySkill.entries()]
    .filter(([id]) => INCLUDED_CHAPTERS.includes(Number(id.split('-')[0])))
    .map(([id, ls]) => parseSkill(id, trimBlank(ls)));
  skills.sort((a, b) => a.chapter - b.chapter || a.number - b.number);
  return skills;
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === '') start++;
  while (end > start && lines[end - 1] === '') end--;
  return lines.slice(start, end);
}

export function validate(skills: ExtractedSkill[]): string[] {
  const problems: string[] = [];
  for (const ch of TAYLORS_CHAPTERS.filter((c) => INCLUDED_CHAPTERS.includes(c.chapter))) {
    const got = skills.filter((s) => s.chapter === ch.chapter).length;
    if (got !== ch.skills) problems.push(`Chapter ${ch.chapter}: expected ${ch.skills} skills, extracted ${got}`);
  }
  for (const s of skills) {
    if (!INCLUDED_CHAPTERS.includes(s.chapter)) problems.push(`Skill ${s.id}: chapter ${s.chapter} is not included`);
    if (!s.title) problems.push(`Skill ${s.id}: no title`);
    if (!s.goal) problems.push(`Skill ${s.id}: no goal`);
    if (s.steps.length === 0) problems.push(`Skill ${s.id}: no steps`);
    if (s.steps[0] && s.steps[0].number !== 1) problems.push(`Skill ${s.id}: first step is ${s.steps[0].number}, not 1`);
  }
  return problems;
}

function main() {
  const text = execFileSync('pdftotext', [PDF, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const skills = extract(text);
  const problems = validate(skills);

  if (process.argv.includes('--report')) {
    for (const s of skills) {
      const sections = [...new Set(s.steps.map((st) => st.section).filter(Boolean))];
      console.log(`${s.id.padEnd(6)} ${String(s.steps.length).padStart(3)} steps  ${s.title}`);
      for (const h of sections) console.log(`         § ${h}`);
    }
  }

  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(skills, null, 2) + '\n');
  const steps = skills.reduce((n, s) => n + s.steps.length, 0);
  console.log(`Wrote ${skills.length} skills, ${steps} steps to ${OUT}`);
}

if (require.main === module) main();
