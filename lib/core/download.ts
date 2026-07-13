export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

// Most filesystems cap a single filename at 255 bytes (ext4) or 255 UTF-16
// code units (NTFS, APFS). Bound the flat download name to 255 UTF-8 bytes —
// the tightest common limit — so a deeply nested archive path cannot produce
// an unsaveable name.
const MAX_DOWNLOAD_NAME_BYTES = 255;
// A trailing ".ext" longer than this is treated as data, not an extension, so
// a pathologically long suffix cannot consume the whole budget.
const MAX_EXTENSION_BYTES = 16;

const utf8Encoder = new TextEncoder();

function utf8Length(value: string): number {
  return utf8Encoder.encode(value).length;
}

// Deterministic 32-bit FNV-1a over the string's UTF-16 code units, rendered as
// 8 lowercase hex chars. Used to keep distinct long names from colliding after
// truncation; it makes a collision unlikely, not impossible, and is not a
// security primitive.
function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Truncate to at most `maxBytes` UTF-8 bytes on a code-point boundary, so a
// multi-byte character or surrogate pair is never split. Iterating the string
// yields whole code points.
function truncateToBytes(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  let result = '';
  let bytes = 0;
  for (const codePoint of value) {
    const codePointBytes = utf8Length(codePoint);
    if (bytes + codePointBytes > maxBytes) break;
    result += codePoint;
    bytes += codePointBytes;
  }
  return result;
}

/**
 * Derives a collision-safe, flat download filename from a ZIP entry path.
 *
 * Strips leading absolute-path indicators and leading `./` / `../` sequences,
 * then replaces every remaining path separator (`/` or `\`) with `_` so that
 * distinct archive entries (e.g. `a/report.txt` and `b/report.txt`) always
 * produce distinct filenames (`a_report.txt` and `b_report.txt`).
 *
 * If the joined name would exceed the filesystem-safe byte budget, it is
 * truncated on a code-point boundary and a short deterministic hash of the full
 * name is appended before the preserved extension, so distinct long paths stay
 * distinct.
 */
export function entryDownloadName(entryPath: string): string {
  const name = entryPath
    .replace(/^[/\\]+/, '')        // strip leading slashes (absolute paths)
    .replace(/^(\.\.?[/\\])+/, '') // strip leading ./ and ../
    .replace(/[/\\]/g, '_');       // replace remaining separators with _
  const safe = name.trim() ? name : 'file';

  if (utf8Length(safe) <= MAX_DOWNLOAD_NAME_BYTES) {
    return safe;
  }

  // Preserve a short trailing extension (the last dot that is not the first
  // character); ignore an over-long "extension" so it cannot eat the budget.
  const dot = safe.lastIndexOf('.');
  let ext = '';
  if (dot > 0) {
    const candidate = safe.slice(dot);
    if (utf8Length(candidate) <= MAX_EXTENSION_BYTES) {
      ext = candidate;
    }
  }
  const base = ext ? safe.slice(0, safe.length - ext.length) : safe;

  const hash = shortHash(safe);
  const reserved = utf8Length(`-${hash}`) + utf8Length(ext);
  const truncatedBase = truncateToBytes(base, MAX_DOWNLOAD_NAME_BYTES - reserved);
  return truncatedBase ? `${truncatedBase}-${hash}${ext}` : `${hash}${ext}`;
}
