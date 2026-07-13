import { UnzipInflate, strFromU8, strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArchiveSafetyError } from '../lib/core/safety';
import { CancelledError, runUnzipWorker } from '../lib/core/worker';
import { ArchiveUnsupportedError, extractZip, extractZipFile } from '../lib/tools/unzip/extract';
import { formatWorkerError } from '../lib/tools/unzip/formatWorkerError';
import {
  ARCHIVE_READ_CHUNK_BYTES,
  assertArchiveInputSize,
  MAX_ARCHIVE_INPUT_BYTES,
  type UnzipWorkerRequest,
  type UnzipWorkerResponse,
} from '../lib/tools/unzip/types';

const ROGUE_DECLARED_SIZE = 0x20000000;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function findSignature(bytes: Uint8Array, signature: number): number {
  for (let offset = 0; offset <= bytes.length - 4; offset += 1) {
    if (readUint32(bytes, offset) === signature) return offset;
  }
  throw new Error('ZIP structure is missing an expected signature.');
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

function makeRogueLocalRecordArchive(): Uint8Array {
  const valid = zipSync({ 'a.txt': strToU8('a') });
  const central = findSignature(valid, 0x02014b50);
  const eocd = findSignature(valid, 0x06054b50);
  const name = strToU8('a.txt');
  const payload = strToU8('x');
  const rogue = new Uint8Array(30 + name.byteLength + payload.byteLength);
  writeUint32(rogue, 0, 0x04034b50);
  writeUint16(rogue, 4, 20);
  writeUint16(rogue, 8, 0);
  writeUint32(rogue, 14, crc32(payload));
  writeUint32(rogue, 18, payload.byteLength);
  writeUint32(rogue, 22, ROGUE_DECLARED_SIZE);
  writeUint16(rogue, 26, name.byteLength);
  rogue.set(name, 30);
  rogue.set(payload, 30 + name.byteLength);

  const archive = new Uint8Array(rogue.byteLength + valid.byteLength);
  archive.set(rogue);
  archive.set(valid, rogue.byteLength);
  writeUint32(
    archive,
    rogue.byteLength + central + 42,
    rogue.byteLength + readUint32(valid, central + 42),
  );
  writeUint32(
    archive,
    rogue.byteLength + eocd + 16,
    rogue.byteLength + readUint32(valid, eocd + 16),
  );
  return archive;
}

function makeZipSlipArchive(): Uint8Array {
  const archive = zipSync({ 'aa/evil.txt': strToU8('x') });
  const replacement = strToU8('../evil.txt');
  const local = findSignature(archive, 0x04034b50);
  const central = findSignature(archive, 0x02014b50);
  archive.set(replacement, local + 30);
  archive.set(replacement, central + 46);
  return archive;
}

function makeForgedHostSymlinkArchive(): Uint8Array {
  const archive = zipSync({ 'link.txt': strToU8('target') });
  const central = findSignature(archive, 0x02014b50);
  archive[central + 5] = 0;
  writeUint32(archive, central + 38, (0o120777 << 16) >>> 0);
  return archive;
}

function makeCrcCorruptArchive(): Uint8Array {
  const archive = zipSync({ 'a.txt': strToU8('a') }, { level: 0 });
  const local = findSignature(archive, 0x04034b50);
  const payloadOffset =
    local + 30 + readUint16(archive, local + 26) + readUint16(archive, local + 28);
  archive[payloadOffset] ^= 0xff;
  return archive;
}

function makeEncryptedArchive(): Uint8Array {
  const archive = zipSync({ 'secret.txt': strToU8('shh') });
  const local = findSignature(archive, 0x04034b50);
  const central = findSignature(archive, 0x02014b50);
  // Set bit 0 (encryption flag) in local and central general-purpose bit flags.
  writeUint16(archive, local + 6, readUint16(archive, local + 6) | 0x0001);
  writeUint16(archive, central + 8, readUint16(archive, central + 8) | 0x0001);
  return archive;
}

function makeZip64SentinelArchive(): Uint8Array {
  const archive = zipSync({ 'big.txt': strToU8('data') });
  const eocd = findSignature(archive, 0x06054b50);
  // Set EOCD entry count, CD size, and CD offset fields to the Zip64 sentinel values.
  writeUint16(archive, eocd + 10, 0xffff);
  writeUint32(archive, eocd + 12, 0xffffffff);
  writeUint32(archive, eocd + 16, 0xffffffff);
  return archive;
}

function fileFromBytes(bytes: Uint8Array, name: string): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], name);
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

  it('rejects case-insensitive central-directory path collisions but accepts distinct names', async () => {
    const collidingArchive = zipSync({
      'README.txt': strToU8('upper'),
      'readme.txt': strToU8('lower'),
    });

    expect(() => extractZip(collidingArchive)).toThrow(/case-colliding entry names/u);
    await expect(
      extractZipFile(fileFromBytes(collidingArchive, 'collision.zip'), { onEntry: vi.fn() }),
    ).rejects.toThrow(/case-colliding entry names/u);

    const distinctArchive = zipSync({
      'README.txt': strToU8('readme'),
      'README.md': strToU8('markdown'),
    });

    expect(extractZip(distinctArchive).map((entry) => entry.path)).toEqual([
      'README.txt',
      'README.md',
    ]);
  });

  it('rejects NTFS case-fold central-directory collisions', async () => {
    const archive = zipSync({
      'µ.txt': strToU8('micro sign'),
      'μ.txt': strToU8('greek mu'),
    });

    expect(() => extractZip(archive)).toThrow(/case-colliding entry names/u);
    await expect(
      extractZipFile(fileFromBytes(archive, 'collision.zip'), { onEntry: vi.fn() }),
    ).rejects.toThrow(/case-colliding entry names/u);
  });

  it('enforces the emitted byte cap while extracting', () => {
    const archive = zipSync({ 'large.txt': strToU8('12345') });
    expect(() => extractZip(archive, { maxEmittedBytes: 4n })).toThrow(/extraction limit/u);
  });

  it('terminates decompression when an emitted-byte guard trips mid-stream', () => {
    const archive = zipSync({ 'large.txt': strToU8('12345') });
    let returnedAfterFirstChunk = false;
    vi.spyOn(UnzipInflate.prototype, 'push').mockImplementation(function (
      this: UnzipInflate,
      _data,
      final,
    ) {
      this.ondata(null, Uint8Array.of(1, 2, 3, 4, 5), false);
      returnedAfterFirstChunk = true;
      this.ondata(null, Uint8Array.of(6), final);
    });

    expect(() => extractZip(archive, { maxEmittedBytes: 4n })).toThrow(/extraction limit/u);
    expect(returnedAfterFirstChunk).toBe(false);
  });

  it('enforces the per-entry cap before retaining an oversized entry', () => {
    const archive = zipSync({ 'large.txt': strToU8('12345') });
    expect(() => extractZip(archive, { maxEntryBytes: 4n })).toThrow(/per-entry/u);
  });

  it('caps per-entry emission at the declared size before full inflation', async () => {
    const archive = patchDeclaredUncompressedSizes(
      zipSync({ 'large.txt': strToU8('abcdefghijklmnop') }),
      10,
    );

    const createInflateSpyWithChunkTracking = (chunksProcessed: number[]) =>
      vi.spyOn(UnzipInflate.prototype, 'push').mockImplementation(function (
        this: UnzipInflate,
        _data,
        final,
      ) {
        this.ondata(null, Uint8Array.of(1, 2, 3, 4, 5, 6), false);
        chunksProcessed.push(1);
        this.ondata(null, Uint8Array.of(7, 8, 9, 10, 11, 12), final);
        chunksProcessed.push(2);
      });

    const extractZipChunksProcessed: number[] = [];
    createInflateSpyWithChunkTracking(extractZipChunksProcessed);
    expect(() => extractZip(archive)).toThrow(/per-entry/u);
    expect(extractZipChunksProcessed).toEqual([1]);

    vi.restoreAllMocks();

    const extractZipFileChunksProcessed: number[] = [];
    createInflateSpyWithChunkTracking(extractZipFileChunksProcessed);
    await expect(
      extractZipFile(fileFromBytes(archive, 'declared-size-cap.zip'), { onEntry: vi.fn() }),
    ).rejects.toThrow(/per-entry/u);
    expect(extractZipFileChunksProcessed).toEqual([1]);
  });

  it('streams directory records without accepting hidden payload data', () => {
    const valid = zipSync({ 'folder/': new Uint8Array() });
    expect(extractZip(valid)).toEqual([]);

    const payload = zipSync({ 'folder/': strToU8('hidden') });
    expect(() => extractZip(payload)).toThrow(/directory entry contains data/u);
  });

  it('enforces the aggregate cap across individually valid entries', () => {
    const archive = zipSync({ 'a.txt': strToU8('123'), 'b.txt': strToU8('456') });
    expect(() => extractZip(archive, { maxEntryBytes: 3n, maxEmittedBytes: 5n })).toThrow(
      /declared sizes exceed|expanded beyond/u,
    );
  });

  it('enforces cumulative declared-size limits before inflating data', () => {
    const archive = zipSync({ 'a.txt': strToU8('a'), 'b.txt': strToU8('b') });
    const patched = patchDeclaredUncompressedSizes(archive, 6);
    expect(() => extractZip(patched, { maxEmittedBytes: 10n })).toThrow(/declared sizes exceed/u);
  });

  it('streams bounded file slices and emits completed entries sequentially', async () => {
    const archive = zipSync({
      'a.txt': strToU8('a'),
      'b.txt': strToU8('b'),
      'padding.bin': new Uint8Array(ARCHIVE_READ_CHUNK_BYTES + 1),
    });
    const file = new File([archive], 'streamed.zip');
    const slice = vi.spyOn(file, 'slice');
    const paths: string[] = [];
    const progress: number[] = [];

    await extractZipFile(
      file,
      {
        onEntry: (entry) => paths.push(entry.path),
        onProgress: (loaded) => progress.push(loaded),
      },
      { maxEntryBytes: BigInt(ARCHIVE_READ_CHUNK_BYTES + 1) },
    );

    expect(paths).toEqual(['a.txt', 'b.txt', 'padding.bin']);
    expect(progress.at(-1)).toBe(file.size);
    expect(
      slice.mock.calls.every(
        ([start = 0, end = file.size]) => Number(end) - Number(start) <= ARCHIVE_READ_CHUNK_BYTES,
      ),
    ).toBe(true);
  });

  it('rejects a rogue local record without allocating its declared size', async () => {
    const archive = makeRogueLocalRecordArchive();
    const NativeUint8Array = Uint8Array;
    let attemptedOversizedAllocation = false;
    vi.stubGlobal(
      'Uint8Array',
      new Proxy(NativeUint8Array, {
        construct(target, argumentsList, newTarget) {
          if (argumentsList[0] === ROGUE_DECLARED_SIZE) {
            attemptedOversizedAllocation = true;
            throw new Error('Oversized allocation attempted.');
          }
          return Reflect.construct(target, argumentsList, newTarget);
        },
      }),
    );
    const onEntry = vi.fn();

    expect(() => extractZip(archive, { maxEntryBytes: 1n })).toThrow(ArchiveSafetyError);
    await expect(
      extractZipFile(fileFromBytes(archive, 'rogue.zip'), { onEntry }, { maxEntryBytes: 1n }),
    ).rejects.toBeInstanceOf(ArchiveSafetyError);
    expect(attemptedOversizedAllocation).toBe(false);
    expect(onEntry).not.toHaveBeenCalled();
  });

  it.each([
    ['ZIP-Slip path', makeZipSlipArchive],
    ['forged-host symlink', makeForgedHostSymlinkArchive],
    ['truncated structure', () => zipSync({ 'a.txt': strToU8('a') }).slice(0, -1)],
    ['CRC corruption', makeCrcCorruptArchive],
  ])('rejects raw %s through file extraction', async (_name, makeArchive) => {
    const onEntry = vi.fn();
    const archive = makeArchive();
    await expect(
      extractZipFile(fileFromBytes(archive, 'malicious.zip'), { onEntry }),
    ).rejects.toBeInstanceOf(ArchiveSafetyError);
    expect(onEntry).not.toHaveBeenCalled();
  });
});

describe('encrypted archive detection', () => {
  it('rejects a central-directory-encrypted archive before inflation', () => {
    const archive = makeEncryptedArchive();
    expect(() => extractZip(archive)).toThrow(ArchiveUnsupportedError);
    expect(() => extractZip(archive)).toThrow(/encrypted/iu);
  });

  it('rejects an encrypted archive through file extraction', async () => {
    const archive = makeEncryptedArchive();
    const file = fileFromBytes(archive, 'encrypted.zip');
    await expect(extractZipFile(file, { onEntry: vi.fn() })).rejects.toBeInstanceOf(
      ArchiveUnsupportedError,
    );
    await expect(extractZipFile(file, { onEntry: vi.fn() })).rejects.toMatchObject({
      reason: 'encrypted',
    });
  });

  it('encrypted error maps to the friendly password-protected message', () => {
    const archive = makeEncryptedArchive();
    let caught: unknown;
    try {
      extractZip(archive);
    } catch (error) {
      caught = error;
    }
    expect(formatWorkerError(caught)).toBe("This ZIP is password-protected, which isn't supported yet.");
  });
});

describe('Zip64 archive detection', () => {
  it('rejects a Zip64-sentinel EOCD archive before inflation', () => {
    const archive = makeZip64SentinelArchive();
    expect(() => extractZip(archive)).toThrow(ArchiveUnsupportedError);
    expect(() => extractZip(archive)).toThrow(/zip64|too large/iu);
  });

  it('rejects a Zip64-sentinel archive through file extraction', async () => {
    const archive = makeZip64SentinelArchive();
    const file = fileFromBytes(archive, 'big.zip');
    await expect(extractZipFile(file, { onEntry: vi.fn() })).rejects.toBeInstanceOf(
      ArchiveUnsupportedError,
    );
    await expect(extractZipFile(file, { onEntry: vi.fn() })).rejects.toMatchObject({
      reason: 'zip64',
    });
  });

  it('Zip64 error maps to the friendly too-large message', () => {
    const archive = makeZip64SentinelArchive();
    let caught: unknown;
    try {
      extractZip(archive);
    } catch (error) {
      caught = error;
    }
    expect(formatWorkerError(caught)).toBe('This ZIP is too large (over 4 GB) for the current extractor.');
  });
});

describe('extractZip invalid-size guard', () => {
  it('rejects invalid sizes before bigint conversion', () => {
    const archive = zipSync({ 'a.txt': strToU8('a') });
    const originalValues = Map.prototype.values;
    vi.spyOn(Map.prototype, 'values').mockImplementation(function (this: Map<string, unknown>) {
      if (this.size === 1 && this.has('a.txt')) {
        return [
          {
            name: 'a.txt',
            kind: 'file',
            hasDataDescriptor: false,
            compression: 0,
            crc32: 3904355907,
            compressedSize: 1,
            uncompressedSize: Number.NaN,
            localHeaderOffset: 0,
          },
        ][Symbol.iterator]();
      }
      return originalValues.call(this);
    });

    expect(() => extractZip(archive)).toThrow(/invalid size/u);
  });
});

describe('archive input boundary', () => {
  it('rejects an oversized file before worker startup', () => {
    expect(() => assertArchiveInputSize({ size: MAX_ARCHIVE_INPUT_BYTES + 1 })).toThrow(/256 MB/u);

    vi.stubGlobal('Worker', FakeWorker);
    const oversized = { size: MAX_ARCHIVE_INPUT_BYTES + 1 } as File;
    expect(() => runUnzipWorker(oversized)).toThrow(/256 MB/u);
    expect(FakeWorker.instances).toHaveLength(0);
  });
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<UnzipWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: UnzipWorkerRequest[] = [];
  terminated = 0;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: UnzipWorkerRequest) {
    this.requests.push(request);
  }

  terminate() {
    this.terminated += 1;
  }

  emit(response: UnzipWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<UnzipWorkerResponse>);
  }
}

describe('runUnzipWorker', () => {
  it('passes the File directly, reports progress and entries, then cleans up', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const clearTimeout = vi.spyOn(globalThis, 'clearTimeout');
    const file = new File([zipSync({ 'a.txt': strToU8('a') })], 'a.zip');
    const onProgress = vi.fn();
    const onEntry = vi.fn();
    const controller = runUnzipWorker(file, { onProgress, onEntry });
    const worker = FakeWorker.instances[0]!;

    expect(worker.requests).toEqual([{ type: 'extract', file }]);
    worker.emit({ type: 'progress', loadedBytes: 2, totalBytes: 4 });
    worker.emit({
      type: 'entry',
      entry: { path: 'a.txt', bytes: strToU8('a'), size: 1 },
    });
    expect(onProgress).toHaveBeenCalledWith(2, 4);
    expect(onEntry).toHaveBeenCalledOnce();

    worker.emit({ type: 'complete', totalBytes: 1 });
    await expect(controller.promise).resolves.toEqual({ type: 'complete', totalBytes: 1 });
    expect(worker.terminated).toBe(1);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
    expect(clearTimeout).toHaveBeenCalled();
  });

  it('terminates once and ignores late messages after cancellation', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const onEntry = vi.fn();
    const controller = runUnzipWorker(new File([], 'a.zip'), { onEntry });
    const worker = FakeWorker.instances[0]!;
    const lateHandler = worker.onmessage;

    controller.cancel();
    controller.cancel();
    lateHandler?.({
      data: { type: 'entry', entry: { path: 'late', bytes: new Uint8Array(1), size: 1 } },
    } as MessageEvent<UnzipWorkerResponse>);

    await expect(controller.promise).rejects.toThrow(/cancelled/u);
    expect(worker.terminated).toBe(1);
    expect(onEntry).not.toHaveBeenCalled();
  });

  it('rejects with a CancelledError instance so callers can distinguish cancel from error', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = runUnzipWorker(new File([], 'a.zip'));

    controller.cancel();

    await expect(controller.promise).rejects.toBeInstanceOf(CancelledError);
  });

  it('cleans up after a worker-reported extraction error', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = runUnzipWorker(new File([], 'a.zip'));
    const worker = FakeWorker.instances[0]!;

    worker.emit({ type: 'error', message: 'Unsafe archive.' });

    await expect(controller.promise).rejects.toThrow('Unsafe archive.');
    expect(worker.terminated).toBe(1);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
  });

  it('terminates and clears handlers when extraction times out', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    const controller = runUnzipWorker(new File([], 'a.zip'), {}, 10);
    const worker = FakeWorker.instances[0]!;
    const rejection = expect(controller.promise).rejects.toThrow(/timed out/u);

    await vi.advanceTimersByTimeAsync(11);

    await rejection;
    expect(worker.terminated).toBe(1);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
  });
});

describe('formatWorkerError', () => {
  it('maps ArchiveSafetyError to generic user copy without exposing internal message', () => {
    const internal = new ArchiveSafetyError('Archive entry tries to leave the extraction folder.');
    expect(formatWorkerError(internal)).toBe("This archive can't be opened safely.");
  });

  it('maps every ArchiveSafetyError variant to the same generic message', () => {
    const variants = [
      new ArchiveSafetyError('Archive structure is truncated.'),
      new ArchiveSafetyError('Archive expanded beyond the extraction limit.'),
      new ArchiveSafetyError('Archive contains too many entries.'),
    ];
    for (const err of variants) {
      expect(formatWorkerError(err)).toBe("This archive can't be opened safely.");
    }
  });

  it('passes through plain Error messages unchanged', () => {
    expect(formatWorkerError(new Error('Extraction timed out.'))).toBe('Extraction timed out.');
  });

  it('maps ArchiveUnsupportedError encrypted to password-protected message', () => {
    const err = new ArchiveUnsupportedError('encrypted', 'internal detail');
    expect(formatWorkerError(err)).toBe("This ZIP is password-protected, which isn't supported yet.");
  });

  it('maps ArchiveUnsupportedError zip64 to too-large message', () => {
    const err = new ArchiveUnsupportedError('zip64', 'internal detail');
    expect(formatWorkerError(err)).toBe('This ZIP is too large (over 4 GB) for the current extractor.');
  });

  it('does not expose internal ArchiveUnsupportedError messages', () => {
    const err = new ArchiveUnsupportedError('encrypted', 'sensitive internal parse detail');
    expect(formatWorkerError(err)).not.toContain('sensitive');
  });

  it('uses the fallback for non-Error values', () => {
    expect(formatWorkerError('string error')).toBe('Could not extract this archive.');
    expect(formatWorkerError(null)).toBe('Could not extract this archive.');
    expect(formatWorkerError(42)).toBe('Could not extract this archive.');
  });
});
