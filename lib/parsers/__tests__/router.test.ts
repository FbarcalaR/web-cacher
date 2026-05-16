import { describe, expect, it } from "vitest";

import { UnsupportedSourceError, parseAd } from "..";

const STUB_HTML = "<html></html>";

describe("parseAd router", () => {
  it("rejects unknown hosts", () => {
    expect(() => parseAd("https://example.com/foo", STUB_HTML)).toThrow(
      UnsupportedSourceError,
    );
  });

  it("rejects ImmoScout24 HTML missing the data blob", () => {
    expect(() =>
      parseAd("https://www.immobilienscout24.de/expose/123", STUB_HTML),
    ).toThrow();
  });

  it("rejects Immowelt HTML missing the data blob", () => {
    expect(() => parseAd("https://www.immowelt.de/expose/abc", STUB_HTML)).toThrow();
  });
});
