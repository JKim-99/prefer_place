import { json, readBody, sameOrigin } from '../../../lib/server/auth.js';
import { currentUser } from '../../../lib/server/place-auth.js';
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  const url = new URL(request.url), sido = url.searchParams.get('sido') || '', district = url.searchParams.get('district') || '';
  if (!sido || !district || sido.length > 40 || district.length > 40) return json({ error: '지역을 확인해 주세요.' }, 400);
  const result = await env.DB.prepare('SELECT id, name, address, category, longitude, latitude FROM manual_places WHERE user_id = ? AND region_sido = ? AND region_district = ? ORDER BY created_at DESC LIMIT 200').bind(user.id, sido, district).all();
  return json({ places: result.results });
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  const body = await readBody(request); if (!body) return json({ error: '올바른 요청이 아닙니다.' }, 400);
  const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  const { sido, district, name, address, category, longitude, latitude } = body;
  if (typeof sido !== 'string' || !sido.trim() || sido.length > 40 || typeof district !== 'string' || !district.trim() || district.length > 40 || typeof name !== 'string' || !name.trim() || name.length > 80 || typeof address !== 'string' || address.length > 200 || !['restaurant','cafe','stay','other'].includes(category) || typeof longitude !== 'number' || longitude < 124 || longitude > 132 || typeof latitude !== 'number' || latitude < 33 || latitude > 39) return json({ error: '장소 정보를 확인해 주세요.' }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO manual_places (id,user_id,region_sido,region_district,name,address,category,longitude,latitude,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, user.id, sido, district, name.trim(), address.trim(), category, longitude, latitude, Math.floor(Date.now()/1000)).run();
  return json({ id }, 201);
}
export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  if (!sameOrigin(request)) return json({ error: '올바른 요청이 아닙니다.' }, 403);
  const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: '장소를 확인해 주세요.' }, 400);
  await env.DB.prepare('DELETE FROM manual_places WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  return json({ ok: true });
}
