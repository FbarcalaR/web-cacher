import { type AdStatus, adStatus } from "@/lib/db/schema";

export const STATUS_VALUES = adStatus.enumValues;
export type StatusFilter = AdStatus | null;

const SORTABLE = ["savedAt", "priceColdCents", "sizeSqm"] as const;
export type SortKey = (typeof SORTABLE)[number];
export type SortDir = "asc" | "desc";
export type SortSpec = { key: SortKey; dir: SortDir };
export const DEFAULT_SORT: SortSpec = { key: "savedAt", dir: "desc" };

export const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "savedAt-desc", label: "Newest first" },
  { value: "savedAt-asc", label: "Oldest first" },
  { value: "priceColdCents-asc", label: "Cheapest first" },
  { value: "priceColdCents-desc", label: "Most expensive first" },
  { value: "sizeSqm-desc", label: "Largest first" },
  { value: "sizeSqm-asc", label: "Smallest first" },
];

export function parseStatus(raw: string | undefined): StatusFilter {
  if (!raw) return null;
  return (STATUS_VALUES as readonly string[]).includes(raw) ? (raw as AdStatus) : null;
}

export function parseSort(raw: string | undefined): SortSpec {
  if (!raw) return DEFAULT_SORT;
  const [keyRaw, dirRaw] = raw.split("-", 2);
  const key = SORTABLE.find((s) => s === keyRaw);
  const dir: SortDir = dirRaw === "asc" ? "asc" : "desc";
  return key ? { key, dir } : DEFAULT_SORT;
}

export function sortValue(spec: SortSpec): string {
  return `${spec.key}-${spec.dir}`;
}

export function buildListUrl(params: { status?: StatusFilter; sort?: string | null }): string {
  const u = new URLSearchParams();
  if (params.status) u.set("status", params.status);
  if (params.sort && params.sort !== sortValue(DEFAULT_SORT)) {
    u.set("sort", params.sort);
  }
  const qs = u.toString();
  return qs ? `/?${qs}` : "/";
}
