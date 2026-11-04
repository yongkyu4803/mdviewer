import { isDesktopApp, saveExportFile } from './desktop';

/** Desktop saves use an OS dialog; web downloads retain browser behavior. */
export async function downloadBlob(blob: Blob, filename: string): Promise<string | null> {
  if (isDesktopApp()) return saveExportFile(filename, blob);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the Blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return null;
}
