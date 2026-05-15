CREATE TYPE "public"."ad_source" AS ENUM('immoscout24', 'immowelt');--> statement-breakpoint
CREATE TYPE "public"."ad_status" AS ENUM('new', 'contacted', 'replied', 'rejected', 'archived');--> statement-breakpoint
CREATE TABLE "ad_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"blob_path" text NOT NULL,
	"position" integer NOT NULL,
	"width" integer,
	"height" integer
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "ad_source" NOT NULL,
	"source_id" text NOT NULL,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"description_html" text DEFAULT '' NOT NULL,
	"price_cold_cents" integer,
	"price_warm_cents" integer,
	"deposit_cents" integer,
	"size_sqm" numeric(6, 2),
	"rooms" numeric(3, 1),
	"address_street" text,
	"address_zip" text,
	"address_city" text,
	"features" text[] DEFAULT '{}' NOT NULL,
	"raw_payload" jsonb,
	"notes" text,
	"status" "ad_status" DEFAULT 'new' NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_photos" ADD CONSTRAINT "ad_photos_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_photos_ad_position_uq" ON "ad_photos" USING btree ("ad_id","position");--> statement-breakpoint
CREATE INDEX "ad_photos_ad_id_idx" ON "ad_photos" USING btree ("ad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_source_source_id_uq" ON "ads" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "ads_saved_at_idx" ON "ads" USING btree ("saved_at");