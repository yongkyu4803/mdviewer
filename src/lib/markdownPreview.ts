import { parseMarkdown } from './markdownParser';
import { assertDocumentSize, sanitizeDocumentHtml } from './documentSecurity';

export { resolveMarkdownImagePath } from './filePaths';

export function renderMarkdownPreview(
  content: string,
  images: Readonly<Record<string, string>> = {},
): string {
  assertDocumentSize(content);
  return renderParsedPreview(parseMarkdown(content), images, content.length);
}

export function renderParsedPreview(html: string, images: Readonly<Record<string, string>> = {}, length = 0): string {
  const fragment = sanitizeDocumentHtml(html, images);

  // Keep the actual table intact, including rowspan/colspan and HTML line breaks.
  fragment.querySelectorAll('table').forEach((table) => {
    const scroller = document.createElement('div');
    scroller.className = 'markdown-table-scroll';
    scroller.setAttribute('role', 'region');
    scroller.setAttribute('aria-label', '표 (가로 스크롤)');
    scroller.tabIndex = 0;
    table.replaceWith(scroller);
    scroller.append(table);
  });

  const container = document.createElement('div');
  if (length > 200_000) {
    // All content stays searchable, while offscreen sections skip costly layout.
    const nodes = Array.from(fragment.childNodes);
    for (let index = 0; index < nodes.length; index += 80) {
      const section = document.createElement('div');
      section.className = 'markdown-section';
      section.append(...nodes.slice(index, index + 80));
      container.append(section);
    }
  } else {
    container.append(fragment);
  }
  return container.innerHTML;
}
