CREATE TABLE IF NOT EXISTS manual_places (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region_sido TEXT NOT NULL,
  region_district TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK(category IN ('restaurant','cafe','stay','other')),
  longitude REAL NOT NULL CHECK(longitude BETWEEN 124 AND 132),
  latitude REAL NOT NULL CHECK(latitude BETWEEN 33 AND 39),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manual_places_user_region ON manual_places(user_id, region_sido, region_district);
