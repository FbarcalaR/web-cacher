import { AddAdForm } from "./form";

export default function AddPage() {
  return (
    <section className="flex flex-1 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Add an ad</h1>
        <p className="text-sm text-muted-foreground">
          Paste an ImmoScout24 or Immowelt URL. The mobile share sheet
          flow lands here too, once installed.
        </p>
      </header>
      <AddAdForm />
    </section>
  );
}
