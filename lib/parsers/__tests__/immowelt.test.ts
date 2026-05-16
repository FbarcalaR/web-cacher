import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseImmowelt } from "../immowelt";

const FIXTURE_DIR = join(__dirname, "..", "__fixtures__", "immowelt");

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
  addressDistrict: string;
  photoCount: number;
};

const FIXTURES: Expected[] = [
  {
    file: "maxvorstadt-64qm-1920.html",
    sourceUrl: "https://www.immowelt.de/expose/26I3AFZ5TPN9",
    sourceId: "26I3AFZ5TPN9",
    priceColdCents: 192000,
    priceWarmCents: 240000,
    sizeSqm: "64",
    rooms: "2",
    addressZip: "80799",
    addressCity: "München",
    addressDistrict: "Maxvorstadt",
    photoCount: 15,
  },
  {
    file: "neuhausen-60qm-1960.html",
    sourceUrl: "https://www.immowelt.de/expose/26377FKSA5D4",
    sourceId: "26377FKSA5D4",
    priceColdCents: 196000,
    priceWarmCents: 245000,
    sizeSqm: "60",
    rooms: "1.5",
    addressZip: "80639",
    addressCity: "München",
    addressDistrict: "Neuhausen-Nymphenburg",
    photoCount: 13,
  },
  {
    file: "bogenhausen-125qm-3600.html",
    sourceUrl: "https://www.immowelt.de/expose/2625XSIDAL3Y",
    sourceId: "2625XSIDAL3Y",
    priceColdCents: 360000,
    priceWarmCents: 450000,
    sizeSqm: "125",
    rooms: "4",
    addressZip: "81679",
    addressCity: "München",
    addressDistrict: "Bogenhausen",
    photoCount: 15,
  },
  {
    file: "bogenhausen-180qm-4000.html",
    sourceUrl: "https://www.immowelt.de/expose/26BYKH4R3U27",
    sourceId: "26BYKH4R3U27",
    priceColdCents: 400000,
    priceWarmCents: 500000,
    sizeSqm: "180",
    rooms: "4",
    addressZip: "81925",
    addressCity: "München",
    addressDistrict: "Bogenhausen",
    photoCount: 15,
  },
  {
    file: "schwabing-west-170qm-9500.html",
    sourceUrl: "https://www.immowelt.de/expose/26LML4HDFXWW",
    sourceId: "26LML4HDFXWW",
    priceColdCents: 950000,
    priceWarmCents: 1062238,
    sizeSqm: "170.2",
    rooms: "4.5",
    addressZip: "80797",
    addressCity: "München",
    addressDistrict: "Schwabing-West",
    photoCount: 42,
  },
];

describe("parseImmowelt", () => {
  for (const f of FIXTURES) {
    it(`parses ${f.file}`, () => {
      const html = readFileSync(join(FIXTURE_DIR, f.file), "utf8");
      const parsed = parseImmowelt(f.sourceUrl, html);
      expect(parsed.source).toBe("immowelt");
      expect(parsed.sourceId).toBe(f.sourceId);
      expect(parsed.sourceUrl).toBe(f.sourceUrl);
      expect(parsed.priceColdCents).toBe(f.priceColdCents);
      expect(parsed.priceWarmCents).toBe(f.priceWarmCents);
      expect(parsed.sizeSqm).toBe(f.sizeSqm);
      expect(parsed.rooms).toBe(f.rooms);
      expect(parsed.addressZip).toBe(f.addressZip);
      expect(parsed.addressCity).toBe(f.addressCity);
      expect(parsed.addressStreet).toBe(f.addressDistrict);
      expect(parsed.photos.length).toBe(f.photoCount);
      expect(parsed.title.length).toBeGreaterThan(0);
      expect(parsed.descriptionHtml).toContain("<h2>");
      for (const p of parsed.photos) {
        expect(p.url.startsWith("https://")).toBe(true);
      }
    });
  }
});
