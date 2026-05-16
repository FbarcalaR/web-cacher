"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { INITIAL_STATE, addAdAction } from "./actions";

const SAVED_TRANSITION_MS = 700;

export function AddAdForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(addAdAction, INITIAL_STATE);

  useEffect(() => {
    if (state.kind !== "saved") return;
    const t = setTimeout(() => router.push(`/ad/${state.id}`), SAVED_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [state, router]);

  if (state.kind === "saved") {
    return (
      <div
        role="status"
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-10 text-center"
      >
        <CheckCircle />
        <p className="text-base font-medium">Saved</p>
        <p className="text-xs text-muted-foreground">Opening the ad…</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Ad URL</span>
        <input
          type="url"
          name="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
          defaultValue={state.url}
          placeholder="https://www.immobilienscout24.de/expose/…"
          className="rounded-md border border-border bg-muted px-3 py-2 text-base placeholder:text-muted-foreground"
        />
      </label>
      {state.kind === "error" ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
    >
      {pending ? "Saving… (this can take 10–15 seconds)" : "Save"}
    </button>
  );
}

function CheckCircle() {
  return (
    <span
      aria-hidden
      className="flex size-10 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-5">
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
