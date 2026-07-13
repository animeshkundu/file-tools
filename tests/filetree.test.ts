import { describe, expect, it } from 'vitest';
import type { ExtractedEntry } from '../lib/tools/unzip/types';
import {
  filterEntries,
  getFilterSummary,
  getVisibleRange,
  ROW_HEIGHT,
  sortEntries,
} from '../components/FileTree';

function makeEntries(count: number): ExtractedEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `file_${i.toString().padStart(6, '0')}.txt`,
    bytes: new Uint8Array(0),
    size: i * 1024,
  }));
}

// ---------------------------------------------------------------------------
// getVisibleRange — windowing logic
// ---------------------------------------------------------------------------
describe('getVisibleRange', () => {
  const containerHeight = 384; // max-h-96 default
  const overscan = 5;

  it('renders only a small subset of rows for a 5 000-entry list', () => {
    const { startIndex, endIndex } = getVisibleRange(
      5000,
      ROW_HEIGHT,
      containerHeight,
      0,
      overscan,
    );
    const rendered = endIndex - startIndex;
    // visible rows ≈ ceil(384/48)+overscan = 8+5 = 13; far fewer than 5 000
    expect(rendered).toBeLessThan(30);
    expect(rendered).toBeGreaterThan(0);
  });

  it('adjusts the window when scrolled mid-list', () => {
    // scroll to ~entry 500  (500 * 48 = 24 000 px)
    const scrollTop = 500 * ROW_HEIGHT;
    const { startIndex, endIndex } = getVisibleRange(
      5000,
      ROW_HEIGHT,
      containerHeight,
      scrollTop,
      overscan,
    );
    expect(startIndex).toBeGreaterThan(0);
    expect(startIndex).toBeLessThan(500);
    expect(endIndex).toBeGreaterThan(500);
    expect(endIndex).toBeLessThanOrEqual(5000);
    expect(endIndex - startIndex).toBeLessThan(30);
  });

  it('clamps endIndex to totalCount so indices never exceed the array', () => {
    const { startIndex, endIndex } = getVisibleRange(10, ROW_HEIGHT, containerHeight, 0, overscan);
    expect(startIndex).toBe(0);
    expect(endIndex).toBe(10); // clamped, not 13
  });

  it('returns {0, 0} for an empty list', () => {
    const { startIndex, endIndex } = getVisibleRange(0, ROW_HEIGHT, containerHeight, 0, overscan);
    expect(startIndex).toBe(0);
    expect(endIndex).toBe(0);
  });

  it('returns {0, 0} for an empty list scrolled to a non-zero position', () => {
    const { startIndex, endIndex } = getVisibleRange(0, ROW_HEIGHT, containerHeight, 9999, overscan);
    expect(startIndex).toBe(0);
    expect(endIndex).toBe(0);
  });

  it('never returns a negative startIndex even when scrollTop is negative', () => {
    const { startIndex } = getVisibleRange(100, ROW_HEIGHT, containerHeight, -100, overscan);
    expect(startIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterEntries — substring filter
// ---------------------------------------------------------------------------
describe('filterEntries', () => {
  it('returns all entries when the query is empty', () => {
    const entries = makeEntries(5000);
    expect(filterEntries(entries, '')).toHaveLength(5000);
  });

  it('returns all entries when the query is only whitespace', () => {
    const entries = makeEntries(10);
    expect(filterEntries(entries, '   ')).toHaveLength(10);
  });

  it('narrows the set based on a path substring', () => {
    const entries = makeEntries(100);
    // paths: file_000000.txt … file_000009.txt (10 entries start with file_00000)
    const result = filterEntries(entries, 'file_00000');
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(100);
    for (const e of result) {
      expect(e.path.toLowerCase()).toContain('file_00000');
    }
  });

  it('returns an empty array when nothing matches', () => {
    const entries = makeEntries(50);
    expect(filterEntries(entries, 'xyznotpresent')).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const entries: ExtractedEntry[] = [
      { path: 'README.md', bytes: new Uint8Array(0), size: 100 },
      { path: 'src/index.ts', bytes: new Uint8Array(0), size: 200 },
    ];
    expect(filterEntries(entries, 'readme')).toHaveLength(1);
    expect(filterEntries(entries, 'README')).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const entries = makeEntries(5);
    const original = entries.map((e) => e.path);
    filterEntries(entries, 'file_0');
    expect(entries.map((e) => e.path)).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// sortEntries — name / size ordering
// ---------------------------------------------------------------------------
describe('sortEntries', () => {
  it('sorts by name ascending', () => {
    const entries: ExtractedEntry[] = [
      { path: 'c.txt', bytes: new Uint8Array(0), size: 100 },
      { path: 'a.txt', bytes: new Uint8Array(0), size: 300 },
      { path: 'b.txt', bytes: new Uint8Array(0), size: 200 },
    ];
    const sorted = sortEntries(entries, 'name');
    expect(sorted.map((e) => e.path)).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('sorts by size ascending', () => {
    const entries: ExtractedEntry[] = [
      { path: 'c.txt', bytes: new Uint8Array(0), size: 300 },
      { path: 'a.txt', bytes: new Uint8Array(0), size: 100 },
      { path: 'b.txt', bytes: new Uint8Array(0), size: 200 },
    ];
    const sorted = sortEntries(entries, 'size');
    expect(sorted.map((e) => e.size)).toEqual([100, 200, 300]);
  });

  it('does not mutate the input array', () => {
    const entries = makeEntries(5);
    const original = entries.map((e) => e.path);
    sortEntries(entries, 'size');
    expect(entries.map((e) => e.path)).toEqual(original);
  });

  it('produces stable name order for 5 000 entries', () => {
    const entries = makeEntries(5000);
    // reverse first so the sort has real work to do
    const reversed = [...entries].reverse();
    const sorted = sortEntries(reversed, 'name');
    expect(sorted[0]!.path).toBe('file_000000.txt');
    expect(sorted[sorted.length - 1]!.path).toBe('file_004999.txt');
  });

  it('produces ascending size order for 5 000 entries', () => {
    const entries = makeEntries(5000);
    const reversed = [...entries].reverse();
    const sorted = sortEntries(reversed, 'size');
    expect(sorted[0]!.size).toBe(0);
    expect(sorted[sorted.length - 1]!.size).toBe(4999 * 1024);
  });
});

// ---------------------------------------------------------------------------
// Composition: filter then sort
// ---------------------------------------------------------------------------
describe('filterEntries + sortEntries composition', () => {
  it('filter narrows, then sort orders the narrowed set', () => {
    const entries: ExtractedEntry[] = [
      { path: 'src/z.ts', bytes: new Uint8Array(0), size: 300 },
      { path: 'src/a.ts', bytes: new Uint8Array(0), size: 100 },
      { path: 'lib/b.ts', bytes: new Uint8Array(0), size: 200 },
    ];
    const filtered = filterEntries(entries, 'src/');
    const sorted = sortEntries(filtered, 'name');
    expect(sorted.map((e) => e.path)).toEqual(['src/a.ts', 'src/z.ts']);
  });
});

// ---------------------------------------------------------------------------
// getFilterSummary — N-of-M count indicator (#50)
// ---------------------------------------------------------------------------
describe('getFilterSummary', () => {
  it('returns null when filter is not active', () => {
    expect(getFilterSummary(100, 100, false)).toBeNull();
  });

  it('returns null for zero-length filter even when counts differ', () => {
    expect(getFilterSummary(0, 50, false)).toBeNull();
  });

  it('returns "N of M files" string when filtering', () => {
    expect(getFilterSummary(3, 10, true)).toBe('3 of 10 files');
  });

  it('returns "0 of M files" when nothing matches', () => {
    expect(getFilterSummary(0, 20, true)).toBe('0 of 20 files');
  });

  it('returns "M of M files" when all entries match', () => {
    expect(getFilterSummary(5, 5, true)).toBe('5 of 5 files');
  });

  it('handles a single match', () => {
    expect(getFilterSummary(1, 1000, true)).toBe('1 of 1000 files');
  });
});
