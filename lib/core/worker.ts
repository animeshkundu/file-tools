import type { UnzipWorkerRequest, UnzipWorkerResponse } from '../tools/unzip/types';

export type WorkerController = {
  cancel: () => void;
  promise: Promise<UnzipWorkerResponse>;
};

export function runUnzipWorker(file: File, timeoutMs = 30_000): WorkerController {
  const worker = new Worker(new URL('../tools/unzip/unzip.worker.ts', import.meta.url), {
    type: 'module',
  });
  let settled = false;
  let rejectPromise: (reason: Error) => void = () => undefined;

  const promise = new Promise<UnzipWorkerResponse>((resolve, reject) => {
    rejectPromise = reject;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error('Extraction timed out.'));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<UnzipWorkerResponse>) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      if (event.data.type === 'error') reject(new Error(event.data.message));
      else resolve(event.data);
    };
    worker.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error('The extraction worker failed.'));
    };
  });

  void file.arrayBuffer().then(
    (buffer) => {
      if (settled) return;
      const request: UnzipWorkerRequest = { type: 'extract', archive: buffer };
      worker.postMessage(request, [buffer]);
    },
    () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectPromise(new Error('Could not read the selected file.'));
    },
  );

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectPromise(new Error('Extraction cancelled.'));
    },
  };
}
