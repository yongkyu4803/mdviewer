import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { MAX_EXPORT_BYTES } from './exportLimits';

export const isDesktopApp = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface DocumentRef { id: string; path: string }
const documentIds = new Map<string, string>();
function remember(refs: DocumentRef[]): string[] {
  for (const ref of refs) documentIds.set(ref.path, ref.id);
  return refs.map((ref) => ref.path);
}
function approvedId(path: string): string {
  const id = documentIds.get(path);
  if (!id) throw new Error('Use Import to grant access to this document again.');
  return id;
}
export async function getStartupMarkdownPaths(): Promise<string[]> {
  return remember(await invoke<DocumentRef[]>('take_pending_markdown_files'));
}

export async function readMarkdownPath(path: string): Promise<string> {
  return invoke<string>('read_markdown_file', { id: approvedId(path) });
}

export async function readDocumentImages(path: string, sources: string[]): Promise<Record<string, string>> {
  return invoke('read_document_images', { id: approvedId(path), sources });
}
export async function closeMarkdownPath(path: string): Promise<void> {
  const id = documentIds.get(path);
  await pendingWrites.get(path)?.catch(() => undefined);
  if (id) {
    await invoke('close_markdown_file', { id });
    if (documentIds.get(path) === id) documentIds.delete(path);
  }
}

const pendingWrites = new Map<string, Promise<void>>();

export async function writeMarkdownPath(path: string, content: string): Promise<void> {
  const id = approvedId(path);
  // Serialize saves to a given file, including manual saves during an autosave.
  const write = (pendingWrites.get(path) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => invoke<void>('write_markdown_file', { id, content }));
  pendingWrites.set(path, write);
  try { await write; }
  finally { if (pendingWrites.get(path) === write) pendingWrites.delete(path); }
}

export async function pickMarkdownPaths(): Promise<string[]> {
  return remember(await invoke<DocumentRef[]>('pick_markdown_files'));
}

/** Returns null when the user cancels the native save dialog. */
export async function saveExportFile(filename: string, blob: Blob): Promise<string | null> {
  if (blob.size > MAX_EXPORT_BYTES) throw new Error('Export exceeds 64 MiB.');
  // A raw body avoids expanding each byte into a JSON number (about 4x larger).
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const result = await invoke<{ path: string; document: DocumentRef | null } | null>('save_export_file', bytes, {
    headers: { 'x-markmd-filename': encodeURIComponent(filename) },
  });
  if (result?.document) remember([result.document]);
  return result?.path ?? null;
}

export async function onMarkdownOpened(handler: () => void): Promise<UnlistenFn> {
  return listen('markdown-opened', handler);
}
