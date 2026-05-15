# Backlog

Concrete tickets, grouped by phase. Tick them off as we go. Each is sized
to fit in one PR.

## Phase 0 — Scaffold

- [ ] **#0.1** `create-next-app` with TS + Tailwind + App Router; commit baseline.
- [ ] **#0.2** Add Drizzle, Drizzle-kit, `drizzle.config.ts`, empty schema.
- [ ] **#0.3** `lib/auth.ts` middleware: signed-cookie session against `APP_PASSWORD`; `/login` form.
- [ ] **#0.4** Provision Vercel project, Postgres, Blob; document required env vars in `.env.example`.
- [ ] **#0.5** Mobile-first base layout (100dvh shell, header, content, safe-area padding).
- [ ] **#0.6** First deploy: hello page behind the password.

## Phase 1 — Fixtures + data model + read-only view

- [ ] **#1.1** Save 3–5 expose HTML files per site under `lib/parsers/__fixtures__/{immoscout24,immowelt}/`. One-time manual grab.
- [ ] **#1.2** Drizzle schema for `ads` and `ad_photos`; first real migration.
- [ ] **#1.3** `lib/db/client.ts` exporting a typed db instance.
- [ ] **#1.4** SQL seed script + script that uploads two sample images to Blob and writes one fake ad row.
- [ ] **#1.5** `/ad/[id]` page: title, price block, sanitised description, swipeable gallery (next/image, full-screen on tap), address card with Google Maps link, "Open original" button. Notes shown read-only for now.
- [ ] **#1.6** `/` list page: single-column card list on mobile, cover photo, price/size/city/status, sorted newest first.
- [ ] **#1.7** Empty-state UI for `/` when there are no ads.

## Phase 2 — Parsers

- [ ] **#2.1** Inspect fixtures, document real `__NEXT_DATA__` / JSON-LD paths in `docs/scraping-notes.md`. Replace the current "best guess" tables with verified field paths.
- [ ] **#2.2** `lib/parsers/types.ts` — `ParsedAd`, `ParsedPhoto`, Zod schemas.
- [ ] **#2.3** `lib/parsers/immoscout24.ts` — `__NEXT_DATA__` → JSON-LD → selectors fallback chain.
- [ ] **#2.4** `lib/parsers/immowelt.ts` — same.
- [ ] **#2.5** Vitest setup + tests asserting each fixture parses to expected fields.
- [ ] **#2.6** `lib/parsers/index.ts` `parseAd(url, html)` routing by hostname.

## Phase 3 — Scraping service + ingest

- [ ] **#3.1** Evaluate ScrapingBee, ScraperAPI, ZenRows (or Apify actor) on one ImmoScout24 + one Immowelt URL. Decide. Note decision + free-tier limits in `docs/scraping-notes.md`.
- [ ] **#3.2** `lib/scrape/client.ts` — adapter with `fetchRenderedHtml(url)`; env var `SCRAPER_API_KEY`.
- [ ] **#3.3** `POST /api/ads/ingest`: validate URL, fetch+parse, upload images, upsert. Returns `{ id }`.
- [ ] **#3.4** Image uploader util: takes remote URLs, streams each to Vercel Blob with the right `Referer`, returns metadata.
- [ ] **#3.5** Upsert keyed on `(source, source_id)`: re-ingest updates instead of duplicating.
- [ ] **#3.6** `/add` page: URL textarea, submit, progress, success → redirect to `/ad/[id]`.
- [ ] **#3.7** Friendly error UI when scraper returns non-200 or parser yields no title.

## Phase 4 — PWA + Android share target

- [ ] **#4.1** `public/manifest.webmanifest` with icons, theme colour, `display: standalone`.
- [ ] **#4.2** Minimal service worker so the app is installable.
- [ ] **#4.3** `share_target` entry pointing at `/share-target` (`GET` with `url` param).
- [ ] **#4.4** `/share-target` route: reads `url`, calls `/api/ads/ingest`, shows "Saving…" with spinner, redirects.
- [ ] **#4.5** First-visit "Add to Home Screen" prompt + a `/help` page explaining the Android install + share-sheet flow.

## Phase 5 — Notes, status, list polish

- [ ] **#5.1** Inline notes editor on `/ad/[id]` with debounced autosave (server action).
- [ ] **#5.2** Status dropdown on `/ad/[id]` and `/` cards.
- [ ] **#5.3** Status filter chips on `/`.
- [ ] **#5.4** Sort bottom-sheet on `/` (saved date / price / size, asc/desc).
- [ ] **#5.5** Delete-ad action with confirm; cascade-deletes photos in Blob.

## Phase 6 — Nice-to-haves / hedges

- [ ] **#6.1** iOS Shortcut + iOS PWA install instructions for when you start using iPhone.
- [ ] **#6.2** On-device HTML capture fallback: `POST /api/ads/ingest-html` + Android HTTP Shortcuts recipe documented.
- [ ] **#6.3** "Refresh" action: re-fetch + diff; show "price changed", "taken down".
- [ ] **#6.4** Duplicate detection by `(zip, street, size_sqm)`.
- [ ] **#6.5** Export route: zip of all images + JSON dump.

## Cross-cutting / chores

- [ ] **C.1** CI: GitHub Actions running `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- [ ] **C.2** `.env.example` kept in sync with required env vars.
- [ ] **C.3** Document deploy steps in `docs/deploy.md` once the first prod deploy is live.
