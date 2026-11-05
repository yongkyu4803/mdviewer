// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
vi.mock('../src/lib/markdownAsync', async () => {
  const { parseMarkdown, lexMarkdown } = await import('../src/lib/markdownParser');
  return { parseMarkdownAsync: async (source: string) => parseMarkdown(source), lexMarkdownAsync: async (source: string) => lexMarkdown(source) };
});
vi.mock('../src/lib/fileDownload', () => ({ downloadBlob: vi.fn() }));
vi.mock('html2canvas', () => ({ default: vi.fn(async () => document.createElement('canvas')) }));
vi.mock('jspdf', () => ({ jsPDF: class {
  internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
  output() { return new Blob(['pdf']); }
} }));
vi.mock('../src/lib/pdfPagination', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/lib/pdfPagination')>(),
  measurePdfBands: () => [], // jsdom has no layout engine; HTML insertion stays real.
}));
import { downloadBlob } from '../src/lib/fileDownload';
import { exportMarkdownToDocx, exportMarkdownToPdf } from '../src/lib/markdownExport';

beforeEach(() => {
  vi.mocked(downloadBlob).mockClear();
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
});

describe('export security boundaries', () => {
  it('sanitizes the actual PDF DOM insertion before it reaches the live document', async () => {
    let inspected = false;
    const append = document.body.appendChild.bind(document.body);
    const spy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      const container = node as HTMLElement;
      if (container.classList?.contains('md-export-root')) {
        inspected = true;
        expect(container.querySelector('[onerror],svg,iframe,a[href^="javascript:"]')).toBeNull();
        expect(container.querySelectorAll('style')).toHaveLength(1); // app-owned PDF CSS only
        expect(container.querySelector('style')?.textContent).not.toContain('compromised');
      }
      return append(node);
    });
    try {
      await exportMarkdownToPdf('audit', '<img src="x" onerror="alert(1)"><div><style>body{--compromised:1}</style></div>\n\n[bad](javascript:alert%281%29)');
      expect(inspected).toBe(true);
      expect(downloadBlob).toHaveBeenCalled();
      expect(document.querySelector('.md-export-root')).toBeNull();
    } finally { spy.mockRestore(); }
  });
  it('writes only allowed hyperlink relationships to a real DOCX archive', async () => {
    await exportMarkdownToDocx('audit', '[bad](javascript:alert%281%29) [file](file:///private/notes) [good](https://example.com)');
    const blob = vi.mocked(downloadBlob).mock.calls[0][0];
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(blob);
    });
    const archive = unzipSync(new Uint8Array(buffer));
    const relationships = strFromU8(archive['word/_rels/document.xml.rels']);
    expect(relationships).not.toMatch(/javascript:|file:\/\//);
    expect(relationships).toContain('https://example.com/');
  });
});
