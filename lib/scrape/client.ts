/**
 * Thin adapter over a free-tier scraping service. The whole rest of the app
 * only ever calls `fetchRenderedHtml(url)` — swapping providers means
 * changing two env vars, not touching any callers.
 *
 * Provider choice is set via `SCRAPER_PROVIDER` (default: scrapingant).
 * API key is read from `SCRAPER_API_KEY`.
 *
 * All providers are instructed to:
 *   - run JavaScript on the page (the sites' bot screens are JS-gated)
 *   - use a residential/premium proxy in Germany (German listings, German IPs
 *     get past the geo / fingerprint checks)
 *   - return the final HTML after JS has run
 */

export type ScrapeProvider = "scrapingant" | "scrapingbee" | "scraperapi" | "zenrows";

const PROVIDER_DEFAULTS: Record<ScrapeProvider, (url: string, apiKey: string) => string> = {
  scrapingant: scrapingAntUrl,
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
  const raw = (process.env.SCRAPER_PROVIDER ?? "scrapingant").toLowerCase();
  if (raw in PROVIDER_DEFAULTS) return raw as ScrapeProvider;
  throw new ScrapeError(
    `Unknown SCRAPER_PROVIDER "${raw}" — must be one of: ${Object.keys(PROVIDER_DEFAULTS).join(", ")}`,
    null,
    "scrapingant",
  );
}

/**
 * Hosts that sit behind aggressive anti-bot (DataDome / Cloudflare-bot-tier)
 * and only respond to ultra-premium proxies, not standard residential.
 * ImmoScout24 confirmed via a 500 response from ScraperAPI saying as much.
 */
const ULTRA_PREMIUM_HOSTS = new Set([
  "www.immobilienscout24.de",
  "immobilienscout24.de",
  "www.immowelt.de",
  "immowelt.de",
]);

function targetHostname(targetUrl: string): string {
  try {
    return new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function needsUltraPremium(targetUrl: string): boolean {
  return ULTRA_PREMIUM_HOSTS.has(targetHostname(targetUrl));
}

function scrapingAntUrl(targetUrl: string, apiKey: string): string {
  const u = new URL("https://api.scrapingant.com/v2/general");
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("browser", "true");
  // Residential proxies (~250 credits/call) are needed for DataDome-protected
  // hosts. Datacenter proxies (~10 credits/call) are fine for everything
  // else. The recurring 10k credits/mo free tier covers ~40 protected saves
  // or ~1000 unprotected saves per month.
  u.searchParams.set(
    "proxy_type",
    needsUltraPremium(targetUrl) ? "residential" : "datacenter",
  );
  u.searchParams.set("proxy_country", "DE");
  u.searchParams.set("x-api-key", apiKey);
  return u.toString();
}

function scrapingBeeUrl(targetUrl: string, apiKey: string): string {
  const u = new URL("https://app.scrapingbee.com/api/v1/");
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("render_js", "true");
  // stealth_proxy is ScrapingBee's equivalent of "ultra" — required for
  // DataDome / Cloudflare-bot-tier sites. Costs ~75 credits/call; cheaper
  // standard premium_proxy=true (~25 credits) is fine for everything else.
  if (needsUltraPremium(targetUrl)) {
    u.searchParams.set("stealth_proxy", "true");
  } else {
    u.searchParams.set("premium_proxy", "true");
  }
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
  // premium=true (~10 credits) is fine for most sites; ultra_premium=true
  // (~30 credits) is required for DataDome-protected ones like
  // ImmoScout24. Setting only one — ScraperAPI rejects requests that set
  // both.
  if (needsUltraPremium(targetUrl)) {
    u.searchParams.set("ultra_premium", "true");
  } else {
    u.searchParams.set("premium", "true");
  }
  u.searchParams.set("country_code", "de");
  return u.toString();
}

function zenrowsUrl(targetUrl: string, apiKey: string): string {
  const u = new URL("https://api.zenrows.com/v1/");
  u.searchParams.set("apikey", apiKey);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("js_render", "true");
  u.searchParams.set("premium_proxy", "true");
  // ZenRows uses antibot=true for DataDome-class screens.
  if (needsUltraPremium(targetUrl)) {
    u.searchParams.set("antibot", "true");
  }
  u.searchParams.set("proxy_country", "de");
  return u.toString();
}
