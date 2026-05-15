import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const adSource = pgEnum("ad_source", ["immoscout24", "immowelt"]);
export const adStatus = pgEnum("ad_status", [
  "new",
  "contacted",
  "replied",
  "rejected",
  "archived",
]);

export const ads = pgTable(
  "ads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    source: adSource("source").notNull(),
    sourceId: text("source_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    descriptionHtml: text("description_html").notNull().default(""),
    priceColdCents: integer("price_cold_cents"),
    priceWarmCents: integer("price_warm_cents"),
    depositCents: integer("deposit_cents"),
    sizeSqm: numeric("size_sqm", { precision: 6, scale: 2 }),
    rooms: numeric("rooms", { precision: 3, scale: 1 }),
    addressStreet: text("address_street"),
    addressZip: text("address_zip"),
    addressCity: text("address_city"),
    features: text("features").array().notNull().default(sql`'{}'`),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown> | null>(),
    notes: text("notes"),
    status: adStatus("status").notNull().default("new"),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ads_source_source_id_uq").on(t.source, t.sourceId),
    index("ads_saved_at_idx").on(t.savedAt),
  ],
);

export const adPhotos = pgTable(
  "ad_photos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    adId: text("ad_id")
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    blobPath: text("blob_path").notNull(),
    position: integer("position").notNull(),
    width: integer("width"),
    height: integer("height"),
  },
  (t) => [
    uniqueIndex("ad_photos_ad_position_uq").on(t.adId, t.position),
    index("ad_photos_ad_id_idx").on(t.adId),
  ],
);

export type Ad = typeof ads.$inferSelect;
export type NewAd = typeof ads.$inferInsert;
export type AdPhoto = typeof adPhotos.$inferSelect;
export type NewAdPhoto = typeof adPhotos.$inferInsert;
export type AdStatus = (typeof adStatus.enumValues)[number];
export type AdSource = (typeof adSource.enumValues)[number];
