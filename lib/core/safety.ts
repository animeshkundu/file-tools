export const DEFAULT_ARCHIVE_LIMITS = {
  maxEmittedBytes: 512n * 1024n * 1024n,
  maxEntries: 10_000,
  maxPathDepth: 32,
  maxPathBytes: 1024,
  maxRecursionDepth: 0,
  maxWallTimeMs: 30_000,
} as const;

export type ArchiveLimits = {
  maxEmittedBytes: bigint;
  maxEntries: number;
  maxPathDepth: number;
  maxPathBytes: number;
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

const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const WINDOWS_UNSAFE_CHARACTERS = /[<>:"|?*]/u;
const BIDI_CONTROL_CHARACTERS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const TEXT_ENCODER = new TextEncoder();

export function safeArchivePath(name: string, root = '/extract'): string {
  if (
    !name ||
    name.includes('\\') ||
    BIDI_CONTROL_CHARACTERS.test(name) ||
    [...name].some((character) => {
      const code = character.codePointAt(0);
      return code !== undefined && (code <= 31 || code === 127);
    })
  ) {
    throw new ArchiveSafetyError('Archive entry contains an unsafe filename.');
  }
  if (name.startsWith('/') || name.startsWith('//') || /^[a-zA-Z]:/u.test(name)) {
    throw new ArchiveSafetyError('Archive entry uses an absolute path.');
  }

  const path = name.endsWith('/') ? name.slice(0, -1) : name;
  const parts = path.split('/');
  if (!path || parts.some((part) => part === '')) {
    throw new ArchiveSafetyError('Archive entry contains an ambiguous path segment.');
  }
  if (parts.some((part) => part === '..')) {
    throw new ArchiveSafetyError('Archive entry tries to leave the extraction folder.');
  }
  if (parts.some((part) => part === '.')) {
    throw new ArchiveSafetyError('Archive entry contains an ambiguous path segment.');
  }
  if (
    parts.some(
      (part) =>
        WINDOWS_UNSAFE_CHARACTERS.test(part) ||
        WINDOWS_RESERVED_NAMES.test(part) ||
        part.endsWith('.') ||
        part.endsWith(' '),
    )
  ) {
    throw new ArchiveSafetyError('Archive entry contains a filename that is unsafe on Windows.');
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
  if (bytes.length > 8) {
    throw new ArchiveSafetyError('Unsigned integer is too large to parse safely.');
  }
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
  private declaredBytes = 0n;
  private emittedBytes = 0n;
  private readonly paths = new Set<string>();
  private readonly comparablePaths = new Set<string>();

  constructor(limits: Partial<ArchiveLimits> = {}, startedAt = performance.now()) {
    this.limits = { ...DEFAULT_ARCHIVE_LIMITS, ...limits };
    if (
      this.limits.maxEmittedBytes < 0n ||
      !Number.isSafeInteger(this.limits.maxEntries) ||
      this.limits.maxEntries < 0 ||
      !Number.isSafeInteger(this.limits.maxPathDepth) ||
      this.limits.maxPathDepth < 0 ||
      !Number.isSafeInteger(this.limits.maxPathBytes) ||
      this.limits.maxPathBytes < 0 ||
      !Number.isSafeInteger(this.limits.maxRecursionDepth) ||
      this.limits.maxRecursionDepth < 0 ||
      !Number.isFinite(this.limits.maxWallTimeMs) ||
      this.limits.maxWallTimeMs < 0 ||
      !Number.isFinite(startedAt)
    ) {
      throw new ArchiveSafetyError('Archive safety limits are invalid.');
    }
    this.startedAt = startedAt;
  }

  addEntry(name: string, kind: ArchiveEntryKind, recursionDepth = 0): string {
    this.assertWithinTime();
    assertRegularEntry(kind);
    if (!Number.isSafeInteger(recursionDepth) || recursionDepth < 0) {
      throw new ArchiveSafetyError('Archive recursion depth is invalid.');
    }
    if (recursionDepth > this.limits.maxRecursionDepth) {
      throw new ArchiveSafetyError('Nested archive extraction is disabled.');
    }
    const safePath = safeArchivePath(name);
    const depth = safePath.split('/').filter(Boolean).length;
    if (depth > this.limits.maxPathDepth) {
      throw new ArchiveSafetyError('Archive entry path is too deep.');
    }
    if (TEXT_ENCODER.encode(safePath).byteLength > this.limits.maxPathBytes) {
      throw new ArchiveSafetyError('Archive entry path is too long.');
    }
    if (this.entries >= this.limits.maxEntries) {
      throw new ArchiveSafetyError('Archive contains too many entries.');
    }
    if (this.paths.has(safePath)) {
      throw new ArchiveSafetyError('Archive contains duplicate entry paths.');
    }
    const comparablePath = safePath.normalize('NFC').toLowerCase();
    if (this.comparablePaths.has(comparablePath)) {
      throw new ArchiveSafetyError('Archive contains case-colliding entry paths.');
    }
    this.entries += 1;
    this.paths.add(safePath);
    this.comparablePaths.add(comparablePath);
    return safePath;
  }

  checkDeclaredSize(size: bigint): void {
    this.assertWithinTime();
    if (size < 0n || size > this.limits.maxEmittedBytes) {
      throw new ArchiveSafetyError('Archive declares an entry larger than the extraction limit.');
    }
    const declaredBytes = this.declaredBytes + size;
    if (declaredBytes > this.limits.maxEmittedBytes) {
      throw new ArchiveSafetyError('Archive declared sizes exceed the extraction limit.');
    }
    this.declaredBytes = declaredBytes;
  }

  addEmittedBytes(size: number | bigint): void {
    this.assertWithinTime();
    if (typeof size === 'number' && (!Number.isSafeInteger(size) || size < 0)) {
      throw new ArchiveSafetyError('Invalid emitted byte count.');
    }
    const increment = typeof size === 'bigint' ? size : BigInt(size);
    if (increment < 0n) throw new ArchiveSafetyError('Invalid emitted byte count.');
    const emittedBytes = this.emittedBytes + increment;
    if (emittedBytes > this.limits.maxEmittedBytes) {
      throw new ArchiveSafetyError('Archive expanded beyond the extraction limit.');
    }
    this.emittedBytes = emittedBytes;
  }

  assertWithinTime(now = performance.now()): void {
    if (!Number.isFinite(now)) {
      throw new ArchiveSafetyError('Archive extraction time is invalid.');
    }
    if (now - this.startedAt > this.limits.maxWallTimeMs) {
      throw new ArchiveSafetyError('Archive extraction took too long.');
    }
  }
}
