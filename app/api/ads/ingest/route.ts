import { z } from "zod";

import { ingestAd } from "@/lib/ingest";
import { UnsupportedSourceError } from "@/lib/parsers";
import { ScrapeError } from "@/lib/scrape/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Body must be { url: string }" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestAd(parsed.data.url);
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof UnsupportedSourceError) {
      return Response.json(
        { error: `Unsupported source: ${err.hostname}` },
        { status: 400 },
      );
    }
    if (err instanceof ScrapeError) {
      return Response.json(
        { error: "Scrape failed", detail: err.message },
        { status: 502 },
      );
    }
    console.error("ingest failed", err);
    return Response.json(
      { error: "Ingest failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
