import { ShareTargetClient } from "./client";

const SUPPORTED_HOSTS = [
  "www.immobilienscout24.de",
  "immobilienscout24.de",
  "www.immowelt.de",
  "immowelt.de",
];

/**
 * Web Share Target endpoint. Chrome on Android delivers a GET here when the
 * user picks web-cacher from the system share sheet. The URL may land in the
 * `url` query param (manifest mapping), or — if the sharing app didn't
 * advertise its content as a URL — embedded in the `text` param. Try both.
 */
export default async function ShareTargetPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string; title?: string }>;
}) {
  const params = await searchParams;
  const candidate = pickUrl(params.url, params.text);
  return <ShareTargetClient url={candidate} />;
}

function pickUrl(...candidates: Array<string | undefined>): string | null {
  for (const raw of candidates) {
    if (!raw) continue;
    // `text` from another app may contain extra words around the URL.
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
