// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdownPreview } from '../src/lib/markdownPreview';
import { assertDocumentSize, isRelativeImage, safeLinkUrl } from '../src/lib/documentSecurity';

describe('untrusted document rendering', () => {
  it('removes executable HTML and global CSS without losing merged table cells', () => {
    const source = `<div id="app" style="position:fixed"><style>body{display:none}</style>
      <img src="data:image/png;base64,invalid" onerror="window.audit=1">
      <svg onload="window.audit=1"></svg><iframe srcdoc="bad"></iframe>
      <form><input name="location"></form><a href="javascript:alert(1)">bad</a></div>
      <table><tr><th rowspan="2" colspan="3">budget<br>2027</th></tr></table>`;
    const html = renderMarkdownPreview(source);
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('style,script,svg,iframe,form,[onerror],[onload],[style],[id],[name]')).toBeNull();
    expect(container.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(container.querySelector('th')?.getAttribute('rowspan')).toBe('2');
    expect(container.querySelector('th')?.getAttribute('colspan')).toBe('3');
  });
  it('blocks all automatic network images, srcset and untrusted embedded data', () => {
    const html = renderMarkdownPreview(`<img src="https://tracker.test/pixel" srcset="https://tracker.test/2x 2x">
      ![track](//tracker.test/pixel)
      <img src="data:image/svg+xml;base64,PHN2Zz4=">`);
    expect(html).not.toMatch(/<img|srcset|https:\/\/tracker/);
  });
  it('renders only native-validated local raster data and disables checkboxes', () => {
    const html = renderMarkdownPreview('![chart](images/chart.png)\n\n- [x] Done', {
      'images/chart.png': 'data:image/png;base64,aGVsbG8=',
    });
    expect(html).toContain('src="data:image/png;base64,aGVsbG8="');
    expect(html).toContain('disabled');
  });
  it.each(['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,bad', 'file:///private/file', '//example.com', 'https://u:p@example.com'])('rejects link %s', (href) => {
    expect(safeLinkUrl(href)).toBeUndefined();
  });
  it('allows explicit web/mail links without granting opener access', () => {
    const html = renderMarkdownPreview('[safe](https://example.com)');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(safeLinkUrl('mailto:hello@example.com')).toBe('mailto:hello@example.com');
  });
  it.each(['../secret.png', '%2e%2e/secret.png', 'file:///secret.png', 'C:\\secret.png', '/secret.png', 'file.png:stream', 'images/test.svg'])('rejects local image escape %s', (source) => {
    expect(isRelativeImage(source)).toBe(false);
  });
  it('enforces UTF-8 byte limits, not just JavaScript string length', () => {
    expect(() => assertDocumentSize('한'.repeat(3_000_000))).toThrow('8 MiB');
  });
});
