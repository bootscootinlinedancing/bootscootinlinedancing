import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const worker=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const mod=await import(`data:text/javascript;base64,${Buffer.from(worker+'\nexport {ensureWeeklyRoundupDraft,isOwnerAccountRemovalSuppression,resolveEmailAudience,sendCampaign,weeklyRoundupMonday};').toString('base64')}`);
const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE classes(id TEXT PRIMARY KEY,title TEXT,starts_at TEXT,ends_at TEXT,capacity INTEGER,price_pence INTEGER,venue TEXT,status TEXT,public_notes TEXT,sold INTEGER DEFAULT 0);
CREATE TABLE bookings(id TEXT PRIMARY KEY,class_id TEXT,customer_email TEXT,customer_name TEXT,marketing_consent INTEGER,quantity INTEGER,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE booking_holds(id TEXT PRIMARY KEY,class_id TEXT,quantity INTEGER,expires_at TEXT);
CREATE TABLE class_guest_list(id TEXT PRIMARY KEY,class_id TEXT,places INTEGER,status TEXT);
CREATE TABLE anniversary_events(id TEXT PRIMARY KEY,class_id TEXT,active INTEGER,created_at TEXT,total_capacity INTEGER,title TEXT);
CREATE TABLE anniversary_ticket_releases(id TEXT PRIMARY KEY,event_id TEXT,active INTEGER,display_order INTEGER,allocation INTEGER,price_pence INTEGER,code TEXT,name TEXT);
CREATE TABLE anniversary_guest_list(id TEXT PRIMARY KEY,event_id TEXT,places INTEGER,status TEXT);
CREATE TABLE anniversary_ticket_adjustments(id TEXT PRIMARY KEY,event_id TEXT,release_id TEXT,places INTEGER,status TEXT);
`);
const prepare=(sql,params=[])=>({sql,params,bind(...values){return prepare(sql,values)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {success:true,meta:db.prepare(sql).run(...params)}}});
const env={BOOKINGS_DB:{prepare,async batch(statements){db.exec('BEGIN');try{const out=statements.map(statement=>({success:true,meta:db.prepare(statement.sql).run(...statement.params)}));db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}},RESEND_API_KEY:'local-key',EMAIL_FROM_GENERAL:'Boot Scootin <hello@example.test>',MAILING_LIST_SIGNING_SECRET:'local-secret'};

db.prepare(`INSERT INTO classes VALUES('available','Thursday class','2030-01-10T19:00:00Z','2030-01-10T20:00:00Z',20,600,'Low Places','open','',0)`).run();
db.prepare(`INSERT INTO classes VALUES('sold-out','Friday special','2030-01-11T19:00:00Z','2030-01-11T20:00:00Z',1,800,'Low Places','open','Workshop',0)`).run();
db.prepare(`INSERT INTO classes VALUES('cancelled','Cancelled class','2030-01-12T19:00:00Z','2030-01-12T20:00:00Z',20,600,'Low Places','cancelled','',0)`).run();
db.prepare(`INSERT INTO bookings(id,class_id,customer_email,customer_name,marketing_consent,quantity,status) VALUES('paid','sold-out','subscriber@example.test','Subscriber',1,1,'PAID')`).run();
db.prepare(`INSERT INTO bookings(id,class_id,customer_email,customer_name,marketing_consent,quantity,status) VALUES('opted-out','available','unsubscribed@example.test','Unsubscribed',1,1,'PAID')`).run();

const draft=await mod.ensureWeeklyRoundupDraft(env,new Date('2030-01-07T12:00:00Z'));
assert.equal(draft.created,true);
let campaign=db.prepare(`SELECT * FROM email_campaigns WHERE id=?`).get(draft.id);
assert.equal(campaign.status,'DRAFT','automatic preparation never schedules or sends');
assert.match(campaign.subject,/THIS WEEK AT BOOT SCOOTIN/);
assert.match(campaign.body_text,/Howdy, Boot Scooters! 🤠/);
assert.match(campaign.body_text,/Thursday class/);
assert.match(campaign.body_text,/Friday special/);
assert.match(campaign.body_text,/SOLD OUT — join the waiting list/);
assert.doesNotMatch(campaign.body_text,/Cancelled class/);
await mod.ensureWeeklyRoundupDraft(env,new Date('2030-01-09T12:00:00Z'));
assert.equal(db.prepare(`SELECT COUNT(*) count FROM email_campaigns WHERE json_extract(audience_json,'$.weekly_roundup_key')='2030-01-07'`).get().count,1,'one weekly draft per week');

db.prepare(`INSERT INTO mailing_subscribers(email,name) VALUES('subscriber@example.test','Subscriber'),('unsubscribed@example.test','Unsubscribed')`).run();
db.prepare(`INSERT INTO mailing_unsubscribes(email,source) VALUES('unsubscribed@example.test','fixture')`).run();
db.prepare(`UPDATE email_campaigns SET status='QUEUED' WHERE id=?`).run(draft.id);
let deliveries=0,idempotency='';
globalThis.fetch=async(_url,options)=>{deliveries++;idempotency=options.headers['Idempotency-Key'];return new Response(JSON.stringify({id:'provider-message'}),{status:200})};
const [first,second]=await Promise.all([mod.sendCampaign(env,draft.id),mod.sendCampaign(env,draft.id)]);
assert.equal(deliveries,1,'atomic campaign claim permits one sender');
assert.equal(first.sent+second.sent,1);
assert.match(idempotency,new RegExp(`^email-campaign:${draft.id}:`));
assert.equal(db.prepare(`SELECT COUNT(*) count FROM email_campaign_recipients WHERE campaign_id=? AND status='SENT'`).get(draft.id).count,1);
assert.equal(db.prepare(`SELECT COUNT(*) count FROM email_campaign_recipients WHERE campaign_id=? AND email='unsubscribed@example.test'`).get(draft.id).count,0,'unsubscribed recipient is suppressed');
assert.equal(db.prepare(`SELECT COUNT(*) count FROM email_campaigns WHERE json_extract(audience_json,'$.weekly_roundup_key')='2030-01-07'`).get().count,1);

assert.equal(mod.isOwnerAccountRemovalSuppression({source:'OWNER_ACCOUNT_REMOVAL'}),true,'owner removal suppression is durable');
assert.equal(mod.isOwnerAccountRemovalSuppression({source:'email-link'}),false,'ordinary unsubscribe may be reversed by fresh consent');
const selected=await mod.resolveEmailAudience(env,'selected_customers',{selected_emails:['subscriber@example.test','unsubscribed@example.test']});
assert.deepEqual(selected.recipients.map(row=>row.email),['subscriber@example.test'],'selected-customer campaigns enforce the shared suppression list');
assert.match(worker,/if\(await marketingSuppression\(env,recipient\.email\)\)/,'campaign delivery rechecks suppression after recipient claim');
assert.match(worker,/if\(isOwnerAccountRemovalSuppression\(existingSuppression\)\)/,'public signup cannot clear an owner account-removal suppression');
console.log('PASS weekly draft, sold-out wording, durable suppression, selected-customer suppression and duplicate-send protection');
