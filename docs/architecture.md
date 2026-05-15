# Architecture

## Goals

- **Personal use only.** One user, no sign-up flow, no multi-tenancy.
- **Quick to ship.** Tiny surface area, boring tech, no infra to babysit.
- **Deployable on Vercel** with a free/cheap tier.
- **Snapshots survive the source.** Once an ad is saved, taking it down on the
  origin site must not affect us.

Non-goals: search/discovery across listings, map visualisations, sharing,
mobile app, anything multi-user.

## Stack

| Concern         | Choice                                  | Why                                                                 |
| --------------- | --------------------------------------- | ------------------------------------------------------------------- |
| Framework       | Next.js 15 (App Router) + React 19 + TS | First-class on Vercel. Server Actions cover the API surface.        |
| Styling         | Tailwind CSS v4                         | Fast UI, no design system needed.                                   |
| UI primitives   | shadcn/ui (copy-in)                     | No runtime dep, just the components we need.                        |
| Database        | Vercel Postgres (Neon under the hood)   | Free tier covers a personal archive easily; native Vercel binding.  |
| ORM             | Drizzle                                 | No codegen step, plain SQL feel, small bundle.                      |
| Photo storage   | Vercel Blob                             | One-line upload from a server action; signed-URL reads.             |
| Validation      | Zod                                     | Shared schemas for server actions and the browser extension.        |
| Ingestion       | **Browser extension** (primary) + server-side fetch (fallback) | See [Ingestion](#ingestion). |
| Auth            | Single shared password via middleware   | One user. No need for a user table or OAuth.                        |

## Ingestion

This is the most important architectural decision. Both ImmoScout24 and
Immowelt return **HTTP 403** to plain server-side fetches from cloud egress
IPs — confirmed by direct test against `immowelt.de` and
`immobilienscout24.de` from this environment. They sit behind aggressive bot
protection (Cloudflare/DataDome class). A Vercel function will, in practice,
be blocked the same way.

Three options were considered:

| Option | How it works | Reliability | Cost | Effort |
| --- | --- | --- | --- | --- |
| **A. Browser extension** | User clicks "Save to web-cacher" while viewing the ad. The extension reads the rendered DOM (and the `__NEXT_DATA__` / JSON-LD blobs), downloads the images using the user's own browser session, and POSTs everything to the Vercel API. | High — uses the user's real, trusted session. | Free. | Small extension + tolerant server endpoint. |
| **B. Headless browser + residential proxy** | Vercel function calls a service like Browserbase / Bright Data / ScrapingBee with a residential proxy to render the page server-side. | Medium — gets blocked more often as detection improves. | ~$30–50/mo entry tiers. | Medium. |
| **C. Server-side fetch with rotating proxies** | Plain `fetch` plus a proxy header pool. | Low — confirmed blocked today. | Variable. | Small but fragile. |

**Decision: A (browser extension) as the primary path, with C as a best-effort
fallback when the extension isn't available** (e.g. mobile). B is a future
escape hatch if the fallback proves too unreliable and we don't want to
install the extension.

### Extension flow

1. User is on `immobilienscout24.de/expose/...` or `immowelt.de/expose/...`.
2. Clicks the extension button (or context menu).
3. Content script extracts:
   - Title, price (cold/warm/deposit), size, rooms, address fields.
   - Description (HTML preserved).
   - Features / `Ausstattung` list.
   - Image URLs (full-size variants — see [Image handling](#image-handling)).
   - Source URL, source platform, original listing ID.
   - Source extracted from `__NEXT_DATA__` or JSON-LD where possible; CSS
     selectors as a fallback.
4. Background script downloads each image using `fetch` from the user's
   browser (so cookies, referer, and TLS fingerprint all look legitimate).
5. POSTs a single multipart request to `/api/ads/ingest` with the JSON
   payload + image blobs.
6. Server validates with Zod, stores blobs in Vercel Blob, writes the ad row,
   redirects user to the saved ad page.

### Server-side fallback

`/api/ads/ingest-url` accepts a bare URL. The server tries a polite `fetch`
(realistic UA, accept-language). If it gets a 200, it parses the same way the
extension does. If it gets a 403, the response tells the user to install the
extension or paste raw HTML. **Treated as best-effort, not guaranteed.**

## Data model

One table is enough. Photos are a separate table because they're 1:N.

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

`source` + `source_id` is unique so re-saving the same ad updates instead of
duplicating.

## Image handling

- Always download the **largest** variant offered (both sites expose several).
- Store in Vercel Blob under `ads/{ad_id}/{position}.{ext}`.
- We store the blob URL directly (Vercel Blob URLs are public-by-default;
  acceptable for a single-user app).
- No transcoding on ingest; rely on `next/image` for resizing in the UI.

## UI

- `/` — list of saved ads, newest first. Card view with cover photo, price,
  size, city, status badge, notes preview.
- `/ad/[id]` — full ad: gallery, description, sidebar with metadata, "Open in
  Google Maps" link, "Open original" link, editable notes + status.
- `/add` — paste a URL (server-side fallback path). Primary path is the
  extension, no dedicated UI needed there.

Google Maps link format:
`https://www.google.com/maps/search/?api=1&query=<urlencoded full address>`.

## Auth

Edge middleware reads `Authorization: Basic …` (or a signed cookie set by a
`/login` page). Single password from `APP_PASSWORD` env var. Everything
behind it including `/api/*`. The extension stores the password in
`chrome.storage.local` and sends it on each request.

## Hosting & ops

- **Hosting:** Vercel (Hobby tier sufficient).
- **Database:** Vercel Postgres / Neon (free tier).
- **Blob:** Vercel Blob (free tier 1 GB; paid is cheap).
- **Backups:** Neon's point-in-time recovery on the free tier is fine for this
  use case. Manual `pg_dump` if extra paranoia is needed.
- **Secrets:** Vercel project env vars: `APP_PASSWORD`, `POSTGRES_URL`,
  `BLOB_READ_WRITE_TOKEN`.

## Repo layout

```
/                      Next.js app root
  app/                 routes (App Router)
  components/          UI
  lib/
    db/                drizzle schema + client
    parsers/           per-site DOM/JSON-LD parsers (shared with extension)
    auth.ts            password middleware
  drizzle/             migrations
extension/             browser extension (MV3)
  manifest.json
  background.ts
  content/
    immoscout24.ts
    immowelt.ts
  popup/
docs/                  this folder
```

The `lib/parsers/` modules are framework-free TypeScript so the extension
can import them directly via a small bundling step (esbuild) — one source of
truth for what fields look like on each site.

## Risks

1. **Bot detection escalates** and even the user's-own-browser path starts
   getting captchas mid-extraction. Mitigation: keep raw HTML/`__NEXT_DATA__`
   in `raw_payload` so we can re-parse offline if a site changes structure.
2. **Image hotlink protection** rejects requests from the user's tab if the
   `Referer` header is stripped by the extension. Mitigation: keep the
   `Referer` and download in the content script (same origin as the page).
3. **Site HTML changes.** Parsers will break. Mitigation: parsers are small
   and well-tested; `raw_payload` lets us re-extract historical ads after a
   parser update.
4. **Vercel function payload limits** (4.5 MB body on Hobby). A listing with
   30 large photos will exceed this. Mitigation: extension uploads photos
   one-by-one to a presigned Blob URL, then POSTs the metadata.
