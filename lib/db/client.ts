import { neon } from "@neondatabase/serverless";
import { type NeonHttpDatabase, drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Schema = typeof schema;

let cached: NeonHttpDatabase<Schema> | null = null;

export function db(): NeonHttpDatabase<Schema> {
  if (cached) return cached;
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("POSTGRES_URL is not set");
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}
