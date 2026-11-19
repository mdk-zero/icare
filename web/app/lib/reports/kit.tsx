import { accessSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import type { ComponentProps } from 'react';
import { ReportShell as ReportShellUI, registerReportFonts, type ReportDocument } from './kit-ui';

export {
  TEAL,
  styles,
  reportFonts,
  scoreColor,
  scoreTile,
  countTile,
  Attention,
  CourseCriteria,
  Distribution,
  GRID_AHEAD,
  Note,
  ScoreKey,
  Section,
  StatGrid,
  Table,
  type Cell,
  type Col,
  type CourseCriteriaEntry,
  type ReportDocument,
  type ReportMeta,
  type Tile,
  type TableRow,
} from './kit-ui';

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

/**
 * The report fonts (public/fonts), registered once per server instance. They
 * are shipped to the report routes like the logo. A missing file is caught
 * here, because a font that fails to load later would stop the PDF from
 * rendering at all; the reports then stay on Helvetica.
 */
registerReportFonts((file) => {
  const fontPath = path.join(process.cwd(), 'public', 'fonts', file);
  accessSync(fontPath);
  return fontPath;
});

/** Letterhead, meta block, running header and footer shared by every report type, with the server's logo. */
export function ReportShell(props: Omit<ComponentProps<typeof ReportShellUI>, 'logo'>) {
  return <ReportShellUI {...props} logo={LOGO} />;
}

export async function renderReport(element: ReportDocument): Promise<Buffer> {
  return await renderToBuffer(element);
}

/**
 * A rendered report as the route's answer. The Reports page asks with
 * `Accept: application/json` and gets the PDF base64-encoded inside JSON:
 * download managers such as IDM seize any response that is a PDF, aborting
 * the page's own request, even when the page only wanted it for a preview.
 * Plain links still get the PDF itself, as an attachment.
 */
export function reportResponse(request: Request, pdf: Buffer, filename: string): NextResponse {
  if (request.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json(
      { filename, pdf: pdf.toString('base64') },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
