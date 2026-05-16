import Link from "next/link";

import { InstallPrompt } from "@/components/install-prompt";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
        <div
          className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <Link href="/" className="text-base font-semibold tracking-tight">
            web-cacher
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/help"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground"
            >
              Help
            </Link>
            <Link
              href="/add"
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-background"
            >
              Add
            </Link>
          </nav>
        </div>
      </header>
      <main
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
      <InstallPrompt />
    </div>
  );
}
