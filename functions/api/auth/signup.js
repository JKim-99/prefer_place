import { json, readBody, validEmail, validPassword, hashPassword, newSession, cookie } from '../../../lib/server/auth.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: '사용자 데이터베이스가 설정되지 않았습니다.' }, 503);
  const body = await readBody(request); if (!body) return json({ error: '올바른 요청이 아닙니다.' }, 400);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  if (!validEmail(email) || !validPassword(body.password) || nickname.length < 2 || nickname.length > 30) return json({ error: '닉네임, 이메일과 비밀번호를 확인해 주세요.' }, 400);
  try {
    const id = crypto.randomUUID(); const passwordHash = await hashPassword(body.password);
    await env.DB.prepare('INSERT INTO users (id, email, nickname, password_hash) VALUES (?, ?, ?, ?)').bind(id, email, nickname, passwordHash).run();
    const token = await newSession(env.DB, id);
    return json({ user: { id, nickname, email } }, 201, { 'set-cookie': cookie(request, token, 604800) });
  } catch (error) {
    if (String(error?.message).includes('UNIQUE constraint failed')) return json({ error: '이미 가입된 이메일입니다.' }, 409);
    return json({ error: '회원가입을 처리하지 못했습니다.' }, 500);
  }
}
