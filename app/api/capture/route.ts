import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { capturePage } from "@/lib/capture";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body.url || "").trim();
  if (!raw) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only http(s) URLs are supported" },
      { status: 400 },
    );
  }

  const id = nanoid(12);
  try {
    const result = await capturePage(parsed.href, id);
    await sql`
      INSERT INTO snapshots (id, url, host, title, content, html_url)
      VALUES (${result.id}, ${result.url}, ${result.host}, ${result.title}, ${result.content}, ${result.htmlUrl})
    `;
    return NextResponse.json({
      id: result.id,
      url: result.url,
      host: result.host,
      title: result.title,
      htmlUrl: result.htmlUrl,
      assetCount: result.assetCount,
      failures: result.failures,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
