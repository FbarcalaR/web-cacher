import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseImmowelt } from "../immowelt";

const FIXTURE_DIR = join(__dirname, "..", "__fixtures__", "immowelt");

/**
 * Immowelt fixtures reflect the current live DOM (as of mid-2026): fully
 * DOM-rendered, no inline state script. The old __UFRN_LIFECYCLE_SERVERREQUEST__
 * fixtures were retired when the parser stopped supporting that path.
 */
const FIXTURES = [
  {
    file: "schwabing-west-77qm-1900.html",
    sourceUrl: "https://www.immowelt.de/expose/a0d23847-4840-4b5a-8435-fd66f2446944",
    sourceId: "2685SVQAS9FH",
    priceColdCents: 190000,
    priceWarmCents: 225000,
    depositCents: 570000,
    sizeSqm: "76.9",
    rooms: "3",
    addressZip: "80797",
    addressCity: "München",
    addressDistrict: "Schwabing-West",
    minPhotoCount: 2,
  },
];

describe("parseImmowelt", () => {
  for (const f of FIXTURES) {
    it(`parses ${f.file}`, () => {
      const html = readFileSync(join(FIXTURE_DIR, f.file), "utf8");
      const parsed = parseImmowelt(f.sourceUrl, html);
      expect(parsed.source).toBe("immowelt");
      expect(parsed.sourceId).toBe(f.sourceId);
      expect(parsed.priceColdCents).toBe(f.priceColdCents);
      expect(parsed.priceWarmCents).toBe(f.priceWarmCents);
      expect(parsed.depositCents).toBe(f.depositCents);
      expect(parsed.sizeSqm).toBe(f.sizeSqm);
      expect(parsed.rooms).toBe(f.rooms);
      expect(parsed.addressZip).toBe(f.addressZip);
      expect(parsed.addressCity).toBe(f.addressCity);
      expect(parsed.addressStreet).toBe(f.addressDistrict);
      expect(parsed.photos.length).toBeGreaterThanOrEqual(f.minPhotoCount);
      expect(parsed.title.length).toBeGreaterThan(0);
      expect(parsed.descriptionHtml).toContain("<h2>");
      for (const p of parsed.photos) {
        expect(p.url.startsWith("https://mms.immowelt.de/")).toBe(true);
      }
      // features should include at least a handful of the human list items
      expect(parsed.features.length).toBeGreaterThan(0);
    });
  }
});
