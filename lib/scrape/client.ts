/**
 * Thin adapter over a free-tier scraping service. The rest of the app only
 * ever calls `fetchRenderedHtml(url)` — swapping providers means changing
 * env vars, not touching any callers.
 *
 * Provider selection is per-call and depends on the target host. Defaults:
 *
 *   SCRAPER_PROVIDER          (default: scrapingant)  used for most hosts
 *   SCRAPER_API_KEY           key for SCRAPER_PROVIDER
 *
 * Per-host override for ImmoScout24 (which sits behind DataDome and is too
 * hard for ScrapingAnt's residential proxies):
 *
 *   SCRAPER_PROVIDER_IMMOSCOUT24    e.g. "oxylabs"
 *   SCRAPER_API_KEY_IMMOSCOUT24     key for that provider
 *
 * If the override is unset, the default provider handles ImmoScout24 too.
 *
 * Each provider's request shape lives in its own per-provider call function;
 * Oxylabs in particular uses Basic-Auth POST with a JSON-wrapped response,
 * while the others are plain GET that returns HTML.
 */

export type ScrapeProvider =
  | "scrapingant"
  | "scrapingbee"
  | "scraperapi"
  | "zenrows"
  | "oxylabs";

const PROVIDERS: Record<
  ScrapeProvider,
  (url: string, apiKey: string, signal: AbortSignal | undefined) => Promise<string>
> = {
  scrapingant: callScrapingAnt,
  scrapingbee: callScrapingBee,
  scraperapi: callScraperApi,
  zenrows: callZenRows,
  oxylabs: callOxylabs,
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
  const { provider, apiKey } = resolveProviderAndKey(url, options);
  return PROVIDERS[provider](url, apiKey, options?.signal);
}

function resolveProviderAndKey(
  url: string,
  options?: { provider?: ScrapeProvider; apiKey?: string },
): { provider: ScrapeProvider; apiKey: string } {
  if (options?.provider) {
    const apiKey = options.apiKey ?? process.env.SCRAPER_API_KEY ?? "";
    if (!apiKey) {
      throw new ScrapeError("API key is required", null, options.provider);
    }
    return { provider: options.provider, apiKey };
  }

  // Per-host override (ImmoScout24 routes through a different provider).
  const host = targetHostname(url);
  if (host.endsWith("immobilienscout24.de") && process.env.SCRAPER_PROVIDER_IMMOSCOUT24) {
    const overrideProvider = validateProvider(process.env.SCRAPER_PROVIDER_IMMOSCOUT24);
    const overrideKey = process.env.SCRAPER_API_KEY_IMMOSCOUT24;
    if (!overrideKey) {
      throw new ScrapeError(
        "SCRAPER_PROVIDER_IMMOSCOUT24 is set but SCRAPER_API_KEY_IMMOSCOUT24 is not",
        null,
        overrideProvider,
      );
    }
    return { provider: overrideProvider, apiKey: overrideKey };
  }

  const provider = readProvider();
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) {
    throw new ScrapeError(
      "SCRAPER_API_KEY is not set — sign up to a provider and add it to the project env.",
      null,
      provider,
    );
  }
  return { provider, apiKey };
}

function readProvider(): ScrapeProvider {
  const raw = process.env.SCRAPER_PROVIDER ?? "scrapingant";
  return validateProvider(raw);
}

function validateProvider(raw: string): ScrapeProvider {
  const lower = raw.toLowerCase();
  if (lower in PROVIDERS) return lower as ScrapeProvider;
  throw new ScrapeError(
    `Unknown scraper provider "${raw}" — must be one of: ${Object.keys(PROVIDERS).join(", ")}`,
    null,
    "scrapingant",
  );
}

/**
 * Hosts that sit behind aggressive anti-bot (DataDome / Cloudflare-bot-tier)
 * and only respond to ultra-premium proxies, not standard residential.
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

function assertHtmlOk(html: string, provider: ScrapeProvider, status: number): string {
  if (html.length < 1024) {
    throw new ScrapeError(
      `${provider} returned suspiciously small body (${html.length} bytes) — likely blocked`,
      status,
      provider,
    );
  }
  return html;
}

// ---------- providers ----------------------------------------------------

async function callScrapingAnt(
  targetUrl: string,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const u = new URL("https://api.scrapingant.com/v2/general");
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("browser", "true");
  // Residential proxies (~250 credits/call) for protected hosts, datacenter
  // (~10 credits/call) otherwise. 10k credits/mo free tier covers ~40
  // protected or ~1000 unprotected saves.
  u.searchParams.set(
    "proxy_type",
    needsUltraPremium(targetUrl) ? "residential" : "datacenter",
  );
  u.searchParams.set("proxy_country", "DE");
  u.searchParams.set("x-api-key", apiKey);

  const res = await fetch(u, {
    method: "GET",
    headers: { Accept: "text/html,*/*" },
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ScrapeError(
      `scrapingant returned HTTP ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      "scrapingant",
    );
  }
  return assertHtmlOk(await res.text(), "scrapingant", res.status);
}

async function callScrapingBee(
  targetUrl: string,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const u = new URL("https://app.scrapingbee.com/api/v1/");
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("render_js", "true");
  if (needsUltraPremium(targetUrl)) {
    u.searchParams.set("stealth_proxy", "true");
  } else {
    u.searchParams.set("premium_proxy", "true");
  }
  u.searchParams.set("country_code", "de");
  u.searchParams.set("wait", "3000");

  const res = await fetch(u, { method: "GET", signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ScrapeError(
      `scrapingbee returned HTTP ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      "scrapingbee",
    );
  }
  return assertHtmlOk(await res.text(), "scrapingbee", res.status);
}

async function callScraperApi(
  targetUrl: string,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const u = new URL("https://api.scraperapi.com/");
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("render", "true");
  if (needsUltraPremium(targetUrl)) {
    u.searchParams.set("ultra_premium", "true");
  } else {
    u.searchParams.set("premium", "true");
  }
  u.searchParams.set("country_code", "de");

  const res = await fetch(u, { method: "GET", signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ScrapeError(
      `scraperapi returned HTTP ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      "scraperapi",
    );
  }
  return assertHtmlOk(await res.text(), "scraperapi", res.status);
}

async function callZenRows(
  targetUrl: string,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const u = new URL("https://api.zenrows.com/v1/");
  u.searchParams.set("apikey", apiKey);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("js_render", "true");
  u.searchParams.set("premium_proxy", "true");
  if (needsUltraPremium(targetUrl)) {
    u.searchParams.set("antibot", "true");
  }
  u.searchParams.set("proxy_country", "de");

  const res = await fetch(u, { method: "GET", signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ScrapeError(
      `zenrows returned HTTP ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      "zenrows",
    );
  }
  return assertHtmlOk(await res.text(), "zenrows", res.status);
}

/**
 * Oxylabs Web Scraper API. Auth is Basic with "username:password", which
 * we expect as a single colon-separated string in `apiKey`. The endpoint
 * is a POST that returns JSON wrapping the rendered HTML in
 * `results[0].content`.
 */
async function callOxylabs(
  targetUrl: string,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const sep = apiKey.indexOf(":");
  if (sep <= 0 || sep === apiKey.length - 1) {
    throw new ScrapeError(
      "oxylabs API key must be in 'username:password' format",
      null,
      "oxylabs",
    );
  }
  const auth = `Basic ${btoa(apiKey)}`;
  const res = await fetch("https://realtime.oxylabs.io/v1/queries", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "universal",
      url: targetUrl,
      render: "html",
      geo_location: "Germany",
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ScrapeError(
      `oxylabs returned HTTP ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      "oxylabs",
    );
  }
  const json = (await res.json()) as {
    results?: Array<{ content?: string; status_code?: number; url?: string }>;
  };
  const first = json.results?.[0];
  if (!first?.content) {
    throw new ScrapeError(
      `oxylabs returned no content: ${JSON.stringify(json).slice(0, 200)}`,
      res.status,
      "oxylabs",
    );
  }
  if (first.status_code && first.status_code >= 400) {
    throw new ScrapeError(
      `oxylabs: target site returned HTTP ${first.status_code}`,
      first.status_code,
      "oxylabs",
    );
  }
  return assertHtmlOk(first.content, "oxylabs", res.status);
}
