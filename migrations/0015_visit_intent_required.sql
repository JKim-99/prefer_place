-- Preserve all existing records while assigning the requested default.
UPDATE place_records SET visit_intent = 'again' WHERE visit_intent = '';
