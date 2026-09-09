import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { createMarkdownPdf } from '../src/lib/markdownExport';

describe('vector PDF export', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      const bytes = await readFile(new URL(`../node_modules/@kfonts/nanum-gothic/src/${url.split('/').pop()}`, import.meta.url));
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('keeps Korean text as text and every line within printable bounds', async () => {
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    const png = vi.spyOn(PDFDocument.prototype, 'embedPng');
    const jpg = vi.spyOn(PDFDocument.prototype, 'embedJpg');
    const fonts = vi.spyOn(PDFDocument.prototype, 'embedFont');
    const lines = Array.from({ length: 170 }, (_, i) => `검증문장 ${i}: 한글과 English 문장을 페이지 경계에서 확인합니다.`);
    const bytes = await createMarkdownPdf(lines.join('\n\n'));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(3);
    for (const text of lines) expect(draw.mock.calls.filter(([value]) => value === text)).toHaveLength(1);
    for (const [text, options] of draw.mock.calls) {
      if (/^\d+ \/ \d+$/.test(text)) continue;
      expect(options!.y).toBeGreaterThanOrEqual(48);
      expect(options!.y! + options!.size!).toBeLessThanOrEqual(841.89 - 48);
      expect(options!.x).toBeGreaterThanOrEqual(48);
    }
    expect(png).not.toHaveBeenCalled();
    expect(jpg).not.toHaveBeenCalled();
    expect(fonts).toHaveBeenCalledTimes(2);
    for (const [, options] of fonts.mock.calls) expect(options?.subset).not.toBe(true);
  });

  it('keeps a heading with its underline and following paragraph near a page boundary', async () => {
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    await createMarkdownPdf(`${Array.from({ length: 33 }, () => '채우기').join('\n\n')}\n\n## 경계 제목\n\n제목 다음 본문입니다.`);
    const heading = draw.mock.calls.findIndex(([text]) => text === '경계 제목');
    const body = draw.mock.calls.findIndex(([text]) => text === '제목 다음 본문입니다.');
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(body).toBeGreaterThan(heading);
    expect(draw.mock.instances[heading]).toBe(draw.mock.instances[body]);
  });

  it('repeats table headers without losing or duplicating rows', async () => {
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    const rows = Array.from({ length: 95 }, (_, i) => `| 항목${i} | 값${i} |`);
    const bytes = await createMarkdownPdf(`| 항목 | 값 |\n| --- | ---: |\n${rows.join('\n')}`);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(2);
    expect(draw.mock.calls.filter(([text]) => text === '항목')).toHaveLength(doc.getPageCount());
    for (let i = 0; i < rows.length; i++) {
      expect(draw.mock.calls.filter(([text]) => text === `항목${i}`)).toHaveLength(1);
      expect(draw.mock.calls.filter(([text]) => text === `값${i}`)).toHaveLength(1);
    }
  });

  it('keeps a short code block with its heading', async () => {
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    await createMarkdownPdf(`${Array.from({ length: 29 }, () => '채우기').join('\n\n')}\n\n## 코드 제목\n\n\`\`\`\n${Array.from({ length: 8 }, (_, i) => `code ${i}`).join('\n')}\n\`\`\``);
    const heading = draw.mock.calls.findIndex(([text]) => text === '코드 제목');
    const end = draw.mock.calls.findIndex(([text]) => text === 'code 7');
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(heading);
    expect(draw.mock.instances[heading]).toBe(draw.mock.instances[end]);
  });

  it('splits a row taller than a page into complete lines', async () => {
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    const content = Array.from({ length: 1000 }, (_, i) => `단어${i}`).join(' ');
    const bytes = await createMarkdownPdf(`| 긴 내용 |\n| --- |\n| ${content} |`);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    const actual = draw.mock.calls.map(([text]) => text).filter((text) => text !== '긴 내용' && !/^\d+ \/ \d+$/.test(text)).join(' ');
    expect(actual.replace(/\s/g, '')).toBe(content.replace(/\s/g, ''));
    for (const [text, options] of draw.mock.calls) {
      if (/^\d+ \/ \d+$/.test(text)) continue;
      expect(options!.y).toBeGreaterThanOrEqual(48);
    }
  });

  it('propagates font loading errors to the export caller', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false }));
    await expect(createMarkdownPdf('한글')).rejects.toThrow('Could not load the embedded PDF font');
  });
});
