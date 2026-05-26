import { and, eq, inArray } from "drizzle-orm";
import { del } from "@vercel/blob";

import { uploadAdPhotos } from "@/lib/blob/upload";
import { db } from "@/lib/db/client";
import { adPhotos, ads } from "@/lib/db/schema";
import { parseAd } from "@/lib/parsers";
import { fetchRenderedHtml } from "@/lib/scrape/client";

export type IngestResult = {
  id: string;
  created: boolean;
};

/**
 * Full ingest pipeline. Called from both the manual /add page and the share
 * target route. Synchronous from the caller's perspective; takes ~5–15 s
 * end-to-end (scrape + image downloads + DB writes).
 */
export async function ingestAd(rawUrl: string): Promise<IngestResult> {
  const url = normaliseUrl(rawUrl);

  const html = await fetchRenderedHtml(url);
  const parsed = parseAd(url, html);

  const existing = await db()
    .select({ id: ads.id })
    .from(ads)
    .where(and(eq(ads.source, parsed.source), eq(ads.sourceId, parsed.sourceId)))
    .limit(1);

  const adId = existing[0]?.id ?? crypto.randomUUID();
  const isNew = !existing[0];

  // On re-ingest, delete old photos FIRST so the new upload (which now gets
  // randomised blob paths) never collides with old URLs. If the new upload
  // later fails, the user still has the ad row — just with no photos until
  // the next save.
  if (!isNew) {
    await deleteExistingPhotos(adId);
  }

  const photos = await uploadAdPhotos(
    adId,
    parsed.photos.map((p) => p.url),
  );

  const rowValues = {
    id: adId,
    source: parsed.source,
    sourceId: parsed.sourceId,
    sourceUrl: parsed.sourceUrl,
    title: parsed.title,
    descriptionHtml: parsed.descriptionHtml,
    priceColdCents: parsed.priceColdCents,
    priceWarmCents: parsed.priceWarmCents,
    depositCents: parsed.depositCents,
    sizeSqm: parsed.sizeSqm,
    rooms: parsed.rooms,
    addressStreet: parsed.addressStreet,
    addressZip: parsed.addressZip,
    addressCity: parsed.addressCity,
    features: parsed.features,
    rawPayload: parsed.rawPayload,
  };

  if (isNew) {
    await db().insert(ads).values(rowValues);
  } else {
    await db().update(ads).set(rowValues).where(eq(ads.id, adId));
  }

  if (photos.length > 0) {
    await db()
      .insert(adPhotos)
      .values(
        photos.map((p) => ({
          adId,
          blobUrl: p.blobUrl,
          blobPath: p.blobPath,
          position: p.position,
        })),
      );
  }

  return { id: adId, created: isNew };
}

async function deleteExistingPhotos(adId: string): Promise<void> {
  const existing = await db()
    .select({ id: adPhotos.id, blobUrl: adPhotos.blobUrl })
    .from(adPhotos)
    .where(eq(adPhotos.adId, adId));
  if (existing.length === 0) return;
  try {
    await del(existing.map((p) => p.blobUrl));
  } catch {
    // Best-effort — orphan blobs are a storage cost, not a correctness issue.
  }
  await db()
    .delete(adPhotos)
    .where(
      inArray(
        adPhotos.id,
        existing.map((p) => p.id),
      ),
    );
}

function normaliseUrl(raw: string): string {
  const trimmed = raw.trim();
  const u = new URL(trimmed);
  u.search = "";
  u.hash = "";
  return u.toString();
}
