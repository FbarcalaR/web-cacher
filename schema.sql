CREATE TABLE IF NOT EXISTS snapshots (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  host        TEXT NOT NULL,
  title       TEXT,
  content     TEXT,
  html_url    TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')),  'A') ||
    setweight(to_tsvector('simple', coalesce(host,  '')),  'B') ||
    setweight(to_tsvector('simple', coalesce(url,   '')),  'C') ||
    setweight(to_tsvector('simple', coalesce(content, '')),'D')
  ) STORED
);

CREATE INDEX IF NOT EXISTS snapshots_search_idx
  ON snapshots USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS snapshots_captured_at_idx
  ON snapshots (captured_at DESC);
