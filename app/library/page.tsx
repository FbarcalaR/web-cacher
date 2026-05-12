"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  id: string;
  url: string;
  host: string;
  title: string | null;
  html_url: string;
  captured_at: string;
};

export default function Library() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results || []);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [q]);

  const remove = async (id: string) => {
    if (!confirm("Delete this snapshot?")) return;
    await fetch(`/api/search?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setResults((r) => r.filter((s) => s.id !== id));
  };

  return (
    <>
      <h1>Library</h1>
      <p className="lead">Search across the title, URL, and visible text of every snapshot.</p>

      <input
        type="search"
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />

      {loading && <div className="empty">Loading…</div>}

      {!loading && results.length === 0 && (
        <div className="empty">
          {q ? "No snapshots match." : "No snapshots yet — capture one from the home page."}
        </div>
      )}

      <div className="results">
        {results.map((s) => (
          <div key={s.id} className="card">
            <div className="title">
              <a href={s.html_url} target="_blank" rel="noopener noreferrer">
                {s.title || s.url}
              </a>
            </div>
            <div className="url">{s.url}</div>
            <div className="meta">
              {s.host} · {new Date(s.captured_at).toLocaleString()} ·{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); remove(s.id); }}>
                delete
              </a>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
