# Implementation plan

Six phases. Each is shippable on its own — you can stop after any of them
and still have something useful.

The ordering deliberately puts **capturing real ad HTML** before writing
parsers. We don't know yet exactly which field names each site exposes;
we only know which fields we want to display. Phase 1 fixes that by
saving real fixtures, then phase 2 writes parsers against them.

## Phase 0 — Scaffold (½ day)

- `create-next-app` with TypeScript + Tailwind + App Router.
- ESLint + Prettier + `tsconfig` strict.
- Drizzle config + first (empty) migration.
- Vercel project linked; Postgres + Blob provisioned; env vars set.
- Password-protected middleware (signed-cookie session) wrapping the
  whole app.
- Mobile-first base layout with a header, content area, and a 100dvh
  shell that feels right inside a PWA.
- Deploy a "hello" page behind the password.

**Done when:** the homepage is reachable on `*.vercel.app` only with the
password and feels native on a phone.

## Phase 1 — Fixtures + data model + read-only ad page (1 day)

- **By hand**, save 3–5 real expose pages from each site as `.html`
  files into `lib/parsers/__fixtures__/immoscout24/` and `.../immowelt/`.
  (View Source → Save As, from a desktop browser. One-time chore.)
- Drizzle schema for `ads` and `ad_photos`; first real migration.
- `lib/db/client.ts` exporting a typed db instance.
- SQL seed script with one fake ad + two local images uploaded to Blob.
- `/ad/[id]` page renders title, price, description (sanitised HTML),
  gallery (next/image, swipeable), address, Google Maps link, notes
  (read-only for now).
- `/` list page shows the seeded ad as a card.

**Done when:** the seeded ad renders end-to-end on production and we
have fixtures committed for parser work.

## Phase 2 — Parsers (1–2 days)

- Open the fixtures from Phase 1, identify `__NEXT_DATA__` / JSON-LD
  blob shapes, document the real field paths in `scraping-notes.md`.
- `lib/parsers/types.ts` — `ParsedAd` + `ParsedPhoto` Zod schemas.
- `lib/parsers/immoscout24.ts` — input `(url, html)`, output
  `ParsedAd`. Tries `__NEXT_DATA__` first, falls back to JSON-LD, then
  CSS selectors.
- `lib/parsers/immowelt.ts` — same shape.
- Unit tests asserting every fixture parses to expected fields.
- `lib/parsers/index.ts` `parseAd(url, html)` that routes by hostname.

**Done when:** every fixture parses to the right values in CI.

## Phase 3 — Scraping service + ingest endpoint (1 day)

- Evaluate 2–3 free-tier scraping services (ScrapingBee, ScraperAPI,
  ZenRows). Pick the one whose rendered HTML on an actual ImmoScout24 /
  Immowelt expose contains the same `__NEXT_DATA__` our fixtures had.
- `lib/scrape/client.ts` — thin adapter: `fetchRenderedHtml(url)`.
- `POST /api/ads/ingest`:
  1. Accept `{ url }`.
  2. Reject if hostname isn't a known one.
  3. Fetch rendered HTML via scraper.
  4. `parseAd(url, html)`.
  5. Download each image URL to Vercel Blob (server-side fetch, with
     a `Referer` of the source site).
  6. Upsert by `(source, source_id)`.
  7. Return `{ id }`.
- `/add` page (desktop fallback / manual): URL textarea → calls
  ingest → redirects to `/ad/[id]`.
- Friendly error states when the scraper returns non-200 or the
  parser returns empty.

**Done when:** pasting an ImmoScout24 or Immowelt URL into `/add`
produces a saved ad with photos, end-to-end, on production. **This is
the MVP** — phases 0–3 cover the headline use case from desktop.

## Phase 4 — PWA + Android share target (½ day)

- `public/manifest.webmanifest`: icons, theme colour, `display:
  standalone`, `share_target` entry → `/share-target`.
- Service worker just enough to make the PWA installable (no offline
  needed in v1).
- `/share-target` route handler: reads `url` query param, calls the
  ingest endpoint, shows a "Saving…" state, redirects to the new ad.
- "Install on home screen" prompt + a one-paragraph help page
  explaining the install + share flow on Android.

**Done when:** sharing an ad from Chrome on your Android phone via
the share sheet results in a saved ad in under 10 seconds.

## Phase 5 — Notes, status, list polish (½ day)

- Inline notes editor on `/ad/[id]` with debounced autosave.
- Status dropdown (`new` / `contacted` / `replied` / `rejected` /
  `archived`) on `/ad/[id]` and `/` cards.
- Status filter chips on `/`.
- Sort sheet on `/` (saved date / price / size, asc/desc).
- Delete-ad action with confirm; cascade-deletes photos in Blob.

**Done when:** you can triage saved ads on your phone without ever
opening the original site.

## Phase 6 — Nice-to-haves / hedges (open-ended)

- **iOS support.** Add a parallel iOS Shortcut + manifest tweaks once
  you start using iPhone.
- **On-device HTML capture fallback.** Document an Android HTTP
  Shortcuts recipe that POSTs the page HTML to
  `/api/ads/ingest-html` — used if the scraping service quota or
  reliability disappoints.
- **"Refresh" action.** Re-fetch + diff; show "price changed", "taken
  down".
- **Duplicate detection** by `(zip, street, size_sqm)` across sources.
- **Export.** Zip of all images + JSON dump.

## Out of scope (for now)

- Multi-user, sharing, public links.
- Map view, geocoding, commute calculations.
- Email/RSS alerting on new ads.
- Other platforms (Kleinanzeigen, WG-Gesucht, etc.) — easy to add later
  by dropping in a new parser, but not part of v1.
