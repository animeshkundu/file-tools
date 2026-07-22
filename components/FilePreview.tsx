import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatBytes } from '../lib/core/format';
import {
  createEntryPreview,
  IMAGE_PREVIEW_LIMIT_BYTES,
  type EntryPreviewPlan,
} from '../lib/tools/unzip/preview';
import type { ExtractedEntry } from '../lib/tools/unzip/types';
import { Button } from './Button';

type FilePreviewProps = {
  entry: ExtractedEntry | null;
  onClose: () => void;
  onDownload: (entry: ExtractedEntry) => void;
};

type InlineImageProps = {
  entry: ExtractedEntry;
  mimeType: string;
  onError: () => void;
};

function InlineImage({ entry, mimeType, onError }: InlineImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    const objectUrl = URL.createObjectURL(
      new Blob([entry.bytes as BlobPart], { type: mimeType }),
    );
    image.src = objectUrl;

    return () => {
      image.removeAttribute('src');
      URL.revokeObjectURL(objectUrl);
    };
  }, [entry, mimeType]);

  return (
    <img
      ref={imageRef}
      alt={`Preview of ${entry.path}`}
      onError={onError}
      className="max-h-80 max-w-full rounded-xl object-contain"
    />
  );
}

function NoInlinePreview({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 text-center">
      <p className="font-semibold text-stone-800">No inline preview</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{children}</p>
    </div>
  );
}

function PreviewContent({
  entry,
  preview,
}: {
  entry: ExtractedEntry;
  preview: EntryPreviewPlan;
}) {
  const [imageError, setImageError] = useState(false);

  if (preview.kind === 'text') {
    return (
      <div>
        {preview.text.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-stone-50 p-5 text-center text-sm text-stone-600">
            This text file is empty.
          </p>
        ) : (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-stone-200 bg-stone-50 p-4 font-mono text-xs leading-5 text-stone-800">
            {preview.text}
          </pre>
        )}
        {preview.truncated && (
          <p className="mt-2 text-xs text-amber-700">
            Preview truncated. Showing the first {formatBytes(preview.shownBytes)}.
          </p>
        )}
      </div>
    );
  }

  if (preview.kind === 'binary') {
    return (
      <NoInlinePreview>
        This file appears to contain binary data. Download it to open it in a compatible app.
      </NoInlinePreview>
    );
  }

  if (preview.oversized) {
    return (
      <NoInlinePreview>
        This image is larger than the {formatBytes(IMAGE_PREVIEW_LIMIT_BYTES)} inline preview
        limit. Download it to view the full file.
      </NoInlinePreview>
    );
  }

  if (imageError) {
    return (
      <NoInlinePreview>
        This image could not be displayed inline. Download it to open the original file.
      </NoInlinePreview>
    );
  }

  return (
    <div className="flex min-h-48 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 p-4">
      <InlineImage entry={entry} mimeType={preview.mimeType} onError={() => setImageError(true)} />
    </div>
  );
}

export function FilePreview({ entry, onClose, onDownload }: FilePreviewProps) {
  const preview = useMemo(() => (entry ? createEntryPreview(entry) : null), [entry]);

  return (
    <aside
      id="file-preview"
      aria-label="File preview"
      className="overflow-hidden rounded-2xl border border-stone-200 bg-white lg:sticky lg:top-6"
    >
      {entry && preview ? (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Preview</p>
              <h3 className="mt-1 break-words text-sm font-semibold text-stone-900">{entry.path}</h3>
            </div>
            <button
              type="button"
              aria-label="Close preview"
              onClick={onClose}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-stone-200 hover:text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              Close
            </button>
          </div>
          <div className="p-4">
            <dl className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              <dt className="text-stone-500">Name</dt>
              <dd className="break-words text-right text-stone-800">{entry.path}</dd>
              <dt className="text-stone-500">Size</dt>
              <dd className="text-right tabular-nums text-stone-800">{formatBytes(entry.size)}</dd>
              <dt className="text-stone-500">Type</dt>
              <dd className="text-right text-stone-800">{preview.typeLabel}</dd>
            </dl>
            <PreviewContent key={entry.path} entry={entry} preview={preview} />
            <Button
              secondary
              className="mt-4 w-full"
              aria-label={`Download ${entry.path} from preview`}
              onClick={() => onDownload(entry)}
            >
              Download
            </Button>
          </div>
        </>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
          <p className="font-semibold text-stone-800">Select a file to preview</p>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            Text and image files open here. Other files remain available to download.
          </p>
        </div>
      )}
    </aside>
  );
}
