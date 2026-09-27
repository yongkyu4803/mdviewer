export interface PdfBand {
  top: number;
  bottom: number;
}

/** Merge overlapping glyph boxes so a break cannot bisect any text column. */
export function paginatePdf(height: number, pageHeight: number, bands: PdfBand[]): PdfBand[] {
  const merged: PdfBand[] = [];
  for (const band of [...bands].sort((a, b) => a.top - b.top)) {
    const previous = merged.at(-1);
    if (previous && band.top < previous.bottom) {
      previous.bottom = Math.max(previous.bottom, band.bottom);
    } else {
      merged.push({ ...band });
    }
  }

  const pages: PdfBand[] = [];
  let top = 0;
  while (top < height) {
    let bottom = Math.min(top + pageHeight, height);
    const crossing = merged.find((band) => band.top < bottom && band.bottom > bottom);
    if (crossing) {
      // An oversized indivisible object is scaled to fit by the renderer.
      bottom = crossing.top > top ? crossing.top : Math.min(crossing.bottom, height);
    }
    pages.push({ top, bottom });
    top = bottom;
  }
  return pages;
}

export function measurePdfBands(container: HTMLElement, pageHeight: number): PdfBand[] {
  const origin = container.getBoundingClientRect().top;
  const bands: PdfBand[] = [];
  const add = (rect: DOMRect) => {
    if (rect.height > 0 && rect.width > 0) {
      bands.push({ top: Math.max(0, Math.floor(rect.top - origin - 1)), bottom: Math.ceil(rect.bottom - origin + 1) });
    }
  };
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent?.trim() || node.parentElement?.closest('style, script')) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) add(rect);
  }
  // Keep ordinary rows and headings intact; tall rows can still break between lines.
  for (const element of container.querySelectorAll('tr, h1, h2, h3, h4, h5, h6, img, svg')) {
    const rect = element.getBoundingClientRect();
    if (rect.height + 2 <= pageHeight || element.matches('img, svg')) add(rect);
  }
  return bands;
}

/** html2canvas 1.4 measures fonts in the original document, not its clone.
 * Tailwind's block-level img reset displaces the baseline of its 1px probe.
 * Scope the temporary override to that probe, then remove it after export.
 */
export function installPdfFontMetricsFix(ownerDocument: Document): () => void {
  const style = ownerDocument.createElement('style');
  style.textContent = 'body > div:not([class]):not([id]) > img[width="1"][height="1"] { display: inline !important; }';
  ownerDocument.head.appendChild(style);
  return () => style.remove();
}
