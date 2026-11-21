import { json } from '../../../lib/server/auth.js';
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: '사용자를 찾을 수 없습니다.' }, 404);
  const offset = Number(new URL(request.url).searchParams.get('offset') || '0');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return json({ error: '목록 위치를 확인해 주세요.' }, 400);
  const user = await env.DB.prepare('SELECT id, nickname, avatar FROM users WHERE id = ? AND places_public = 1').bind(id).first();
  if (!user) return json({ error: '사용자를 찾을 수 없습니다.' }, 404);
  const rows = await env.DB.prepare(`SELECT p.id AS place_id, p.name, p.address, p.category, p.latitude, p.longitude, r.region_sido, r.region_district, r.visit_intent AS visit_status FROM place_records r JOIN users u ON u.id = r.user_id AND u.places_public = 1 JOIN public_places p ON p.id = r.place_id WHERE r.user_id = ? ORDER BY r.region_sido, r.region_district, p.name LIMIT 101 OFFSET ?`).bind(id, offset).all();
  return json({ user, records: rows.results.slice(0, 100), nextOffset: rows.results.length > 100 ? offset + 100 : null });
}
