"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { type AddAdState, addAdAction } from "@/app/(app)/add/actions";

const INITIAL: AddAdState = { error: null, url: "" };

/**
 * Auto-submitting wrapper around the same Server Action `/add` uses. The
 * user shares a URL → /share-target?url=… → server picks the URL → this
 * component mounts → form auto-submits → addAdAction calls ingestAd() →
 * redirects to /ad/<id> on success. Identical execution path to /add, so
 * any flakiness specific to the previous client-side fetch -> API Route
 * round-trip is gone.
 */
export function ShareTargetClient({ url }: { url: string | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);
  const [state, formAction] = useActionState(addAdAction, INITIAL);

  useEffect(() => {
    if (!url || submittedRef.current) return;
    submittedRef.current = true;
    formRef.current?.requestSubmit();
  }, [url]);

  if (!url) {
    return (
      <ErrorView message="What you shared doesn't look like an ImmoScout24 or Immowelt URL." />
    );
  }
  if (state.error) {
    return <ErrorView message={state.error} />;
  }
  return (
    <>
      <form ref={formRef} action={formAction} className="sr-only">
        <input type="hidden" name="url" value={url} />
        <button type="submit">Save</button>
      </form>
      <Saving url={url} />
    </>
  );
}

function Saving({ url }: { url: string }) {
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

function ErrorView({ message }: { message: string }) {
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
