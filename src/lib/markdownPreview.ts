import DOMPurify from 'dompurify';
import { parseMarkdown } from './markdownParser';

export { resolveMarkdownImagePath } from './filePaths';

export function renderMarkdownPreview(
  content: string,
  resolveImage?: (source: string) => string,
): string {
  const fragment = DOMPurify.sanitize(parseMarkdown(content), {
    RETURN_DOM_FRAGMENT: true,
  });

  fragment.querySelectorAll('img').forEach((image) => {
    const source = image.getAttribute('src');
    if (source && resolveImage) image.setAttribute('src', resolveImage(source));
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
  });

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
  if (content.length > 200_000) {
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
