import { json } from '../../../lib/server/auth.js';
import { currentUser } from '../../../lib/server/place-auth.js';
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  if (!await currentUser(request, env.DB)) return json({ error: '로그인이 필요합니다.' }, 401);
  if (!env.KAKAO_REST_API_KEY) return json({ error: '카카오 장소 검색 키가 설정되지 않았습니다.' }, 503);
  const url = new URL(request.url); const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 100) return json({ error: '검색어를 2~100자로 입력해 주세요.' }, 400);
  const endpoint = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  endpoint.searchParams.set('query', q); endpoint.searchParams.set('size', '15');
  try {
    const response = await fetch(endpoint, { headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` } });
    if (!response.ok) return json({ error: response.status === 429 ? '검색 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.' : '카카오 검색을 이용할 수 없습니다. API 설정을 확인해 주세요.' }, response.status === 429 ? 429 : 502);
    const data = await response.json();
    return json({ places: (data.documents || []).map(p => ({ id: p.id, name: p.place_name, category: p.category_group_code, categoryName: p.category_name, address: p.road_address_name || p.address_name, x: p.x, y: p.y, url: p.place_url })) });
  } catch { return json({ error: '카카오 검색에 연결하지 못했습니다.' }, 502); }
}
