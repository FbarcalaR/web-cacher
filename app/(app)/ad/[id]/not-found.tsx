import Link from "next/link";

export default function AdNotFound() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Ad not found</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        This ad isn&apos;t in the cache. It may have been deleted.
      </p>
      <Link
        href="/"
        className="rounded-full border border-border px-4 py-2 text-sm font-medium"
      >
        Back to list
      </Link>
    </section>
  );
}
