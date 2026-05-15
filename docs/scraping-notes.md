# Scraping notes

What we know about the two source sites and how we plan to extract data
from them. Updated as we learn more.

## Test results (2026-05-15)

Plain `GET` from a cloud egress IP, default `WebFetch` user agent, no
cookies:

| URL                                          | Result            |
| -------------------------------------------- | ----------------- |
| `https://www.immowelt.de/`                   | **403 Forbidden** |
| `https://www.immowelt.de/expose/<id>`        | **403 Forbidden** |
| `https://www.immobilienscout24.de/`          | **403 Forbidden** |
| `https://www.immobilienscout24.de/expose/<id>` | **403 Forbidden** |

Both reject cloud egress unconditionally. We treat server-side fetch as
**best-effort fallback only** and rely on the **browser extension** for the
primary ingestion path — the user's own browser already passes the bot
checks, has the right cookies, and can fetch images without referer issues.

## ImmoScout24 (`immobilienscout24.de`)

- Expose URL pattern: `https://www.immobilienscout24.de/expose/{listingId}`.
- The page is React-rendered. Historically the page has shipped server-side
  data either in a `<script id="serverApp...">` blob or a Redux/Apollo
  cache; recent versions tend to use a `__NEXT_DATA__`-shaped JSON blob.
  **Extractor must try multiple shapes in order** and fall back to DOM
  selectors.
- JSON-LD `RealEstateListing` blocks are usually present and contain a
  cleaner subset (title, price, size, address) — good for cross-checking.
- Bot protection: DataDome historically. Cookies (`datadome`,
  `reese84`) are set by the user's browser after the first interactive
  load. **Don't try to replay these from one machine to another.**
- Images: served from `pictures.immobilienscout24.de` with multiple size
  variants in the URL (`...ORIG.jpg`, `..._large.jpg`, etc.). Pick the
  largest. Some require `Referer: https://www.immobilienscout24.de/` — keep
  the referer in the extension's `fetch`.

### Fields to extract

| Field             | Likely source                                  |
| ----------------- | ---------------------------------------------- |
| Title             | `__NEXT_DATA__` → expose title; or `<h1>`.     |
| Cold rent         | `obj_baseRent` / labelled `Kaltmiete`.         |
| Warm rent         | `obj_totalRent` / labelled `Warmmiete`.        |
| Deposit           | `obj_deposit` / "Kaution".                     |
| Size              | `obj_livingSpace`.                             |
| Rooms             | `obj_noRooms`.                                 |
| Address           | `obj_street`, `obj_houseNumber`, `obj_zipCode`, `obj_locality`. Note the street is sometimes redacted to district only. |
| Description       | HTML blocks: "Objektbeschreibung", "Lage", "Ausstattung", "Sonstiges". Concatenate. |
| Features          | `obj_hasBalcony`, `obj_hasKitchen`, `obj_hasGarden`, etc. → human-readable strings. |
| Images            | `galleryAttachments[].urls[]` (largest variant). |

## Immowelt (`immowelt.de`)

- Expose URL pattern: `https://www.immowelt.de/expose/{shortId}`.
- React/Next.js. Historically embeds initial state in `__NEXT_DATA__`; the
  expose payload usually lives under
  `props.pageProps.estate` or similar.
- JSON-LD `Product` / `RealEstateListing` blocks generally present.
- Bot protection: Cloudflare class. Less aggressive than ImmoScout24 in
  past, but still 403s our cloud IP today.
- Images: served from `pictures.immowelt.de` / Akamai CDN. URL contains a
  size segment (`/700/`, `/1024/`); swap to the largest.

### Fields to extract

| Field             | Likely source                                                |
| ----------------- | ------------------------------------------------------------ |
| Title             | `estate.title` / `<h1>`.                                     |
| Cold rent         | `estate.prices.basicRent`.                                   |
| Warm rent         | `estate.prices.totalRent`.                                   |
| Deposit           | `estate.prices.deposit`.                                     |
| Size              | `estate.areas.livingArea`.                                   |
| Rooms             | `estate.rooms`.                                              |
| Address           | `estate.address.{street, houseNumber, zipCode, city}`.       |
| Description       | `estate.texts[]` keyed by type: `description`, `location`, `equipment`, `other`. |
| Features          | `estate.features[]`.                                         |
| Images            | `estate.media[]` filtered to type=image; largest variant.    |

## Extractor strategy

A single function per site:

```ts
parse(url: string, html: string): ParsedAd
```

1. Parse `html` with `node-html-parser` or `linkedom` (lighter than jsdom,
   works in edge runtimes if we ever need it).
2. Try `__NEXT_DATA__` first — most stable.
3. Fall back to JSON-LD.
4. Fall back to CSS selectors keyed on visible labels (e.g. find the
   element whose text is `Kaltmiete` and read its sibling).
5. Always preserve the raw HTML in `raw_payload` so we can reprocess later
   when selectors break.

## When parsers will break

These sites ship UI changes regularly. Symptoms:

- Ingest succeeds but fields come back `null`.
- New `__NEXT_DATA__` shape.

Recovery: update the parser, run `pnpm reprocess <ad_id>` to re-extract from
the stored `raw_payload`. We don't need to re-fetch the source.
