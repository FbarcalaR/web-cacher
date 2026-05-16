"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { ingestAd } from "@/lib/ingest";
import { UnsupportedSourceError } from "@/lib/parsers";
import { ScrapeError } from "@/lib/scrape/client";

export type AddAdState = {
  error: string | null;
  url: string;
};

const SUPPORTED_HOSTS = [
  "www.immobilienscout24.de",
  "immobilienscout24.de",
  "www.immowelt.de",
  "immowelt.de",
];

export async function addAdAction(_prev: AddAdState, formData: FormData): Promise<AddAdState> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { error: "Paste an ad URL.", url };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { error: "That doesn't look like a valid URL.", url };
  }
  if (!SUPPORTED_HOSTS.includes(parsedUrl.hostname.toLowerCase())) {
    return {
      error: `Only ImmoScout24 and Immowelt URLs are supported (got ${parsedUrl.hostname}).`,
      url,
    };
  }

  let result;
  try {
    result = await ingestAd(url);
  } catch (err) {
    if (err instanceof UnsupportedSourceError) {
      return { error: `Unsupported source: ${err.hostname}`, url };
    }
    if (err instanceof ScrapeError) {
      return {
        error: `Couldn't fetch the page (${err.message}). Retry, or try again later.`,
        url,
      };
    }
    console.error("ingest failed", err);
    return {
      error: `Ingest failed: ${(err as Error).message}`,
      url,
    };
  }

  revalidatePath("/");
  redirect(`/ad/${result.id}`);
}
