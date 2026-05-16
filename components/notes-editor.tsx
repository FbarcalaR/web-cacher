"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { updateAdNotes } from "@/app/(app)/ad/[id]/actions";

const DEBOUNCE_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

export function NotesEditor({ adId, initial }: { adId: string; initial: string | null }) {
  const initialValue = initial ?? "";
  const [value, setValue] = useState(initialValue);
  const [save, setSave] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const lastSaved = useRef(initialValue);

  useEffect(() => {
    if (value === lastSaved.current) return;
    const handle = setTimeout(() => {
      const snapshot = value;
      setSave("saving");
      startTransition(() => {
        updateAdNotes(adId, snapshot).then(
          () => {
            lastSaved.current = snapshot;
            setSave("saved");
          },
          () => setSave("error"),
        );
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value, adId]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Notes</h2>
        <span
          className={`text-xs ${save === "error" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
          aria-live="polite"
        >
          {save === "saving"
            ? "Saving…"
            : save === "saved"
              ? "Saved"
              : save === "error"
                ? "Save failed"
                : ""}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What did you message them? Did they reply?"
        rows={4}
        className="min-h-24 resize-y rounded-md border border-border bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground"
      />
    </div>
  );
}
