import Link from "next/link";

import {
  type StatusFilter as StatusFilterValue,
  STATUS_VALUES,
  buildListUrl,
} from "@/lib/list-params";

const LABELS: Record<(typeof STATUS_VALUES)[number] | "all", string> = {
  all: "All",
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  rejected: "Rejected",
  archived: "Archived",
};

export function StatusFilter({
  current,
  sort,
}: {
  current: StatusFilterValue;
  sort: string;
}) {
  const chips: Array<{ value: StatusFilterValue; label: string }> = [
    { value: null, label: LABELS.all },
    ...STATUS_VALUES.map((v) => ({ value: v, label: LABELS[v] })),
  ];

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.map((chip) => {
        const active = chip.value === current;
        return (
          <Link
            key={chip.label}
            href={buildListUrl({ status: chip.value, sort })}
            scroll={false}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
              active
                ? "border-accent bg-accent text-background"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            {chip.label}
          </Link>
        );
      })}
    </div>
  );
}
