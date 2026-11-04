import { describe, expect, it } from 'vitest';
import { resolveMarkdownImagePath } from '../src/lib/markdownPreview';

describe('images exported alongside Korean Markdown documents', () => {
  it('decodes Korean image paths without changing Unicode normalization', () => {
    const folder = '과기부_2027년도 예산안(3권)'.normalize('NFD');
    const source = `images/${encodeURIComponent(folder)}/BinData/image14.PNG`;
    expect(resolveMarkdownImagePath(source, '/Downloads/kordoc-test/예산안.md'))
      .toBe(`/Downloads/kordoc-test/images/${folder}/BinData/image14.PNG`);
  });

  it('handles document folders with spaces, percent signs and URL delimiters', () => {
    expect(resolveMarkdownImagePath('images/chart%20%231.png', '/Downloads/예산 #1%/자료.md'))
      .toBe('/Downloads/예산 #1%/images/chart #1.png');
  });

  it('resolves parent references and ignores image URL queries and fragments', () => {
    expect(resolveMarkdownImagePath('../images/chart.png?v=1#figure', '/Downloads/docs/자료.md'))
      .toBe('/Downloads/images/chart.png');
  });

  it('leaves remote URLs, data URLs and absolute references unchanged', () => {
    for (const source of ['https://example.com/chart.png', '//example.com/chart.png',
      'data:image/png;base64,abc', '/images/chart.png', '#figure', '']) {
      expect(resolveMarkdownImagePath(source, '/Downloads/자료.md')).toBeNull();
    }
  });

  it('does not fail the entire document on a malformed image escape', () => {
    expect(resolveMarkdownImagePath('images/bad%ZZ.png', '/Downloads/자료.md')).toBeNull();
  });
});
