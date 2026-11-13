const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { resolve } = require('node:path');

test('regional snapshot search limits matches and rejects unknown regions', async () => {
  const script = readFileSync(resolve(__dirname, '../public/assets/js/catalog.js'), 'utf8');
  const requests = [];
  const window = {};
  const fetch = async url => {
    requests.push(url);
    const payload = url.endsWith('manifest.json')
      ? {version:'20260930', regions:{'충청남도|천안시':'a'.repeat(24)+'.json'}}
      : [['biz:one','스타벅스 천안점','주소','cafe','카페',127,36],['biz:two','다른 장소','주소','other','기타',127,36]];
    return {ok:true, json: async () => payload};
  };
  vm.runInNewContext(script, {window,fetch});
  const result = await window.searchPublicCatalog('충청남도','천안시','스타벅스');
  assert.equal(result.version,'20260930');
  assert.equal(result.total,1);
  assert.equal(result.places.length,1);
  assert.equal(result.places[0].id,'biz:one');
  await window.searchPublicCatalog('충청남도','천안시','다른');
  assert.equal(requests.length,2, 'manifest and same-region shard should be reused');
  await assert.rejects(() => window.searchPublicCatalog('서울','없는지역','검색'));
});
