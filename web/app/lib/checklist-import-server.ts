import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checklistFromGrid,
  checklistFromLines,
  checklistTasks,
  type ChecklistRow,
  type ReadChecklist,
} from '@/app/lib/checklist-import';
import { isMissingStepTables } from '@/app/lib/scenario-tasks';

/**
 * Reads an uploaded skills checklist (checklist-import.ts): a PDF's text, or
 * the first sheet of an Excel workbook that has steps on it, and writes one
 * as a Return Demonstration's tasks. Server only.
 */

/** Same weight as a Taylor's skill task (skill-tasks.ts). */
const POINTS_PER_TASK = 10;

/**
 * The checklist's tasks and steps, after `afterSortOrder`: one task per
 * section, graded by the instructor, with no skill link. Each step's source
 * is its number on the paper checklist.
 */
export async function addChecklistTasks(
  supabase: SupabaseClient,
  scenarioId: string,
  rows: readonly ChecklistRow[],
  title: string,
  afterSortOrder = 0,
): Promise<{ tasks: number; steps: number; error: { message?: string } | null }> {
  const tasks = checklistTasks(rows, title);
  if (tasks.length === 0) return { tasks: 0, steps: 0, error: null };

  const inserted = await supabase
    .from('scenario_tasks')
    .insert(
      tasks.map((task, i) => ({
        scenario_id: scenarioId,
        title: task.title,
        description: '',
        category: 'intervention',
        points: POINTS_PER_TASK,
        verification: 'faculty',
        system_trigger: null,
        sort_order: afterSortOrder + i + 1,
      })),
    )
    .select('id, sort_order');
  if (inserted.error) return { tasks: 0, steps: 0, error: inserted.error };

  const taskIdBySort = new Map((inserted.data ?? []).map((t) => [t.sort_order as number, t.id as string]));
  let number = 0;
  const stepRows = tasks.flatMap((task, i) => {
    const taskId = taskIdBySort.get(afterSortOrder + i + 1);
    return task.steps.map((text, j) => {
      number += 1;
      return taskId ? [{ task_id: taskId, title: text, source: `${title.trim() || 'Checklist'}, step ${number}`, sort_order: j + 1 }] : [];
    }).flat();
  });
  const steps = await supabase.from('scenario_task_steps').insert(stepRows);
  if (steps.error) {
    if (isMissingStepTables(steps.error)) return { tasks: tasks.length, steps: 0, error: null };
    return { tasks: tasks.length, steps: 0, error: steps.error };
  }
  return { tasks: tasks.length, steps: stepRows.length, error: null };
}

export type ChecklistFileKind = 'pdf' | 'xlsx';

export function checklistFileKind(name: string, type: string): ChecklistFileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (lower.endsWith('.xlsx') || type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  return null;
}

export async function readChecklistFile(bytes: Uint8Array, kind: ChecklistFileKind): Promise<ReadChecklist> {
  return kind === 'pdf' ? readPdf(bytes) : readXlsx(bytes);
}

async function readPdf(bytes: Uint8Array): Promise<ReadChecklist> {
  const { PDFParse } = await import('pdf-parse');
  // pdf.js takes over the buffer it is given.
  const parser = new PDFParse({ data: bytes.slice() });
  try {
    return checklistFromLines((await parser.getText()).text.split('\n'));
  } finally {
    await parser.destroy();
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' ? 2 : 1), e[1] === 'x' ? 16 : 10)) : (ENTITIES[e] ?? m),
  );

/** The text of every <t> in a piece of sheet XML: a shared or inline string, rich text runs and all. */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

/** "BC12" → 54: the column's position, for keeping cells left to right. */
const column = (ref: string) => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

async function readXlsx(bytes: Uint8Array): Promise<ReadChecklist> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];

  const sheets = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  let best: ReadChecklist = { title: '', rows: [] };
  for (const name of sheets) {
    const xml = await zip.file(name)!.async('string');
    const grid: string[][] = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: { col: number; text: string }[] = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1];
        const body = cell[2] ?? '';
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '';
        const type = /\bt="(\w+)"/.exec(attrs)?.[1];
        const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        const text =
          type === 's' && value !== undefined
            ? (shared[Number(value)] ?? '')
            : type === 'inlineStr'
              ? textOf(body)
              : value !== undefined
                ? decode(value)
                : '';
        if (text.trim()) cells.push({ col: column(ref), text });
      }
      grid.push(cells.sort((a, b) => a.col - b.col).map((c) => c.text));
    }
    const read = checklistFromGrid(grid);
    if (read.rows.length > best.rows.length) best = read;
  }
  return best;
}
