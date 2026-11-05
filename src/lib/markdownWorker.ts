import { lexMarkdown, parseMarkdown } from './markdownParser';
import { MAX_DOCUMENT_BYTES } from './documentSecurityLimits';

self.onmessage = ({ data }: MessageEvent<{ content: string; mode: 'parse' | 'lex' }>) => {
  try {
    if (new TextEncoder().encode(data.content).length > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds 8 MiB.');
    const result = data.mode === 'parse' ? parseMarkdown(data.content) : lexMarkdown(data.content);
    if (typeof result === 'string' && result.length > 32 * 1024 * 1024) throw new Error('Rendered document exceeds 32 MiB. Split the document.');
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: String(error) }); }
};
