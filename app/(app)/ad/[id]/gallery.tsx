"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Photo = {
  id: string;
  blobUrl: string;
  width: number | null;
  height: number | null;
};

export function Gallery({ photos }: { photos: Photo[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="relative aspect-[4/3] w-[88%] shrink-0 snap-center overflow-hidden rounded-xl bg-muted sm:w-[60%]"
          >
            <Image
              src={p.blobUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 88vw, 480px"
              className="object-cover"
              priority={i === 0}
            />
          </button>
        ))}
      </div>
      {openIndex !== null ? (
        <Lightbox photos={photos} start={openIndex} onClose={() => setOpenIndex(null)} />
      ) : null}
    </>
  );
}

function Lightbox({
  photos,
  start,
  onClose,
}: {
  photos: Photo[];
  start: number;
  onClose: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.children[start];
    if (target instanceof HTMLElement) {
      scroller.scrollTo({ left: target.offsetLeft, behavior: "instant" });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [start, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 z-10 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white"
        style={{ top: "max(1rem, env(safe-area-inset-top))" }}
      >
        Close
      </button>
      <div
        ref={scrollerRef}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto"
      >
        {photos.map((p) => (
          <div
            key={p.id}
            className="relative flex h-full w-full shrink-0 snap-center items-center justify-center"
          >
            <Image src={p.blobUrl} alt="" fill sizes="100vw" className="object-contain" />
          </div>
        ))}
      </div>
    </div>
  );
}
