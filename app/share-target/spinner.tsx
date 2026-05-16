export function ShareTargetSpinner({ url }: { url: string }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <span
        aria-hidden
        className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-accent"
      />
      <p className="text-sm font-medium">Saving ad…</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Fetching, parsing, and caching photos. This can take 10–15 seconds.
      </p>
      <p className="max-w-xs break-all text-xs text-muted-foreground">{url}</p>
    </section>
  );
}
