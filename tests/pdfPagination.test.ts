import { describe, expect, it } from 'vitest';
import { paginatePdf } from '../src/lib/pdfPagination';

describe('PDF page boundaries', () => {
  it('moves a line crossing the page edge intact onto the next page', () => {
    expect(paginatePdf(190, 100, [{ top: 92, bottom: 108 }])).toEqual([
      { top: 0, bottom: 92 }, { top: 92, bottom: 190 },
    ]);
  });
  it('finds a safe cut across overlapping text in table columns', () => {
    expect(paginatePdf(200, 100, [{ top: 90, bottom: 110 }, { top: 75, bottom: 95 }])[0].bottom).toBe(75);
  });
  it('keeps oversized objects intact for scaling without losing content', () => {
    expect(paginatePdf(270, 100, [{ top: 20, bottom: 250 }])).toEqual([
      { top: 0, bottom: 20 }, { top: 20, bottom: 250 }, { top: 250, bottom: 270 },
    ]);
  });
  it('does not add a trailing page at an exact boundary', () => {
    expect(paginatePdf(200, 100, [])).toHaveLength(2);
    expect(paginatePdf(0, 100, [])).toEqual([]);
  });
});
