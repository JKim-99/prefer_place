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
