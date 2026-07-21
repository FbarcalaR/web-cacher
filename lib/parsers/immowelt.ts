import { parse as parseHtml } from "node-html-parser";

import { parseEuroToCents, parseNumericString } from "./extract";
import { type ParsedAd, type ParsedPhoto } from "./types";

/**
 * Immowelt (immowelt.de) — DOM-based parser.
 *
 * Immowelt used to inline the whole listing state under
 *   window["__UFRN_LIFECYCLE_SERVERREQUEST__"] = JSON.parse("<escaped JSON>")
 * which made parsing trivial. As of mid-2026 they've dropped every inline
 * script and render the page purely from the DOM, so we scrape the same
 * `data-testid="cdp-*"` anchors the site itself uses:
 *
 *   cdp-hardfacts-title             — heading like "Wohnung zur Miete"
 *   cdp-hardfacts-keyfacts          — "3 Zimmer • 76,9 m² • 5. Geschoss • …"
 *   cdp-price                       — Warmmiete / Kaltmiete / Nebenkosten / Kaution
 *   cdp-location-address            — "Schwabing-West, München (80797)"
 *   cdp-main-description-…-text     — main description body (HTML with <br>)
 *   cdp-location-description-…-text — location description body
 *   cdp-additional-description-…-text — extras
 *   cdp-features                    — feature <li> list
 *   cdp-classified-keys             — "Online-ID : 2685SVQAS9FH ..."
 *
 * Images: Immowelt now lazy-loads the gallery via a client-side fetch AFTER
 * the initial render. What survives in the pre-hydration HTML is typically
 * the OG cover + the first 1–2 gallery thumbnails. We collect all
 * <img src="…mms.immowelt.de…"> URLs, plus the og:image, and dedupe. Better
 * than nothing; a full gallery would require driving a browser session.
 */

export function parseImmowelt(url: string, html: string): ParsedAd {
  const dom = parseHtml(html);

  // Sanity check: the page must include at least one of the DOM anchors we
  // read text from. If none are present the scraper returned junk (bot
  // challenge, empty body, unknown template) — fail loud rather than
  // silently saving an ad with null fields.
  const hasAnchor =
    dom.querySelector('[data-testid="cdp-price"]') ||
    dom.querySelector('[data-testid="cdp-hardfacts-keyfacts"]') ||
    dom.querySelector('[data-testid="cdp-location-address"]');
  if (!hasAnchor) {
    throw new Error(
      `Immowelt: no cdp-* anchors in ${url} (page may have been bot-blocked or the template changed)`,
    );
  }

  const sourceId = extractSourceId(dom, url);
  if (!sourceId) {
    throw new Error(
      `Immowelt: could not determine source id from ${url}`,
    );
  }

  const keyfacts = textOf(dom, '[data-testid="cdp-hardfacts-keyfacts"]');
  const rooms = parseNumericString(
    matchFirst(keyfacts, /(\d+(?:[.,]\d+)?)\s*Zimmer/i),
  );
  const size = parseNumericString(matchFirst(keyfacts, /(\d+(?:[.,]\d+)?)\s*m²/));

  const priceText = normaliseText(
    dom.querySelector('[data-testid="cdp-price"]')?.text ?? "",
  );
  const priceValues = extractPriceLabels(priceText);
  const coldRent = parseEuroToCents(priceValues.get("Kaltmiete") ?? null);
  const warmRent = parseEuroToCents(priceValues.get("Warmmiete") ?? null);
  const deposit = parseEuroToCents(priceValues.get("Kaution") ?? null);

  const addressRaw = textOf(dom, '[data-testid="cdp-location-address"]');
  const address = parseAddress(addressRaw);

  const title = buildTitle(dom, address);
  const descriptionHtml = buildDescription(dom);
  const features = extractFeatures(dom);
  const photos = extractPhotos(dom, html);

  return {
    source: "immowelt",
    sourceId,
    sourceUrl: canonicalUrl(url, sourceId),
    title,
    descriptionHtml,
    priceColdCents: coldRent,
    priceWarmCents: warmRent,
    depositCents: deposit,
    sizeSqm: size,
    rooms,
    addressStreet: address.district,
    addressZip: address.zip,
    addressCity: address.city,
    features,
    photos,
    rawPayload: {
      addressRaw,
      keyfacts,
      priceText: priceText.slice(0, 500),
      onlineId: sourceId,
    },
  };
}

// ---------- id --------------------------------------------------------

const URL_ID_RE = /\/expose\/([A-Za-z0-9-]+)/;
const ONLINE_ID_RE = /Online-ID\s*[:=]\s*([A-Z0-9]{6,})/i;

function extractSourceId(dom: ReturnType<typeof parseHtml>, url: string): string | null {
  const keys = dom.querySelector('[data-testid="cdp-classified-keys"]')?.text ?? "";
  // Strip whitespace and split at Referenznummer — with the text collapsed by
  // node-html-parser the ID would otherwise run straight into "Referenznummer".
  const beforeRef = keys.split(/Referenz/i)[0] ?? keys;
  const online = beforeRef.match(ONLINE_ID_RE)?.[1];
  if (online) return online;
  const fromUrl = URL_ID_RE.exec(url)?.[1];
  return fromUrl ?? null;
}

// ---------- price -----------------------------------------------------

const PRICE_LABELS = [
  "Warmmiete",
  "Kaltmiete",
  "Nebenkosten",
  "Heizkosten",
  "Kaution",
  "Miete pro Stellplatz",
  "Weitere Preisinformationen",
  "Zusätzliche Kosten",
  "Mietkosten",
] as const;

/**
 * The price block is rendered as a flat text stream like
 *   "Warmmiete 2.250 € Kaltmiete 24,71 €/m² 1.900 € Nebenkosten 350 € ..."
 * Take each label's segment, then pick the LAST amount that isn't a
 * "€/m²" per-square-metre rate. That skips Immowelt's per-m² display right
 * before the actual Kaltmiete value.
 */
function extractPriceLabels(text: string): Map<string, string> {
  const labelUnion = PRICE_LABELS.map(escapeRegex).join("|");
  const re = new RegExp(`(${labelUnion})`, "g");
  const boundaries: Array<{ label: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    boundaries.push({ label: m[1]!, start: m.index, end: m.index + m[1]!.length });
  }
  const out = new Map<string, string>();
  for (let i = 0; i < boundaries.length; i++) {
    const { label, end } = boundaries[i]!;
    const nextStart = boundaries[i + 1]?.start ?? text.length;
    const segment = text.slice(end, nextStart);
    const amountRe = /(\d[\d.,]*)\s*€(?!\/)/g;
    let last: string | null = null;
    let am: RegExpExecArray | null;
    while ((am = amountRe.exec(segment)) !== null) last = `${am[1]!} €`;
    if (last && !out.has(label)) out.set(label, last);
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- address ---------------------------------------------------

/**
 * Address text is "<district>, <city> (<zip>)". Sometimes district is
 * missing and it comes as "<city> (<zip>)". Sometimes zip is missing.
 */
function parseAddress(raw: string): {
  district: string | null;
  city: string | null;
  zip: string | null;
} {
  const zipMatch = raw.match(/\((\d{4,5})\)/);
  const zip = zipMatch?.[1] ?? null;
  const withoutZip = zipMatch ? raw.slice(0, zipMatch.index).trim() : raw.trim();
  const cleaned = withoutZip.replace(/,\s*$/, "");
  const parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { district: parts[0]!, city: parts[1]!, zip };
  }
  if (parts.length === 1) {
    return { district: null, city: parts[0]!, zip };
  }
  return { district: null, city: null, zip };
}

// ---------- title -----------------------------------------------------

function buildTitle(
  dom: ReturnType<typeof parseHtml>,
  address: { district: string | null; city: string | null },
): string {
  const heading = dom.querySelector('[data-testid="cdp-hardfacts-title"]')?.text?.trim();
  const location = [address.district, address.city].filter(Boolean).join(", ");
  if (heading && location) return `${heading} — ${location}`;
  if (heading) return heading;
  if (location) return `Wohnung — ${location}`;
  const ogTitle = dom
    .querySelector('meta[property="og:title"]')
    ?.getAttribute("content");
  return ogTitle?.trim() || "Wohnung";
}

// ---------- description -----------------------------------------------

const DESCRIPTION_TARGETS: Array<{ selector: string; heading: string }> = [
  {
    selector: '[data-testid="cdp-main-description-expandable-text"]',
    heading: "Objektbeschreibung",
  },
  {
    selector: '[data-testid="cdp-location-description-expandable-text"]',
    heading: "Lage",
  },
  {
    selector: '[data-testid="cdp-additional-description-expandable-text"]',
    heading: "Weitere Informationen",
  },
];

function buildDescription(dom: ReturnType<typeof parseHtml>): string {
  const parts: string[] = [];
  for (const { selector, heading } of DESCRIPTION_TARGETS) {
    const node = dom.querySelector(selector);
    if (!node) continue;
    const raw = node.innerHTML.trim();
    if (!raw) continue;
    parts.push(`<h2>${escapeHtml(heading)}</h2>`);
    const paragraphs = raw
      .replace(/<\/?b>/g, "")
      .replace(/<\/?i>/g, "")
      .split(/(?:<br\s*\/?>\s*){2,}/i);
    for (const p of paragraphs) {
      const clean = p.replace(/<br\s*\/?>/gi, "\n").trim();
      const stripped = clean.replace(/<[^>]+>/g, "").trim();
      if (!stripped) continue;
      parts.push(`<p>${escapeHtml(stripped).replace(/\n/g, "<br>")}</p>`);
    }
  }
  return parts.join("\n");
}

// ---------- features --------------------------------------------------

function extractFeatures(dom: ReturnType<typeof parseHtml>): string[] {
  const root = dom.querySelector('[data-testid="cdp-features"]');
  if (!root) return [];
  const out: string[] = [];
  for (const li of root.querySelectorAll("li")) {
    const t = li.text.replace(/\s+/g, " ").trim();
    if (!t || t === "Mehr anzeigen" || t === "Weniger anzeigen") continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

// ---------- photos ----------------------------------------------------

/**
 * The gallery lazy-loads after render — only 1–3 photos survive in the
 * pre-hydration HTML. Collect them all, plus the OG cover image, and
 * dedupe by URL. Filters agency-logo images by alt-text heuristic.
 */
function extractPhotos(
  dom: ReturnType<typeof parseHtml>,
  html: string,
): ParsedPhoto[] {
  const out: ParsedPhoto[] = [];
  const seen = new Set<string>();

  const ogImage = dom
    .querySelector('meta[property="og:image"]')
    ?.getAttribute("content");
  if (ogImage && isImmoweltPhoto(ogImage)) {
    seen.add(ogImage);
    out.push({ url: ogImage, caption: null, width: null, height: null });
  }

  for (const img of dom.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (!src || !isImmoweltPhoto(src) || seen.has(src)) continue;
    if (looksLikeLogo(img)) continue;
    seen.add(src);
    out.push({
      url: src,
      caption: img.getAttribute("alt")?.trim() || null,
      width: null,
      height: null,
    });
  }

  const srcsetRe = /srcset="([^"]*https:\/\/mms\.immowelt\.de\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = srcsetRe.exec(html)) !== null) {
    for (const candidate of m[1]!.split(",")) {
      const url = decodeHtmlEntities(candidate.trim().split(/\s+/)[0] ?? "");
      if (!url || !isImmoweltPhoto(url) || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, caption: null, width: null, height: null });
    }
  }

  return out;
}

function isImmoweltPhoto(url: string): boolean {
  return url.startsWith("https://mms.immowelt.de/");
}

function looksLikeLogo(
  img: ReturnType<ReturnType<typeof parseHtml>["querySelectorAll"]>[number],
): boolean {
  const alt = (img.getAttribute("alt") ?? "").toLowerCase();
  // Agency logos on Immowelt usually have the agency name in the alt
  // attribute (e.g. "I´M LIVING Immobilien"). Real gallery photos either
  // have no alt or a generic caption. Best-effort heuristic; a false
  // negative just means we ingest an agency logo alongside real photos.
  return /(immobilien|logo|agentur|makler)/i.test(alt);
}

// ---------- utility ---------------------------------------------------

function normaliseText(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textOf(dom: ReturnType<typeof parseHtml>, selector: string): string {
  return normaliseText(dom.querySelector(selector)?.text ?? "");
}

function matchFirst(text: string, re: RegExp): string | null {
  return re.exec(text)?.[1] ?? null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function canonicalUrl(url: string, sourceId: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/expose/${sourceId}`;
  } catch {
    return `https://www.immowelt.de/expose/${sourceId}`;
  }
}
