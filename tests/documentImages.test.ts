import { describe, expect, it, vi } from 'vitest';
import { DocumentImageCache } from '../src/lib/documentImages';

describe('document image cache', () => {
  it('reads native images once while text edits keep the same image list', async () => {
    const read = vi.fn(async (_path: string, sources: string[]) => Object.fromEntries(sources.map((s) => [s, `data:${s}`])));
    const cache = new DocumentImageCache(read);
    for (let edit = 0; edit < 20; edit += 1) {
      await expect(cache.load('/doc.md', ['a.png', 'b.png'])).resolves.toEqual({ 'a.png': 'data:a.png', 'b.png': 'data:b.png' });
    }
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('rereads when the image list changes, after invalidation and after a failure', async () => {
    const read = vi.fn<(path: string, sources: string[]) => Promise<Record<string, string>>>()
      .mockResolvedValueOnce({ 'a.png': 'one' })
      .mockResolvedValueOnce({ 'b.png': 'two' })
      .mockRejectedValueOnce(new Error('Document permission expired.'))
      .mockResolvedValueOnce({ 'b.png': 'three' })
      .mockResolvedValueOnce({ 'b.png': 'four' });
    const cache = new DocumentImageCache(read);
    await cache.load('/doc.md', ['a.png']);
    await expect(cache.load('/doc.md', ['b.png'])).resolves.toEqual({ 'b.png': 'two' });
    cache.invalidate('/doc.md');
    await expect(cache.load('/doc.md', ['b.png'])).rejects.toThrow('expired');
    await expect(cache.load('/doc.md', ['b.png'])).resolves.toEqual({ 'b.png': 'three' });
    cache.invalidate('/doc.md');
    await expect(cache.load('/doc.md', ['b.png'])).resolves.toEqual({ 'b.png': 'four' });
    expect(read).toHaveBeenCalledTimes(5);
  });

  it('skips native calls without images and keeps only recent documents', async () => {
    const read = vi.fn(async () => ({ 'a.png': 'data' }));
    const cache = new DocumentImageCache(read);
    await expect(cache.load('/empty.md', [])).resolves.toEqual({});
    expect(read).not.toHaveBeenCalled();
    for (const path of ['/1.md', '/2.md', '/3.md', '/4.md', '/5.md']) await cache.load(path, ['a.png']);
    await cache.load('/5.md', ['a.png']);
    expect(read).toHaveBeenCalledTimes(5);
    await cache.load('/1.md', ['a.png']);
    expect(read).toHaveBeenCalledTimes(6);
  });
});
