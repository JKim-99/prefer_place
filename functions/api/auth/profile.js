import { json, readBody, validUsername, validPassword, hashPassword, verifyPassword, sessionToken } from '../../../lib/server/auth.js';
import { currentUser } from '../../../lib/server/place-auth.js';

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ error: '사용자 데이터베이스가 설정되지 않았습니다.' }, 503);
  const body = await readBody(request, 200000); if (!body) return json({ error: '요청 또는 이미지 크기를 확인해 주세요.' }, 400);
  const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  if (body.action === 'profile') {
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const gender = body.gender || null, avatar = body.avatar || null;
    if (nickname.length < 2 || nickname.length > 30 || !validUsername(username) || ![null, 'female', 'male', 'other', 'undisclosed'].includes(gender) || (avatar && (typeof avatar !== 'string' || avatar.length > 180000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)))) return json({ error: '입력한 정보 또는 이미지 크기를 확인해 주세요.' }, 400);
    try {
      const old = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(user.id).first();
      if (old.username && old.username.toLowerCase() !== username) return json({ error: '아이디는 변경할 수 없습니다.' }, 400);
      await env.DB.prepare('UPDATE users SET username = ?, nickname = ?, gender = ?, avatar = ? WHERE id = ?').bind(username, nickname, gender, avatar, user.id).run();
      const updated = await env.DB.prepare('SELECT id, username, nickname, email, gender, avatar FROM users WHERE id = ?').bind(user.id).first();
      return json({ user: updated });
    } catch (error) {
      if (String(error?.message).includes('UNIQUE constraint failed')) return json({ error: '이미 사용 중인 아이디입니다.' }, 409);
      return json({ error: '정보를 저장하지 못했습니다.' }, 500);
    }
  }
  if (body.action === 'password') {
    if (!validPassword(body.newPassword) || body.newPassword !== body.passwordConfirm) return json({ error: '새 비밀번호와 확인을 확인해 주세요.' }, 400);
    const now = Math.floor(Date.now() / 1000), limitKey = `password:${user.id}`;
    const attempt = await env.DB.prepare('SELECT failures, locked_until FROM login_attempts WHERE email = ?').bind(limitKey).first();
    if (attempt?.locked_until > now) return json({ error: '비밀번호 확인을 여러 번 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 429);
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
    if (!row || !await verifyPassword(body.currentPassword, row.password_hash)) {
      await env.DB.prepare(`INSERT INTO login_attempts (email, failures, locked_until, updated_at) VALUES (?, 1, 0, ?)
        ON CONFLICT(email) DO UPDATE SET failures = CASE WHEN updated_at < ? OR locked_until > 0 THEN 1 ELSE failures + 1 END,
        locked_until = CASE WHEN updated_at >= ? AND locked_until = 0 AND failures >= 4 THEN ? ELSE 0 END, updated_at = ?`).bind(limitKey, now, now-900, now-900, now+900, now).run();
      return json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 400);
    }
    const token = await sessionToken(request);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(body.newPassword), user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, token),
      env.DB.prepare('DELETE FROM login_attempts WHERE email = ?').bind(limitKey)
    ]);
    return json({ ok: true });
  }
  return json({ error: '요청을 확인해 주세요.' }, 400);
}
