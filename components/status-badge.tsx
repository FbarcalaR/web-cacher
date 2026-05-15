import type { AdStatus } from "@/lib/db/schema";

const LABELS: Record<AdStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  rejected: "Rejected",
  archived: "Archived",
};

const CLASSES: Record<AdStatus, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  contacted: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  replied: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  archived: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function StatusBadge({ status }: { status: AdStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASSES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
