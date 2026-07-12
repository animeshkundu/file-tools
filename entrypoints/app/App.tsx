import { useRef, useState } from 'react';
import { downloadZip } from 'client-zip';
import { Button } from '../../components/Button';
import { FileTree } from '../../components/FileTree';
import { Progress } from '../../components/Progress';
import { downloadBlob } from '../../lib/core/download';
import { Dropzone } from '../../lib/core/dropzone';
import { formatBytes } from '../../lib/core/format';
import { runUnzipWorker, type WorkerController } from '../../lib/core/worker';
import type { ExtractedEntry } from '../../lib/tools/unzip/types';

type Status = 'idle' | 'extracting' | 'ready' | 'error';

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [archiveName, setArchiveName] = useState('');
  const [entries, setEntries] = useState<ExtractedEntry[]>([]);
  const [error, setError] = useState('');
  const controllerRef = useRef<WorkerController | null>(null);

  async function openArchive(file: File) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Choose a .zip file.');
      setStatus('error');
      return;
    }
    setArchiveName(file.name);
    setEntries([]);
    setError('');
    setStatus('extracting');
    const controller = runUnzipWorker(file);
    controllerRef.current = controller;
    try {
      const result = await controller.promise;
      if (result.type !== 'complete') return;
      setEntries(result.entries);
      setStatus('ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not extract this archive.');
      setStatus('error');
    } finally {
      controllerRef.current = null;
    }
  }

  function downloadEntry(entry: ExtractedEntry) {
    downloadBlob(new Blob([entry.bytes as BlobPart]), entry.path.split('/').pop() ?? 'file');
  }

  async function downloadAll() {
    const files = entries.map((entry) => ({ name: entry.path, input: entry.bytes }));
    const blob = await downloadZip(files).blob();
    downloadBlob(blob, `${archiveName.replace(/\.zip$/iu, '')}-extracted.zip`);
  }

  function reset() {
    setStatus('idle');
    setEntries([]);
    setArchiveName('');
    setError('');
  }

  const totalBytes = entries.reduce((total, entry) => total + entry.size, 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e5f5e7,transparent_35%),#f8faf6] px-5 py-10">
      <div className="mx-auto max-w-4xl">
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

        {status === 'idle' && <Dropzone onFile={openArchive} />}

        {status === 'extracting' && (
          <section className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-stone-900">Opening {archiveName}</p>
                <p className="mt-1 text-sm text-stone-500">Validating and extracting safely…</p>
              </div>
              <Button secondary onClick={() => controllerRef.current?.cancel()}>
                Cancel
              </Button>
            </div>
            <Progress />
          </section>
        )}

        {status === 'error' && (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-8">
            <h2 className="font-semibold text-red-950">This archive could not be opened</h2>
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
                <h2 className="mt-1 text-2xl font-bold text-stone-950">
                  {entries.length} {entries.length === 1 ? 'file' : 'files'} ·{' '}
                  {formatBytes(totalBytes)}
                </h2>
              </div>
              <div className="flex gap-2">
                <Button secondary onClick={reset}>
                  Open another
                </Button>
                <Button onClick={() => void downloadAll()}>Download all</Button>
              </div>
            </div>
            <FileTree entries={entries} onDownload={downloadEntry} />
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
