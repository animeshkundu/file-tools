import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import {
  ArchiveSafetyBudget,
  ArchiveSafetyError,
  DEFAULT_ARCHIVE_LIMITS,
  type ArchiveEntryKind,
  type ArchiveLimits,
} from '../../core/safety';
import { ARCHIVE_READ_CHUNK_BYTES, MAX_ENTRY_OUTPUT_BYTES, type ExtractedEntry } from './types';

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

function classifyEntryKind(name: string, externalAttributes: number): ArchiveEntryKind {
  if (name.endsWith('/')) return 'directory';

  const mode = (externalAttributes >>> 16) & 0xffff;
  const type = mode & 0o170000;
  if (type === 0o120000) return 'symlink';
  if (type === 0o040000) return 'directory';
  if (type !== 0 && type !== 0o100000) return 'special';

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
      kind: classifyEntryKind(name, externalAttributes),
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

type ExtractOptions = Partial<ArchiveLimits> & {
  maxEntryBytes?: bigint;
};

type ExtractCallbacks = {
  onEntry: (entry: ExtractedEntry) => void;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
};

type TerminableEntry = {
  terminate: () => void;
};

function splitLimits(options: ExtractOptions): {
  limits: Partial<ArchiveLimits>;
  maxEntryBytes: bigint;
} {
  const { maxEntryBytes = MAX_ENTRY_OUTPUT_BYTES, ...limits } = options;
  if (maxEntryBytes < 0n) {
    throw new ArchiveSafetyError('Per-entry extraction limit must be non-negative.');
  }
  return { limits, maxEntryBytes };
}

export function toBigIntSize(size: number | undefined): bigint {
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
    throw new ArchiveSafetyError('Archive entry declares an invalid size.');
  }
  return BigInt(size);
}

function abortEntry(entry: TerminableEntry, error: unknown): never {
  entry.terminate();
  throw error;
}

function assertEntryChunkWithinLimit(
  currentSize: number,
  chunkSize: number,
  maxEntryBytes: bigint,
): number {
  const nextSize = currentSize + chunkSize;
  if (!Number.isSafeInteger(nextSize) || BigInt(nextSize) > maxEntryBytes) {
    throw new ArchiveSafetyError('Archive entry expanded beyond the per-entry extraction limit.');
  }
  return nextSize;
}

function joinEntryChunks(chunks: Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  chunks.length = 0;
  return output;
}

export function extractZip(archive: Uint8Array, options: ExtractOptions = {}): ExtractedEntry[] {
  const { limits, maxEntryBytes } = splitLimits(options);
  const budget = new ArchiveSafetyBudget({ ...DEFAULT_ARCHIVE_LIMITS, ...limits });
  const entries: ExtractedEntry[] = [];
  const centralEntriesByName = buildCentralDirectoryIndex(archive);
  for (const entry of centralEntriesByName.values()) {
    const declaredSize = toBigIntSize(entry.uncompressedSize);
    budget.checkDeclaredSize(declaredSize);
    if (declaredSize > maxEntryBytes) {
      throw new ArchiveSafetyError('Archive declares an entry larger than the per-entry limit.');
    }
  }
  const unzipper = new Unzip((file) => {
    const centralEntry = centralEntriesByName.get(file.name);
    if (centralEntry) centralEntriesByName.delete(file.name);
    if (!centralEntry) {
      throw new ArchiveSafetyError('Archive entry is missing from the central directory.');
    }

    const path = budget.addEntry(file.name, centralEntry.kind);
    if (centralEntry.kind === 'directory') {
      file.ondata = (error, chunk) => {
        if (error) {
          throw new ArchiveSafetyError(
            `Archive directory failed to extract: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (chunk.byteLength > 0) {
          throw new ArchiveSafetyError('Archive directory entry contains data.');
        }
      };
      file.start();
      return;
    }

    let crc = 0xffffffff;
    let size = 0;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      try {
        if (error) {
          throw new ArchiveSafetyError(
            `Archive entry failed to extract: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const nextSize = assertEntryChunkWithinLimit(size, chunk.byteLength, maxEntryBytes);
        budget.addEmittedBytes(chunk.byteLength);
        if (chunk.byteLength > 0) {
          chunks.push(chunk);
          crc = updateCrc32(crc, chunk);
        }
        size = nextSize;
        if (final) {
          if (size !== centralEntry.uncompressedSize) {
            throw new ArchiveSafetyError(`Archive entry size does not match its metadata: ${path}`);
          }
          const actualCrc32 = (crc ^ 0xffffffff) >>> 0;
          if (actualCrc32 !== centralEntry.crc32) {
            throw new ArchiveSafetyError(`Archive entry failed CRC validation: ${path}`);
          }
          const output = joinEntryChunks(chunks, size);
          entries.push({ path, bytes: output, size });
        }
      } catch (caughtError) {
        chunks.length = 0;
        abortEntry(file, caughtError);
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
    throw new ArchiveSafetyError(
      'Archive central directory has entries missing from local records.',
    );
  }
  budget.assertWithinTime();
  return entries;
}

async function readFileRange(file: File, start: number, length: number): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(length) ||
    start < 0 ||
    length < 0 ||
    start + length > file.size
  ) {
    throw new ArchiveSafetyError('Archive structure points outside the selected file.');
  }
  return new Uint8Array(await file.slice(start, start + length).arrayBuffer());
}

async function readCentralDirectoryEntriesFromFile(
  file: File,
  maxEntries: number,
): Promise<CentralDirectoryEntry[]> {
  const tailLength = Math.min(file.size, 22 + 0xffff);
  const tailOffset = file.size - tailLength;
  const tail = await readFileRange(file, tailOffset, tailLength);
  const relativeEocdOffset = findEndOfCentralDirectory(tail);
  const eocdOffset = tailOffset + relativeEocdOffset;
  const entryCount = readUint16(tail, relativeEocdOffset + 10);
  const centralDirectorySize = readUint32(tail, relativeEocdOffset + 12);
  const centralDirectoryOffset = readUint32(tail, relativeEocdOffset + 16);
  if (
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new ArchiveSafetyError('Zip64 central directories are not supported.');
  }
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > eocdOffset || centralDirectoryEnd > file.size) {
    throw new ArchiveSafetyError('Archive central directory is out of bounds.');
  }

  const entries: CentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;
  while (offset < centralDirectoryEnd) {
    if (offset + 46 > centralDirectoryEnd) {
      throw new ArchiveSafetyError('Archive central directory has a truncated record.');
    }
    const fixed = await readFileRange(file, offset, 46);
    if (readUint32(fixed, 0) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new ArchiveSafetyError('Archive central directory has an invalid record.');
    }
    const nameLength = readUint16(fixed, 28);
    const extraLength = readUint16(fixed, 30);
    const commentLength = readUint16(fixed, 32);
    const variableLength = nameLength + extraLength + commentLength;
    if (offset + 46 + variableLength > centralDirectoryEnd) {
      throw new ArchiveSafetyError('Archive central directory has a truncated record.');
    }
    const variable = await readFileRange(file, offset + 46, variableLength);
    const name = UTF_8.decode(variable.subarray(0, nameLength));
    if (entries.length >= maxEntries) {
      throw new ArchiveSafetyError('Archive contains too many entries.');
    }
    entries.push({
      name,
      kind: classifyEntryKind(name, readUint32(fixed, 38)),
      hasDataDescriptor: (readUint16(fixed, 8) & 0x0008) !== 0,
      compression: readUint16(fixed, 10),
      crc32: readUint32(fixed, 16),
      compressedSize: readUint32(fixed, 20),
      uncompressedSize: readUint32(fixed, 24),
      localHeaderOffset: readUint32(fixed, 42),
    });
    offset += 46 + variableLength;
  }
  if (offset !== centralDirectoryEnd || entries.length !== entryCount) {
    throw new ArchiveSafetyError('Archive central directory entry count is inconsistent.');
  }
  return entries;
}

async function validateLocalHeaderFromFile(
  file: File,
  centralEntry: CentralDirectoryEntry,
): Promise<void> {
  const fixed = await readFileRange(file, centralEntry.localHeaderOffset, 30);
  if (readUint32(fixed, 0) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new ArchiveSafetyError('Archive local header is missing or invalid.');
  }
  const nameLength = readUint16(fixed, 26);
  const extraLength = readUint16(fixed, 28);
  const variable = await readFileRange(
    file,
    centralEntry.localHeaderOffset + 30,
    nameLength + extraLength,
  );
  if (UTF_8.decode(variable.subarray(0, nameLength)) !== centralEntry.name) {
    throw new ArchiveSafetyError('Archive local and central filenames do not match.');
  }
  if (readUint16(fixed, 8) !== centralEntry.compression) {
    throw new ArchiveSafetyError('Archive local and central compression methods do not match.');
  }
  const hasDataDescriptor = (readUint16(fixed, 6) & 0x0008) !== 0;
  if (hasDataDescriptor !== centralEntry.hasDataDescriptor) {
    throw new ArchiveSafetyError('Archive local and central descriptor flags do not match.');
  }
  if (!hasDataDescriptor) {
    if (readUint32(fixed, 14) !== centralEntry.crc32) {
      throw new ArchiveSafetyError('Archive local and central CRC values do not match.');
    }
    if (
      readUint32(fixed, 18) !== centralEntry.compressedSize ||
      readUint32(fixed, 22) !== centralEntry.uncompressedSize
    ) {
      throw new ArchiveSafetyError('Archive local and central size values do not match.');
    }
  }
}

export async function extractZipFile(
  file: File,
  callbacks: ExtractCallbacks,
  options: ExtractOptions = {},
): Promise<number> {
  const { limits, maxEntryBytes } = splitLimits(options);
  const budget = new ArchiveSafetyBudget({ ...DEFAULT_ARCHIVE_LIMITS, ...limits });
  const centralEntries = await readCentralDirectoryEntriesFromFile(file, budget.limits.maxEntries);
  const centralEntriesByName = new Map<string, CentralDirectoryEntry>();
  for (const entry of centralEntries) {
    await validateLocalHeaderFromFile(file, entry);
    if (centralEntriesByName.has(entry.name)) {
      throw new ArchiveSafetyError('Archive central directory contains duplicate entry names.');
    }
    centralEntriesByName.set(entry.name, entry);
    const declaredSize = toBigIntSize(entry.uncompressedSize);
    budget.checkDeclaredSize(declaredSize);
    if (declaredSize > maxEntryBytes) {
      throw new ArchiveSafetyError('Archive declares an entry larger than the per-entry limit.');
    }
  }

  let activeEntry = false;
  let totalBytes = 0;
  const unzipper = new Unzip((archiveEntry) => {
    if (activeEntry) {
      throw new ArchiveSafetyError('Archive entries overlap and cannot be processed sequentially.');
    }
    const centralEntry = centralEntriesByName.get(archiveEntry.name);
    if (centralEntry) centralEntriesByName.delete(archiveEntry.name);
    if (!centralEntry) {
      throw new ArchiveSafetyError('Archive entry is missing from the central directory.');
    }
    const path = budget.addEntry(archiveEntry.name, centralEntry.kind);
    if (centralEntry.kind === 'directory') {
      activeEntry = true;
      archiveEntry.ondata = (error, chunk, final) => {
        if (error) {
          throw new ArchiveSafetyError(
            `Archive directory failed to extract: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (chunk.byteLength > 0) {
          throw new ArchiveSafetyError('Archive directory entry contains data.');
        }
        if (final) activeEntry = false;
      };
      archiveEntry.start();
      return;
    }

    activeEntry = true;
    const chunks: Uint8Array[] = [];
    let crc = 0xffffffff;
    let size = 0;
    archiveEntry.ondata = (error, chunk, final) => {
      try {
        if (error) {
          throw new ArchiveSafetyError(
            `Archive entry failed to extract: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const nextSize = assertEntryChunkWithinLimit(size, chunk.byteLength, maxEntryBytes);
        budget.addEmittedBytes(chunk.byteLength);
        if (chunk.byteLength > 0) {
          chunks.push(chunk);
          crc = updateCrc32(crc, chunk);
        }
        size = nextSize;
        if (!final) return;
        if (size !== centralEntry.uncompressedSize) {
          throw new ArchiveSafetyError(`Archive entry size does not match its metadata: ${path}`);
        }
        if ((crc ^ 0xffffffff) >>> 0 !== centralEntry.crc32) {
          throw new ArchiveSafetyError(`Archive entry failed CRC validation: ${path}`);
        }
        totalBytes += size;
        activeEntry = false;
        const output = joinEntryChunks(chunks, size);
        callbacks.onEntry({ path, bytes: output, size });
      } catch (caughtError) {
        chunks.length = 0;
        activeEntry = false;
        abortEntry(archiveEntry, caughtError);
      }
    };
    archiveEntry.start();
  });
  unzipper.register(UnzipPassThrough);
  unzipper.register(UnzipInflate);

  try {
    for (let offset = 0; offset < file.size; offset += ARCHIVE_READ_CHUNK_BYTES) {
      const length = Math.min(ARCHIVE_READ_CHUNK_BYTES, file.size - offset);
      const chunk = await readFileRange(file, offset, length);
      unzipper.push(chunk, offset + length === file.size);
      callbacks.onProgress?.(offset + length, file.size);
    }
  } catch (error) {
    if (error instanceof ArchiveSafetyError) throw error;
    throw new ArchiveSafetyError(
      `Archive parsing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (activeEntry || centralEntriesByName.size > 0) {
    throw new ArchiveSafetyError(
      'Archive central directory has entries missing from local records.',
    );
  }
  budget.assertWithinTime();
  return totalBytes;
}
