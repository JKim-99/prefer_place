import { json } from '../../../lib/server/auth.js';
import { currentUser } from '../../../lib/server/place-auth.js';
import { categoryFromFields } from '../../../lib/place-category-map.js';
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  if (!await currentUser(request, env.DB)) return json({ error: '로그인이 필요합니다.' }, 401);
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') || '').trim(), sido = (params.get('sido') || '').trim(), district = (params.get('district') || '').trim();
  if (q.length < 2 || q.length > 80 || !sido || sido.length > 40 || !district || district.length > 40) return json({ error: '지역과 검색어를 확인해 주세요.' }, 400);
  const escaped = q.replace(/[\\%_]/g, '\\$&');
  const data = await env.DB.prepare(`SELECT id, name, address, category, category_name, category_major, category_middle, category_version, longitude, latitude, COALESCE(source_version, data_version) AS data_version FROM public_places WHERE region_sido = ? AND region_district = ? AND is_active = 1 AND data_version = (SELECT data_version FROM public_catalog_meta WHERE id = 1) AND name LIKE ? ESCAPE '\\' ORDER BY CASE WHEN name LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, name LIMIT 30`).bind(sido, district, `%${escaped}%`, `${escaped}%`).all();
  const catalogReady = data.results.length > 0 || !!await env.DB.prepare('SELECT 1 AS present FROM public_places WHERE is_active = 1 AND data_version = (SELECT data_version FROM public_catalog_meta WHERE id = 1) LIMIT 1').first();
  const meta = await env.DB.prepare('SELECT data_version FROM public_catalog_meta WHERE id = ?').bind(1).first();
  const catalogPartial = String(meta?.data_version || '').endsWith('-partial');
  return json({ catalogReady, catalogPartial, places: data.results.map(p => ({ ...p, category: categoryFromFields(p), x: p.longitude, y: p.latitude, categoryName: p.category_name })) });
}
