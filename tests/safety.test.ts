import { describe, expect, it } from 'vitest';
import { ArchiveSafetyBudget, ArchiveSafetyError, safeArchivePath } from '../lib/core/safety';

describe('safeArchivePath', () => {
  it.each(['../etc/passwd', '/etc/passwd', '\\\\server\\share', 'folder\\file.txt'])(
    'rejects unsafe path %s',
    (path) => expect(() => safeArchivePath(path)).toThrow(ArchiveSafetyError),
  );

  it('accepts a nested relative path', () => {
    expect(safeArchivePath('folder/file.txt')).toBe('folder/file.txt');
  });
});

describe('ArchiveSafetyBudget', () => {
  it('trips the actual emitted byte cap', () => {
    const budget = new ArchiveSafetyBudget({ maxEmittedBytes: 4n });
    budget.addEmittedBytes(4);
    expect(() => budget.addEmittedBytes(1)).toThrow(/expanded beyond/u);
  });

  it('parses and checks declared sizes as bigint values', () => {
    const budget = new ArchiveSafetyBudget({ maxEmittedBytes: 4n });
    expect(() => budget.checkDeclaredSize(2n ** 64n - 1n)).toThrow(/declares/u);
  });
});
