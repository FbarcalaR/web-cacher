import { parse as parseHtml } from "node-html-parser";

import {
  parseEuroToCents,
  parseNumericString,
  sliceBracedExpression,
} from "./extract";
import { type ParsedAd, type ParsedPhoto } from "./types";

/**
 * ImmoScout24 (immobilienscout24.de). Three signal sources:
 *
 * 1. `keyValues = {...}` — a strict-JSON blob in a `<script>` tag with
 *    every `obj_*` field IS24 uses for analytics. Source of truth for
 *    prices, size, rooms, zip, district, feature flags.
 * 2. `IS24.expose = {... galleryData: {"images":[...]} ...}` — JS object
 *    literal where `galleryData` itself is a JSON-encoded gallery payload.
 *    Source of truth for photos.
 * 3. The DOM (extracted with node-html-parser):
 *    - `<pre class="is24qa-objektbeschreibung text-content ...">` etc. for
 *      the free-text sections.
 *    - `<div class="is24qa-kaution-o-genossenschaftsanteile">` for deposit,
 *      which is often free text ("3 Netto-Kaltmieten") that may not be
 *      reducible to cents.
 * 4. JSON-LD as a fallback for `title` (RealEstateListing.name).
 */

type KeyValues = Record<string, string>;

interface ExposeGallery {
  images?: Array<{
    id?: string;
    caption?: string | null;
    fullSizePictureUrl?: string;
    galleryPictureUrl?: string;
    thumbnailUrl?: string;
    type?: string;
  }>;
}

type JsonLdNode = {
  "@type"?: string | string[];
  "@graph"?: JsonLdNode[];
  name?: string;
  description?: string;
};

const SCOUT_ID_RE = /\/expose\/(\d+)/;

export function parseImmoScout24(url: string, html: string): ParsedAd {
  const keyValues = extractKeyValues(html);
  const gallery = extractGalleryData(html);
  const jsonLd = extractJsonLd(html);
  const dom = parseHtml(html);

  if (!keyValues) {
    throw new Error(
      `ImmoScout24: could not find keyValues blob in ${url} (page may have been bot-blocked)`,
    );
  }

  const sourceId = keyValues.obj_scoutId ?? SCOUT_ID_RE.exec(url)?.[1] ?? "";
  if (!sourceId) {
    throw new Error(`ImmoScout24: could not determine source id from ${url}`);
  }

  const title = pickTitle(jsonLd) ?? pickDomTitle(dom) ?? "(untitled)";
  const description = buildDescription(dom);
  const features = buildFeatures(keyValues);
  const photos = buildPhotos(gallery);
  const depositCents = extractDepositCents(dom);

  return {
    source: "immoscout24",
    sourceId,
    sourceUrl: canonicalUrl(url, sourceId),
    title,
    descriptionHtml: description,
    priceColdCents: parseEuroToCents(keyValues?.obj_baseRent),
    priceWarmCents: parseEuroToCents(keyValues?.obj_totalRent),
    depositCents,
    sizeSqm: parseNumericString(keyValues?.obj_livingSpace),
    rooms: parseNumericString(keyValues?.obj_noRooms),
    addressStreet: streetOrNull(keyValues),
    addressZip: nonEmpty(keyValues?.obj_zipCode),
    addressCity: nonEmpty(keyValues?.obj_regio2)?.replace(/_/g, " ") ?? null,
    features,
    photos,
    rawPayload: {
      keyValues: keyValues ?? null,
      gallery: gallery ?? null,
      jsonLd: jsonLd ?? null,
    },
  };
}

// ---------- extractors --------------------------------------------------

function extractKeyValues(html: string): KeyValues | null {
  const idx = html.indexOf("keyValues = {");
  if (idx < 0) return null;
  const braceAt = html.indexOf("{", idx);
  const slice = sliceBracedExpression(html, braceAt);
  if (!slice) return null;
  try {
    const parsed = JSON.parse(slice) as Record<string, unknown>;
    const out: KeyValues = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

function extractGalleryData(html: string): ExposeGallery | null {
  const idx = html.indexOf("galleryData: {");
  if (idx < 0) return null;
  const braceAt = html.indexOf("{", idx);
  const slice = sliceBracedExpression(html, braceAt);
  if (!slice) return null;
  try {
    return JSON.parse(slice) as ExposeGallery;
  } catch {
    return null;
  }
}

function extractJsonLd(html: string): JsonLdNode[] | null {
  const blocks: JsonLdNode[] = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]!) as JsonLdNode | JsonLdNode[];
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // skip malformed
    }
  }
  return blocks.length > 0 ? blocks : null;
}

// ---------- field mappers -----------------------------------------------

function pickTitle(jsonLd: JsonLdNode[] | null): string | null {
  if (!jsonLd) return null;
  for (const node of jsonLd) {
    const found = findRealEstateListing(node);
    if (found?.name) return found.name.trim();
  }
  return null;
}

function findRealEstateListing(node: JsonLdNode): JsonLdNode | null {
  const type = node["@type"];
  if (type === "RealEstateListing" || (Array.isArray(type) && type.includes("RealEstateListing"))) {
    return node;
  }
  if (node["@graph"]) {
    for (const child of node["@graph"]) {
      const found = findRealEstateListing(child);
      if (found) return found;
    }
  }
  return null;
}

function pickDomTitle(dom: ReturnType<typeof parseHtml>): string | null {
  const heading = dom.querySelector('[data-qa="expose-title"]') ?? dom.querySelector("h1");
  const text = heading?.text?.trim();
  return text && text.length > 0 ? text : null;
}

const DESCRIPTION_SECTIONS: Array<{ selector: string; heading: string }> = [
  { selector: "pre.is24qa-objektbeschreibung", heading: "Objektbeschreibung" },
  { selector: "pre.is24qa-lage", heading: "Lage" },
  { selector: "pre.is24qa-ausstattung", heading: "Ausstattung" },
  { selector: "pre.is24qa-sonstiges", heading: "Sonstiges" },
];

function buildDescription(dom: ReturnType<typeof parseHtml>): string {
  const parts: string[] = [];
  for (const { selector, heading } of DESCRIPTION_SECTIONS) {
    const node = dom.querySelector(selector);
    const raw = node?.text;
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    parts.push(`<h2>${heading}</h2>`);
    parts.push(...trimmed.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p.trim())}</p>`));
  }
  return parts.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const FEATURE_FLAGS: Array<{ key: string; label: string }> = [
  { key: "obj_balcony", label: "Balkon" },
  { key: "obj_hasKitchen", label: "Einbauküche" },
  { key: "obj_cellar", label: "Keller" },
  { key: "obj_garden", label: "Garten" },
  { key: "obj_lift", label: "Aufzug" },
  { key: "obj_newlyConst", label: "Neubau" },
  { key: "obj_barrierFree", label: "Barrierefrei" },
  { key: "obj_assistedLiving", label: "Betreutes Wohnen" },
];

function buildFeatures(kv: KeyValues | null): string[] {
  if (!kv) return [];
  const out: string[] = [];
  for (const { key, label } of FEATURE_FLAGS) {
    if (kv[key] === "y") out.push(label);
  }
  const pets = kv.obj_petsAllowed;
  if (pets === "yes") out.push("Haustiere erlaubt");
  else if (pets === "negotiable") out.push("Haustiere nach Absprache");
  return out;
}

function buildPhotos(gallery: ExposeGallery | null): ParsedPhoto[] {
  if (!gallery?.images) return [];
  const out: ParsedPhoto[] = [];
  for (const img of gallery.images) {
    const url = img.fullSizePictureUrl ?? img.galleryPictureUrl ?? img.thumbnailUrl;
    if (!url) continue;
    out.push({
      url,
      caption: img.caption?.trim() || null,
      width: null,
      height: null,
    });
  }
  return out;
}

function extractDepositCents(dom: ReturnType<typeof parseHtml>): number | null {
  const node = dom.querySelector("div.is24qa-kaution-o-genossenschaftsanteile");
  const raw = node?.text?.trim();
  if (!raw) return null;
  if (/^\d/.test(raw)) return parseEuroToCents(raw);
  return null;
}

function streetOrNull(kv: KeyValues | null): string | null {
  if (!kv) return null;
  const street = kv.obj_streetPlain ?? kv.obj_street;
  if (!street || street === "no_information") return null;
  return street;
}

function nonEmpty(v: string | undefined): string | null {
  if (!v) return null;
  if (v === "no_information") return null;
  return v;
}

function canonicalUrl(url: string, sourceId: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/expose/${sourceId}`;
  } catch {
    return `https://www.immobilienscout24.de/expose/${sourceId}`;
  }
}
