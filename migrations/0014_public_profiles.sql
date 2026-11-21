-- The unique index deliberately aborts migration if existing nicknames collide.
CREATE UNIQUE INDEX idx_users_nickname_unique ON users(lower(trim(nickname)));
ALTER TABLE users ADD COLUMN places_public INTEGER NOT NULL DEFAULT 1 CHECK(places_public IN (0,1));
UPDATE users SET places_public = CASE WHEN EXISTS (SELECT 1 FROM place_records r WHERE r.user_id = users.id AND r.is_public = 1) THEN 1 ELSE 0 END;
ALTER TABLE place_records ADD COLUMN visit_intent TEXT NOT NULL DEFAULT '' CHECK(visit_intent IN ('', 'want', 'again', 'avoid'));
UPDATE place_records SET visit_intent = CASE visit_status WHEN 'want' THEN 'want' WHEN 'visited' THEN 'again' WHEN 'again' THEN 'again' ELSE '' END;
CREATE INDEX idx_records_public_region ON place_records(region_sido, region_district, place_id, user_id);
