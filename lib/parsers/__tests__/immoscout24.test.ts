import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseImmoScout24 } from "../immoscout24";

const FIXTURE_DIR = join(__dirname, "..", "__fixtures__", "immoscout24");

type Expected = {
  file: string;
  sourceUrl: string;
  sourceId: string;
  priceColdCents: number;
  priceWarmCents: number;
  sizeSqm: string;
  rooms: string;
  addressZip: string;
  addressCity: string;
  photoCount: number;
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
    addressZip: "80797",
    addressCity: "München",
    photoCount: 5,
  },
  {
    file: "nymphenburg-2zi-1800.html",
    sourceUrl: "https://www.immobilienscout24.de/expose/167293989",
    sourceId: "167293989",
    priceColdCents: 180000,
    priceWarmCents: 215000,
    sizeSqm: "100",
    rooms: "2",
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
    addressZip: "81737",
    addressCity: "München",
    photoCount: 15, // includes 2 floor plans
  },
];

describe("parseImmoScout24", () => {
  for (const f of FIXTURES) {
    it(`parses ${f.file}`, () => {
      const html = readFileSync(join(FIXTURE_DIR, f.file), "utf8");
      const parsed = parseImmoScout24(f.sourceUrl, html);
      expect(parsed.source).toBe("immoscout24");
      expect(parsed.sourceId).toBe(f.sourceId);
      expect(parsed.sourceUrl).toBe(f.sourceUrl);
      expect(parsed.priceColdCents).toBe(f.priceColdCents);
      expect(parsed.priceWarmCents).toBe(f.priceWarmCents);
      expect(parsed.sizeSqm).toBe(f.sizeSqm);
      expect(parsed.rooms).toBe(f.rooms);
      expect(parsed.addressZip).toBe(f.addressZip);
      expect(parsed.addressCity).toBe(f.addressCity);
      expect(parsed.photos.length).toBe(f.photoCount);
      expect(parsed.title.length).toBeGreaterThan(0);
      expect(parsed.descriptionHtml).toContain("<h2>");
      // every photo URL should resolve as an absolute https URL
      for (const p of parsed.photos) {
        expect(p.url.startsWith("https://")).toBe(true);
      }
    });
  }
});
