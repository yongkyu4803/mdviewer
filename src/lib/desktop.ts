import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export const isDesktopApp = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function getStartupMarkdownPaths(): Promise<string[]> {
  return invoke<string[]>('take_pending_markdown_files');
}

export async function readMarkdownPath(path: string): Promise<string> {
  return invoke<string>('read_markdown_file', { path });
}

export async function writeMarkdownPath(path: string, content: string): Promise<void> {
  await invoke('write_markdown_file', { path, content });
}

export async function onMarkdownOpened(handler: (paths: string[]) => void): Promise<UnlistenFn> {
  return listen<string[]>('markdown-opened', (event) => handler(event.payload));
}
