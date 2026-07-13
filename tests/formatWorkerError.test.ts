import { describe, expect, it } from 'vitest';
import { ArchiveSafetyError } from '../lib/core/safety';
import { ArchiveUnsupportedError } from '../lib/tools/unzip/extract';
import { formatWorkerError } from '../lib/tools/unzip/formatWorkerError';

describe('formatWorkerError', () => {
  it('maps ArchiveUnsupportedError with reason encrypted to the friendly message', () => {
    const err = new ArchiveUnsupportedError('encrypted', 'Archive contains an encrypted entry.');
    expect(formatWorkerError(err)).toBe(
      "This ZIP is password-protected, which isn't supported yet.",
    );
  });

  it('maps ArchiveUnsupportedError with reason zip64 to the friendly message', () => {
    const err = new ArchiveUnsupportedError('zip64', 'Archive uses Zip64 extensions.');
    expect(formatWorkerError(err)).toBe(
      'This ZIP is too large (over 4 GB) for the current extractor.',
    );
  });

  it('does not leak internal ArchiveUnsupportedError message text', () => {
    const encryptedErr = new ArchiveUnsupportedError('encrypted', 'INTERNAL_PARSE_DETAIL');
    const zip64Err = new ArchiveUnsupportedError('zip64', 'INTERNAL_PARSE_DETAIL');
    expect(formatWorkerError(encryptedErr)).not.toContain('INTERNAL_PARSE_DETAIL');
    expect(formatWorkerError(zip64Err)).not.toContain('INTERNAL_PARSE_DETAIL');
  });

  it('maps ArchiveSafetyError to the generic safety message', () => {
    const err = new ArchiveSafetyError('Archive entry tries to leave the extraction folder.');
    expect(formatWorkerError(err)).toBe("This archive can't be opened safely.");
  });

  it.each([
    ['corrupt', 'This ZIP appears to be corrupted or incomplete.'],
    ['unsafe-path', "This ZIP contains unsafe file paths, so it wasn't extracted."],
    ['too-large', 'This ZIP is too large or has too many files to extract safely.'],
    ['unsupported-method', "This ZIP uses a compression method that isn't supported yet."],
  ] as const)('maps %s ArchiveSafetyError to category-specific copy', (category, copy) => {
    expect(formatWorkerError(new ArchiveSafetyError('INTERNAL_PARSE_DETAIL', category))).toBe(copy);
  });

  it('keeps the generic safety message for an untagged ArchiveSafetyError', () => {
    expect(formatWorkerError(new ArchiveSafetyError('INTERNAL_PARSE_DETAIL'))).toBe(
      "This archive can't be opened safely.",
    );
  });

  it('passes through plain Error messages unchanged', () => {
    expect(formatWorkerError(new Error('Extraction timed out.'))).toBe('Extraction timed out.');
  });

  it('uses the fallback message for non-Error values', () => {
    expect(formatWorkerError('string error')).toBe('Could not extract this archive.');
    expect(formatWorkerError(null)).toBe('Could not extract this archive.');
    expect(formatWorkerError(42)).toBe('Could not extract this archive.');
  });

  it('ArchiveUnsupportedError is not caught by the ArchiveSafetyError branch', () => {
    const err = new ArchiveUnsupportedError('encrypted', 'x');
    expect(err instanceof ArchiveSafetyError).toBe(false);
    expect(formatWorkerError(err)).not.toBe("This archive can't be opened safely.");
  });
});
