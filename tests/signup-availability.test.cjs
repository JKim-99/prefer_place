const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = path => readFileSync(resolve(__dirname, '..', path), 'utf8');
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const auth = moduleUrl(read('lib/server/auth.js'));
const availability = moduleUrl(read('functions/api/auth/availability.js').replace("'../../../lib/server/auth.js'", `'${auth}'`));
function req(body, origin = 'https://example.test') { return new Request('https://example.test/api/auth/availability', { method:'POST', headers:{origin,'content-type':'application/json'}, body:JSON.stringify(body) }); }
test('availability checks are normalized, bounded and same-origin', async () => {
  const { onRequestPost } = await import(availability); const calls = [];
  const db = {prepare(sql) {return {bind(value) {calls.push({sql,value}); return {first:async () => value.toLowerCase() === 'taken' ? {found:1} : null};}};}};
  let response = await onRequestPost({request:req({field:'username',value:' Taken '}),env:{DB:db}});
  assert.deepEqual(await response.json(), {field:'username',available:false}); assert.equal(calls[0].value,'Taken'); assert.match(calls[0].sql,/NOCASE/);
  response = await onRequestPost({request:req({field:'nickname',value:' Free '}),env:{DB:db}});
  assert.equal((await response.json()).available,true); assert.match(calls[1].sql,/lower\(trim\(nickname\)\)/);
  assert.equal((await onRequestPost({request:req({field:'username',value:'bad'}),env:{DB:db}})).status,400);
  assert.equal((await onRequestPost({request:req({field:'nickname',value:'hello'},'https://evil.test'),env:{DB:db}})).status,400);
  assert.equal((await onRequestPost({request:req({field:'email',value:'hello'}),env:{DB:db}})).status,400);
});
