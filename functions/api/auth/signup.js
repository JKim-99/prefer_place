import { json, readBody, validEmail, validUsername, validPassword, hashPassword, newSession, cookie } from '../../../lib/server/auth.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: '사용자 데이터베이스가 설정되지 않았습니다.' }, 503);
  const body = await readBody(request); if (!body) return json({ error: '올바른 요청이 아닙니다.' }, 400);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const gender = body.gender || null;
  if (!validUsername(username) || ![null, 'female', 'male', 'other', 'undisclosed'].includes(gender) || body.password !== body.passwordConfirm || !validEmail(email) || !validPassword(body.password) || nickname.length < 2 || nickname.length > 30) return json({ error: '아이디, 닉네임, 이메일과 비밀번호 확인을 확인해 주세요.' }, 400);
  try {
    const id = crypto.randomUUID(); const passwordHash = await hashPassword(body.password);
    await env.DB.prepare('INSERT INTO users (id, username, email, nickname, password_hash, gender) VALUES (?, ?, ?, ?, ?, ?)').bind(id, username, email, nickname, passwordHash, gender).run();
    const token = await newSession(env.DB, id);
    return json({ user: { id, username, nickname, email, gender, avatar: null } }, 201, { 'set-cookie': cookie(request, token, 604800) });
  } catch (error) {
    if (String(error?.message).includes('UNIQUE constraint failed')) return json({ error: '이미 사용 중인 아이디 또는 이메일입니다.' }, 409);
    return json({ error: '회원가입을 처리하지 못했습니다.' }, 500);
  }
}
