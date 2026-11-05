import type { MarkdownDocument } from './documentStore';

/**
 * Reopening a file shows the disk copy. Edits that were not written yet, for
 * example after "File changed outside Mark_md. Reopen it", are kept as a
 * separate draft instead of being discarded or written over the disk copy.
 */
export function mergeReopenedDocument(
  documents: MarkdownDocument[],
  reopened: MarkdownDocument,
  hasUnsavedEdits: boolean,
  draftId: string,
): { documents: MarkdownDocument[]; recovered: boolean } {
  const previous = documents.find((doc) => doc.id === reopened.id);
  const others = documents.filter((doc) => doc.id !== reopened.id);
  if (!hasUnsavedEdits || !previous || previous.content === reopened.content) {
    return { documents: [reopened, ...others], recovered: false };
  }
  const recovered: MarkdownDocument = {
    id: draftId,
    title: `${reopened.title.replace(/\.(md|markdown)$/i, '')} (unsaved edits).md`,
    content: previous.content,
    updatedAt: reopened.updatedAt,
  };
  return { documents: [reopened, recovered, ...others], recovered: true };
}
