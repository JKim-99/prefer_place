const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const root = resolve(__dirname, '..');

test('project uses provider-neutral map placeholder and starts with map/list discovery', () => {
  const html = readFileSync(resolve(root, 'public/index.html'), 'utf8');
  assert.match(html, /지도 보기/);
  assert.match(html, /목록 보기/);
  assert.match(html, /지도 제공자를 선택한 뒤 연결할 예정입니다/);
  assert.match(html, /aria-label="대한민국 장소 지도 미리보기"/);
});

test('regions migration models Korean administrative hierarchy without a seeded user database', () => {
  const sql = readFileSync(resolve(root, 'migrations/0001_initial_place_archive.sql'), 'utf8');
  assert.match(sql, /level IN \('sido', 'sigungu', 'eupmyeondong'\)/);
  assert.match(sql, /parent_id TEXT REFERENCES regions\(id\)/);
  assert.match(sql, /centroid_lat REAL/);
  assert.match(sql, /centroid_lng REAL/);
  assert.doesNotMatch(sql, /INSERT INTO regions/i);
});