# Deploy

Personal Vercel project. One-time setup, then `git push` deploys.

## One-time provisioning

1. **Link the project**

   ```sh
   pnpm dlx vercel@latest link
   ```

   Pick the personal scope; let it create the project (name: `web-cacher`).

2. **Provision storage** in the Vercel dashboard → **Storage**:

   - **Postgres** (Neon-backed free tier). Click *Create* → *Postgres* →
     connect to the `web-cacher` project. Vercel injects the full Neon
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
   - `SCRAPER_API_KEY` — leave blank until Phase 3 (see `plan.md`).

4. **First deploy:**

   ```sh
   pnpm dlx vercel@latest --prod
   ```

   Or push to `main` once the GitHub integration is connected (Vercel will
   auto-deploy from then on).

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
