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
  return Array.isArray(value) && value.every((item) => item &&
    typeof item.id === 'string' && typeof item.title === 'string' &&
    typeof item.content === 'string' && typeof item.updatedAt === 'string');
}

export async function loadDocuments(): Promise<MarkdownDocument[] | null> {
  try {
    const db = await openDatabase();
    const saved = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('library').objectStore('library').get('documents');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (isDocumentList(saved)) return saved;
  } catch {
    // Older libraries remain readable if IndexedDB is unavailable.
  }

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return null;
  try {
    const saved: unknown = JSON.parse(legacy);
    return isDocumentList(saved) ? saved : null;
  } catch {
    return null;
  }
}

export async function saveDocuments(documents: MarkdownDocument[]): Promise<void> {
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
