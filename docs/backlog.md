# Backlog

Concrete tickets, grouped by phase. Tick them off as we go. Each is sized to
fit in one PR.

## Phase 0 — Scaffold

- [ ] **#0.1** `create-next-app` with TS + Tailwind + App Router; commit baseline.
- [ ] **#0.2** Add Drizzle, Drizzle-kit, `drizzle.config.ts`, empty schema.
- [ ] **#0.3** Add `lib/auth.ts` middleware: HTTP basic against `APP_PASSWORD`.
- [ ] **#0.4** Provision Vercel project, Postgres, Blob; document env vars in `.env.example`.
- [ ] **#0.5** First deploy: hello page behind the password.

## Phase 1 — Data model + viewing

- [ ] **#1.1** Drizzle schema for `ads` and `ad_photos`; first migration.
- [ ] **#1.2** `lib/db/client.ts` exporting a typed db instance.
- [ ] **#1.3** SQL seed script with one fake ad + two local images uploaded to Blob.
- [ ] **#1.4** `/ad/[id]` page: title, price block, description (sanitised HTML), gallery (next/image), address card with Google Maps link, "Open original" button.
- [ ] **#1.5** `/` list page: card grid, cover photo, price/size/city/status, sorted newest first.
- [ ] **#1.6** Empty-state UI for `/` when there are no ads.

## Phase 2 — Parsers

- [ ] **#2.1** `lib/parsers/types.ts` — `ParsedAd` + `ParsedPhoto` types + Zod schema.
- [ ] **#2.2** `lib/parsers/immoscout24.ts` — parse `__NEXT_DATA__` first, fall back to selectors.
- [ ] **#2.3** `lib/parsers/immowelt.ts` — same.
- [ ] **#2.4** Fixtures: 3 ImmoScout24 + 3 Immowelt expose HTML files under `lib/parsers/__fixtures__/`.
- [ ] **#2.5** Vitest setup + tests asserting each fixture parses to expected fields.
- [ ] **#2.6** `lib/parsers/index.ts` `parseAd(url, html)` that routes to the right parser by hostname.

## Phase 3 — Ingest

- [ ] **#3.1** `/add` page with URL + HTML textareas + submit.
- [ ] **#3.2** `POST /api/ads/ingest` server action: validates payload, parses, uploads images, writes DB row, returns new ad id.
- [ ] **#3.3** Server-side fetch fallback when only URL given; surface clear "blocked, please paste HTML or install extension" error.
- [ ] **#3.4** Unique `(source, source_id)` enforcement: re-ingest updates instead of duplicating.
- [ ] **#3.5** Image uploader util: takes a list of remote URLs, streams each to Vercel Blob, returns metadata.

## Phase 4 — Browser extension

- [ ] **#4.1** `extension/` directory, MV3 manifest, esbuild config.
- [ ] **#4.2** Options page: base URL + password, stored in `chrome.storage.local`.
- [ ] **#4.3** Content script for ImmoScout24: inject "Save" button, extract page HTML, call shared parser.
- [ ] **#4.4** Content script for Immowelt: same.
- [ ] **#4.5** Background script: presigned-upload flow for images; POST metadata to `/api/ads/ingest`.
- [ ] **#4.6** Toast/badge feedback in the extension (saved / error / login required).
- [ ] **#4.7** `pnpm extension:build` script and short README in `extension/`.

## Phase 5 — Notes, status, list polish

- [ ] **#5.1** Inline notes editor on `/ad/[id]` with debounced autosave.
- [ ] **#5.2** Status dropdown on `/ad/[id]` and `/` cards.
- [ ] **#5.3** Status filter chips on `/`.
- [ ] **#5.4** Sort dropdown on `/` (saved date / price / size, asc/desc).
- [ ] **#5.5** Delete-ad action with confirm; cascade-deletes photos in Blob.

## Phase 6 — Nice-to-haves

- [ ] **#6.1** PWA manifest + share target → prefills `/add`.
- [ ] **#6.2** "Refresh" action: re-fetch + diff; show "price changed", "taken down".
- [ ] **#6.3** Duplicate detection by `(zip, street, size_sqm)`.
- [ ] **#6.4** Export route: zip of all images + JSON dump.

## Cross-cutting / chores

- [ ] **C.1** CI: GitHub Actions running `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- [ ] **C.2** `.env.example` kept in sync with required env vars.
- [ ] **C.3** Document deploy steps in `docs/deploy.md` once the first prod deploy is live.
