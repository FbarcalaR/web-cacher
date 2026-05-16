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
 * rate-limit when hit in parallel. For a handful of images per ad
 * (the realistic ceiling for ImmoScout24 / Immowelt) this is fast enough.
 */
export async function uploadAdPhotos(
  adId: string,
  remoteUrls: string[],
): Promise<UploadedPhoto[]> {
  const out: UploadedPhoto[] = [];
  for (let i = 0; i < remoteUrls.length; i++) {
    const remote = remoteUrls[i]!;
    const blobPath = `ads/${adId}/${i}.jpg`;
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
      throw new Error(
        `Failed to fetch image ${i} from ${remote}: HTTP ${res.status}`,
      );
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const bytes = await res.arrayBuffer();
    const blob = await put(blobPath, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    out.push({ blobUrl: blob.url, blobPath, position: i });
  }
  return out;
}
