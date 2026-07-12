import { strFromU8, strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractZip } from '../lib/tools/unzip/extract';

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function patchDeclaredUncompressedSizes(archive: Uint8Array, size: number): Uint8Array {
  const patched = archive.slice();
  const localSignature = [0x50, 0x4b, 0x03, 0x04];
  const centralSignature = [0x50, 0x4b, 0x01, 0x02];

  for (let offset = 0; offset <= patched.length - 4; offset += 1) {
    if (localSignature.every((byte, index) => patched[offset + index] === byte)) {
      writeUint32(patched, offset + 22, size);
    }
    if (centralSignature.every((byte, index) => patched[offset + index] === byte)) {
      writeUint32(patched, offset + 24, size);
    }
  }

  return patched;
}

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

  it('enforces cumulative declared-size limits before inflating data', () => {
    const archive = zipSync({ 'a.txt': strToU8('a'), 'b.txt': strToU8('b') });
    const patched = patchDeclaredUncompressedSizes(archive, 6);
    expect(() => extractZip(patched, { maxEmittedBytes: 10n })).toThrow(/declared sizes exceed/u);
  });
});
