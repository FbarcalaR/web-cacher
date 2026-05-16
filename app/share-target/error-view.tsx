import Link from "next/link";

export function ShareTargetError({ message }: { message: string }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">Couldn&apos;t save</h1>
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
      <Link
        href="/"
        className="rounded-full border border-border px-4 py-2 text-sm font-medium"
      >
        Back to list
      </Link>
    </section>
  );
}
