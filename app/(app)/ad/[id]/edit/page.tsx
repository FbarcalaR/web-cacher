import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db/client";
import { adPhotos, ads } from "@/lib/db/schema";

import { EditForm } from "./form";
import { PhotoManager } from "./photos";

export const dynamic = "force-dynamic";

export default async function EditAdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [ad] = await db().select().from(ads).where(eq(ads.id, id)).limit(1);
  if (!ad) notFound();

  const photos = await db()
    .select()
    .from(adPhotos)
    .where(eq(adPhotos.adId, id))
    .orderBy(asc(adPhotos.position));

  return (
    <article className="flex flex-col gap-6 pb-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Edit ad</h1>
          <Link
            href={`/ad/${id}`}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            Cancel
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Fix anything the scraper missed. Photo changes save immediately; the rest
          save on submit.
        </p>
      </header>

      <PhotoManager adId={id} photos={photos} />

      <EditForm ad={ad} />
    </article>
  );
}
