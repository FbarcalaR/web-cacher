# Scraping notes

What we know about the two source sites and how we plan to extract data
from them. Updated as we learn more.

> **Important:** the per-site field tables below are **best-guess
> starting points based on conventions**, not verified field paths. We
> verify them in Phase 1 by saving real expose HTML as fixtures and
> reading the actual `__NEXT_DATA__` / JSON-LD shapes. Replace this
> warning and the question marks with verified paths during Phase 2.

## Bot-detection test (2026-05-15)

Plain `GET` from a cloud egress IP, default `WebFetch` user agent, no
cookies:

| URL                                            | Result            |
| ---------------------------------------------- | ----------------- |
| `https://www.immowelt.de/`                     | **403 Forbidden** |
| `https://www.immowelt.de/expose/<id>`          | **403 Forbidden** |
| `https://www.immobilienscout24.de/`            | **403 Forbidden** |
| `https://www.immobilienscout24.de/expose/<id>` | **403 Forbidden** |

Both reject cloud egress unconditionally. We treat plain server-side
`fetch` as unusable and route through a **scraping service with
residential proxies + headless browser** for the primary path. See
`architecture.md`.

## Scraping service shortlist

To be decided in Phase 3 ticket **#3.1**. Free-tier candidates:

| Service     | Free tier             | JS rendering? | Notes                                                              |
| ----------- | --------------------- | ------------- | ------------------------------------------------------------------ |
| ScrapingBee | 1,000 credits/mo      | Yes           | JS render ~5–25 credits/call → ~40–200 expose fetches/mo free.     |
| ScraperAPI  | 1,000 credits/mo      | Yes           | Similar pricing model.                                             |
| ZenRows     | 1,000 credits/mo      | Yes           | Sells itself on anti-bot bypass.                                   |
| Apify       | $5 platform credit/mo | Yes           | Marketplace has prebuilt ImmoScout24 / Immowelt actors — variable quality, watch for maintenance. |

Decision criteria:
1. **Does it actually get past the bot check on a fresh expose?** (smoke
   test in #3.1).
2. **Does the returned HTML still contain `__NEXT_DATA__`?** (some
   services strip / re-render and we'd lose the easy parse path).
3. **Free-tier headroom** for personal use (target: 30 saves/mo with
   slack for retries).

The choice is hidden behind `lib/scrape/client.ts` so it's a one-file
swap later.

## ImmoScout24 (`immobilienscout24.de`)

- Expose URL pattern: `https://www.immobilienscout24.de/expose/{listingId}`.
- React-rendered. Historically ships server-side data either in a
  `<script id="serverApp...">` blob or a Redux/Apollo cache; recent
  versions tend to use a `__NEXT_DATA__`-shaped JSON blob.
- JSON-LD `RealEstateListing` blocks are usually present and contain a
  cleaner subset (title, price, size, address) — good for
  cross-checking.
- Bot protection: DataDome class. Cookies (`datadome`, `reese84`) are
  set by the user's browser after the first interactive load. Don't
  try to replay these from a server.
- Images: `pictures.immobilienscout24.de` with multiple size variants
  in the URL (`...ORIG.jpg`, `..._large.jpg`, etc.). Pick the largest.
  May require `Referer: https://www.immobilienscout24.de/`.

### Fields to extract (best guess — verify in Phase 2)

| Field        | Likely source                                                       |
| ------------ | ------------------------------------------------------------------- |
| Title        | `__NEXT_DATA__` → expose title; or `<h1>`.                          |
| Cold rent    | Field commonly labelled `Kaltmiete` / `baseRent`. **Verify.**       |
| Warm rent    | `Warmmiete` / `totalRent`. **Verify.**                              |
| Deposit      | `Kaution`. **Verify.**                                              |
| Size         | `livingSpace`. **Verify.**                                          |
| Rooms        | `noRooms` / `numberOfRooms`. **Verify.**                            |
| Address      | `street`, `houseNumber`, `zipCode`, `locality`. Note: street is sometimes redacted to district only. |
| Description  | HTML blocks: "Objektbeschreibung", "Lage", "Ausstattung", "Sonstiges". Concatenate. |
| Features     | Booleans like `hasBalcony`, `hasKitchen`, `hasGarden` → human-readable strings. |
| Images       | Gallery attachments array, largest variant.                         |

## Immowelt (`immowelt.de`)

- Expose URL pattern: `https://www.immowelt.de/expose/{shortId}`.
- React/Next.js. Historically embeds initial state in `__NEXT_DATA__`;
  the expose payload usually lives under `props.pageProps.estate` or
  similar.
- JSON-LD `Product` / `RealEstateListing` blocks generally present.
- Bot protection: Cloudflare class. Less aggressive than ImmoScout24 in
  past, but still 403s our cloud IP today.
- Images: `pictures.immowelt.de` / Akamai CDN. URL contains a size
  segment (`/700/`, `/1024/`); swap to the largest.

### Fields to extract (best guess — verify in Phase 2)

| Field        | Likely source                                                  |
| ------------ | -------------------------------------------------------------- |
| Title        | `estate.title` / `<h1>`. **Verify.**                           |
| Cold rent    | `estate.prices.basicRent`. **Verify.**                         |
| Warm rent    | `estate.prices.totalRent`. **Verify.**                         |
| Deposit      | `estate.prices.deposit`. **Verify.**                           |
| Size         | `estate.areas.livingArea`. **Verify.**                         |
| Rooms        | `estate.rooms`. **Verify.**                                    |
| Address      | `estate.address.{street, houseNumber, zipCode, city}`. **Verify.** |
| Description  | `estate.texts[]` keyed by type: `description`, `location`, `equipment`, `other`. **Verify.** |
| Features     | `estate.features[]`. **Verify.**                               |
| Images       | `estate.media[]` filtered to type=image; largest variant. **Verify.** |

## Extractor strategy

A single function per site:

```ts
parse(url: string, html: string): ParsedAd
```

1. Parse `html` with `node-html-parser` or `linkedom` (lighter than
   jsdom).
2. Try `__NEXT_DATA__` first — most stable.
3. Fall back to JSON-LD.
4. Fall back to CSS selectors keyed on visible labels (e.g. find the
   element whose text is `Kaltmiete` and read its sibling).
5. Always preserve the raw HTML / extracted blob in `raw_payload` so we
   can reprocess later when selectors break.

## When parsers will break

These sites ship UI changes regularly. Symptoms:

- Ingest succeeds but fields come back `null`.
- New `__NEXT_DATA__` shape.

Recovery: update the parser, run `pnpm reprocess <ad_id>` to re-extract
from the stored `raw_payload`. We don't need to re-fetch the source.
