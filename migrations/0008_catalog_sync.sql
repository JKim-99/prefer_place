ALTER TABLE public_places ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1));
ALTER TABLE public_places ADD COLUMN last_sync_token TEXT;
ALTER TABLE public_places ADD COLUMN source_version TEXT;
CREATE TABLE IF NOT EXISTS catalog_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running')),
  source_version TEXT,
  completed_version TEXT,
  run_token TEXT,
  region_index INTEGER NOT NULL DEFAULT 0,
  code_index INTEGER NOT NULL DEFAULT 0,
  page_number INTEGER NOT NULL DEFAULT 1,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_checked_at INTEGER,
  last_completed_at INTEGER
);
INSERT OR IGNORE INTO catalog_sync_state (id, status, completed_version) SELECT 1, 'idle', substr(data_version, 1, 6) FROM public_catalog_meta WHERE id = 1;
