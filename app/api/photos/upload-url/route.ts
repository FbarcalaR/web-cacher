import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { ads } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Endpoint used by `@vercel/blob/client.upload()` on the edit page.
 * Verifies the request is for an ad that actually exists, then hands
 * back a signed URL the browser uses to upload straight to Blob.
 *
 * DB row insertion is NOT done here — the client calls `recordAdPhoto`
 * (a server action) after upload completes. Simpler than wiring up the
 * `onUploadCompleted` webhook, which doesn't fire reliably in local dev.
 */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const adId = (clientPayload ?? "").trim();
        if (!adId || !pathname.startsWith(`ads/${adId}/`)) {
          throw new Error("Invalid upload path");
        }
        const [ad] = await db().select({ id: ads.id }).from(ads).where(eq(ads.id, adId)).limit(1);
        if (!ad) throw new Error("Ad not found");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
          maximumSizeInBytes: 25 * 1024 * 1024,
          tokenPayload: adId,
        };
      },
      onUploadCompleted: async () => {
        // No-op. The client calls `recordAdPhoto` on its side after
        // upload() resolves to persist the DB row.
      },
    });
    return Response.json(jsonResponse);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
