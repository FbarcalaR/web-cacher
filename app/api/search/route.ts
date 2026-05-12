import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  const rows = q
    ? await sql`
        SELECT id, url, host, title, html_url, captured_at
        FROM snapshots
        WHERE search_vector @@ websearch_to_tsquery('simple', ${q})
        ORDER BY ts_rank(search_vector, websearch_to_tsquery('simple', ${q})) DESC,
                 captured_at DESC
        LIMIT 100
      `
    : await sql`
        SELECT id, url, host, title, html_url, captured_at
        FROM snapshots
        ORDER BY captured_at DESC
        LIMIT 100
      `;

  return NextResponse.json({ results: rows });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await sql`DELETE FROM snapshots WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
