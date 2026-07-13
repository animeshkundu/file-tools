import { ArchiveSafetyError } from '../../core/safety';

export function formatWorkerError(error: unknown): string {
  if (error instanceof ArchiveSafetyError) return "This archive can't be opened safely.";
  if (error instanceof Error) return error.message;
  return 'Could not extract this archive.';
}
