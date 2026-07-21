export type CsvCell = string | number | null | undefined;

/** RFC 4180 escaping: quote when the value contains a comma, quote or newline. */
function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Serialises a report to CSV. A leading BOM is included so Excel opens UTF-8
 * names (e.g. "Peña") correctly instead of mojibake.
 */
export function toCsv(head: string[], rows: CsvCell[][]): string {
  const lines = [head, ...rows].map((row) => row.map(escapeCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/**
 * Some reports are not a single table — a section report has a roster and a
 * competency breakdown. Those stack as titled blocks in one file.
 */
export interface CsvBlock {
  title?: string;
  head: string[];
  rows: CsvCell[][];
}

export function toCsvBlocks(blocks: CsvBlock[]): string {
  const parts = blocks.map((block) => {
    const lines: string[] = [];
    if (block.title) lines.push(escapeCell(block.title));
    lines.push(block.head.map(escapeCell).join(','));
    for (const row of block.rows) lines.push(row.map(escapeCell).join(','));
    return lines.join('\r\n');
  });
  return `﻿${parts.join('\r\n\r\n')}\r\n`;
}

/** Filesystem-safe slug for Content-Disposition. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'report'
  );
}
