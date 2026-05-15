export default function AddPage() {
  return (
    <section className="flex flex-1 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Add an ad</h1>
        <p className="text-sm text-muted-foreground">
          Manual URL paste. Wired up in Phase&nbsp;3.
        </p>
      </header>
      <form className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Ad URL</span>
          <input
            type="url"
            name="url"
            placeholder="https://www.immobilienscout24.de/expose/..."
            disabled
            className="rounded-md border border-border bg-muted px-3 py-2 text-base placeholder:text-muted-foreground disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled
          className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
        >
          Save
        </button>
      </form>
    </section>
  );
}
