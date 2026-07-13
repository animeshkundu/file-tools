import { ArchiveSafetyError } from '../../core/safety';
import { ArchiveUnsupportedError } from './extract';

export function formatWorkerError(error: unknown): string {
  if (error instanceof ArchiveUnsupportedError) {
    if (error.reason === 'encrypted') {
      return "This ZIP is password-protected, which isn't supported yet.";
    }
    if (error.reason === 'zip64') {
      return 'This ZIP is too large (over 4 GB) for the current extractor.';
    }
  }
  if (error instanceof ArchiveSafetyError) return "This archive can't be opened safely.";
  if (error instanceof Error) return error.message;
  return 'Could not extract this archive.';
}
