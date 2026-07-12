import { extractZip } from './extract';
import type { UnzipWorkerRequest, UnzipWorkerResponse } from './types';

self.onmessage = (event: MessageEvent<UnzipWorkerRequest>) => {
  if (event.data.type !== 'extract') return;

  try {
    const entries = extractZip(new Uint8Array(event.data.archive));
    const totalBytes = entries.reduce((total, entry) => total + entry.size, 0);
    const response: UnzipWorkerResponse = { type: 'complete', entries, totalBytes };
    const buffers = entries.map((entry) => entry.bytes.buffer);
    self.postMessage(response, { transfer: buffers });
  } catch (error) {
    const response: UnzipWorkerResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Could not extract this archive.',
    };
    self.postMessage(response);
  }
};
