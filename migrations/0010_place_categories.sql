ALTER TABLE public_places ADD COLUMN category_major TEXT NOT NULL DEFAULT '';
ALTER TABLE public_places ADD COLUMN category_middle TEXT NOT NULL DEFAULT '';
ALTER TABLE public_places ADD COLUMN category_version INTEGER NOT NULL DEFAULT 1 CHECK (category_version IN (1,2));

UPDATE public_places SET category_major = CASE
  WHEN category = 'cafe' THEN '음식'
  WHEN category = 'restaurant' THEN '음식'
  WHEN category = 'stay' THEN '숙박'
  ELSE ''
END
WHERE id LIKE 'biz:%';
UPDATE public_places SET category_version = 2 WHERE id LIKE 'biz:%';

DROP TABLE IF EXISTS public_places_new;
CREATE TABLE public_places_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('restaurant','cafe','stay','shopping','beauty','medical','culture','education','other')),
  category_name TEXT NOT NULL,
  region_sido TEXT NOT NULL,
  region_district TEXT NOT NULL,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  data_version TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  last_sync_token TEXT,
  source_version TEXT,
  category_major TEXT NOT NULL DEFAULT '',
  category_middle TEXT NOT NULL DEFAULT '',
  category_version INTEGER NOT NULL DEFAULT 1 CHECK(category_version IN (1,2))
);
INSERT INTO public_places_new SELECT * FROM public_places;
DROP TABLE public_places;
ALTER TABLE public_places_new RENAME TO public_places;
CREATE INDEX idx_public_places_region ON public_places(region_sido, region_district);

CREATE TABLE place_records_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  region_sido TEXT NOT NULL,
  region_district TEXT NOT NULL,
  alias TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
  created_at INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK(category IN ('restaurant','cafe','stay','shopping','beauty','medical','culture','education','other')),
  PRIMARY KEY(user_id, place_id)
);
INSERT INTO place_records_new SELECT user_id,place_id,region_sido,region_district,alias,is_public,created_at,category FROM place_records;
DROP TABLE place_records;
ALTER TABLE place_records_new RENAME TO place_records;
CREATE INDEX idx_place_records_region ON place_records(region_sido, region_district, is_public);

CREATE TABLE manual_places_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region_sido TEXT NOT NULL,
  region_district TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK(category IN ('restaurant','cafe','stay','shopping','beauty','medical','culture','education','other')),
  longitude REAL NOT NULL CHECK(longitude BETWEEN 124 AND 132),
  latitude REAL NOT NULL CHECK(latitude BETWEEN 33 AND 39),
  created_at INTEGER NOT NULL
);
INSERT INTO manual_places_new SELECT * FROM manual_places;
DROP TABLE manual_places;
ALTER TABLE manual_places_new RENAME TO manual_places;
CREATE INDEX idx_manual_places_user_region ON manual_places(user_id, region_sido, region_district);