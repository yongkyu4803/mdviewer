type ImageReader = (path: string, sources: string[]) => Promise<Record<string, string>>;

const MAX_CACHED_DOCUMENTS = 4;

/**
 * Native image reads are bounded per request but were repeated after every
 * keystroke. Reuse the result while a document references the same images;
 * a changed image list, reopening or closing the document reads them again.
 */
export class DocumentImageCache {
  private readonly entries = new Map<string, { key: string; images: Promise<Record<string, string>> }>();

  constructor(private readonly read: ImageReader) {}

  load(path: string, sources: string[]): Promise<Record<string, string>> {
    const key = JSON.stringify(sources);
    const cached = this.entries.get(path);
    if (cached?.key === key) {
      // Refresh recency so the active document is evicted last.
      this.entries.delete(path);
      this.entries.set(path, cached);
      return cached.images;
    }
    const images = sources.length ? this.read(path, sources) : Promise.resolve({});
    this.entries.delete(path);
    this.entries.set(path, { key, images });
    // Large data URLs stay in memory only for a few recent documents.
    while (this.entries.size > MAX_CACHED_DOCUMENTS) {
      this.entries.delete(this.entries.keys().next().value as string);
    }
    images.catch(() => {
      if (this.entries.get(path)?.images === images) this.entries.delete(path);
    });
    return images;
  }

  invalidate(path: string): void {
    this.entries.delete(path);
  }
}
