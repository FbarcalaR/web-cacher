import { parseImmoScout24 } from "./immoscout24";
import { parseImmowelt } from "./immowelt";
import { type ParsedAd, parsedAdSchema } from "./types";

export type { ParsedAd, ParsedPhoto } from "./types";
export { parsedAdSchema } from "./types";

export class UnsupportedSourceError extends Error {
  constructor(public hostname: string) {
    super(`Unsupported source host: ${hostname}`);
    this.name = "UnsupportedSourceError";
  }
}

export function parseAd(url: string, html: string): ParsedAd {
  const hostname = new URL(url).hostname;
  const parser = pickParser(hostname);
  if (!parser) throw new UnsupportedSourceError(hostname);
  const raw = parser(url, html);
  // Validates the parsed shape — also catches refactor mistakes in the
  // per-site parsers (e.g. a renamed schema field).
  return parsedAdSchema.parse(raw);
}

function pickParser(hostname: string): ((url: string, html: string) => ParsedAd) | null {
  const h = hostname.toLowerCase();
  if (h === "www.immobilienscout24.de" || h === "immobilienscout24.de") {
    return parseImmoScout24;
  }
  if (h === "www.immowelt.de" || h === "immowelt.de") {
    return parseImmowelt;
  }
  return null;
}
