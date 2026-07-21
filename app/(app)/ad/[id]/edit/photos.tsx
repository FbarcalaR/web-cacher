"use client";

import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";

import type { AdPhoto } from "@/lib/db/schema";

import { deleteAdPhoto, recordAdPhoto } from "../actions";

const MAX_BYTES = 25 * 1024 * 1024;

export function PhotoManager({ adId, photos }: { adId: string; photos: AdPhoto[] }) {
  const [isUploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFilesSelected(fileList: FileList | null): Promise<void> {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    try {
      for (const [i, file] of files.entries()) {
        if (file.size > MAX_BYTES) {
          throw new Error(`${file.name}: ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds 25 MB`);
        }
        const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg";
        const pathname = `ads/${adId}/manual-${Date.now()}-${i}.${ext}`;
        const blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/photos/upload-url",
          clientPayload: adId,
        });
        await recordAdPhoto(adId, blob.url, blob.pathname);
        setProgress({ done: i + 1, total: files.length });
      }
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setProgress(null), 1500);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Photos</h2>

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <PhotoTile key={p.id} photo={p} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No photos yet.</p>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Add photos</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            disabled={isUploading}
            onChange={(e) => void onFilesSelected(e.target.files)}
            className="text-sm"
          />
        </label>
        {progress ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {isUploading
              ? `Uploading ${progress.done + 1} of ${progress.total}…`
              : `Uploaded ${progress.done} of ${progress.total}`}
          </p>
        ) : null}
        {uploadError ? (
          <p className="text-xs text-red-600 dark:text-red-400">{uploadError}</p>
        ) : null}
      </div>
    </section>
  );
}

function PhotoTile({ photo }: { photo: AdPhoto }) {
  const [pending, startTransition] = useTransition();
  return (
    <li className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
      <Image
        src={photo.blobUrl}
        alt=""
        fill
        sizes="(max-width: 640px) 33vw, 25vw"
        className="object-cover"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this photo?")) return;
          startTransition(() => {
            deleteAdPhoto(photo.id).catch(() => {
              // Server action already logged; nothing more to do here.
            });
          });
        }}
        aria-label="Delete photo"
        className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white disabled:opacity-60"
      >
        {pending ? "…" : "×"}
      </button>
    </li>
  );
}
