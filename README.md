# Web Cacher

Snapshot web pages (e.g. flat listings that get deactivated minutes after they're posted) and search across what you've saved.

- **Capture** — paste a URL, the server fetches the page, its `<img>` and `<link rel="stylesheet">` assets, rewrites them to live in Vercel Blob, and stores the result.
- **Library** — full-text search over the title, URL, host, and visible text of every snapshot.

Built as a single Next.js app that deploys to Vercel with zero config.

## Stack

- Next.js 15 (App Router) — UI + serverless API routes
- Postgres (Neon) — metadata + `tsvector` full-text search
- Vercel Blob — captured HTML and image/CSS assets
- Cheerio — HTML parsing and rewriting

## One-time Vercel setup

1. **Import this repo into Vercel** (https://vercel.com/new).
2. **Add a Postgres database**: in the project dashboard → *Storage* → *Create Database* → *Neon Postgres*. Connect it to the project. This auto-injects `DATABASE_URL` / `POSTGRES_URL` env vars.
3. **Add Blob storage**: in *Storage* → *Create* → *Blob*. Connect it. This auto-injects `BLOB_READ_WRITE_TOKEN`.
4. **Initialise the schema** — once, locally:
   ```bash
   vercel env pull .env.local
   npm install
   npm run db:init
   ```
5. **Deploy** — Vercel will redeploy automatically once env vars are linked.

That's it. Visit your deployment URL.

## Local development

```bash
npm install
vercel env pull .env.local   # gets Postgres + Blob credentials
npm run db:init              # only the first time
npm run dev
```

Open http://localhost:3000.

## Notes & limits

- API route `maxDuration` is set to 60s, the cap on the Vercel Hobby plan. Captures usually finish in 5–20s.
- Up to 60 assets per page are downloaded (concurrency 6). Anything past that uses a `<base>` fallback that hits the original origin.
- JavaScript is stripped from the snapshot — many listing sites won't render dynamic content without it. If too many sites come back blank, switch to a headless-browser capture (Playwright on a longer-running runtime).
- Login-walled pages will store the logged-out version unless you wire up cookies.

## Project layout

```
app/
  api/
    capture/route.ts    # POST /api/capture { url }
    search/route.ts     # GET /api/search?q=…   DELETE /api/search?id=…
  library/page.tsx      # search + list UI
  page.tsx              # landing (URL input)
  layout.tsx, globals.css
lib/
  capture.ts            # fetch + rewrite + upload to Blob
  db.ts                 # Neon client
schema.sql              # snapshots table + FTS index
scripts/init-db.mjs     # one-shot schema apply
```
