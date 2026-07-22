import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtractedEntry } from '../lib/tools/unzip/types';
import { formatBytes } from '../lib/core/format';
import { Button } from './Button';

export type SortKey = 'name' | 'size';

export const ROW_HEIGHT = 48;
const OVERSCAN = 5;
const CONTAINER_HEIGHT_DEFAULT = 384; // max-h-96 = 24rem = 384px

export function getVisibleRange(
  totalCount: number,
  rowHeight: number,
  containerHeight: number,
  scrollTop: number,
  overscan: number,
): { startIndex: number; endIndex: number } {
  if (totalCount === 0) return { startIndex: 0, endIndex: 0 };
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    totalCount,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan,
  );
  return { startIndex, endIndex };
}

export function filterEntries(entries: ExtractedEntry[], query: string): ExtractedEntry[] {
  if (!query.trim()) return entries;
  const lower = query.toLowerCase();
  return entries.filter((e) => e.path.toLowerCase().includes(lower));
}

export function sortEntries(entries: ExtractedEntry[], key: SortKey): ExtractedEntry[] {
  return [...entries].sort((a, b) =>
    key === 'name' ? a.path.localeCompare(b.path) : a.size - b.size,
  );
}

/**
 * Returns a human-readable filter summary string when filtering is active,
 * or null when no filter is applied.
 */
export function getFilterSummary(
  filteredCount: number,
  totalCount: number,
  isFiltering: boolean,
): string | null {
  if (!isFiltering) return null;
  return `${filteredCount} of ${totalCount} files`;
}

type FileTreeProps = {
  entries: ExtractedEntry[];
  onDownload: (entry: ExtractedEntry) => void;
  onSelect: (entry: ExtractedEntry, trigger: HTMLButtonElement) => void;
  selectedPath: string | null;
};

export function FileTree({ entries, onDownload, onSelect, selectedPath }: FileTreeProps) {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(CONTAINER_HEIGHT_DEFAULT);
  const [revealedPath, setRevealedPath] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerHeight(el.clientHeight || CONTAINER_HEIGHT_DEFAULT);
    });
    ro.observe(el);
    setContainerHeight(el.clientHeight || CONTAINER_HEIGHT_DEFAULT);
    return () => {
      ro.disconnect();
    };
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.currentTarget as HTMLDivElement).scrollTop);
  }, []);

  const filtered = filterEntries(entries, filter);
  const sorted = sortEntries(filtered, sortKey);
  const isFiltering = filter.trim().length > 0;
  const filterSummary = getFilterSummary(filtered.length, entries.length, isFiltering);

  const { startIndex, endIndex } = getVisibleRange(
    sorted.length,
    ROW_HEIGHT,
    containerHeight,
    scrollTop,
    OVERSCAN,
  );
  const visibleEntries = sorted.slice(startIndex, endIndex);
  const totalHeight = sorted.length * ROW_HEIGHT;

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2">
        <label htmlFor="file-filter" className="sr-only">
          Filter files
        </label>
        <input
          id="file-filter"
          type="search"
          placeholder="Filter files…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setRevealedPath(null);
          }}
          className="min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {filterSummary !== null && (
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="shrink-0 text-xs text-stone-500"
          >
            {filterSummary}
          </span>
        )}
        <button
          type="button"
          onClick={() => setSortKey((k) => (k === 'name' ? 'size' : 'name'))}
          className="shrink-0 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label={`Currently sorted by ${sortKey}. Switch to sort by ${sortKey === 'name' ? 'size' : 'name'}`}
        >
          Sort: {sortKey === 'name' ? 'Name' : 'Size'}
        </button>
      </div>
      {/* Full-path reveal panel — always in DOM so aria-live announces changes */}
      <div
        id="file-path-reveal"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        hidden={revealedPath === null}
        className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs text-stone-700 break-words"
      >
        {revealedPath ?? ''}
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
        <span>File</span>
        <span>Size</span>
        <span className="sr-only">Action</span>
      </div>
      <div
        ref={containerRef}
        className="max-h-96 overflow-auto"
        role="region"
        tabIndex={0}
        aria-label="Extracted files"
        onScroll={handleScroll}
      >
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-stone-500">
            No extractable files in this archive.
          </p>
        ) : sorted.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-stone-500">
            No files match the current filter.
          </p>
        ) : (
          <ul
            aria-label="Extracted files list"
            style={{ height: totalHeight, position: 'relative' }}
          >
            {visibleEntries.map((entry, idx) => {
              const isRevealed = revealedPath === entry.path;
              const isSelected = selectedPath === entry.path;
              return (
                <li
                  key={entry.path}
                  style={{
                    position: 'absolute',
                    top: (startIndex + idx) * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                  }}
                  onClick={(event) => {
                    const trigger = event.currentTarget.querySelector<HTMLButtonElement>(
                      'button[aria-controls="file-preview"]',
                    );
                    if (trigger) onSelect(entry, trigger);
                  }}
                  className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-stone-100 px-4 py-1 hover:bg-stone-50 ${
                    isSelected ? 'bg-emerald-50' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-controls="file-preview"
                      aria-label={`Preview ${entry.path}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(entry, event.currentTarget);
                      }}
                      className="min-w-0 truncate rounded text-left text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      title={entry.path}
                    >
                      {entry.path}
                    </button>
                    <button
                      type="button"
                      aria-expanded={isRevealed}
                      aria-controls="file-path-reveal"
                      aria-label={
                        isRevealed
                          ? `Collapse full path for ${entry.path}`
                          : `Reveal full path for ${entry.path}`
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        setRevealedPath(isRevealed ? null : entry.path);
                      }}
                      className="shrink-0 rounded px-1 py-0.5 text-xs text-stone-400 hover:bg-stone-100 hover:text-stone-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      ⋯
                    </button>
                  </span>
                  <span className="text-xs tabular-nums text-stone-500">
                    {formatBytes(entry.size)}
                  </span>
                  <Button
                    secondary
                    aria-label={`Download ${entry.path}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDownload(entry);
                    }}
                  >
                    Download
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
