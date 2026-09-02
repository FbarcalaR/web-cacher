import { parse as parseHtml } from "node-html-parser";

import {
  buildSectionsHtml,
  parseEuroToCents,
  parseNumericString,
  sliceBracedExpression,
} from "./extract";
import { type ParsedAd, type ParsedPhoto } from "./types";

/**
 * ImmoScout24 (immobilienscout24.de). Signal sources, in the order we trust
 * them:
 *
 * 1. `IS24.ssr = { frontendModel: {…} }` — the server-rendered view model.
 *    Strict JSON, and the only place the free-text description now lives
 *    (`exposeContent.*Description`). Also carries the gallery, the expose
 *    title and the full street address with house number.
 * 2. `keyValues = {...}` — a strict-JSON blob with every `obj_*` field IS24
 *    uses for analytics. Source of truth for prices, size, rooms, zip and
 *    the boolean feature flags.
 * 3. `IS24.expose = {... galleryData: {"images":[...]} ...}` — JS object
 *    literal whose `galleryData` is a JSON-encoded gallery payload. Same
 *    images as (1); kept as the primary photo source because it is the one
 *    that has been stable the longest.
 * 4. The DOM (via node-html-parser):
 *    - `<div class="is24qa-*">` criteria rows for deposit and the extra
 *      facts we surface as features (Etage, Baujahr, Heizungsart, …).
 *    - `<pre class="is24qa-objektbeschreibung">` etc. — the *old* template's
 *      description markup, retained as a fallback for (1).
 * 5. JSON-LD as a last-resort fallback for `title`.
 *
 * Note IS24 also serves `/neubau/…` project pages. Those advertise a whole
 * development (price *ranges*, dozens of units) rather than one flat, so we
 * reject them with an explanatory error instead of storing a meaningless row.
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

interface FrontendModel {
  exposeTitle?: { exposeTitle?: string };
  exposeContent?: {
    objectDescription?: string;
    furnishingDescription?: string;
    locationDescription?: string;
    otherDescription?: string;
  };
  galleryEntry?: ExposeGallery;
  exposeMap?: {
    addressForMap?: {
      street?: string;
      houseNumber?: string;
      streetAndHouseNumber?: string;
      zipCode?: string;
      city?: string;
      quarter?: string;
    };
  };
}

type JsonLdNode = {
  "@type"?: string | string[];
  "@graph"?: JsonLdNode[];
  name?: string;
  description?: string;
};

const SCOUT_ID_RE = /\/expose\/(\d+)/;

export function parseImmoScout24(url: string, html: string): ParsedAd {
  const dom = parseHtml(html);

  assertNotProjectPage(url, dom);

  const keyValues = extractKeyValues(html);
  const frontendModel = extractFrontendModel(html);
  const gallery = extractGalleryData(html) ?? frontendModel?.galleryEntry ?? null;
  const jsonLd = extractJsonLd(html);

  if (!keyValues) {
    throw new Error(
      `ImmoScout24: could not find keyValues blob in ${url} (page may have been bot-blocked)`,
    );
  }

  const sourceId = keyValues.obj_scoutId ?? SCOUT_ID_RE.exec(url)?.[1] ?? "";
  if (!sourceId) {
    throw new Error(`ImmoScout24: could not determine source id from ${url}`);
  }

  const title =
    pickText(frontendModel?.exposeTitle?.exposeTitle) ??
    pickTitle(jsonLd) ??
    pickDomTitle(dom) ??
    "(untitled)";
  const criteria = extractCriteriaRows(dom);
  const description = buildDescription(frontendModel, dom);
  const features = buildFeatures(keyValues, criteria);
  const photos = buildPhotos(gallery);
  const priceColdCents = parseEuroToCents(keyValues.obj_baseRent);
  const depositCents = extractDepositCents(criteria, priceColdCents);

  return {
    source: "immoscout24",
    sourceId,
    sourceUrl: canonicalUrl(url, sourceId),
    title,
    descriptionHtml: description,
    priceColdCents,
    priceWarmCents: parseEuroToCents(keyValues.obj_totalRent),
    depositCents,
    sizeSqm: parseNumericString(keyValues.obj_livingSpace),
    rooms: parseNumericString(keyValues.obj_noRooms),
    addressStreet: streetOrNull(keyValues, frontendModel),
    addressZip: nonEmpty(keyValues.obj_zipCode),
    addressCity: nonEmpty(keyValues.obj_regio2)?.replace(/_/g, " ") ?? null,
    features,
    photos,
    rawPayload: {
      keyValues,
      gallery: gallery ?? null,
      jsonLd: jsonLd ?? null,
      criteria,
      // The whole frontendModel runs to ~60 kB of mostly ad-tech config;
      // keep only the parts we actually read from.
      frontendModel: frontendModel
        ? {
            exposeTitle: frontendModel.exposeTitle ?? null,
            exposeContent: frontendModel.exposeContent ?? null,
            addressForMap: frontendModel.exposeMap?.addressForMap ?? null,
          }
        : null,
    },
  };
}

// ---------- page-shape guard --------------------------------------------

/**
 * `/neubau/<developer>/<project>/<id>.html` pages describe a development,
 * not a flat: the "price" is a range across dozens of units. Ingesting one
 * would produce an ad row whose every number is wrong, so refuse it and
 * point the user at the individual unit exposés the project page links to.
 */
function assertNotProjectPage(url: string, dom: ReturnType<typeof parseHtml>): void {
  const canonical = dom.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
  const isProject = pathOf(url).startsWith("/neubau/") || pathOf(canonical).startsWith("/neubau/");
  if (!isProject) return;
  throw new Error(
    `ImmoScout24: ${url} is a Neubau project page, not a single listing — ` +
      "it advertises a whole development with a price range across many units. " +
      "Open the individual flat on the project page and save its /expose/… link instead.",
  );
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

// ---------- extractors --------------------------------------------------

function extractKeyValues(html: string): KeyValues | null {
  const parsed = parseBracedBlob<Record<string, unknown>>(html, "keyValues = {");
  if (!parsed) return null;
  const out: KeyValues = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function extractGalleryData(html: string): ExposeGallery | null {
  return parseBracedBlob<ExposeGallery>(html, "galleryData: {");
}

function extractFrontendModel(html: string): FrontendModel | null {
  return parseBracedBlob<FrontendModel>(html, "frontendModel: {");
}

/** Find `marker`, slice the balanced `{…}` that follows, and JSON.parse it. */
function parseBracedBlob<T>(html: string, marker: string): T | null {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const slice = sliceBracedExpression(html, html.indexOf("{", idx));
  if (!slice) return null;
  try {
    return JSON.parse(slice) as T;
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

/**
 * The criteria table renders each fact as a `.is24qa-<slug>-label` /
 * `.is24qa-<slug>` pair. Collect every value cell keyed by its slug so the
 * feature and deposit mappers can look facts up by name.
 */
function extractCriteriaRows(dom: ReturnType<typeof parseHtml>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of dom.querySelectorAll('[class*="is24qa-"]')) {
    const slug = (el.getAttribute("class") ?? "")
      .split(/\s+/)
      .find((c) => c.startsWith("is24qa-") && !c.endsWith("-label"));
    if (!slug || slug in out) continue;
    const text = el.text.replace(/\s+/g, " ").replace(/­/g, "").trim();
    if (!text) continue;
    out[slug] = text;
  }
  return out;
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
  return pickText(heading?.text);
}

/** Legacy template: the free text used to sit in `<pre class="is24qa-…">`. */
const LEGACY_DESCRIPTION_SECTIONS: Array<{ selector: string; heading: string }> = [
  { selector: "pre.is24qa-objektbeschreibung", heading: "Objektbeschreibung" },
  { selector: "pre.is24qa-ausstattung", heading: "Ausstattung" },
  { selector: "pre.is24qa-lage", heading: "Lage" },
  { selector: "pre.is24qa-sonstiges", heading: "Sonstiges" },
];

function buildDescription(
  frontendModel: FrontendModel | null,
  dom: ReturnType<typeof parseHtml>,
): string {
  const content = frontendModel?.exposeContent;
  if (content) {
    const html = buildSectionsHtml([
      { heading: "Objektbeschreibung", body: content.objectDescription },
      { heading: "Ausstattung", body: content.furnishingDescription },
      { heading: "Lage", body: content.locationDescription },
      { heading: "Sonstiges", body: content.otherDescription },
    ]);
    if (html) return html;
  }
  return buildSectionsHtml(
    LEGACY_DESCRIPTION_SECTIONS.map(({ selector, heading }) => ({
      heading,
      body: dom.querySelector(selector)?.text ?? null,
    })),
  );
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

/**
 * Criteria rows worth surfacing alongside the boolean flags. These are the
 * facts a renter actually filters on and that the flags don't cover.
 */
const FEATURE_CRITERIA: Array<{ slug: string; label: string }> = [
  { slug: "is24qa-typ", label: "Typ" },
  { slug: "is24qa-etage", label: "Etage" },
  { slug: "is24qa-bezugsfrei-ab", label: "Bezugsfrei ab" },
  { slug: "is24qa-schlafzimmer", label: "Schlafzimmer" },
  { slug: "is24qa-badezimmer", label: "Badezimmer" },
  { slug: "is24qa-baujahr", label: "Baujahr" },
  { slug: "is24qa-objektzustand", label: "Objektzustand" },
  { slug: "is24qa-qualitaet-der-ausstattung", label: "Ausstattung" },
  { slug: "is24qa-heizungsart", label: "Heizungsart" },
  { slug: "is24qa-wesentliche-energietraeger", label: "Energieträger" },
  { slug: "is24qa-energieeffizienzklasse", label: "Energieeffizienzklasse" },
  { slug: "is24qa-garage-stellplatz", label: "Garage/Stellplatz" },
];

function buildFeatures(kv: KeyValues, criteria: Record<string, string>): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    if (v && !out.includes(v)) out.push(v);
  };

  for (const { key, label } of FEATURE_FLAGS) {
    if (kv[key] === "y") push(label);
  }
  const pets = kv.obj_petsAllowed;
  if (pets === "yes") push("Haustiere erlaubt");
  else if (pets === "negotiable") push("Haustiere nach Absprache");

  for (const { slug, label } of FEATURE_CRITERIA) {
    const value = criteria[slug];
    // Long values are prose that leaked out of a neighbouring cell, not a fact.
    if (!value || value.length > 60) continue;
    push(`${label}: ${value}`);
  }

  // The efficiency-class row renders as an empty cell behind a chart, so take
  // the grade from keyValues when the DOM row gave us nothing.
  if (!criteria["is24qa-energieeffizienzklasse"] && kv.obj_energyEfficiencyClass) {
    // keyValues spells the grades as enum names ("A_PLUS").
    const grade = kv.obj_energyEfficiencyClass.replace(/_PLUS$/, "+");
    push(`Energieeffizienzklasse: ${grade}`);
  }
  return out;
}

function buildPhotos(gallery: ExposeGallery | null): ParsedPhoto[] {
  if (!gallery?.images) return [];
  const out: ParsedPhoto[] = [];
  const seen = new Set<string>();
  for (const img of gallery.images) {
    const url = img.fullSizePictureUrl ?? img.galleryPictureUrl ?? img.thumbnailUrl;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      caption: img.caption?.trim() || null,
      width: null,
      height: null,
    });
  }
  return out;
}

/**
 * "N Netto-Kaltmieten" / "N Monatsmieten" — the deposit expressed as a
 * multiple of the cold rent, which is how a good half of IS24 landlords
 * state it. Resolvable to cents as long as we know the cold rent.
 */
const DEPOSIT_MULTIPLE_RE =
  /^(\d{1,2}(?:[.,]\d)?)\s*(?:x\s*)?(?:netto-?\s*)?(?:kalt|monats|netto)?mieten?\b/i;

/**
 * The deposit cell is free-form: "7.794,54 €", "€ 8.277,00", "2.940,00",
 * "3 Netto-Kaltmieten" or "nach Vereinbarung". Resolve the first four; give
 * up on prose we cannot turn into a number rather than guessing at it.
 */
function extractDepositCents(
  criteria: Record<string, string>,
  coldRentCents: number | null,
): number | null {
  const raw = criteria["is24qa-kaution-o-genossenschaftsanteile"]?.trim();
  if (!raw) return null;

  const multiple = DEPOSIT_MULTIPLE_RE.exec(raw)?.[1];
  if (multiple) {
    if (coldRentCents == null) return null;
    const factor = Number.parseFloat(multiple.replace(",", "."));
    if (!Number.isFinite(factor) || factor <= 0) return null;
    return Math.round(coldRentCents * factor);
  }

  // Strip a leading currency marker so "€ 8.277,00" reads as an amount too.
  const amount = raw.replace(/^(?:€|EUR)\s*/i, "").trim();
  if (!/^\d/.test(amount)) return null;
  // Anything still carrying words is prose that merely opens with a digit.
  if (/[a-z]/i.test(amount.replace(/\s*(?:€|EUR)\s*$/i, ""))) return null;
  return parseEuroToCents(amount);
}

function streetOrNull(kv: KeyValues, frontendModel: FrontendModel | null): string | null {
  const mapAddress = frontendModel?.exposeMap?.addressForMap;
  const fromModel = pickText(mapAddress?.streetAndHouseNumber);
  if (fromModel) return fromModel.replace(/,\s*$/, "");

  const street = pickText(kv.obj_streetPlain ?? kv.obj_street);
  if (!street || street === "no_information") return null;
  const houseNumber = pickText(kv.obj_houseNumber ?? mapAddress?.houseNumber);
  return houseNumber && houseNumber !== "no_information" ? `${street} ${houseNumber}` : street;
}

function pickText(v: string | undefined | null): string | null {
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
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
