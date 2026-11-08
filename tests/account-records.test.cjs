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
const recordsUrl = url(read('functions/api/places/records.js').replace("'../../../lib/server/auth.js'", `'${authUrl}'`).replace("'../../../lib/server/place-auth.js'", `'${userUrl}'`));
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
test('profile rejects invalid avatar and password confirmation before modifying data', async () => {
  const { onRequestPatch } = await import(profileUrl); const calls = [];
  const db = { prepare(sql) { return { bind(...args) { calls.push(sql); return { first: async () => ({ id: 'owner' }) }; } }; } };
  const profile = { action: 'profile', username: 'valid_user', nickname: '테스트', avatar: 'data:image/svg+xml;base64,AAAA' };
  assert.equal((await onRequestPatch({ request: request('/api/auth/profile', profile), env: { DB: db } })).status, 400);
  assert.equal((await onRequestPatch({ request: request('/api/auth/profile', { action: 'password', newPassword: 'long-password', passwordConfirm: 'different' }), env: { DB: db } })).status, 400);
  assert.equal(calls.some(sql => sql.startsWith('UPDATE')), false);
});
