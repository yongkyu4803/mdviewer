// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSavedDocuments, loadDocuments, saveDocuments } from '../src/lib/documentStore';

beforeEach(() => localStorage.clear());
const fixture = { id: 'file:/private/notes.md', title: 'notes.md', content: '# draft', updatedAt: '2026-11-05', desktopFilePath: '/private/notes.md' };

describe('local draft privacy', () => {
  it('reports an oversized library without overwriting existing copies', async () => {
    localStorage.setItem('markmd_documents', JSON.stringify([fixture]));
    await expect(saveDocuments(Array(129).fill(fixture))).rejects.toThrow('128');
    expect(localStorage.getItem('markmd_documents')).toBe(JSON.stringify([fixture]));
  });
  it('does not silently replace an invalid stored library with default documents', async () => {
    localStorage.setItem('markmd_documents', '{broken');
    await expect(loadDocuments()).rejects.toThrow();
    expect(localStorage.getItem('markmd_documents')).toBe('{broken');
  });
  it('does not retain native permissions or filesystem paths in saved copies', async () => {
    await saveDocuments([fixture]);
    const raw = localStorage.getItem('markmd_documents');
    expect(raw).not.toContain('/private/');
    const restored = await loadDocuments();
    expect(restored?.[0].content).toBe('# draft');
    expect(restored?.[0].desktopFilePath).toBeUndefined();
  });
  it('strips filesystem authority from old or tampered drafts', async () => {
    localStorage.setItem('markmd_documents', JSON.stringify([fixture]));
    const restored = await loadDocuments();
    expect(restored?.[0].desktopFilePath).toBeUndefined();
    expect(restored?.[0].id).not.toContain('/private/');
  });
  it('clears copies after an already-queued save so they do not reappear', async () => {
    const save = saveDocuments([fixture]);
    const clear = clearSavedDocuments();
    await Promise.all([save, clear]);
    expect(await loadDocuments()).toBeNull();
  });
});
