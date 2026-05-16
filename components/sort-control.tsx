import Link from "next/link";

import {
  SORT_OPTIONS,
  type StatusFilter as StatusFilterValue,
  buildListUrl,
} from "@/lib/list-params";

export function SortControl({
  current,
  status,
}: {
  current: string;
  status: StatusFilterValue;
}) {
  const currentLabel = SORT_OPTIONS.find((o) => o.value === current)?.label ?? "Sort";
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span>Sort: {currentLabel}</span>
        <span aria-hidden>▾</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 flex w-56 flex-col rounded-xl border border-border bg-background py-1 shadow-lg">
        {SORT_OPTIONS.map((opt) => {
          const active = opt.value === current;
          return (
            <Link
              key={opt.value}
              href={buildListUrl({ status, sort: opt.value })}
              scroll={false}
              className={`px-3 py-2 text-sm ${
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>
    </details>
  );
}
