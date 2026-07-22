import { describe, expect, it } from 'vitest';
import {
  classifyEntryPreview,
  createEntryPreview,
  decodeTextPreview,
  IMAGE_PREVIEW_LIMIT_BYTES,
  isLikelyBinary,
  TEXT_PREVIEW_LIMIT_BYTES,
} from '../lib/tools/unzip/preview';
import type { ExtractedEntry } from '../lib/tools/unzip/types';

const encoder = new TextEncoder();

function entry(path: string, bytes: Uint8Array, size = bytes.byteLength): ExtractedEntry {
  return { path, bytes, size };
}

describe('classifyEntryPreview', () => {
  it('classifies known text extensions case-insensitively', () => {
    expect(classifyEntryPreview('docs/README.MD', encoder.encode('# Hello'))).toEqual({
      kind: 'text',
      typeLabel: 'Markdown',
    });
  });

  it('classifies extensionless UTF-8 content as text', () => {
    expect(classifyEntryPreview('LICENSE', encoder.encode('Permission is hereby granted.'))).toEqual({
      kind: 'text',
      typeLabel: 'Text file',
    });
  });

  it('uses image magic bytes even when the extension is missing', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(classifyEntryPreview('thumbnail', png)).toEqual({
      kind: 'image',
      typeLabel: 'PNG image',
      mimeType: 'image/png',
    });
  });

  it('classifies supported image extensions for browser decoding', () => {
    expect(classifyEntryPreview('art/vector.svg', encoder.encode('<svg></svg>'))).toEqual({
      kind: 'image',
      typeLabel: 'SVG image',
      mimeType: 'image/svg+xml',
    });
  });

  it('does not render a text-named file whose contents are binary', () => {
    expect(classifyEntryPreview('notes.txt', new Uint8Array([0x41, 0x00, 0x42]))).toEqual({
      kind: 'binary',
      typeLabel: 'TXT file (binary)',
    });
  });
});

describe('isLikelyBinary', () => {
  it('detects NUL and dense control bytes in a bounded sample', () => {
    expect(isLikelyBinary(new Uint8Array([0x00, 0x41]))).toBe(true);
    expect(isLikelyBinary(new Uint8Array([0x01, 0x02, 0x03, 0x41]))).toBe(true);
  });

  it('detects binary bytes anywhere in the displayed text window', () => {
    const bytes = new Uint8Array(9 * 1024).fill(0x61);
    bytes[8 * 1024] = 0x00;
    expect(isLikelyBinary(bytes)).toBe(true);
  });

  it('accepts UTF-8 and UTF-16 text', () => {
    expect(isLikelyBinary(encoder.encode('Hello, 世界'))).toBe(false);
    expect(isLikelyBinary(new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]))).toBe(false);
  });

  it('treats invalid UTF-8 as binary rather than dumping replacement characters', () => {
    expect(isLikelyBinary(new Uint8Array([0xc3, 0x28]))).toBe(true);
  });

  it('rejects suspicious controls after a UTF-16 byte-order mark', () => {
    expect(isLikelyBinary(new Uint8Array([0xff, 0xfe, 0x00, 0x00]))).toBe(true);
  });
});

describe('decodeTextPreview', () => {
  it('decodes UTF-8 text without truncation', () => {
    expect(decodeTextPreview(encoder.encode('Hello, 🌍'))).toEqual({
      text: 'Hello, 🌍',
      truncated: false,
      shownBytes: 11,
    });
  });

  it('decodes UTF-16 text when a byte-order mark is present', () => {
    const result = decodeTextPreview(new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]));
    expect(result.text).toBe('Hi');
    expect(result.truncated).toBe(false);
  });

  it('reads no more than the configured text cap', () => {
    const bytes = new Uint8Array(TEXT_PREVIEW_LIMIT_BYTES + 100).fill(0x61);
    const result = decodeTextPreview(bytes);
    expect(result.shownBytes).toBe(TEXT_PREVIEW_LIMIT_BYTES);
    expect(result.text).toHaveLength(TEXT_PREVIEW_LIMIT_BYTES);
    expect(result.truncated).toBe(true);
  });

  it('rejects invalid limits', () => {
    expect(() => decodeTextPreview(encoder.encode('text'), 0)).toThrow(RangeError);
  });
});

describe('createEntryPreview', () => {
  it('returns decoded text and a derived type label', () => {
    expect(createEntryPreview(entry('config.json', encoder.encode('{"offline":true}')))).toEqual({
      kind: 'text',
      typeLabel: 'JSON',
      text: '{"offline":true}',
      truncated: false,
      shownBytes: 16,
    });
  });

  it('marks images over the inline cap without creating preview data', () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(
      createEntryPreview(entry('large.png', pngHeader, IMAGE_PREVIEW_LIMIT_BYTES + 1)),
    ).toEqual({
      kind: 'image',
      typeLabel: 'PNG image',
      mimeType: 'image/png',
      oversized: true,
    });
  });

  it('allows an image exactly at the inline cap', () => {
    const bytes = new Uint8Array(IMAGE_PREVIEW_LIMIT_BYTES);
    bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(createEntryPreview(entry('large.gif', bytes))).toMatchObject({
      kind: 'image',
      oversized: false,
    });
  });

  it('handles empty files as empty text', () => {
    expect(createEntryPreview(entry('empty', new Uint8Array()))).toEqual({
      kind: 'text',
      typeLabel: 'Text file',
      text: '',
      truncated: false,
      shownBytes: 0,
    });
  });
});
