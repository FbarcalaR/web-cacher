import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-10">
      <form
        action={login}
        className="flex w-full max-w-xs flex-col gap-4 rounded-2xl border border-border bg-background p-6 shadow-sm"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">wohnvault</h1>
          <p className="text-sm text-muted-foreground">Enter the password to continue.</p>
        </div>
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Password</span>
          <input
            type="password"
            name="password"
            autoFocus
            required
            autoComplete="current-password"
            className="rounded-md border border-border bg-muted px-3 py-2 text-base"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">Wrong password.</p>
        ) : null}
        <button
          type="submit"
          className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-background"
        >
          Sign in
        </button>
      </form>
    </section>
  );
}
