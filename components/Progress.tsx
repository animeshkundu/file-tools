export function Progress() {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-emerald-100" role="progressbar">
      <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-600" />
    </div>
  );
}
