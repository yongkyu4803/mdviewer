import { describe, expect, it } from 'vitest';
import { exportFileName, fileNameFromPath, resolveMarkdownImagePath } from '../src/lib/filePaths';

describe('Windows document paths', () => {
  it('extracts only the filename for Explorer and Finder paths', () => {
    expect(fileNameFromPath(String.raw`C:\Users\사용자\문서\예산안.md`)).toBe('예산안.md');
    expect(fileNameFromPath('/Users/mark/문서/예산안.md')).toBe('예산안.md');
    expect(fileNameFromPath(String.raw`\\server\share\자료.markdown`)).toBe('자료.markdown');
  });

  it('resolves encoded Korean images next to a Windows document', () => {
    const folder = '과기부_예산안'.normalize('NFD');
    expect(resolveMarkdownImagePath(`images/${encodeURIComponent(folder)}/그림%20%231.png`,
      String.raw`C:\Users\사용자\문서 #1%\자료.md`))
      .toBe(`C:\\Users\\사용자\\문서 #1%\\images\\${folder}\\그림 #1.png`);
  });

  it('supports slash-separated drive paths and parent references', () => {
    expect(resolveMarkdownImagePath('../images/chart.png?v=1#figure', 'D:/reports/docs/자료.md'))
      .toBe(String.raw`D:\reports\images\chart.png`);
    expect(resolveMarkdownImagePath(String.raw`images\chart.png`, String.raw`D:\reports\자료.md`))
      .toBe(String.raw`D:\reports\images\chart.png`);
  });

  it('retains the server and share of a UNC document', () => {
    expect(resolveMarkdownImagePath('images/그림%201.png', String.raw`\\server\공유 문서\자료.md`))
      .toBe(String.raw`\\server\공유 문서\images\그림 1.png`);
  });

  it('handles Windows extended-length paths', () => {
    expect(resolveMarkdownImagePath('images/chart.png', String.raw`\\?\C:\문서\자료.md`))
      .toBe(String.raw`C:\문서\images\chart.png`);
    expect(resolveMarkdownImagePath('images/chart.png', String.raw`\\?\UNC\server\share\자료.md`))
      .toBe(String.raw`\\server\share\images\chart.png`);
  });

  it('does not convert external, absolute, or malformed references to local assets', () => {
    for (const source of ['https://example.com/a.png', 'data:image/png;base64,abc',
      String.raw`C:\other\a.png`, String.raw`\\other\share\a.png`, '/a.png', '//other/a.png',
      'images/bad%ZZ.png', '#figure']) {
      expect(resolveMarkdownImagePath(source, String.raw`C:\docs\a.md`)).toBeNull();
    }
  });
});

describe('portable export filenames', () => {
  it('preserves Korean titles and replaces Windows-reserved characters', () => {
    expect(exportFileName('2027 예산: 검토?.markdown', 'pdf')).toBe('2027 예산_ 검토_.pdf');
    expect(exportFileName('문서.md', 'md')).toBe('문서.md');
  });

  it('avoids Windows device names and trailing dots or spaces', () => {
    expect(exportFileName('CON.md', 'md')).toBe('_CON.md');
    expect(exportFileName('lpt1.summary.md', 'docx')).toBe('_lpt1.summary.docx');
    expect(exportFileName('보고서... .md', 'docx')).toBe('보고서.docx');
    expect(exportFileName(' .md', 'pdf')).toBe('document.pdf');
  });
});
