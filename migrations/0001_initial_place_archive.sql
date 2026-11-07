CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  nickname TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('sido', 'sigungu', 'eupmyeondong')),
  parent_id TEXT REFERENCES regions(id),
  centroid_lat REAL,
  centroid_lng REAL
);

CREATE INDEX IF NOT EXISTS idx_regions_parent_level ON regions(parent_id, level);