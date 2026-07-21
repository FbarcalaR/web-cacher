"use server";

import { del } from "@vercel/blob";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { adPhotos, adStatus, ads } from "@/lib/db/schema";

const statusSchema = z.enum(adStatus.enumValues);
const notesSchema = z.string().max(10_000);

export async function updateAdNotes(id: string, notes: string): Promise<void> {
  const parsed = notesSchema.parse(notes);
  const trimmed = parsed.trim();
  await db()
    .update(ads)
    .set({ notes: trimmed.length > 0 ? trimmed : null })
    .where(eq(ads.id, id));
  revalidatePath(`/ad/${id}`);
  revalidatePath("/");
}

export async function updateAdStatus(id: string, status: string): Promise<void> {
  const parsed = statusSchema.parse(status);
  await db().update(ads).set({ status: parsed }).where(eq(ads.id, id));
  revalidatePath(`/ad/${id}`);
  revalidatePath("/");
}

export async function deleteAd(id: string): Promise<void> {
  const photos = await db()
    .select({ blobUrl: adPhotos.blobUrl })
    .from(adPhotos)
    .where(eq(adPhotos.adId, id));
  if (photos.length > 0) {
    try {
      await del(photos.map((p) => p.blobUrl));
    } catch {
      // Orphan blobs are harmless; DB row deletion is what matters.
    }
  }
  await db().delete(ads).where(eq(ads.id, id));
  revalidatePath("/");
  redirect("/");
}

// ---------- edit action ------------------------------------------------

export type UpdateAdState = { error: string | null };

const editSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  sourceUrl: z.string().trim().url("Source URL must be a valid URL"),
  descriptionHtml: z.string(),
  addressStreet: z.string().trim(),
  addressZip: z.string().trim(),
  addressCity: z.string().trim(),
  priceColdEuros: z.string().trim(),
  priceWarmEuros: z.string().trim(),
  depositEuros: z.string().trim(),
  sizeSqm: z.string().trim(),
  rooms: z.string().trim(),
  features: z.string(),
});

export async function updateAd(
  id: string,
  _prev: UpdateAdState,
  formData: FormData,
): Promise<UpdateAdState> {
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid input" };
  }
  const data = parsed.data;
  try {
    await db()
      .update(ads)
      .set({
        title: data.title,
        sourceUrl: data.sourceUrl,
        descriptionHtml: data.descriptionHtml,
        addressStreet: data.addressStreet || null,
        addressZip: data.addressZip || null,
        addressCity: data.addressCity || null,
        priceColdCents: parseEurosToCents(data.priceColdEuros),
        priceWarmCents: parseEurosToCents(data.priceWarmEuros),
        depositCents: parseEurosToCents(data.depositEuros),
        sizeSqm: parseDecimalString(data.sizeSqm),
        rooms: parseDecimalString(data.rooms),
        features: data.features
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      })
      .where(eq(ads.id, id));
  } catch (err) {
    return { error: `Save failed: ${(err as Error).message}` };
  }
  revalidatePath(`/ad/${id}`);
  revalidatePath("/");
  redirect(`/ad/${id}`);
}

function parseEurosToCents(input: string): number | null {
  const trimmed = input.trim().replace(/€/g, "").trim();
  if (!trimmed) return null;
  // Accept German ("1.234,56") and English ("1234.56") formats.
  const normalised = /,\d{1,2}$/.test(trimmed)
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed.replace(/\s/g, "");
  const n = Number.parseFloat(normalised);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function parseDecimalString(input: string): string | null {
  const trimmed = input.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return null;
  return String(n);
}

// ---------- photo actions ---------------------------------------------

export async function recordAdPhoto(
  adId: string,
  blobUrl: string,
  blobPath: string,
): Promise<void> {
  // Assign the next position atomically-ish: query max, insert at max+1.
  // Sequential uploads only (single-user app), so a race is not a concern.
  const [row] = await db()
    .select({ maxPos: sql<number | null>`max(${adPhotos.position})` })
    .from(adPhotos)
    .where(eq(adPhotos.adId, adId));
  const nextPos = (row?.maxPos ?? -1) + 1;
  await db().insert(adPhotos).values({
    adId,
    blobUrl,
    blobPath,
    position: nextPos,
  });
  revalidatePath(`/ad/${adId}`);
  revalidatePath(`/ad/${adId}/edit`);
  revalidatePath("/");
}

export async function deleteAdPhoto(photoId: string): Promise<void> {
  const [photo] = await db()
    .select({ adId: adPhotos.adId, blobUrl: adPhotos.blobUrl })
    .from(adPhotos)
    .where(eq(adPhotos.id, photoId))
    .limit(1);
  if (!photo) return;
  try {
    await del(photo.blobUrl);
  } catch {
    // Orphan blob — harmless.
  }
  await db()
    .delete(adPhotos)
    .where(and(eq(adPhotos.id, photoId), eq(adPhotos.adId, photo.adId)));
  revalidatePath(`/ad/${photo.adId}`);
  revalidatePath(`/ad/${photo.adId}/edit`);
  revalidatePath("/");
}
