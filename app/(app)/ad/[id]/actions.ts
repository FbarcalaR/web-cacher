"use server";

import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
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
