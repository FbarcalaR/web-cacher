"use server";

import { revalidatePath } from "next/cache";

import { ingestAd } from "@/lib/ingest";
import { UnsupportedSourceError } from "@/lib/parsers";
import { ScrapeError } from "@/lib/scrape/client";

export type AddAdState =
  | { kind: "idle"; url: string }
  | { kind: "error"; url: string; error: string }
  | { kind: "saved"; url: string; id: string };

const SUPPORTED_HOSTS = [
  "www.immobilienscout24.de",
  "immobilienscout24.de",
  "www.immowelt.de",
  "immowelt.de",
];

export const INITIAL_STATE: AddAdState = { kind: "idle", url: "" };

export async function addAdAction(
  _prev: AddAdState,
  formData: FormData,
): Promise<AddAdState> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { kind: "error", url, error: "Paste an ad URL." };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { kind: "error", url, error: "That doesn't look like a valid URL." };
  }
  if (!SUPPORTED_HOSTS.includes(parsedUrl.hostname.toLowerCase())) {
    return {
      kind: "error",
      url,
      error: `Only ImmoScout24 and Immowelt URLs are supported (got ${parsedUrl.hostname}).`,
    };
  }

  let result;
  try {
    result = await ingestAd(url);
  } catch (err) {
    if (err instanceof UnsupportedSourceError) {
      return { kind: "error", url, error: `Unsupported source: ${err.hostname}` };
    }
    if (err instanceof ScrapeError) {
      return {
        kind: "error",
        url,
        error: `Couldn't fetch the page (${err.message}). Retry, or try again later.`,
      };
    }
    console.error("ingest failed", err);
    return { kind: "error", url, error: `Ingest failed: ${(err as Error).message}` };
  }

  revalidatePath("/");
  // No redirect here — the client gets the id back and renders a
  // brief "Saved!" state before navigating itself. Otherwise the form
  // jumps straight from "Saving…" to the detail page with no feedback
  // that the work succeeded.
  return { kind: "saved", url, id: result.id };
}
