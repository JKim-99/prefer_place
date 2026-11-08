const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { webcrypto } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const source = readFileSync(resolve(__dirname, '../workers/catalog-sync.js'), 'utf8').replace("import regions from './regions.json';", 'const regions = [];');
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
const item = id => ({ bizesId:id,bizesNm:'카페',ctprvnNm:'충청남도',signguNm:'천안시 서북구',lon:127.1,lat:36.8,indsSclsNm:'카페',indsMclsNm:'비알코올',indsLclsNm:'음식' });
const page = (items,total=2) => Response.json({ header:{resultCode:'00',stdrYm:'202609'},body:{items,totalCount:total,numOfRows:1000,pageNo:1} });
test('sync validates and groups source data before publishing complete city', async () => {
  const {syncOnce,normalizeItem} = await import(moduleUrl), {db,calls}=fixture();
  assert.equal(normalizeItem(item('MA1'),group,'202609','token','20260930')[6], '천안시');
  assert.throws(() => normalizeItem({...item('MA1'),signguNm:'아산시'},group,'202609','token','20260930'));
  assert.equal(normalizeItem({...item('MA1'),lon:null},group,'202609','token','20260930'), null);
  const result = await syncOnce({DB:db,PUBLIC_DATA_API_KEY:'secret'}, {regions:[group],fetcher:async () => page([item('MA1'),item('MA2')])});
  assert.equal(result.status,'completed');
  assert.ok(calls.some(call => call.sql.startsWith('INSERT OR IGNORE INTO catalog_sync_seen')));
  assert.ok(calls.some(call => call.sql.includes('id NOT IN (SELECT place_id FROM catalog_sync_seen')));
  assert.ok(calls.some(call => call.sql.includes('lease_until=0')));
});
test('incomplete source pages never deactivate existing places', async () => {
  const {syncOnce} = await import(moduleUrl), {db,calls}=fixture();
  await assert.rejects(syncOnce({DB:db,PUBLIC_DATA_API_KEY:'secret'}, {regions:[group],fetcher:async () => page([item('MA1')],2)}), /불완전/);
  assert.equal(calls.some(call => call.sql.startsWith('UPDATE public_places SET is_active = 0')),false);
  assert.ok(calls.some(call => call.sql.includes('lease_until=0')));
});
