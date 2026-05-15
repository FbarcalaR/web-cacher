/**
 * Inserts one fake ad with three photos uploaded to Vercel Blob.
 * Run with: pnpm db:seed
 * Requires POSTGRES_URL and BLOB_READ_WRITE_TOKEN in the environment.
 */

import { put } from "@vercel/blob";
import { db } from "@/lib/db/client";
import { adPhotos, ads } from "@/lib/db/schema";

const SAMPLE_IMAGES = [
  "https://picsum.photos/seed/wc-cover/1600/1067",
  "https://picsum.photos/seed/wc-living/1600/1067",
  "https://picsum.photos/seed/wc-kitchen/1600/1067",
];

async function main(): Promise<void> {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is not set");
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set (run `vercel env pull .env.local`)");
  }

  const id = crypto.randomUUID();
  const sourceId = `seed-${Date.now()}`;

  console.log(`Uploading ${SAMPLE_IMAGES.length} sample images to Blob...`);
  const photos = await Promise.all(
    SAMPLE_IMAGES.map(async (url, i) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
      const bytes = await res.arrayBuffer();
      const blobPath = `ads/${id}/${i}.jpg`;
      const blob = await put(blobPath, bytes, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
      });
      console.log(`  ${i}: ${blob.url}`);
      return { blobUrl: blob.url, blobPath, position: i };
    }),
  );

  console.log("Inserting ad + photos...");
  await db()
    .insert(ads)
    .values({
      id,
      source: "immoscout24",
      sourceId,
      sourceUrl: `https://www.immobilienscout24.de/expose/${sourceId}`,
      title: "Seed: 2-Zimmer Altbau in Berlin-Mitte",
      descriptionHtml:
        "<p>Helle, gut geschnittene Altbauwohnung mit Stuck und Dielen. Ruhige Seitenstraße, Balkon zum Hof.</p>" +
        "<p><strong>Verkehrsanbindung:</strong> U-Bahn 5 Minuten zu Fuß.</p>",
      priceColdCents: 95000,
      priceWarmCents: 122000,
      depositCents: 285000,
      sizeSqm: "52.50",
      rooms: "2.0",
      addressStreet: "Musterstraße 1",
      addressZip: "10115",
      addressCity: "Berlin",
      features: ["Balkon", "Einbauküche", "Altbau", "Dielen"],
      status: "new",
    });
  await db()
    .insert(adPhotos)
    .values(photos.map((p) => ({ adId: id, ...p })));

  console.log(`\nDone. Ad id: ${id}`);
  console.log(`View at: /ad/${id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
