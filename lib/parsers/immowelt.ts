import { parse as parseHtml } from "node-html-parser";

import {
  buildSectionsHtml,
  decodeHtmlEntities,
  parseEuroToCents,
  parseNumericString,
  sliceStringLiteral,
} from "./extract";
import { type ParsedAd, type ParsedPhoto } from "./types";

/**
 * Immowelt (immowelt.de). Two paths, tried in order:
 *
 * 1. `window["__UFRN_LIFECYCLE_SERVERREQUEST__"] = JSON.parse("…")` — the
 *    complete listing state, JSON escaped once more as a JS string literal.
 *    Immowelt briefly stopped emitting it (hence the DOM parser below), but
 *    it is back and it is strictly better: it carries the *whole* gallery,
 *    the real street/city/district split, the untruncated descriptions and
 *    an unambiguous Online-ID.
 * 2. The DOM `data-testid="cdp-*"` anchors. Only the first 1–3 photos
 *    survive in the pre-hydration markup and the address is collapsed into
 *    one string, so this is a fallback for pages served without the blob.
 *
 * `parseImmowelt` picks path 1 whenever the blob parses and path 2
 * otherwise, then fails loud if neither yields a usable listing — better an
 * error than an ad row full of nulls.
 */

export function parseImmowelt(url: string, html: string): ParsedAd {
  const state = extractServerState(html);
  if (state) return parseFromState(url, state);
  return parseFromDom(url, html);
}

// ---------- path 1: inline server state ---------------------------------

interface ClassifiedPrice {
  value?: { main?: { value?: string; ariaLabel?: string } };
  label?: { main?: string };
}

interface Classified {
  id?: string;
  title?: string;
  domains?: {
    medias?: {
      images?: Array<{ url?: string; description?: string | null }>;
      floorplans?: Array<{ url?: string; description?: string | null }>;
    };
  };
  sections?: {
    location?: {
      address?: {
        street?: string;
        city?: string;
        zipCode?: string;
        district?: string;
      };
    };
    hardFacts?: {
      title?: string;
      facts?: Array<{ type?: string; value?: string; splitValue?: string; label?: string }>;
    };
    price?: {
      base?: { main?: ClassifiedPrice; details?: ClassifiedPrice[] };
      additional?: Array<{ label?: string; text?: string }>;
    };
    key?: { keys?: Array<{ label?: string; value?: string }> };
    features?: {
      preview?: Array<{ value?: string }>;
      details?: { categories?: Array<{ elements?: Array<{ value?: string }> }> } | null;
    };
    energy?: { features?: Array<{ label?: string; value?: string }> };
    mainDescription?: { headline?: string; description?: string };
    areaDescription?: { headline?: string; description?: string };
    extendedInfoDescription?: { headline?: string; description?: string };
  };
}

/**
 * Peel `JSON.parse("<escaped>")` — the argument is a JS string literal whose
 * contents are themselves a JSON document, so it takes two parses.
 */
function extractServerState(html: string): Classified | null {
  const marker = 'window["__UFRN_LIFECYCLE_SERVERREQUEST__"]';
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const parseAt = html.indexOf("JSON.parse(", at);
  if (parseAt < 0) return null;
  const quoteAt = html.indexOf('"', parseAt);
  if (quoteAt < 0) return null;
  const literal = sliceStringLiteral(html, quoteAt);
  if (!literal) return null;
  try {
    const json = JSON.parse(literal) as string;
    const state = JSON.parse(json) as {
      app_cldp?: { data?: { classified?: Classified } };
    };
    return state.app_cldp?.data?.classified ?? null;
  } catch {
    return null;
  }
}

function parseFromState(url: string, c: Classified): ParsedAd {
  const sections = c.sections ?? {};

  const sourceId =
    pickText(findKey(sections.key?.keys, "Online-ID")) ??
    pickText(c.id) ??
    URL_ID_RE.exec(url)?.[1] ??
    null;
  if (!sourceId) {
    throw new Error(`Immowelt: could not determine source id from ${url}`);
  }

  const address = sections.location?.address ?? {};
  const facts = sections.hardFacts?.facts ?? [];
  const price = sections.price ?? {};

  const coldRent = parseEuroToCents(priceValue(price.base?.main));
  const warmRent = parseEuroToCents(
    priceValue(price.base?.details?.find((d) => d.label?.main === "Warmmiete")),
  );
  const deposit = parseEuroToCents(
    pickText(price.additional?.find((a) => a.label === "Kaution")?.text),
  );

  // Fixed headings rather than each section's own `headline`: the main one
  // repeats the ad title verbatim, and the other two are already "Lage" /
  // "Weitere Informationen" on every listing we have seen.
  const descriptionHtml = buildSectionsHtml([
    { heading: "Objektbeschreibung", body: sections.mainDescription?.description },
    { heading: "Lage", body: sections.areaDescription?.description },
    {
      heading: "Weitere Informationen",
      body: sections.extendedInfoDescription?.description,
    },
  ]);

  return {
    source: "immowelt",
    sourceId,
    sourceUrl: canonicalUrl(url, sourceId),
    title: stateTitle(c, address),
    descriptionHtml,
    priceColdCents: coldRent,
    priceWarmCents: warmRent,
    depositCents: deposit,
    sizeSqm: parseNumericString(factValue(facts, "livingSpace")),
    rooms: parseNumericString(factValue(facts, "numberOfRooms")),
    // No district column in the schema; the street line is the closest
    // place for it, and for redacted listings it is all the location we get.
    addressStreet: pickText(address.street) ?? pickText(address.district),
    addressZip: pickText(address.zipCode),
    addressCity: pickText(address.city),
    features: stateFeatures(sections),
    photos: statePhotos(c),
    rawPayload: {
      id: c.id ?? null,
      onlineId: sourceId,
      address,
      hardFacts: sections.hardFacts ?? null,
      price: price.base ?? null,
      priceAdditional: price.additional ?? null,
      keys: sections.key?.keys ?? null,
      energy: sections.energy?.features ?? null,
    },
  };
}

function stateTitle(
  c: Classified,
  address: { street?: string; city?: string; district?: string },
): string {
  // `classified.title` is the raw description's first line on some listings,
  // so the curated headline wins when there is one.
  const headline = pickText(c.sections?.mainDescription?.headline) ?? pickText(oneLine(c.title));
  if (headline) return headline;

  const kind = pickText(c.sections?.hardFacts?.title) ?? "Wohnung";
  const location = [address.district, address.city].filter(Boolean).join(", ");
  return location ? `${kind} — ${location}` : kind;
}

function stateFeatures(sections: NonNullable<Classified["sections"]>): string[] {
  const out: string[] = [];
  const push = (v: string | null) => {
    if (v && !out.includes(v)) out.push(v);
  };

  const categories = sections.features?.details?.categories ?? [];
  for (const category of categories) {
    for (const el of category.elements ?? []) push(pickText(el.value));
  }
  // `details` is null on some listings; `preview` is the shorter mirror of it.
  for (const el of sections.features?.preview ?? []) push(pickText(el.value));

  for (const f of sections.energy?.features ?? []) {
    const label = pickText(f.label);
    const value = pickText(f.value);
    if (label && value) push(`${label}: ${value}`);
  }
  return out;
}

function statePhotos(c: Classified): ParsedPhoto[] {
  const medias = c.domains?.medias;
  const out: ParsedPhoto[] = [];
  const seen = new Set<string>();
  // Gallery first, floor plans after — they read as trailing attachments.
  for (const m of [...(medias?.images ?? []), ...(medias?.floorplans ?? [])]) {
    const url = pickText(m.url);
    if (!url || !isImmoweltPhoto(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      caption: captionOrNull(m.description),
      width: null,
      height: null,
    });
  }
  return out;
}

function priceValue(p: ClassifiedPrice | undefined): string | null {
  // `ariaLabel` is the unformatted number ("1213.99 €"); `value` is the
  // German-formatted one. Either parses, prefer the unambiguous one.
  return pickText(p?.value?.main?.ariaLabel) ?? pickText(p?.value?.main?.value);
}

function factValue(
  facts: Array<{ type?: string; splitValue?: string; value?: string }>,
  type: string,
): string | null {
  const fact = facts.find((f) => f.type === type);
  return pickText(fact?.splitValue) ?? pickText(fact?.value);
}

function findKey(
  keys: Array<{ label?: string; value?: string }> | undefined,
  label: string,
): string | null {
  return pickText(keys?.find((k) => k.label === label)?.value);
}

/**
 * Photo descriptions are the uploader's filename as often as a caption
 * ("IMG_1160(1).jpg", "0 ", "Bild 9"). Those are noise on the ad page.
 */
function captionOrNull(raw: string | null | undefined): string | null {
  const text = pickText(raw);
  if (!text) return null;
  if (/\.(?:jpe?g|png|webp|gif|heic|tiff?)$/i.test(text)) return null;
  if (/^(?:bild\s*)?\d+$/i.test(text)) return null;
  return text.replace(/\s+/g, " ");
}

// ---------- path 2: DOM fallback ----------------------------------------

function parseFromDom(url: string, html: string): ParsedAd {
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
      `Immowelt: no inline listing state and no cdp-* anchors in ${url} ` +
        "(page may have been bot-blocked or the template changed)",
    );
  }

  const sourceId = extractDomSourceId(dom, url);
  if (!sourceId) {
    throw new Error(`Immowelt: could not determine source id from ${url}`);
  }

  const keyfacts = textOf(dom, '[data-testid="cdp-hardfacts-keyfacts"]');
  const rooms = parseNumericString(matchFirst(keyfacts, /(\d+(?:[.,]\d+)?)\s*Zimmer/i));
  const size = parseNumericString(matchFirst(keyfacts, /(\d+(?:[.,]\d+)?)\s*m²/));

  const priceText = normaliseText(dom.querySelector('[data-testid="cdp-price"]')?.text ?? "");
  const priceValues = extractPriceLabels(priceText);
  const coldRent = parseEuroToCents(priceValues.get("Kaltmiete") ?? null);
  const warmRent = parseEuroToCents(priceValues.get("Warmmiete") ?? null);
  const deposit = parseEuroToCents(priceValues.get("Kaution") ?? null);

  const addressRaw = textOf(dom, '[data-testid="cdp-location-address"]');
  const address = parseAddress(addressRaw);

  return {
    source: "immowelt",
    sourceId,
    sourceUrl: canonicalUrl(url, sourceId),
    title: buildDomTitle(dom, address),
    descriptionHtml: buildDomDescription(dom),
    priceColdCents: coldRent,
    priceWarmCents: warmRent,
    depositCents: deposit,
    sizeSqm: size,
    rooms,
    addressStreet: address.district,
    addressZip: address.zip,
    addressCity: address.city,
    features: extractDomFeatures(dom),
    photos: extractDomPhotos(dom, html),
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
// The ID is a fixed-length alphanumeric code. Anchoring the end on a
// non-alphanumeric boundary keeps the following label out of the match when
// node-html-parser has collapsed the two cells into one text run
// ("Online-ID : 26HSIUS5RBPFAngebot …").
const ONLINE_ID_RE = /Online-ID\s*[:=]?\s*([0-9A-Z]{8,16})(?![0-9A-Z])/;

function extractDomSourceId(dom: ReturnType<typeof parseHtml>, url: string): string | null {
  const keys = dom.querySelector('[data-testid="cdp-classified-keys"]')?.text ?? "";
  const beforeRef = keys.split(/Referenz/i)[0] ?? keys;
  const online = beforeRef.match(ONLINE_ID_RE)?.[1];
  if (online) return online;
  return URL_ID_RE.exec(url)?.[1] ?? null;
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
  const parts = cleaned
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { district: parts[0]!, city: parts[1]!, zip };
  }
  if (parts.length === 1) {
    return { district: null, city: parts[0]!, zip };
  }
  return { district: null, city: null, zip };
}

// ---------- title -----------------------------------------------------

function buildDomTitle(
  dom: ReturnType<typeof parseHtml>,
  address: { district: string | null; city: string | null },
): string {
  const heading = dom.querySelector('[data-testid="cdp-hardfacts-title"]')?.text?.trim();
  const location = [address.district, address.city].filter(Boolean).join(", ");
  if (heading && location) return `${heading} — ${location}`;
  if (heading) return heading;
  if (location) return `Wohnung — ${location}`;
  const ogTitle = dom.querySelector('meta[property="og:title"]')?.getAttribute("content");
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

function buildDomDescription(dom: ReturnType<typeof parseHtml>): string {
  return buildSectionsHtml(
    DESCRIPTION_TARGETS.map(({ selector, heading }) => ({
      heading,
      body: dom.querySelector(selector)?.innerHTML ?? null,
    })),
  );
}

// ---------- features --------------------------------------------------

function extractDomFeatures(dom: ReturnType<typeof parseHtml>): string[] {
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
 * Without the state blob the gallery lazy-loads after render, so only 1–3
 * photos survive in the markup. Collect them all, plus the OG cover image,
 * and dedupe by URL. Filters agency-logo images by alt-text heuristic.
 */
function extractDomPhotos(dom: ReturnType<typeof parseHtml>, html: string): ParsedPhoto[] {
  const out: ParsedPhoto[] = [];
  const seen = new Set<string>();

  const ogImage = dom.querySelector('meta[property="og:image"]')?.getAttribute("content");
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
      caption: captionOrNull(img.getAttribute("alt")),
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
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textOf(dom: ReturnType<typeof parseHtml>, selector: string): string {
  return normaliseText(dom.querySelector(selector)?.text ?? "");
}

function matchFirst(text: string, re: RegExp): string | null {
  return re.exec(text)?.[1] ?? null;
}

function oneLine(s: string | undefined): string | null {
  if (!s) return null;
  const first = s.split(/<br\s*\/?>|\n/i)[0] ?? "";
  return pickText(decodeHtmlEntities(first.replace(/<[^>]+>/g, "")));
}

function pickText(v: string | null | undefined): string | null {
  const trimmed = v?.replace(/ /g, " ").trim();
  return trimmed ? trimmed : null;
}

function canonicalUrl(url: string, sourceId: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/expose/${sourceId}`;
  } catch {
    return `https://www.immowelt.de/expose/${sourceId}`;
  }
}
