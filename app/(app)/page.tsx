import { type SQL, and, asc, desc, eq, inArray } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";

import { SortControl } from "@/components/sort-control";
import { StatusFilter } from "@/components/status-filter";
import { StatusSelect } from "@/components/status-select";
import { db } from "@/lib/db/client";
import { type Ad, adPhotos, ads } from "@/lib/db/schema";
import { formatCents, formatSqm, joinAddress } from "@/lib/format";
import { parseSort, parseStatus, sortValue } from "@/lib/list-params";

export const dynamic = "force-dynamic";

const SORT_COLUMNS = {
  savedAt: ads.savedAt,
  priceColdCents: ads.priceColdCents,
  sizeSqm: ads.sizeSqm,
} as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const sort = parseSort(sp.sort);

  const where: SQL | undefined = status ? eq(ads.status, status) : undefined;
  const orderColumn = SORT_COLUMNS[sort.key];
  const orderClause = sort.dir === "asc" ? asc(orderColumn) : desc(orderColumn);

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
    .where(where)
    .orderBy(orderClause, desc(ads.savedAt));

  return (
    <section className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <StatusFilter current={status} sort={sortValue(sort)} />
        <SortControl current={sortValue(sort)} status={status} />
      </div>

      {rows.length === 0 ? (
        <EmptyState filtered={status !== null} />
      ) : (
        <AdList rows={rows} />
      )}
    </section>
  );
}

type Row = {
  id: string;
  title: string;
  city: string | null;
  zip: string | null;
  priceColdCents: number | null;
  sizeSqm: string | null;
  status: Ad["status"];
  notes: string | null;
};

async function AdList({ rows }: { rows: Row[] }) {
  const covers = await db()
    .select({
      adId: adPhotos.adId,
      blobUrl: adPhotos.blobUrl,
    })
    .from(adPhotos)
    .where(
      and(
        inArray(
          adPhotos.adId,
          rows.map((r) => r.id),
        ),
        eq(adPhotos.position, 0),
      ),
    );
  const coverByAd = new Map(covers.map((c) => [c.adId, c.blobUrl]));

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((ad) => {
        const cover = coverByAd.get(ad.id) ?? null;
        const location = joinAddress([ad.zip, ad.city]);
        return (
          <li
            key={ad.id}
            className="relative rounded-xl border border-border bg-background transition active:bg-muted"
          >
            <Link href={`/ad/${ad.id}`} className="flex gap-3 p-3">
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
              <div className="flex min-w-0 flex-1 flex-col gap-1 pr-2">
                <h2 className="line-clamp-2 pr-16 text-sm font-semibold leading-snug">
                  {ad.title}
                </h2>
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
            <div className="absolute right-3 top-3">
              <StatusSelect adId={ad.id} status={ad.status} size="sm" onClickStop />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-lg font-semibold tracking-tight">No ads match</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Nothing in that status. Tap &ldquo;All&rdquo; above to clear the filter.
        </p>
      </section>
    );
  }
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
