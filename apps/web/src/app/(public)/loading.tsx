export default function PublicLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className="flex min-h-[60dvh] items-center justify-center"
    >
      <div className="size-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
