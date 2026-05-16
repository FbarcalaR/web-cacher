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
