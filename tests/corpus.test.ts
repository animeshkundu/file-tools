import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ArchiveSafetyError } from '../lib/core/safety';
import { extractZip } from '../lib/tools/unzip/extract';

const corpusDirectory = fileURLToPath(new URL('./fixtures/corpus/', import.meta.url));
const fixtureNames = [
  'case-colliding-paths.zip',
  'crc-corrupt.zip',
  'duplicate-paths.zip',
  'local-central-name-mismatch.zip',
  'oversized-name.zip',
  'truncated.zip',
  'unicode-bidi-name.zip',
  'unsupported-method.zip',
  'windows-reserved-name.zip',
] as const;

function fixture(name: (typeof fixtureNames)[number]): Uint8Array {
  return readFileSync(join(corpusDirectory, name));
}

function findSignature(bytes: Uint8Array, signature: readonly number[]): number {
  for (let offset = 0; offset <= bytes.length - signature.length; offset += 1) {
    if (signature.every((value, index) => bytes[offset + index] === value)) return offset;
  }
  throw new Error('ZIP structure is missing an expected signature.');
}

function uint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) {
    throw new Error('Out-of-bounds uint16 read while checking fixture integrity.');
  }
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function uint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new Error('Out-of-bounds uint32 read while checking fixture integrity.');
  }
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe('adversarial ZIP corpus', () => {
  it('contains every release-gate fixture', () => {
    expect(readdirSync(corpusDirectory).sort()).toEqual([...fixtureNames].sort());
  });

  it.each([
    'case-colliding-paths.zip',
    'duplicate-paths.zip',
    'local-central-name-mismatch.zip',
    'oversized-name.zip',
    'unicode-bidi-name.zip',
    'windows-reserved-name.zip',
  ] as const)('rejects the policy bypass in %s', (name) => {
    expect(() => extractZip(fixture(name))).toThrow(ArchiveSafetyError);
  });

  it.each(['truncated.zip', 'unsupported-method.zip'] as const)(
    'fails cleanly on malformed structure in %s',
    (name) => {
      expect(() => extractZip(fixture(name))).toThrow(ArchiveSafetyError);
    },
  );

  it('rejects a genuinely CRC-corrupt fixture', () => {
    const bytes = fixture('crc-corrupt.zip');
    const local = findSignature(bytes, [0x50, 0x4b, 0x03, 0x04]);
    const nameLength = uint16(bytes, local + 26);
    const extraLength = uint16(bytes, local + 28);
    const size = uint32(bytes, local + 22);
    const payloadOffset = local + 30 + nameLength + extraLength;
    expect(crc32(bytes.subarray(payloadOffset, payloadOffset + size))).not.toBe(
      uint32(bytes, local + 14),
    );
    expect(() => extractZip(bytes)).toThrow(/CRC/u);
  });

  it('retains a genuine local/central-directory filename disagreement', () => {
    const bytes = fixture('local-central-name-mismatch.zip');
    const decoder = new TextDecoder();
    const local = findSignature(bytes, [0x50, 0x4b, 0x03, 0x04]);
    const central = findSignature(bytes, [0x50, 0x4b, 0x01, 0x02]);
    const localName = decoder.decode(
      bytes.subarray(local + 30, local + 30 + uint16(bytes, local + 26)),
    );
    const centralName = decoder.decode(
      bytes.subarray(central + 46, central + 46 + uint16(bytes, central + 28)),
    );
    expect(localName).not.toBe(centralName);
  });
});
