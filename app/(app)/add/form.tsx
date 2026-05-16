"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { type AddAdState, addAdAction } from "./actions";

const INITIAL: AddAdState = { error: null, url: "" };

export function AddAdForm() {
  const [state, formAction] = useActionState(addAdAction, INITIAL);
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
          onPaste={(e) => {
            // Mobile share menus often paste a sentence like "Check this:
            // https://… (3 rooms, 1500€)". The native <input type=url> then
            // rejects on submit. Extract just the first http(s) URL and
            // drop the rest so the form is happy.
            const pasted = e.clipboardData.getData("text");
            const match = pasted.match(/https?:\/\/[^\s]+/);
            if (match && match[0] !== pasted.trim()) {
              e.preventDefault();
              e.currentTarget.value = match[0];
            }
          }}
          className="rounded-md border border-border bg-muted px-3 py-2 text-base placeholder:text-muted-foreground"
        />
      </label>
      {state.error ? (
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
