import Link from "next/link";

export default function HelpPage() {
  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">How to use web-cacher</h1>
        <p className="text-sm text-muted-foreground">
          Designed for one user, on an Android phone, in Chrome.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">1. Install on your phone</h2>
        <ol className="ml-5 flex list-decimal flex-col gap-1 text-sm">
          <li>Open this site in Chrome on Android.</li>
          <li>Log in.</li>
          <li>
            Either tap the &ldquo;Install app&rdquo; prompt at the top of the
            screen, or open the Chrome menu (⋮) → <em>Install app</em>.
          </li>
          <li>web-cacher now lives on your home screen.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">2. Save an ad</h2>
        <ol className="ml-5 flex list-decimal flex-col gap-1 text-sm">
          <li>Open any ImmoScout24 or Immowelt expose in Chrome.</li>
          <li>Tap the Chrome share button.</li>
          <li>
            Pick <strong>web-cacher</strong> from the share sheet (it appears
            once the app is installed).
          </li>
          <li>
            You&apos;ll see a &ldquo;Saving…&rdquo; screen for ~10 seconds while
            the page is fetched, parsed, and the photos are cached. Then the
            saved ad opens.
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">3. Browse</h2>
        <p className="text-sm text-muted-foreground">
          The home screen (<Link href="/" className="underline">/</Link>) lists every
          saved ad, newest first. Tap a card to open the full version with
          photos, full description, and a Google Maps link.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Desktop fallback</h2>
        <p className="text-sm text-muted-foreground">
          If you only have a laptop, the same flow works: open{" "}
          <Link href="/add" className="underline">/add</Link>, paste the URL, hit
          Save. The Android share sheet is just a shortcut around that.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">iOS?</h2>
        <p className="text-sm text-muted-foreground">
          Not yet — Web Share Target isn&apos;t implemented in Safari. iOS
          support arrives in Phase 6 as an iOS Shortcut that POSTs to{" "}
          <code>/api/ads/ingest</code>.
        </p>
      </section>
    </article>
  );
}
