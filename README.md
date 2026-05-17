# wohnvault

A personal, mobile-first archive for real estate ads from **ImmoScout24** and
**Immowelt**.

## Why

When you message a landlord on those sites and they reply a few days later,
the ad is often already gone — pulled from the site or hidden. You can no
longer re-read the description, re-check the photos, or compare it against
newer candidates. This tool snapshots an ad the moment you save it so it's
still there when you need it.

## What it does

- Save an ad by sharing its URL from your phone.
- Cached title, price, size, rooms, description, features, address, photos.
- A Google Maps link with the address pre-filled (no embedded map).
- A list view of every saved ad with quick filters and personal notes.

Single-user, mobile-first (Android now, iOS later), deployed on Vercel.

## Status

Planning. See [`docs/`](./docs):

- [`docs/architecture.md`](./docs/architecture.md) — stack, data model, ingestion strategy.
- [`docs/plan.md`](./docs/plan.md) — phased implementation roadmap.
- [`docs/backlog.md`](./docs/backlog.md) — concrete tickets.
- [`docs/scraping-notes.md`](./docs/scraping-notes.md) — what we know (and what we don't) about the two sites and how we plan to extract data.
