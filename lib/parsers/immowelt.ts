import { parseEuroToCents, parseNumericString } from "./extract";
import { type ParsedAd, type ParsedPhoto } from "./types";

/**
 * Immowelt (immowelt.de). Single signal source:
 *
 *   <script id="__UFRN_LIFECYCLE_SERVERREQUEST__">
 *     window["__UFRN_LIFECYCLE_SERVERREQUEST__"] = JSON.parse("<escaped JSON>");
 *   </script>
 *
 * The escaped JSON is the full server-render state. `app_cldp.data.classified`
 * carries everything we need: id, title, prices, address, description sections,
 * features, energy data, and the gallery (with full CDN URLs).
 *
 * JSON-LD on Immowelt only has a template-style title and no structured
 * fields, so we ignore it.
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
    gallery?: {
      images?: Array<{
        url?: string;
        description?: string | null;
        title?: string | null;
        alt?: string | null;
      }>;
    };
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
    photos: buildPhotos(classified),
    rawPayload: {
      classified: classified as unknown as Record<string, unknown>,
    },
  };
}

function extractServerState(html: string): ImmoweltState | null {
  const m = SCRIPT_RE.exec(html);
  if (!m) return null;
  try {
    // The match is the body between the quotes of `JSON.parse("...")`.
    // Wrapping it in quotes and JSON.parsing it once unescapes the JS string
    // literal (\\", \\n, \\uXXXX) into the inner JSON text, which we then
    // parse a second time.
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
    // Their description already contains <br> tags. Split paragraphs by
    // double-<br> and wrap each in <p>; single <br> becomes a hard break.
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

function buildPhotos(c: ImmoweltClassified): ParsedPhoto[] {
  const imgs = c.sections?.gallery?.images ?? [];
  const out: ParsedPhoto[] = [];
  for (const img of imgs) {
    if (!img.url) continue;
    out.push({
      url: img.url,
      caption: img.description?.trim() || null,
      width: null,
      height: null,
    });
  }
  return out;
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
