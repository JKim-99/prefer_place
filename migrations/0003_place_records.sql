CREATE TABLE IF NOT EXISTS place_records (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  region_sido TEXT NOT NULL,
  region_district TEXT NOT NULL,
  alias TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, place_id)
);
CREATE INDEX IF NOT EXISTS idx_place_records_region ON place_records(region_sido, region_district, is_public);
