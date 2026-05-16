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
    await replaceExistingPhotos(adId);
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

/**
 * When re-ingesting an existing ad, drop the old photos from both Blob and
 * the DB so we don't accumulate stale variants. The new photo rows are
 * inserted afterwards by the caller.
 */
async function replaceExistingPhotos(adId: string): Promise<void> {
  const existing = await db()
    .select({ id: adPhotos.id, blobUrl: adPhotos.blobUrl })
    .from(adPhotos)
    .where(eq(adPhotos.adId, adId));
  if (existing.length === 0) return;
  // Best-effort blob deletion: if a token / path is stale we still want the
  // DB to converge to the new state.
  try {
    await del(existing.map((p) => p.blobUrl));
  } catch {
    // Swallow — the old blob will eventually be orphaned, not a correctness issue.
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
  // Strip query + hash — tracking junk on these URLs is noise.
  u.search = "";
  u.hash = "";
  return u.toString();
}
