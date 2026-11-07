import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
const announcementsMigration=readFileSync(new URL('../migrations/0031_event_announcements.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/0032_special_events.sql',import.meta.url),'utf8');
const programmeMigration=readFileSync(new URL('../migrations/0033_johnny_programme_times.sql',import.meta.url),'utf8');
const ownerDecisionsMigration=readFileSync(new URL('../migrations/0034_johnny_owner_decisions.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const service=readFileSync(new URL('../special-events.js',import.meta.url),'utf8');
const publicPage=readFileSync(new URL('../johnny-rossato.html',import.meta.url),'utf8');
const eventPageScript=readFileSync(new URL('../special-event-page.js',import.meta.url),'utf8');
const listingPage=readFileSync(new URL('../workshops-events.html',import.meta.url),'utf8');
const ranch=readFileSync(new URL('../ranch.js',import.meta.url),'utf8');
const ranchPage=readFileSync(new URL('../ranch.html',import.meta.url),'utf8');
const temp=mkdtempSync(join(tmpdir(),'boot-scootin-special-events-'));
const database=join(temp,'rehearsal.sqlite');

function sqlite(sql){
  const result=spawnSync('sqlite3',['-batch','-bail',database],{input:sql,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  return result.stdout.trim();
}

try{
  sqlite(`PRAGMA foreign_keys=ON;
    CREATE TABLE classes(id TEXT PRIMARY KEY);
    CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE);
    ${announcementsMigration}
    ${migration}
    ${programmeMigration}
    ${ownerDecisionsMigration}`);

  assert.equal(sqlite(`SELECT status||'|'||publication_enabled||'|'||checkout_enabled FROM special_events WHERE id='special-event-johnny-rossato-2027';`),'DRAFT|0|0');
  assert.equal(sqlite(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='event_announcements';`),'1','migration 0031 must precede Special Events');
  assert.equal(sqlite(`SELECT group_concat(capacity,',') FROM special_event_days WHERE event_id='special-event-johnny-rossato-2027' ORDER BY display_order;`),'75,75');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_ticket_products WHERE event_id='special-event-johnny-rossato-2027';`),'10');
  assert.equal(sqlite(`SELECT price_pence||'|'||allocation||'|'||release_state||'|'||password_required FROM special_event_ticket_products WHERE code='LOYALTY_WEEKEND';`),'3500|10|INACTIVE|1');
  assert.equal(sqlite(`SELECT price_pence||'|'||allocation||'|'||release_state FROM special_event_ticket_products WHERE code='EARLY_BIRD_WEEKEND';`),'4000|20|INACTIVE');
  assert.equal(sqlite(`SELECT price_pence||'|'||allocation||'|'||COALESCE(auto_activate_after_product_id,'NONE') FROM special_event_ticket_products WHERE code='STANDARD_WEEKEND';`),'5000|25|NONE');
  assert.equal(sqlite(`SELECT saturday_evening_capacity||'|'||saturday_evening_capacity_confirmed FROM special_events WHERE id='special-event-johnny-rossato-2027';`),'75|1','owner-confirmed evening capacity must be authoritative');
  assert.equal(sqlite(`SELECT starts_at||'|'||programme_status FROM special_event_programme_items WHERE id='johnny-sat-under18';`),'2027-02-20T20:30:00|CONFIRMED');
  assert.match(sqlite(`SELECT age_terms FROM special_events WHERE id='special-event-johnny-rossato-2027';`),/leave the venue by 8:30 pm/);
  assert.match(sqlite(`SELECT refund_policy FROM special_events WHERE id='special-event-johnny-rossato-2027';`),/Refund requests will be considered individually/);
  assert.match(sqlite(`SELECT refund_policy FROM special_events WHERE id='special-event-johnny-rossato-2027';`),/except where a refund is required by law/);
  assert.match(sqlite(`SELECT refund_policy FROM special_events WHERE id='special-event-johnny-rossato-2027';`),/Nothing in this policy limits statutory rights/);
  assert.equal(sqlite(`SELECT age_terms_confirmed||'|'||refund_policy_confirmed FROM special_events WHERE id='special-event-johnny-rossato-2027';`),'1|0','owner-reported venue confirmation must be recorded while legal review remains an explicit launch blocker');
  assert.equal(sqlite(`SELECT group_concat(allocation,',') FROM special_event_ticket_products WHERE code IN ('JUNIOR_SATURDAY','JUNIOR_SUNDAY') ORDER BY code;`),'5,5');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_ticket_products WHERE password_required=1;`),'1','only the loyalty product may require a password');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_product_days WHERE product_id='johnny-standard-weekend';`),'2','weekend admission must reserve both event days');
  assert.equal(sqlite(`SELECT places_per_ticket FROM special_event_product_days WHERE product_id='johnny-mini-competition';`),'0','competition add-on must not consume venue capacity twice');
  assert.equal(sqlite(`SELECT allocation||'|'||max_per_checkout FROM special_event_ticket_products WHERE id='johnny-mini-competition';`),'25|4','competition entries must use the approved allocation and per-attendee checkout model');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_ticket_products WHERE is_junior=1 AND requires_guardian=1;`),'3');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_ticket_products WHERE competition_eligible=1;`),'6');
  assert.equal(sqlite(`SELECT programme_approval_status FROM special_events WHERE id='special-event-johnny-rossato-2027';`),'ARTIST_APPROVED');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_programme_items WHERE event_id='special-event-johnny-rossato-2027' AND starts_at IS NOT NULL AND timing_confirmed=1;`),'22','all owner-confirmed programme starts must be displayed');
  assert.equal(sqlite(`SELECT starts_at||'|'||ends_at FROM special_event_programme_items WHERE id='johnny-sat-comp-registration';`),'2027-02-20T19:00:00|2027-02-20T19:30:00');
  assert.equal(sqlite(`SELECT starts_at||'|'||ends_at FROM special_event_programme_items WHERE id='johnny-sat-competition';`),'2027-02-20T19:30:00|2027-02-20T20:00:00');
  assert.equal(sqlite(`SELECT instructor_name||'|'||instructor_website_url FROM special_events WHERE id='special-event-johnny-rossato-2027';`),'Gianmarco “Johnny” Rossato|https://www.learnwithjohnny.com/en');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_choreographies WHERE event_id='special-event-johnny-rossato-2027';`),'3');
  assert.equal(sqlite(`SELECT COUNT(*) FROM special_event_choreographies WHERE copperknob_url LIKE 'https://www.copperknob.co.uk/%' AND bootstepper_url LIKE 'https://bootstepper.com/%';`),'3');
  assert.match(sqlite(`SELECT group_concat(title,'|') FROM special_event_choreographies ORDER BY display_order;`),/Kingdom of Fear\|Wild Magnolia\|Bar None/);
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
  assert.match(service,/availability_status/,'public API must expose status rather than inventory quantities');
  assert.match(service,/shared_capacity_sold_out/,'public availability must account for genuinely full shared capacity');
  assert.match(service,/allocation:_allocation,sold_count:_sold,remaining:_remaining,shared_capacity_sold_out:_shared/,'public API must strip product inventory counts');
  assert.doesNotMatch(eventPageScript,/sold ·/,'customer ticket cards must not render sold or remaining quantities');
  assert.doesNotMatch(eventPageScript,/Capacity is 25 entries/,'customer competition copy must not reveal numeric inventory');
  assert.match(eventPageScript,/SOLD OUT/,'customer ticket cards must show an authoritative sold-out state');
  assert.match(eventPageScript,/Final legal\/compliance review is still required/,'Draft preview must identify the outstanding policy review');
  assert.match(eventPageScript,/I have reviewed and accept the event booking terms/,'checkout must require review of the displayed event policy');
  assert.match(service,/SPECIAL_EVENT_CHECKOUT_DISABLED/,'staging must support a hard checkout kill switch');
  assert.match(worker,/SUMUP_SPECIAL_EVENTS_API_KEY/,'Special Events must have a dedicated production credential');
  assert.match(worker,/sumUpFetch:specialEventSumUpFetch/,'Special Event checkout creation must use only the dedicated credential');
  assert.match(worker,/specialEventBooking \? 'SUMUP_SPECIAL_EVENTS_API_KEY' : 'SUMUP_API_KEY'/,'webhook verification must select the credential after identifying the booking type');
  assert.match(worker,/return sumUpFetchWithCredential\(env, 'SUMUP_API_KEY'/,'existing class and Sunday checkout paths must retain the shared credential');
  assert.match(worker,/Special Event payment setup is not complete\. No booking or payment has been created\./,'missing Special Events configuration must fail before creating a booking');
  assert.match(worker,/\/api\/admin\/special-event-owner-payment-test/,'the controlled payment route must live under protected Admin HQ');
  assert.match(worker,/requireAccessAdmin\(request,env\)/,'owner payment test must use authoritative Cloudflare Access authorisation');
  assert.match(worker,/CREATE £15 OWNER PAYMENT TEST/,'owner payment test must require an explicit server-side confirmation');
  assert.match(worker,/product_code:'SATURDAY_SOCIAL'/,'owner payment test must be fixed to the approved £15 product');
  assert.match(service,/status='DRAFT' AND publication_enabled=0 AND checkout_enabled=0/,'owner payment test must require the event to remain private and checkout-disabled');
  assert.match(service,/REFUND_POLICY_UNCONFIRMED.*PUBLIC_PRESENTATION_UNAPPROVED.*PAYMENT_INTEGRATION_UNVERIFIED.*PRODUCTION_INSTALLATION_UNVERIFIED/,'owner test may defer publication-only approvals without mutating them');
  assert.match(service,/OWNER_PAYMENT_TEST_CREATED/,'owner payment tests must have a durable audit marker');
  assert.match(ranch,/Prepare £15 owner payment/,'HQ must expose the protected controlled-payment action');
  assert.match(worker,/special_event_payments/,'HQ health must report Special Events merchant authorisation separately');
  assert.match(service,/H\.264.*AAC/,'HQ media upload must explain the supported video and audio codecs');
  assert.match(ranch,/accept="\.mp4,\.mov,\.m4v,video\/mp4,video\/quicktime,video\/x-m4v"/,'Safari file picker must allow MP4, MOV and M4V selection');
  assert.match(service,/verified_codecs:\['H264','AAC'\]/,'server must verify browser-compatible codecs before saving event video');
  assert.match(service,/content-range/,'event video delivery must support byte ranges');
  assert.match(worker,/\/api\/admin\/special-event-media\/upload/,'event video upload must remain behind HQ authentication');
  assert.match(eventPageScript,/playsinline/,'event video must use mobile Safari inline playback');
  assert.match(eventPageScript,/aria-label="Open \$\{escapeHtml\(item\.title\)\} on CopperKnob"/,'CopperKnob actions must have dance-specific accessible labels');
  assert.match(eventPageScript,/aria-label="Open \$\{escapeHtml\(item\.title\)\} on BootStepper"/,'BootStepper actions must have dance-specific accessible labels');
  assert.match(eventPageScript,/Meet Johnny Rossato/,'public event must include the verified instructor section');
  assert.match(eventPageScript,/all ages/,'competition must clearly state that it is open to all ages');
  assert.match(service,/Adult tickets are for named attendees aged 18 or over/,'server must enforce adult admission age');
  assert.match(service,/Number\(item\.age\)>17/,'server must enforce under-18 junior admission');
  assert.match(listingPage,/<h2>What’s coming up<\/h2>/,'listing must use the approved single hierarchy');
  assert.doesNotMatch(listingPage,/Special dates for your diary/,'redundant listing heading must be removed');
  assert.doesNotMatch(eventPageScript,/autoplay/,'event video must not autoplay');
  assert.match(service,/Publication is blocked until all mandatory settings are confirmed/);
  assert.match(service,/never activates another release or creates a staggered presale/,'automatic release sequencing must remain disabled');
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
  assert.match(service,/all configured ticket products together/,'manual launch must activate configured products together');
  assert.match(service,/action==='ISSUE_COMPLIMENTARY_TICKETS'/,'HQ must issue complimentary tickets through the existing event booking model');
  assert.match(service,/action==='UPDATE_ALLOCATION'/,'HQ must expose a dedicated allocation-only operation');
  assert.match(service,/TICKET_ALLOCATION_UPDATED/,'allocation edits must create a distinct immutable audit event');
  assert.match(ranch,/Manage Ticket Allocations/,'HQ must provide the owner-facing allocation manager');
  for(const label of ['Current','Paid','Complimentary','Active holds','Remaining','New allocation'])assert.match(ranch,new RegExp(`>${label}<`),`allocation manager must show ${label}`);
  assert.match(service,/payment_provider<>'COMPLIMENTARY'/,'complimentary admission must be excluded from paid revenue');
  assert.match(service,/action==='CANCEL_COMPLIMENTARY_TICKETS'/,'HQ must cancel complimentary admission safely');
  assert.match(service,/EVENT_AND_SALES_OPENED/,'manual launch must create an audit event');
  assert.match(service,/action==='CLOSE_SALES'/,'HQ must provide a separate close-sales operation');
  assert.match(migration,/public_presentation_approved/);
  assert.match(migration,/payment_integration_verified/);
  assert.match(migration,/production_installation_verified/);
  assert.match(service,/ORDER BY created_at DESC,id ASC LIMIT 250/,'Special Events bookings must default to newest-created first with a stable id tie-break');
  assert.match(worker,/ORDER BY b\.created_at DESC,b\.id ASC/,'regular and Sunday booking APIs must default to newest-created first with a stable id tie-break');
  assert.match(ranch,/const bookingSortRows=/,'HQ booking lists must share the stable booking-created sorting helper');
  assert.match(ranch,/timeZone:'Europe\/London'/,'HQ booking timestamps must render in UK local time');
  assert.match(ranchPage,/id="bookingAdminSort"/,'the regular and Sunday booking list must expose the compact sort control');
  for(const mode of ['newest','oldest','name-az','name-za'])assert.match(ranch,new RegExp(`\\['${mode}'`),`sorting mode ${mode} must remain available`);
  const sortExpression=ranch.match(/const bookingSortRows=(.*?);\n  const bookingSortOptions/s)?.[1];
  assert.ok(sortExpression,'the shared booking sorting implementation must be extractable for regression testing');
  const bookingSortRows=Function(`return (${sortExpression})`)();
  const sortFixture=[
    {id:'booking-b',customer_name:'Zoe',created_at:'2026-11-05T10:00:00Z'},
    {id:'booking-a',customer_name:'Amy',created_at:'2026-11-05T10:00:00Z'},
    {id:'booking-c',customer_name:'Bob',created_at:'2026-11-04T10:00:00Z'}
  ];
  assert.deepEqual(bookingSortRows(sortFixture).map(row=>row.id),['booking-a','booking-b','booking-c'],'new bookings must appear first with a stable id tie-break');
  assert.deepEqual(bookingSortRows(sortFixture,'oldest').map(row=>row.id),['booking-c','booking-a','booking-b']);
  assert.deepEqual(bookingSortRows(sortFixture,'name-az').map(row=>row.customer_name),['Amy','Bob','Zoe']);
  assert.deepEqual(bookingSortRows(sortFixture,'name-za').map(row=>row.customer_name),['Zoe','Bob','Amy']);

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
