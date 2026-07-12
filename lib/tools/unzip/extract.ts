import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import {
  ArchiveSafetyBudget,
  ArchiveSafetyError,
  DEFAULT_ARCHIVE_LIMITS,
  type ArchiveEntryKind,
  type ArchiveLimits,
} from '../../core/safety';
import type { ExtractedEntry } from './types';

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const UTF_8 = new TextDecoder();
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

type CentralDirectoryEntry = {
  name: string;
  kind: ArchiveEntryKind;
  hasDataDescriptor: boolean;
  compression: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) {
    throw new ArchiveSafetyError('Archive structure is truncated.');
  }
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new ArchiveSafetyError('Archive structure is truncated.');
  }
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function classifyEntryKind(
  name: string,
  versionMadeBy: number,
  externalAttributes: number,
): ArchiveEntryKind {
  if (name.endsWith('/')) return 'directory';

  const madeBySystem = versionMadeBy >>> 8;
  if (madeBySystem === 3) {
    const mode = (externalAttributes >>> 16) & 0xffff;
    const type = mode & 0o170000;
    if (type === 0o120000) return 'symlink';
    if (type === 0o040000) return 'directory';
    if (type !== 0 && type !== 0o100000) return 'special';
  }

  return 'file';
}

function findEndOfCentralDirectory(archive: Uint8Array): number {
  const minimum = 22;
  if (archive.length < minimum) {
    throw new ArchiveSafetyError('Archive is missing end-of-central-directory metadata.');
  }

  const maxCommentLength = 0xffff;
  const searchStart = Math.max(0, archive.length - (minimum + maxCommentLength));
  for (let offset = archive.length - minimum; offset >= searchStart; offset -= 1) {
    if (readUint32(archive, offset) !== EOCD_SIGNATURE) continue;
    const commentLength = readUint16(archive, offset + 20);
    if (offset + minimum + commentLength === archive.length) return offset;
  }
  throw new ArchiveSafetyError('Archive is missing end-of-central-directory metadata.');
}

function readCentralDirectoryEntries(archive: Uint8Array): CentralDirectoryEntry[] {
  const eocdOffset = findEndOfCentralDirectory(archive);
  const entryCount = readUint16(archive, eocdOffset + 10);
  const centralDirectorySize = readUint32(archive, eocdOffset + 12);
  const centralDirectoryOffset = readUint32(archive, eocdOffset + 16);
  if (
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new ArchiveSafetyError('Zip64 central directories are not supported.');
  }
  if (centralDirectoryOffset + centralDirectorySize > archive.length) {
    throw new ArchiveSafetyError('Archive central directory is out of bounds.');
  }

  const entries: CentralDirectoryEntry[] = [];
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  let offset = centralDirectoryOffset;
  while (offset < centralDirectoryEnd) {
    if (readUint32(archive, offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new ArchiveSafetyError('Archive central directory has an invalid record.');
    }

    const versionMadeBy = readUint16(archive, offset + 4);
    const flags = readUint16(archive, offset + 8);
    const compression = readUint16(archive, offset + 10);
    const crc32 = readUint32(archive, offset + 16);
    const compressedSize = readUint32(archive, offset + 20);
    const uncompressedSize = readUint32(archive, offset + 24);
    const nameLength = readUint16(archive, offset + 28);
    const extraLength = readUint16(archive, offset + 30);
    const commentLength = readUint16(archive, offset + 32);
    const externalAttributes = readUint32(archive, offset + 38);
    const localHeaderOffset = readUint32(archive, offset + 42);

    const variableStart = offset + 46;
    const variableEnd = variableStart + nameLength + extraLength + commentLength;
    if (variableEnd > archive.length || variableEnd > centralDirectoryEnd) {
      throw new ArchiveSafetyError('Archive central directory has a truncated record.');
    }
    const nameBytes = archive.subarray(variableStart, variableStart + nameLength);
    const name = UTF_8.decode(nameBytes);
    entries.push({
      name,
      kind: classifyEntryKind(name, versionMadeBy, externalAttributes),
      hasDataDescriptor: (flags & 0x0008) !== 0,
      compression,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = variableEnd;
  }

  if (offset !== centralDirectoryEnd || entries.length !== entryCount) {
    throw new ArchiveSafetyError('Archive central directory entry count is inconsistent.');
  }

  return entries;
}

function validateLocalHeaderMatchesCentral(
  archive: Uint8Array,
  centralEntry: CentralDirectoryEntry,
): void {
  const offset = centralEntry.localHeaderOffset;
  if (offset + 30 > archive.length || readUint32(archive, offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new ArchiveSafetyError('Archive local header is missing or invalid.');
  }

  const localFlags = readUint16(archive, offset + 6);
  const localCompression = readUint16(archive, offset + 8);
  const localCrc32 = readUint32(archive, offset + 14);
  const localCompressedSize = readUint32(archive, offset + 18);
  const localUncompressedSize = readUint32(archive, offset + 22);
  const localNameLength = readUint16(archive, offset + 26);
  const localExtraLength = readUint16(archive, offset + 28);
  const localNameStart = offset + 30;
  const localNameEnd = localNameStart + localNameLength;
  if (localNameEnd > archive.length || localNameEnd + localExtraLength > archive.length) {
    throw new ArchiveSafetyError('Archive local header is truncated.');
  }

  const localName = archive.subarray(localNameStart, localNameEnd);
  if (UTF_8.decode(localName) !== centralEntry.name) {
    throw new ArchiveSafetyError('Archive local and central filenames do not match.');
  }
  if (localCompression !== centralEntry.compression) {
    throw new ArchiveSafetyError('Archive local and central compression methods do not match.');
  }

  const localHasDataDescriptor = (localFlags & 0x0008) !== 0;
  if (localHasDataDescriptor !== centralEntry.hasDataDescriptor) {
    throw new ArchiveSafetyError('Archive local and central descriptor flags do not match.');
  }
  if (!centralEntry.hasDataDescriptor) {
    if (localCrc32 !== centralEntry.crc32) {
      throw new ArchiveSafetyError('Archive local and central CRC values do not match.');
    }
    if (
      localCompressedSize !== centralEntry.compressedSize ||
      localUncompressedSize !== centralEntry.uncompressedSize
    ) {
      throw new ArchiveSafetyError('Archive local and central size values do not match.');
    }
  }
}

function buildCentralDirectoryIndex(archive: Uint8Array): Map<string, CentralDirectoryEntry> {
  const entries = readCentralDirectoryEntries(archive);
  for (const entry of entries) {
    validateLocalHeaderMatchesCentral(archive, entry);
  }
  const index = new Map<string, CentralDirectoryEntry>();
  for (const entry of entries) {
    if (index.has(entry.name)) {
      throw new ArchiveSafetyError('Archive central directory contains duplicate entry names.');
    }
    index.set(entry.name, entry);
  }
  return index;
}

function updateCrc32(crc: number, chunk: Uint8Array): number {
  for (const byte of chunk) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!;
  }
  return crc >>> 0;
}

function concatChunks(chunks: Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function extractZip(
  archive: Uint8Array,
  limits: Partial<ArchiveLimits> = {},
): ExtractedEntry[] {
  const budget = new ArchiveSafetyBudget({ ...DEFAULT_ARCHIVE_LIMITS, ...limits });
  const entries: ExtractedEntry[] = [];
  const centralEntriesByName = buildCentralDirectoryIndex(archive);
  const unzipper = new Unzip((file) => {
    const centralEntry = centralEntriesByName.get(file.name);
    if (centralEntry) centralEntriesByName.delete(file.name);
    if (!centralEntry) {
      throw new ArchiveSafetyError('Archive entry is missing from the central directory.');
    }

    const path = budget.addEntry(file.name, centralEntry.kind);
    const declaredSize = file.originalSize ?? centralEntry.uncompressedSize;
    budget.checkDeclaredSize(BigInt(declaredSize));
    if (centralEntry.kind === 'directory') return;

    let crc = 0xffffffff;
    let size = 0;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      if (error) {
        throw new ArchiveSafetyError(
          `Archive entry failed to extract: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      budget.addEmittedBytes(chunk.byteLength);
      size += chunk.byteLength;
      if (chunk.byteLength > 0) {
        chunks.push(chunk);
        crc = updateCrc32(crc, chunk);
      }
      if (final) {
        const actualCrc32 = (crc ^ 0xffffffff) >>> 0;
        if (actualCrc32 !== centralEntry.crc32) {
          throw new ArchiveSafetyError(`Archive entry failed CRC validation: ${path}`);
        }
        entries.push({ path, bytes: concatChunks(chunks, size), size });
      }
    };

    file.start();
  });
  unzipper.register(UnzipPassThrough);
  unzipper.register(UnzipInflate);
  try {
    unzipper.push(archive, true);
  } catch (error) {
    if (error instanceof ArchiveSafetyError) throw error;
    throw new ArchiveSafetyError(
      `Archive parsing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (centralEntriesByName.size > 0) {
    throw new ArchiveSafetyError('Archive central directory has entries missing from local records.');
  }
  budget.assertWithinTime();
  return entries;
}
