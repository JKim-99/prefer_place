import { categorizePlace } from '../place-categories.js';

// Resolve untrusted catalog IDs against the official source before persisting them.
export async function lookupPlace(apiKey, placeId, sido, district, fetcher = fetch) {
  if (!apiKey) throw new Error('장소 정보를 확인하는 서비스가 아직 준비되지 않았어요.');
  const url = new URL('https://apis.data.go.kr/B553077/api/open/sdsc2/storeOne');
  Object.entries({ serviceKey: apiKey, key: placeId.slice(4), type: 'json' }).forEach(([key, value]) => url.searchParams.set(key, value));
  let response, data;
  try { response = await fetcher(url.toString(), { signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error(); data = await response.json(); }
  catch { throw new Error('공공 장소 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
  if (data.header?.resultCode !== '00' || !/^\d{6}$/.test(String(data.header.stdrYm || ''))) throw new Error('공공 장소 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  const items = data.body?.items;
  const item = Array.isArray(items) && items.length === 1 ? items[0] : null;
  const actualSido = String(item?.ctprvnNm || '').trim();
  const rawDistrict = String(item?.signguNm || '').trim();
  const actualDistrict = actualSido === '세종특별자치시' ? '세종시' : (rawDistrict.match(/^(.+?시)\s*.+구$/) || [null, rawDistrict])[1];
  const lon = Number(item?.lon), lat = Number(item?.lat), name = String(item?.bizesNm || '').trim();
  if (!item || `biz:${item.bizesId}` !== placeId || actualSido !== sido || actualDistrict !== district || !name || !Number.isFinite(lon) || lon < 124 || lon > 132 || !Number.isFinite(lat) || lat < 33 || lat > 39) throw new Error('현재 공공데이터에서 선택한 지역의 장소를 확인할 수 없어요.');
  const major = String(item.indsLclsNm || '').trim(), middle = String(item.indsMclsNm || '').trim(), detail = String(item.indsSclsNm || '').trim();
  return { id: placeId, name, address: String(item.rdnmAdr || item.lnoAdr || '').trim(), category: categorizePlace({ major, middle, detail, standard: item.ksicNm || '' }), major, middle, detail, sido, district, lon, lat, version: String(data.header.stdrYm) };
}
