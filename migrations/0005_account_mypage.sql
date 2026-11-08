-- Existing accounts retain email login until they choose a username in their profile.
ALTER TABLE users ADD COLUMN username TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX idx_users_username ON users(username COLLATE NOCASE);
ALTER TABLE users ADD COLUMN gender TEXT;
ALTER TABLE users ADD COLUMN avatar TEXT;
ALTER TABLE place_records ADD COLUMN category TEXT NOT NULL DEFAULT 'other' CHECK(category IN ('restaurant', 'cafe', 'stay', 'other'));
