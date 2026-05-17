# Architecture

## Goals

- **Personal use only.** One user, no sign-up flow, no multi-tenancy.
- **Mobile-first.** Android now, iOS later. Capture-from-share-sheet is the
  primary flow; desktop is a nice-to-have for browsing.
- **Quick to ship.** Tiny surface area, boring tech, no infra to babysit.
- **Deployable on Vercel** with a free/cheap tier.
- **Snapshots survive the source.** Once an ad is saved, taking it down on
  the origin site must not affect us.

Non-goals: search/discovery across listings, map visualisations, sharing,
native apps, anything multi-user.

## Stack

| Concern         | Choice                                  | Why                                                                 |
| --------------- | --------------------------------------- | ------------------------------------------------------------------- |
| Framework       | Next.js 15 (App Router) + React 19 + TS | First-class on Vercel. Server Actions cover the API surface.        |
| Styling         | Tailwind CSS v4                         | Fast UI, mobile-first by default.                                   |
| UI primitives   | shadcn/ui (copy-in)                     | No runtime dep, just the components we need.                        |
| Database        | Vercel Postgres (Neon under the hood)   | Free tier covers a personal archive easily; native Vercel binding.  |
| ORM             | Drizzle                                 | No codegen step, plain SQL feel, small bundle.                      |
| Photo storage   | Vercel Blob                             | One-line upload from a server action; signed-URL reads.             |
| Validation      | Zod                                     | Shared schemas for server actions and PWA front-end.                |
| Ingestion       | **Free-tier scraping service** (primary), **on-device HTML capture** (fallback) | See [Ingestion](#ingestion). |
| Install         | **Installable PWA** with Web Share Target | Phone shows wohnvault in the Android share sheet; no app store.  |
| Auth            | Single shared password via middleware   | One user. No need for a user table or OAuth.                        |

## Ingestion

This is the most important architectural decision.

Both ImmoScout24 and Immowelt return **HTTP 403** to plain server-side
fetches from cloud egress IPs — confirmed by direct test against
`immowelt.de` and `immobilienscout24.de` from this environment. They sit
behind aggressive bot protection (Cloudflare / DataDome class). A Vercel
function doing a vanilla `fetch` will, in practice, be blocked the same way.

Since the user only has the URL on their phone (no easy way to capture
rendered HTML from mobile Chrome), we route the URL through a **scraping
service** that fronts a residential-proxied headless browser. For
personal-use volume (a handful of ads per week), free tiers comfortably
cover the call budget.

### Capture flow

1. User browsing ImmoScout24 / Immowelt in mobile Chrome taps **Share** →
   picks **wohnvault** (we register as a Web Share Target).
2. The PWA receives `?url=...`, displays a "Saving…" screen, and POSTs the
   URL to `/api/ads/ingest`.
3. Server calls the scraping service: "fetch this URL with a real browser,
   return the rendered HTML".
4. Server hands the HTML + URL to `parseAd(url, html)`, which routes to
   the right per-site parser.
5. For each image URL in the parsed payload: server fetches the image
   (image hosts don't bot-protect their CDNs the same way) and uploads
   the bytes to Vercel Blob.
6. Server writes the ad row + photo rows in one transaction.
7. PWA redirects the user to `/ad/[id]`.

Total round-trip target: under 10 seconds. Acceptable for "save this for
later".

### Picking the scraping service

We will **evaluate 2–3 free tiers** in Phase 3 (see `plan.md`) and commit
to one. Candidates:

| Service       | Free tier              | Notes                                                      |
| ------------- | ---------------------- | ---------------------------------------------------------- |
| ScrapingBee   | 1,000 credits/mo       | JS rendering ~5–25 credits/call → ~40–200 fetches free.    |
| ScraperAPI    | 1,000 credits/mo       | Similar pricing model.                                     |
| ZenRows       | 1,000 credits/mo       | Built-in anti-bot bypass + JS rendering.                   |
| Apify         | $5 platform credit/mo  | Has prebuilt actors for both sites — least work if they're maintained, but variable quality. |

Whichever wins, we hide it behind a `lib/scrape/client.ts` adapter (one
method: `fetchRenderedHtml(url): Promise<string>`) so swapping later is a
one-file change.

### On-device fallback (later)

If free tiers turn out to be insufficient or unreliable, the escape hatch
is **HTTP Shortcuts** (Android) or **Shortcuts** (iOS, when we add iOS):
the phone's own browser already passes the bot checks, so a Shortcut that
fetches the page HTML in the user's session and POSTs it to
`/api/ads/ingest-html` sidesteps the problem entirely. Documented as a
fallback path; not built in v1.

## Data model

One table is enough. Photos are a separate table because they're 1:N.

This is the **target** schema — the shape we want to display. It's not
derived from the source sites' field names; the parsers translate from
"whatever the site happens to expose" to this. The raw extracted blob is
kept in `raw_payload` so we can re-extract historical ads after a parser
update without re-fetching the source.

```
ads
  id                    text  pk (cuid)
  source                text  enum: 'immoscout24' | 'immowelt'
  source_id             text  the platform's expose/listing id
  source_url            text
  title                 text
  description_html      text
  price_cold_cents      int   nullable
  price_warm_cents      int   nullable
  deposit_cents         int   nullable
  size_sqm              numeric(6,2) nullable
  rooms                 numeric(3,1) nullable
  address_street        text  nullable
  address_zip           text  nullable
  address_city          text  nullable
  features              text[]  ('Balkon', 'EBK', ...)
  raw_payload           jsonb   the full extracted blob, for reprocessing
  notes                 text    user's own notes (sent message? replied?)
  status                text    enum: 'new' | 'contacted' | 'replied' | 'rejected' | 'archived'
  saved_at              timestamptz
  unique(source, source_id)

ad_photos
  id                    text  pk (cuid)
  ad_id                 text  fk -> ads.id, on delete cascade
  blob_url              text  Vercel Blob URL
  blob_path             text  path inside the blob store
  position              int   ordering within the ad
  width, height         int   nullable
```

`source` + `source_id` unique → re-saving the same ad updates instead of
duplicating.

### How the schema gets confirmed

The exact display fields above are the universal shape of any rental ad
(title, prices, size, rooms, address, photos, description, features) — we
can lock them in now. **What we don't yet know** is which field names
each site actually exposes (e.g. is it `obj_baseRent`, `baseRent`,
`prices.cold`?). That gets answered in **Phase 1**: we capture 3–5 real
HTML fixtures from each site (saved by hand from a desktop browser the
first time, then automatable through the scraping service from Phase 3
onwards), inspect their `__NEXT_DATA__` / JSON-LD blobs, and write the
parsers against what we actually see. If those reveal a field we want
that isn't in the schema, we add a column then.

## Image handling

- Always download the **largest** variant offered (both sites expose
  several).
- Store in Vercel Blob under `ads/{ad_id}/{position}.{ext}`.
- Vercel Blob URLs are public-by-default; acceptable for a single-user
  app.
- No transcoding on ingest; `next/image` resizes for the UI.
- Images are fetched server-side from the CDNs (e.g.
  `pictures.immobilienscout24.de`, `pictures.immowelt.de`). These CDNs
  generally serve directly without bot-checking; if we hit hotlink
  protection we add a `Referer: https://www.<site>/` header.

## UI

Mobile-first throughout. Looks decent on desktop but never optimised
for it.

- `/` — list of saved ads, newest first. Single-column card list on
  mobile, grid on wider viewports. Cover photo, price, size, city,
  status badge, notes preview. Filter chips for status. Bottom-sheet
  sort.
- `/ad/[id]` — full ad: swipeable photo gallery (full-screen on tap),
  description, metadata block, "Open in Google Maps" link, "Open
  original" link, inline-editable notes + status dropdown.
- `/share-target` — handles the Web Share Target POST/GET, kicks off
  ingestion, shows progress, redirects to the new ad.
- `/add` — manual URL paste form, for when the share sheet isn't an
  option (desktop, or fixing a failed ingest).

Google Maps link format:
`https://www.google.com/maps/search/?api=1&query=<urlencoded full address>`.

### PWA + share target

- `manifest.webmanifest` with `display: standalone`, an icon, and a
  `share_target` entry pointing at `/share-target` (method `GET` with
  `url` param — broadest Android compatibility).
- "Add to Home Screen" prompt the first time you visit on Android. From
  then on the app appears in the share sheet.

## Auth

Edge middleware checks a signed cookie set by a single `/login` form with
a password from `APP_PASSWORD`. Everything behind it including `/api/*`.
Cookie is long-lived (90 days, rolling) so it survives PWA restarts.

## Hosting & ops

- **Hosting:** Vercel (Hobby tier sufficient).
- **Database:** Vercel Postgres / Neon (free tier).
- **Blob:** Vercel Blob (free tier 1 GB; paid is cheap).
- **Scraping service:** free tier; secret in `SCRAPER_API_KEY`.
- **Backups:** Neon's point-in-time recovery on the free tier is fine for
  this use case. Manual `pg_dump` if extra paranoia is needed.
- **Secrets:** Vercel project env vars: `APP_PASSWORD`,
  `SESSION_SECRET`, `POSTGRES_URL`, `BLOB_READ_WRITE_TOKEN`,
  `SCRAPER_API_KEY`.

## Repo layout

```
/                      Next.js app root
  app/                 routes (App Router)
    (auth)/            login flow
    ad/[id]/           detail page
    add/               manual paste form
    share-target/      Web Share Target handler
    api/
      ads/
  components/          UI
  lib/
    db/                drizzle schema + client
    scrape/            scraping-service adapter
    parsers/           per-site DOM/JSON-LD parsers
      __fixtures__/    saved expose HTML per site
    auth.ts            middleware + cookie helpers
  drizzle/             migrations
  public/
    manifest.webmanifest
docs/                  this folder
```

## Risks

1. **Free-tier scraping quota runs out.** Mitigation: caching of identical
   URLs within a short window; eventually fall back to on-device HTML
   capture via Android HTTP Shortcuts.
2. **Scraping service can't bypass the bot check either.** Mitigation:
   evaluate 2–3 in Phase 3 before committing; on-device fallback always
   available.
3. **Site HTML changes.** Parsers will break. Mitigation: parsers are
   small and well-tested against fixtures; `raw_payload` lets us
   re-extract historical ads after a parser update.
4. **Vercel function timeouts** (10s on Hobby) if rendering is slow.
   Mitigation: parse + image-upload runs after a quick acknowledge;
   PWA polls `/api/ads/{id}/status` until ready.
