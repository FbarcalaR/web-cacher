"use client";

import { useState } from "react";

type CaptureResponse = {
  id: string;
  url: string;
  host: string;
  title: string;
  htmlUrl: string;
  assetCount: number;
  failures: number;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResponse | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setError("That doesn't look like a valid URL.");
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setError("Only http and https URLs are supported.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: parsed.href }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Capture failed");
      setResult(data);
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1>Cache a web page</h1>
      <p className="lead">
        Paste a URL — we&apos;ll fetch the page, its images and stylesheets, and
        store a snapshot you can read later even if the original disappears.
      </p>

      <form onSubmit={submit} className="row">
        <input
          type="url"
          inputMode="url"
          autoFocus
          placeholder="https://example.com/listing/12345"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          required
        />
        <button type="submit" disabled={loading || !url}>
          {loading ? "Storing…" : "Store"}
        </button>
      </form>

      {loading && (
        <div className="status">
          Fetching the page and its assets. This usually takes 5–20 seconds.
        </div>
      )}

      {error && <div className="status error">{error}</div>}

      {result && (
        <div className="status success">
          Saved <strong>{result.title}</strong> ({result.assetCount} assets
          {result.failures > 0 ? `, ${result.failures} failed` : ""}).{" "}
          <a href={result.htmlUrl} target="_blank" rel="noopener noreferrer">
            Open snapshot
          </a>{" "}
          · <a href="/library">View library</a>
        </div>
      )}
    </>
  );
}
