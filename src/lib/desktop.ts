import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { resolveMarkdownImagePath } from './filePaths';

export const isDesktopApp = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function getStartupMarkdownPaths(): Promise<string[]> {
  return invoke<string[]>('take_pending_markdown_files');
}

export async function readMarkdownPath(path: string): Promise<string> {
  return invoke<string>('read_markdown_file', { path });
}

export function desktopMarkdownImageUrl(source: string, documentPath: string): string {
  const path = resolveMarkdownImagePath(source, documentPath);
  return path ? convertFileSrc(path) : source;
}

const pendingWrites = new Map<string, Promise<void>>();

export async function writeMarkdownPath(path: string, content: string): Promise<void> {
  // Serialize saves to a given file, including manual saves during an autosave.
  const write = (pendingWrites.get(path) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => invoke<void>('write_markdown_file', { path, content }));
  pendingWrites.set(path, write);
  try { await write; }
  finally { if (pendingWrites.get(path) === write) pendingWrites.delete(path); }
}

export async function pickMarkdownPaths(): Promise<string[]> {
  return invoke<string[]>('pick_markdown_files');
}

/** Returns null when the user cancels the native save dialog. */
export async function saveExportFile(filename: string, blob: Blob): Promise<string | null> {
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  return invoke<string | null>('save_export_file', { filename, bytes });
}

export async function onMarkdownOpened(handler: (paths: string[]) => void): Promise<UnlistenFn> {
  return listen<string[]>('markdown-opened', (event) => handler(event.payload));
}
