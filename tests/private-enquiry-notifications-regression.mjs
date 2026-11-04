import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const worker=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const mod=await import(`data:text/javascript;base64,${Buffer.from(worker+'\nexport {processPrivateEnquiryNotificationJob,privateEnquiryNotificationCopy};').toString('base64')}`);
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
db.exec(`CREATE TABLE private_event_inquiries(
  id TEXT PRIMARY KEY,reference TEXT NOT NULL UNIQUE,secure_token TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,customer_email TEXT NOT NULL,customer_phone TEXT,event_type TEXT NOT NULL,
  preferred_date TEXT NOT NULL,start_time TEXT,end_time TEXT,venue_name TEXT,venue_address TEXT NOT NULL,
  venue_postcode TEXT NOT NULL,guest_count INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'NEW_INQUIRY',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE private_event_timeline(id INTEGER PRIMARY KEY AUTOINCREMENT,inquiry_id TEXT NOT NULL REFERENCES private_event_inquiries(id) ON DELETE CASCADE,actor_type TEXT NOT NULL,actor_label TEXT,action TEXT NOT NULL,details_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
db.prepare(`INSERT INTO private_event_inquiries(id,reference,secure_token,customer_name,customer_email,event_type,preferred_date,venue_address,venue_postcode,guest_count,status,created_at,updated_at) VALUES('historical','PE-HISTORY','token-history','Historical Customer','history@example.test','Party','2026-12-01','Birmingham','B1 1AA',20,'QUOTE_SENT','2026-08-01 10:00:00','2026-08-02 11:00:00')`).run();
db.exec(readFileSync(new URL('../migrations/0029_private_enquiry_notifications.sql',import.meta.url),'utf8'));
const historical=db.prepare(`SELECT received_at,workflow_status,last_contacted_at FROM private_event_inquiries WHERE id='historical'`).get();
assert.equal(historical.received_at,'2026-08-01 10:00:00');
assert.equal(historical.workflow_status,'QUOTED');
assert.equal(historical.last_contacted_at,'2026-08-02 11:00:00');

const prepare=(sql,params=[])=>({sql,params,bind(...values){return prepare(sql,values)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {success:true,meta:db.prepare(sql).run(...params)}}});
const env={ADMIN_EMAIL:'owner@example.test',RESEND_API_KEY:'test-key',EMAIL_FROM_EVENTS:'Boot Scootin Events <events@example.test>',BOOKINGS_DB:{prepare,async batch(statements){db.exec('BEGIN');try{const out=statements.map(statement=>({success:true,meta:db.prepare(statement.sql).run(...statement.params)}));db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}}};
db.prepare(`INSERT INTO private_event_inquiries(id,reference,secure_token,customer_name,customer_email,customer_phone,event_type,preferred_date,start_time,end_time,venue_name,venue_address,venue_postcode,guest_count,received_at) VALUES('new-enquiry','PE-NEW','token-new','Private Customer','private@example.test','07000000000','Birthday','2026-12-12','19:00','20:00','Test venue','Test address','B1 2AA',30,'2026-10-29T10:00:00.000Z')`).run();
db.prepare(`INSERT INTO private_event_notification_jobs(id,inquiry_id,idempotency_key,status,next_attempt_at) VALUES('job-new','new-enquiry','private-enquiry:new-enquiry:owner-notification','PENDING','2020-01-01T00:00:00.000Z')`).run();

let sends=0,seenIdempotency='';
globalThis.fetch=async()=>{sends++;throw new Error('simulated provider outage')};
let result=await mod.processPrivateEnquiryNotificationJob(env,'new-enquiry');
assert.equal(result.status,'RETRY');
assert.equal(db.prepare(`SELECT status FROM private_event_notification_jobs WHERE id='job-new'`).get().status,'RETRY');
assert.equal(db.prepare(`SELECT COUNT(*) count FROM private_event_inquiries WHERE id='new-enquiry'`).get().count,1,'email failure never loses the enquiry');

db.prepare(`UPDATE private_event_notification_jobs SET next_attempt_at='2020-01-01T00:00:00.000Z' WHERE id='job-new'`).run();
globalThis.fetch=async(_url,options)=>{sends++;seenIdempotency=options.headers['Idempotency-Key'];return new Response(JSON.stringify({id:'resend-test-id'}),{status:200,headers:{'content-type':'application/json'}})};
result=await mod.processPrivateEnquiryNotificationJob(env,'new-enquiry');
assert.equal(result.status,'SENT');
assert.equal(seenIdempotency,'private-enquiry:new-enquiry:owner-notification');
assert.equal(db.prepare(`SELECT status FROM private_event_notification_jobs WHERE id='job-new'`).get().status,'SENT');
assert.equal(db.prepare(`SELECT COUNT(*) count FROM private_event_notification_attempts WHERE job_id='job-new'`).get().count,2);
const sendsBefore=sends;
result=await mod.processPrivateEnquiryNotificationJob(env,'new-enquiry');
assert.equal(result.status,'SENT');
assert.equal(sends,sendsBefore,'a sent job cannot send twice');
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
console.log('PASS private enquiries survive email failure, retry safely and deliver once');
