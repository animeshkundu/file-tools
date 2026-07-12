import { strFromU8, strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractZip } from '../lib/tools/unzip/extract';

describe('extractZip', () => {
  it('round-trips a real fflate ZIP archive', () => {
    const archive = zipSync({ 'hello.txt': strToU8('hello, private world') });
    const entries = extractZip(archive);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe('hello.txt');
    expect(strFromU8(entries[0]!.bytes)).toBe('hello, private world');
  });

  it('enforces the emitted byte cap while extracting', () => {
    const archive = zipSync({ 'large.txt': strToU8('12345') });
    expect(() => extractZip(archive, { maxEmittedBytes: 4n })).toThrow(/extraction limit/u);
  });
});
