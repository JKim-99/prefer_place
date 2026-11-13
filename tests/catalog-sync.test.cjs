const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { webcrypto } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const categorySource = readFileSync(resolve(__dirname, '../lib/place-categories.js'), 'utf8');
const source = readFileSync(resolve(__dirname, '../workers/catalog-sync.js'), 'utf8')
  .replace("import regions from './regions.json';", 'const regions = [];')
  .replace("import { categorizePlace } from '../lib/place-categories.js';", categorySource.replace('export function categorizePlace', 'function categorizePlace').replace('export function categorizeLegacyPlace', 'function categorizeLegacyPlace').replace(/export const categories\s*=\s*Object\.freeze\([\s\S]*?\);\s*/, ''));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
function fixture() {
  const calls = [], state = { status:'idle', completed_version:'202608', region_index:0, code_index:0, page_number:1, group_expected_total:0 };
  const db = { prepare(sql) { return { sql, args:[], async run() { calls.push({sql,args:[]}); return {}; }, async first() { if (sql.startsWith('SELECT data_version')) return {data_version:'20260930'}; if (sql.startsWith('SELECT * FROM catalog_sync_state')) return state; throw new Error(sql); }, bind(...args) { const statement = {sql,args}; return { ...statement,
    async first() { if (sql.includes('RETURNING id')) return {id:1}; if (sql.startsWith('SELECT data_version')) return {data_version:'20260930'}; if (sql.startsWith('SELECT * FROM catalog_sync_state')) return state; if (sql.startsWith('SELECT count(*)')) return {count:2}; throw new Error(sql); },
    async run() { calls.push(statement); return {}; }
  }; } }; }, async batch(items) { calls.push(...items); } };
  return {db,calls};
}
const group = {sido:'충청남도',district:'천안시',codes:['44133']};
const item = (id, major='음식', middle='비알코올', detail='카페') => ({ bizesId:id,bizesNm:'장소',ctprvnNm:'충청남도',signguNm:'천안시 서북구',lon:127.1,lat:36.8,indsSclsNm:detail,indsMclsNm:middle,indsLclsNm:major });
const page = (items,total=2) => Response.json({ header:{resultCode:'00',stdrYm:'202609'},body:{items,totalCount:total,numOfRows:1000,pageNo:1} });
test('sync validates and groups source data before publishing complete city', async () => {
  const {syncOnce,normalizeItem} = await import(moduleUrl), {db,calls}=fixture();
  assert.equal(normalizeItem(item('MA1'),group,'202609','token','20260930')[8], '천안시');
  const normalized = normalizeItem(item('MA1'),group,'202609','token','20260930');
  assert.deepEqual(normalized.slice(3, 7), ['cafe', '카페', '음식', '비알코올']);
  assert.throws(() => normalizeItem({...item('MA1'),signguNm:'아산시'},group,'202609','token','20260930'));
  assert.equal(normalizeItem({...item('MA1'),lon:null},group,'202609','token','20260930'), null);
  const result = await syncOnce({DB:db,PUBLIC_DATA_API_KEY:'secret'}, {regions:[group],fetcher:async () => page([item('MA1'),item('MA2')])});
  assert.equal(result.status,'completed');
  const insert = calls.find(call => call.sql.startsWith('INSERT INTO public_places'));
  assert.ok(insert);
  assert.match(insert.sql, /category_major,category_middle/);
  assert.ok(insert.args.includes('음식'));
  assert.ok(insert.args.includes('비알코올'));
  assert.match(insert.sql, /category_version=2/);
  assert.ok(calls.some(call => call.sql.startsWith('INSERT OR IGNORE INTO catalog_sync_seen')));
  assert.ok(calls.some(call => call.sql.includes('id NOT IN (SELECT place_id FROM catalog_sync_seen')));
  assert.ok(calls.some(call => call.sql.includes('lease_until=0')));
});
test('sync classification covers requested categories and keeps unspecified trades in other', async () => {
  const {normalizeItem} = await import(moduleUrl);
  const classify = (major, middle, detail) => normalizeItem(item('MA1',major,middle,detail),group,'202609','token','20260930')[3];
  assert.equal(classify('음식','비알코올','카페'), 'cafe');
  assert.equal(classify('음식','제과점','빵/도넛'), 'cafe');
  assert.equal(classify('숙박','여관','여관/모텔'), 'stay');
  assert.equal(classify('소매','종합 소매업','슈퍼마켓'), 'shopping');
  assert.equal(classify('수리·개인','이용·미용','미용실'), 'beauty');
  assert.equal(classify('보건의료','의원','내과/소아과 의원'), 'medical');
  assert.equal(classify('예술·스포츠','오락','노래방'), 'culture');
  assert.equal(classify('교육','학원','입시·교과학원'), 'education');
  assert.equal(classify('과학·기술','전문 서비스','경영 컨설팅업'), 'other');
});
test('incomplete source pages never deactivate existing places', async () => {
  const {syncOnce} = await import(moduleUrl), {db,calls}=fixture();
  await assert.rejects(syncOnce({DB:db,PUBLIC_DATA_API_KEY:'secret'}, {regions:[group],fetcher:async () => page([item('MA1')],2)}), /불완전/);
  assert.equal(calls.some(call => call.sql.startsWith('UPDATE public_places SET is_active = 0')),false);
  assert.ok(calls.some(call => call.sql.includes('lease_until=0')));
});
