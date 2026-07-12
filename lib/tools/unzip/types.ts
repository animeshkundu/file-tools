export type ExtractedEntry = {
  path: string;
  bytes: Uint8Array;
  size: number;
};

export type UnzipWorkerRequest = {
  type: 'extract';
  archive: ArrayBuffer;
};

export type UnzipWorkerResponse =
  | { type: 'complete'; entries: ExtractedEntry[]; totalBytes: number }
  | { type: 'error'; message: string };
