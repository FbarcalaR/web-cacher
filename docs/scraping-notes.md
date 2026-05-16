# Scraping notes

What we know about the two source sites and how we extract data from
them. Verified against the fixtures in `lib/parsers/__fixtures__/` —
update this file whenever a parser or selector changes.

## Bot-detection test (2026-05-15)

Plain `GET` from a cloud egress IP, default `WebFetch` user agent, no
cookies:

| URL                                            | Result            |
| ---------------------------------------------- | ----------------- |
| `https://www.immowelt.de/`                     | **403 Forbidden** |
| `https://www.immowelt.de/expose/<id>`          | **403 Forbidden** |
| `https://www.immobilienscout24.de/`            | **403 Forbidden** |
| `https://www.immobilienscout24.de/expose/<id>` | **403 Forbidden** |

Both reject cloud egress unconditionally. Plain server-side `fetch` is
unusable as a primary path — see `docs/architecture.md` for the
scraping-service plan.

## Scraping service: chosen and shortlist

**Current choice: ScrapingAnt.** Picked after a market scan in May 2026.
The only provider with a *recurring* monthly free tier (10,000 credits,
no credit card) that also includes residential proxies — which the two
target sites need.

| Service        | Free tier (current)                | DataDome-capable proxy in free? | Notes                                                                |
| -------------- | ---------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| **ScrapingAnt** | **10,000 credits/mo, recurring**   | Yes (residential = 250 cr)     | **~40 protected saves/mo free.** Datacenter mode (10 cr) is fine for non-protected hosts. |
| Oxylabs        | 2,000 results, uncapped trial      | Yes                            | Strong DataDome reputation. ~2,000 lifetime saves, then $49/mo Micro plan. Best fallback. |
| Bright Data    | None (deposit-match promo)         | N/A (paid)                     | PAYG ~$1.50/1k success — ~$0.05/mo for 30 saves. Top-tier bypass. |
| ScrapingBee    | 1,000 credits, one-time            | Stealth = 75 cr → ~13 reqs     | Trial only. $49/mo entry plan.                                      |
| ScraperAPI     | 1,000 credits, *no premium pools*  | **No**                         | Confirmed by HTTP 403 in our deploy. Free tier unusable for this app. |
| ZenRows        | 14-day trial, 40 antibot reqs      | Trial only                     | $69/mo entry plan.                                                  |
| Apify          | $5 platform credit/mo, recurring   | Via marketplace actors         | Variable quality / maintenance per actor.                           |

Decision criteria, in order:

1. **Does it bypass the bot check on a fresh expose?** Smoke test in #3.1.
2. **Does the rendered HTML still contain the structured blobs we parse?**
   Specifically: `keyValues = {…}` and `IS24.expose = {… galleryData …}`
   for ImmoScout24, and `__UFRN_LIFECYCLE_SERVERREQUEST__` for Immowelt.
   Some services strip / rewrite inline scripts; those would force us
   back to fragile DOM-only extraction.
3. **Free-tier headroom** for personal use (target: 30 saves/mo with
   slack for retries).

Choice is hidden behind `lib/scrape/client.ts` so it's a one-file swap
later.

### Ultra-premium proxies are required, not optional

ImmoScout24 sits behind DataDome. Standard premium proxies aren't
enough — ScraperAPI returns `HTTP 500 ... Protected domains may
require adding premium=true OR ultra_premium=true`. Immowelt's
Cloudflare-class screen is similar.

`lib/scrape/client.ts` carries a `ULTRA_PREMIUM_HOSTS` set and routes
those URLs through each provider's hardest tier:

| Provider        | Flag for protected hosts        | Credit cost (per call, with JS render) |
| --------------- | ------------------------------- | -------------------------------------- |
| **ScrapingAnt** | `proxy_type=residential`        | 250 credits                            |
| ScraperAPI      | `ultra_premium=true`            | ~30 credits                            |
| ScrapingBee     | `stealth_proxy=true`            | ~75 credits                            |
| ZenRows         | `antibot=true` + premium proxy  | varies, generally higher               |

On ScrapingAnt's 10k-credits/mo recurring free tier, that's ~40
protected saves/month. Sufficient for personal-use volume.

ScraperAPI's free tier turned out **not** to include premium pools at
all — it returns HTTP 403 with "Your current plan does not allow you
to use our premium proxies". That ruled it out of the free-tier race.

---

## ImmoScout24 (`immobilienscout24.de`)

- Expose URL: `https://www.immobilienscout24.de/expose/{listingId}`.
- Server-rendered (not Next.js). No `__NEXT_DATA__`, but two inline
  globals carry everything we need.
- Bot protection: DataDome class. `datadome` / `reese84` cookies are
  set after a real interactive load; we don't try to replay them.
- Images served from `pictures.immobilienscout24.de` with multiple size
  variants in the URL path (`/ORIG/...`, `/legacy_thumbnail/...`). We
  store the `fullSizePictureUrl`.

### Extraction signals

#### 1. `keyValues = {…}` — strict JSON, primary

A `<script>` tag inline-emits

```js
keyValues = {"obj_regio1":"Bayern","obj_baseRent":"1570", …};
```

with ~60 `obj_*` keys. Strict JSON (double-quoted keys + values). We
walk forward from `keyValues = ` and brace-match to slice the object,
then `JSON.parse`. See `lib/parsers/immoscout24.ts`.

| Our field          | keyValues key                                | Notes                                                            |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------- |
| `sourceId`         | `obj_scoutId`                                |                                                                  |
| `priceColdCents`   | `obj_baseRent`                               | Plain euro integer string ("1570"). Multiply by 100.             |
| `priceWarmCents`   | `obj_totalRent`                              |                                                                  |
| `sizeSqm`          | `obj_livingSpace`                            | "43.48" — already English decimal.                               |
| `rooms`            | `obj_noRooms`                                | "1" / "2" / "4.5".                                               |
| `addressZip`       | `obj_zipCode`                                |                                                                  |
| `addressCity`      | `obj_regio2`                                 | Underscores in compound names — replace with space.              |
| `addressStreet`    | `obj_streetPlain` ?? `obj_street`            | Both can be `"no_information"`; treat as null in that case.      |
| `features` (some)  | `obj_balcony` / `obj_hasKitchen` / `obj_cellar` / `obj_garden` / `obj_lift` / `obj_newlyConst` / `obj_barrierFree` / `obj_assistedLiving` | `"y"` → push the corresponding label. |
| `features` (pets)  | `obj_petsAllowed`                            | `"yes"` → "Haustiere erlaubt"; `"negotiable"` → "…nach Absprache". |
| (raw payload)      | the whole JSON                               | Stored under `raw_payload.keyValues` for reprocessing.            |

#### 2. `IS24.expose = { …, galleryData: {…}, … }` — JS object literal, photos

The outer `IS24.expose` assignment uses JS syntax (unquoted keys), so
it's not directly JSON-parseable. But `galleryData:` is followed by a
JSON-stringified payload that IS strict JSON. We walk forward from
`galleryData: ` and brace-match.

```ts
gallery.images[].fullSizePictureUrl  // photo URL
gallery.images[].caption             // e.g. "Wohn-Schlafbereich"
gallery.images[].type                // "PICTURE" | "FLOORPLAN" — we keep both
```

#### 3. JSON-LD — title fallback

One `<script type="application/ld+json">` block contains a
`RealEstateListing` node whose `name` is the human-friendly title
("Loftartiges Neubau-Appartement mit Loggia in München-Schwabing").

#### 4. DOM — description sections, deposit

Four free-text sections, each in its own `<pre>` tag:

| Section            | Selector                            |
| ------------------ | ----------------------------------- |
| Objektbeschreibung | `pre.is24qa-objektbeschreibung`     |
| Lage               | `pre.is24qa-lage`                   |
| Ausstattung        | `pre.is24qa-ausstattung`            |
| Sonstiges          | `pre.is24qa-sonstiges`              |

We concatenate them into a single sanitised `descriptionHtml` with `<h2>`
headings between sections.

Deposit lives in `div.is24qa-kaution-o-genossenschaftsanteile` and is
often a free-text phrase like `"3 Netto-Kaltmieten"`. If it doesn't
start with a digit we leave `depositCents` as null.

---

## Immowelt (`immowelt.de`)

- Expose URL: `https://www.immowelt.de/expose/{shortId}` (e.g.
  `26I3AFZ5TPN9`).
- React-rendered, but **not** Next.js — no `__NEXT_DATA__`. JSON-LD is
  only template metadata and not useful for structured fields.
- Bot protection: Cloudflare / DataDome class.
- Images: `https://mms.immowelt.de/<sha>/<uuid>.jpg?ci_seal=<token>`,
  optionally with `&w=...&h=...` size hints.

### Extraction signal

#### `__UFRN_LIFECYCLE_SERVERREQUEST__` — single source of truth

A `<script id="__UFRN_LIFECYCLE_SERVERREQUEST__">` tag emits

```js
window["__UFRN_LIFECYCLE_SERVERREQUEST__"] = JSON.parse("…escaped JSON…");
```

The body inside `JSON.parse("…")` is a JS string literal that
unescapes (via one round of `JSON.parse('"' + body + '"')`) into the
real JSON text, which is then parsed a second time. The resulting
state lives under `app_cldp.data.classified`.

| Our field          | Path under `app_cldp.data.classified`                                  |
| ------------------ | ---------------------------------------------------------------------- |
| `sourceId`         | `id`                                                                   |
| `title`            | `sections.mainDescription.headline`                                    |
| `descriptionHtml`  | `sections.mainDescription.description` + `sections.areaDescription.description` + `sections.extendedInfoDescription.description` (concatenated with `<h2>` separators) |
| `priceColdCents`   | `sections.hardFacts.price.ariaLabel` (e.g. `"1920 €"`)                 |
| `priceWarmCents`   | `sections.price.breakdown.total.ariaLabel` (e.g. `"2400 €"`, sometimes English-decimal like `"10622.38 €"`) |
| `sizeSqm`          | `sections.hardFacts.facts[type=livingSpace].splitValue`                |
| `rooms`            | `sections.hardFacts.facts[type=numberOfRooms].splitValue`              |
| `addressCity`      | `sections.location.address.city`                                       |
| `addressZip`       | `sections.location.address.zipCode`                                    |
| `addressStreet`    | `sections.location.address.district` (Immowelt redacts the actual street; we store the district instead) |
| `features`         | `sections.features.preview[].value` (already localised: "Einbauküche", "Personenaufzug", …) |
| `photos`           | `sections.gallery.images[].url` (full CDN URL, seal included)          |
| `depositCents`     | not exposed in the state we use — left null                            |
| (raw payload)      | the whole `classified` blob, stored under `raw_payload.classified`     |

`splitValue` for rooms uses the German comma (`"1,5"`); the parser
normalises through `parseNumericString` so the DB gets `"1.5"`.

---

## Extractor strategy

Per `lib/parsers/index.ts`:

```ts
parseAd(url, html) → ParsedAd
```

1. Route by hostname (`www.immobilienscout24.de` → `parseImmoScout24`,
   `www.immowelt.de` → `parseImmowelt`).
2. Each per-site parser extracts the primary signal, throws if missing
   (so a bot-blocked or empty page fails loudly), then maps to the
   shared `ParsedAd` shape.
3. The result is run through `parsedAdSchema` (Zod) so a refactor that
   forgets a required field fails at the parser boundary instead of
   the DB insert.
4. Tests in `lib/parsers/__tests__/*.test.ts` assert each fixture
   produces the right values (prices, size, rooms, zip, photo count).

The full extracted blob is stored in the `ads.raw_payload` jsonb
column so we can reprocess historical ads after a parser update
without re-fetching the source.

## When parsers will break

Symptoms:

- Ingest succeeds but fields come back `null`.
- Tests start failing against a freshly re-fetched fixture.
- The "primary signal missing" error fires on a page that looks fine
  in a browser (signal moved or got renamed).

Recovery: capture a fresh fixture, update the parser + field-path
table in this doc, run `pnpm reprocess <ad_id>` (script to be added in
Phase 6) to re-extract from `raw_payload`.
