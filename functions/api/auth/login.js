import { json, readBody, validEmail, validPassword, verifyPassword, newSession, cookie } from '../../../lib/server/auth.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: '사용자 데이터베이스가 설정되지 않았습니다.' }, 503);
  const body = await readBody(request); if (!body) return json({ error: '올바른 요청이 아닙니다.' }, 400);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!validEmail(email) || !validPassword(body.password)) return json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
  const now = Math.floor(Date.now() / 1000);
  const attempt = await env.DB.prepare('SELECT failures, locked_until FROM login_attempts WHERE email = ?').bind(email).first();
  if (attempt?.locked_until > now) return json({ error: '잠시 후 다시 시도해 주세요.' }, 429);
  const user = await env.DB.prepare('SELECT id, nickname, email, password_hash FROM users WHERE email = ?').bind(email).first();
  if (!user || !await verifyPassword(body.password, user.password_hash)) {
    await env.DB.prepare(`INSERT INTO login_attempts (email, failures, locked_until, updated_at) VALUES (?, 1, 0, ?)
      ON CONFLICT(email) DO UPDATE SET failures = CASE WHEN updated_at < ? OR locked_until > 0 THEN 1 ELSE failures + 1 END,
      locked_until = CASE WHEN updated_at >= ? AND locked_until = 0 AND failures >= 4 THEN ? ELSE 0 END, updated_at = ?`).bind(email, now, now-900, now-900, now+900, now).run();
    return json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE email = ?').bind(email).run();
  const token = await newSession(env.DB, user.id);
  return json({ user: { id: user.id, nickname: user.nickname, email: user.email } }, 200, { 'set-cookie': cookie(request, token, 604800) });
}
