import { describe, expect, it } from 'vitest';
import { mergeReopenedDocument } from '../src/lib/reopenDocument';
import type { MarkdownDocument } from '../src/lib/documentStore';

const doc = (id: string, content: string, title = 'notes.md'): MarkdownDocument => ({ id, title, content, updatedAt: 'today' });

describe('reopening a desktop document', () => {
  it('keeps unsaved edits as a separate draft instead of discarding them', () => {
    const library = [doc('other', 'x'), doc('file:/notes.md', 'my unsaved edits')];
    const reopened = doc('file:/notes.md', 'external change');
    const result = mergeReopenedDocument(library, reopened, true, 'doc_recovered');
    expect(result.recovered).toBe(true);
    expect(result.documents.map((item) => [item.id, item.content])).toEqual([
      ['file:/notes.md', 'external change'],
      ['doc_recovered', 'my unsaved edits'],
      ['other', 'x'],
    ]);
    // The draft is not linked to the file, so it can never overwrite it.
    expect(result.documents[1]).not.toHaveProperty('desktopFilePath');
    expect(result.documents[1].title).toBe('notes (unsaved edits).md');
  });

  it('replaces saved or identical content without creating drafts', () => {
    const library = [doc('file:/notes.md', 'same')];
    expect(mergeReopenedDocument(library, doc('file:/notes.md', 'new'), false, 'unused').documents).toHaveLength(1);
    expect(mergeReopenedDocument(library, doc('file:/notes.md', 'same'), true, 'unused').recovered).toBe(false);
    expect(mergeReopenedDocument([], doc('file:/notes.md', 'new'), true, 'unused').documents).toHaveLength(1);
  });
});
