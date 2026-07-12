import { strFromU8, strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runUnzipWorker } from '../lib/core/worker';
import { extractZip, extractZipFile } from '../lib/tools/unzip/extract';
import {
  ARCHIVE_READ_CHUNK_BYTES,
  assertArchiveInputSize,
  MAX_ARCHIVE_INPUT_BYTES,
  type UnzipWorkerRequest,
  type UnzipWorkerResponse,
} from '../lib/tools/unzip/types';

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

  it('enforces the per-entry cap before retaining an oversized entry', () => {
    const archive = zipSync({ 'large.txt': strToU8('12345') });
    expect(() => extractZip(archive, { maxEntryBytes: 4n })).toThrow(/per-entry/u);
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
});

describe('archive input boundary', () => {
  it('rejects an oversized file before worker startup', () => {
    expect(() => assertArchiveInputSize({ size: MAX_ARCHIVE_INPUT_BYTES + 1 })).toThrow(/256 MB/u);

    vi.stubGlobal('Worker', FakeWorker);
    const oversized = { size: MAX_ARCHIVE_INPUT_BYTES + 1 } as File;
    expect(() => runUnzipWorker(oversized)).toThrow(/256 MB/u);
    expect(FakeWorker.instances).toHaveLength(0);
    vi.unstubAllGlobals();
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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeWorker.instances = [];
  });

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
