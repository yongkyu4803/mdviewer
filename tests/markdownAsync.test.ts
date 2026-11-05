// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseMarkdownAsync } from '../src/lib/markdownAsync';

class StuckWorker {
  static last: StuckWorker;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { StuckWorker.last = this; }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('untrusted parser lifetime', () => {
  it('terminates a parser that does not finish within the deadline', async () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker', StuckWorker);
    const result = parseMarkdownAsync('# input');
    const rejected = expect(result).rejects.toThrow('5 seconds');
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(StuckWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it('terminates obsolete work immediately when the document changes', async () => {
    vi.stubGlobal('Worker', StuckWorker);
    const controller = new AbortController();
    const result = parseMarkdownAsync('# input', controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(StuckWorker.last.terminate).toHaveBeenCalledOnce();
  });
});
