import { extractZipFile } from './extract';
import type { UnzipWorkerRequest, UnzipWorkerResponse } from './types';

self.onmessage = async (event: MessageEvent<UnzipWorkerRequest>) => {
  if (event.data.type !== 'extract') return;

  try {
    const totalBytes = await extractZipFile(event.data.file, {
      onProgress: (loadedBytes, archiveBytes) => {
        const response: UnzipWorkerResponse = {
          type: 'progress',
          loadedBytes,
          totalBytes: archiveBytes,
        };
        self.postMessage(response);
      },
      onEntry: (entry) => {
        const response: UnzipWorkerResponse = { type: 'entry', entry };
        self.postMessage(response, { transfer: [entry.bytes.buffer] });
      },
    });
    const response: UnzipWorkerResponse = { type: 'complete', totalBytes };
    self.postMessage(response);
  } catch (error) {
    const response: UnzipWorkerResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Could not extract this archive.',
    };
    self.postMessage(response);
  }
};
