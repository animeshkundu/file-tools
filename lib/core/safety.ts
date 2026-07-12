export const DEFAULT_ARCHIVE_LIMITS = {
  maxEmittedBytes: 512n * 1024n * 1024n,
  maxEntries: 10_000,
  maxPathDepth: 32,
  maxRecursionDepth: 0,
  maxWallTimeMs: 30_000,
} as const;

export type ArchiveLimits = {
  maxEmittedBytes: bigint;
  maxEntries: number;
  maxPathDepth: number;
  maxRecursionDepth: number;
  maxWallTimeMs: number;
};

export type ArchiveEntryKind = 'file' | 'directory' | 'symlink' | 'special';

export class ArchiveSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveSafetyError';
  }
}

export function safeArchivePath(name: string, root = '/extract'): string {
  if (
    !name ||
    name.includes('\\') ||
    [...name].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new ArchiveSafetyError('Archive entry contains an unsafe filename.');
  }
  if (name.startsWith('/') || name.startsWith('//') || /^[a-zA-Z]:/u.test(name)) {
    throw new ArchiveSafetyError('Archive entry uses an absolute path.');
  }

  const parts = name.split('/').filter((part) => part !== '');
  if (parts.some((part) => part === '..')) {
    throw new ArchiveSafetyError('Archive entry tries to leave the extraction folder.');
  }
  if (parts.some((part) => part === '.')) {
    throw new ArchiveSafetyError('Archive entry contains an ambiguous path segment.');
  }

  const normalizedRoot = root.replace(/\/+$/u, '');
  const resolved = `${normalizedRoot}/${parts.join('/')}`;
  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}/`)) {
    throw new ArchiveSafetyError('Archive entry resolves outside the extraction folder.');
  }
  return parts.join('/');
}

export function assertRegularEntry(kind: ArchiveEntryKind): void {
  if (kind !== 'file' && kind !== 'directory') {
    throw new ArchiveSafetyError('Archive contains a link or special file.');
  }
}

export function parseUnsignedLittleEndian(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index]!);
  }
  return value;
}

export class ArchiveSafetyBudget {
  readonly limits: ArchiveLimits;
  readonly startedAt: number;
  private entries = 0;
  private emittedBytes = 0n;
  private readonly paths = new Set<string>();

  constructor(limits: Partial<ArchiveLimits> = {}, startedAt = performance.now()) {
    this.limits = { ...DEFAULT_ARCHIVE_LIMITS, ...limits };
    this.startedAt = startedAt;
  }

  addEntry(name: string, kind: ArchiveEntryKind, recursionDepth = 0): string {
    this.assertWithinTime();
    assertRegularEntry(kind);
    if (recursionDepth > this.limits.maxRecursionDepth) {
      throw new ArchiveSafetyError('Nested archive extraction is disabled.');
    }
    const safePath = safeArchivePath(name);
    const depth = safePath.split('/').filter(Boolean).length;
    if (depth > this.limits.maxPathDepth) {
      throw new ArchiveSafetyError('Archive entry path is too deep.');
    }
    this.entries += 1;
    if (this.entries > this.limits.maxEntries) {
      throw new ArchiveSafetyError('Archive contains too many entries.');
    }
    if (this.paths.has(safePath)) {
      throw new ArchiveSafetyError('Archive contains duplicate entry paths.');
    }
    this.paths.add(safePath);
    return safePath;
  }

  checkDeclaredSize(size: bigint): void {
    if (size < 0n || size > this.limits.maxEmittedBytes) {
      throw new ArchiveSafetyError('Archive declares an entry larger than the extraction limit.');
    }
  }

  addEmittedBytes(size: number | bigint): void {
    this.assertWithinTime();
    const increment = typeof size === 'bigint' ? size : BigInt(size);
    if (increment < 0n) throw new ArchiveSafetyError('Invalid emitted byte count.');
    this.emittedBytes += increment;
    if (this.emittedBytes > this.limits.maxEmittedBytes) {
      throw new ArchiveSafetyError('Archive expanded beyond the extraction limit.');
    }
  }

  assertWithinTime(now = performance.now()): void {
    if (now - this.startedAt > this.limits.maxWallTimeMs) {
      throw new ArchiveSafetyError('Archive extraction took too long.');
    }
  }
}
