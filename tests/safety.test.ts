import { describe, expect, it } from 'vitest';
import {
  ArchiveSafetyBudget,
  ArchiveSafetyError,
  assertRegularEntry,
  parseUnsignedLittleEndian,
  safeArchivePath,
} from '../lib/core/safety';

describe('safeArchivePath', () => {
  it.each([
    '../etc/passwd',
    '/etc/passwd',
    '\\\\server\\share',
    'folder\\file.txt',
    'C:/Windows/file.txt',
    'folder//file.txt',
    'folder/./file.txt',
    'nul\u0000name.txt',
    'report\u202etxt.exe',
    'folder/CON.txt',
    'folder/file.txt.',
  ])('rejects unsafe path %s', (path) =>
    expect(() => safeArchivePath(path)).toThrow(ArchiveSafetyError),
  );

  it('accepts a nested relative path', () => {
    expect(safeArchivePath('folder/file.txt')).toBe('folder/file.txt');
    expect(safeArchivePath('folder/')).toBe('folder');
  });

  it.each(['symlink', 'special'] as const)('rejects %s entries', (kind) => {
    expect(() => assertRegularEntry(kind)).toThrow(ArchiveSafetyError);
  });
});

describe('parseUnsignedLittleEndian', () => {
  it('parses a Zip64-sized unsigned integer without precision loss', () => {
    expect(
      parseUnsignedLittleEndian(Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)),
    ).toBe(2n ** 64n - 1n);
  });

  it('rejects values that exceed 64 bits', () => {
    expect(() => parseUnsignedLittleEndian(new Uint8Array(9))).toThrow(ArchiveSafetyError);
  });
});

describe('ArchiveSafetyBudget', () => {
  it('checks the actual emitted byte cap before crossing it', () => {
    const budget = new ArchiveSafetyBudget({ maxEmittedBytes: 4n });
    budget.addEmittedBytes(4);
    expect(() => budget.addEmittedBytes(1)).toThrow(/expanded beyond/u);
    expect(() => budget.addEmittedBytes(-1)).toThrow(ArchiveSafetyError);
  });

  it('parses and checks declared sizes as bigint values', () => {
    const budget = new ArchiveSafetyBudget({ maxEmittedBytes: 4n });
    expect(() => budget.checkDeclaredSize(2n ** 64n - 1n)).toThrow(/declares/u);
  });

  it('enforces a cumulative declared-size budget', () => {
    const budget = new ArchiveSafetyBudget({ maxEmittedBytes: 10n });
    budget.checkDeclaredSize(6n);
    expect(() => budget.checkDeclaredSize(5n)).toThrow(/declared sizes exceed/u);
  });

  it('enforces entry-count, path-depth, and encoded path-size caps', () => {
    expect(() => new ArchiveSafetyBudget({ maxEntries: 0 }).addEntry('file.txt', 'file')).toThrow(
      /too many entries/u,
    );
    expect(() =>
      new ArchiveSafetyBudget({ maxPathDepth: 1 }).addEntry('folder/file.txt', 'file'),
    ).toThrow(/too deep/u);
    expect(() => new ArchiveSafetyBudget({ maxPathBytes: 4 }).addEntry('file.txt', 'file')).toThrow(
      /too long/u,
    );
  });

  it('rejects nested extraction by default', () => {
    expect(() => new ArchiveSafetyBudget().addEntry('nested.txt', 'file', 1)).toThrow(
      /Nested archive extraction is disabled/u,
    );
  });

  it('rejects duplicate and case-colliding paths', () => {
    const duplicateBudget = new ArchiveSafetyBudget();
    duplicateBudget.addEntry('same.txt', 'file');
    expect(() => duplicateBudget.addEntry('same.txt', 'file')).toThrow(/duplicate/u);

    const collisionBudget = new ArchiveSafetyBudget();
    collisionBudget.addEntry('Readme.txt', 'file');
    expect(() => collisionBudget.addEntry('README.TXT', 'file')).toThrow(/colliding/u);
  });

  it('enforces the wall-time cap', () => {
    const budget = new ArchiveSafetyBudget({ maxWallTimeMs: 10 }, 100);
    budget.assertWithinTime(110);
    expect(() => budget.assertWithinTime(111)).toThrow(/too long/u);
  });
});
