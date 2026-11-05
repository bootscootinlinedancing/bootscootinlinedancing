import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
const migration=readFileSync(new URL('../migrations/0032_special_events.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const service=readFileSync(new URL('../special-events.js',import.meta.url),'utf8');
const publicPage=readFileSync(new URL('../johnny-rossato.html',import.meta.url),'utf8');
const eventPageScript=readFileSync(new URL('../special-event-page.js',import.meta.url),'utf8');
const listingPage=readFileSync(new URL('../workshops-events.html',import.meta.url),'utf8');
const temp=mkdtempSync(join(tmpdir(),'boot-scootin-special-events-'));
const database=join(temp,'rehearsal.sqlite');

function sqlite(sql){
  const result=spawnSync('sqlite3',['-batch','-bail',database],{input:sql,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  return result.stdout.trim();
}

try{
  sqlite(`PRAGMA foreign_keys=ON;
    CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE);
    ${migration}`);

  assert.equal(sqlite(`SELECT status||'|'||publication_enabled||'|'||checkout_enabled FROM special_events WHERE id='special-event-johnny-rossato-2027';`),'DRAFT|0|0');
  assert.equal(sqlite(`SELECT group_concat(capacity,',') FROM special_event_days WHERE event_id='special-event-johnny-rossato-2027' ORDER BY display_order;`),'75,75');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_ticket_products WHERE event_id='special-event-johnny-rossato-2027';`),'10');
  assert.equal(sqlite(`SELECT price_pence||'|'||allocation||'|'||release_state||'|'||password_required FROM special_event_ticket_products WHERE code='LOYALTY_WEEKEND';`),'3500|10|INACTIVE|1');
  assert.equal(sqlite(`SELECT price_pence||'|'||allocation||'|'||release_state FROM special_event_ticket_products WHERE code='EARLY_BIRD_WEEKEND';`),'4000|20|INACTIVE');
  assert.equal(sqlite(`SELECT price_pence||'|'||allocation||'|'||auto_activate_after_product_id FROM special_event_ticket_products WHERE code='STANDARD_WEEKEND';`),'5000|30|johnny-early-weekend');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_product_days WHERE product_id='johnny-standard-weekend';`),'2','weekend admission must reserve both event days');
  assert.equal(sqlite(`SELECT places_per_ticket FROM special_event_product_days WHERE product_id='johnny-mini-competition';`),'0','competition add-on must not consume venue capacity twice');
  assert.equal(sqlite(`SELECT allocation||'|'||max_per_checkout FROM special_event_ticket_products WHERE id='johnny-mini-competition';`),'25|4','competition entries must use the approved allocation and per-attendee checkout model');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_ticket_products WHERE is_junior=1 AND requires_guardian=1;`),'3');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_ticket_products WHERE competition_eligible=1;`),'6');
  assert.equal(sqlite(`SELECT programme_approval_status FROM special_events WHERE id='special-event-johnny-rossato-2027';`),'ARTIST_APPROVED');
  assert.equal(sqlite(`SELECT instructor_name||'|'||instructor_website_url FROM special_events WHERE id='special-event-johnny-rossato-2027';`),'Gianmarco “Johnny” Rossato|https://www.learnwithjohnny.com/en');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_choreographies WHERE event_id='special-event-johnny-rossato-2027';`),'1');
  assert.equal(sqlite(`PRAGMA foreign_key_check;`),'');
  assert.equal(sqlite(`PRAGMA integrity_check;`),'ok');

  assert.match(service,/PBKDF2/);
  assert.match(service,/100000/);
  assert.match(service,/toLocaleUpperCase\('en-GB'\)/,'restricted password comparison must be case-insensitive');
  assert.doesNotMatch(`${service}\n${worker}\n${migration}`,/BOOTSWITHJOHNNY/,'approved plaintext password must not be committed');
  assert.match(migration,/storage_key LIKE 'private\/special-events\/%'/);
  assert.match(migration,/special_event_document_versions_immutable_update/);
  assert.match(migration,/special_event_activity_immutable_delete/);
  assert.match(service,/status='PUBLISHED' AND publication_enabled=1/,'public API must only expose published events');
  assert.match(service,/SPECIAL_EVENT_CHECKOUT_DISABLED/,'staging must support a hard checkout kill switch');
  assert.match(service,/H\.264\/AAC MP4/,'HQ media upload must explain the supported video format');
  assert.match(service,/content-range/,'event video delivery must support byte ranges');
  assert.match(worker,/\/api\/admin\/special-event-media\/upload/,'event video upload must remain behind HQ authentication');
  assert.match(eventPageScript,/playsinline/,'event video must use mobile Safari inline playback');
  assert.match(eventPageScript,/Meet Johnny Rossato/,'public event must include the verified instructor section');
  assert.match(eventPageScript,/all ages/,'competition must clearly state that it is open to all ages');
  assert.match(service,/Adult tickets are for named attendees aged 18 or over/,'server must enforce adult admission age');
  assert.match(service,/Number\(item\.age\)>17/,'server must enforce under-18 junior admission');
  assert.match(listingPage,/<h2>What’s coming up<\/h2>/,'listing must use the approved single hierarchy');
  assert.doesNotMatch(listingPage,/Special dates for your diary/,'redundant listing heading must be removed');
  assert.doesNotMatch(eventPageScript,/autoplay/,'event video must not autoplay');
  assert.match(service,/Publication is blocked until all mandatory settings are confirmed/);
  assert.match(service,/only authoritative[\s\S]*PAID bookings permanently sell the release out/,'temporary holds must not unlock Standard Weekend');
  assert.match(service,/INSERT OR IGNORE INTO special_event_attendees/,'paid admission must create idempotent attendee records');
  assert.match(service,/INSERT OR IGNORE INTO special_event_competition_entries/,'paid competition add-on must create an idempotent entry');
  assert.match(worker,/\/api\/admin\/special-events/);
  assert.match(worker,/key\.startsWith\('private\/'\)/,'private evidence must be blocked from the public media route');
  assert.match(service,/EVENT_ARTWORK_NOT_UPLOADED/,'publication must be blocked until approved artwork is uploaded');
  assert.match(service,/private\/special-events\/\$\{eventId\}/,'Draft artwork must use private event storage');
  assert.match(worker,/\/api\/admin\/special-event-artwork\/upload/,'HQ must expose a protected artwork upload');
  assert.doesNotMatch(publicPage,/Johnny Rossato: His UK Debut/,'Draft event details must not be embedded in the public shell');
  assert.match(eventPageScript,/\/api\/special-events\?slug=johnny-rossato/);
  assert.match(worker,/\/ranch\/special-events\/preview/,'Draft preview must be protected by the HQ route');
  assert.match(worker,/\/ranch\/special-events\/preview-listing/,'Draft listing preview must be protected by the HQ route');
  assert.match(listingPage,/src="\/special-events-list\.js\?v=3"/,'protected listing must load its module from the site root');
  assert.match(listingPage,/href="\/styles\.css/,'protected listing must load shared styles from the site root');
  assert.match(service,/action==='OPEN_SALES'/,'manual launch must be implemented server-side');
  assert.match(service,/EVENT_AND_SALES_OPENED/,'manual launch must create an audit event');
  assert.match(service,/action==='CLOSE_SALES'/,'HQ must provide a separate close-sales operation');
  assert.match(migration,/public_presentation_approved/);
  assert.match(migration,/payment_integration_verified/);
  assert.match(migration,/production_installation_verified/);

  const prematurePublish=spawnSync('sqlite3',['-batch','-bail',database],{input:`UPDATE special_events SET status='PUBLISHED',publication_enabled=1 WHERE id='special-event-johnny-rossato-2027';`,encoding:'utf8'});
  assert.notEqual(prematurePublish.status,0,'database trigger must block publication while mandatory settings are incomplete');

  sqlite(`BEGIN;
    INSERT INTO customers(id,name,email) VALUES('customer-test','Test Customer','test@example.invalid');
    UPDATE special_event_days SET capacity=2;
    UPDATE special_event_ticket_products SET allocation=2,release_state='ACTIVE' WHERE id='johnny-early-weekend';
    INSERT INTO special_event_holds(id,event_id,product_id,customer_id,customer_email,quantity,amount_pence,status,expires_at,idempotency_key)
      VALUES('hold-1','special-event-johnny-rossato-2027','johnny-early-weekend','customer-test','test@example.invalid',2,8000,'ACTIVE','2099-01-01T00:00:00Z','test-hold-1');
    INSERT INTO special_event_hold_days(hold_id,day_id,places) SELECT 'hold-1',day_id,2 FROM special_event_product_days WHERE product_id='johnny-early-weekend';
    COMMIT;`);
  assert.equal(sqlite(`SELECT SUM(places) FROM special_event_hold_days WHERE day_id='johnny-2027-saturday';`),'2');
  assert.equal(sqlite(`SELECT SUM(places) FROM special_event_hold_days WHERE day_id='johnny-2027-sunday';`),'2');

  const immutable=spawnSync('sqlite3',['-batch','-bail',database],{input:`UPDATE special_event_activity SET action='CHANGED' WHERE id='johnny-draft-seed-activity';`,encoding:'utf8'});
  assert.notEqual(immutable.status,0,'activity history must be immutable');
  console.log('Special Events migration and draft-safety regression checks passed.');
} finally {
  rmSync(temp,{recursive:true,force:true});
}
