const eurFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatCents(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return eurFormatter.format(cents / 100);
}

export function formatSqm(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/\.?0+$/, "");
  return `${trimmed} m²`;
}

export function formatRooms(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.replace(/\.0$/, "");
}

export function joinAddress(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(", ");
}

export function googleMapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
