/**
 * Phase 3 ticket #3.1: evaluate scraping services.
 *
 * Usage:
 *   SCRAPER_API_KEY=<key> tsx scripts/scrape-smoke.ts <provider> [is24-url] [immowelt-url]
 *
 * Hits one live ImmoScout24 URL and one live Immowelt URL through the given
 * provider and reports whether the rendered HTML still contains the structured
 * blobs our parsers depend on:
 *   - `keyValues = {` for ImmoScout24
 *   - `__UFRN_LIFECYCLE_SERVERREQUEST__` for Immowelt
 * For each it also runs `parseAd` and prints title / price / size / room
 * count / photo count, so you can eyeball the result.
 *
 * The choice for SCRAPER_PROVIDER is whichever provider passes both sites
 * and gives the smallest credit consumption per request.
 */

import { parseAd } from "@/lib/parsers";
import { type ScrapeProvider, fetchRenderedHtml } from "@/lib/scrape/client";

const DEFAULT_URLS = {
  immoscout24: "https://www.immobilienscout24.de/expose/166738062",
  immowelt: "https://www.immowelt.de/expose/26I3AFZ5TPN9",
};

const SIGNALS = {
  immoscout24: ["keyValues = {", "IS24.expose"],
  immowelt: ["__UFRN_LIFECYCLE_SERVERREQUEST__"],
} as const;

async function check(label: keyof typeof DEFAULT_URLS, url: string, provider: ScrapeProvider) {
  console.log(`\n--- ${label} (${provider}) ---`);
  console.log(`  ${url}`);
  const t0 = Date.now();
  let html: string;
  try {
    html = await fetchRenderedHtml(url, { provider });
  } catch (err) {
    console.log(`  ✖ fetch failed: ${(err as Error).message}`);
    return;
  }
  const ms = Date.now() - t0;
  console.log(`  ✓ fetched ${html.length.toLocaleString()} bytes in ${ms} ms`);

  const expected = SIGNALS[label];
  for (const needle of expected) {
    const ok = html.includes(needle);
    console.log(`  ${ok ? "✓" : "✖"} signal "${needle}" ${ok ? "present" : "MISSING"}`);
  }

  try {
    const parsed = parseAd(url, html);
    console.log(`  ✓ parsed: ${parsed.title}`);
    console.log(
      `      price=${parsed.priceColdCents}c size=${parsed.sizeSqm}m² rooms=${parsed.rooms} photos=${parsed.photos.length}`,
    );
  } catch (err) {
    console.log(`  ✖ parse failed: ${(err as Error).message}`);
  }
}

async function main() {
  const [providerArg, is24Url, immoweltUrl] = process.argv.slice(2);
  if (!providerArg) {
    console.error(
      "Usage: tsx scripts/scrape-smoke.ts <scrapingbee|scraperapi|zenrows> [is24-url] [immowelt-url]",
    );
    process.exit(2);
  }
  if (!process.env.SCRAPER_API_KEY) {
    console.error("SCRAPER_API_KEY is not set");
    process.exit(2);
  }
  const provider = providerArg as ScrapeProvider;
  await check("immoscout24", is24Url ?? DEFAULT_URLS.immoscout24, provider);
  await check("immowelt", immoweltUrl ?? DEFAULT_URLS.immowelt, provider);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
