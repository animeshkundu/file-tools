import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import { ArchiveSafetyBudget, DEFAULT_ARCHIVE_LIMITS, type ArchiveLimits } from '../../core/safety';
import type { ExtractedEntry } from './types';

function appendChunk(
  buffer: Uint8Array<ArrayBuffer>,
  chunk: Uint8Array,
  size: number,
): Uint8Array<ArrayBuffer> {
  const required = size + chunk.byteLength;
  if (required > buffer.byteLength) {
    const capacity = Math.max(required, Math.max(1, buffer.byteLength * 2));
    const grown = new Uint8Array(capacity);
    grown.set(buffer.subarray(0, size));
    buffer = grown;
  }
  buffer.set(chunk, size);
  return buffer;
}

export function extractZip(
  archive: Uint8Array,
  limits: Partial<ArchiveLimits> = {},
): ExtractedEntry[] {
  const budget = new ArchiveSafetyBudget({ ...DEFAULT_ARCHIVE_LIMITS, ...limits });
  const entries: ExtractedEntry[] = [];
  const unzipper = new Unzip((file) => {
    const directory = file.name.endsWith('/');
    const path = budget.addEntry(file.name, directory ? 'directory' : 'file');
    if (file.originalSize !== undefined) budget.checkDeclaredSize(BigInt(file.originalSize));
    if (directory) return;

    let bytes = new Uint8Array(file.originalSize ?? 0);
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      budget.addEmittedBytes(chunk.byteLength);
      bytes = appendChunk(bytes, chunk, size);
      size += chunk.byteLength;
      if (final) entries.push({ path, bytes: bytes.slice(0, size), size });
    };
    file.start();
  });
  unzipper.register(UnzipPassThrough);
  unzipper.register(UnzipInflate);
  unzipper.push(archive, true);
  budget.assertWithinTime();
  return entries;
}
