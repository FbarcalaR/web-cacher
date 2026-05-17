# Deploy

Personal Vercel project. One-time setup, then `git push` deploys.

## One-time provisioning

1. **Link the project**

   ```sh
   pnpm dlx vercel@latest link
   ```

   Pick the personal scope; let it create the project (name: `wohnvault`).

2. **Provision storage** in the Vercel dashboard → **Storage**:

   - **Postgres** (Neon-backed free tier). Click *Create* → *Postgres* →
     connect to the `wohnvault` project. Vercel injects the full Neon
     bundle (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `PG*`,
     `NEON_*`, etc.). We only consume two of them: `POSTGRES_URL`
     (pooled, runtime) and `POSTGRES_URL_NON_POOLING` (direct,
     migrations). The rest are unused.
   - **Blob**. Click *Create* → *Blob* → connect. Vercel injects
     `BLOB_READ_WRITE_TOKEN`.

3. **Set app env vars** in **Settings → Environment Variables**, for
   *Production* + *Preview*:

   - `APP_PASSWORD` — your chosen password.
   - `SESSION_SECRET` — random 32-byte secret. Generate with
     `openssl rand -base64 32`.
   - `SCRAPER_PROVIDER` — one of `scrapingbee` / `scraperapi` /
     `zenrows`. Pick one and sign up for its free tier; smoke-test
     before deploying with:
     ```sh
     SCRAPER_API_KEY=<key> pnpm scrape:smoke <provider>
     ```
     A green run on both ImmoScout24 and Immowelt is the bar.
   - `SCRAPER_API_KEY` — paste the key for the provider you picked.

4. **First deploy:**

   ```sh
   pnpm dlx vercel@latest --prod
   ```

   Or push to `main` once the GitHub integration is connected (Vercel will
   auto-deploy from then on).

## Database migrations

The `vercel-build` script (`package.json`) runs `drizzle-kit migrate`
before `next build`, so every Vercel deploy applies pending migrations
to the connected Neon database before serving the new code. Both
production and preview deploys point at the same database (single-user
app — no per-branch DBs). If a migration fails, the deploy fails and
the previous version stays live.

To migrate locally instead (e.g. before running the seed script):

```sh
pnpm dlx vercel@latest env pull .env.local
pnpm db:migrate
```

## Local development

```sh
pnpm install
cp .env.example .env.local   # fill in APP_PASSWORD + SESSION_SECRET
pnpm dev
```

Postgres + Blob aren't needed until Phase 1 / Phase 3 wiring. Until then
only `APP_PASSWORD` and `SESSION_SECRET` must be set locally.

## Pulling env from Vercel

Once storage is provisioned, you can mirror prod env to local:

```sh
pnpm dlx vercel@latest env pull .env.local
```
