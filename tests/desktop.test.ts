import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
import { saveExportFile, writeMarkdownPath, pickMarkdownPaths, closeMarkdownPath } from '../src/lib/desktop';

beforeEach(() => vi.mocked(invoke).mockReset());

describe('desktop disk writes', () => {
  it('does not give a queued old save the permission of a reopened document', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ id: 'original-id', path: '/reopened.md' }]);
    await pickMarkdownPaths();
    let finish!: () => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = writeMarkdownPath('/reopened.md', 'first');
    const queued = writeMarkdownPath('/reopened.md', 'stale');
    await vi.waitFor(() => expect(finish).toBeDefined());
    vi.mocked(invoke).mockResolvedValueOnce([{ id: 'new-id', path: '/reopened.md' }]);
    await pickMarkdownPaths();
    finish();
    await Promise.all([first, queued]);
    expect(invoke).toHaveBeenLastCalledWith('write_markdown_file', { id: 'original-id', content: 'stale' });
  });
  it('rejects restored or forged paths without invoking native code', async () => {
    await expect(writeMarkdownPath('/never-approved.md', 'bad')).rejects.toThrow('Import');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('revokes a document when it is removed', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ id: 'revocable', path: '/close.md' }]);
    await pickMarkdownPaths();
    await closeMarkdownPath('/close.md');
    await expect(writeMarkdownPath('/close.md', 'bad')).rejects.toThrow('Import');
    expect(invoke).toHaveBeenCalledWith('close_markdown_file', { id: 'revocable' });
  });
  it('finishes an older save before writing newer contents of the same file', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ id: 'approved-1', path: 'C:\\docs\\자료.md' }]);
    await pickMarkdownPaths();
    vi.mocked(invoke).mockClear();
    let finishFirst!: () => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce(undefined);
    const first = writeMarkdownPath('C:\\docs\\자료.md', 'old');
    const second = writeMarkdownPath('C:\\docs\\자료.md', 'new');
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    finishFirst();
    await Promise.all([first, second]);
    expect(invoke).toHaveBeenNthCalledWith(2, 'write_markdown_file', {
      id: 'approved-1', content: 'new',
    });
  });

  it('reports a failed save and still allows a later retry', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ id: 'approved-2', path: 'readonly.md' }]);
    await pickMarkdownPaths();
    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Access denied')).mockResolvedValueOnce(undefined);
    await expect(writeMarkdownPath('readonly.md', 'old')).rejects.toThrow('Access denied');
    await expect(writeMarkdownPath('readonly.md', 'retry')).resolves.toBeUndefined();
  });

  it('sends exact export bytes as a raw body and preserves dialog cancellation', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null);
    const bytes = new Uint8Array([0, 127, 128, 255]);
    await expect(saveExportFile('자료 #1.pdf', new Blob([bytes]))).resolves.toBeNull();
    const [command, body, options] = vi.mocked(invoke).mock.calls[0];
    expect(command).toBe('save_export_file');
    expect(body).toBeInstanceOf(Uint8Array);
    expect(Array.from(body as Uint8Array)).toEqual([0, 127, 128, 255]);
    // Header values must be ASCII; Rust percent-decodes the UTF-8 name.
    expect(options).toEqual({ headers: { 'x-markmd-filename': '%EC%9E%90%EB%A3%8C%20%231.pdf' } });
  });

  it('approves a saved Markdown export for later saves', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ path: '/new.md', document: { id: 'export-id', path: '/new.md' } });
    await expect(saveExportFile('new.md', new Blob(['# new']))).resolves.toBe('/new.md');
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await writeMarkdownPath('/new.md', 'next');
    expect(invoke).toHaveBeenLastCalledWith('write_markdown_file', { id: 'export-id', content: 'next' });
  });
});
