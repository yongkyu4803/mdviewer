import { marked, type Token, type Tokens } from 'marked';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

/**
 * Shared markdown -> document conversion used by both the PDF and DOCX
 * exporters. `marked`'s lexer already parses the document into a token
 * tree, so both renderers walk the same normalized `Block` structure
 * instead of re-implementing markdown parsing twice.
 */

interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  link?: string;
}

type Block =
  | { kind: 'heading'; depth: number; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'code'; text: string; lang?: string }
  | { kind: 'blockquote'; blocks: Block[] }
  | { kind: 'hr' }
  | { kind: 'list'; ordered: boolean; start: number | ''; items: ListItem[] }
  | { kind: 'table'; align: Array<'center' | 'left' | 'right' | null>; header: Run[][]; rows: Run[][][] };

interface ListItem {
  content: Block[];
  task: boolean;
  checked?: boolean;
  sub: Extract<Block, { kind: 'list' }>[];
}

function flattenInline(tokens: Token[] | undefined, style: Omit<Run, 'text'> = {}): Run[] {
  if (!tokens) return [];
  const runs: Run[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text': {
        const tt = t as Tokens.Text;
        if (tt.tokens && tt.tokens.length) {
          runs.push(...flattenInline(tt.tokens, style));
        } else {
          runs.push({ ...style, text: tt.text });
        }
        break;
      }
      case 'strong':
        runs.push(...flattenInline((t as Tokens.Strong).tokens, { ...style, bold: true }));
        break;
      case 'em':
        runs.push(...flattenInline((t as Tokens.Em).tokens, { ...style, italic: true }));
        break;
      case 'del':
        runs.push(...flattenInline((t as Tokens.Del).tokens, { ...style, strike: true }));
        break;
      case 'codespan':
        runs.push({ ...style, code: true, text: (t as Tokens.Codespan).text });
        break;
      case 'link': {
        const lt = t as Tokens.Link;
        runs.push(...flattenInline(lt.tokens, { ...style, link: lt.href }));
        break;
      }
      case 'image': {
        const it = t as Tokens.Image;
        runs.push({ ...style, text: `[${it.text || it.title || 'image'}]` });
        break;
      }
      case 'br':
        runs.push({ ...style, text: '\n' });
        break;
      case 'escape':
        runs.push({ ...style, text: (t as Tokens.Escape).text });
        break;
      case 'html':
        break;
      default: {
        const generic = t as Tokens.Generic;
        if (typeof generic.text === 'string') runs.push({ ...style, text: generic.text });
      }
    }
  }
  return runs;
}

function tokensToBlocks(tokens: Token[]): Block[] {
  const blocks: Block[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'heading': {
        const h = t as Tokens.Heading;
        blocks.push({ kind: 'heading', depth: h.depth, runs: flattenInline(h.tokens) });
        break;
      }
      case 'paragraph': {
        const p = t as Tokens.Paragraph;
        blocks.push({ kind: 'paragraph', runs: flattenInline(p.tokens) });
        break;
      }
      case 'text': {
        const tx = t as Tokens.Text;
        blocks.push({ kind: 'paragraph', runs: tx.tokens ? flattenInline(tx.tokens) : [{ text: tx.text }] });
        break;
      }
      case 'code': {
        const c = t as Tokens.Code;
        blocks.push({ kind: 'code', text: c.text, lang: c.lang });
        break;
      }
      case 'blockquote': {
        const bq = t as Tokens.Blockquote;
        blocks.push({ kind: 'blockquote', blocks: tokensToBlocks(bq.tokens) });
        break;
      }
      case 'list': {
        const l = t as Tokens.List;
        const items: ListItem[] = l.items.map((item) => {
          const itemBlocks = tokensToBlocks(item.tokens);
          const sub = itemBlocks.filter((b): b is Extract<Block, { kind: 'list' }> => b.kind === 'list');
          const content = itemBlocks.filter((b) => b.kind !== 'list');
          return { content, task: item.task, checked: item.checked, sub };
        });
        blocks.push({ kind: 'list', ordered: l.ordered, start: l.start, items });
        break;
      }
      case 'table': {
        const tb = t as Tokens.Table;
        blocks.push({
          kind: 'table',
          align: tb.align,
          header: tb.header.map((c) => flattenInline(c.tokens)),
          rows: tb.rows.map((row) => row.map((c) => flattenInline(c.tokens))),
        });
        break;
      }
      case 'hr':
        blocks.push({ kind: 'hr' });
        break;
      default:
        break; // space, def, html, etc. carry no visible export content
    }
  }
  return blocks;
}

function baseFileName(title: string): string {
  const stripped = title.replace(/\.(md|markdown|txt)$/i, '').trim();
  return stripped || 'document';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

// jsPDF's built-in fonts (helvetica/courier) only cover WinAnsi (Latin) glyphs — Korean,
// or any other non-Latin text, renders as garbage with them. Rather than embedding a CJK
// font, we render the same HTML the live preview uses into an off-screen, print-styled
// container (plain hex colors — not the app's oklch/CSS-variable theme, which html2canvas
// can't parse) and let the browser's own font stack draw the glyphs, via jsPDF's `.html()`
// (html2canvas-backed) renderer.
const PDF_FONT_STACK =
  "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR','Noto Sans CJK KR',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const PDF_MONO_STACK = "'D2Coding','Nanum Gothic Coding',Menlo,Consolas,'Courier New',monospace";

function pdfPrintCss(): string {
  return `
    .md-export-root {
      color: #111111;
      background: #ffffff;
      font-family: ${PDF_FONT_STACK};
      font-size: 13px;
      line-height: 1.7;
      word-break: break-word;
    }
    .md-export-root h1, .md-export-root h2, .md-export-root h3,
    .md-export-root h4, .md-export-root h5, .md-export-root h6 {
      font-weight: 700; color: #111111; line-height: 1.35;
      margin: 1.4em 0 0.6em;
    }
    .md-export-root h1 { font-size: 1.9em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
    .md-export-root h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25em; }
    .md-export-root h3 { font-size: 1.2em; }
    .md-export-root h4 { font-size: 1.05em; }
    .md-export-root p { margin: 0 0 0.9em; color: #374151; }
    .md-export-root strong { font-weight: 700; color: #111111; }
    .md-export-root em { color: #374151; }
    .md-export-root a { color: #111111; text-decoration: underline; }
    .md-export-root code {
      font-family: ${PDF_MONO_STACK}; font-size: 0.88em;
      background: #ebebeb; color: #111111; padding: 0.12em 0.35em; border-radius: 4px;
    }
    .md-export-root pre {
      background: #f5f5f5; border: 1px solid #e5e7eb; border-radius: 6px;
      padding: 0.9em 1em; margin: 0 0 1em; overflow-wrap: break-word; white-space: pre-wrap;
    }
    .md-export-root pre code { background: transparent; padding: 0; font-size: 0.85em; }
    .md-export-root blockquote {
      border-left: 3px solid #d1d5db; padding: 0.5em 1em; margin: 1em 0;
      color: #6b7280; font-style: italic;
    }
    .md-export-root ul, .md-export-root ol { margin: 0 0 0.9em; padding-left: 1.4em; color: #374151; }
    .md-export-root li { margin-bottom: 0.25em; }
    .md-export-root table { width: 100%; border-collapse: collapse; margin: 0 0 1em; font-size: 0.92em; }
    .md-export-root th, .md-export-root td { border: 1px solid #e5e7eb; padding: 0.5em 0.7em; text-align: left; }
    .md-export-root th { background: #f3f4f6; font-weight: 700; }
    .md-export-root tr:nth-child(even) td { background: #fafafa; }
    .md-export-root img { max-width: 100%; border-radius: 6px; margin: 0.6em 0; }
    .md-export-root hr { border: none; height: 1px; background: #e5e7eb; margin: 1.4em 0; }
  `;
}

const PDF_CONTAINER_WIDTH_PX = 760;
// A4's printable width here is about 7.3in. Rendering 760 CSS px at 3x gives
// roughly 315 DPI in the output instead of the former ~200 DPI cap.
const PDF_RENDER_SCALE = 3;

export async function exportMarkdownToPdf(title: string, markdown: string): Promise<void> {
  const html = marked.parse(markdown) as string;

  const container = document.createElement('div');
  container.className = 'md-export-root';
  container.innerHTML = `<style>${pdfPrintCss()}</style>${html}`;
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    left: '-99999px',
    width: `${PDF_CONTAINER_WIDTH_PX}px`,
    background: '#ffffff',
    boxSizing: 'border-box',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(container);

  try {
    // Rasterize the whole document once, then slice the tall canvas into page-sized
    // strips ourselves. jsPDF's own `.html()` pagination (context2d + autoPaging) proved
    // unreliable — it produced blank/corrupt pages on this content — so we drive
    // html2canvas + doc.addImage directly instead.
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: PDF_RENDER_SCALE,
      useCORS: true,
      windowWidth: PDF_CONTAINER_WIDTH_PX,
    });

    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const margin = 36;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;

    const pxToPt = contentWidth / canvas.width;
    const pageHeightPx = Math.floor(contentHeight / pxToPt);

    let renderedPx = 0;
    let isFirstPage = true;
    while (renderedPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) break;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

      if (!isFirstPage) doc.addPage();
      isFirstPage = false;
      // PNG keeps glyph edges lossless. JPEG compression was visibly blurring
      // Korean text and fine code fonts, especially when zooming into a PDF.
      doc.addImage(sliceCanvas, 'PNG', margin, margin, contentWidth, sliceHeightPx * pxToPt, undefined, 'FAST');

      renderedPx += sliceHeightPx;
    }

    doc.save(`${baseFileName(title)}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

// ---------------------------------------------------------------------------
// DOCX export
// ---------------------------------------------------------------------------

const DOCX_HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

const ORDERED_LIST_REFERENCE = 'md-ordered-list';

function runsToDocxChildren(runs: Run[]): (TextRun | ExternalHyperlink)[] {
  const children: (TextRun | ExternalHyperlink)[] = [];
  for (const r of runs) {
    const segments = r.text.split('\n');
    segments.forEach((seg, i) => {
      if (i > 0) children.push(new TextRun({ text: '', break: 1 }));
      if (!seg) return;
      const opts: ConstructorParameters<typeof TextRun>[0] = {
        text: seg,
        bold: r.bold,
        italics: r.italic,
        strike: r.strike,
        ...(r.code ? { font: 'Consolas', shading: { fill: 'F2F2F2' } } : {}),
      };
      if (r.link) {
        children.push(new ExternalHyperlink({ link: r.link, children: [new TextRun({ ...opts, style: 'Hyperlink' })] }));
      } else {
        children.push(new TextRun(opts));
      }
    });
  }
  return children;
}

function blocksToDocx(list: Block[], depth = 0): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const block of list) {
    switch (block.kind) {
      case 'heading':
        out.push(new Paragraph({
          heading: DOCX_HEADING_MAP[block.depth] ?? HeadingLevel.HEADING_6,
          children: runsToDocxChildren(block.runs),
          spacing: { before: 240, after: 120 },
        }));
        break;
      case 'paragraph':
        out.push(new Paragraph({
          children: runsToDocxChildren(block.runs),
          spacing: { after: 200 },
          indent: depth ? { left: depth * 360 } : undefined,
        }));
        break;
      case 'code': {
        const lines = block.text.length ? block.text.split('\n') : [''];
        lines.forEach((line) => {
          out.push(new Paragraph({
            children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 20 })],
            shading: { fill: 'F5F5F5' },
            indent: { left: (depth + 1) * 360 },
            spacing: { after: 0 },
          }));
        });
        out.push(new Paragraph({ text: '', spacing: { after: 160 } }));
        break;
      }
      case 'blockquote':
        out.push(...blocksToDocx(block.blocks, depth + 1));
        break;
      case 'hr':
        out.push(new Paragraph({
          border: { bottom: { color: 'AAAAAA', space: 1, style: BorderStyle.SINGLE, size: 6 } },
          spacing: { after: 200 },
        }));
        break;
      case 'list':
        block.items.forEach((item) => {
          const [first, ...rest] = item.content;
          const firstIsParagraph = first && first.kind === 'paragraph';
          const prefix = item.task ? [new TextRun({ text: item.checked ? '☑ ' : '☐ ' })] : [];
          out.push(new Paragraph({
            children: [...prefix, ...(firstIsParagraph ? runsToDocxChildren(first.runs) : [])],
            ...(item.task
              ? { indent: { left: (depth + 1) * 360 } }
              : block.ordered
                ? { numbering: { reference: ORDERED_LIST_REFERENCE, level: depth } }
                : { bullet: { level: depth } }),
            spacing: { after: 80 },
          }));
          const remaining = firstIsParagraph ? rest : item.content;
          if (remaining.length) out.push(...blocksToDocx(remaining, depth + 1));
          if (item.sub.length) out.push(...blocksToDocx(item.sub, depth + 1));
        });
        break;
      case 'table':
        out.push(buildDocxTable(block));
        break;
    }
  }
  return out;
}

function buildDocxTable(block: Extract<Block, { kind: 'table' }>): Table {
  const colCount = block.header.length || 1;
  const makeCell = (runs: Run[], isHeader: boolean) => new TableCell({
    width: { size: Math.floor(100 / colCount), type: WidthType.PERCENTAGE },
    shading: isHeader ? { fill: 'EEEEEE' } : undefined,
    children: [new Paragraph({ children: runsToDocxChildren(isHeader ? runs.map((r) => ({ ...r, bold: true })) : runs) })],
  });
  const headerRow = new TableRow({ children: block.header.map((c) => makeCell(c, true)), tableHeader: true });
  const rows = block.rows.map((r) => new TableRow({ children: r.map((c) => makeCell(c, false)) }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] });
}

export async function exportMarkdownToDocx(title: string, markdown: string): Promise<void> {
  const blocks = tokensToBlocks(marked.lexer(markdown));
  const children = blocksToDocx(blocks);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REFERENCE,
          levels: [0, 1, 2, 3].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 360 * (level + 2), hanging: 260 } } },
          })),
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [{ properties: {}, children: children.length ? children : [new Paragraph('')] }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${baseFileName(title)}.docx`);
}
