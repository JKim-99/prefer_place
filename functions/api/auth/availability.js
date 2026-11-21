import { json, readBody, validUsername } from '../../../lib/server/auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: '사용자 데이터베이스가 설정되지 않았습니다.' }, 503);
  const body = await readBody(request, 512);
  if (!body || !['username', 'nickname'].includes(body.field) || typeof body.value !== 'string') return json({ error: '입력 정보를 확인해 주세요.' }, 400);
  const value = body.value.trim();
  if (body.field === 'username' ? !validUsername(value) : value.length < 2 || value.length > 30) return json({ error: '입력 형식을 확인해 주세요.' }, 400);
  const sql = body.field === 'username'
    ? 'SELECT 1 AS found FROM users WHERE username = ? COLLATE NOCASE LIMIT 1'
    : 'SELECT 1 AS found FROM users WHERE lower(trim(nickname)) = lower(?) LIMIT 1';
  const row = await env.DB.prepare(sql).bind(value).first();
  return json({ field: body.field, available: !row });
}
