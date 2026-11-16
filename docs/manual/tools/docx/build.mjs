// Builds the printable user manual, docs/manual/iCARE-User-Manual.docx, from the
// Markdown guides beside it: a cover, a table of contents, one chapter per guide,
// figures numbered by chapter, callout boxes, and page references in place of
// links. See README.md beside this file.
//
//   node docs/manual/tools/docx/build.mjs [--out <file.docx>]
//
// The table of contents and the page references are Word fields. The file asks
// Word to fill them in when it opens; refresh.ps1 does that once and saves.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const MANUAL = path.join(ROOT, "docs/manual");
// Both libraries are already in the apps' node_modules.
const MarkdownIt = createRequire(path.join(ROOT, "mobile/package.json"))("markdown-it");
const JSZip = createRequire(path.join(ROOT, "web/package.json"))("jszip");

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const OUT = outAt >= 0 ? path.resolve(args[outAt + 1]) : path.join(MANUAL, "iCARE-User-Manual.docx");

const TITLE = "iCARE++ User Manual";
const SUBTITLE = "Setup guide, and guides for Admins, Deans, Program Chairs, Instructors and Students";
const EDITION = "Version 1.0 · November 2026";
const LOGO = path.join(ROOT, "web/public/logo-no-bg.png");

/** Chapters in print order. `title` replaces the guide's own heading. */
const CHAPTERS = [
  { file: "README.md", title: "About this manual" },
  { file: "setup-1-getting-started.md" },
  { file: "common-tasks.md" },
  { file: "admin.md" },
  { file: "dean.md" },
  { file: "program-chair.md" },
  { file: "instructor.md" },
  { file: "student.md" },
  { file: "setup-2-technical.md" },
];

/** Wording that only fits the online files. Each must match exactly once. */
const PRINT_EDITS = {
  "README.md": [
    [/This page is the\s+starting point/, "This chapter is the starting point"],
    [
      /Figures are numbered from 1 in each guide\. A figure's caption starts with "Figure N\."/,
      'Figures are numbered within each chapter: "Figure 4.2" is the second figure in Chapter 4.',
    ],
  ],
};

// ---------------------------------------------------------------------------
// Page and type
// ---------------------------------------------------------------------------

// US Letter (short bond), 1 in margins and a 0.25 in binding gutter.
const PAGE = { w: 12240, h: 15840, margin: 1440, gutter: 360 };
const TEXT_W = PAGE.w - 2 * PAGE.margin - PAGE.gutter; // twips
const EMU_PER_TWIP = 635;
const MAX_IMG_H_IN = 7.4;
const PHONE_W_IN = 2.7;
const WEB_PX_PER_IN = 120; // web shots are 1x; this prints them a little smaller than on screen

const FONT = "Calibri";
const MONO = "Consolas";
const C = {
  accent: "176170",
  text: "1F2933",
  muted: "5F6B73",
  rule: "C9D3D6",
  headFill: "E6EFF1",
  codeFill: "F2F4F5",
  note: { border: "176170", fill: "EEF5F6", label: "Note" },
  important: { border: "B45309", fill: "FDF3E7", label: "Important" },
};

const LIST_LEFT = (level) => 720 + 360 * level;

// ---------------------------------------------------------------------------
// Read and parse
// ---------------------------------------------------------------------------

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

function prepare(ch, index) {
  let src = fs.readFileSync(path.join(MANUAL, ch.file), "utf8");
  for (const [re, replacement] of PRINT_EDITS[ch.file] ?? []) {
    const hits = (src.match(new RegExp(re.source, "g")) || []).length;
    if (hits !== 1) throw new Error(`${ch.file}: print edit ${re} matched ${hits} times`);
    src = src.replace(re, replacement);
  }
  // Phone screenshots are <img> tags with a width; turn them into images
  // titled "phone" so they print at phone size.
  src = src.replace(/<img\b[^>]*>/g, (tag) => {
    const attr = (name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] ?? "";
    const alt = attr("alt").replace(/([[\]])/g, "\\$1");
    return `![${alt}](${attr("src")} "phone")`;
  });
  // Figures are numbered by chapter in print.
  src = src.replace(/\bFigure (\d+)\b/g, (_, n) => `Figure ${index + 1}.${n}`);
  return src;
}

/** Turns markdown-it's flat token list into a tree of open/close pairs. */
function toTree(tokens) {
  const root = { type: "root", children: [] };
  const stack = [root];
  for (const token of tokens) {
    if (token.nesting === 1) {
      const node = { type: token.type.replace(/_open$/, ""), token, children: [] };
      stack.at(-1).children.push(node);
      stack.push(node);
    } else if (token.nesting === -1) {
      stack.pop();
    } else {
      stack.at(-1).children.push({ type: token.type, token, children: token.children || [] });
    }
  }
  return root;
}

const plain = (inline) =>
  (inline.children || []).map((c) => (c.type === "text" || c.type === "code_inline" ? c.content : "")).join("");

/** GitHub's heading anchors, as the guides' links use them. */
const slug = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\p{L}\p{N}\- ]/gu, "")
    .replace(/ /g, "-");

const chapters = CHAPTERS.map((ch, i) => {
  const tokens = md.parse(prepare(ch, i), {});
  return { ...ch, n: i + 1, tokens, tree: toTree(tokens) };
});

// Every heading gets a hidden bookmark (_Ref…) for links, page references and
// the table of contents. H1 and H2 are numbered: "4", "4.3".
const anchors = new Map();
let bookmarkCount = 0;
for (const ch of chapters) {
  const seen = new Map();
  let h2 = 0;
  ch.tokens.forEach((t, i) => {
    if (t.type !== "heading_open") return;
    const inline = ch.tokens[i + 1];
    const text = plain(inline);
    const base = slug(text);
    const dup = seen.get(base) ?? 0;
    seen.set(base, dup + 1);
    const level = Number(t.tag.slice(1));
    const meta = {
      id: ++bookmarkCount,
      bookmark: `_Ref9${String(bookmarkCount).padStart(8, "0")}`,
      level,
      chapter: ch,
      number: level === 1 ? `${ch.n}` : level === 2 ? `${ch.n}.${++h2}` : null,
      title: level === 1 && ch.title ? ch.title : text,
    };
    t.meta = meta;
    anchors.set(`${ch.file}#${dup ? `${base}-${dup}` : base}`, meta);
    if (level === 1) anchors.set(`${ch.file}#`, meta);
  });
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function rPr({ b, i, s, code, color, size, style } = {}) {
  const parts = [];
  if (style) parts.push(`<w:rStyle w:val="${style}"/>`);
  if (code) parts.push(`<w:rFonts w:ascii="${MONO}" w:hAnsi="${MONO}" w:cs="${MONO}"/>`);
  if (b) parts.push("<w:b/>");
  if (i) parts.push("<w:i/>");
  if (s) parts.push("<w:strike/>");
  if (color) parts.push(`<w:color w:val="${color}"/>`);
  if (code) parts.push(`<w:sz w:val="${size ? size - 2 : 19}"/><w:shd w:val="clear" w:color="auto" w:fill="${C.codeFill}"/>`);
  else if (size) parts.push(`<w:sz w:val="${size}"/>`);
  return parts.length ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}

const run = (text, fmt = {}) => (text ? `<w:r>${rPr(fmt)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : "");

function field(instr, placeholder, fmt = {}) {
  return (
    `<w:r>${rPr(fmt)}<w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
    `<w:r>${rPr(fmt)}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
    `<w:r>${rPr(fmt)}<w:fldChar w:fldCharType="separate"/></w:r>` +
    run(placeholder, fmt) +
    `<w:r>${rPr(fmt)}<w:fldChar w:fldCharType="end"/></w:r>`
  );
}

function pPr({ style, numId, ilvl, indent, jc, keepNext, keepLines, pageBreakBefore, spacingBefore, spacingAfter, extra = "" } = {}) {
  const parts = [];
  if (style) parts.push(`<w:pStyle w:val="${style}"/>`);
  if (keepNext) parts.push("<w:keepNext/>");
  if (keepLines) parts.push("<w:keepLines/>");
  if (pageBreakBefore !== undefined) parts.push(`<w:pageBreakBefore w:val="${pageBreakBefore ? 1 : 0}"/>`);
  if (numId) parts.push(`<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`);
  if (spacingBefore !== undefined || spacingAfter !== undefined) {
    const before = spacingBefore !== undefined ? ` w:before="${spacingBefore}"` : "";
    const after = spacingAfter !== undefined ? ` w:after="${spacingAfter}"` : "";
    parts.push(`<w:spacing${before}${after}/>`);
  }
  if (indent) parts.push(`<w:ind w:left="${indent}"/>`);
  if (jc) parts.push(`<w:jc w:val="${jc}"/>`);
  parts.push(extra);
  const body = parts.join("");
  return body ? `<w:pPr>${body}</w:pPr>` : "";
}

const para = (props, content) => `<w:p>${pPr(props)}${content}</w:p>`;

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const media = new Map(); // absolute path -> { rid, name, w, h }
let drawingId = 0;

function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 1, 4) !== "PNG") throw new Error(`${file} is not a PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function addMedia(file) {
  if (!media.has(file)) {
    if (!fs.existsSync(file)) throw new Error(`missing image ${path.relative(ROOT, file)}`);
    media.set(file, { rid: `rIdImg${media.size + 1}`, name: `image${media.size + 1}.png`, ...pngSize(file) });
  }
  return media.get(file);
}

function drawing(file, alt, widthIn, { border = true } = {}) {
  const m = addMedia(file);
  let w = widthIn;
  let h = (w * m.h) / m.w;
  if (h > MAX_IMG_H_IN) {
    w *= MAX_IMG_H_IN / h;
    h = MAX_IMG_H_IN;
  }
  const cx = Math.round(w * 914400);
  const cy = Math.round(h * 914400);
  const id = ++drawingId;
  const line = border ? `<a:ln w="6350"><a:solidFill><a:srgbClr val="${C.rule}"/></a:solidFill></a:ln>` : "";
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}" descr="${esc(alt)}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${m.name}" descr="${esc(alt)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${m.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${line}</pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

function imageParagraph(img, ctx) {
  const file = path.resolve(MANUAL, img.attrGet("src"));
  const phone = img.attrGet("title") === "phone";
  const maxIn = (ctx.width - ctx.indent) / 1440;
  const m = addMedia(file);
  const widthIn = phone ? Math.min(PHONE_W_IN, maxIn) : Math.min(m.w / WEB_PX_PER_IN, maxIn);
  return para({ jc: "center", indent: ctx.indent, keepNext: true, spacingAfter: 80 }, drawing(file, img.content || plain(img), widthIn));
}

// ---------------------------------------------------------------------------
// Inline content
// ---------------------------------------------------------------------------

const warnings = [];

function linkXml(href, inner, fmt, ctx, wrapped = false) {
  const text = inner.map((c) => c.content || "").join("");
  if (/^(https?:|mailto:)/.test(href)) {
    const shown = href.replace(/^mailto:/, "");
    return inlineXml(inner, fmt, ctx) + (text === shown ? "" : run(` (${shown})`, fmt));
  }
  const [file, frag = ""] = href.split("#");
  const targetFile = file || ctx.ch.file;
  const target = targetFile.endsWith(".md") ? anchors.get(`${targetFile}#${decodeURIComponent(frag)}`) : null;
  if (!target) {
    if (targetFile.endsWith(".md")) warnings.push(`${ctx.ch.file}: link to ${href} has no target`);
    return inlineXml(inner, fmt, ctx);
  }
  const linked = (content) =>
    `<w:hyperlink w:anchor="${target.bookmark}" w:history="1">${content}</w:hyperlink>`;
  const linkFmt = { ...fmt, style: "Hyperlink" };
  if (target.level === 1) {
    // A whole guide is a chapter in print.
    const label = `Chapter ${target.chapter.n}`;
    if (/\.md$/.test(text.trim())) return linked(run(`${label}, ${target.title}`, linkFmt));
    if (target.chapter === ctx.ch) return inlineXml(inner, fmt, ctx);
    return linked(inlineXml(inner, linkFmt, ctx)) + run(wrapped ? `, ${label}` : ` (${label})`, fmt);
  }
  return (
    linked(inlineXml(inner, linkFmt, ctx)) +
    run(wrapped ? ", page " : " (page ", fmt) +
    field(`PAGEREF ${target.bookmark} \\h`, "?", fmt) +
    run(wrapped ? "" : ")", fmt)
  );
}

function inlineXml(children, base = {}, ctx) {
  let out = "";
  const st = { ...base, b: base.b || 0, i: base.i || 0, s: base.s || 0 };
  let lastText = "";
  for (let k = 0; k < children.length; k++) {
    const c = children[k];
    if (c.type !== "text") lastText = "";
    switch (c.type) {
      case "text":
        out += run(c.content, st);
        lastText = c.content;
        break;
      case "softbreak":
        out += run(" ", st);
        break;
      case "hardbreak":
        out += "<w:r><w:br/></w:r>";
        break;
      case "strong_open":
        st.b++;
        break;
      case "strong_close":
        st.b--;
        break;
      case "em_open":
        st.i++;
        break;
      case "em_close":
        st.i--;
        break;
      case "s_open":
        st.s++;
        break;
      case "s_close":
        st.s--;
        break;
      case "code_inline":
        out += run(c.content, { ...st, code: true });
        break;
      case "link_open": {
        let depth = 1;
        let j = k + 1;
        for (; j < children.length; j++) {
          if (children[j].type === "link_open") depth++;
          if (children[j].type === "link_close" && --depth === 0) break;
        }
        const wrapped = /\($/.test(lastText) && /^\)/.test(children[j + 1]?.content ?? "");
        out += linkXml(c.attrGet("href"), children.slice(k + 1, j), { ...st }, ctx, wrapped);
        k = j;
        break;
      }
      case "image":
        out += drawing(path.resolve(MANUAL, c.attrGet("src")), plain(c), 1.5);
        break;
      default:
        if (c.content) out += run(c.content, st);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const lists = []; // ordered-list instances: { start, ilvl }

function isCaption(inline) {
  const kids = (inline.children || []).filter((c) => !(c.type === "text" && !c.content.trim()));
  return kids.length >= 3 && kids[0].type === "em_open" && kids.at(-1).type === "em_close" && /^Figure \d/.test(plain(inline));
}

function blocks(nodes, ctx) {
  return nodes.map((node) => block(node, ctx)).join("");
}

function listItemProps(ctx) {
  if (ctx.item && !ctx.item.used) {
    ctx.item.used = true;
    return { numId: ctx.item.numId, ilvl: ctx.item.ilvl };
  }
  return { indent: ctx.indent };
}

function block(node, ctx) {
  const t = node.token;
  switch (node.type) {
    case "heading": {
      const meta = t.meta;
      const style = `Heading${meta.level}`;
      const label = meta.number ? run(`${meta.number} `) : "";
      const content = meta.level === 1 ? run(meta.title) : inlineXml(node.children[0].children, {}, ctx);
      const first = meta.level === 1 && meta.chapter.n === 1;
      return (
        `<w:p>${pPr({ style, pageBreakBefore: first ? false : undefined })}` +
        `<w:bookmarkStart w:id="${meta.id}" w:name="${meta.bookmark}"/>${label}${content}` +
        `<w:bookmarkEnd w:id="${meta.id}"/></w:p>`
      );
    }
    case "paragraph": {
      const inline = node.children[0];
      const kids = (inline.children || []).filter((c) => !(c.type === "softbreak" || (c.type === "text" && !c.content.trim())));
      if (kids.length === 1 && kids[0].type === "image") {
        const props = listItemProps(ctx);
        if (props.numId) return para(props, "") + imageParagraph(kids[0], ctx);
        return imageParagraph(kids[0], ctx);
      }
      if (isCaption(inline)) {
        return para({ style: "Caption", indent: ctx.indent || undefined }, inlineXml(inline.children, { i: -1 }, ctx));
      }
      return para({ ...listItemProps(ctx), style: ctx.paraStyle }, inlineXml(inline.children, {}, ctx));
    }
    case "bullet_list":
    case "ordered_list": {
      const ilvl = ctx.level ?? 0;
      let numId = 1;
      if (node.type === "ordered_list") {
        lists.push({ start: Number(t.attrGet("start") || 1), ilvl });
        numId = lists.length + 1;
      }
      return node.children
        .map((item) =>
          blocks(item.children, {
            ...ctx,
            level: ilvl + 1,
            indent: LIST_LEFT(ilvl),
            item: { numId, ilvl, used: false },
          }),
        )
        .join("");
    }
    case "blockquote":
      return callout(node, ctx);
    case "fence":
    case "code_block": {
      const lines = t.content.replace(/\n$/, "").split("\n");
      const body = lines.map((l, i) => (i ? "<w:r><w:br/></w:r>" : "") + run(l, {})).join("");
      return para({ style: "Code", indent: ctx.indent || undefined }, body);
    }
    case "table":
      return table(node, ctx);
    case "hr":
      return para({ extra: `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${C.rule}"/></w:pBdr>` }, "");
    default:
      warnings.push(`${ctx.ch.file}: unhandled block ${node.type}`);
      return "";
  }
}

function callout(node, ctx) {
  // GitHub alerts: the first paragraph starts with [!NOTE] or [!IMPORTANT].
  const first = node.children[0]?.type === "paragraph" ? node.children[0].children[0] : null;
  let kind = null;
  if (first?.children?.length && first.children[0].type === "text") {
    const m = first.children[0].content.match(/^\[!(NOTE|IMPORTANT|TIP|WARNING|CAUTION)\]\s*/);
    if (m) {
      kind = m[1] === "NOTE" || m[1] === "TIP" ? C.note : C.important;
      first.children[0].content = first.children[0].content.slice(m[0].length);
      if (!first.children[0].content && first.children[1]?.type === "softbreak") first.children.splice(0, 2);
      else if (!first.children[0].content) first.children.splice(0, 1);
    }
  }
  kind ??= C.note;
  const width = ctx.width - ctx.indent;
  const pad = 160;
  const inner = { ...ctx, width: width - 2 * pad, indent: 0, item: null, level: 0 };
  const content =
    para({ style: "CalloutLabel", keepNext: true }, run(kind.label, { color: kind.border })) +
    blocks(node.children, inner);
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/>` +
    (ctx.indent ? `<w:tblInd w:w="${ctx.indent}" w:type="dxa"/>` : "") +
    `<w:tblBorders><w:top w:val="nil"/><w:left w:val="single" w:sz="24" w:space="0" w:color="${kind.border}"/>` +
    `<w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="${pad}" w:type="dxa"/>` +
    `<w:bottom w:w="40" w:type="dxa"/><w:right w:w="${pad}" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${width}"/></w:tblGrid>` +
    `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="${kind.fill}"/></w:tcPr>${content}</w:tc></w:tr></w:tbl>` +
    para({ style: "Spacer" }, "")
  );
}

function table(node, ctx) {
  const rows = [];
  for (const section of node.children) {
    for (const tr of section.children) {
      rows.push({
        header: section.type === "thead",
        cells: tr.children.map((cell) => ({
          inline: cell.children[0],
          align: (cell.token.attrGet("style") || "").match(/text-align:(\w+)/)?.[1],
        })),
      });
    }
  }
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const width = ctx.width - ctx.indent;
  // Column widths follow how much text each column holds.
  const weight = Array.from({ length: cols }, (_, c) => {
    const lens = rows.map((r) => (r.cells[c] ? plain(r.cells[c].inline).length : 0));
    const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
    return Math.min(60, Math.max(8, avg * 0.6 + Math.max(...lens) * 0.4));
  });
  const total = weight.reduce((a, b) => a + b, 0);
  const widths = weight.map((w) => Math.floor((width * w) / total));
  // No column narrower than its longest word, so words never break mid-word.
  const longestWord = (s) => Math.max(0, ...s.split(/\s+/).map((w) => w.length));
  const minWidths = Array.from({ length: cols }, (_, c) => {
    const longest = Math.max(...rows.map((r) => (r.cells[c] ? longestWord(plain(r.cells[c].inline)) : 0)));
    return Math.min(Math.round(width * 0.4), longest * 110 + 260);
  });
  const deficit = widths.reduce((sum, w, c) => sum + Math.max(0, minWidths[c] - w), 0);
  const slack = widths.reduce((sum, w, c) => sum + Math.max(0, w - minWidths[c]), 0);
  if (deficit > 0 && slack > deficit) {
    widths.forEach((w, c) => {
      widths[c] = w < minWidths[c] ? minWidths[c] : Math.floor(w - ((w - minWidths[c]) * deficit) / slack);
    });
  }
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${C.rule}"/>`;
  const head =
    `<w:tblPr><w:tblW w:w="${width}" w:type="dxa"/>` +
    (ctx.indent ? `<w:tblInd w:w="${ctx.indent}" w:type="dxa"/>` : "") +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>` +
    `<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
  const body = rows
    .map((r) => {
      const trPr = `<w:trPr><w:cantSplit/>${r.header ? "<w:tblHeader/>" : ""}</w:trPr>`;
      const cells = widths
        .map((w, c) => {
          const cell = r.cells[c];
          const shade = r.header ? `<w:shd w:val="clear" w:color="auto" w:fill="${C.headFill}"/>` : "";
          const text = cell ? inlineXml(cell.inline.children, r.header ? { b: 1 } : {}, { ...ctx, indent: 0 }) : "";
          const jc = cell?.align === "center" ? "center" : cell?.align === "right" ? "right" : undefined;
          return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade}</w:tcPr>${para({ style: "TableText", jc }, text)}</w:tc>`;
        })
        .join("");
      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join("");
  return `<w:tbl>${head}${body}</w:tbl>` + para({ style: "Spacer" }, "");
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

const sectPr = ({ first }) =>
  `<w:sectPr>` +
  (first ? "" : `<w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/>`) +
  `<w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/>` +
  `<w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" ` +
  `w:header="720" w:footer="720" w:gutter="${PAGE.gutter}"/>` +
  (first ? "" : `<w:pgNumType w:start="1"/>`) +
  `</w:sectPr>`;

function cover() {
  const logo = drawing(LOGO, "iCARE++", 3.2, { border: false });
  return (
    para({ spacingBefore: 2400, spacingAfter: 0 }, "") +
    para({ jc: "center", spacingAfter: 600 }, logo) +
    para({ style: "Title" }, run(TITLE)) +
    para({ style: "Subtitle" }, run(SUBTITLE)) +
    para({ jc: "center", spacingBefore: 3600 }, run(EDITION, { color: C.muted })) +
    para({ jc: "center" }, run("https://www.i-care.dev", { color: C.muted })) +
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
  );
}

function contents() {
  return (
    para({ style: "TOCHeading" }, run("Contents")) +
    `<w:p>${field('TOC \\o "1-2" \\h \\z \\u', "Open this file in Word and choose Update Field to build the contents.")}</w:p>` +
    `<w:p>${pPr({ extra: sectPr({ first: true }) })}</w:p>`
  );
}

const body =
  cover() +
  contents() +
  chapters.map((ch) => blocks(ch.tree.children, { ch, width: TEXT_W, indent: 0 })).join("") +
  sectPr({ first: false });

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const documentXml = `${XML}<w:document ${NS}><w:body>${body}</w:body></w:document>`;

const headerXml =
  `${XML}<w:hdr ${NS}><w:p>${pPr({ style: "Header", jc: "right" })}` +
  `${field('STYLEREF "heading 1"', TITLE, { color: C.muted, size: 17 })}</w:p></w:hdr>`;

const footerXml =
  `${XML}<w:ftr ${NS}><w:p>${pPr({ style: "Footer", extra: `<w:tabs><w:tab w:val="right" w:pos="${TEXT_W}"/></w:tabs>` })}` +
  `${run(TITLE, { color: C.muted, size: 17 })}<w:r><w:tab/></w:r>` +
  `${field("PAGE", "1", { color: C.muted, size: 17 })}</w:p></w:ftr>`;

function style(type, id, name, { basedOn = "Normal", next, pPr: p = "", rPr: r = "", extra = "" } = {}) {
  return (
    `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>` +
    (basedOn && id !== "Normal" ? `<w:basedOn w:val="${basedOn}"/>` : "") +
    (next ? `<w:next w:val="${next}"/>` : "") +
    `<w:qFormat/>${extra}${p ? `<w:pPr>${p}</w:pPr>` : ""}${r ? `<w:rPr>${r}</w:rPr>` : ""}</w:style>`
  );
}

const tocTab = `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${TEXT_W}"/></w:tabs>`;

const stylesXml =
  `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/>` +
  `<w:color w:val="${C.text}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  style("paragraph", "Normal", "Normal").replace('w:styleId="Normal"', 'w:default="1" w:styleId="Normal"') +
  style("paragraph", "Heading1", "heading 1", {
    next: "Normal",
    pPr: `<w:keepNext/><w:keepLines/><w:pageBreakBefore/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="6" w:color="${C.accent}"/></w:pBdr><w:spacing w:before="0" w:after="360"/><w:outlineLvl w:val="0"/>`,
    rPr: `<w:b/><w:color w:val="${C.accent}"/><w:sz w:val="48"/>`,
  }) +
  style("paragraph", "Heading2", "heading 2", {
    next: "Normal",
    pPr: `<w:keepNext/><w:keepLines/><w:spacing w:before="400" w:after="120"/><w:outlineLvl w:val="1"/>`,
    rPr: `<w:b/><w:color w:val="${C.accent}"/><w:sz w:val="32"/>`,
  }) +
  style("paragraph", "Heading3", "heading 3", {
    next: "Normal",
    pPr: `<w:keepNext/><w:keepLines/><w:spacing w:before="280" w:after="80"/><w:outlineLvl w:val="2"/>`,
    rPr: `<w:b/><w:color w:val="${C.text}"/><w:sz w:val="26"/>`,
  }) +
  style("paragraph", "Title", "Title", { pPr: '<w:spacing w:after="240"/><w:jc w:val="center"/>', rPr: `<w:b/><w:color w:val="${C.accent}"/><w:sz w:val="64"/>` }) +
  style("paragraph", "Subtitle", "Subtitle", { pPr: '<w:jc w:val="center"/>', rPr: `<w:color w:val="${C.muted}"/><w:sz w:val="28"/>` }) +
  style("paragraph", "Caption", "caption", {
    pPr: '<w:spacing w:before="0" w:after="280"/><w:jc w:val="center"/>',
    rPr: `<w:i/><w:color w:val="${C.muted}"/><w:sz w:val="18"/>`,
  }) +
  style("paragraph", "Code", "Code", {
    pPr: `<w:keepLines/><w:shd w:val="clear" w:color="auto" w:fill="${C.codeFill}"/><w:spacing w:after="200" w:line="240" w:lineRule="auto"/>`,
    rPr: `<w:rFonts w:ascii="${MONO}" w:hAnsi="${MONO}" w:cs="${MONO}"/><w:sz w:val="18"/>`,
  }) +
  style("paragraph", "TableText", "Table Text", { pPr: '<w:spacing w:after="0" w:line="252" w:lineRule="auto"/>', rPr: '<w:sz w:val="19"/>' }) +
  style("paragraph", "CalloutLabel", "Callout Label", { pPr: '<w:spacing w:after="40"/>', rPr: '<w:b/><w:sz w:val="20"/>' }) +
  style("paragraph", "Spacer", "Spacer", { pPr: '<w:spacing w:after="160" w:line="120" w:lineRule="exact"/>', rPr: '<w:sz w:val="8"/>' }) +
  style("paragraph", "TOCHeading", "TOC Heading", { pPr: '<w:spacing w:after="360"/>', rPr: `<w:b/><w:color w:val="${C.accent}"/><w:sz w:val="40"/>` }) +
  style("paragraph", "TOC1", "toc 1", { next: "Normal", pPr: `${tocTab}<w:spacing w:before="160" w:after="40"/>`, rPr: "<w:b/>" }) +
  style("paragraph", "TOC2", "toc 2", { next: "Normal", pPr: `${tocTab}<w:spacing w:after="20"/><w:ind w:left="360"/>`, rPr: '<w:sz w:val="20"/>' }) +
  style("paragraph", "Header", "header", { pPr: '<w:spacing w:after="0"/>' }) +
  style("paragraph", "Footer", "footer", { pPr: '<w:spacing w:after="0"/>' }) +
  style("character", "Hyperlink", "Hyperlink", { basedOn: null, rPr: `<w:color w:val="${C.accent}"/>` }) +
  `</w:styles>`;

function numberingXml() {
  const bulletChars = ["•", "–", "▪", "•", "–", "▪"];
  const level = (i, fmt, text) =>
    `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/>` +
    `<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${LIST_LEFT(i)}" w:hanging="360"/></w:pPr>` +
    (fmt === "bullet" ? `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/></w:rPr>` : "") +
    `</w:lvl>`;
  const decimal = ["decimal", "lowerLetter", "lowerRoman", "decimal", "lowerLetter", "lowerRoman"];
  return (
    `${XML}<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>` +
    bulletChars.map((ch, i) => level(i, "bullet", ch)).join("") +
    `</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>` +
    decimal.map((fmt, i) => level(i, fmt, `%${i + 1}.`)).join("") +
    `</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>` +
    lists
      .map(
        (l, i) =>
          `<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/>` +
          `<w:lvlOverride w:ilvl="${l.ilvl}"><w:startOverride w:val="${l.start}"/></w:lvlOverride></w:num>`,
      )
      .join("") +
    `</w:numbering>`
  );
}

const settingsXml =
  `${XML}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:updateFields w:val="true"/>` +
  `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>` +
  `</w:settings>`;

const rel = (id, type, target) =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;

const docRels =
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  rel("rIdStyles", "styles", "styles.xml") +
  rel("rIdNumbering", "numbering", "numbering.xml") +
  rel("rIdSettings", "settings", "settings.xml") +
  rel("rIdHeader", "header", "header1.xml") +
  rel("rIdFooter", "footer", "footer1.xml") +
  [...media.values()].map((m) => rel(m.rid, "image", `media/${m.name}`)).join("") +
  `</Relationships>`;

const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const coreXml =
  `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
  `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
  `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(TITLE)}</dc:title>` +
  `<dc:subject>${esc(SUBTITLE)}</dc:subject><dc:creator>iCARE++</dc:creator>` +
  `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
  `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

const appXml =
  `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
  `<Application>iCARE++ manual builder</Application></Properties>`;

const wordType = (part) => `application/vnd.openxmlformats-officedocument.wordprocessingml.${part}+xml`;
const contentTypes =
  `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
  `<Override PartName="/word/document.xml" ContentType="${wordType("document.main")}"/>` +
  `<Override PartName="/word/styles.xml" ContentType="${wordType("styles")}"/>` +
  `<Override PartName="/word/numbering.xml" ContentType="${wordType("numbering")}"/>` +
  `<Override PartName="/word/settings.xml" ContentType="${wordType("settings")}"/>` +
  `<Override PartName="/word/header1.xml" ContentType="${wordType("header")}"/>` +
  `<Override PartName="/word/footer1.xml" ContentType="${wordType("footer")}"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
  `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
  `</Types>`;

const rootRels =
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
  `</Relationships>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", contentTypes);
zip.file("_rels/.rels", rootRels);
zip.file("docProps/core.xml", coreXml);
zip.file("docProps/app.xml", appXml);
zip.file("word/document.xml", documentXml);
zip.file("word/styles.xml", stylesXml);
zip.file("word/numbering.xml", numberingXml());
zip.file("word/settings.xml", settingsXml);
zip.file("word/header1.xml", headerXml);
zip.file("word/footer1.xml", footerXml);
zip.file("word/_rels/document.xml.rels", docRels);
for (const [file, m] of media) zip.file(`word/media/${m.name}`, fs.readFileSync(file));

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
fs.writeFileSync(OUT, buf);

for (const w of warnings) console.warn(`warning: ${w}`);
const figures = [...media.keys()].filter((f) => f !== LOGO).length;
console.log(
  `${path.relative(ROOT, OUT)}: ${chapters.length} chapters, ${figures} figures, ` +
    `${lists.length} numbered lists, ${(buf.length / 1048576).toFixed(1)} MB`,
);
