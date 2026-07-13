import { useEffect, useRef, useState } from 'react';
import { downloadZip } from 'client-zip';
import { Button } from '../../components/Button';
import { FileTree } from '../../components/FileTree';
import { Progress } from '../../components/Progress';
import { Dropzone } from '../../lib/core/dropzone';
import { entryDownloadName } from '../../lib/core/download';
import { formatBytes } from '../../lib/core/format';
import { runUnzipWorker, type WorkerController } from '../../lib/core/worker';
import { assertArchiveInputSize, type ExtractedEntry } from '../../lib/tools/unzip/types';

type Status = 'idle' | 'extracting' | 'ready' | 'error';
const DOWNLOAD_CLEANUP_DELAY_MS = 1_000;

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [archiveName, setArchiveName] = useState('');
  const [entries, setEntries] = useState<ExtractedEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const controllerRef = useRef<WorkerController | null>(null);
  const operationRef = useRef(0);
  const isDownloadingRef = useRef(false);
  const objectUrlsRef = useRef(new Set<string>());
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const previousStatusRef = useRef<Status | null>(null);
  const extractingHeadingRef = useRef<HTMLHeadingElement>(null);
  const readyHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);

  function revokeObjectUrls() {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  }

  useEffect(
    () => () => {
      operationRef.current += 1;
      controllerRef.current?.cancel();
      controllerRef.current = null;
      revokeObjectUrls();
    },
    [],
  );

  useEffect(() => {
    const previousStatus = previousStatusRef.current;

    if (status === 'extracting') extractingHeadingRef.current?.focus();
    if (status === 'ready') readyHeadingRef.current?.focus();
    if (status === 'error') errorHeadingRef.current?.focus();
    if (status === 'idle' && previousStatus !== null && previousStatus !== 'idle') {
      dropzoneRef.current?.focus();
    }

    previousStatusRef.current = status;
  }, [status]);

  async function openArchive(file: File) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Choose a .zip file.');
      setStatus('error');
      return;
    }
    try {
      assertArchiveInputSize(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This ZIP file is too large.');
      setStatus('error');
      return;
    }
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    controllerRef.current?.cancel();
    revokeObjectUrls();
    setArchiveName(file.name);
    setEntries([]);
    setProgress(0);
    setError('');
    setStatus('extracting');
    try {
      const controller = runUnzipWorker(file, {
        onEntry: (entry) => {
          if (operationRef.current === operation) setEntries((current) => [...current, entry]);
        },
        onProgress: (loadedBytes, totalBytes) => {
          if (operationRef.current !== operation) return;
          setProgress(totalBytes === 0 ? 100 : Math.round((loadedBytes / totalBytes) * 100));
        },
      });
      controllerRef.current = controller;
      const result = await controller.promise;
      if (operationRef.current !== operation || result.type !== 'complete') return;
      setProgress(100);
      setStatus('ready');
    } catch (reason) {
      if (operationRef.current !== operation) return;
      setEntries([]);
      setProgress(0);
      setError(reason instanceof Error ? reason.message : 'Could not extract this archive.');
      setStatus('error');
    } finally {
      if (operationRef.current === operation) controllerRef.current = null;
    }
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      objectUrlsRef.current.delete(url);
    }, DOWNLOAD_CLEANUP_DELAY_MS);
  }

  function downloadEntry(entry: ExtractedEntry) {
    if (status !== 'ready' || isDownloadingRef.current) return;
    download(new Blob([entry.bytes as BlobPart]), entryDownloadName(entry.path));
  }

  async function downloadAll() {
    if (status !== 'ready' || isDownloadingRef.current) return;
    isDownloadingRef.current = true;
    setIsDownloading(true);
    try {
      const files = entries.map((entry) => ({ name: entry.path, input: entry.bytes }));
      const blob = await downloadZip(files).blob();
      download(blob, `${archiveName.replace(/\.zip$/iu, '')}-extracted.zip`);
    } finally {
      isDownloadingRef.current = false;
      setIsDownloading(false);
    }
  }

  function reset() {
    operationRef.current += 1;
    controllerRef.current?.cancel();
    controllerRef.current = null;
    revokeObjectUrls();
    setStatus('idle');
    setEntries([]);
    setProgress(0);
    setArchiveName('');
    setError('');
  }

  const totalBytes = entries.reduce((total, entry) => total + entry.size, 0);
  const liveMessage =
    status === 'ready'
      ? `Extracted ${entries.length} ${entries.length === 1 ? 'file' : 'files'}.`
      : status === 'error'
        ? error
        : '';

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e5f5e7,transparent_35%),#f8faf6] px-5 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </div>
        <header className="mb-10 flex items-start justify-between gap-6">
          <div>
            <p className="mb-2 text-sm font-semibold tracking-wide text-emerald-700">FILE TOOLS</p>
            <h1 className="text-4xl font-bold tracking-tight text-stone-950 sm:text-5xl">
              Unzip, privately.
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-stone-600">
              Open ZIP files entirely on your device. Nothing is uploaded, tracked, or sent
              anywhere.
            </p>
          </div>
          <div className="hidden rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 sm:block">
            100% offline
          </div>
        </header>

        {status === 'idle' && <Dropzone ref={dropzoneRef} onFile={openArchive} />}

        {status === 'extracting' && (
          <section className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2
                  ref={extractingHeadingRef}
                  tabIndex={-1}
                  className="font-semibold text-stone-900"
                >
                  Opening {archiveName}
                </h2>
                <p className="mt-1 text-sm text-stone-500">Validating and extracting safely…</p>
              </div>
              <Button secondary onClick={() => controllerRef.current?.cancel()}>
                Cancel
              </Button>
            </div>
            <Progress value={progress} />
            <p className="mt-2 text-right text-xs tabular-nums text-stone-500" aria-hidden="true">
              {progress}%
            </p>
          </section>
        )}

        {status === 'error' && (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-8">
            <h2 ref={errorHeadingRef} tabIndex={-1} className="font-semibold text-red-950">
              This archive could not be opened
            </h2>
            <p className="mt-2 text-sm text-red-800">{error}</p>
            <Button className="mt-5" onClick={reset}>
              Try another file
            </Button>
          </section>
        )}

        {status === 'ready' && (
          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-stone-500">{archiveName}</p>
                <h2 ref={readyHeadingRef} tabIndex={-1} className="mt-1 text-2xl font-bold text-stone-950">
                  Files ready to download
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {entries.length} {entries.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button secondary onClick={reset}>
                  Open another
                </Button>
                <Button disabled={isDownloading} onClick={() => void downloadAll()}>
                  {isDownloading ? 'Downloading…' : 'Download all'}
                </Button>
              </div>
            </div>
            <fieldset disabled={isDownloading} className="m-0 min-w-0 border-0 p-0">
              <FileTree entries={entries} onDownload={downloadEntry} />
            </fieldset>
            <p className="mt-4 text-center text-xs text-stone-500">
              Download all creates a safe, fresh ZIP that preserves folder names on Chrome and
              Firefox.
            </p>
          </section>
        )}

        <footer className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-stone-500">
          <span>No uploads</span>
          <span>No account</span>
          <span>No permissions</span>
          <span>No network</span>
        </footer>
      </div>
    </main>
  );
}
