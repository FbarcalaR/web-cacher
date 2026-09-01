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

## Keep both templates covered

Both sites have changed their markup mid-project, and the parsers keep a
fallback path for the older shape. So when you add fresh captures, **don't
delete the old ones** — they are the only regression cover for those paths:

| Fixture                          | Covers                                              |
| -------------------------------- | --------------------------------------------------- |
| `immoscout24/nymphenburg-*`, `schwere-reiter-*`, `ramersdorf-4-5zi-*` | Legacy `<pre class="is24qa-…">` description markup |
| `immoscout24/neuperlach-*`, `laim-*` | Current template: description only in `IS24.ssr.frontendModel` |
| `immoscout24/neubau-projekt-*`   | A `/neubau/…` project page, which must be rejected  |
| `immowelt/schwabing-west-*`      | DOM-only render (no state blob)                     |
| `immowelt/milbertshofen-*`, `ramersdorf-2zi-*`, `moosach-*` | Inline `__UFRN_LIFECYCLE_SERVERREQUEST__` state |

Fixtures are listed in `.prettierignore`: they are verbatim captures and
reformatting them would change what the parsers are tested against.

## What we need

- At least 3 per site, ideally 5.
- Some variety: different cities, room counts, with and without a balcony,
  with and without a `Kaltmiete` value, with and without a redacted street.
- All sourced from real, currently-live ads at capture time. Once the
  scraping service is wired up in Phase 3, we can re-fetch fixtures
  automatically when parsers change.

## Scrub third-party tokens before committing

Both portals bake live API credentials into the markup they serve. Those
are not ours to republish, and GitHub push protection rejects the push if
they survive. After capturing, replace the Mapbox static-map token:

```
perl -pi -e 's/pk\.eyJ[A-Za-z0-9._-]+/pk.REDACTED_MAPBOX_TOKEN/g' <file>
```

No parser reads it, so redacting changes nothing about what the tests
assert — verify by re-running `pnpm test` after the edit.

## Note on privacy

These files contain real ad URLs and addresses. The repo is private —
treat them as you would internal notes. If we ever open-source, scrub
them or replace with synthesised samples.
