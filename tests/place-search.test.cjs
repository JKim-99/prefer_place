const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { webcrypto } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const read = path => readFileSync(resolve(__dirname, '..', path), 'utf8');
const authUrl = moduleUrl(read('lib/server/auth.js'));
const userUrl = moduleUrl(read('lib/server/place-auth.js').replace("'./auth.js'", `'${authUrl}'`));
const searchUrl = moduleUrl(read('functions/api/places/search.js').replace("'../../../lib/server/auth.js'", `'${authUrl}'`).replace("'../../../lib/server/place-auth.js'", `'${userUrl}'`));
test('place search requires a session and key, and forwards only needed Kakao fields', async () => {
  const { onRequestGet } = await import(searchUrl);
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ id: 'user' }) }) }) };
  const anonymous = new Request('https://example.test/api/places/search?q=cafe');
  assert.equal((await onRequestGet({ request: anonymous, env: { DB: db } })).status, 401);
  const request = new Request('https://example.test/api/places/search?q=cafe', { headers: { Cookie: `place_session=${'a'.repeat(64)}` } });
  assert.equal((await onRequestGet({ request, env: { DB: db } })).status, 503);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url.hostname, 'dapi.kakao.com'); assert.equal(url.searchParams.get('query'), 'cafe');
      assert.equal(options.headers.Authorization, 'KakaoAK test-key');
      return Response.json({ documents: [{ id: '1', place_name: '카페', category_group_code: 'CE7', category_name: '카페', road_address_name: '주소', x: '127', y: '37', place_url: 'https://place.map.kakao.com/1', phone: 'not-returned' }] });
    };
    const response = await onRequestGet({ request, env: { DB: db, KAKAO_REST_API_KEY: 'test-key' } });
    const data = await response.json(); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(data.places[0].name, '카페'); assert.equal(data.places[0].phone, undefined);
  } finally { globalThis.fetch = original; }
});
