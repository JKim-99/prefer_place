const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { webcrypto } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const read = p => readFileSync(resolve(__dirname, '..', p), 'utf8');
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const authUrl = url(read('lib/server/auth.js'));
const userUrl = url(read('lib/server/place-auth.js').replace("'./auth.js'", `'${authUrl}'`));
const categoryMapUrl = url(read('lib/place-category-map.js'));
const categoryUrl = url(read('lib/place-categories.js'));
const lookupUrl = url(read('lib/server/catalog-lookup.js').replace("'../place-categories.js'", `'${categoryUrl}'`));
const recordsUrl = url(read('functions/api/places/records.js').replace("'../../../lib/server/auth.js'", `'${authUrl}'`).replace("'../../../lib/server/place-auth.js'", `'${userUrl}'`).replace("'../../../lib/place-category-map.js'", `'${categoryMapUrl}'`).replace("'../../../lib/server/catalog-lookup.js'", `'${lookupUrl}'`));
const profileUrl = url(read('functions/api/auth/profile.js').replace("'../../../lib/server/auth.js'", `'${authUrl}'`).replace("'../../../lib/server/place-auth.js'", `'${userUrl}'`));
function request(path, data, signed = true, origin = 'https://example.test') {
  return new Request(`https://example.test${path}`, { method: 'PATCH', headers: { origin, 'content-type': 'application/json', ...(signed ? { cookie: `place_session=${'a'.repeat(64)}` } : {}) }, body: JSON.stringify(data) });
}
test('privacy changes require same-origin authentication and are scoped to the session owner', async () => {
  const { onRequestPatch } = await import(recordsUrl); const calls = [];
  const db = { prepare(sql) { return { bind(...args) { calls.push({ sql, args }); return { first: async () => ({ id: 'owner' }), run: async () => ({ meta: { changes: 1 } }) }; } }; } };
  const body = { placeId: '12345', isPublic: true };
  assert.equal((await onRequestPatch({ request: request('/api/places/records', body, false), env: { DB: db } })).status, 401);
  assert.equal((await onRequestPatch({ request: request('/api/places/records', body, true, 'https://evil.test'), env: { DB: db } })).status, 400);
  assert.equal((await onRequestPatch({ request: request('/api/places/records', body), env: { DB: db } })).status, 200);
  const update = calls.find(c => c.sql.startsWith('UPDATE place_records'));
  assert.match(update.sql, /WHERE user_id = \? AND place_id = \?/);
  assert.deepEqual(update.args, [1, 'owner', '12345']);
});
test('catalog lookup verifies source identity, region and coordinates', async () => {
  const { lookupPlace } = await import(lookupUrl);
  const item = { bizesId:'MA123', bizesNm:'카페', ctprvnNm:'충청남도', signguNm:'천안시서북구', lon:'127.1', lat:'36.8', indsLclsNm:'음식', indsSclsNm:'커피' };
  const fetcher = async () => ({ ok:true, json:async () => ({ header:{ resultCode:'00', stdrYm:'202609' }, body:{ items:[item] } }) });
  assert.equal((await lookupPlace('key','biz:MA123','충청남도','천안시',fetcher)).category, 'cafe');
  await assert.rejects(() => lookupPlace('key','biz:MA123','서울특별시','강남구',fetcher));
  await assert.rejects(() => lookupPlace('key','biz:DIFFERENT','충청남도','천안시',fetcher));
  await assert.rejects(() => lookupPlace('', 'biz:MA123','충청남도','천안시',fetcher));
});
test('profile rejects invalid avatar and password confirmation before modifying data', async () => {
  const { onRequestPatch } = await import(profileUrl); const calls = [];
  const db = { prepare(sql) { return { bind(...args) { calls.push(sql); return { first: async () => ({ id: 'owner' }) }; } }; } };
  const profile = { action: 'profile', username: 'valid_user', nickname: '테스트', avatar: 'data:image/svg+xml;base64,AAAA' };
  assert.equal((await onRequestPatch({ request: request('/api/auth/profile', profile), env: { DB: db } })).status, 400);
  assert.equal((await onRequestPatch({ request: request('/api/auth/profile', { action: 'password', newPassword: 'long-password', passwordConfirm: 'different' }), env: { DB: db } })).status, 400);
  assert.equal(calls.some(sql => sql.startsWith('UPDATE')), false);
});
test('personal notes and visit state are validated and scoped to the owner', async () => {
  const { onRequestPatch, onRequestGet } = await import(recordsUrl); const calls = [];
  const db = { prepare(sql) { return { bind(...args) { calls.push({sql, args}); return { first: async () => ({ id: 'owner' }), run: async () => ({ meta: { changes: args.at(-1) === 'biz:missing' ? 0 : 1 } }), all: async () => ({ results: [] }) }; } }; } };
  const details = { action: 'details', placeId: 'biz:abc', note: '조용한 곳', visitStatus: 'again' };
  assert.equal((await onRequestPatch({request: request('/api/places/records', details, false), env: {DB: db}})).status, 401);
  assert.equal((await onRequestPatch({request: request('/api/places/records', {...details, note: 'x'.repeat(1001)}), env: {DB: db}})).status, 400);
  assert.equal((await onRequestPatch({request: request('/api/places/records', {...details, visitStatus: 'invalid'}), env: {DB: db}})).status, 400);
  assert.equal((await onRequestPatch({request: request('/api/places/records', {...details, placeId: 'biz:missing'}), env: {DB: db}})).status, 404);
  assert.equal((await onRequestPatch({request: request('/api/places/records', details), env: {DB: db}})).status, 200);
  const update = calls.findLast(c => c.sql.startsWith('UPDATE place_records SET note'));
  assert.match(update.sql, /WHERE user_id = \? AND place_id = \?/);
  assert.deepEqual(update.args, ['조용한 곳', 'again', 'owner', 'biz:abc']);
  await onRequestGet({request: new Request('https://example.test/api/places/records?mode=anonymous&sido=A&district=B'), env: {DB: db}});
  const publicQuery = calls.at(-1).sql;
  assert.doesNotMatch(publicQuery, /r\.note|r\.visit_status/);
});
