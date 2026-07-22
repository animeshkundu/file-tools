import type { ExtractedEntry } from './types';

export const TEXT_PREVIEW_LIMIT_BYTES = 256 * 1024;
export const IMAGE_PREVIEW_LIMIT_BYTES = 10 * 1024 * 1024;
const BINARY_SCAN_LIMIT_BYTES = TEXT_PREVIEW_LIMIT_BYTES;

type ImageType = {
  label: string;
  mimeType: string;
};

type EntryPreviewType =
  | { kind: 'text'; typeLabel: string }
  | { kind: 'image'; typeLabel: string; mimeType: string }
  | { kind: 'binary'; typeLabel: string };

export type EntryPreviewPlan =
  | {
      kind: 'text';
      typeLabel: string;
      text: string;
      truncated: boolean;
      shownBytes: number;
    }
  | {
      kind: 'image';
      typeLabel: string;
      mimeType: string;
      oversized: boolean;
    }
  | {
      kind: 'binary';
      typeLabel: string;
    };

const IMAGE_TYPES: Readonly<Record<string, ImageType>> = {
  avif: { label: 'AVIF image', mimeType: 'image/avif' },
  bmp: { label: 'BMP image', mimeType: 'image/bmp' },
  gif: { label: 'GIF image', mimeType: 'image/gif' },
  ico: { label: 'Icon image', mimeType: 'image/x-icon' },
  jpeg: { label: 'JPEG image', mimeType: 'image/jpeg' },
  jpg: { label: 'JPEG image', mimeType: 'image/jpeg' },
  png: { label: 'PNG image', mimeType: 'image/png' },
  svg: { label: 'SVG image', mimeType: 'image/svg+xml' },
  webp: { label: 'WebP image', mimeType: 'image/webp' },
};

const TEXT_TYPE_LABELS: Readonly<Record<string, string>> = {
  c: 'C source',
  conf: 'Configuration text',
  cpp: 'C++ source',
  css: 'CSS',
  csv: 'CSV',
  go: 'Go source',
  h: 'C header',
  hpp: 'C++ header',
  htm: 'HTML',
  html: 'HTML',
  ini: 'INI',
  java: 'Java source',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JavaScript JSX',
  log: 'Log text',
  md: 'Markdown',
  mjs: 'JavaScript module',
  py: 'Python source',
  rb: 'Ruby source',
  rs: 'Rust source',
  sh: 'Shell script',
  sql: 'SQL',
  svg: 'SVG image',
  toml: 'TOML',
  ts: 'TypeScript',
  tsx: 'TypeScript JSX',
  txt: 'Plain text',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
};

function pathExtension(path: string): string {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 && dotIndex < filename.length - 1
    ? filename.slice(dotIndex + 1).toLowerCase()
    : '';
}

function bytesMatch(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  return (
    bytes.byteLength >= offset + expected.length &&
    expected.every((value, index) => bytes[offset + index] === value)
  );
}

function asciiMatches(bytes: Uint8Array, expected: string, offset = 0): boolean {
  return (
    bytes.byteLength >= offset + expected.length &&
    [...expected].every((value, index) => bytes[offset + index] === value.charCodeAt(0))
  );
}

function imageTypeFromBytes(bytes: Uint8Array): ImageType | null {
  if (bytesMatch(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return IMAGE_TYPES.png!;
  }
  if (bytesMatch(bytes, [0xff, 0xd8, 0xff])) return IMAGE_TYPES.jpg!;
  if (asciiMatches(bytes, 'GIF87a') || asciiMatches(bytes, 'GIF89a')) return IMAGE_TYPES.gif!;
  if (asciiMatches(bytes, 'RIFF') && asciiMatches(bytes, 'WEBP', 8)) return IMAGE_TYPES.webp!;
  if (asciiMatches(bytes, 'BM')) return IMAGE_TYPES.bmp!;
  if (bytesMatch(bytes, [0x00, 0x00, 0x01, 0x00])) return IMAGE_TYPES.ico!;
  if (
    asciiMatches(bytes, 'ftyp', 4) &&
    (asciiMatches(bytes, 'avif', 8) || asciiMatches(bytes, 'avis', 8))
  ) {
    return IMAGE_TYPES.avif!;
  }
  return null;
}

function hasSuspiciousTextControls(text: string): boolean {
  let controlCharacters = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint === 0) return true;
    if (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0c && codePoint !== 0x0d) {
      controlCharacters += 1;
    }
  }
  return text.length > 0 && controlCharacters / text.length > 0.1;
}

export function isLikelyBinary(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0) return false;

  const sampleLength = Math.min(bytes.byteLength, BINARY_SCAN_LIMIT_BYTES);
  const sample = bytes.subarray(0, sampleLength);
  const stream = sampleLength < bytes.byteLength;
  const utf16Encoding = bytesMatch(sample, [0xff, 0xfe])
    ? 'utf-16le'
    : bytesMatch(sample, [0xfe, 0xff])
      ? 'utf-16be'
      : null;

  if (utf16Encoding) {
    try {
      const decoded = new TextDecoder(utf16Encoding, { fatal: true }).decode(sample, { stream });
      return hasSuspiciousTextControls(decoded);
    } catch {
      return true;
    }
  }

  let controlBytes = 0;

  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0c && byte !== 0x0d) {
      controlBytes += 1;
    }
  }

  if (controlBytes / sampleLength > 0.1) return true;

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream });
    return false;
  } catch {
    return true;
  }
}

export function classifyEntryPreview(path: string, bytes: Uint8Array): EntryPreviewType {
  const extension = pathExtension(path);
  const imageType = imageTypeFromBytes(bytes) ?? IMAGE_TYPES[extension];
  if (imageType) {
    return { kind: 'image', typeLabel: imageType.label, mimeType: imageType.mimeType };
  }

  const textTypeLabel = TEXT_TYPE_LABELS[extension];
  if (!isLikelyBinary(bytes)) {
    return { kind: 'text', typeLabel: textTypeLabel ?? 'Text file' };
  }

  return {
    kind: 'binary',
    typeLabel: extension ? `${extension.toUpperCase()} file (binary)` : 'Binary data',
  };
}

export function decodeTextPreview(
  bytes: Uint8Array,
  maxBytes = TEXT_PREVIEW_LIMIT_BYTES,
): { text: string; truncated: boolean; shownBytes: number } {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('The text preview limit must be a positive integer.');
  }

  const shownBytes = Math.min(bytes.byteLength, maxBytes);
  const sample = bytes.subarray(0, shownBytes);
  const encoding = bytesMatch(sample, [0xff, 0xfe])
    ? 'utf-16le'
    : bytesMatch(sample, [0xfe, 0xff])
      ? 'utf-16be'
      : 'utf-8';

  return {
    text: new TextDecoder(encoding).decode(sample, { stream: shownBytes < bytes.byteLength }),
    truncated: shownBytes < bytes.byteLength,
    shownBytes,
  };
}

export function createEntryPreview(entry: ExtractedEntry): EntryPreviewPlan {
  const previewType = classifyEntryPreview(entry.path, entry.bytes);

  if (previewType.kind === 'text') {
    return {
      kind: 'text',
      typeLabel: previewType.typeLabel,
      ...decodeTextPreview(entry.bytes),
    };
  }

  if (previewType.kind === 'image') {
    return {
      ...previewType,
      oversized:
        entry.size > IMAGE_PREVIEW_LIMIT_BYTES ||
        entry.bytes.byteLength > IMAGE_PREVIEW_LIMIT_BYTES,
    };
  }

  return previewType;
}
