import { marked, type Token, type Tokens } from 'marked';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
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

const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const PDF_MARGIN = 48;
const PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
const nanumGothicRegularUrl = '/fonts/NanumGothic.ttf';
const nanumGothicBoldUrl = '/fonts/NanumGothicBold.ttf';

function runsText(runs: Run[]): string {
  return runs.map((run) => run.text).join('');
}

function blockText(block: Block): string {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
      return runsText(block.runs);
    case 'code':
      return block.text;
    case 'blockquote':
      return block.blocks.map(blockText).join('\n');
    case 'list':
      return block.items.map((item) => item.content.map(blockText).join(' ')).join('\n');
    case 'table':
      return [block.header, ...block.rows].map((row) => row.map(runsText).join(' | ')).join('\n');
    case 'hr':
      return '';
  }
}

function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const wrapped: string[] = [];
  for (const sourceLine of text.replace(/\r/g, '').split('\n')) {
    if (!sourceLine) {
      wrapped.push('');
      continue;
    }
    let line = '';
    const append = (part: string) => {
      if (font.widthOfTextAtSize(line + part, size) <= maxWidth) {
        line += part;
        return;
      }
      if (line.trim()) wrapped.push(line.trimEnd());
      line = '';
      for (const character of Array.from(part.trimStart())) {
        if (font.widthOfTextAtSize(line + character, size) > maxWidth && line) {
          wrapped.push(line);
          line = '';
        }
        line += character;
      }
    };
    for (const part of sourceLine.split(/(\s+)/)) {
      if (part) append(part);
    }
    if (line.trim()) wrapped.push(line.trimEnd());
  }
  return wrapped;
}

class PdfLayout {
  private page: PDFPage;
  private y = PDF_PAGE_HEIGHT - PDF_MARGIN;

  constructor(private readonly document: PDFDocument, private readonly regular: PDFFont, private readonly bold: PDFFont) {
    this.page = document.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
  }

  private ensureSpace(height: number) {
    if (this.y - height < PDF_MARGIN) {
      this.page = this.document.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
      this.y = PDF_PAGE_HEIGHT - PDF_MARGIN;
    }
  }

  private line(text: string, size: number, font: PDFFont, indent = 0, color = rgb(0.15, 0.18, 0.23), background?: ReturnType<typeof rgb>) {
    const lineHeight = size * 1.55;
    this.ensureSpace(lineHeight);
    this.y -= lineHeight;
    if (background) {
      this.page.drawRectangle({ x: PDF_MARGIN + indent - 4, y: this.y - 3, width: PDF_CONTENT_WIDTH - indent + 8, height: lineHeight, color: background });
    }
    if (text) this.page.drawText(text, { x: PDF_MARGIN + indent, y: this.y, size, font, color });
  }

  paragraph(text: string, options: { size?: number; bold?: boolean; indent?: number; color?: ReturnType<typeof rgb>; after?: number } = {}) {
    const size = options.size ?? 10.5;
    const indent = options.indent ?? 0;
    const font = options.bold ? this.bold : this.regular;
    for (const line of wrapPdfText(text, font, size, PDF_CONTENT_WIDTH - indent)) {
      this.line(line, size, font, indent, options.color);
    }
    this.y -= options.after ?? 5;
  }

  heading(text: string, depth: number) {
    const size = [20, 16, 13, 11.5, 10.8, 10.5][depth - 1] ?? 10.5;
    this.y -= 6;
    this.paragraph(text, { size, bold: true, color: rgb(0.05, 0.07, 0.1), after: depth <= 2 ? 6 : 3 });
    if (depth <= 2) {
      this.ensureSpace(8);
      this.page.drawLine({ start: { x: PDF_MARGIN, y: this.y }, end: { x: PDF_PAGE_WIDTH - PDF_MARGIN, y: this.y }, thickness: 0.6, color: rgb(0.84, 0.86, 0.89) });
      this.y -= 8;
    }
  }

  rule() {
    this.ensureSpace(18);
    this.y -= 9;
    this.page.drawLine({ start: { x: PDF_MARGIN, y: this.y }, end: { x: PDF_PAGE_WIDTH - PDF_MARGIN, y: this.y }, thickness: 0.6, color: rgb(0.78, 0.8, 0.83) });
    this.y -= 9;
  }

  code(text: string) {
    for (const line of wrapPdfText(text, this.regular, 9, PDF_CONTENT_WIDTH - 16)) {
      this.line(line, 9, this.regular, 12, rgb(0.12, 0.15, 0.2), rgb(0.94, 0.95, 0.96));
    }
    this.y -= 6;
  }
}

async function loadPdfFont(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load the embedded PDF font.');
  return response.arrayBuffer();
}

export async function exportMarkdownToPdf(title: string, markdown: string): Promise<void> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    loadPdfFont(nanumGothicRegularUrl),
    loadPdfFont(nanumGothicBoldUrl),
  ]);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const layout = new PdfLayout(pdf, regular, bold);

  for (const block of tokensToBlocks(marked.lexer(markdown))) {
    switch (block.kind) {
      case 'heading':
        layout.heading(runsText(block.runs), block.depth);
        break;
      case 'paragraph':
        layout.paragraph(runsText(block.runs));
        break;
      case 'code':
        layout.code(block.text);
        break;
      case 'blockquote':
        layout.paragraph(block.blocks.map(blockText).join('\n'), { indent: 14, color: rgb(0.32, 0.36, 0.42) });
        break;
      case 'list':
        block.items.forEach((item, index) => {
          const marker = block.ordered ? `${Number(block.start || 1) + index}. ` : item.task ? (item.checked ? '[x] ' : '[ ] ') : '- ';
          layout.paragraph(`${marker}${item.content.map(blockText).join(' ')}`, { indent: 12, after: 2 });
          item.sub.forEach((sub) => layout.paragraph(blockText(sub), { indent: 28, after: 2 }));
        });
        break;
      case 'table':
        [block.header, ...block.rows].forEach((row, index) => {
          layout.paragraph(row.map(runsText).join(' | '), { size: 9.5, bold: index === 0, after: 2 });
        });
        break;
      case 'hr':
        layout.rule();
        break;
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    page.drawText(`${index + 1} / ${pages.length}`, { x: PDF_PAGE_WIDTH - PDF_MARGIN - 28, y: 24, size: 8, font: regular, color: rgb(0.45, 0.48, 0.52) });
  });
  const pdfBytes = await pdf.save();
  const pdfBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
  downloadBlob(new Blob([pdfBuffer], { type: 'application/pdf' }), `${baseFileName(title)}.pdf`);
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
