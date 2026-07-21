"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { type UpdateAdState, updateAd } from "../actions";

import type { Ad } from "@/lib/db/schema";

const INITIAL: UpdateAdState = { error: null };

export function EditForm({ ad }: { ad: Ad }) {
  const [state, action] = useActionState(updateAd.bind(null, ad.id), INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Title" name="title" defaultValue={ad.title} required />
      <Field
        label="Source URL"
        name="sourceUrl"
        type="url"
        defaultValue={ad.sourceUrl}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Cold rent (€)"
          name="priceColdEuros"
          inputMode="decimal"
          defaultValue={centsToEuros(ad.priceColdCents)}
        />
        <Field
          label="Warm rent (€)"
          name="priceWarmEuros"
          inputMode="decimal"
          defaultValue={centsToEuros(ad.priceWarmCents)}
        />
        <Field
          label="Deposit (€)"
          name="depositEuros"
          inputMode="decimal"
          defaultValue={centsToEuros(ad.depositCents)}
        />
        <Field
          label="Size (m²)"
          name="sizeSqm"
          inputMode="decimal"
          defaultValue={ad.sizeSqm ?? ""}
        />
        <Field
          label="Rooms"
          name="rooms"
          inputMode="decimal"
          defaultValue={ad.rooms ?? ""}
          className="col-span-2"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Street"
          name="addressStreet"
          defaultValue={ad.addressStreet ?? ""}
          className="col-span-2"
        />
        <Field label="ZIP" name="addressZip" defaultValue={ad.addressZip ?? ""} />
        <Field label="City" name="addressCity" defaultValue={ad.addressCity ?? ""} />
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Features (one per line)</span>
        <textarea
          name="features"
          defaultValue={ad.features.join("\n")}
          rows={4}
          className="min-h-20 resize-y rounded-md border border-border bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground"
          placeholder="Balkon&#10;Einbauküche&#10;Aufzug"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Description (HTML)</span>
        <textarea
          name="descriptionHtml"
          defaultValue={ad.descriptionHtml}
          rows={16}
          className="min-h-64 resize-y rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs"
        />
        <span className="text-xs text-muted-foreground">
          &lt;h2&gt;, &lt;p&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;a&gt;, and lists are kept on display; other tags are stripped.
        </span>
      </label>

      {state.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      ) : null}

      <SaveButton />
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  inputMode,
  required = false,
  className = "",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  inputMode?: "decimal" | "url" | "text";
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-medium">{label}</span>
      <input
        type={type}
        name={name}
        inputMode={inputMode}
        defaultValue={defaultValue}
        required={required}
        className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
      />
    </label>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="sticky bottom-4 self-start rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-background shadow-md disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

function centsToEuros(cents: number | null): string {
  if (cents == null) return "";
  const euros = cents / 100;
  return Number.isInteger(euros) ? String(euros) : euros.toFixed(2);
}
