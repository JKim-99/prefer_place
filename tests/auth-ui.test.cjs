const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

test('a delayed initial session response cannot undo a newer login', async () => {
  class Element {
    constructor() { this.hidden = false; this.value = ''; this.textContent = ''; }
    addEventListener() {}
    querySelector() { return new Element(); }
  }
  const nodes = new Map(), get = id => { if (!nodes.has(id)) nodes.set(id,new Element()); return nodes.get(id); };
  const events = [];
  const document = {body:{classList:{contains:()=>false}},getElementById:get,dispatchEvent:e=>events.push(e)};
  const window = {};
  let resolveFetch;
  const fetch = () => new Promise(resolve => {resolveFetch=resolve;});
  class CustomEvent { constructor(type, options) {this.type=type;this.detail=options.detail;} }
  vm.runInNewContext(readFileSync(resolve(__dirname,'../public/assets/js/auth.js'),'utf8'),{document,window,fetch,CustomEvent});
  const user = {id:'new-user', nickname:'사용자'};
  window.placeShowUser(user);
  resolveFetch({ok:true,json:async()=>({user:null})});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.placeCurrentUser,user);
  assert.equal(events.length,1);
  assert.equal(events[0].detail.signedIn,true);
});
