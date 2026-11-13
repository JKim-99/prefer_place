const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const root = resolve(__dirname, '..');

test('regions migration models Korean administrative hierarchy without a seeded user database', () => {
  const sql = readFileSync(resolve(root, 'migrations/0001_initial_place_archive.sql'), 'utf8');
  assert.match(sql, /level IN \('sido', 'sigungu', 'eupmyeondong'\)/);
  assert.match(sql, /parent_id TEXT REFERENCES regions\(id\)/);
  assert.doesNotMatch(sql, /INSERT INTO regions/i);
});

test('place category migration supports nine app categories and preserves current data', () => {
  const sql = readFileSync(resolve(root, 'migrations/0010_place_categories.sql'), 'utf8');
  for (const category of ['restaurant','cafe','stay','shopping','beauty','medical','culture','education','other']) assert.ok(sql.includes(`'${category}'`));
  assert.match(sql, /INSERT INTO public_places_new SELECT \* FROM public_places/);
  assert.match(sql, /INSERT INTO place_records_new SELECT/);
  assert.match(sql, /INSERT INTO manual_places_new SELECT \* FROM manual_places/);
  assert.match(sql, /category_version INTEGER NOT NULL DEFAULT 1/);
});
