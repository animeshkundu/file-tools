import { Inflate } from 'fflate';
import {
  ArchiveSafetyBudget,
  ArchiveSafetyError,
  DEFAULT_ARCHIVE_LIMITS,
  foldArchivePathForComparison,
  type ArchiveEntryKind,
  type ArchiveLimits,
} from '../../core/safety';
import { ARCHIVE_READ_CHUNK_BYTES, MAX_ENTRY_OUTPUT_BYTES, type ExtractedEntry } from './types';

export type ArchiveUnsupportedReason = 'encrypted' | 'zip64';

export class ArchiveUnsupportedError extends Error {
  readonly reason: ArchiveUnsupportedReason;
  constructor(reason: ArchiveUnsupportedReason, message: string) {
    super(message);
    this.name = 'ArchiveUnsupportedError';
    this.reason = reason;
  }
}

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
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

type CentralDirectoryMetadata = {
  entries: CentralDirectoryEntry[];
  centralDirectoryOffset: number;
};

type ValidatedLocalHeader = {
  dataOffset: number;
  recordEnd: number;
};

type ValidatedEntryPlan = {
  name: string;
  path: string;
  kind: ArchiveEntryKind;
  method: 0 | 8;
  dataOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
};

type InflateConsumptionState = {
  p?: Uint8Array;
  s?: { p?: number };
};

type EndOfCentralDirectoryRecord = {
  entryCount: number;
  centralDirectorySize: number;
  centralDirectoryOffset: number;
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

const ZIP64_EOCD_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_LOCATOR_SIZE = 20;

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
    if (offset + minimum + commentLength === archive.length) {
      // Check for a Zip64 end-of-central-directory locator immediately before the EOCD.
      // If present, this is a Zip64 archive that the plain extractor cannot handle.
      if (offset >= ZIP64_EOCD_LOCATOR_SIZE && readUint32(archive, offset - ZIP64_EOCD_LOCATOR_SIZE) === ZIP64_EOCD_LOCATOR_SIGNATURE) {
        throw new ArchiveUnsupportedError(
          'zip64',
          'Archive uses Zip64 extensions and cannot be extracted.',
        );
      }
      return offset;
    }
  }
  throw new ArchiveSafetyError('Archive is missing end-of-central-directory metadata.');
}

function parseEndOfCentralDirectory(
  archive: Uint8Array,
  eocdOffset: number,
): EndOfCentralDirectoryRecord {
  // EOCD disk number (+4) and central-directory-start disk (+6) must both be zero for
  // single-disk archives. Any non-zero value indicates a multi-disk ZIP, which is unsupported.
  if (readUint16(archive, eocdOffset + 4) !== 0 || readUint16(archive, eocdOffset + 6) !== 0) {
    throw new ArchiveSafetyError('Archive spans multiple disks and cannot be extracted.');
  }

  const entriesOnThisDisk = readUint16(archive, eocdOffset + 8);
  const entryCount = readUint16(archive, eocdOffset + 10);
  const centralDirectorySize = readUint32(archive, eocdOffset + 12);
  const centralDirectoryOffset = readUint32(archive, eocdOffset + 16);
  // 0xffff in either EOCD count field is the classic Zip64 sentinel and requires structures this
  // extractor deliberately rejects instead of attempting to parse partially.
  if (
    entriesOnThisDisk === 0xffff ||
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new ArchiveUnsupportedError(
      'zip64',
      'Archive uses Zip64 extensions and cannot be extracted.',
    );
  }

  return { entryCount, centralDirectorySize, centralDirectoryOffset };
}

function assertLocalHeaderSizesAreNotZip64(
  compressedSize: number,
  uncompressedSize: number,
): void {
  if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
    throw new ArchiveUnsupportedError(
      'zip64',
      'Archive uses Zip64 extensions and cannot be extracted.',
    );
  }
}

function readCentralDirectoryEntries(archive: Uint8Array): CentralDirectoryMetadata {
  const eocdOffset = findEndOfCentralDirectory(archive);
  const { entryCount, centralDirectorySize, centralDirectoryOffset } = parseEndOfCentralDirectory(
    archive,
    eocdOffset,
  );
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > eocdOffset || centralDirectoryEnd > archive.length) {
    throw new ArchiveSafetyError('Archive central directory is out of bounds.');
  }
  if (centralDirectoryEnd !== eocdOffset) {
    throw new ArchiveSafetyError(
      'Archive central directory must abut the end-of-central-directory record.',
    );
  }

  const entries: CentralDirectoryEntry[] = [];
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

    if ((flags & 0x0001) !== 0) {
      throw new ArchiveUnsupportedError(
        'encrypted',
        'Archive contains an encrypted entry and cannot be extracted.',
      );
    }

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new ArchiveUnsupportedError(
        'zip64',
        'Archive uses Zip64 extensions and cannot be extracted.',
      );
    }

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

  return { entries, centralDirectoryOffset };
}

function validateLocalHeaderMatchesCentral(
  archive: Uint8Array,
  centralEntry: CentralDirectoryEntry,
): ValidatedLocalHeader {
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

  if ((localFlags & 0x0001) !== 0) {
    throw new ArchiveUnsupportedError(
      'encrypted',
      'Archive contains an encrypted entry and cannot be extracted.',
    );
  }
  assertLocalHeaderSizesAreNotZip64(localCompressedSize, localUncompressedSize);

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

  const dataOffset = localNameEnd + localExtraLength;
  const compressedDataEnd = dataOffset + centralEntry.compressedSize;
  if (compressedDataEnd > archive.length) {
    throw new ArchiveSafetyError('Archive local record exceeds its central directory boundary.');
  }
  if (!centralEntry.hasDataDescriptor) {
    return { dataOffset, recordEnd: compressedDataEnd };
  }

  const descriptorWithoutSignatureEnd = compressedDataEnd + 12;
  if (
    descriptorWithoutSignatureEnd <= archive.length &&
    dataDescriptorMatches(
      archive.subarray(compressedDataEnd, descriptorWithoutSignatureEnd),
      centralEntry,
      false,
    )
  ) {
    return { dataOffset, recordEnd: descriptorWithoutSignatureEnd };
  }

  const descriptorWithSignatureEnd = compressedDataEnd + 16;
  if (
    descriptorWithSignatureEnd <= archive.length &&
    dataDescriptorMatches(
      archive.subarray(compressedDataEnd, descriptorWithSignatureEnd),
      centralEntry,
      true,
    )
  ) {
    return { dataOffset, recordEnd: descriptorWithSignatureEnd };
  }

  throw new ArchiveSafetyError('Archive data descriptor does not match the central directory.');
}

function dataDescriptorMatches(
  descriptor: Uint8Array,
  centralEntry: CentralDirectoryEntry,
  hasSignature: boolean,
): boolean {
  if (hasSignature) {
    return (
      descriptor.length >= 16 &&
      readUint32(descriptor, 0) === DATA_DESCRIPTOR_SIGNATURE &&
      readUint32(descriptor, 4) === centralEntry.crc32 &&
      readUint32(descriptor, 8) === centralEntry.compressedSize &&
      readUint32(descriptor, 12) === centralEntry.uncompressedSize
    );
  }

  return (
    descriptor.length >= 12 &&
    readUint32(descriptor, 0) === centralEntry.crc32 &&
    readUint32(descriptor, 4) === centralEntry.compressedSize &&
    readUint32(descriptor, 8) === centralEntry.uncompressedSize
  );
}

function assertSupportedCompressionMethod(method: number): asserts method is 0 | 8 {
  if (method !== 0 && method !== 8) {
    throw new ArchiveSafetyError('Archive entry uses an unsupported compression method.');
  }
}

function assertEntryDataRangesDoNotOverlap(plans: ValidatedEntryPlan[]): void {
  const ranges = [...plans].sort((left, right) => left.dataOffset - right.dataOffset);
  let previousEnd = 0;
  for (const plan of ranges) {
    if (plan.compressedSize > 0 && plan.dataOffset < previousEnd) {
      throw new ArchiveSafetyError('Archive entry data ranges overlap.');
    }
    previousEnd = Math.max(previousEnd, plan.dataOffset + plan.compressedSize);
  }
}

function buildValidatedEntryPlans(
  archive: Uint8Array,
  budget: ArchiveSafetyBudget,
  maxEntryBytes: bigint,
): ValidatedEntryPlan[] {
  const { entries } = readCentralDirectoryEntries(archive);
  const comparableNames = new Set<string>();
  const names = new Set<string>();
  const plans: ValidatedEntryPlan[] = [];
  for (const entry of entries) {
    if (names.has(entry.name)) {
      throw new ArchiveSafetyError('Archive central directory contains duplicate entry names.');
    }
    const comparableName = foldArchivePathForComparison(entry.name);
    if (comparableNames.has(comparableName)) {
      throw new ArchiveSafetyError('Archive central directory contains case-colliding entry names.');
    }
    names.add(entry.name);
    comparableNames.add(comparableName);
    assertSupportedCompressionMethod(entry.compression);
    const { dataOffset } = validateLocalHeaderMatchesCentral(archive, entry);
    const dataEnd = dataOffset + entry.compressedSize;
    if (!Number.isSafeInteger(dataEnd) || dataEnd > archive.length) {
      throw new ArchiveSafetyError('Archive entry data range is out of bounds.');
    }
    const declaredSize = toBigIntSize(entry.uncompressedSize);
    budget.checkDeclaredSize(declaredSize);
    if (declaredSize > maxEntryBytes) {
      throw new ArchiveSafetyError('Archive declares an entry larger than the per-entry limit.');
    }
    plans.push({
      name: entry.name,
      path: budget.addEntry(entry.name, entry.kind),
      kind: entry.kind,
      method: entry.compression,
      dataOffset,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      crc32: entry.crc32,
    });
  }
  assertEntryDataRangesDoNotOverlap(plans);
  return plans;
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

function toBigIntSize(size: number | undefined): bigint {
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
    throw new ArchiveSafetyError(
      'Archive entry declares an invalid size (must be a non-negative safe integer).',
    );
  }
  return BigInt(size);
}

function assertEntryChunkWithinLimit(
  currentSize: number,
  chunkSize: number,
  entryByteLimit: bigint,
): number {
  const nextSize = currentSize + chunkSize;
  if (!Number.isSafeInteger(nextSize) || BigInt(nextSize) > entryByteLimit) {
    throw new ArchiveSafetyError('Archive entry expanded beyond the per-entry extraction limit.');
  }
  return nextSize;
}

function computeEntryByteLimit(declaredSize: bigint, maxEntryBytes: bigint): bigint {
  return declaredSize < maxEntryBytes ? declaredSize : maxEntryBytes;
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

type EntryDecoder = {
  push: (chunk: Uint8Array, final: boolean) => void;
  finish: () => void;
};

function createEntryDecoder(
  plan: ValidatedEntryPlan,
  budget: ArchiveSafetyBudget,
  maxEntryBytes: bigint,
  chunks: Uint8Array[],
): EntryDecoder {
  const entryByteLimit = computeEntryByteLimit(BigInt(plan.uncompressedSize), maxEntryBytes);
  let crc = 0xffffffff;
  let size = 0;
  const acceptChunk = (chunk: Uint8Array): void => {
    size = assertEntryChunkWithinLimit(size, chunk.byteLength, entryByteLimit);
    budget.addEmittedBytes(chunk.byteLength);
    if (chunk.byteLength > 0) {
      chunks.push(chunk);
      crc = updateCrc32(crc, chunk);
    }
  };

  if (plan.method === 0) {
    if (plan.compressedSize !== plan.uncompressedSize) {
      throw new ArchiveSafetyError('Stored archive entry sizes do not match.');
    }
    return {
      push: acceptChunk,
      finish: () => validateDecodedEntry(plan, size, crc),
    };
  }

  const inflater = new Inflate((chunk) => {
    if (chunk?.byteLength) acceptChunk(chunk);
  });
  return {
    push: (chunk, final) => {
      try {
        inflater.push(chunk, final);
      } catch (error) {
        if (error instanceof ArchiveSafetyError) throw error;
        throw new ArchiveSafetyError(
          `Archive entry failed to extract: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    finish: () => {
      const state = inflater as unknown as InflateConsumptionState;
      // The consume-exact check reads fflate 0.8.3 internals (pinned version).
      // Fail CLOSED: if the state shape is ever unexpected (e.g. a dependency
      // bump renames these fields), reject rather than silently skip the check.
      if (
        !(state.p instanceof Uint8Array) ||
        typeof state.s?.p !== 'number' ||
        !Number.isInteger(state.s.p) ||
        state.s.p < 0 ||
        state.s.p > 7
      ) {
        throw new ArchiveSafetyError('Archive entry deflate consumption state is unavailable.');
      }
      const rbytes = state.p.length;
      const rbits = state.s.p;
      if (rbytes !== (rbits === 0 ? 0 : 1)) {
        throw new ArchiveSafetyError(
          'Archive entry deflate stream does not consume its declared compressed size.',
        );
      }
      validateDecodedEntry(plan, size, crc);
    },
  };
}

function validateDecodedEntry(plan: ValidatedEntryPlan, size: number, crc: number): void {
  if (plan.kind === 'directory' && size > 0) {
    throw new ArchiveSafetyError('Archive directory entry contains data.');
  }
  if (size !== plan.uncompressedSize) {
    throw new ArchiveSafetyError(`Archive entry size does not match its metadata: ${plan.path}`);
  }
  if (((crc ^ 0xffffffff) >>> 0) !== plan.crc32) {
    throw new ArchiveSafetyError(`Archive entry failed CRC validation: ${plan.path}`);
  }
}

function decodeMemoryEntry(
  archive: Uint8Array,
  plan: ValidatedEntryPlan,
  budget: ArchiveSafetyBudget,
  maxEntryBytes: bigint,
): ExtractedEntry | undefined {
  const chunks: Uint8Array[] = [];
  try {
    const decoder = createEntryDecoder(plan, budget, maxEntryBytes, chunks);
    const slice = archive.subarray(plan.dataOffset, plan.dataOffset + plan.compressedSize);
    decoder.push(slice, true);
    decoder.finish();
    if (plan.kind === 'directory') return undefined;
    const bytes = joinEntryChunks(chunks, plan.uncompressedSize);
    return { path: plan.path, bytes, size: plan.uncompressedSize };
  } catch (error) {
    chunks.length = 0;
    throw error;
  }
}

export function extractZip(archive: Uint8Array, options: ExtractOptions = {}): ExtractedEntry[] {
  const { limits, maxEntryBytes } = splitLimits(options);
  const budget = new ArchiveSafetyBudget({ ...DEFAULT_ARCHIVE_LIMITS, ...limits });
  const plans = buildValidatedEntryPlans(archive, budget, maxEntryBytes);
  const entries: ExtractedEntry[] = [];
  for (const plan of plans) {
    const entry = decodeMemoryEntry(archive, plan, budget, maxEntryBytes);
    if (entry) entries.push(entry);
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
): Promise<CentralDirectoryMetadata> {
  const tailLength = Math.min(file.size, 22 + 0xffff);
  const tailOffset = file.size - tailLength;
  const tail = await readFileRange(file, tailOffset, tailLength);
  const relativeEocdOffset = findEndOfCentralDirectory(tail);
  const eocdOffset = tailOffset + relativeEocdOffset;
  if (eocdOffset >= ZIP64_EOCD_LOCATOR_SIZE) {
    const locatorStart = eocdOffset - ZIP64_EOCD_LOCATOR_SIZE;
    const locatorIsAlreadyInTail = relativeEocdOffset >= ZIP64_EOCD_LOCATOR_SIZE;
    const locator = locatorIsAlreadyInTail
      ? tail.subarray(relativeEocdOffset - ZIP64_EOCD_LOCATOR_SIZE, relativeEocdOffset)
      : await readFileRange(file, locatorStart, ZIP64_EOCD_LOCATOR_SIZE);
    if (readUint32(locator, 0) === ZIP64_EOCD_LOCATOR_SIGNATURE) {
      throw new ArchiveUnsupportedError(
        'zip64',
        'Archive uses Zip64 extensions and cannot be extracted.',
      );
    }
  }
  const { entryCount, centralDirectorySize, centralDirectoryOffset } = parseEndOfCentralDirectory(
    tail,
    relativeEocdOffset,
  );
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > eocdOffset || centralDirectoryEnd > file.size) {
    throw new ArchiveSafetyError('Archive central directory is out of bounds.');
  }
  if (centralDirectoryEnd !== eocdOffset) {
    throw new ArchiveSafetyError(
      'Archive central directory must abut the end-of-central-directory record.',
    );
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
    const entryFlags = readUint16(fixed, 8);
    if ((entryFlags & 0x0001) !== 0) {
      throw new ArchiveUnsupportedError(
        'encrypted',
        'Archive contains an encrypted entry and cannot be extracted.',
      );
    }
    const entryCompressedSize = readUint32(fixed, 20);
    const entryUncompressedSize = readUint32(fixed, 24);
    const entryLocalHeaderOffset = readUint32(fixed, 42);
    if (
      entryCompressedSize === 0xffffffff ||
      entryUncompressedSize === 0xffffffff ||
      entryLocalHeaderOffset === 0xffffffff
    ) {
      throw new ArchiveUnsupportedError(
        'zip64',
        'Archive uses Zip64 extensions and cannot be extracted.',
      );
    }
    if (entries.length >= maxEntries) {
      throw new ArchiveSafetyError('Archive contains too many entries.');
    }
    entries.push({
      name,
      kind: classifyEntryKind(name, readUint32(fixed, 38)),
      hasDataDescriptor: (entryFlags & 0x0008) !== 0,
      compression: readUint16(fixed, 10),
      crc32: readUint32(fixed, 16),
      compressedSize: entryCompressedSize,
      uncompressedSize: entryUncompressedSize,
      localHeaderOffset: entryLocalHeaderOffset,
    });
    offset += 46 + variableLength;
  }
  if (offset !== centralDirectoryEnd || entries.length !== entryCount) {
    throw new ArchiveSafetyError('Archive central directory entry count is inconsistent.');
  }
  return { entries, centralDirectoryOffset };
}

async function validateLocalHeaderFromFile(
  file: File,
  centralEntry: CentralDirectoryEntry,
): Promise<ValidatedLocalHeader> {
  const fixed = await readFileRange(file, centralEntry.localHeaderOffset, 30);
  if (readUint32(fixed, 0) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new ArchiveSafetyError('Archive local header is missing or invalid.');
  }
  const localFlags = readUint16(fixed, 6);
  if ((localFlags & 0x0001) !== 0) {
    throw new ArchiveUnsupportedError(
      'encrypted',
      'Archive contains an encrypted entry and cannot be extracted.',
    );
  }
  const localCompressedSize = readUint32(fixed, 18);
  const localUncompressedSize = readUint32(fixed, 22);
  assertLocalHeaderSizesAreNotZip64(localCompressedSize, localUncompressedSize);
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
  const hasDataDescriptor = (localFlags & 0x0008) !== 0;
  if (hasDataDescriptor !== centralEntry.hasDataDescriptor) {
    throw new ArchiveSafetyError('Archive local and central descriptor flags do not match.');
  }
  if (!hasDataDescriptor) {
    if (readUint32(fixed, 14) !== centralEntry.crc32) {
      throw new ArchiveSafetyError('Archive local and central CRC values do not match.');
    }
    if (
      localCompressedSize !== centralEntry.compressedSize ||
      localUncompressedSize !== centralEntry.uncompressedSize
    ) {
      throw new ArchiveSafetyError('Archive local and central size values do not match.');
    }
  }

  const dataOffset = centralEntry.localHeaderOffset + 30 + nameLength + extraLength;
  const compressedDataEnd = dataOffset + centralEntry.compressedSize;
  if (compressedDataEnd > file.size) {
    throw new ArchiveSafetyError('Archive local record exceeds its central directory boundary.');
  }
  if (!hasDataDescriptor) {
    return { dataOffset, recordEnd: compressedDataEnd };
  }

  if (
    compressedDataEnd + 12 <= file.size &&
    dataDescriptorMatches(await readFileRange(file, compressedDataEnd, 12), centralEntry, false)
  ) {
    return { dataOffset, recordEnd: compressedDataEnd + 12 };
  }

  if (
    compressedDataEnd + 16 <= file.size &&
    dataDescriptorMatches(await readFileRange(file, compressedDataEnd, 16), centralEntry, true)
  ) {
    return { dataOffset, recordEnd: compressedDataEnd + 16 };
  }

  throw new ArchiveSafetyError('Archive data descriptor does not match the central directory.');
}

async function buildValidatedEntryPlansFromFile(
  file: File,
  budget: ArchiveSafetyBudget,
  maxEntryBytes: bigint,
): Promise<ValidatedEntryPlan[]> {
  const { entries } = await readCentralDirectoryEntriesFromFile(file, budget.limits.maxEntries);
  const comparableNames = new Set<string>();
  const names = new Set<string>();
  const plans: ValidatedEntryPlan[] = [];
  for (const entry of entries) {
    if (names.has(entry.name)) {
      throw new ArchiveSafetyError('Archive central directory contains duplicate entry names.');
    }
    const comparableName = foldArchivePathForComparison(entry.name);
    if (comparableNames.has(comparableName)) {
      throw new ArchiveSafetyError('Archive central directory contains case-colliding entry names.');
    }
    names.add(entry.name);
    comparableNames.add(comparableName);
    assertSupportedCompressionMethod(entry.compression);
    const { dataOffset } = await validateLocalHeaderFromFile(file, entry);
    const dataEnd = dataOffset + entry.compressedSize;
    if (!Number.isSafeInteger(dataEnd) || dataEnd > file.size) {
      throw new ArchiveSafetyError('Archive entry data range is out of bounds.');
    }
    const declaredSize = toBigIntSize(entry.uncompressedSize);
    budget.checkDeclaredSize(declaredSize);
    if (declaredSize > maxEntryBytes) {
      throw new ArchiveSafetyError('Archive declares an entry larger than the per-entry limit.');
    }
    plans.push({
      name: entry.name,
      path: budget.addEntry(entry.name, entry.kind),
      kind: entry.kind,
      method: entry.compression,
      dataOffset,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      crc32: entry.crc32,
    });
  }
  assertEntryDataRangesDoNotOverlap(plans);
  return plans;
}

async function decodeFileEntry(
  file: File,
  plan: ValidatedEntryPlan,
  budget: ArchiveSafetyBudget,
  maxEntryBytes: bigint,
): Promise<ExtractedEntry | undefined> {
  const chunks: Uint8Array[] = [];
  try {
    const decoder = createEntryDecoder(plan, budget, maxEntryBytes, chunks);
    if (plan.compressedSize === 0) {
      decoder.push(new Uint8Array(0), true);
    } else {
      const end = plan.dataOffset + plan.compressedSize;
      for (let offset = plan.dataOffset; offset < end; offset += ARCHIVE_READ_CHUNK_BYTES) {
        const length = Math.min(ARCHIVE_READ_CHUNK_BYTES, end - offset);
        decoder.push(await readFileRange(file, offset, length), offset + length === end);
      }
    }
    decoder.finish();
    if (plan.kind === 'directory') return undefined;
    const bytes = joinEntryChunks(chunks, plan.uncompressedSize);
    return { path: plan.path, bytes, size: plan.uncompressedSize };
  } catch (error) {
    chunks.length = 0;
    throw error;
  }
}

export async function extractZipFile(
  file: File,
  callbacks: ExtractCallbacks,
  options: ExtractOptions = {},
): Promise<number> {
  const { limits, maxEntryBytes } = splitLimits(options);
  const budget = new ArchiveSafetyBudget({ ...DEFAULT_ARCHIVE_LIMITS, ...limits });
  const plans = await buildValidatedEntryPlansFromFile(file, budget, maxEntryBytes);
  let totalBytes = 0;
  for (const plan of plans) {
    const entry = await decodeFileEntry(file, plan, budget, maxEntryBytes);
    if (entry) {
      totalBytes += entry.size;
      callbacks.onEntry(entry);
    }
    callbacks.onProgress?.(plan.dataOffset + plan.compressedSize, file.size);
  }
  callbacks.onProgress?.(file.size, file.size);
  budget.assertWithinTime();
  return totalBytes;
}
