export type ExtractedEntry = {
  path: string;
  bytes: Uint8Array;
  size: number;
};

export const MAX_ARCHIVE_INPUT_BYTES = 256 * 1024 * 1024;
export const ARCHIVE_READ_CHUNK_BYTES = 1024 * 1024;
export const MAX_ENTRY_OUTPUT_BYTES = 128n * 1024n * 1024n;

export function assertArchiveInputSize(file: Pick<File, 'size'>): void {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_ARCHIVE_INPUT_BYTES) {
    throw new Error('ZIP files must be 256 MB or smaller.');
  }
}

export type UnzipWorkerRequest = {
  type: 'extract';
  file: File;
};

export type UnzipWorkerResponse =
  | { type: 'progress'; loadedBytes: number; totalBytes: number }
  | { type: 'entry'; entry: ExtractedEntry }
  | { type: 'complete'; totalBytes: number }
  | { type: 'error'; message: string };
