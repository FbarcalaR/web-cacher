#!/usr/bin/env node
// Run once after provisioning Postgres: `npm run db:init`
// Requires DATABASE_URL (or POSTGRES_URL) in the environment.
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const conn =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!conn) {
  console.error("Missing DATABASE_URL / POSTGRES_URL");
  process.exit(1);
}

const sql = neon(conn);
const schema = fs.readFileSync(
  path.join(process.cwd(), "schema.sql"),
  "utf8",
);

const statements = schema
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  console.log("→", stmt.split("\n")[0].slice(0, 80));
  await sql.query(stmt);
}
console.log("Schema applied.");
