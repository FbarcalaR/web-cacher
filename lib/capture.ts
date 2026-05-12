import * as cheerio from "cheerio";
import { put } from "@vercel/blob";
import crypto from "node:crypto";
import path from "node:path";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PAGE_FETCH_TIMEOUT_MS = 15_000;
const ASSET_FETCH_TIMEOUT_MS = 10_000;
const MAX_ASSETS = 60;
const ASSET_CONCURRENCY = 6;

export type CaptureResult = {
  id: string;
  url: string;
  host: string;
  title: string;
  content: string;
  htmlUrl: string;
  assetCount: number;
  failures: number;
};

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function extFor(contentType: string | null, urlPath: string): string {
  const ext = path.extname(urlPath).split("?")[0].toLowerCase();
  if (ext && ext.length <= 6) return ext;
  if (!contentType) return ".bin";
  const ct = contentType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
    "text/css": ".css",
  };
  return map[ct] || ".bin";
}

function firstSrcsetUrl(srcset: string | undefined): string | null {
  if (!srcset) return null;
  const first = srcset.split(",")[0]?.trim();
  if (!first) return null;
  return first.split(/\s+/)[0] || null;
}

function extractText($: cheerio.CheerioAPI): string {
  const $clone = cheerio.load($.html());
  $clone("script, style, noscript, svg, iframe").remove();
  return $clone("body").text().replace(/\s+/g, " ").trim();
}

type AssetEntry = {
  absUrl: string;
  kind: "image" | "css";
  blobUrl?: string;
};

export async function capturePage(rawUrl: string, snapshotId: string): Promise<CaptureResult> {
  const target = new URL(rawUrl);

  const res = await fetchWithTimeout(target.href, PAGE_FETCH_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("html")) {
    throw new Error(`Not an HTML page (content-type: ${ct || "unknown"})`);
  }
  const finalUrl = new URL(res.url);
  const html = await res.text();

  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || finalUrl.hostname;
  const content = extractText($).slice(0, 200_000);

  // Strip scripts — they break offline and may try to contact origin APIs.
  $("script").remove();

  const assets = new Map<string, AssetEntry>();

  const absolutize = (href: string | undefined): string | null => {
    if (!href) return null;
    try {
      return new URL(href, finalUrl).href;
    } catch {
      return null;
    }
  };

  const enqueue = (absUrl: string | null, kind: AssetEntry["kind"]) => {
    if (!absUrl) return;
    if (!absUrl.startsWith("http")) return;
    if (assets.has(absUrl)) return;
    if (assets.size >= MAX_ASSETS) return;
    assets.set(absUrl, { absUrl, kind });
  };

  $("img").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src") || firstSrcsetUrl($el.attr("srcset"));
    const abs = absolutize(src ?? undefined);
    enqueue(abs, "image");
    if (abs) $el.attr("data-abs-src", abs);
    $el.removeAttr("srcset");
    $el.removeAttr("loading");
  });

  $("picture source").each((_, el) => {
    const $el = $(el);
    const src = firstSrcsetUrl($el.attr("srcset")) || $el.attr("src");
    const abs = absolutize(src ?? undefined);
    enqueue(abs, "image");
    if (abs) $el.attr("data-abs-src", abs);
    $el.removeAttr("srcset");
  });

  $('link[rel="stylesheet"]').each((_, el) => {
    const $el = $(el);
    const abs = absolutize($el.attr("href"));
    enqueue(abs, "css");
    if (abs) $el.attr("data-abs-href", abs);
  });

  // Download assets in parallel and upload each to Blob.
  const queue = Array.from(assets.values());
  let cursor = 0;
  let failures = 0;

  const workers = Array.from({ length: ASSET_CONCURRENCY }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= queue.length) return;
      const entry = queue[idx];
      try {
        const r = await fetchWithTimeout(entry.absUrl, ASSET_FETCH_TIMEOUT_MS, {
          headers: { Referer: finalUrl.href },
        });
        if (!r.ok) {
          failures++;
          continue;
        }
        const ab = await r.arrayBuffer();
        const hash = crypto.createHash("sha1").update(entry.absUrl).digest("hex").slice(0, 16);
        const ext = extFor(r.headers.get("content-type"), new URL(entry.absUrl).pathname);
        const blob = await put(
          `snapshots/${snapshotId}/assets/${hash}${ext}`,
          Buffer.from(ab),
          {
            access: "public",
            addRandomSuffix: false,
            contentType: r.headers.get("content-type") || undefined,
          },
        );
        entry.blobUrl = blob.url;
      } catch {
        failures++;
      }
    }
  });
  await Promise.all(workers);

  // Rewrite to Blob URLs.
  const blobFor = (abs: string | undefined): string | null => {
    if (!abs) return null;
    return assets.get(abs)?.blobUrl ?? null;
  };

  $("img").each((_, el) => {
    const $el = $(el);
    const url = blobFor($el.attr("data-abs-src"));
    if (url) $el.attr("src", url);
    $el.removeAttr("data-abs-src");
  });
  $("picture source").each((_, el) => {
    const $el = $(el);
    const url = blobFor($el.attr("data-abs-src"));
    if (url) $el.attr("srcset", url);
    $el.removeAttr("data-abs-src");
  });
  $('link[rel="stylesheet"]').each((_, el) => {
    const $el = $(el);
    const url = blobFor($el.attr("data-abs-href"));
    if (url) $el.attr("href", url);
    $el.removeAttr("data-abs-href");
  });

  // Anchors absolute so they still work from a snapshot URL.
  $("a[href]").each((_, el) => {
    const $el = $(el);
    const abs = absolutize($el.attr("href"));
    if (abs) {
      $el.attr("href", abs);
      $el.attr("target", "_blank");
      $el.attr("rel", "noopener noreferrer");
    }
  });

  // Fallback <base> for any resources we didn't capture (fonts etc).
  if ($("head base").length === 0) {
    $("head").prepend(`<base href="${finalUrl.origin}/">`);
  }

  // Banner so it's obvious this is a cached copy.
  const captureDate = new Date().toISOString().replace("T", " ").slice(0, 16);
  $("body").prepend(
    `<div style="position:sticky;top:0;z-index:2147483647;background:#1f2937;color:#fff;padding:8px 12px;font:13px system-ui,sans-serif;border-bottom:1px solid #111;">
       Cached on ${captureDate} from <a style="color:#93c5fd" href="${finalUrl.href}" target="_blank" rel="noopener noreferrer">${finalUrl.href}</a>
       &nbsp;·&nbsp; <a style="color:#93c5fd" href="/library">All snapshots</a>
     </div>`,
  );

  const finalHtml = $.html();
  const htmlBlob = await put(
    `snapshots/${snapshotId}/index.html`,
    finalHtml,
    {
      access: "public",
      addRandomSuffix: false,
      contentType: "text/html; charset=utf-8",
    },
  );

  const downloadedCount = queue.filter((a) => a.blobUrl).length;

  return {
    id: snapshotId,
    url: finalUrl.href,
    host: finalUrl.hostname,
    title,
    content,
    htmlUrl: htmlBlob.url,
    assetCount: downloadedCount,
    failures,
  };
}
