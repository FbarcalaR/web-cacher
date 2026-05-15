# Implementation plan

Six phases. Each phase is shippable on its own — you can stop after any of
them and still have something useful.

## Phase 0 — Scaffold (½ day)

- `create-next-app` with TypeScript + Tailwind + App Router.
- ESLint + Prettier + `tsconfig` strict.
- Drizzle config + first migration (empty schema).
- Vercel project linked; Postgres and Blob provisioned; env vars set.
- Password-protect middleware that wraps the whole app.
- Deploy a "hello" page behind the password.

**Done when:** the homepage is reachable on `*.vercel.app` only with the
password.

## Phase 1 — Data model + ad detail page (1 day)

- Drizzle schema for `ads` and `ad_photos`.
- Migrations applied to production Postgres.
- Seed one ad manually via SQL with two local image files.
- `/ad/[id]` page renders title, price, description, gallery, address,
  Google Maps link, notes (read-only for now).
- `/` list page shows seeded ad as a card.

**Done when:** the seeded ad renders end-to-end on production.

## Phase 2 — Parsers (1–2 days)

- `lib/parsers/immoscout24.ts` — input: HTML string + URL. Output: typed
  `ParsedAd`. Prefers `__NEXT_DATA__` / JSON-LD; CSS selectors as fallback.
- `lib/parsers/immowelt.ts` — same shape.
- Unit tests against fixtures: save 3–5 real expose HTML files per site into
  `lib/parsers/__fixtures__/` and assert extracted fields.
- Zod schema `ParsedAdSchema` shared with the ingest endpoint.

**Done when:** all fixture tests pass for both sites.

## Phase 3 — Ingest endpoint + manual paste UI (½ day)

- `/add` page: textarea for URL + textarea for raw HTML (manual paste).
- `POST /api/ads/ingest` accepts `{ url, html, imageBlobs? }`, parses,
  uploads any provided images to Vercel Blob, writes to DB, returns the new
  ad's URL.
- Server-side `fetch(url)` fallback when only `url` is given (will likely
  403; that's fine, the UI surfaces it).

**Done when:** you can paste an ad's HTML and end up with a saved ad page.
This is the MVP — phases 0–3 cover the headline use case.

## Phase 4 — Browser extension (1–2 days)

- MV3 manifest with `activeTab`, `storage`, host permissions for
  `*.immobilienscout24.de` and `*.immowelt.de`.
- Content scripts on both sites that surface a "Save to web-cacher" button
  and call the shared parser.
- Background script: downloads each image with `fetch` (browser context),
  POSTs to a presigned Vercel Blob URL, then POSTs metadata to
  `/api/ads/ingest`.
- Options page: API base URL + password.
- Build script: `pnpm extension:build` produces a `dist/` you can load
  unpacked in Chrome.

**Done when:** clicking the extension button on a live ImmoScout24 or
Immowelt page produces a saved ad in the web app within a few seconds.

## Phase 5 — List view polish + notes/status (½ day)

- Notes textarea on `/ad/[id]` with autosave (server action, debounced).
- Status dropdown (`new` / `contacted` / `replied` / `rejected` / `archived`)
  on both list cards and detail page.
- Filter chips on `/` for status.
- Sort: newest first, price asc/desc, size asc/desc.

**Done when:** you can triage saved ads without leaving the list view.

## Phase 6 — Nice-to-haves (open-ended)

- Quick capture from mobile via PWA share target → falls back to paste URL.
- "Refresh" button on an ad: re-run the server-side fetch + parse; diff and
  surface what changed (price drop, taken down).
- Duplicate detection: same address from a different platform.
- Export: zip of all images + JSON.

## Out of scope (for now)

- Multi-user, sharing, public links.
- Map view, geocoding, commute calculations.
- Email/RSS alerting on new ads.
- Other platforms (Kleinanzeigen, WG-Gesucht, etc.) — easy to add later by
  dropping in a new parser, but not part of v1.
