const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

test('adding a search result positions its marker independently of hover styling', async () => {
  class Element {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.listeners = {}; this.attrs = {}; this.value = ''; this.dataset = {}; this.hidden = false; this.classList = { toggle() {} }; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    dispatch(type, extra = {}) { for (const fn of this.listeners[type] || []) fn({ target: this, currentTarget: this, preventDefault() {}, ...extra }); }
    click() { this.dispatch('click'); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    querySelector(selector) { if (selector === '#place-markers') return this.children.find(child => child.id === 'place-markers'); return null; }
    querySelectorAll() { return []; }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatch('close'); }
  }
  const ids = new Map();
  const get = id => { if (!ids.has(id)) ids.set(id, new Element()); return ids.get(id); };
  const svg = get('region-map'); svg.viewBox = { baseVal: { width: 1, height: 1 } };
  const legend = new Element(); legend.querySelectorAll = () => ['restaurant','cafe','stay','other'].map(value => ({ value }));
  const view = new Element(); view.dataset.view = 'mine';
  const listeners = {};
  const document = {
    getElementById: get,
    querySelector(selector) { if (selector === '.place-legend') return legend; if (selector === '[data-view="mine"]') return view; return null; },
    querySelectorAll(selector) { return selector === '.place-view' ? [view] : []; },
    createElement(tag) { return new Element(tag); },
    createElementNS(ns, tag) { return new Element(tag); },
    createTextNode(text) { return { textContent: text }; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }
  };
  const place = { id: 'biz:MA123', name: '테스트 카페', x: '127', y: '37.5', category: 'cafe', address: '주소' };
  const fetch = async url => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => url.startsWith('/api/places/search') ? { places: [place] } : url.startsWith('/api/places/records?') ? { records: [{ place_id: 'biz:MA123', name: '테스트 카페', longitude: 127, latitude: 37.5, category: 'cafe', alias: '' }] } : { ok: true } });
  const context = { document, window: { placeCurrentUser: { id: 'u' } }, fetch, URLSearchParams, AbortController, setTimeout, clearTimeout, console };
  vm.runInNewContext(readFileSync(resolve(__dirname, '../public/assets/js/places.js'), 'utf8'), context);
  const shapes = [{ geometry: { type: 'Polygon', coordinates: [[[126,37],[128,37],[128,38],[126,38],[126,37]]] } }];
  for (const fn of listeners['place-region-change']) fn({ detail: { sido: '서울', district: '강남', shapes } });
  await new Promise(resolve => setImmediate(resolve));
  get('place-search-open').click(); await new Promise(resolve => setImmediate(resolve));
  get('place-query').value = '카페'; get('place-search-form').dispatch('submit'); await new Promise(resolve => setImmediate(resolve));
  const result = get('place-search-results').children[0]; assert.ok(result);
  result.children[2].dispatch('submit'); await new Promise(resolve => setImmediate(resolve));
  const markerLayer = svg.children.find(child => child.id === 'place-markers'); assert.ok(markerLayer);
  const position = markerLayer.children[0], marker = position.children[0];
  assert.match(position.attrs.transform, /^translate\(/); assert.equal(marker.attrs.class, 'place-marker');
  assert.equal(marker.attrs.transform, undefined);
});
