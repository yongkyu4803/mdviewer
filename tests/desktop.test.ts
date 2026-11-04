import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
import { saveExportFile, writeMarkdownPath } from '../src/lib/desktop';

beforeEach(() => vi.mocked(invoke).mockReset());

describe('desktop disk writes', () => {
  it('finishes an older save before writing newer contents of the same file', async () => {
    let finishFirst!: () => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce(undefined);
    const first = writeMarkdownPath('C:\\docs\\자료.md', 'old');
    const second = writeMarkdownPath('C:\\docs\\자료.md', 'new');
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    finishFirst();
    await Promise.all([first, second]);
    expect(invoke).toHaveBeenNthCalledWith(2, 'write_markdown_file', {
      path: 'C:\\docs\\자료.md', content: 'new',
    });
  });

  it('reports a failed save and still allows a later retry', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Access denied')).mockResolvedValueOnce(undefined);
    await expect(writeMarkdownPath('readonly.md', 'old')).rejects.toThrow('Access denied');
    await expect(writeMarkdownPath('readonly.md', 'retry')).resolves.toBeUndefined();
  });

  it('passes exact binary export bytes and preserves dialog cancellation', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null);
    const bytes = new Uint8Array([0, 127, 128, 255]);
    await expect(saveExportFile('자료.pdf', new Blob([bytes]))).resolves.toBeNull();
    expect(invoke).toHaveBeenCalledWith('save_export_file', {
      filename: '자료.pdf', bytes: [0, 127, 128, 255],
    });
  });
});
