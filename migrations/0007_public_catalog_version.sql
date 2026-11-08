CREATE TABLE IF NOT EXISTS public_catalog_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_version TEXT NOT NULL,
  imported_at INTEGER NOT NULL
);
