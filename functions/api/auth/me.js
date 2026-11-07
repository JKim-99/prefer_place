import { json, sessionToken, sameOrigin, cookie } from '../../../lib/server/auth.js';
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: '사용자 데이터베이스가 설정되지 않았습니다.' }, 503);
  const hash = await sessionToken(request); if (!hash) return json({ user: null });
  const user = await env.DB.prepare('SELECT users.id, users.nickname, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?').bind(hash, Math.floor(Date.now()/1000)).first();
  return json({ user: user || null });
}
export async function onRequestDelete({ request, env }) {
  if (!sameOrigin(request)) return json({ error: '올바른 요청이 아닙니다.' }, 403);
  if (!env.DB) return json({ error: '사용자 데이터베이스가 설정되지 않았습니다.' }, 503);
  const hash = await sessionToken(request); if (hash) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
  return json({ ok: true }, 200, { 'set-cookie': cookie(request, '', 0) });
}
