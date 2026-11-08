import { json, readBody, sameOrigin } from '../../../lib/server/auth.js';
import { currentUser } from '../../../lib/server/place-auth.js';
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  const url = new URL(request.url), sido = url.searchParams.get('sido') || '', district = url.searchParams.get('district') || '', mode = url.searchParams.get('mode') || 'mine';
  if (mode === 'mypage') {
    const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
    const result = await env.DB.prepare('SELECT place_id, alias, category, is_public, region_sido, region_district FROM place_records WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all();
    return json({ records: result.results });
  }
  if (!sido || !district || sido.length > 40 || district.length > 40) return json({ error: '지역을 확인해 주세요.' }, 400);
  if (mode === 'mine') {
    const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
    const result = await env.DB.prepare('SELECT place_id, alias, is_public FROM place_records WHERE user_id = ? AND region_sido = ? AND region_district = ? ORDER BY created_at DESC LIMIT 100').bind(user.id, sido, district).all();
    return json({ records: result.results });
  }
  if (mode === 'popular') {
    const result = await env.DB.prepare('SELECT place_id, COUNT(DISTINCT user_id) AS count FROM place_records WHERE region_sido = ? AND region_district = ? AND is_public = 1 GROUP BY place_id HAVING COUNT(DISTINCT user_id) >= 3 ORDER BY count DESC LIMIT 100').bind(sido, district).all();
    return json({ records: result.results });
  }
  if (mode === 'anonymous') {
    const result = await env.DB.prepare('SELECT place_id, alias FROM place_records WHERE is_public = 1 AND region_sido = ? AND region_district = ? AND user_id = (SELECT user_id FROM place_records WHERE is_public = 1 AND region_sido = ? AND region_district = ? GROUP BY user_id ORDER BY RANDOM() LIMIT 1) LIMIT 100').bind(sido, district, sido, district).all();
    return json({ records: result.results });
  }
  return json({ error: '조회 방식을 확인해 주세요.' }, 400);
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  const body = await readBody(request); if (!body) return json({ error: '올바른 요청이 아닙니다.' }, 400);
  const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  const { placeId, sido, district, alias, isPublic } = body;
  const category = body.category || 'other';
  if (!['restaurant', 'cafe', 'stay', 'other'].includes(category) || !/^\d{1,30}$/.test(placeId || '') || typeof sido !== 'string' || !sido.trim() || sido.length > 40 || typeof district !== 'string' || !district.trim() || district.length > 40 || typeof alias !== 'string' || alias.length > 50 || typeof isPublic !== 'boolean') return json({ error: '장소 정보를 확인해 주세요.' }, 400);
  await env.DB.prepare(`INSERT INTO place_records (user_id, place_id, region_sido, region_district, alias, is_public, created_at, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, place_id) DO UPDATE SET region_sido=excluded.region_sido, region_district=excluded.region_district, alias=CASE WHEN excluded.alias = '' THEN place_records.alias ELSE excluded.alias END, category=excluded.category`).bind(user.id, placeId, sido, district, alias.trim(), isPublic ? 1 : 0, Math.floor(Date.now()/1000), category).run();
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  if (!sameOrigin(request)) return json({ error: '올바른 요청이 아닙니다.' }, 403);
  const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  const id = new URL(request.url).searchParams.get('id') || ''; if (!/^\d{1,30}$/.test(id)) return json({ error: '장소를 확인해 주세요.' }, 400);
  await env.DB.prepare('DELETE FROM place_records WHERE user_id = ? AND place_id = ?').bind(user.id, id).run();
  return json({ ok: true });
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  const body = await readBody(request); if (!body) return json({ error: '올바른 요청이 아닙니다.' }, 400);
  const user = await currentUser(request, env.DB); if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  if (!/^\d{1,30}$/.test(body.placeId || '') || typeof body.isPublic !== 'boolean') return json({ error: '공개 설정을 확인해 주세요.' }, 400);
  const result = await env.DB.prepare('UPDATE place_records SET is_public = ? WHERE user_id = ? AND place_id = ?').bind(body.isPublic ? 1 : 0, user.id, body.placeId).run();
  if (!result.meta.changes) return json({ error: '장소를 찾을 수 없습니다.' }, 404);
  return json({ ok: true });
}
