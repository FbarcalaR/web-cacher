import { asc, desc, inArray } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db/client";
import { adPhotos, ads } from "@/lib/db/schema";
import { formatCents, formatSqm, joinAddress } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await db()
    .select({
      id: ads.id,
      title: ads.title,
      city: ads.addressCity,
      zip: ads.addressZip,
      priceColdCents: ads.priceColdCents,
      sizeSqm: ads.sizeSqm,
      status: ads.status,
      notes: ads.notes,
    })
    .from(ads)
    .orderBy(desc(ads.savedAt));

  if (rows.length === 0) return <EmptyState />;

  const covers = await db()
    .select({
      adId: adPhotos.adId,
      blobUrl: adPhotos.blobUrl,
      position: adPhotos.position,
    })
    .from(adPhotos)
    .where(
      inArray(
        adPhotos.adId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(adPhotos.position));

  const coverByAd = new Map<string, string>();
  for (const c of covers) {
    if (!coverByAd.has(c.adId)) coverByAd.set(c.adId, c.blobUrl);
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((ad) => {
        const cover = coverByAd.get(ad.id) ?? null;
        const location = joinAddress([ad.zip, ad.city]);
        return (
          <li key={ad.id}>
            <Link
              href={`/ad/${ad.id}`}
              className="flex gap-3 rounded-xl border border-border bg-background p-3 transition active:bg-muted"
            >
              <div className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
                {cover ? (
                  <Image
                    src={cover}
                    alt=""
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="line-clamp-2 text-sm font-semibold leading-snug">{ad.title}</h2>
                  <StatusBadge status={ad.status} />
                </div>
                {location ? (
                  <p className="text-xs text-muted-foreground">{location}</p>
                ) : null}
                <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
                  {ad.priceColdCents != null ? (
                    <span className="font-medium text-foreground">
                      {formatCents(ad.priceColdCents)}
                    </span>
                  ) : null}
                  {ad.sizeSqm ? <span>{formatSqm(ad.sizeSqm)}</span> : null}
                </div>
                {ad.notes ? (
                  <p className="line-clamp-1 text-xs italic text-muted-foreground">
                    {ad.notes}
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">No ads yet</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Share an ImmoScout24 or Immowelt URL into web-cacher from your phone to save your first
        ad.
      </p>
    </section>
  );
}
