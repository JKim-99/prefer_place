const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'public/index.html'), 'utf8');
const geo = JSON.parse(readFileSync(resolve(root, 'public/assets/data/sigungu.geojson'), 'utf8'));

test('homepage provides a manual region picker and a map', () => {
  for (const expected of ['지금 내가 있는 곳 지정하기', '시·도 선택', '시·군·구 선택', 'region-dialog', 'region-map']) assert.ok(html.includes(expected), `missing: ${expected}`);
  assert.doesNotMatch(html, /navigator\.geolocation/);
});

test('boundary data covers the source dataset and the requested examples', () => {
  const provinces = new Set(geo.features.map(f => f.properties.sidonm));
  assert.equal(provinces.size, 16);
  assert.ok(provinces.has('전남광주통합특별시'));
  assert.ok(geo.features.some(f => f.properties.sidonm === '서울특별시' && f.properties.sggnm === '강남구'));
  assert.equal(geo.features.filter(f => f.properties.sidonm === '충청남도' && /^천안시.*구$/.test(f.properties.sggnm)).length, 2);
  assert.ok(geo.features.some(f => f.properties.sidonm === '세종특별자치시'));
});
