import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) {
    throw new Error(
      "Missing Postgres connection string. Set DATABASE_URL or POSTGRES_URL.",
    );
  }
  _sql = neon(connectionString);
  return _sql;
}

// Proxy that defers connection-string lookup until the first call.
export const sql = ((...args: unknown[]) => {
  // @ts-expect-error — forwarding tagged-template args
  return getSql()(...args);
}) as NeonQueryFunction<false, false>;

export type SnapshotRow = {
  id: string;
  url: string;
  host: string;
  title: string | null;
  html_url: string;
  captured_at: string;
};
