"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Status =
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "done" };

export function ShareTargetClient({ url }: { url: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(
    url
      ? { kind: "saving" }
      : {
          kind: "error",
          message:
            "What you shared doesn't look like an ImmoScout24 or Immowelt URL.",
        },
  );

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/ads/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setStatus({
            kind: "error",
            message: body.error ?? `Save failed (${res.status}).`,
          });
          return;
        }
        const { id } = (await res.json()) as { id: string };
        setStatus({ kind: "done" });
        router.replace(`/ad/${id}`);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStatus({ kind: "error", message: (err as Error).message });
      }
    })();
    return () => controller.abort();
  }, [url, router]);

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      {status.kind === "saving" ? (
        <>
          <Spinner />
          <p className="text-sm font-medium">Saving ad…</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Fetching, parsing, and caching photos. This can take 10–15 seconds.
          </p>
          {url ? (
            <p className="max-w-xs break-all text-xs text-muted-foreground">{url}</p>
          ) : null}
        </>
      ) : null}

      {status.kind === "done" ? (
        <p className="text-sm font-medium">Saved. Redirecting…</p>
      ) : null}

      {status.kind === "error" ? (
        <>
          <h1 className="text-lg font-semibold">Couldn&apos;t save</h1>
          <p className="max-w-xs text-sm text-muted-foreground">{status.message}</p>
          <Link
            href="/"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium"
          >
            Back to list
          </Link>
        </>
      ) : null}
    </section>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-accent"
    />
  );
}
