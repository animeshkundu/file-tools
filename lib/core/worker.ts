import {
  assertArchiveInputSize,
  type ExtractedEntry,
  type UnzipWorkerRequest,
  type UnzipWorkerResponse,
} from '../tools/unzip/types';

export class CancelledError extends Error {
  constructor() {
    super('Extraction cancelled.');
    this.name = 'CancelledError';
  }
}

export type WorkerController = {
  cancel: () => void;
  promise: Promise<{ type: 'complete'; totalBytes: number }>;
};

type WorkerCallbacks = {
  onEntry?: (entry: ExtractedEntry) => void;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
};

export function runUnzipWorker(
  file: File,
  callbacks: WorkerCallbacks = {},
  timeoutMs = 30_000,
): WorkerController {
  assertArchiveInputSize(file);
  const worker = new Worker(new URL('../tools/unzip/unzip.worker.ts', import.meta.url), {
    type: 'module',
  });
  let settled = false;
  let rejectPromise: (reason: Error) => void = () => undefined;
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const cleanup = () => {
    globalThis.clearTimeout(timeoutHandle);
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  };

  const promise = new Promise<{ type: 'complete'; totalBytes: number }>((resolve, reject) => {
    rejectPromise = reject;
    timeoutHandle = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Extraction timed out.'));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<UnzipWorkerResponse>) => {
      if (settled) return;
      if (event.data.type === 'progress') {
        callbacks.onProgress?.(event.data.loadedBytes, event.data.totalBytes);
        return;
      }
      if (event.data.type === 'entry') {
        callbacks.onEntry?.(event.data.entry);
        return;
      }
      settled = true;
      cleanup();
      if (event.data.type === 'error') reject(new Error(event.data.message));
      else resolve(event.data);
    };
    worker.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('The extraction worker failed.'));
    };
  });

  const request: UnzipWorkerRequest = { type: 'extract', file };
  try {
    worker.postMessage(request);
  } catch {
    settled = true;
    cleanup();
    rejectPromise(new Error('Could not send the selected file to the extraction worker.'));
  }

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(new CancelledError());
    },
  };
}
