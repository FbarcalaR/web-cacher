import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import sanitizeHtml from "sanitize-html";

import { DeleteAdButton } from "@/components/delete-ad-button";
import { NotesEditor } from "@/components/notes-editor";
import { StatusSelect } from "@/components/status-select";
import { db } from "@/lib/db/client";
import { adPhotos, ads } from "@/lib/db/schema";
import {
  formatCents,
  formatRooms,
  formatSqm,
  googleMapsLink,
  joinAddress,
} from "@/lib/format";

import { Gallery } from "./gallery";

export const dynamic = "force-dynamic";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "ul", "ol", "li", "h2", "h3", "a"],
  allowedAttributes: { a: ["href"] },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: "noopener nofollow",
        target: "_blank",
      },
    }),
  },
};

export default async function AdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [ad] = await db().select().from(ads).where(eq(ads.id, id)).limit(1);
  if (!ad) notFound();

  const photos = await db()
    .select()
    .from(adPhotos)
    .where(eq(adPhotos.adId, id))
    .orderBy(asc(adPhotos.position));

  const fullAddress = joinAddress([ad.addressStreet, ad.addressZip, ad.addressCity]);
  const cityOnly = joinAddress([ad.addressZip, ad.addressCity]);
  const safeDescription = sanitizeHtml(ad.descriptionHtml, SANITIZE_OPTIONS);

  return (
    <article className="flex flex-col gap-5 pb-6">
      {photos.length > 0 ? <Gallery photos={photos} /> : null}

      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold leading-snug tracking-tight">{ad.title}</h1>
          <StatusSelect adId={ad.id} status={ad.status} />
        </div>
        {cityOnly ? <p className="text-sm text-muted-foreground">{cityOnly}</p> : null}
      </header>

      <PriceBlock
        cold={ad.priceColdCents}
        warm={ad.priceWarmCents}
        size={ad.sizeSqm}
        rooms={ad.rooms}
      />

      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-muted-foreground">Adresse</h2>
        {fullAddress ? (
          <a
            href={googleMapsLink(fullAddress)}
            target="_blank"
            rel="noopener"
            className="text-base underline decoration-dotted underline-offset-4"
          >
            {fullAddress}
          </a>
        ) : (
          <p className="text-base text-muted-foreground">—</p>
        )}
      </section>

      {ad.features.length > 0 ? (
        <section className="flex flex-wrap gap-2">
          {ad.features.map((f) => (
            <span
              key={f}
              className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
            >
              {f}
            </span>
          ))}
        </section>
      ) : null}

      {safeDescription ? (
        <section
          className="flex flex-col gap-3 text-sm leading-relaxed [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-foreground"
          dangerouslySetInnerHTML={{ __html: safeDescription }}
        />
      ) : null}

      <NotesEditor adId={ad.id} initial={ad.notes} />

      <footer className="flex flex-col gap-2">
        <a
          href={ad.sourceUrl}
          target="_blank"
          rel="noopener"
          className="block rounded-full border border-border bg-background px-4 py-2.5 text-center text-sm font-medium"
        >
          Open original
        </a>
        <DeleteAdButton adId={ad.id} />
      </footer>
    </article>
  );
}

function PriceBlock({
  cold,
  warm,
  size,
  rooms,
}: {
  cold: number | null;
  warm: number | null;
  size: string | null;
  rooms: string | null;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm sm:grid-cols-4">
      <Stat label="Kaltmiete" value={formatCents(cold) ?? "—"} />
      <Stat label="Warmmiete" value={formatCents(warm) ?? "—"} />
      <Stat label="Fläche" value={formatSqm(size) ?? "—"} />
      <Stat label="Zimmer" value={formatRooms(rooms) ?? "—"} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
