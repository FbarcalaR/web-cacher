import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseImmoScout24 } from "../immoscout24";

const FIXTURE_DIR = join(__dirname, "..", "__fixtures__", "immoscout24");

const read = (file: string) => readFileSync(join(FIXTURE_DIR, file), "utf8");

type Expected = {
  file: string;
  sourceUrl: string;
  sourceId: string;
  priceColdCents: number;
  priceWarmCents: number;
  sizeSqm: string;
  rooms: string;
  addressStreet: string | null;
  addressZip: string;
  addressCity: string;
  photoCount: number;
  depositCents?: number | null;
  descriptionHeadings?: string[];
  features?: string[];
};

const FIXTURES: Expected[] = [
  {
    file: "schwere-reiter-1zi-1570.html",
    sourceUrl: "https://www.immobilienscout24.de/expose/166738062",
    sourceId: "166738062",
    priceColdCents: 157000,
    priceWarmCents: 185000,
    sizeSqm: "43.48",
    rooms: "1",
    // Street redacted by the landlord — IS24 shows the district only.
    addressStreet: null,
    addressZip: "80797",
    addressCity: "München",
    photoCount: 5,
    // Stated as "3 Netto-Kaltmieten": 3 x 1570 EUR.
    depositCents: 471000,
  },
  {
    file: "nymphenburg-2zi-1800.html",
    sourceUrl: "https://www.immobilienscout24.de/expose/167293989",
    sourceId: "167293989",
    priceColdCents: 180000,
    priceWarmCents: 215000,
    sizeSqm: "100",
    rooms: "2",
    addressStreet: null,
    addressZip: "80638",
    addressCity: "München",
    photoCount: 9,
  },
  {
    file: "nymphenburg-4zi-3192.html",
    sourceUrl: "https://www.immobilienscout24.de/expose/167442894",
    sourceId: "167442894",
    priceColdCents: 319200,
    priceWarmCents: 399000,
    sizeSqm: "110",
    rooms: "4",
    addressStreet: null,
    addressZip: "80639",
    addressCity: "München",
    photoCount: 18,
  },
  {
    file: "ramersdorf-4-5zi-2659.html",
    sourceUrl: "https://www.immobilienscout24.de/expose/162406502",
    sourceId: "162406502",
    priceColdCents: 265900,
    priceWarmCents: 306900,
    sizeSqm: "123.7",
    rooms: "4.5",
    addressStreet: null,
    addressZip: "81737",
    addressCity: "München",
    photoCount: 15, // includes 2 floor plans
    // Stated as "\u20ac 8.277,00" - currency prefix rather than suffix.
    depositCents: 827700,
  },
  // --- captured 2026-09 against the current template, where the free-text
  // --- description moved out of the DOM into IS24.ssr.frontendModel.
  {
    file: "neuperlach-4zi-2598.html",
    sourceUrl: "https://www.immobilienscout24.de/expose/166116685",
    sourceId: "166116685",
    priceColdCents: 259818,
    priceWarmCents: 312590,
    depositCents: 779454,
    sizeSqm: "98.2",
    rooms: "4",
    addressStreet: "Zenzl-Mühsam-Straße 5",
    addressZip: "81735",
    addressCity: "München",
    photoCount: 16,
    descriptionHeadings: ["Objektbeschreibung", "Ausstattung", "Lage", "Sonstiges"],
    features: ["Balkon", "Einbauküche", "Aufzug", "Etage: 4 von 6", "Baujahr: 2026"],
  },
  {
    // Private listing with no photos at all (obj_picturecount = 0) — an empty
    // gallery is the ad's own doing, not a parser failure.
    file: "laim-2zi-980.html",
    sourceUrl: "https://www.immobilienscout24.de/expose/170398531",
    sourceId: "170398531",
    priceColdCents: 98000,
    priceWarmCents: 118000,
    depositCents: 294000,
    sizeSqm: "55",
    rooms: "2",
    addressStreet: "Agnes-Bernauer-Straße 135",
    addressZip: "80687",
    addressCity: "München",
    photoCount: 0,
    descriptionHeadings: ["Objektbeschreibung", "Lage"],
    features: ["Balkon", "Einbauküche", "Keller", "Aufzug", "Baujahr: 2019"],
  },
];

describe("parseImmoScout24", () => {
  for (const f of FIXTURES) {
    it(`parses ${f.file}`, () => {
      const parsed = parseImmoScout24(f.sourceUrl, read(f.file));
      expect(parsed.source).toBe("immoscout24");
      expect(parsed.sourceId).toBe(f.sourceId);
      expect(parsed.sourceUrl).toBe(f.sourceUrl);
      expect(parsed.priceColdCents).toBe(f.priceColdCents);
      expect(parsed.priceWarmCents).toBe(f.priceWarmCents);
      expect(parsed.sizeSqm).toBe(f.sizeSqm);
      expect(parsed.rooms).toBe(f.rooms);
      expect(parsed.addressStreet).toBe(f.addressStreet);
      expect(parsed.addressZip).toBe(f.addressZip);
      expect(parsed.addressCity).toBe(f.addressCity);
      expect(parsed.photos.length).toBe(f.photoCount);
      expect(parsed.title.length).toBeGreaterThan(0);
      expect(parsed.descriptionHtml).toContain("<h2>");
      if (f.depositCents !== undefined) {
        expect(parsed.depositCents).toBe(f.depositCents);
      }
      for (const heading of f.descriptionHeadings ?? []) {
        expect(parsed.descriptionHtml).toContain(`<h2>${heading}</h2>`);
      }
      for (const feature of f.features ?? []) {
        expect(parsed.features).toContain(feature);
      }
      // every photo URL should resolve as an absolute https URL
      for (const p of parsed.photos) {
        expect(p.url.startsWith("https://")).toBe(true);
      }
    });
  }

  it("never emits an <h2> with nothing under it", () => {
    for (const f of FIXTURES) {
      const { descriptionHtml } = parseImmoScout24(f.sourceUrl, read(f.file));
      expect(descriptionHtml).not.toMatch(/<h2>[^<]*<\/h2>\s*(?:<h2>|$)/);
    }
  });

  it("rejects a Neubau project page instead of storing its price range", () => {
    const url =
      "https://www.immobilienscout24.de/neubau/krieger-schramm-wohnbau-muenchen-gmbh-co-kg/wohnen-in-alt-aubing-muenchner-hoefe/149380.html";
    expect(() => parseImmoScout24(url, read("neubau-projekt-alt-aubing.html"))).toThrow(
      /Neubau project page/,
    );
  });

  it("detects a Neubau project page from its canonical link alone", () => {
    // Share-target URLs sometimes arrive without the /neubau/ path.
    expect(() =>
      parseImmoScout24(
        "https://www.immobilienscout24.de/expose/149380",
        read("neubau-projekt-alt-aubing.html"),
      ),
    ).toThrow(/Neubau project page/);
  });
});
