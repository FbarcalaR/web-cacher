"use client";

import { useRef, useTransition } from "react";

import { deleteAd } from "@/app/(app)/ad/[id]/actions";

export function DeleteAdButton({ adId }: { adId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-red-700 dark:text-red-400"
      >
        Delete ad
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(90vw,360px)] rounded-2xl border border-border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <h2 className="text-base font-semibold">Delete this ad?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The cached photos will be permanently removed. The source ad on
          the listing site is untouched.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={pending}
            className="rounded-full px-3 py-1.5 text-sm text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(() => {
                deleteAd(adId).catch(() => {
                  // ignored — the action redirects on success and errors
                  // are surfaced via Next's default error boundary
                });
              });
            }}
            className="rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </dialog>
    </>
  );
}
