import { describe, expect, it } from 'vitest';
import { formatBytes } from '../lib/core/format';

describe('formatBytes', () => {
  it('returns 0 B for non-positive values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(Number.NEGATIVE_INFINITY)).toBe('0 B');
  });
});
