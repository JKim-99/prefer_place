const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const root = resolve(__dirname, '..');
const script = readFileSync(resolve(root, 'public/assets/js/analytics.js'), 'utf8');
function initialize(hostname, pathname, referrer = '') {
  const appended = [];
  const document = {referrer, head:{append:node=>appended.push(node)}, createElement:()=>({})};
  const window = {location:{hostname, pathname, origin:`https://${hostname}`}};
  vm.runInNewContext(script, {window, document, URL, Date});
  return {window,appended};
}
test('analytics tracks production pages without query parameters or referrer paths', () => {
  const {window,appended} = initialize('prefer-place.pages.dev','/profile','https://prefer-place.pages.dev/profile?id=private');
  assert.equal(appended.length,1);
  assert.match(appended[0].src,/^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-3D1313ELV5$/);
  const config = Array.from(window.dataLayer[1]);
  assert.equal(config[2].page_location,'https://prefer-place.pages.dev/profile');
  assert.equal(config[2].page_referrer,'https://prefer-place.pages.dev/');
  assert.equal(config[2].allow_google_signals,false);
  assert.equal(initialize('preview.pages.dev','/').appended.length,0);
  assert.equal(initialize('prefer-place.pages.dev','/unknown').appended.length,0);
  for (const page of ['public/index.html','public/mypage.html','public/profile.html']) assert.match(readFileSync(resolve(root,page),'utf8'), /assets\/js\/analytics\.js/);
});
