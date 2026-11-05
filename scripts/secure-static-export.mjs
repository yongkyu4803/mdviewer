import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Static exports have no per-request nonce. Hash exactly the emitted inline code.
const allHashes = new Set();
function policy(hashes) {
  return ["default-src 'none'", `script-src 'self' ${[...hashes].join(' ')}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'",
    "worker-src 'self' blob:", "connect-src 'self' ipc: http://ipc.localhost",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'self'"].join('; ');
}
async function secure(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await secure(path);
    else if (entry.name.endsWith('.html')) {
      let html = await readFile(path, 'utf8');
      const hashes = new Set();
      for (const [, attributes, script] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (!/\bsrc\s*=/i.test(attributes) && script) {
          const hash = `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
          hashes.add(hash); allHashes.add(hash);
        }
      }
      html = html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/gi, '');
      if (!html.includes('<head>')) throw new Error(`Missing head: ${path}`);
      html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy(hashes)}"><meta name="referrer" content="no-referrer">`);
      await writeFile(path, html);
    }
  }
}
await secure('out');
await writeFile('out/_headers', `/*\n  Content-Security-Policy: ${policy(allHashes)}; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n`);
console.log(`Secured static HTML with ${allHashes.size} inline script hashes and hosting headers.`);
