import type { ExtractedEntry } from '../lib/tools/unzip/types';
import { formatBytes } from '../lib/core/format';
import { Button } from './Button';

type FileTreeProps = {
  entries: ExtractedEntry[];
  onDownload: (entry: ExtractedEntry) => void;
};

export function FileTree({ entries, onDownload }: FileTreeProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
        <span>File</span>
        <span>Size</span>
        <span className="sr-only">Action</span>
      </div>
      <div className="max-h-96 overflow-auto" role="region" tabIndex={0} aria-label="Extracted files">
        <ul className="divide-y divide-stone-100">
          {entries.map((entry) => (
            <li
              key={entry.path}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-3"
            >
              <span className="truncate text-sm text-stone-800" title={entry.path}>
                {entry.path}
              </span>
              <span className="text-xs tabular-nums text-stone-500">{formatBytes(entry.size)}</span>
              <Button secondary aria-label={`Download ${entry.path}`} onClick={() => onDownload(entry)}>
                Download
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
