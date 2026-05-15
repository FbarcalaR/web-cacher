# Expose HTML fixtures

3–5 real expose pages per site, saved by hand from a desktop browser.
These are the ground truth for the Phase 2 parsers and their tests.

## How to capture

1. Visit a live ImmoScout24 or Immowelt expose in Chrome on your laptop.
2. **Right-click → View Source** (or `Ctrl+U`).
3. **File → Save As…** → save the page as `<slug>.html`.
4. Drop the file into the matching subfolder:
   - `immoscout24/<slug>.html` for `immobilienscout24.de` URLs
   - `immowelt/<slug>.html` for `immowelt.de` URLs

Use a short descriptive slug — e.g. `mitte-2zi-95k.html`,
`prenzlberg-3zi-balkon.html` — so test failures stay readable.

## What we need

- At least 3 per site, ideally 5.
- Some variety: different cities, room counts, with and without a balcony,
  with and without a `Kaltmiete` value, with and without a redacted street.
- All sourced from real, currently-live ads at capture time. Once the
  scraping service is wired up in Phase 3, we can re-fetch fixtures
  automatically when parsers change.

## Note on privacy

These files contain real ad URLs and addresses. The repo is private —
treat them as you would internal notes. If we ever open-source, scrub
them or replace with synthesised samples.
