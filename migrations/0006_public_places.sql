-- Existing Kakao records keep their IDs, aliases and visibility. The old
-- category values were inferred from Kakao responses and must not be reused.
UPDATE place_records SET category = 'other';
CREATE TABLE IF NOT EXISTS public_places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('restaurant','cafe','stay','other')),
  category_name TEXT NOT NULL,
  region_sido TEXT NOT NULL,
  region_district TEXT NOT NULL,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  data_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_public_places_region ON public_places(region_sido, region_district);
