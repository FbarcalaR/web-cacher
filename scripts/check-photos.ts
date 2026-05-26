/**
 * Check whether ad_photos.blob_url entries point to Vercel Blob or to the
 * original source CDN. Run with:
 *
 *   POSTGRES_URL=<url> tsx scripts/check-photos.ts
 *
 * If output shows "pictures.immobilienscout24.de" or "mms.immowelt.de",
 * the images are linked, not copied. If it shows
 * "*.public.blob.vercel-storage.com", they're properly stored in Blob.
 */

import { db } from "@/lib/db/client";
import { adPhotos, ads } from "@/lib/db/schema";

async function main(): Promise<void> {
  const allPhotos = await db()
    .select({
      adId: adPhotos.adId,
      blobUrl: adPhotos.blobUrl,
      position: adPhotos.position,
    })
    .from(adPhotos);

  const allAds = await db()
    .select({ id: ads.id, title: ads.title })
    .from(ads);

  console.log(`Total ads: ${allAds.length}`);
  console.log(`Total photos: ${allPhotos.length}`);

  const byDomain = new Map<string, number>();
  const brokenAds = new Set<string>();

  for (const p of allPhotos) {
    let host: string;
    try {
      host = new URL(p.blobUrl).hostname;
    } catch {
      host = "INVALID_URL";
    }
    byDomain.set(host, (byDomain.get(host) ?? 0) + 1);
    if (!host.endsWith(".blob.vercel-storage.com")) {
      brokenAds.add(p.adId);
    }
  }

  console.log("\nPhoto URLs by domain:");
  for (const [domain, count] of [...byDomain.entries()].sort((a, b) => b[1] - a[1])) {
    const ok = domain.endsWith(".blob.vercel-storage.com");
    console.log(`  ${ok ? "✓" : "✖"} ${domain}: ${count} photos`);
  }

  if (brokenAds.size > 0) {
    console.log(`\n${brokenAds.size} ad(s) have photos stored as ORIGINAL CDN URLs (not Blob):`);
    for (const adId of brokenAds) {
      const ad = allAds.find((a) => a.id === adId);
      console.log(`  ${adId} — ${ad?.title ?? "(unknown)"}`);
    }
    console.log("\nThese ads need re-saving to upload their images to Blob.");
  } else if (allPhotos.length > 0) {
    console.log("\n✓ All photos are stored in Vercel Blob.");
  } else {
    console.log("\nNo photos in the database yet.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
