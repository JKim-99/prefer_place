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
