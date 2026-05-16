/**
 * Thin adapter over a free-tier scraping service. The whole rest of the app
 * only ever calls `fetchRenderedHtml(url)` — swapping providers means
 * changing two env vars, not touching any callers.
 *
 * Provider choice is set via `SCRAPER_PROVIDER` (default: scrapingbee).
 * API key is read from `SCRAPER_API_KEY`.
 *
 * All providers are instructed to:
 *   - run JavaScript on the page (the sites' bot screens are JS-gated)
 *   - use a residential/premium proxy in Germany (German listings, German IPs
 *     get past the geo / fingerprint checks)
 *   - return the final HTML after JS has run
 */

export type ScrapeProvider = "scrapingbee" | "scraperapi" | "zenrows";

const PROVIDER_DEFAULTS: Record<ScrapeProvider, (url: string, apiKey: string) => string> = {
  scrapingbee: scrapingBeeUrl,
  scraperapi: scraperApiUrl,
  zenrows: zenrowsUrl,
};

export class ScrapeError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly provider: ScrapeProvider,
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

export async function fetchRenderedHtml(
  url: string,
  options?: { provider?: ScrapeProvider; apiKey?: string; signal?: AbortSignal },
): Promise<string> {
  const provider = options?.provider ?? readProvider();
  const apiKey = options?.apiKey ?? process.env.SCRAPER_API_KEY;
  if (!apiKey) {
    throw new ScrapeError(
      "SCRAPER_API_KEY is not set — sign up to a provider and add it to the project env.",
      null,
      provider,
    );
  }
  const requestUrl = PROVIDER_DEFAULTS[provider](url, apiKey);
  const res = await fetch(requestUrl, {
    method: "GET",
    headers: { Accept: "text/html,*/*" },
    signal: options?.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ScrapeError(
      `${provider} returned HTTP ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      provider,
    );
  }
  const html = await res.text();
  if (html.length < 1024) {
    throw new ScrapeError(
      `${provider} returned suspiciously small body (${html.length} bytes) — likely blocked`,
      res.status,
      provider,
    );
  }
  return html;
}

function readProvider(): ScrapeProvider {
  const raw = (process.env.SCRAPER_PROVIDER ?? "scrapingbee").toLowerCase();
  if (raw in PROVIDER_DEFAULTS) return raw as ScrapeProvider;
  throw new ScrapeError(
    `Unknown SCRAPER_PROVIDER "${raw}" — must be one of: ${Object.keys(PROVIDER_DEFAULTS).join(", ")}`,
    null,
    "scrapingbee",
  );
}

function scrapingBeeUrl(targetUrl: string, apiKey: string): string {
  const u = new URL("https://app.scrapingbee.com/api/v1/");
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("render_js", "true");
  u.searchParams.set("premium_proxy", "true");
  u.searchParams.set("country_code", "de");
  // Wait long enough for the hydration script to set the global state.
  u.searchParams.set("wait", "3000");
  return u.toString();
}

function scraperApiUrl(targetUrl: string, apiKey: string): string {
  const u = new URL("https://api.scraperapi.com/");
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("render", "true");
  u.searchParams.set("premium", "true");
  u.searchParams.set("country_code", "de");
  return u.toString();
}

function zenrowsUrl(targetUrl: string, apiKey: string): string {
  const u = new URL("https://api.zenrows.com/v1/");
  u.searchParams.set("apikey", apiKey);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("js_render", "true");
  u.searchParams.set("premium_proxy", "true");
  u.searchParams.set("proxy_country", "de");
  return u.toString();
}
