import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseImmowelt } from "../immowelt";

const FIXTURE_DIR = join(__dirname, "..", "__fixtures__", "immowelt");

const read = (file: string) => readFileSync(join(FIXTURE_DIR, file), "utf8");

type Expected = {
  file: string;
  /** The URL as the user would share it. */
  inputUrl: string;
  /** What the parser canonicalises that to — always the Online-ID form. */
  sourceUrl?: string;
  sourceId: string;
  priceColdCents: number;
  priceWarmCents: number;
  depositCents: number;
  sizeSqm: string;
  rooms: string;
  addressStreet: string | null;
  addressZip: string;
  addressCity: string;
  photoCount: number;
  features?: string[];
  descriptionHeadings?: string[];
};

/**
 * Two templates in the wild, and the parser has to handle both:
 *
 * - `schwabing-west-…` came from the DOM-only render Immowelt shipped in
 *   mid-2026, where the gallery lazy-loads and the address is one string.
 * - The 2026-09 captures inline the full listing state again under
 *   `__UFRN_LIFECYCLE_SERVERREQUEST__`, so every photo, the real street and
 *   the untruncated description are all available.
 */
const FIXTURES: Expected[] = [
  {
    file: "schwabing-west-77qm-1900.html",
    // Immowelt also serves exposes under an opaque UUID; the Online-ID from
    // the page is what we key on, so the canonical URL differs from the input.
    inputUrl: "https://www.immowelt.de/expose/a0d23847-4840-4b5a-8435-fd66f2446944",
    sourceUrl: "https://www.immowelt.de/expose/2685SVQAS9FH",
    sourceId: "2685SVQAS9FH",
    priceColdCents: 190000,
    priceWarmCents: 225000,
    depositCents: 570000,
    sizeSqm: "76.9",
    rooms: "3",
    // DOM-only template: no street, the district stands in for it.
    addressStreet: "Schwabing-West",
    addressZip: "80797",
    addressCity: "München",
    photoCount: 2,
  },
  {
    file: "milbertshofen-2zi-2040.html",
    inputUrl: "https://www.immowelt.de/expose/26X3UBDG3M7F",
    sourceId: "26X3UBDG3M7F",
    priceColdCents: 204000,
    priceWarmCents: 224000,
    depositCents: 500000,
    sizeSqm: "66",
    rooms: "2",
    addressStreet: "Moosacher Straße 5",
    addressZip: "80809",
    addressCity: "München",
    photoCount: 9,
    features: ["Einbauküche", "Keller", "Baujahr: 1962"],
    descriptionHeadings: ["Objektbeschreibung", "Lage", "Weitere Informationen"],
  },
  {
    file: "ramersdorf-2zi-1214.html",
    inputUrl: "https://www.immowelt.de/expose/26EGVAR7HTFE",
    sourceId: "26EGVAR7HTFE",
    priceColdCents: 121399,
    priceWarmCents: 142279,
    depositCents: 364197,
    sizeSqm: "56",
    rooms: "2",
    addressStreet: "Ottobrunner Straße 26 c",
    addressZip: "81737",
    addressCity: "München",
    photoCount: 8,
    features: ["Balkon", "Garten", "Personenaufzug"],
  },
  {
    // Street withheld — only the district is published. Also the listing
    // whose Online-ID sits next to no Referenznummer, which used to make the
    // DOM id regex swallow the following label ("26HSIUS5RBPFAngebot").
    file: "moosach-3zi-3000.html",
    inputUrl: "https://www.immowelt.de/expose/26HSIUS5RBPF",
    sourceId: "26HSIUS5RBPF",
    priceColdCents: 300000,
    priceWarmCents: 337200,
    depositCents: 900000,
    sizeSqm: "120",
    rooms: "3",
    addressStreet: "Moosach",
    addressZip: "80992",
    addressCity: "München",
    photoCount: 18,
    features: ["Einbauküche", "Garten", "möbliert"],
  },
];

describe("parseImmowelt", () => {
  for (const f of FIXTURES) {
    it(`parses ${f.file}`, () => {
      const parsed = parseImmowelt(f.inputUrl, read(f.file));
      expect(parsed.source).toBe("immowelt");
      expect(parsed.sourceId).toBe(f.sourceId);
      expect(parsed.sourceUrl).toBe(f.sourceUrl ?? f.inputUrl);
      expect(parsed.priceColdCents).toBe(f.priceColdCents);
      expect(parsed.priceWarmCents).toBe(f.priceWarmCents);
      expect(parsed.depositCents).toBe(f.depositCents);
      expect(parsed.sizeSqm).toBe(f.sizeSqm);
      expect(parsed.rooms).toBe(f.rooms);
      expect(parsed.addressStreet).toBe(f.addressStreet);
      expect(parsed.addressZip).toBe(f.addressZip);
      expect(parsed.addressCity).toBe(f.addressCity);
      expect(parsed.photos.length).toBe(f.photoCount);
      expect(parsed.title.length).toBeGreaterThan(0);
      expect(parsed.descriptionHtml).toContain("<h2>");
      expect(parsed.features.length).toBeGreaterThan(0);
      for (const feature of f.features ?? []) {
        expect(parsed.features).toContain(feature);
      }
      for (const heading of f.descriptionHeadings ?? []) {
        expect(parsed.descriptionHtml).toContain(`<h2>${heading}</h2>`);
      }
      for (const p of parsed.photos) {
        expect(p.url.startsWith("https://mms.immowelt.de/")).toBe(true);
      }
    });
  }

  it("keeps the line breaks Immowelt writes as single <br>", () => {
    const parsed = parseImmowelt(
      "https://www.immowelt.de/expose/26X3UBDG3M7F",
      read("milbertshofen-2zi-2040.html"),
    );
    expect(parsed.descriptionHtml).toContain("<br>");
    // A run-on paragraph is the symptom of <br> being stripped rather than
    // converted, which is exactly what the old tag-stripper did.
    expect(parsed.descriptionHtml).not.toContain("###Erstbezug");
  });

  it("titles from the curated headline, not the description's first line", () => {
    const parsed = parseImmowelt(
      "https://www.immowelt.de/expose/26X3UBDG3M7F",
      read("milbertshofen-2zi-2040.html"),
    );
    expect(parsed.title).toBe(
      "Möbliertes 2-Zimmer Apartment mit Alpenblick - ideal für WG oder Flatsharing",
    );
  });

  it("drops filename-shaped photo captions", () => {
    const parsed = parseImmowelt(
      "https://www.immowelt.de/expose/26HSIUS5RBPF",
      read("moosach-3zi-3000.html"),
    );
    // Every caption on this listing is an uploader filename ("IMG_1160(1).jpg").
    expect(parsed.photos.every((p) => p.caption === null)).toBe(true);
  });

  it("falls back to the DOM when the state blob is missing", () => {
    const html = read("milbertshofen-2zi-2040.html").replace(
      "__UFRN_LIFECYCLE_SERVERREQUEST__",
      "__DISABLED__",
    );
    const parsed = parseImmowelt("https://www.immowelt.de/expose/26X3UBDG3M7F", html);
    expect(parsed.sourceId).toBe("26X3UBDG3M7F");
    expect(parsed.priceColdCents).toBe(204000);
    // The DOM path only sees the photos that survived pre-hydration.
    expect(parsed.photos.length).toBeGreaterThan(0);
  });

  it("throws when the page carries neither state blob nor cdp anchors", () => {
    expect(() =>
      parseImmowelt("https://www.immowelt.de/expose/26X3UBDG3M7F", "<html><body/></html>"),
    ).toThrow(/no inline listing state/);
  });
});
