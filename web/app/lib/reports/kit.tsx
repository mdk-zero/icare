import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import type { ComponentProps } from 'react';
import { ReportShell as ReportShellUI, type ReportDocument } from './kit-ui';

export { TEAL, styles, scoreColor, StatGrid, Table, type ReportDocument, type ReportMeta } from './kit-ui';

/**
 * The iCARE++ wordmark for the letterhead, read once per server instance.
 * next.config.ts ships the file to the report routes (outputFileTracingIncludes),
 * since public/ isn't otherwise part of a serverless function. If it's
 * missing anyway, the report still renders, just without the logo.
 */
const LOGO: Buffer | null = (() => {
  try {
    return readFileSync(path.join(process.cwd(), 'public', 'logo-no-bg.png'));
  } catch (err) {
    console.error('Report logo not found; PDFs will render without it', err);
    return null;
  }
})();

/** Letterhead, meta block and footer shared by every report type, with the server's logo. */
export function ReportShell(props: Omit<ComponentProps<typeof ReportShellUI>, 'logo'>) {
  return <ReportShellUI {...props} logo={LOGO} />;
}

export async function renderReport(element: ReportDocument): Promise<Buffer> {
  return await renderToBuffer(element);
}
