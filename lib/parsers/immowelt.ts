import { parseEuroToCents, parseNumericString } from "./extract";
import { type ParsedAd, type ParsedPhoto } from "./types";

/**
 * Immowelt (immowelt.de). Primary signal source:
 *
 *   <script id="__UFRN_LIFECYCLE_SERVERREQUEST__">
 *     window["__UFRN_LIFECYCLE_SERVERREQUEST__"] = JSON.parse("<escaped JSON>");
 *   </script>
 *
 * The escaped JSON is the full server-render state. `app_cldp.data.classified`
 * carries everything we need for text fields. Images used to live cleanly at
 * `classified.sections.gallery.images[]` — in practice we've seen Immowelt
 * move that around (empty at first hydration, populated later via a client
 * fetch), so we try several known locations in the state blob and, as a last
 * resort, extract the visible image URLs from the pre-hydration DOM.
 */

type ImmoweltState = {
  app_cldp?: {
    data?: {
      classified?: ImmoweltClassified;
    };
  };
};

type ImmoweltClassified = {
  id?: string;
  sections?: {
    location?: {
      address?: {
        city?: string;
        zipCode?: string;
        district?: string;
        country?: string;
      };
    };
    mainDescription?: { headline?: string; description?: string };
    areaDescription?: { headline?: string; description?: string };
    extendedInfoDescription?: { headline?: string; description?: string };
    hardFacts?: {
      facts?: Array<{ type?: string; splitValue?: string }>;
      price?: { ariaLabel?: string };
    };
    price?: {
      breakdown?: {
        total?: { ariaLabel?: string };
        groups?: Array<{ label?: { value?: string }; value?: { value?: string } }>;
      };
    };
    features?: {
      preview?: Array<{ value?: string }>;
    };
    gallery?: unknown;
    mediaGallery?: unknown;
    enrichedMedia?: unknown;
    media?: unknown;
  };
};

const SCRIPT_RE =
  /__UFRN_LIFECYCLE_SERVERREQUEST__"\]\s*=\s*JSON\.parse\("([\s\S]*?)"\);/;

export function parseImmowelt(url: string, html: string): ParsedAd {
  const state = extractServerState(html);
  if (!state) {
    throw new Error(
      `Immowelt: could not find __UFRN_LIFECYCLE_SERVERREQUEST__ blob in ${url} (page may have been bot-blocked)`,
    );
  }
  const classified = state.app_cldp?.data?.classified;
  if (!classified?.id) {
    throw new Error(`Immowelt: classified state has no id in ${url}`);
  }

  const sections = classified.sections ?? {};
  const address = sections.location?.address ?? {};
  const title =
    sections.mainDescription?.headline?.trim() ||
    classified.sections?.hardFacts?.facts?.[0]?.splitValue?.trim() ||
    "(untitled)";

  const facts = sections.hardFacts?.facts ?? [];
  const rooms = parseNumericString(pickFact(facts, "numberOfRooms"));
  const size = parseNumericString(pickFact(facts, "livingSpace"));

  const coldRent = parseEuroToCents(sections.hardFacts?.price?.ariaLabel ?? null);
  const warmRent = parseEuroToCents(sections.price?.breakdown?.total?.ariaLabel ?? null);

  return {
    source: "immowelt",
    sourceId: classified.id,
    sourceUrl: canonicalUrl(url, classified.id),
    title,
    descriptionHtml: buildDescription(classified),
    priceColdCents: coldRent,
    priceWarmCents: warmRent,
    depositCents: null,
    sizeSqm: size,
    rooms,
    addressStreet: address.district?.trim() || null,
    addressZip: address.zipCode?.trim() || null,
    addressCity: address.city?.trim() || null,
    features: buildFeatures(classified),
    photos: buildPhotos(classified, html),
    rawPayload: {
      classified: classified as unknown as Record<string, unknown>,
    },
  };
}

function extractServerState(html: string): ImmoweltState | null {
  const m = SCRIPT_RE.exec(html);
  if (!m) return null;
  try {
    const innerJson = JSON.parse(`"${m[1]!}"`);
    return JSON.parse(innerJson) as ImmoweltState;
  } catch {
    return null;
  }
}

function pickFact(
  facts: Array<{ type?: string; splitValue?: string }>,
  type: string,
): string | null {
  const f = facts.find((x) => x.type === type);
  return f?.splitValue?.trim() ?? null;
}

const DESCRIPTION_FIELDS: Array<{
  key: "mainDescription" | "areaDescription" | "extendedInfoDescription";
  fallbackHeading: string;
}> = [
  { key: "mainDescription", fallbackHeading: "Objektbeschreibung" },
  { key: "areaDescription", fallbackHeading: "Lage" },
  { key: "extendedInfoDescription", fallbackHeading: "Weitere Informationen" },
];

function buildDescription(c: ImmoweltClassified): string {
  const parts: string[] = [];
  for (const { key, fallbackHeading } of DESCRIPTION_FIELDS) {
    const section = c.sections?.[key];
    const raw = section?.description?.trim();
    if (!raw) continue;
    const heading = section?.headline?.trim() ?? fallbackHeading;
    parts.push(`<h2>${escapeHtml(heading)}</h2>`);
    const paragraphs = raw
      .replace(/<\/?b>/g, "")
      .replace(/<\/?i>/g, "")
      .split(/(?:<br\s*\/?>\s*){2,}/i);
    for (const p of paragraphs) {
      const clean = p.replace(/<br\s*\/?>/gi, "\n").trim();
      if (!clean) continue;
      parts.push(`<p>${escapeHtml(clean).replace(/\n/g, "<br>")}</p>`);
    }
  }
  return parts.join("\n");
}

function buildFeatures(c: ImmoweltClassified): string[] {
  const preview = c.sections?.features?.preview ?? [];
  const out: string[] = [];
  for (const f of preview) {
    const v = f.value?.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

// ---------- image extraction --------------------------------------------

function buildPhotos(c: ImmoweltClassified, html: string): ParsedPhoto[] {
  // Prefer the state blob — it contains clean base URLs. If it's empty
  // (Immowelt has moved the gallery data or dropped it from SSR), fall back
  // to DOM extraction, which finds the size-parameterised srcset URLs of
  // the first few visible gallery images. Better than nothing.
  const fromState = extractPhotosFromState(c);
  if (fromState.length > 0) return fromState;
  return extractPhotosFromDom(html);
}

type PhotoLike = {
  url?: unknown;
  imageUrl?: unknown;
  src?: unknown;
  description?: unknown;
  caption?: unknown;
  alt?: unknown;
  title?: unknown;
};

const STATE_PHOTO_PATHS: string[][] = [
  ["gallery", "images"],
  ["gallery", "previews"],
  ["gallery", "items"],
  ["mediaGallery", "images"],
  ["mediaGallery", "items"],
  ["enrichedMedia", "medias"],
  ["enrichedMedia", "images"],
  ["media", "images"],
];

function extractPhotosFromState(c: ImmoweltClassified): ParsedPhoto[] {
  const sections = (c.sections ?? {}) as Record<string, unknown>;
  const out: ParsedPhoto[] = [];
  const seen = new Set<string>();
  for (const path of STATE_PHOTO_PATHS) {
    const arr = getNested(sections, path);
    if (!Array.isArray(arr)) continue;
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as PhotoLike;
      const url = pickUrl(item);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({
        url,
        caption: pickCaption(item),
        width: null,
        height: null,
      });
    }
  }
  return out;
}

function extractPhotosFromDom(html: string): ParsedPhoto[] {
  const out: ParsedPhoto[] = [];
  const seen = new Set<string>();
  const re = /srcset="(https:\/\/mms\.immowelt\.de\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = decodeHtmlEntities(m[1]!);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, caption: null, width: null, height: null });
  }
  return out;
}

function getNested(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function pickUrl(item: PhotoLike): string | null {
  const candidates = [item.url, item.imageUrl, item.src];
  for (const c of candidates) {
    if (typeof c === "string" && (c.startsWith("https://") || c.startsWith("http://"))) {
      return c;
    }
  }
  return null;
}

function pickCaption(item: PhotoLike): string | null {
  const candidates = [item.description, item.caption, item.alt, item.title];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

// ---------- misc helpers ------------------------------------------------

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
