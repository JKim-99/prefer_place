const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const root = resolve(__dirname, '..');

test('place archive starts with region hierarchy, map/list switch, and place categories', () => {
  const html = readFileSync(resolve(root, 'public/index.html'), 'utf8');
  for (const expected of ['시·도', '시·군·구', '읍·면·동', '지도 보기', '목록 보기', '음식점', '카페', '숙박', '미용실']) {
    assert.ok(html.includes(expected), `missing: ${expected}`);
  }
});

test('place discovery example data is explicitly marked as fictitious', () => {
  const html = readFileSync(resolve(root, 'public/index.html'), 'utf8');
  assert.equal((html.match(/가상의 예시/g) || []).length, 3);
});

test('new project does not import Compose Coffee-specific site content', () => {
  const html = readFileSync(resolve(root, 'public/index.html'), 'utf8');
  assert.doesNotMatch(html, /컴포즈커피|composecoffee\.com/i);
});