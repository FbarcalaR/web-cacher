import { Suspense } from "react";

import { ShareTargetError } from "./error-view";
import { ShareTargetSpinner } from "./spinner";
import { ShareTargetWorker } from "./worker";

const SUPPORTED_HOSTS = [
  "www.immobilienscout24.de",
  "immobilienscout24.de",
  "www.immowelt.de",
  "immowelt.de",
];

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Web Share Target endpoint. Chrome on Android delivers a GET here when the
 * user picks web-cacher from the system share sheet. The URL may land in the
 * `url` query param (manifest mapping) or — for apps that share plain text
 * containing a URL — embedded in `text`. We try both, pick the first that
 * resolves to a supported host, then hand it to a server-side worker
 * component. The worker awaits `ingestAd(url)` and `redirect()`s on success.
 * Suspense streams the spinner while the worker runs, so the user sees
 * progress without any client-side fetch round-trip.
 */
export default async function ShareTargetPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string; title?: string }>;
}) {
  const params = await searchParams;
  const url = pickUrl(params.url, params.text);

  if (!url) {
    return (
      <ShareTargetError message="What you shared doesn't look like an ImmoScout24 or Immowelt URL." />
    );
  }

  return (
    <Suspense fallback={<ShareTargetSpinner url={url} />}>
      <ShareTargetWorker url={url} />
    </Suspense>
  );
}

function pickUrl(...candidates: Array<string | undefined>): string | null {
  for (const raw of candidates) {
    if (!raw) continue;
    const match = raw.match(/https?:\/\/[^\s]+/);
    const value = match?.[0] ?? raw.trim();
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      if (!SUPPORTED_HOSTS.includes(u.hostname.toLowerCase())) continue;
      return u.toString();
    } catch {
      // not a URL, try next candidate
    }
  }
  return null;
}
