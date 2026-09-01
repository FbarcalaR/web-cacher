/**
 * Shared HTML parsing helpers. Both per-site parsers reach for these.
 */

/**
 * Walk forward from `start` (which must point at an opening `{`), counting
 * braces while ignoring those inside string literals, and return the slice
 * up to and including the matching `}`. Returns null if unbalanced.
 *
 * Handles both JSON-style and JS-style strings (single + double quotes,
 * `\\` escapes). Treats template literals as plain text — none of our
 * fixtures embed them, but if they ever do this would need extending.
 */
export function sliceBracedExpression(html: string, start: number): string | null {
  if (html[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let stringChar: string | null = null;
  for (let i = start; i < html.length; i++) {
    const c = html[i]!;
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === stringChar) {
        inString = false;
        stringChar = null;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Convert a euro price string into cents. Handles every formatting flavour we
 * see across the two sites:
 *   "1570"           — bare integer (keyValues.obj_baseRent)
 *   "1920 €"         — integer with currency suffix
 *   "10622.38 €"     — English decimal (Immowelt warm rent in some listings)
 *   "1.234,56 €"     — German formatted
 *   "1234,56"        — German bare decimal
 * Returns null if no digits are present.
 */
export function parseEuroToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const m = input.match(/\d[\d.,\s]*/);
  if (!m) return null;
  let s = m[0].replace(/\s/g, "");
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  } else {
    s = s.replace(",", ".");
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Parse a German number string ("43,5" or "43.48" or "100") to a string preserving up to 2 decimals. */
export function parseNumericString(input: string | null | undefined): string | null {
  if (input == null) return null;
  const cleaned = input.replace(/[ \s]/g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/** Join address parts, dropping empties, separated by commas. */
export function joinAddress(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(", ");
}

/**
 * Slice a quoted string literal out of `html`, where `start` points at the
 * opening quote, and return it *including* the quotes (so the result can be
 * fed straight to `JSON.parse` to undo the escaping). Returns null if the
 * literal is unterminated.
 *
 * Immowelt inlines its listing state as
 * `JSON.parse("{\"app_cldp\":…}")` — a JSON document escaped once more as a
 * JS string — so we need to peel the string literal before parsing.
 */
export function sliceStringLiteral(html: string, start: number): string | null {
  const quote = html[start];
  if (quote !== '"' && quote !== "'") return null;
  for (let i = start + 1; i < html.length; i++) {
    const c = html[i]!;
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === quote) return html.slice(start, i + 1);
  }
  return null;
}

/** Escape the five characters that must not appear raw in our stored HTML. */
export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Undo the handful of entities the portals actually emit in attributes. */
export function decodeHtmlEntities(s: string): string {
  return s
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/**
 * Turn a portal's free-text description into safe paragraph HTML.
 *
 * Both sites hand us the same shape of thing: mostly plain text, with
 * `<br>` and/or newlines as the only structure and the occasional stray
 * `<b>`/`<i>`. We split on blank lines (or runs of 2+ `<br>`), escape
 * everything, and re-introduce single line breaks as `<br>`.
 *
 * The lookahead in the tag-stripping pattern matters: without it `<br>`
 * itself matches the `<b…>` alternative and Immowelt's descriptions — which
 * separate every line with a single `<br>` — collapse into one long run-on
 * paragraph.
 */
export function richTextToParagraphs(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const normalised = raw
    .replace(/<\/?(?:b|i|strong|em|p|div|span|ul|ol|li)(?=[\s/>])[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n?/g, "\n");
  const text = decodeHtmlEntities(normalised.replace(/<[^>]+>/g, ""));
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+\n/g, "\n").trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
}

/**
 * Assemble `<h2>` + paragraphs for each non-empty section, in order.
 * Sections whose body is blank are dropped entirely (no orphan headings).
 */
export function buildSectionsHtml(
  sections: Array<{ heading: string; body: string | null | undefined }>,
): string {
  const parts: string[] = [];
  for (const { heading, body } of sections) {
    const paragraphs = richTextToParagraphs(body);
    if (paragraphs.length === 0) continue;
    parts.push(`<h2>${escapeHtml(heading)}</h2>`);
    parts.push(...paragraphs);
  }
  return parts.join("\n");
}
