"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "wc_install_dismissed";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getDismissedSnapshot(): boolean {
  return window.localStorage.getItem(DISMISS_KEY) === "1";
}

function getServerSnapshot(): boolean {
  return false;
}

export function InstallPrompt() {
  const dismissed = useSyncExternalStore(subscribe, getDismissedSnapshot, getServerSnapshot);
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!event || dismissed) return null;

  return (
    <div
      role="dialog"
      aria-label="Install web-cacher"
      className="fixed inset-x-0 z-20 mx-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-border bg-background p-4 text-sm shadow-lg"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <p className="font-medium">Install web-cacher</p>
      <p className="text-muted-foreground">
        Add to your home screen to save ads straight from Chrome&apos;s share sheet.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "1");
            // Manually fire a storage event so useSyncExternalStore re-reads.
            window.dispatchEvent(new StorageEvent("storage", { key: DISMISS_KEY }));
          }}
          className="rounded-full px-3 py-1.5 text-sm text-muted-foreground"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={async () => {
            await event.prompt();
            setEvent(null);
          }}
          className="rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-background"
        >
          Install
        </button>
      </div>
    </div>
  );
}
