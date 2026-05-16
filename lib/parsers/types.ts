import { z } from "zod";

import { adSource } from "@/lib/db/schema";

export const parsedPhotoSchema = z.object({
  url: z.string().url(),
  caption: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

export type ParsedPhoto = z.infer<typeof parsedPhotoSchema>;

export const parsedAdSchema = z.object({
  source: z.enum(adSource.enumValues),
  sourceId: z.string().min(1),
  sourceUrl: z.string().url(),
  title: z.string().min(1),
  descriptionHtml: z.string(),
  priceColdCents: z.number().int().positive().nullable(),
  priceWarmCents: z.number().int().positive().nullable(),
  depositCents: z.number().int().positive().nullable(),
  sizeSqm: z.string().nullable(),
  rooms: z.string().nullable(),
  addressStreet: z.string().nullable(),
  addressZip: z.string().nullable(),
  addressCity: z.string().nullable(),
  features: z.array(z.string()),
  photos: z.array(parsedPhotoSchema),
  rawPayload: z.record(z.unknown()),
});

export type ParsedAd = z.infer<typeof parsedAdSchema>;
