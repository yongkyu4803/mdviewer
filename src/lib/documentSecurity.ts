import DOMPurify from 'dompurify';

import { MAX_DOCUMENT_BYTES } from './documentSecurityLimits';
export { MAX_DOCUMENT_BYTES } from './documentSecurityLimits';
export const MAX_DOCUMENTS = 128;
export const MAX_LIBRARY_BYTES = 32 * 1024 * 1024;

export function assertDocumentSize(content: string): void {
  if (content.length > MAX_DOCUMENT_BYTES || new TextEncoder().encode(content).length > MAX_DOCUMENT_BYTES) {
    throw new Error('Documents must be 8 MiB or smaller.');
  }
}

export function safeLinkUrl(value: string): string | undefined {
  if (/[\u0000-\u0020\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function isRelativeImage(source: string): boolean {
  try {
    const path = decodeURIComponent(source.split(/[?#]/)[0]);
    return !!path && !/[\\:\u0000-\u001f]/.test(path) && !path.startsWith('/') &&
      !path.split('/').includes('..') && /\.(png|jpe?g|webp)$/i.test(path);
  } catch { return false; }
}

/** Only HTML document formatting; no CSS, form controls, SVG, media or custom elements. */
export function sanitizeDocumentHtml(html: string, images: Readonly<Record<string, string>> = {}): DocumentFragment {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i',
      's', 'del', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot',
      'tr', 'th', 'td', 'caption', 'a', 'img', 'div', 'span', 'sup', 'sub', 'input'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'start', 'align', 'type', 'checked', 'disabled'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'svg', 'math', 'iframe', 'object', 'embed', 'form', 'template'],
    FORBID_ATTR: ['style', 'class', 'id', 'name', 'srcset'],
  });
  fragment.querySelectorAll('a').forEach((link) => {
    const href = safeLinkUrl(link.getAttribute('href') || '');
    if (href) {
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.referrerPolicy = 'no-referrer';
    } else link.removeAttribute('href');
  });
  fragment.querySelectorAll('input').forEach((input) => {
    if (input.type !== 'checkbox') input.remove();
    else input.disabled = true;
  });
  fragment.querySelectorAll('img').forEach((image, index) => {
    const source = image.getAttribute('src') || '';
    // Values in images originate exclusively from the native bounded raster reader.
    const resolved = isRelativeImage(source) ? images[source] : undefined;
    if (index < 64 && resolved && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(resolved)) {
      image.src = resolved;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'blocked-document-image';
      placeholder.textContent = `[Image unavailable${image.alt ? `: ${image.alt}` : ''}]`;
      placeholder.title = 'External images are blocked. Local PNG, JPEG and WebP images must be inside an opened document folder.';
      image.replaceWith(placeholder);
    }
  });
  return fragment;
}

export function localImageSources(html: string): string[] {
  // Detached, sanitized fragment: never insert this discovery result into the live DOM.
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true, ALLOWED_TAGS: ['img'], ALLOWED_ATTR: ['src'] });
  return [...new Set(Array.from(fragment.querySelectorAll('img'), (img) => img.getAttribute('src') || '')
    .filter(isRelativeImage))].slice(0, 64);
}
