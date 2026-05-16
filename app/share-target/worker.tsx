import { redirect } from "next/navigation";

import { ingestAd } from "@/lib/ingest";

import { ShareTargetError } from "./error-view";

/**
 * Server-side ingest. Runs inside the Suspense boundary defined by the page,
 * so the spinner streams to the client immediately and this component takes
 * however long the scrape + upload + DB writes need (bounded by maxDuration).
 *
 * On success, `redirect()` throws — Next consumes the throw and emits a
 * client-side navigation. The error branch swallows everything else so the
 * user never sees a Next error page in the share flow.
 */
export async function ShareTargetWorker({ url }: { url: string }) {
  let result: { id: string };
  try {
    result = await ingestAd(url);
  } catch (err) {
    return <ShareTargetError message={errorMessage(err)} />;
  }
  redirect(`/ad/${result.id}`);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Save failed.";
}
