/**
 * The report kit's components and styles, free of server-only code so a
 * report can also be laid out in the browser (the demo builds its PDFs
 * there). kit.tsx adds the server's logo and rendering on top.
 */
import {
  Document,
  Font,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
  type DocumentProps,
} from '@react-pdf/renderer';
import type { ReactElement, ReactNode } from 'react';
import { formatGrade, type CourseStanding } from '../course-grading';
import { scoreDescriptor } from '../task-ratings';
import { TINT, TONE, scoreColor as bandColor } from './bands';

/** What renderToBuffer accepts: a <Document> root, not any element. */
export type ReportDocument = ReactElement<DocumentProps>;

export const TEAL = '#1B6B7B';
/** The running header and the headings that sit on a teal tint. */
export const TEAL_DARK = '#145a63';
/** The portal's Brand-100 and Brand-50: a skill bar's fill, and a tile that carries the headline figure. */
export const BRAND_100 = '#d9eff2';
export const BRAND_50 = '#f0f9fa';
export const INK = '#1f2937';
export const MUTED = '#4b5563';
/** The lightest gray allowed for text that matters. */
export const FAINT = '#6b7280';
/** A table header's fill. */
export const SUBTLE = '#f7fafb';
export const HAIRLINE = '#e6edef';
export const TILE_BORDER = '#d9e4e7';

/**
 * The families the reports draw in. They read Helvetica, the PDF's built-in
 * face, until registerReportFonts succeeds, so a font file that is missing
 * never stops a report. Styles read these at render time, not when the module
 * loads, because the demo registers the files only after checking for them.
 * Helvetica has no glyph for the "at least" and "at most" signs (they come out
 * as other letters), so no report copy uses them, whichever font is live.
 */
export const reportFonts = { body: 'Helvetica', display: 'Helvetica', semibold: 700, custom: false };

const SOURCE_SANS = 'Source Sans 3';
const SPACE_GROTESK = 'Space Grotesk';

/**
 * Registers Source Sans 3 (400, 600, 700) for text and tables, and Space
 * Grotesk (700) for titles and tile values. Source Sans has the same width
 * for every digit, so a column of scores lines up, which react-pdf could not
 * switch on in a font that has proportional digits. `resolve` turns a file
 * name into a path (the server) or a URL (the demo); if it throws, the
 * reports stay on Helvetica. Returns whether the fonts are live.
 */
export function registerReportFonts(resolve: (file: string) => string): boolean {
  // Long words in a narrow cell wrap whole rather than breaking mid-word, whichever font is live.
  Font.registerHyphenationCallback((word) => [word]);
  if (reportFonts.custom) return true;
  try {
    const sans = [
      { src: resolve('SourceSans3_400Regular.ttf'), fontWeight: 400 },
      { src: resolve('SourceSans3_600SemiBold.ttf'), fontWeight: 600 },
      { src: resolve('SourceSans3_700Bold.ttf'), fontWeight: 700 },
    ];
    const display = [{ src: resolve('SpaceGrotesk_700Bold.ttf'), fontWeight: 700 }];
    Font.register({ family: SOURCE_SANS, fonts: sans });
    Font.register({ family: SPACE_GROTESK, fonts: display });
  } catch (err) {
    console.error('Report fonts not available; PDFs will use Helvetica', err);
    return false;
  }
  reportFonts.body = SOURCE_SANS;
  reportFonts.display = SPACE_GROTESK;
  reportFonts.semibold = 600;
  reportFonts.custom = true;
  return true;
}

/**
 * The page the report being drawn sits on. ReportShell sets it as it renders,
 * before any of its children do, so a tile grid can pick its default column
 * count for the paper it is on. A module value rather than React context,
 * because the server builds these documents in the react-server layer, where
 * createContext is not available. react-pdf draws one document at a time,
 * synchronously, so two reports never read each other's.
 */
const layout = { landscape: false };

function setPaper(orientation: 'portrait' | 'landscape') {
  layout.landscape = orientation === 'landscape';
}

/**
 * Shared look for every generated report. Kept in one place so a new report
 * type inherits the letterhead, table and stat styling rather than restating it.
 */
export const styles = StyleSheet.create({
  // The font family is set on the Page at render time (see reportFonts), and text inherits it.
  // US Letter. The top and bottom leave room for the running header and the footer, which are
  // absolutely placed; the first page's letterhead is pulled up into the top margin.
  page: { paddingTop: 56, paddingBottom: 58, paddingHorizontal: 40, fontSize: 10, color: INK },

  // Letterhead
  letterhead: {
    marginTop: -18,
    marginBottom: 12,
    paddingBottom: 9,
    borderBottomWidth: 2,
    borderBottomColor: TEAL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  letterheadText: { flex: 1 },
  title: {
    fontSize: 22,
    get fontFamily() {
      return reportFonts.display;
    },
    fontWeight: 700,
    color: TEAL,
  },
  subject: {
    fontSize: 13,
    get fontWeight() {
      return reportFonts.semibold;
    },
    color: INK,
    marginTop: 2,
  },
  institution: { fontSize: 8.5, color: MUTED, marginTop: 3 },
  // The PNG is 602×200; keep that ratio.
  logo: { width: 108, height: 36 },

  // Meta block
  metaBlock: { flexDirection: 'row', marginBottom: 10 },
  metaColumn: { flex: 1 },
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaLabel: { width: 92, fontSize: 8.5, color: MUTED, paddingTop: 1 },
  metaValue: { flex: 1 },

  // Running header and footer
  runningWrap: { position: 'absolute', top: 24, left: 40, right: 40 },
  running: { borderBottomWidth: 0.75, borderBottomColor: HAIRLINE, paddingBottom: 4 },
  runningText: { fontSize: 8, color: TEAL_DARK },
  runningBrand: {
    fontSize: 8.5,
    get fontFamily() {
      return reportFonts.display;
    },
    fontWeight: 700,
    color: TEAL,
  },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 40,
    right: 40,
    borderTopWidth: 0.75,
    borderTopColor: HAIRLINE,
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: MUTED,
  },
  footerText: { flex: 1 },
  footerPage: { marginLeft: 12 },
  footerCopy: {
    get fontWeight() {
      return reportFonts.semibold;
    },
    marginTop: 1,
  },

  // Section headings, notes and empty states
  sectionHead: { marginTop: 14, marginBottom: 6 },
  sectionTitle: {
    fontSize: 13,
    get fontFamily() {
      return reportFonts.display;
    },
    fontWeight: 700,
    color: TEAL,
  },
  sectionCaption: { fontSize: 8, color: MUTED, marginTop: 2 },
  note: { fontSize: 8, color: MUTED, marginTop: 6 },
  empty: { color: FAINT, fontSize: 9, paddingVertical: 6 },

  // Tiles
  tiles: { flexDirection: 'row', flexWrap: 'wrap', marginRight: -8 },
  tileCell: { paddingRight: 8, paddingBottom: 8 },
  tile: {
    flexGrow: 1,
    backgroundColor: SUBTLE,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  tileEmphasis: { backgroundColor: BRAND_50, borderColor: BRAND_100 },
  tileLabel: { fontSize: 7.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.3 },
  tileValue: {
    fontSize: 20,
    marginTop: 3,
    get fontFamily() {
      return reportFonts.display;
    },
    fontWeight: 700,
    color: INK,
  },
  // A value that is a phrase ("Not yet competent") would wrap at the figure size and make the row tall.
  tileValuePhrase: { fontSize: 14, marginTop: 6 },
  tileCaption: { fontSize: 8, color: MUTED, marginTop: 2 },

  // Callouts
  attention: {
    marginTop: 2,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 3,
  },

  // Table
  table: {},
  tableHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: SUBTLE,
    borderBottomWidth: 1,
    borderBottomColor: TEAL,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 2,
  },
  tableHeadLabel: {
    fontSize: 8.5,
    get fontWeight() {
      return reportFonts.semibold;
    },
    color: MUTED,
  },
  tableHeadSub: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 0.75,
    borderBottomColor: HAIRLINE,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 2,
  },
  tableCell: { paddingHorizontal: 6 },
  tableText: { fontSize: 9.5 },
  scoreSlot: { width: 30, textAlign: 'right', fontSize: 9.5, fontWeight: 700 },
  scoreWord: { flex: 1, fontSize: 9, color: MUTED, marginLeft: 5 },

  // The sheets' header row: the table header's look without its side padding, because the sheets'
  // rows have none and their flex columns must line up from the header down.
  gridHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: SUBTLE,
    borderBottomWidth: 1,
    borderBottomColor: TEAL,
    paddingVertical: 5,
  },

  // Legacy: the sheets' body rows and the builders' own bars still draw with these.
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
    paddingVertical: 4,
    alignItems: 'center',
    overflow: 'hidden',
  },
  headRow: { backgroundColor: SUBTLE, fontWeight: 700 },
  cellWide: { flex: 3, paddingHorizontal: 4 },
  cell: { flex: 1, paddingHorizontal: 4, textAlign: 'right' },
  barTrack: { flex: 2, height: 6, backgroundColor: HAIRLINE, borderRadius: 3, marginHorizontal: 4 },
  courseTitle: { fontWeight: 700, marginTop: 10 },
  courseSub: { fontSize: 8, color: FAINT, marginTop: 1, marginBottom: 4 },
});

/**
 * What a heading over a member grid asks to have after it: the header row (up to four lines
 * of names), the legend and the first rows. react-pdf keeps a heading with what follows only by
 * this much, so a grid's header never ends a page alone.
 */
export const GRID_AHEAD = 150;

/** The content width of a landscape Letter page (792 less the 40 pt margins), which the member grids lay out in. */
const LANDSCAPE_WIDTH = 712;
/** What the question or step column of a member grid keeps at the least, however many members. */
const GRID_LABEL_WIDTH = 220;

/**
 * The width of one member's column in the checklist grid and the quiz matrix:
 * 64 pt, narrower only when many members would squeeze the step or question
 * column below 220 pt. Fixed, not flex, so the two grids line up and a header
 * name wraps inside a column that does not move with its neighbours.
 */
export function memberColumnWidth(count: number): number {
  return Math.min(64, Math.floor((LANDSCAPE_WIDTH - GRID_LABEL_WIDTH) / Math.max(count, 1)));
}

/** Advance widths of Source Sans 3 semibold for the printable ASCII from the space on, in 1/1000 em. */
const SEMIBOLD_WIDTHS = [
  200, 315, 482, 513, 513, 841, 639, 275, 324, 324, 438, 513, 275, 322, 275, 344, 513, 513, 513, 513, 513, 513, 513, 513, 513, 513, 275,
  275, 513, 513, 513, 444, 875, 558, 597, 576, 625, 538, 510, 628, 663, 282, 494, 597, 502, 745, 657, 674, 582, 674, 592, 545, 546, 655,
  536, 800, 541, 501, 540, 324, 344, 324, 513, 500, 549, 516, 563, 462, 564, 507, 317, 520, 558, 262, 263, 522, 271, 843, 560, 549, 564,
  564, 373, 431, 361, 556, 495, 748, 481, 495, 443, 324, 255, 324, 513,
];

/** The width of one letter in em; accented and other letters count as an average one. */
const letterWidth = (ch: string): number => {
  const code = ch.charCodeAt(0) - 32;
  return (SEMIBOLD_WIDTHS[code] ?? 540) / 1000;
};

/**
 * Lays a name out for a column `width` pt wide, as the lines it will take, with
 * a newline between them. react-pdf wraps at spaces only (hyphenation is off),
 * so a long surname such as "Pangilinan-Magbanua" would run past its column
 * into the next one. A word that is too wide breaks after its hyphen, and
 * failing that between two letters; every name stays whole, with no ellipsis.
 */
export function fitName(name: string, width: number, fontSize = 8): string {
  // The column keeps 1 pt either side; a hyphen may hang half a point over rather than strand a letter.
  const room = (width - 2 + 0.5) / fontSize;
  const wide = (w: string) => [...w].reduce((n, ch) => n + letterWidth(ch), 0);
  const pieces: string[] = [];
  for (const word of name.split(/\s+/).filter(Boolean)) {
    // Break after a hyphen first ("Cruz-" / "Villanueva"), keeping the hyphen on the upper line.
    for (const part of word.split(/(?<=-)/)) {
      let rest = part;
      while (wide(rest) > room && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && wide(rest.slice(0, cut)) > room) cut -= 1;
        pieces.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      pieces.push(rest);
    }
    pieces.push(' ');
  }
  // Join pieces greedily: a piece goes on the line while it fits; a space is a break where it doesn't.
  const lines: string[] = [];
  let line = '';
  for (const piece of pieces) {
    if (piece === ' ') {
      if (line && !line.endsWith(' ')) line += ' ';
      continue;
    }
    if (line && wide(line + piece) > room) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += piece;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join('\n');
}

/** The band colour of a score: the shared 75 and 50 cut-offs (bands.ts). */
export function scoreColor(score: number): string {
  return bandColor(score);
}

export interface ReportMeta {
  campus: string;
  generatedBy: string;
  generatedAt: string;
  /** What a Dean-level viewer is called: "Dean", or "Program Chair" (080). Dean reports only. */
  deanLabel?: string;
}

/** Said in the footer of a report that lists each member's grades beside the others'. */
const INSTRUCTOR_COPY = "Instructor copy: lists each member's grades side by side. Not for the group.";

/**
 * Letterhead, meta block, running header and footer shared by every report
 * type. Page 1 opens with the letterhead; later pages open with a one-line
 * running header that names the report, so a loose sheet can be placed. The
 * footer on every page says who made the report and when, and numbers it.
 */
export function ReportShell({
  title,
  subject,
  runningLabel,
  meta,
  metaRows,
  logo,
  orientation = 'portrait',
  audience,
  children,
}: {
  /** The report's name: "Student Progress Report". */
  title: string;
  /** The one line that says who or what it is about: a student, a section, a Patient Case. */
  subject: string;
  /** What the running header says after the title; the subject unless a shorter or fuller label reads better. */
  runningLabel?: string;
  meta: ReportMeta;
  metaRows: MetaRow[];
  /** The letterhead wordmark: file bytes on the server, a URL in the browser. */
  logo?: Buffer | string | null;
  /** Landscape for a wide table, such as a column per group member. */
  orientation?: 'portrait' | 'landscape';
  /** "instructor-copy" marks a report that shows members' grades side by side, in its footer. */
  audience?: 'instructor-copy';
  children: ReactNode;
}) {
  setPaper(orientation);
  const running = runningLabel ?? subject;
  return (
    <Document title={`${title} - ${subject}`} language="en-PH" creator="iCARE++" producer="iCARE++">
      <Page size="LETTER" orientation={orientation} style={[styles.page, { fontFamily: reportFonts.body }]} wrap>
        <View style={styles.letterhead}>
          <View style={styles.letterheadText}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subject}>{subject}</Text>
            <Text style={styles.institution}>{meta.campus}, College of Health Sciences</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt */}
          {logo && <Image src={logo} style={styles.logo} />}
        </View>

        <MetaBlock rows={metaRows} />

        {children}

        <View
          fixed
          style={styles.runningWrap}
          render={({ pageNumber }) =>
            pageNumber === 1 ? null : (
              <View style={styles.running}>
                <Text style={styles.runningText}>
                  <Text style={styles.runningBrand}>iCARE++</Text>
                  {'    '}
                  {title} · {running}
                </Text>
              </View>
            )
          }
        />

        <View fixed style={styles.footer}>
          <View style={styles.footerText}>
            <Text>
              Generated {meta.generatedAt} by {meta.generatedBy} · Confidential academic record
            </Text>
            {audience === 'instructor-copy' && <Text style={styles.footerCopy}>{INSTRUCTOR_COPY}</Text>}
          </View>
          <Text style={styles.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** A label and its value; a date may carry the word "Late", set as in a table cell. */
export interface MetaRow {
  label: string;
  value: string | DateCell;
}

/** Label and value pairs under the letterhead: one column of them, or two when there are four or more. */
function MetaBlock({ rows }: { rows: MetaRow[] }) {
  if (rows.length === 0) return null;
  const split = rows.length >= 4 ? Math.ceil(rows.length / 2) : rows.length;
  const columns = [rows.slice(0, split), rows.slice(split)].filter((c) => c.length > 0);
  return (
    <View style={styles.metaBlock}>
      {columns.map((column, i) => (
        <View key={i} style={[styles.metaColumn, i === 0 && columns.length > 1 ? { paddingRight: 18 } : {}]}>
          {column.map((row) => (
            <View key={row.label} style={styles.metaRow} wrap={false}>
              <Text style={styles.metaLabel}>{row.label}</Text>
              {typeof row.value === 'string' ? (
                <Text style={styles.metaValue}>{row.value}</Text>
              ) : (
                <Text style={styles.metaValue}>
                  {row.value.date}
                  {row.value.late && <Text style={{ fontWeight: 700, color: TONE.practice }}>{'  Late'}</Text>}
                </Text>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// --- Headings, notes and callouts -----------------------------------------------------

/**
 * A heading with an optional caption that says how the rows below are ordered.
 * It keeps 70 pt of what follows on the same page, so a heading never ends a
 * page alone. The content goes after it as siblings, not inside it, because
 * react-pdf measures what is ahead from the heading's next siblings.
 */
export function Section({
  title,
  caption,
  ahead = 70,
  children,
}: {
  title: string;
  caption?: string;
  /** How much room must follow the heading on its page; a grid with a tall header asks for more (GRID_AHEAD). */
  ahead?: number;
  children?: ReactNode;
}) {
  return (
    <>
      {/* wrap={false}: react-pdf skips minPresenceAhead for a heading that straddles the page end, and splits it. */}
      <View style={styles.sectionHead} minPresenceAhead={ahead} wrap={false}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {caption && <Text style={styles.sectionCaption}>{caption}</Text>}
      </View>
      {children}
    </>
  );
}

/** A line of small print: how a figure is worked out, or what a mark means. */
export function Note({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

/**
 * The items that need the reader's eye, in a box with a red bar, or the
 * `clear` sentence in a quiet one when there are none.
 */
export function Attention({ items, clear }: { items: string[]; clear: string }) {
  const flagged = items.length > 0;
  return (
    <View
      wrap={false}
      style={[
        styles.attention,
        flagged
          ? { backgroundColor: TINT.low, borderColor: '#f3c9c9', borderLeftColor: TONE.low }
          : { backgroundColor: SUBTLE, borderColor: TILE_BORDER, borderLeftColor: TILE_BORDER },
      ]}
    >
      {flagged ? (
        <Text>
          <Text style={{ fontWeight: 700, color: TONE.low }}>Needs attention: </Text>
          {items.join(' · ')}
        </Text>
      ) : (
        <Text style={{ color: MUTED }}>{clear}</Text>
      )}
    </View>
  );
}

/** What the three score colours mean. Squares, not glyphs, so no font has to carry them. */
export function ScoreKey() {
  const entries = [
    { color: TONE.pass, label: '75% and up' },
    { color: TONE.practice, label: '50 to 74%' },
    { color: TONE.low, label: 'below 50%' },
  ];
  return (
    <View wrap={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
      <Text style={{ fontSize: 8, color: MUTED }}>Score colours:</Text>
      {entries.map((e) => (
        <View key={e.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 7, height: 7, backgroundColor: e.color, borderRadius: 1 }} />
          <Text style={{ fontSize: 8, color: MUTED }}>{e.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** One stacked bar split by count, with each segment's label and count under it. Empty segments are left out. */
export function Distribution({ segments }: { segments: { label: string; count: number; color: string }[] }) {
  const shown = segments.filter((s) => s.count > 0);
  return (
    <View wrap={false}>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 3, overflow: 'hidden', backgroundColor: HAIRLINE }}>
        {shown.map((s) => (
          <View key={s.label} style={{ flex: s.count, backgroundColor: s.color }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 5 }}>
        {segments.map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 7, height: 7, backgroundColor: s.color, borderRadius: 1 }} />
            <Text style={{ fontSize: 8.5, color: MUTED }}>
              {s.label} <Text style={{ fontWeight: 700, color: INK }}>{s.count}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// --- Tiles -----------------------------------------------------------------------------

export interface Tile {
  /** Keep to 16 characters or fewer; details go in the caption. */
  label: string;
  value: string | number;
  caption?: string;
  /** The value's colour; a score tile sets it from the score's band. */
  color?: string;
  /** The Brand-50 fill that marks the headline figure. */
  emphasis?: boolean;
}

export interface TileOptions {
  emphasis?: boolean;
  /** A count's value colour, such as amber for flagged and red for critical. */
  color?: string;
}

/** A tile for a score: the value takes its band's colour and the caption is the verbal rating unless given. */
export function scoreTile(label: string, score: number | null, caption?: string, opts: TileOptions = {}): Tile {
  if (score === null) return { label, value: '—', caption, emphasis: opts.emphasis };
  return {
    label,
    value: `${Math.round(score)}%`,
    caption: caption ?? scoreDescriptor(score),
    color: bandColor(score),
    emphasis: opts.emphasis,
  };
}

/** A tile for a count or a word. Zero reads "0"; only "no value" is a dash. */
export function countTile(label: string, value: string | number, caption?: string, opts: TileOptions = {}): Tile {
  return { label, value, caption, color: opts.color, emphasis: opts.emphasis };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A tile value that reads as words, not a figure: "Competent", "Not yet performed". */
const isPhrase = (value: string | number) => typeof value === 'string' && !NUMERIC.test(value);

/**
 * Tiles in a row, left-aligned, so one or two do not stretch across the page.
 * `columns` sets how many fit in a row; by default that is the tile count held
 * between 3 and 5 (4 and 6 in landscape). Tiles past a full row wrap to the
 * next at the same width.
 */
export function StatGrid({ items, columns }: { items: Tile[]; columns?: number }) {
  const per = columns ?? (layout.landscape ? clamp(items.length, 4, 6) : clamp(items.length, 3, 5));
  return (
    <View style={styles.tiles}>
      {items.map((item, i) => (
        <View key={i} style={[styles.tileCell, { width: `${100 / per}%` }]} wrap={false}>
          <View style={[styles.tile, item.emphasis ? styles.tileEmphasis : {}]}>
            <Text style={styles.tileLabel}>{item.label}</Text>
            <Text style={[styles.tileValue, isPhrase(item.value) ? styles.tileValuePhrase : {}, item.color ? { color: item.color } : {}]}>
              {String(item.value)}
            </Text>
            {item.caption && <Text style={styles.tileCaption}>{item.caption}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

// --- Table -----------------------------------------------------------------------------

type Align = 'left' | 'right' | 'center';

/** A column: a label, an optional second line under it, and how it sits. */
export interface Col {
  label: string;
  /** A smaller line under the label: "Prediction, not a grade". */
  sub?: string;
  /** Inferred from the cells when not given: right for numbers and scores, left for text. */
  align?: Align;
  /** Relative width; the first column is 3 and the others 1 unless set, here or in `widths`. */
  flex?: number;
}

/** A date, with the word "Late" after it in amber when it was handed in past the deadline. */
export interface DateCell {
  date: string;
  late?: boolean;
}

/** A name with a smaller line under it, such as an account's email. */
export interface PairCell {
  text: string;
  sub: string;
}

/** A short word that carries a tone: "Low performing" in red, "On track" muted. */
export interface TagCell {
  tag: string;
  tone: 'low' | 'practice' | 'pass' | 'muted';
}

interface ScoreCellValue {
  score: number | null;
  word?: boolean;
  text?: string;
}

/**
 * One table cell. A score cell shows a band-coloured percent (or `text`, for a
 * grade that keeps a decimal, such as a course grade) and, with `word`, the
 * verbal rating after it. A null score is a dash.
 */
export type Cell = string | number | ScoreCellValue | DateCell | TagCell | PairCell | null;

/** A row, with a tone when it needs a look: red and barred, amber, or a total. */
export interface TableRow {
  cells: Cell[];
  tone?: 'attention' | 'notice' | 'total';
}

const scoreCell = (c: Cell): c is ScoreCellValue => typeof c === 'object' && c !== null && 'score' in c;
const dateCell = (c: Cell): c is DateCell => typeof c === 'object' && c !== null && 'date' in c;
const tagCell = (c: Cell): c is TagCell => typeof c === 'object' && c !== null && 'tag' in c;
const pairCell = (c: Cell): c is PairCell => typeof c === 'object' && c !== null && 'sub' in c && 'text' in c;

const TAG_COLOR: Record<TagCell['tone'], string> = { low: TONE.low, practice: TONE.practice, pass: TONE.pass, muted: MUTED };

const NUMERIC = /^[—\d.,%/\s()+-]+$/;

/** Right when every filled cell is a number, a score or looks like one; left otherwise. */
function inferAlign(cells: Cell[]): Align {
  const filled = cells.filter((c) => c !== null && !(typeof c === 'string' && (c.trim() === '' || c === '—')));
  const numeric = filled.every((c) => (typeof c === 'string' ? NUMERIC.test(c) : !dateCell(c) && !tagCell(c) && !pairCell(c)));
  const words = cells.some((c) => scoreCell(c) && c.word);
  // A score with its rating after it lines up on the score's right edge, so the group sits at the left.
  return words ? 'left' : numeric ? 'right' : 'left';
}

function CellView({ cell, align, bold }: { cell: Cell; align: Align; bold: boolean }) {
  const weight = bold ? { fontWeight: 700 } : {};
  if (cell === null || (scoreCell(cell) && cell.score === null)) {
    // Where a score would end, so the dashes keep to the column the digits are in.
    const slot = scoreCell(cell) && cell.word ? [styles.scoreSlot, { fontWeight: 400 }] : [styles.tableText, { textAlign: align }];
    return <Text style={[...slot, { color: FAINT }]}>—</Text>;
  }
  if (dateCell(cell)) {
    return (
      <Text style={[styles.tableText, { textAlign: align }, weight]}>
        {cell.date}
        {cell.late && <Text style={{ fontWeight: 700, color: TONE.practice }}>{'  Late'}</Text>}
      </Text>
    );
  }
  if (tagCell(cell)) {
    return (
      <Text style={[styles.tableText, { textAlign: align, color: TAG_COLOR[cell.tone], fontWeight: cell.tone === 'muted' ? 400 : 700 }]}>
        {cell.tag}
      </Text>
    );
  }
  if (pairCell(cell)) {
    return (
      <View>
        <Text style={[styles.tableText, weight]}>{cell.text}</Text>
        <Text style={{ fontSize: 8.5, color: MUTED }}>{cell.sub}</Text>
      </View>
    );
  }
  if (scoreCell(cell)) {
    const score = cell.score as number;
    const shown = cell.text ?? `${Math.round(score)}%`;
    const color = bandColor(score);
    if (cell.word) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Text style={[styles.scoreSlot, { color }]}>{shown}</Text>
          <Text style={styles.scoreWord}>{scoreDescriptor(score)}</Text>
        </View>
      );
    }
    return <Text style={[styles.tableText, { textAlign: align, fontWeight: 700, color }]}>{shown}</Text>;
  }
  return <Text style={[styles.tableText, { textAlign: align }, weight]}>{String(cell)}</Text>;
}

/**
 * The report table. Columns are given as plain labels or as Col objects, and
 * rows as arrays of cells or { cells, tone }. The header row is fixed, so a
 * table that runs onto another page repeats it at the top there; rows never
 * split across a page.
 */
export function Table({
  head,
  rows,
  widths,
  emptyText = 'No records yet.',
  caption,
}: {
  head: (string | Col)[];
  rows: (Cell[] | TableRow)[];
  /** Relative column widths; they win over each Col's `flex`. */
  widths?: number[];
  emptyText?: string;
  /** Small print under the table. */
  caption?: string;
}) {
  if (rows.length === 0) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }
  const list: TableRow[] = rows.map((r) => (Array.isArray(r) ? { cells: r } : r));
  const cols = head.map((h) => (typeof h === 'string' ? { label: h } : h));
  const aligns: Align[] = cols.map((col, i) => col.align ?? (i === 0 ? 'left' : inferAlign(list.map((r) => r.cells[i] ?? null))));
  const flexOf = (i: number) => widths?.[i] ?? cols[i].flex ?? (i === 0 ? 3 : 1);
  return (
    <View style={styles.table}>
      <View style={styles.tableHead} fixed>
        {cols.map((col, i) => (
          <View key={i} style={[styles.tableCell, { flex: flexOf(i) }]}>
            <Text style={[styles.tableHeadLabel, { textAlign: aligns[i] }]}>{col.label}</Text>
            {col.sub && <Text style={[styles.tableHeadSub, { textAlign: aligns[i] }]}>{col.sub}</Text>}
          </View>
        ))}
      </View>
      {list.map((row, r) => (
        <View
          key={r}
          wrap={false}
          style={[
            styles.tableRow,
            row.tone === 'attention' ? { backgroundColor: TINT.low, borderLeftWidth: 3, borderLeftColor: TONE.low, paddingLeft: 3 } : {},
            row.tone === 'notice' ? { backgroundColor: TINT.practice } : {},
            row.tone === 'total' ? { borderTopWidth: 1, borderTopColor: TEAL } : {},
          ]}
        >
          {cols.map((_, i) => (
            <View key={i} style={[styles.tableCell, { flex: flexOf(i) }]}>
              <CellView cell={row.cells[i] ?? null} align={aligns[i]} bold={row.tone === 'total'} />
            </View>
          ))}
        </View>
      ))}
      {caption && <Text style={styles.note}>{caption}</Text>}
    </View>
  );
}

// --- Course criteria -----------------------------------------------------------------------

/** One course in a student's report: where its grade comes from, and the student's standing. */
export interface CourseCriteriaEntry {
  id: string;
  course: { code: string; title: string };
  term: { name: string };
  instructor: string;
  standing: CourseStanding;
}

const gradeText = (n: number | null) => (n === null ? '—' : formatGrade(n));

/**
 * One course in a student's report: its name and term, the student's course
 * grade at the right, the criteria it is assessed on with the student's
 * average on each, then whatever the report puts under it (that course's
 * work). The heading and the criteria stay on one page; the work may break
 * across pages. The real and the demo Student report share it.
 */
export function CourseBlock({ entry, children }: { entry: CourseCriteriaEntry; children?: ReactNode }) {
  const { course, term, instructor, standing } = entry;
  const items = standing.criteria.reduce((n, c) => n + c.items, 0);
  const scored = standing.criteria.reduce((n, c) => n + c.scored, 0);
  const partial = standing.scored_weight < 100;
  const detail = standing.invalid
    ? "the criteria don't add up to 100%"
    : standing.grade === null
      ? 'nothing scored yet'
      : standing.auto
        ? `${scored} of ${items} items scored`
        : `${standing.scored_weight}% of the grade scored`;
  const gradeShown = standing.invalid || standing.grade === null ? null : standing.grade;
  return (
    <View style={{ marginTop: 10 }}>
      <View wrap={false} minPresenceAhead={90}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={courseHeading}>
              {course.code} – {course.title}
            </Text>
            <Text style={styles.courseSub}>
              {term.name} · Instructor: {instructor}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Course grade{partial && standing.grade !== null ? ' so far' : ''}
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontFamily: reportFonts.display,
                fontWeight: 700,
                color: gradeShown === null ? FAINT : bandColor(gradeShown),
              }}
            >
              {standing.invalid ? '—' : gradeText(standing.grade)}
            </Text>
            <Text style={{ fontSize: 8, color: MUTED }}>({detail})</Text>
          </View>
        </View>
        <Table
          head={[{ label: 'Criterion' }, { label: 'Weight' }, { label: 'Scored' }, { label: 'Average' }]}
          widths={[3, 1.3, 1.3, 1.9]}
          rows={standing.criteria.map((c) => [
            c.name,
            `${c.weight}%`,
            `${c.scored}/${c.items}`,
            { score: c.score, text: c.score === null ? undefined : formatGrade(c.score) },
          ])}
          emptyText={standing.auto ? 'Nothing to grade in this course yet.' : 'No grading criteria set for this course yet.'}
        />
      </View>
      {children}
    </View>
  );
}

/** How a course grade is worked out, said once under the last course. */
export function CourseCriteriaNote({ courses }: { courses: CourseCriteriaEntry[] }) {
  const auto = courses.some((c) => c.standing.auto && c.standing.criteria.length);
  const weighted = courses.some((c) => !c.standing.auto && c.standing.criteria.length);
  if (!auto && !weighted) return null;
  return (
    <Note>
      {auto && "Weight is a criterion's share of the course's items: the course grade is the average of every scored item. "}
      {weighted && "The course grade is each criterion's average times its weight, added up. "}
      Work with no score yet is left out, so a grade reads as the grade so far.
    </Note>
  );
}

/**
 * A small heading over one table inside a block: a title and, in muted type,
 * how its rows are ordered. It keeps room for the header row and the first
 * rows after it on the same page.
 */
export function TableTitle({ title, caption }: { title: string; caption?: string }) {
  return (
    <View minPresenceAhead={64} wrap={false} style={{ marginTop: 8, marginBottom: 3, flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ fontSize: 9.5, fontWeight: 700 }}>{title}</Text>
      {caption && <Text style={{ fontSize: 8, color: MUTED, marginLeft: 6 }}>{caption}</Text>}
    </View>
  );
}

/** A course's title in the Section font, a step under a Section heading. */
const courseHeading = {
  fontSize: 12,
  get fontFamily() {
    return reportFonts.display;
  },
  fontWeight: 700,
  color: INK,
} as const;
