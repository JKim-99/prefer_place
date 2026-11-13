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
test('password change limits repeated incorrect current-password attempts', async () => {
  const { onRequestPatch } = await import(profileUrl);
  const { hashPassword } = await import(authUrl);
  const hash = await hashPassword('correct-password');
  let failures = 0, passwordReads = 0;
  const db = { prepare(sql) { return { bind(...args) { return {
    first: async () => {
      if (sql.includes('FROM sessions JOIN users')) return { id:'owner' };
      if (sql.includes('FROM login_attempts')) return failures >= 5 ? {failures,locked_until:Math.floor(Date.now()/1000)+900} : {failures,locked_until:0};
      if (sql.includes('SELECT password_hash')) { passwordReads++; return {password_hash:hash}; }
      return null;
    },
    run: async () => { if (sql.includes('INSERT INTO login_attempts')) { assert.equal(args[0],'password:owner'); failures++; } return {meta:{changes:1}}; }
  }; } }; } };
  const body = { action:'password', currentPassword:'wrong-password', newPassword:'new-password-long', passwordConfirm:'new-password-long' };
  for (let i=0;i<5;i++) assert.equal((await onRequestPatch({request:request('/api/auth/profile',body),env:{DB:db}})).status,400);
  assert.equal((await onRequestPatch({request:request('/api/auth/profile',body),env:{DB:db}})).status,429);
  assert.equal(passwordReads,5);
});
test('personal notes and visit state are validated and scoped to the owner', async () => {
  const { onRequestPatch, onRequestGet } = await import(recordsUrl); const calls = [];
  const db = { prepare(sql) { return { bind(...args) { calls.push({sql, args}); return { first: async () => ({ id: 'owner' }), run: async () => ({ meta: { changes: args.at(-1) === 'biz:missing' ? 0 : 1 } }), all: async () => ({ results: [] }) }; } }; } };
  const details = { action: 'details', placeId: 'biz:abc', note: '조용한 곳', visitStatus: 'again' };
  assert.equal((await onRequestPatch({request: request('/api/places/records', details, false), env: {DB: db}})).status, 401);
  assert.equal((await onRequestPatch({request: request('/api/places/records', {...details, note: 'x'.repeat(1001)}), env: {DB: db}})).status, 400);
  assert.equal((await onRequestPatch({request: request('/api/places/records', {...details, visitStatus: 'invalid'}), env: {DB: db}})).status, 400);
  assert.equal((await onRequestPatch({request: request('/api/places/records', {...details, tags: Array(9).fill('tag')}), env: {DB: db}})).status, 400);
  assert.equal((await onRequestPatch({request: request('/api/places/records', {...details, tags: ['카페','카페']}), env: {DB: db}})).status, 400);
  for (const visitDate of ['2026-02-29','2026-13-01','1899-12-31',null]) assert.equal((await onRequestPatch({request:request('/api/places/records',{...details,visitDate}),env:{DB:db}})).status,400);
  assert.equal((await onRequestPatch({request: request('/api/places/records', {...details, placeId: 'biz:missing'}), env: {DB: db}})).status, 404);
  assert.equal((await onRequestPatch({request: request('/api/places/records', details), env: {DB: db}})).status, 200);
  const update = calls.findLast(c => c.sql.startsWith('UPDATE place_records SET note'));
  assert.match(update.sql, /WHERE user_id = \? AND place_id = \?/);
  assert.deepEqual(update.args, ['조용한 곳', 'again', 'owner', 'biz:abc']);
  assert.equal((await onRequestPatch({request: request('/api/places/records', {...details, tags: [' 조용함 ', '산책']}), env: {DB: db}})).status, 200);
  const tagUpdate = calls.findLast(c => c.sql.includes('visit_status = ?, tags = ?'));
  assert.deepEqual(tagUpdate.args, ['조용한 곳', 'again', '["조용함","산책"]', 'owner', 'biz:abc']);
  assert.equal((await onRequestPatch({request:request('/api/places/records',{...details,tags:['산책'],visitDate:'2024-02-29'}),env:{DB:db}})).status,200);
  const dateUpdate = calls.findLast(c => c.sql.includes('visit_date = ?'));
  assert.deepEqual(dateUpdate.args, ['조용한 곳','again','["산책"]','2024-02-29','owner','biz:abc']);
  await onRequestGet({request: new Request('https://example.test/api/places/records?mode=anonymous&sido=A&district=B'), env: {DB: db}});
  const publicQuery = calls.at(-1).sql;
  assert.doesNotMatch(publicQuery, /r\.note|r\.visit_status|r\.visit_date|r\.tags/);
});
