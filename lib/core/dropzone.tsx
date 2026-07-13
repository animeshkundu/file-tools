import { forwardRef, useRef, useState, type DragEvent } from 'react';

type DropzoneProps = {
  disabled?: boolean;
  onFile: (file: File) => void;
};

export const Dropzone = forwardRef<HTMLDivElement, DropzoneProps>(function Dropzone(
  { disabled, onFile },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function accept(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) accept(event.dataTransfer.files);
  }

  return (
    <div
      ref={ref}
      className={`rounded-3xl border-2 border-dashed p-12 text-center transition ${
        dragging ? 'border-emerald-600 bg-emerald-50' : 'border-stone-300 bg-white'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-emerald-500'}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(event) => {
        if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".zip,application/zip"
        disabled={disabled}
        onChange={(event) => accept(event.target.files)}
      />
      <div
        className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-emerald-100 text-2xl text-emerald-800"
        aria-hidden="true"
      >
        ↓
      </div>
      <p className="text-lg font-semibold text-stone-900">Drop a ZIP file here</p>
      <p className="mt-1 text-sm text-stone-500">or click to choose one from your device</p>
    </div>
  );
});
