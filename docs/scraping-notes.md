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

**Current setup: per-host routing.**

| Source        | Provider     | Why                                                                                                     |
| ------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| Immowelt      | ScrapingAnt  | ScrapingAnt's residential proxy clears Immowelt's Cloudflare screen. Recurring 10k credits/mo free.     |
| ImmoScout24   | Oxylabs      | DataDome on ImmoScout24 returns HTTP 423 to ScrapingAnt ("Our browser was detected by target site"). Oxylabs' Web Unblocker handles DataDome. 2,000-result uncapped-time trial. |

Configured via env vars (see `.env.example`): `SCRAPER_PROVIDER` +
`SCRAPER_API_KEY` for the default, plus optional
`SCRAPER_PROVIDER_IMMOSCOUT24` + `SCRAPER_API_KEY_IMMOSCOUT24` to
override for that one host. Oxylabs' API key is "username:password" in
a single string.

### Shortlist (May 2026 scan)

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
   Specifically: `keyValues = {…}`, `IS24.ssr = { frontendModel: … }` and
   `IS24.expose = {… galleryData …}` for ImmoScout24, and
   `__UFRN_LIFECYCLE_SERVERREQUEST__` for Immowelt.
   Some services strip / rewrite inline scripts; those would force us
   back to fragile DOM-only extraction.
3. **Free-tier headroom** for personal use (target: 30 saves/mo with
   slack for retries).

Choice is hidden behind `lib/scrape/client.ts` so it's a one-file swap
later.

### Per-provider protected-host flags

`lib/scrape/client.ts` carries a `ULTRA_PREMIUM_HOSTS` set and routes
those URLs through each provider's hardest tier:

| Provider        | Flag for protected hosts        | Credit cost (per call, with JS render) | DataDome on ImmoScout24 |
| --------------- | ------------------------------- | -------------------------------------- | ----------------------- |
| **Oxylabs**     | `source=universal render=html` + geo=Germany | 1 result / call           | Works                   |
| **ScrapingAnt** | `proxy_type=residential`        | 250 credits                            | Fails — HTTP 423        |
| ScraperAPI      | `ultra_premium=true`            | ~30 credits                            | Free tier rejects request |
| ScrapingBee     | `stealth_proxy=true`            | ~75 credits                            | Untested in prod        |
| ZenRows         | `antibot=true` + premium proxy  | varies, generally higher               | Untested in prod        |

### Why we don't use a single provider

Two attempts went wrong before settling on per-host routing:

- **ScraperAPI free tier rejects premium proxies entirely.** Returns
  HTTP 403 with "Your current plan does not allow you to use our
  premium proxies". Unusable on the free tier.
- **ScrapingAnt residential proxies pass Immowelt but fail
  ImmoScout24.** HTTP 423 from ScrapingAnt: "Our browser was detected
  by target site". DataDome catches their headless residential.

Oxylabs Web Scraper API is documented as DataDome-capable and the 2,000-
result trial has no time cap, which gives us ~5+ years of personal
volume on ImmoScout24 saves alone. Immowelt stays on ScrapingAnt to
preserve the recurring free quota.

---

## ImmoScout24 (`immobilienscout24.de`)

- Expose URL: `https://www.immobilienscout24.de/expose/{listingId}`.
- Server-rendered (not Next.js). No `__NEXT_DATA__`, but three inline
  globals carry everything we need.
- **`/neubau/…` project pages are not listings.** They advertise a whole
  development: the price is a *range* across dozens of units, and there is
  no `keyValues` blob at all. `parseImmoScout24` detects them (by URL path
  or `<link rel="canonical">`) and throws an explanatory error rather than
  storing a row whose every number is wrong. The individual units are
  linked from the project page as ordinary `/expose/…` URLs.
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
| `addressStreet`    | `obj_streetPlain` ?? `obj_street`, + `obj_houseNumber` | Fallback for `frontendModel`'s `streetAndHouseNumber`. Both can be `"no_information"`; treat as null. Many landlords redact the street entirely. |
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

#### 4. `IS24.ssr = { frontendModel: {…} }` — strict JSON, description

**As of the 2026-09 template the free text is only here.** The old
`<pre class="is24qa-objektbeschreibung">` markup is gone from freshly
captured pages, which is why imported ads had an empty description.

`IS24.ssr` itself is a JS object literal, but its `frontendModel:` value is
strict JSON, so we brace-match from `frontendModel: {` and `JSON.parse`.

| Our field         | Path under `frontendModel`                                        |
| ----------------- | ----------------------------------------------------------------- |
| `title`           | `exposeTitle.exposeTitle` (leading space; trim it)                |
| `descriptionHtml` | `exposeContent.objectDescription` + `.furnishingDescription` + `.locationDescription` + `.otherDescription`, in that order, under `<h2>` headings |
| `addressStreet`   | `exposeMap.addressForMap.streetAndHouseNumber`                    |
| `photos`          | `galleryEntry.images[]` — same shape as `galleryData`, used when that blob is absent |

`exposeContent.aiSummary.content` also exists (an IS24-generated précis).
We deliberately don't store it: it is derived text, not the landlord's.

Only the parts we read are copied into `raw_payload.frontendModel` — the
whole model is ~60 kB of mostly ad-tech config.

#### 5. DOM — criteria table (deposit + extra facts)

The criteria table renders each fact as a `.is24qa-<slug>-label` /
`.is24qa-<slug>` pair. We collect every value cell by slug and use it for:

- **Deposit** (`is24qa-kaution-o-genossenschaftsanteile`), which is
  free-form. Four shapes appear across the fixtures and all four resolve:
  `"7.794,54 €"`, `"€ 8.277,00"` (currency *prefix*), `"2.940,00"` (no
  currency at all), and `"3 Netto-Kaltmieten"` — a multiple of the cold
  rent, which we multiply out. Prose we can't reduce to a number
  (`"nach Vereinbarung"`) leaves `depositCents` null.
- **Extra features** the boolean flags don't cover: Typ, Etage, Bezugsfrei
  ab, Schlaf-/Badezimmer, Baujahr, Objektzustand, Ausstattung, Heizungsart,
  Energieträger, Energieeffizienzklasse, Garage/Stellplatz. Emitted as
  `"Label: value"`; values over 60 chars are prose that leaked out of a
  neighbouring cell and get dropped.

The efficiency-class cell renders empty behind a chart, so that one falls
back to `keyValues.obj_energyEfficiencyClass` (`"A_PLUS"` → `"A+"`).

#### 6. DOM — legacy description sections (fallback)

The pre-2026-09 template put the free text in four `<pre>` tags
(`pre.is24qa-objektbeschreibung`, `-ausstattung`, `-lage`, `-sonstiges`).
Still read when `frontendModel.exposeContent` is missing, so older
captures keep parsing.

---

## Immowelt (`immowelt.de`)

- Expose URL: `https://www.immowelt.de/expose/{onlineId}` (e.g.
  `26X3UBDG3M7F`). Some shared links use an opaque UUID instead; we
  canonicalise to the Online-ID read off the page.
- React-rendered, but **not** Next.js — no `__NEXT_DATA__`. JSON-LD is
  only template metadata and not useful for structured fields.
- Bot protection: Cloudflare / DataDome class.
- Images: `https://mms.immowelt.de/<sha>/<uuid>.jpg?ci_seal=<token>`,
  optionally with `&w=...&h=...` size hints.

### Two templates, two extraction paths

Immowelt dropped the inline state blob in mid-2026 (forcing the DOM-only
parser), then brought it back. `parseImmowelt` tries the blob first and
falls back to the DOM, so both templates parse.

#### Path 1: `__UFRN_LIFECYCLE_SERVERREQUEST__` — preferred

A `<script id="__UFRN_LIFECYCLE_SERVERREQUEST__">` tag emits

```js
window["__UFRN_LIFECYCLE_SERVERREQUEST__"] = JSON.parse("…escaped JSON…");
```

The body inside `JSON.parse("…")` is a JS string literal that unescapes
(via one round of `JSON.parse` over the literal *including* its quotes)
into the real JSON text, which is then parsed a second time. The state
lives under `app_cldp.data.classified`.

| Our field          | Path under `app_cldp.data.classified`                                  |
| ------------------ | ---------------------------------------------------------------------- |
| `sourceId`         | `sections.key.keys[label="Online-ID"].value`, else `id`                |
| `title`            | `sections.mainDescription.headline`                                    |
| `descriptionHtml`  | `sections.mainDescription.description` + `sections.areaDescription.description` + `sections.extendedInfoDescription.description`, under fixed `<h2>` headings |
| `priceColdCents`   | `sections.price.base.main.value.main.ariaLabel` (Kaltmiete)            |
| `priceWarmCents`   | `sections.price.base.details[label.main="Warmmiete"].value.main.ariaLabel` |
| `depositCents`     | `sections.price.additional[label="Kaution"].text` (e.g. `"5.000,00"`, `"9000"`) |
| `sizeSqm`          | `sections.hardFacts.facts[type=livingSpace].splitValue`                |
| `rooms`            | `sections.hardFacts.facts[type=numberOfRooms].splitValue`              |
| `addressStreet`    | `sections.location.address.street`, falling back to `.district`        |
| `addressZip`       | `sections.location.address.zipCode`                                    |
| `addressCity`      | `sections.location.address.city`                                       |
| `features`         | `sections.features.details.categories[].elements[].value` (complete list), then `sections.features.preview[].value` (`details` is null on some listings), then `sections.energy.features[]` as `"Label: value"` |
| `photos`           | `domains.medias.images[].url`, then `domains.medias.floorplans[].url`  |

Notes:

- **`classified.title` is not the ad title.** On many listings it is the
  raw description's first line. `sections.mainDescription.headline` is the
  curated one.
- `value.main.ariaLabel` is the unformatted number (`"1213.99 €"`);
  `value.main.value` is the German-formatted one (`"1.213,99 €"`). Either
  parses; we prefer the unambiguous one.
- Photo `description` is as often an uploader filename (`"IMG_1160(1).jpg"`,
  `"0 "`, `"Bild 9"`) as a real caption, so filename- and index-shaped
  captions are dropped.
- Descriptions separate lines with a **single** `<br>`, not blank lines —
  a tag-stripping regex that eats `<br>` collapses the whole thing into one
  run-on paragraph. `richTextToParagraphs` guards against that with a
  lookahead.
- `sections.location.address.city` is the real city; the district is a
  separate field. The DOM path can't tell them apart (see below).

#### Path 2: DOM `data-testid="cdp-*"` anchors — fallback

Used only when the blob is absent. Notably weaker:

| Anchor                                 | Feeds                                     |
| -------------------------------------- | ----------------------------------------- |
| `cdp-hardfacts-title`                  | title prefix ("Wohnung zur Miete")        |
| `cdp-hardfacts-keyfacts`               | rooms, size                               |
| `cdp-price`                            | Kaltmiete / Warmmiete / Kaution           |
| `cdp-location-address`                 | "<district>, <city> (<zip>)"              |
| `cdp-main-description-…-text` etc.     | description sections                      |
| `cdp-features`                         | feature `<li>` list                       |
| `cdp-classified-keys`                  | Online-ID                                 |

Limitations, all fixed by path 1:

- The gallery lazy-loads after render, so only 1–3 photos survive.
- The address is one collapsed string, so a street is indistinguishable
  from a district and `addressCity` can end up holding a district.
- With no `Referenznummer` after it, the Online-ID runs straight into the
  next label in the collapsed text (`"26HSIUS5RBPFAngebot"`). The ID regex
  is bounded on a non-alphanumeric character to stop that.

If neither path finds a usable listing the parser throws, rather than
saving an ad row full of nulls.

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
