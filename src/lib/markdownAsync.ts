import type { TokensList } from 'marked';
import { assertDocumentSize } from './documentSecurity';

function runWorker<T>(content: string, mode: 'parse' | 'lex', signal?: AbortSignal): Promise<T> {
  assertDocumentSize(content);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./markdownWorker.ts', import.meta.url));
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker.terminate(); };
    const cancel = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Parsing exceeded 5 seconds. Reduce the document size.')); }, 5000);
    worker.onmessage = ({ data }) => { cleanup(); if (data.error) reject(new Error(data.error)); else resolve(data.result); };
    worker.onerror = () => { cleanup(); reject(new Error('Could not parse document.')); };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    else worker.postMessage({ content, mode });
  });
}

export const parseMarkdownAsync = (content: string, signal?: AbortSignal) => runWorker<string>(content, 'parse', signal);
export const lexMarkdownAsync = (content: string) => runWorker<TokensList>(content, 'lex');
