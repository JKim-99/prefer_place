ALTER TABLE catalog_sync_state ADD COLUMN expected_code_total INTEGER;
ALTER TABLE catalog_sync_state ADD COLUMN group_expected_total INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS catalog_sync_seen (
  run_token TEXT NOT NULL,
  place_id TEXT NOT NULL,
  PRIMARY KEY (run_token, place_id)
);
