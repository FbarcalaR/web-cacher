"use client";

import { useTransition } from "react";

import { updateAdStatus } from "@/app/(app)/ad/[id]/actions";
import { type AdStatus, adStatus } from "@/lib/db/schema";

const LABELS: Record<AdStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  rejected: "Rejected",
  archived: "Archived",
};

const PILL_COLOR: Record<AdStatus, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  contacted: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  replied: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  archived: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function StatusSelect({
  adId,
  status,
  size = "md",
  onClickStop = false,
}: {
  adId: string;
  status: AdStatus;
  size?: "sm" | "md";
  /**
   * When the select is rendered inside a card that is itself a Link, the
   * mousedown / click events would otherwise bubble up and navigate to the
   * detail page. Setting this stops propagation so the user can change the
   * status without leaving the list.
   */
  onClickStop?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const isSmall = size === "sm";
  return (
    <select
      value={status}
      disabled={pending}
      aria-label="Status"
      onClick={onClickStop ? (e) => e.stopPropagation() : undefined}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(() => updateAdStatus(adId, next));
      }}
      className={`appearance-none rounded-full font-medium ${
        isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      } ${PILL_COLOR[status]} disabled:opacity-60`}
    >
      {(Object.keys(LABELS) as AdStatus[]).map((value) => (
        <option key={value} value={value}>
          {LABELS[value]}
        </option>
      ))}
    </select>
  );
}

export { adStatus, LABELS as STATUS_LABELS };
