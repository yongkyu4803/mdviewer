import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS, MAX_LIBRARY_BYTES, assertDocumentSize } from './documentSecurity';

export interface MarkdownDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  desktopFilePath?: string;
}

const LEGACY_KEY = 'markmd_documents';
let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('markmd', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('library');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.catch(() => { database = undefined; });
  }
  return database;
}

function isDocumentList(value: unknown): value is MarkdownDocument[] {
  return Array.isArray(value) && value.length <= MAX_DOCUMENTS && value.every((item) => item &&
    typeof item.id === 'string' && typeof item.title === 'string' &&
    typeof item.content === 'string' && item.content.length <= MAX_DOCUMENT_BYTES && typeof item.updatedAt === 'string');
}

export async function loadDocuments(): Promise<MarkdownDocument[] | null> {
  let stored: unknown;
  try {
    const db = await openDatabase();
    stored = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('library').objectStore('library').get('documents');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Older libraries remain readable if IndexedDB is unavailable.
  }
  if (stored !== undefined) {
    if (!isDocumentList(stored)) throw new Error('Saved library is invalid or exceeds the supported limits.');
    return durableCopies(stored);
  }

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return null;
  const saved: unknown = JSON.parse(legacy);
  if (!isDocumentList(saved)) throw new Error('Saved library is invalid or exceeds the supported limits.');
  return durableCopies(saved);
}

async function persistDocuments(documents: MarkdownDocument[]): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    // A small library can still be saved in environments without IndexedDB.
    // Quota errors propagate to the UI instead of aborting import/edit silently.
    localStorage.setItem(LEGACY_KEY, JSON.stringify(documents));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('library', 'readwrite');
    transaction.objectStore('library').put(documents, 'documents');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  localStorage.removeItem(LEGACY_KEY);
}

/** File paths and native session capabilities never become durable authority. */
function durableCopies(documents: MarkdownDocument[]): MarkdownDocument[] {
  if (documents.length > MAX_DOCUMENTS) throw new Error('Library is limited to 128 documents.');
  let total = 0;
  return documents.map(({ id, title, content, updatedAt }) => {
    assertDocumentSize(content);
    total += new TextEncoder().encode(content).length;
    if (total > MAX_LIBRARY_BYTES) throw new Error('Local drafts exceed 32 MiB. Export or remove documents.');
    return { id: id.startsWith('file:') || id.startsWith('import:') ? crypto.randomUUID() : id.slice(0, 200), title: title.slice(0, 240), content, updatedAt: updatedAt.slice(0, 80) };
  });
}
let pending = Promise.resolve();
export async function saveDocuments(documents: MarkdownDocument[]): Promise<void> {
  const copies = durableCopies(documents);
  pending = pending.catch(() => undefined).then(() => persistDocuments(copies));
  return pending;
}
export function clearSavedDocuments(): Promise<void> {
  pending = pending.catch(() => undefined).then(async () => {
    localStorage.removeItem(LEGACY_KEY);
    // Do not silently ignore deletion failures; the UI must report them.
    if (typeof indexedDB === 'undefined') return;
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('library', 'readwrite');
      tx.objectStore('library').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
  return pending;
}
