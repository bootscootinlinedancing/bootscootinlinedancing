import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const script=read('script.js');
const css=read('repair-v96.4.56.css');
const worker=read('_worker.js');
const businesses=read('businesses.html');
const partnerships=read('partnerships.html');

for(const label of ['Discover','Community','Country Corner','Businesses & Partners']){
  assert.match(script,new RegExp(`title:'${label.replace(/[&]/g,'\\&')}`),`${label} is in the shared navigation inventory`);
}
for(const destination of [
  'community.html','community.html#merchandise','whatsapp-community.html','moonshine.html','long-road-handbook.html',
  'country-corner.html','country-guide.html','country-guide-music.html','country-guide-line-dancing.html',
  'country-guide-fashion.html','country-guide-festivals.html','country-guide-food-drink.html',
  'country-guide-places.html','country-guide-inspirations.html','country-guide-adventures.html','country-map.html',
  'businesses.html#threefives','businesses.html#recommendations','businesses.html#affiliate-partners',
  'partnerships.html#sponsorship-enquiries'
]) assert.ok(script.includes(destination),`${destination} is restored to navigation`);

assert.match(script,/\['community\.html#merchandise','SHOP & MERCHANDISE'\]/,'customer-facing shop is directly discoverable');
assert.match(script,/Official Merchandise Partner · ThreeFives/,'production partner remains distinct from the shop');

assert.match(script,/window\.addEventListener\('pageshow'/,'Safari bfcache restoration reinitialises navigation state');
assert.match(script,/sections\.dataset\.sharedNavigation==='true'/,'mobile navigation installation is idempotent');
assert.match(script,/\['ArrowDown','ArrowUp','Home','End'\]/,'desktop panel supports keyboard traversal');
assert.match(businesses,/id="recommendations"/,'local recommendations have a stable section target');
assert.match(partnerships,/id="sponsorship-enquiries"/,'sponsorship enquiries have a stable section target');
assert.match(css,/#threefives \.threefives-visual span/,'ThreeFives typography is scoped');
assert.match(css,/\.new-home-footer \.footer-script/,'homepage sign-off typography is scoped');

assert.match(worker,/MEMBER_PASSWORD_RESET_EMAIL_FAILED/,'reset delivery failures are recorded');
assert.match(worker,/idempotencyKey:deliveryKey/,'reset delivery uses an opaque stable idempotency key');
assert.match(worker,/No recipient addresses or reset tokens are stored/,'HQ diagnostic explains privacy boundary');
assert.doesNotMatch(worker,/console\.error\('MEMBER_PASSWORD_RESET_EMAIL_FAILED'\s*,\s*\{[^}]*email/,'reset diagnostics do not log an email address');

const htmlFiles=fs.readdirSync(root).filter(file=>file.endsWith('.html'));
const scriptVersions=[];
for(const file of htmlFiles){
  const match=read(file).match(/script\.js\?v=([0-9.]+)/);
  if(match)scriptVersions.push([file,match[1]]);
}
assert.ok(scriptVersions.length>20,'public pages reference the shared script');
assert.deepEqual([...new Set(scriptVersions.map(([,version])=>version))],['96.4.131'],'public script cache version is consistent');

console.log('PR #41 navigation recovery regression checks passed.');
