import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const mod=await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {bookingAttendeeRows,checkInBookingAttendee,deterministicAttendeeCustomer};').toString('base64')}`);
const db=new DatabaseSync(':memory:');
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE classes(id TEXT PRIMARY KEY,title TEXT);
CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE);
CREATE TABLE member_accounts(id TEXT PRIMARY KEY,customer_id TEXT,email TEXT);
CREATE TABLE customer_email_identities(id TEXT PRIMARY KEY,customer_id TEXT,normalized_email TEXT,status TEXT);
CREATE TABLE bookings(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),customer_id TEXT,customer_name TEXT,customer_email TEXT,quantity INTEGER,amount_pence INTEGER,status TEXT,payment_provider TEXT);
CREATE TABLE loyalty_transactions(id TEXT PRIMARY KEY,customer_id TEXT,customer_email TEXT NOT NULL,member_id TEXT,booking_id TEXT,amount INTEGER,transaction_type TEXT,reason TEXT,source_type TEXT,source_id TEXT,created_by TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(source_type,source_id));
INSERT INTO classes VALUES('class-1','Local class');
INSERT INTO customers VALUES('lead','Lead Person','lead@example.test'),('guest-a','Guest A','a@example.test'),('guest-b','Guest B','b@example.test'),('helper','Helper','helper@example.test');
INSERT INTO member_accounts VALUES('member-a','guest-a','a@example.test');
INSERT INTO customer_email_identities VALUES('identity-lead','lead','lead@example.test','ACTIVE'),('identity-a','guest-a','a@example.test','ACTIVE'),('identity-b','guest-b','b@example.test','ACTIVE'),('identity-helper','helper','helper@example.test','ACTIVE');
INSERT INTO bookings VALUES('booking-1','class-1','lead','Lead Person','lead@example.test',3,1800,'PAID','SUMUP');`);
db.exec(readFileSync(new URL('../migrations/0025_booking_attendees.sql',import.meta.url),'utf8'));
const prepare=(sql,params=[])=>({sql,params,bind(...values){return prepare(sql,values)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {meta:db.prepare(sql).run(...params)}}});
const env={BOOKINGS_DB:{prepare,async batch(items){db.exec('BEGIN');try{const results=items.map(item=>({meta:db.prepare(item.sql).run(...item.params)}));db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}}};

const rows=await mod.bookingAttendeeRows(env,{bookingId:'booking-1',classId:'class-1',quantity:3,lead:{name:'Lead Person',email:'lead@example.test',customerId:'lead'},guests:[{place_number:2,name:'Guest A',email:'a@example.test'},{place_number:3,name:'Guest B',email:'b@example.test'}]});
assert.equal(rows.length,3);assert.deepEqual(rows.map(row=>row.customer_id),['lead','guest-a','guest-b']);
for(const row of rows)db.prepare(`INSERT INTO booking_attendees(id,booking_id,class_id,place_number,role,snapshot_name,snapshot_email,normalized_email,customer_id) VALUES(?,?,?,?,?,?,?,?,?)`).run(row.id,row.booking_id,row.class_id,row.place_number,row.role,row.snapshot_name,row.snapshot_email,row.normalized_email,row.customer_id);
for(const [index,row] of rows.entries()){
  const first=await mod.checkInBookingAttendee(env,{attendeeId:row.id,actor:'admin@example.test',operationId:`check-${index}`});assert.equal(first.ok,true);assert.equal(first.loyalty_credited,true);
  const retry=await mod.checkInBookingAttendee(env,{attendeeId:row.id,actor:'admin@example.test',operationId:`check-${index}`});assert.equal(retry.idempotent,true);
}
assert.equal(db.prepare(`SELECT COUNT(*) n FROM loyalty_transactions`).get().n,3);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM loyalty_transactions WHERE customer_id='lead'`).get().n,1);

const duplicateId='duplicate-lead';
db.prepare(`INSERT INTO booking_attendees(id,booking_id,class_id,place_number,role,snapshot_name,snapshot_email,normalized_email,customer_id) VALUES(?,?,?,?,?,?,?,?,?)`).run(duplicateId,'booking-1','class-1',4,'GUEST','Lead again','lead@example.test','lead@example.test','lead');
const duplicate=await mod.checkInBookingAttendee(env,{attendeeId:duplicateId,actor:'admin@example.test',operationId:'duplicate-person'});assert.equal(duplicate.ok,true);assert.equal(duplicate.loyalty_credited,false);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM loyalty_transactions WHERE customer_id='lead'`).get().n,1);

const complimentaryId='complimentary';
db.prepare(`INSERT INTO booking_attendees(id,class_id,role,snapshot_name,snapshot_email,normalized_email,customer_id) VALUES(?,?,'COMPLIMENTARY',?,?,?,?)`).run(complimentaryId,'class-1','Helper','helper@example.test','helper@example.test','helper');
const complimentary=await mod.checkInBookingAttendee(env,{attendeeId:complimentaryId,actor:'admin@example.test',operationId:'complimentary-check',reason:'Teaching support'});
assert.equal(complimentary.loyalty_credited,true);
const complimentaryRetry=await mod.checkInBookingAttendee(env,{attendeeId:complimentaryId,actor:'admin@example.test',operationId:'complimentary-check',reason:'Teaching support'});assert.equal(complimentaryRetry.idempotent,true);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM loyalty_transactions WHERE customer_id='helper'`).get().n,1);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM bookings`).get().n,1);assert.equal(db.prepare(`SELECT SUM(amount_pence) total FROM bookings`).get().total,1800);
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
assert.throws(()=>db.prepare(`UPDATE booking_attendee_audit SET reason='changed'`).run(),/immutable/);

const bookingsJs=readFileSync(new URL('../bookings.js',import.meta.url),'utf8');
assert.match(bookingsJs,/length:quantity-1/);assert.match(bookingsJs,/data\.guests=submittedGuests\(\)/);assert.match(bookingsJs,/\.filter\(guest=>guest\.name\|\|guest\.email\)/);
console.log('PASS attendee model, deterministic identity, per-person/class loyalty, idempotency, complimentary isolation, migration integrity and guest payload controls');

const backup=process.argv[2];
if(backup){
  const live=new DatabaseSync(':memory:');live.exec('PRAGMA foreign_keys=OFF');live.exec(readFileSync(backup,'utf8'));live.exec('PRAGMA foreign_keys=ON');
  live.exec(readFileSync(new URL('../migrations/0024_anonymous_reviews.sql',import.meta.url),'utf8'));
  live.exec(readFileSync(new URL('../migrations/0025_booking_attendees.sql',import.meta.url),'utf8'));
  const livePrepare=(sql,params=[])=>({sql,params,bind(...values){return livePrepare(sql,values)},async first(){return live.prepare(sql).get(...params)||null},async all(){return {results:live.prepare(sql).all(...params)}},async run(){return {meta:live.prepare(sql).run(...params)}}});
  const liveEnv={ADMIN_EMAIL:'admin@example.test',BOOKINGS_DB:{prepare:livePrepare,async batch(items){live.exec('BEGIN');try{const results=items.map(item=>({meta:live.prepare(item.sql).run(...item.params)}));live.exec('COMMIT');return results}catch(error){live.exec('ROLLBACK');throw error}}}};
  const request=body=>mod.default.fetch(new Request('https://bootscootinlinedancing.co.uk/api/class-reservations',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://bootscootinlinedancing.co.uk'},body:JSON.stringify(body)}),liveEnv,{waitUntil(){}});
  live.prepare(`INSERT INTO classes(id,title,venue,location,starts_at,ends_at,price_pence,capacity,status,level) VALUES('attendee-route','Route fixture','Fixture venue','Fixture','2031-10-23T18:15:00Z','2031-10-23T21:15:00Z',600,20,'open','Beginner friendly')`).run();
  for(const [id,name,email] of [['route-lead','Route Lead','route-lead@example.test'],['route-a','Route Guest A','route-a@example.test'],['route-b','Route Guest B','route-b@example.test']]){
    live.prepare(`INSERT INTO customers(id,name,email) VALUES(?,?,?)`).run(id,name,email);live.prepare(`INSERT INTO customer_email_identities(id,customer_id,normalized_email,status,source) VALUES(?,?,?,'ACTIVE','ADMIN')`).run(`identity-${id}`,id,email);
  }
  const response=await request({name:'Route Lead',email:'route-lead@example.test',classId:'attendee-route',quantity:3,terms_accepted:true,guests:[{place_number:2,name:'Route Guest A',email:'route-a@example.test'},{place_number:3,name:'Route Guest B',email:'route-b@example.test'}]});
  assert.equal(response.status,201,await response.clone().text());
  const booking=live.prepare(`SELECT * FROM bookings WHERE class_id='attendee-route'`).get();assert.equal(booking.quantity,3);assert.equal(booking.amount_pence,1800);assert.equal(live.prepare(`SELECT COUNT(*) n FROM booking_attendees WHERE booking_id=?`).get(booking.id).n,3);
  assert.equal(live.prepare(`SELECT COUNT(*) n FROM loyalty_stamp_ledger WHERE booking_id=?`).get(booking.id).n,0);
  live.prepare(`INSERT INTO classes(id,title,venue,location,starts_at,ends_at,price_pence,capacity,status,level,booking_format,social_only_enabled,social_only_price_pence,social_only_entry_time) VALUES('product-route','Product fixture','Fixture venue','Fixture','2031-10-24T18:15:00Z','2031-10-24T21:15:00Z',600,30,'open','Beginner friendly','BEGINNER_IMPROVER',1,400,'21:15')`).run();
  const products=[['BEGINNER_SOCIAL',600,'2031-10-24T18:15:00Z','2031-10-24T19:15:00Z',null,1],['IMPROVER_SOCIAL',600,'2031-10-24T19:15:00Z','2031-10-24T20:15:00Z',null,1],['BEGINNER_IMPROVER_SOCIAL',800,'2031-10-24T18:15:00Z','2031-10-24T20:15:00Z',null,0],['SOCIAL_ONLY',400,null,null,'21:15',0]];
  for(const [index,[code,price,start,end,entry,pass]] of products.entries()){
    live.prepare(`INSERT INTO class_ticket_products(id,class_id,product_code,enabled,price_pence,starts_at,ends_at,entry_at,class_pass_eligible,display_order) VALUES(?, 'product-route',?,1,?,?,?,?,?,?)`).run(`product-${index}`,code,price,start,end,entry,pass,index);
    const productResponse=await request({name:`Product Tester ${index}`,email:`product-${index}@example.test`,classId:'product-route',quantity:1,terms_accepted:true,ticket_product_code:code});
    assert.equal(productResponse.status,201,`${code}: ${await productResponse.clone().text()}`);
    const productBooking=live.prepare(`SELECT ticket_product_code,amount_pence FROM bookings WHERE class_id='product-route' AND customer_email=?`).get(`product-${index}@example.test`);assert.equal(productBooking.ticket_product_code,code);assert.equal(productBooking.amount_pence,price);
  }
  const anniversary=live.prepare(`SELECT class_id FROM anniversary_events WHERE active=1 LIMIT 1`).get();
  if(anniversary){const anniversaryResponse=await request({name:'Anniversary Tester',email:'anniversary-attendee@example.test',classId:anniversary.class_id,quantity:1,terms_accepted:true});assert.equal(anniversaryResponse.status,201,await anniversaryResponse.clone().text());assert.equal(live.prepare(`SELECT COUNT(*) n FROM booking_attendees ba JOIN bookings b ON b.id=ba.booking_id WHERE b.customer_email='anniversary-attendee@example.test' AND ba.role='LEAD'`).get().n,1);}
  live.prepare(`INSERT INTO customers(id,name,email) VALUES('route-helper','Route Helper','route-helper@example.test')`).run();live.prepare(`INSERT INTO customer_email_identities(id,customer_id,normalized_email,status,source) VALUES('identity-route-helper','route-helper','route-helper@example.test','ACTIVE','ADMIN')`).run();
  const before={bookings:live.prepare(`SELECT COUNT(*) n FROM bookings`).get().n,payments:live.prepare(`SELECT COUNT(*) n FROM payments`).get().n,jobs:live.prepare(`SELECT COUNT(*) n FROM booking_confirmation_jobs`).get().n};
  const adminBody={action:'ADD_COMPLIMENTARY_ATTENDANCE',class_id:'attendee-route',customer_email:'route-helper@example.test',reason:'Complimentary teaching/support attendance — local fixture',operation_id:'complimentary-route-operation'};
  const adminRequest=body=>mod.default.fetch(new Request('https://bootscootinlinedancing.co.uk/api/admin/bookings',{method:'PATCH',headers:{'Content-Type':'application/json',Origin:'https://bootscootinlinedancing.co.uk','Cf-Access-Authenticated-User-Email':'admin@example.test'},body:JSON.stringify(body)}),liveEnv,{waitUntil(){}});
  let adminResponse=await adminRequest(adminBody);assert.equal(adminResponse.status,200,await adminResponse.clone().text());assert.equal((await adminResponse.json()).loyalty_credited,true);
  adminResponse=await adminRequest(adminBody);assert.equal(adminResponse.status,200);assert.equal((await adminResponse.json()).idempotent,true);
  adminResponse=await adminRequest({...adminBody,reason:'Conflicting reuse'});assert.equal(adminResponse.status,409);
  const noOrigin=await mod.default.fetch(new Request('https://bootscootinlinedancing.co.uk/api/admin/bookings',{method:'PATCH',headers:{'Content-Type':'application/json','Cf-Access-Authenticated-User-Email':'admin@example.test'},body:JSON.stringify({...adminBody,operation_id:'no-origin'})}),liveEnv,{waitUntil(){}});assert.equal(noOrigin.status,403);
  assert.equal(live.prepare(`SELECT COUNT(*) n FROM loyalty_transactions WHERE customer_id='route-helper' AND source_type='ATTENDEE_ATTENDANCE'`).get().n,1);
  assert.equal(live.prepare(`SELECT COUNT(*) n FROM booking_attendee_audit WHERE customer_id='route-helper'`).get().n,2);
  assert.deepEqual({bookings:live.prepare(`SELECT COUNT(*) n FROM bookings`).get().n,payments:live.prepare(`SELECT COUNT(*) n FROM payments`).get().n,jobs:live.prepare(`SELECT COUNT(*) n FROM booking_confirmation_jobs`).get().n},before);
  assert.deepEqual(live.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(live.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  console.log('PASS real reservation routes preserve Standard, Beginner, Improver, Combined, Social Only and Anniversary products; complimentary admin route is same-origin, audited and idempotent with no booking/payment/email side effects');
}
