const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'public/index.html'), 'utf8');
const geo = JSON.parse(readFileSync(resolve(root, 'public/assets/data/sigungu.geojson'), 'utf8'));

test('homepage provides a manual region picker and a map', () => {
  for (const expected of ['지금 어디에 있나요?', '시·도 선택', '시·군·구 선택', 'region-dialog', 'region-map']) assert.ok(html.includes(expected), `missing: ${expected}`);
  assert.doesNotMatch(html, /navigator\.geolocation/);
});

test('map detail styling follows the homepage palette without removing map controls', () => {
  const css = readFileSync(resolve(__dirname, '../public/assets/css/styles.css'), 'utf8');
  for (const expected of ['#region-map .region-other', '#region-map .region-side', '#region-map .region-selected', '#region-map .neighborhood-border', '#region-map #neighborhood-labels text', '#region-map .place-marker-position{pointer-events:none}', '#region-map .place-marker{pointer-events:none}', '#region-map .place-marker-hit{pointer-events:all']) {
    assert.ok(css.includes(expected), `missing map surface style: ${expected}`);
  }
  for (const expected of ['id="zoom-in"', 'id="zoom-out"', 'id="zoom-reset"', 'id="region-map"']) assert.ok(html.includes(expected), `missing existing map control: ${expected}`);
  const app = readFileSync(resolve(__dirname, '../public/assets/js/app.js'), 'utf8');
  assert.match(app, /svg\.addEventListener\('wheel'/);
  assert.match(app, /svg\.addEventListener\('pointerdown'/);
  assert.match(app, /id = 'neighborhood-borders'/);
  assert.match(app, /for \(let layer = 1; layer >= 1; layer--\)/);
  const places = readFileSync(resolve(__dirname, '../public/assets/js/places.js'), 'utf8');
  assert.match(places, /position\.setAttribute\('class', 'place-marker-position'\)/);
});

test('boundary data covers the source dataset and the requested examples', () => {
  const provinces = new Set(geo.features.map(f => f.properties.sidonm));
  assert.equal(provinces.size, 16);
  assert.ok(provinces.has('전남광주통합특별시'));
  assert.ok(geo.features.some(f => f.properties.sidonm === '서울특별시' && f.properties.sggnm === '강남구'));
  assert.equal(geo.features.filter(f => f.properties.sidonm === '충청남도' && /^천안시.*구$/.test(f.properties.sggnm)).length, 2);
  assert.ok(geo.features.some(f => f.properties.sidonm === '세종특별자치시'));
});

test('administrative neighborhood data includes Cheonan Buldang boundaries', () => {
  const dong = JSON.parse(readFileSync(resolve(root, 'public/assets/data/emd.geojson'), 'utf8'));
  const matches = dong.features.filter(f => f.properties.sidonm === '충청남도' && f.properties.sggnm === '천안시서북구' && /^불당[12]동$/.test(f.properties.dong));
  assert.deepEqual(matches.map(f => f.properties.dong).sort(), ['불당1동', '불당2동']);
  assert.ok(matches.every(f => ['Polygon', 'MultiPolygon'].includes(f.geometry.type)));
});
