const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { webcrypto } = require('node:crypto');
const { test } = require('node:test');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const source = readFileSync(resolve(__dirname, '../lib/server/auth.js'), 'utf8');
const auth = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('password hashes use unique salts and verify correct passwords', async () => {
  const a = await auth;
  const first = await a.hashPassword('correct-password');
  const second = await a.hashPassword('correct-password');
  assert.notEqual(first, second);
  assert.equal(await a.verifyPassword('correct-password', first), true);
  assert.equal(await a.verifyPassword('wrong-password', first), false);
  assert.equal(await a.verifyPassword('correct-password', 'invalid'), false);
});
test('state-changing requests require the same origin and cookies are protected', async () => {
  const a = await auth;
  const url = 'https://example.com/api/auth/login';
  assert.equal(a.sameOrigin(new Request(url, { headers: { Origin: 'https://example.com' } })), true);
  assert.equal(a.sameOrigin(new Request(url, { headers: { Origin: 'https://other.example' } })), false);
  assert.match(a.cookie(new Request(url), 'token', 60), /HttpOnly; SameSite=Lax; Secure/);
});
