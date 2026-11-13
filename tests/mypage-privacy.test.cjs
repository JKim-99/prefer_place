const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

test('signing out clears visible private profile, records and search state', () => {
  class Element {
    constructor() { this.value = 'private'; this.hidden = false; this.textContent = 'private'; this.children = ['private']; }
    addEventListener() {}
    querySelectorAll() { return []; }
    replaceChildren() { this.children = []; }
    reset() { this.resetCalled = true; }
    removeAttribute() {}
  }
  const nodes = new Map(), handlers = {};
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const document = {body:{classList:{contains:()=>true}}, getElementById:get, addEventListener:(name,fn)=>{handlers[name]=fn;}};
  vm.runInNewContext(readFileSync(resolve(__dirname,'../public/assets/js/mypage.js'),'utf8'), {document,window:{}});
  handlers['place-auth-change']({detail:{signedIn:false}});
  assert.equal(get('profile-page').hidden,true);
  assert.equal(get('mypage-place-list').children.length,0);
  assert.equal(get('profile-form').resetCalled,true);
  assert.equal(get('password-form').resetCalled,true);
  assert.equal(get('place-record-search').value,'');
  assert.equal(get('profile-status').textContent,'');
});

test('a delayed personal records response is ignored after logout', async () => {
  class Element {
    constructor() { this.value = ''; this.hidden = false; this.textContent = ''; this.children = []; this.dataset = {}; this.handlers = {}; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    querySelectorAll() { return []; }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    reset() {}
    removeAttribute() {}
  }
  const nodes = new Map(), handlers = {}, get = id => { if (!nodes.has(id)) nodes.set(id,new Element()); return nodes.get(id); };
  const tab = new Element(); tab.dataset.tab = 'places';
  get('mypage-dialog').querySelectorAll = selector => selector === '[data-tab]' ? [tab] : [];
  const document = {body:{classList:{contains:()=>true}},getElementById:get,addEventListener:(name,fn)=>{handlers[name]=fn;}};
  let resolveFetch;
  const fetch = () => new Promise(resolve => { resolveFetch = resolve; });
  vm.runInNewContext(readFileSync(resolve(__dirname,'../public/assets/js/mypage.js'),'utf8'), {document,window:{},fetch});
  tab.handlers.click();
  assert.equal(get('mypage-places-status').textContent,'불러오는 중...');
  handlers['place-auth-change']({detail:{signedIn:false}});
  resolveFetch({ok:true,json:async()=>({records:[{name:'private-place'}]})});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get('profile-page').hidden,true);
  assert.equal(get('mypage-place-list').children.length,0);
  assert.equal(get('mypage-places-status').textContent,'');
});
