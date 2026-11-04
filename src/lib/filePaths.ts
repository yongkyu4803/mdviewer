/** Filesystem paths must not be parsed as URLs until their components are escaped. */
export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || 'Untitled.md';
}

/** Resolve relative image URLs on either OS, preserving Unicode normalization. */
export function resolveMarkdownImagePath(source: string, documentPath: string): string | null {
  if (!source || /^(?:[a-z][a-z\d+.-]*:|[\\/]|#)/i.test(source)) return null;

  // Windows canonical paths may include the extended-length prefix.
  let path = documentPath.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
  const windows = /^[a-z]:[\\/]/i.test(path) || path.startsWith('\\\\');
  if (windows) path = path.replace(/\\/g, '/');

  try {
    let base: URL;
    if (windows && path.startsWith('//')) {
      const [server, ...segments] = path.slice(2).split('/');
      base = new URL(`file://${server}/${segments.map(encodeURIComponent).join('/')}`);
    } else if (windows) {
      base = new URL(`file:///${path.slice(0, 2)}${path.slice(2).split('/').map(encodeURIComponent).join('/')}`);
    } else {
      if (!path.startsWith('/')) return null;
      base = new URL(`file://${path.split('/').map(encodeURIComponent).join('/')}`);
    }

    const resolved = new URL(source, base);
    if (resolved.protocol !== 'file:' || resolved.host !== base.host) return null;
    const pathname = decodeURIComponent(resolved.pathname);
    if (!windows) return pathname;
    if (resolved.hostname) return `\\\\${resolved.hostname}${pathname.replace(/\//g, '\\')}`;
    return pathname.slice(1).replace(/\//g, '\\');
  } catch {
    return null;
  }
}

export function exportFileName(title: string, extension: 'md' | 'pdf' | 'docx'): string {
  let name = title.replace(/\.(md|markdown|txt)$/i, '').trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\u0000-\u001f]/g, '_') // Windows rejects control characters too.
    .replace(/[. ]+$/g, '');
  if (!name) name = 'document';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  return `${name}.${extension}`;
}
