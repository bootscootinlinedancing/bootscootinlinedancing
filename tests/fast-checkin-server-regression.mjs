import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const special=readFileSync(new URL('../special-events.js',import.meta.url),'utf8').replace(/^import .*payment-reconciliation\.js';\s*/m,'').replace(/^export /gm,'');
const source=special+'\n'+readFileSync(new URL('../_worker.js',import.meta.url),'utf8').replace(/^import .*special-events\.js';\s*/m,'').replaceAll("'./payment-reconciliation.js'",JSON.stringify(new URL('../payment-reconciliation.js',import.meta.url).href));
const mod=await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {attendeeSchemaAvailable,bookingUsesPersonAttendance,bookingAttendeeRows,checkInBookingAttendee,deterministicAttendeeCustomer,syncLoyaltyForEmail,awardLoyaltyStampForBooking,uniqueAttendanceCountForCustomer,bulkRegisterCheckIn,adminBookings,adminClasses};').toString('base64')}`);
const db=new DatabaseSync(':memory:');
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE classes(id TEXT PRIMARY KEY,title TEXT,status TEXT DEFAULT 'open');
CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE);
CREATE TABLE member_accounts(id TEXT PRIMARY KEY,customer_id TEXT,email TEXT);
CREATE TABLE customer_email_identities(id TEXT PRIMARY KEY,customer_id TEXT,normalized_email TEXT,status TEXT);
CREATE TABLE bookings(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),customer_id TEXT,customer_name TEXT,customer_email TEXT,quantity INTEGER,amount_pence INTEGER,status TEXT,payment_provider TEXT);
CREATE TABLE loyalty_transactions(id TEXT PRIMARY KEY,customer_id TEXT,customer_email TEXT NOT NULL,member_id TEXT,booking_id TEXT,amount INTEGER,transaction_type TEXT,reason TEXT,source_type TEXT,source_id TEXT,created_by TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(source_type,source_id));
CREATE TABLE loyalty_stamp_ledger(id TEXT PRIMARY KEY,customer_email TEXT,member_id TEXT,booking_id TEXT,event_key TEXT UNIQUE,stamp_delta INTEGER,reason TEXT);
CREATE TABLE customer_crm_profiles(customer_key TEXT PRIMARY KEY,loyalty_adjustment INTEGER DEFAULT 0);
CREATE TABLE promotions(id TEXT PRIMARY KEY,name TEXT,code_prefix TEXT,discount_type TEXT,discount_value INTEGER,starts_at TEXT,ends_at TEXT,max_uses INTEGER,uses_per_customer INTEGER,applicable_class_id TEXT,personal_only INTEGER,active INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE promotion_codes(id TEXT PRIMARY KEY,promotion_id TEXT REFERENCES promotions(id),code TEXT UNIQUE,customer_email TEXT,issued_reason TEXT,issued_at TEXT DEFAULT CURRENT_TIMESTAMP,expires_at TEXT,max_uses INTEGER,active INTEGER);
INSERT INTO classes(id,title) VALUES('class-1','Local class');
INSERT INTO customers VALUES('lead','Lead Person','lead@example.test'),('guest-a','Guest A','a@example.test'),('guest-b','Guest B','b@example.test'),('helper','Helper','helper@example.test');
INSERT INTO member_accounts VALUES('member-a','guest-a','a@example.test');
INSERT INTO customer_email_identities VALUES('identity-lead','lead','lead@example.test','ACTIVE'),('identity-a','guest-a','a@example.test','ACTIVE'),('identity-b','guest-b','b@example.test','ACTIVE'),('identity-helper','helper','helper@example.test','ACTIVE');
INSERT INTO bookings VALUES('booking-1','class-1','lead','Lead Person','lead@example.test',3,1800,'PAID','SUMUP');`);
db.exec(readFileSync(new URL('../migrations/0025_booking_attendees.sql',import.meta.url),'utf8'));
const prepare=(sql,params=[])=>({sql,params,bind(...values){return prepare(sql,values)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {meta:db.prepare(sql).run(...params)}}});
const env={RESEND_API_KEY:'fixture-key',EMAIL_FROM_MEMBERS:'members@example.test',BOOKINGS_DB:{prepare,async batch(items){db.exec('BEGIN');try{const results=items.map(item=>({meta:db.prepare(item.sql).run(...item.params)}));db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}}};

function person(id,booking='booking-1',place=1){db.prepare(`INSERT INTO booking_attendees(id,booking_id,class_id,place_number,role,snapshot_name) VALUES(?,?,'class-1',?,'GUEST',?)`).run(id,booking,place,'Synthetic '+id)}
person('parallel',undefined,1);person('family-a',undefined,2);person('family-b',undefined,3);
const before=db.prepare(`SELECT COUNT(*) n FROM loyalty_transactions`).get().n;
await Promise.all(Array.from({length:8},(_,n)=>mod.checkInBookingAttendee(env,{attendeeId:'parallel',classId:'class-1',actor:'staff-'+n,operationId:'parallel-'+n})));
assert.equal(db.prepare(`SELECT COUNT(*) n FROM booking_attendee_audit WHERE attendee_id='parallel' AND action='ATTENDEE_CHECKED_IN'`).get().n,1);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM loyalty_transactions`).get().n,before,'snapshot-only people do not acquire invented loyalty');
db.exec(`INSERT INTO bookings VALUES('unpaid','class-1','lead','Unpaid','lead@example.test',1,600,'PENDING','SUMUP')`);person('unpaid','unpaid');
let result=await mod.bulkRegisterCheckIn(env,{class_id:'class-1',operation_id:'family-operation',attendee_ids:['family-a','family-b','unpaid']},'staff');assert.equal(result.results.filter(x=>x.ok).length,2);assert.equal(result.results.filter(x=>x.error).length,1);
result=await mod.bulkRegisterCheckIn(env,{class_id:'class-1',operation_id:'family-operation',attendee_ids:['family-a','family-b','unpaid']},'other-staff');assert.equal(result.results.filter(x=>x.ok).length,2);assert.equal(db.prepare(`SELECT COUNT(*) n FROM booking_attendee_audit WHERE attendee_id IN ('family-a','family-b') AND action='ATTENDEE_CHECKED_IN'`).get().n,2);
assert((await mod.bulkRegisterCheckIn(env,{class_id:'wrong-class',operation_id:'wrong',attendee_ids:['family-a']},'staff')).results[0].error);
assert((await mod.bulkRegisterCheckIn(env,{class_id:'class-1',operation_id:'too-large',attendee_ids:Array.from({length:26},(_,n)=>'id-'+n)},'staff')).error);
// Simulate cancellation after the initial read, immediately before the atomic batch.
person('race','unpaid',2);db.exec(`UPDATE bookings SET status='PAID',quantity=2 WHERE id='unpaid'`);const originalBatch=env.BOOKINGS_DB.batch;env.BOOKINGS_DB.batch=async items=>{db.exec(`UPDATE bookings SET status='CANCELLED' WHERE id='unpaid'`);return originalBatch(items)};
result=await mod.checkInBookingAttendee(env,{attendeeId:'race',classId:'class-1',actor:'staff',operationId:'race'});assert(result.error);assert.equal(db.prepare(`SELECT attendance_status FROM booking_attendees WHERE id='race'`).get().attendance_status,'EXPECTED');assert.equal(db.prepare(`SELECT COUNT(*) n FROM booking_attendee_audit WHERE attendee_id='race'`).get().n,0);env.BOOKINGS_DB.batch=originalBatch;
db.exec(`UPDATE classes SET status='cancelled' WHERE id='class-1'`);assert((await mod.checkInBookingAttendee(env,{attendeeId:'family-a',classId:'class-1',actor:'staff',operationId:'closed'})).error);
console.log('PASS regular single/bulk check-in, simultaneous staff, scope/eligibility, partial failures, retry, immutable audit, unchanged loyalty and cancellation race');

// The real HTTP register routes must avoid runtime schema bootstrap work.
db.exec("UPDATE classes SET status='open'; INSERT INTO bookings VALUES('fast-route','class-1','lead','Route Guest','route@example.test',1,800,'PAID','SUMUP')");person('fast-person','fast-route');
let ddl=0;env.BOOKINGS_DB.prepare=sql=>{if(/^\s*(CREATE|ALTER)/i.test(sql)){ddl++;throw Error('DDL is forbidden on the register request');}return prepare(sql);};
const route=await mod.adminBookings(new Request('https://fixture.example.test/ranch/api/admin/bookings',{method:'PATCH',headers:{Origin:'https://fixture.example.test','Cf-Access-Authenticated-User-Email':'staff@example.test','Content-Type':'application/json'},body:JSON.stringify({action:'REGISTER_ATTENDEES_CHECK_IN',class_id:'class-1',attendee_ids:['fast-person'],operation_id:'http-fast-checkin'})}),env,{});
assert.equal(route.status,200);assert.equal((await route.json()).results[0].ok,true);assert.equal(ddl,0);
const readEnv={BOOKINGS_DB:{prepare(sql){assert(!/^\s*(CREATE|ALTER)/i.test(sql));return {bind(){return this},async first(){return null}}}}};
const missingRegister=await mod.adminClasses(new Request('https://fixture.example.test/ranch/api/admin/classes?register=missing',{headers:{'Cf-Access-Authenticated-User-Email':'staff@example.test'}}),readEnv);assert.equal(missingRegister.status,404);
console.log('PASS authenticated HTTP check-in and register read avoid runtime DDL/bootstrap');
