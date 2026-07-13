import { describe, expect, it } from 'vitest';
import { entryDownloadName } from '../lib/core/download';

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
});
