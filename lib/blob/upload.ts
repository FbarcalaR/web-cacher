import { put } from "@vercel/blob";

/**
 * Hot-link guards on the listing CDNs require a Referer from their own domain.
 * Map source → Referer header value.
 */
const REFERERS: Record<string, string> = {
  "pictures.immobilienscout24.de": "https://www.immobilienscout24.de/",
  "mms.immowelt.de": "https://www.immowelt.de/",
};

export type UploadedPhoto = {
  blobUrl: string;
  blobPath: string;
  position: number;
};

/**
 * Download remote image URLs and upload them to Vercel Blob under
 * `ads/<adId>/<position>.jpg`. Sequential — the source CDNs sometimes
 * rate-limit when hit in parallel.
 *
 * Individual failures do NOT abort the whole batch. If half the images have
 * expired seals (Immowelt) or hit a rate limit, we keep the ones that
 * succeeded. Only when EVERY image fails do we surface an error to the
 * caller — the alternative (throwing on the first failure) meant one bad
 * URL destroyed the entire ingest.
 */
export async function uploadAdPhotos(
  adId: string,
  remoteUrls: string[],
): Promise<UploadedPhoto[]> {
  const out: UploadedPhoto[] = [];
  const failures: Array<{ url: string; reason: string }> = [];

  for (let i = 0; i < remoteUrls.length; i++) {
    const remote = remoteUrls[i]!;
    try {
      const uploaded = await uploadOne(adId, remote, out.length);
      out.push(uploaded);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`upload failed for image ${i} (${remote}): ${reason}`);
      failures.push({ url: remote, reason });
    }
  }

  if (out.length === 0 && failures.length > 0) {
    throw new Error(
      `All ${failures.length} image(s) failed to download or upload. First error: ${failures[0]!.reason}`,
    );
  }

  return out;
}

async function uploadOne(
  adId: string,
  remote: string,
  position: number,
): Promise<UploadedPhoto> {
  const blobPath = `ads/${adId}/${position}.jpg`;
  const headers: HeadersInit = {};
  try {
    const host = new URL(remote).hostname;
    const referer = REFERERS[host];
    if (referer) headers.Referer = referer;
  } catch {
    // Bad URL — let fetch fail with a clear error below.
  }
  const res = await fetch(remote, { headers });
  if (!res.ok) {
    throw new Error(`fetch ${remote}: HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const bytes = await res.arrayBuffer();
  const blob = await put(blobPath, bytes, {
    access: "public",
    contentType,
  });
  return { blobUrl: blob.url, blobPath, position };
}
