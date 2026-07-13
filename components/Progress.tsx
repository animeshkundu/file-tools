type ProgressProps = {
  label?: string;
  value?: number;
};

export function Progress({ label = 'Extracting archive', value }: ProgressProps) {
  const isDeterminate = typeof value === 'number' && Number.isFinite(value);
  let clampedValue: number | undefined;
  if (isDeterminate) clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-emerald-100"
      role="progressbar"
      aria-label={label}
      aria-valuemin={isDeterminate ? 0 : undefined}
      aria-valuemax={isDeterminate ? 100 : undefined}
      aria-valuenow={clampedValue}
    >
      <div
        className={`h-full rounded-full bg-emerald-600 ${
          isDeterminate
            ? 'transition-[width] motion-reduce:transition-none'
            : 'w-1/3 motion-safe:animate-pulse motion-reduce:animate-none'
        }`}
        style={isDeterminate ? { width: `${clampedValue}%` } : undefined}
      />
    </div>
  );
}
