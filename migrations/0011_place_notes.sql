ALTER TABLE place_records ADD COLUMN note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 1000);
ALTER TABLE place_records ADD COLUMN visit_status TEXT NOT NULL DEFAULT '' CHECK(visit_status IN ('', 'want', 'visited', 'again'));
