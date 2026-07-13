export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Derives a collision-safe, flat download filename from a ZIP entry path.
 *
 * Strips leading absolute-path indicators and leading `./` / `../` sequences,
 * then replaces every remaining path separator (`/` or `\`) with `_` so that
 * distinct archive entries (e.g. `a/report.txt` and `b/report.txt`) always
 * produce distinct filenames (`a_report.txt` and `b_report.txt`).
 */
export function entryDownloadName(entryPath: string): string {
  const name = entryPath
    .replace(/^[/\\]+/, '')        // strip leading slashes (absolute paths)
    .replace(/^(\.\.?[/\\])+/, '') // strip leading ./ and ../
    .replace(/[/\\]/g, '_');       // replace remaining separators with _
  return name.trim() ? name : 'file';
}
