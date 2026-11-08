import { json, readBody, sameOrigin } from '../../../lib/server/auth.js';
import { currentUser } from '../../../lib/server/place-auth.js';
const validId = id => /^(?:\d{1,30}|biz:[A-Za-z0-9]{1,40})$/.test(id || '');
const columns = `r.place_id, r.alias, r.is_public, r.region_sido, r.region_district, CASE WHEN p.id IS NULL THEN 'other' ELSE p.category END AS category, p.name, p.address, p.category_name, p.longitude, p.latitude, p.data_version`;
const join = ' FROM place_records r LEFT JOIN public_places p ON p.id = r.place_id ';
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  const url = new URL(request.url), sido = url.searchParams.get('sido') || '', district = url.searchParams.get('district') || '', mode = url.searchParams.get('mode') || 'mine';
  if (mode === 'mypage' || mode === 'mine') {
    const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
    if (mode === 'mine' && (!sido || !district || sido.length > 40 || district.length > 40)) return json({ error: '지역을 확인해 주세요.' }, 400);
    const statement = mode === 'mypage' ? env.DB.prepare(`SELECT ${columns} ${join} WHERE r.user_id = ? ORDER BY r.created_at DESC`).bind(user.id) : env.DB.prepare(`SELECT ${columns} ${join} WHERE r.user_id = ? AND r.region_sido = ? AND r.region_district = ? ORDER BY r.created_at DESC LIMIT 100`).bind(user.id, sido, district);
    return json({ records: (await statement.all()).results });
  }
  if (!sido || !district || sido.length > 40 || district.length > 40) return json({ error: '지역을 확인해 주세요.' }, 400);
  if (mode === 'popular') {
    const result = await env.DB.prepare(`SELECT p.id AS place_id, p.name, p.address, p.category, p.category_name, p.longitude, p.latitude, p.data_version, COUNT(DISTINCT r.user_id) AS count FROM place_records r JOIN public_places p ON p.id = r.place_id WHERE r.region_sido = ? AND r.region_district = ? AND r.is_public = 1 GROUP BY r.place_id HAVING COUNT(DISTINCT r.user_id) >= 3 ORDER BY count DESC LIMIT 100`).bind(sido, district).all();
    return json({ records: result.results });
  }
  if (mode === 'anonymous') {
    const result = await env.DB.prepare(`SELECT ${columns} ${join} WHERE r.is_public = 1 AND r.region_sido = ? AND r.region_district = ? AND r.user_id = (SELECT user_id FROM place_records WHERE is_public = 1 AND region_sido = ? AND region_district = ? AND place_id LIKE 'biz:%' GROUP BY user_id ORDER BY RANDOM() LIMIT 1) AND p.id IS NOT NULL LIMIT 100`).bind(sido, district, sido, district).all();
    return json({ records: result.results });
  }
  return json({ error: '조회 방식을 확인해 주세요.' }, 400);
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  const body = await readBody(request); if (!body) return json({ error: '올바른 요청이 아닙니다.' }, 400);
  const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  const { placeId, sido, district } = body;
  if (!/^biz:[A-Za-z0-9]{1,40}$/.test(placeId || '') || typeof sido !== 'string' || typeof district !== 'string') return json({ error: '장소 정보를 확인해 주세요.' }, 400);
  const place = await env.DB.prepare('SELECT id, category FROM public_places WHERE id = ? AND region_sido = ? AND region_district = ?').bind(placeId, sido, district).first();
  if (!place) return json({ error: '선택한 지역의 장소를 찾을 수 없습니다.' }, 404);
  await env.DB.prepare(`INSERT INTO place_records (user_id, place_id, region_sido, region_district, alias, is_public, created_at, category) VALUES (?, ?, ?, ?, '', 0, ?, ?) ON CONFLICT(user_id, place_id) DO NOTHING`).bind(user.id, placeId, sido, district, Math.floor(Date.now()/1000), place.category).run();
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  if (!sameOrigin(request)) return json({ error: '올바른 요청이 아닙니다.' }, 403);
  const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  const id = new URL(request.url).searchParams.get('id') || ''; if (!validId(id)) return json({ error: '장소를 확인해 주세요.' }, 400);
  await env.DB.prepare('DELETE FROM place_records WHERE user_id = ? AND place_id = ?').bind(user.id, id).run(); return json({ ok: true });
}
export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  const body = await readBody(request); if (!body) return json({ error: '올바른 요청이 아닙니다.' }, 400);
  const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  if (!validId(body.placeId) || typeof body.isPublic !== 'boolean') return json({ error: '공개 설정을 확인해 주세요.' }, 400);
  const result = await env.DB.prepare('UPDATE place_records SET is_public = ? WHERE user_id = ? AND place_id = ?').bind(body.isPublic ? 1 : 0, user.id, body.placeId).run();
  if (!result.meta.changes) return json({ error: '장소를 찾을 수 없습니다.' }, 404); return json({ ok: true });
}
