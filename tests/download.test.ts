import { describe, expect, it } from 'vitest';
import { entryDownloadName } from '../lib/core/download';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const utf8Bytes = (value: string): number => encoder.encode(value).length;

describe('entryDownloadName', () => {
  it('preserves a flat filename unchanged', () => {
    expect(entryDownloadName('report.txt')).toBe('report.txt');
  });

  it('replaces forward slashes with underscores', () => {
    expect(entryDownloadName('a/report.txt')).toBe('a_report.txt');
    expect(entryDownloadName('a/b/report.txt')).toBe('a_b_report.txt');
  });

  it('replaces backslashes with underscores', () => {
    expect(entryDownloadName('a\\report.txt')).toBe('a_report.txt');
    expect(entryDownloadName('a\\b\\report.txt')).toBe('a_b_report.txt');
  });

  it('produces distinct names for same-basename entries in different directories (collision safety)', () => {
    const a = entryDownloadName('a/report.txt');
    const b = entryDownloadName('b/report.txt');
    expect(a).toBe('a_report.txt');
    expect(b).toBe('b_report.txt');
    expect(a).not.toBe(b);
  });

  it('strips leading absolute-path slashes', () => {
    expect(entryDownloadName('/etc/passwd')).toBe('etc_passwd');
    expect(entryDownloadName('\\windows\\system32\\file.dll')).toBe('windows_system32_file.dll');
  });

  it('strips leading ./ sequences', () => {
    expect(entryDownloadName('./readme.txt')).toBe('readme.txt');
    expect(entryDownloadName('./a/b.txt')).toBe('a_b.txt');
  });

  it('strips leading ../ sequences', () => {
    expect(entryDownloadName('../etc/passwd')).toBe('etc_passwd');
    expect(entryDownloadName('../../up.txt')).toBe('up.txt');
  });

  it('falls back to "file" for an empty or whitespace-only result', () => {
    expect(entryDownloadName('')).toBe('file');
    expect(entryDownloadName('/')).toBe('file');
    expect(entryDownloadName('./')).toBe('file');
    expect(entryDownloadName('   ')).toBe('file');
  });

  it('leaves a normal-length name unchanged (fast path, no hash suffix)', () => {
    expect(entryDownloadName('docs/guide/chapter-01/readme.txt')).toBe(
      'docs_guide_chapter-01_readme.txt',
    );
  });

  it('caps an over-long joined name to 255 UTF-8 bytes and preserves the extension', () => {
    const out = entryDownloadName('a/'.repeat(200) + 'report.txt');
    expect(utf8Bytes(out)).toBeLessThanOrEqual(255);
    expect(out.endsWith('.txt')).toBe(true);
  });

  it('keeps two distinct long paths distinct after capping', () => {
    const a = entryDownloadName('deep/'.repeat(100) + 'alpha-file.bin');
    const b = entryDownloadName('deep/'.repeat(100) + 'beta-file.bin');
    expect(utf8Bytes(a)).toBeLessThanOrEqual(255);
    expect(utf8Bytes(b)).toBeLessThanOrEqual(255);
    expect(a).not.toBe(b);
  });

  it('caps a long astral-character (emoji) name without splitting a surrogate pair', () => {
    const out = entryDownloadName('\u{1F680}'.repeat(100) + '.txt');
    expect(utf8Bytes(out)).toBeLessThanOrEqual(255);
    // A split surrogate pair would surface as U+FFFD after an encode/decode round-trip.
    expect(decoder.decode(encoder.encode(out))).toBe(out);
    expect(out.includes('�')).toBe(false);
    expect(out.endsWith('.txt')).toBe(true);
  });

  it('caps a long name with no extension and adds no spurious dot', () => {
    const out = entryDownloadName('x'.repeat(400));
    expect(utf8Bytes(out)).toBeLessThanOrEqual(255);
    expect(/-[0-9a-f]{8}$/.test(out)).toBe(true);
  });

  it('drops a pathologically long "extension" so it cannot consume the budget', () => {
    const out = entryDownloadName('a.' + 'x'.repeat(300));
    expect(utf8Bytes(out)).toBeLessThanOrEqual(255);
    expect(/-[0-9a-f]{8}$/.test(out)).toBe(true);
  });
});
