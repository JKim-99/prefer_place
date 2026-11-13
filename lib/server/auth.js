const encoder = new TextEncoder();
// Cloudflare Workers WebCrypto caps PBKDF2 at 100,000 iterations.
// Keep this value aligned with the deployed runtime and the hash verifier.
const ITERATIONS = 100000;
const DAY = 86400;
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
export const hex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export const digest = async (value) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const derive = async (password, salt, iterations) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256)));
};
export async function hashPassword(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `pbkdf2-sha256$${ITERATIONS}$${salt}$${await derive(password, salt, ITERATIONS)}`;
}
export async function verifyPassword(password, encoded) {
  const [algorithm, count, salt, expected] = String(encoded).split('$');
  const iterations = Number(count);
  if (algorithm !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000 || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(expected || '')) return false;
  const actual = await derive(password, salt, iterations);
  let difference = 0; for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
export const validUsername = (value) => typeof value === 'string' && /^[a-zA-Z0-9_]{4,30}$/.test(value);
export const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validPassword = (value) => typeof value === 'string' && value.length >= 10 && value.length <= 128 && value.trim().length > 0;
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin;
}
export function cookie(request, token, age) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `place_session=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${age}`;
}
export async function sessionToken(request) {
  const token = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('place_session='))?.slice(14);
  return /^[a-f0-9]{64}$/.test(token || '') ? digest(token) : null;
}
export async function newSession(db, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await digest(token), userId, now + 7 * DAY).run();
  return token;
}
export async function readBody(request, maxLength = 4096) {
  if (!sameOrigin(request)) return null;
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return null;
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxLength)) return null;
  if (!request.body) return null;
  try {
    const reader = request.body.getReader(), chunks = []; let total = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > maxLength) { await reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; }
}
