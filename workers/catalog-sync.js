import regions from './regions.json';

const API = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong';
const PAGE_SIZE = 1000;
const BATCH_SIZE = 8; // D1 permits at most 100 bound values per statement.
const regionName = name => (name.match(/^(.+?시)\s*.+구$/) || [null, name])[1];

export function normalizeItem(item, group, version, token, baseVersion) {
  const identifier = String(item.bizesId || ''), name = String(item.bizesNm || '').trim();
  const sido = String(item.ctprvnNm || '').trim();
  const district = sido === '세종특별자치시' ? '세종시' : regionName(String(item.signguNm || '').trim());
  const longitude = Number(item.lon), latitude = Number(item.lat);
  if (!/^[A-Za-z0-9]{1,40}$/.test(identifier) || sido !== group.sido || district !== group.district) throw new Error('공공데이터의 장소 또는 지역 정보가 유효하지 않습니다.');
  // Missing coordinates must not block an entire region or erase an existing record.
  if (!name || !Number.isFinite(longitude) || longitude < 124 || longitude > 132 || !Number.isFinite(latitude) || latitude < 33 || latitude > 39) return null;
  const detail = String(item.indsSclsNm || '').trim(), middle = String(item.indsMclsNm || '').trim();
  const major = String(item.indsLclsNm || '').trim(), standard = String(item.ksicNm || '');
  const category = /카페|커피/.test(detail) || standard.includes('커피') ? 'cafe' : major === '숙박' || middle.includes('숙박') ? 'stay' : major === '음식' ? 'restaurant' : 'other';
  return [`biz:${identifier}`, name, String(item.rdnmAdr || item.lnoAdr || '').trim(), category, detail, sido, district, longitude, latitude, baseVersion, version, token];
}

async function getPage(apiKey, code, page, fetcher) {
  const url = new URL(API);
  Object.entries({ serviceKey: apiKey, divId: 'signguCd', key: code, type: 'json', numOfRows: String(PAGE_SIZE), pageNo: String(page) }).forEach(([k, v]) => url.searchParams.set(k, v));
  let response;
  try { response = await fetcher(url.toString(), { signal: AbortSignal.timeout(25000) }); }
  catch { throw new Error('공공데이터 API에 연결하지 못했습니다.'); }
  if (!response.ok) throw new Error(`공공데이터 API 연결 실패 (HTTP ${response.status})`);
  let data; try { data = await response.json(); } catch { throw new Error('공공데이터 API 응답 형식이 올바르지 않습니다.'); }
  if (data.header?.resultCode !== '00' || !/^\d{6}$/.test(String(data.header?.stdrYm || ''))) throw new Error(`공공데이터 API 결과 오류 (${String(data.header?.resultCode || 'unknown').slice(0, 16)})`);
  const items = data.body?.items, total = Number(data.body?.totalCount), size = Number(data.body?.numOfRows), returnedPage = Number(data.body?.pageNo);
  if (!Array.isArray(items) || !items.length || !Number.isSafeInteger(total) || total < items.length || !Number.isSafeInteger(size) || size < 1 || size > PAGE_SIZE || returnedPage !== page || (page - 1) * size + items.length > total) throw new Error('공공데이터 API의 페이지 정보가 올바르지 않습니다.');
  // Do not mark unreturned places inactive if an incomplete page is returned.
  if (items.length !== Math.min(size, total - (page - 1) * size)) throw new Error('공공데이터 API 페이지가 불완전합니다.');
  return { items, total, size, version: String(data.header.stdrYm) };
}

function insertBatch(db, rows) {
  const values = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,1)').join(',');
  return db.prepare(`INSERT INTO public_places (id,name,address,category,category_name,region_sido,region_district,longitude,latitude,data_version,source_version,last_sync_token,is_active) VALUES ${values} ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,category=excluded.category,category_name=excluded.category_name,region_sido=excluded.region_sido,region_district=excluded.region_district,longitude=excluded.longitude,latitude=excluded.latitude,data_version=excluded.data_version,source_version=excluded.source_version,last_sync_token=excluded.last_sync_token,is_active=1`).bind(...rows.flat());
}

export async function syncOnce(env, options = {}) {
  if (!env.DB || !env.PUBLIC_DATA_API_KEY) throw new Error('D1 또는 공공데이터 API 키가 설정되지 않았습니다.');
  const groups = options.regions || regions, fetcher = options.fetcher || fetch;
  if (!groups.length) throw new Error('동기화할 지역이 없습니다.');
  const now = Math.floor(Date.now() / 1000);
  // A fresh D1 can bootstrap directly from the API without a CSV import.
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO public_catalog_meta (id,data_version,imported_at) VALUES (1,'api-bootstrap',?)").bind(now),
    env.DB.prepare("INSERT OR IGNORE INTO catalog_sync_state (id,status,completed_version) SELECT 1,'idle',CASE WHEN data_version='api-bootstrap' THEN '' ELSE substr(data_version,1,6) END FROM public_catalog_meta WHERE id=1")
  ]);
  const lock = await env.DB.prepare('UPDATE catalog_sync_state SET lease_until = ? WHERE id = 1 AND lease_until < ? RETURNING id').bind(now + 120, now).first();
  if (!lock) return { status: 'locked' };
  try {
    const meta = await env.DB.prepare('SELECT data_version FROM public_catalog_meta WHERE id = 1').first();
    if (!meta) throw new Error('검색 기준 데이터가 없습니다. 먼저 공공데이터 원본을 적재하세요.');
    let state = await env.DB.prepare('SELECT * FROM catalog_sync_state WHERE id = 1').first();
    if (state.status === 'idle') {
      if (state.last_checked_at && now - state.last_checked_at < 86400) return { status: 'waiting' };
      const first = await getPage(env.PUBLIC_DATA_API_KEY, groups[0].codes[0], 1, fetcher);
      if (first.version <= (state.completed_version || '')) {
        await env.DB.prepare('UPDATE catalog_sync_state SET last_checked_at = ? WHERE id = 1').bind(now).run();
        return { status: 'current', sourceVersion: first.version };
      }
      const token = crypto.randomUUID();
      await env.DB.prepare("UPDATE catalog_sync_state SET status='running', source_version=?, run_token=?, region_index=0, code_index=0, page_number=1, expected_code_total=NULL, group_expected_total=0, last_checked_at=? WHERE id=1").bind(first.version, token, now).run();
      state = { ...state, status: 'running', source_version: first.version, run_token: token, region_index: 0, code_index: 0, page_number: 1, expected_code_total: null, group_expected_total: 0 };
    }
    const group = groups[state.region_index];
    if (!group || !group.codes[state.code_index]) throw new Error('동기화 위치를 확인할 수 없습니다.');
    const data = await getPage(env.PUBLIC_DATA_API_KEY, group.codes[state.code_index], state.page_number, fetcher);
    if (data.version !== state.source_version) {
      await env.DB.batch([env.DB.prepare('DELETE FROM catalog_sync_seen WHERE run_token=?').bind(state.run_token), env.DB.prepare("UPDATE catalog_sync_state SET status='idle', source_version=NULL, run_token=NULL, region_index=0, code_index=0, page_number=1, expected_code_total=NULL, group_expected_total=0 WHERE id=1")]);
      return { status: 'restart', sourceVersion: data.version };
    }
    const normalized = data.items.map(item => normalizeItem(item, group, data.version, state.run_token, meta.data_version));
    const rows = normalized.filter(Boolean);
    const ids = data.items.map(item => `biz:${item.bizesId}`);
    const seen = new Set(ids);
    if (seen.size !== ids.length) throw new Error('공공데이터 페이지에 중복 업소가 있습니다.');
    if (state.expected_code_total != null && state.expected_code_total !== data.total) throw new Error('동기화 중 지역의 총 업소 수가 달라졌습니다.');
    const statements = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) statements.push(insertBatch(env.DB, rows.slice(i, i + BATCH_SIZE)));
    // Track unique IDs across all pages and constituent districts of this city.
    for (let i = 0; i < ids.length; i += 40) {
      const slice = ids.slice(i, i + 40);
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO catalog_sync_seen (run_token,place_id) VALUES ${slice.map(() => '(?,?)').join(',')}`).bind(...slice.flatMap(id => [state.run_token, id])));
    }
    let region = state.region_index, code = state.code_index, page = state.page_number + 1;
    let expectedCodeTotal = data.total, groupExpected = state.group_expected_total || 0, regionComplete = false;
    if (state.page_number * data.size >= data.total) {
      groupExpected += data.total; page = 1; code++; expectedCodeTotal = null;
      if (code >= group.codes.length) { regionComplete = true; region++; code = 0; }
    }
    if (!regionComplete) {
      statements.push(env.DB.prepare('UPDATE catalog_sync_state SET region_index=?, code_index=?, page_number=?, expected_code_total=?, group_expected_total=? WHERE id=1').bind(region, code, page, expectedCodeTotal, groupExpected));
      await env.DB.batch(statements);
    } else {
      // Page writes are idempotent; a crash here can safely retry the same page.
      await env.DB.batch(statements);
      const seenCount = await env.DB.prepare('SELECT count(*) AS count FROM catalog_sync_seen WHERE run_token=?').bind(state.run_token).first();
      if (seenCount.count !== groupExpected) throw new Error('지역의 수집 업소 수가 일치하지 않아 이전 검색 결과를 보존합니다.');
      const finishing = [
        env.DB.prepare('UPDATE public_places SET is_active = 0 WHERE region_sido = ? AND region_district = ? AND id NOT IN (SELECT place_id FROM catalog_sync_seen WHERE run_token = ?)').bind(group.sido, group.district, state.run_token),
        env.DB.prepare('DELETE FROM catalog_sync_seen WHERE run_token=?').bind(state.run_token)
      ];
      if (region >= groups.length) finishing.push(env.DB.prepare("UPDATE catalog_sync_state SET status='idle', completed_version=source_version, region_index=0, code_index=0, page_number=1, expected_code_total=NULL, group_expected_total=0, last_completed_at=? WHERE id=1").bind(now));
      else finishing.push(env.DB.prepare('UPDATE catalog_sync_state SET region_index=?, code_index=0, page_number=1, expected_code_total=NULL, group_expected_total=0 WHERE id=1').bind(region));
      await env.DB.batch(finishing);
    }
    const done = region >= groups.length;
    return { status: done ? 'completed' : 'running', sourceVersion: data.version, region: group.district, processed: rows.length };
  } finally {
    await env.DB.prepare('UPDATE catalog_sync_state SET lease_until=0 WHERE id=1').run();
  }
}

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(syncOnce(env).catch(error => { console.error('공공데이터 동기화 실패:', error.message); })); },
  fetch() { return new Response('Not found', { status: 404 }); }
};
