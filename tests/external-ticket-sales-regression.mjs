import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const mod=await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {adminExternalTickets,externalTicketState};').toString('base64')}`);
const db=new DatabaseSync(':memory:');
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE classes(id TEXT PRIMARY KEY,title TEXT NOT NULL,venue TEXT NOT NULL,location TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT,price_pence INTEGER NOT NULL,capacity INTEGER NOT NULL,sold INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,level TEXT NOT NULL,public_notes TEXT,poster_url TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE booking_holds(id TEXT PRIMARY KEY,class_id TEXT NOT NULL REFERENCES classes(id),quantity INTEGER NOT NULL,expires_at TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,phone TEXT,marketing_consent INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE bookings(id TEXT PRIMARY KEY,reference TEXT NOT NULL UNIQUE,class_id TEXT NOT NULL REFERENCES classes(id),hold_id TEXT REFERENCES booking_holds(id),customer_id TEXT REFERENCES customers(id),customer_name TEXT NOT NULL,customer_email TEXT NOT NULL,customer_phone TEXT,quantity INTEGER NOT NULL,amount_pence INTEGER NOT NULL,currency TEXT DEFAULT 'GBP',status TEXT NOT NULL,payment_provider TEXT NOT NULL,provider_checkout_id TEXT,provider_transaction_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,paid_at TEXT,retention_delete_after TEXT);
CREATE TABLE payments(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),provider TEXT NOT NULL,provider_reference TEXT,amount_pence INTEGER NOT NULL,currency TEXT DEFAULT 'GBP',status TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE loyalty_transactions(id TEXT PRIMARY KEY,customer_id TEXT,customer_email TEXT NOT NULL,booking_id TEXT,amount INTEGER,transaction_type TEXT,reason TEXT,source_type TEXT,source_id TEXT,created_by TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
for(const file of ['0017_class_guest_lists.sql','0028_external_ticket_sales.sql'])db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
db.prepare(`INSERT INTO classes(id,title,venue,location,starts_at,ends_at,price_pence,capacity,status,level) VALUES('event-1','Local event','Test Venue','Test','2030-01-01T19:00:00Z','2030-01-01T21:00:00Z',600,6,'open','All')`).run();
db.prepare(`INSERT INTO bookings(id,reference,class_id,customer_name,customer_email,quantity,amount_pence,status,payment_provider) VALUES('web-1','WEB-1','event-1','Website Guest','website@example.test',1,600,'PAID','SUMUP')`).run();
db.prepare(`INSERT INTO class_guest_list(id,class_id,guest_name,places,category,created_by,updated_by,last_operation_id) VALUES('guest-1','event-1','Existing guest',1,'GUEST','fixture','fixture','fixture-guest-op')`).run();

const prepare=(sql,params=[])=>({sql,params,bind(...values){return prepare(sql,values)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {success:true,meta:db.prepare(sql).run(...params)}}});
const env={ADMIN_EMAIL:'owner@example.test',BOOKINGS_DB:{prepare,async batch(items){db.exec('BEGIN');try{const out=items.map((item,index)=>{try{return {success:true,meta:db.prepare(item.sql).run(...item.params)}}catch(error){error.message+=` [batch ${index}: ${item.sql}] params=${item.params.length}`;throw error}});db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}}};
const request=async(body)=>mod.adminExternalTickets(new Request('https://bootscootinlinedancing.co.uk/ranch/api/admin/external-tickets?class_id=event-1',{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Origin':'https://bootscootinlinedancing.co.uk','Cf-Access-Authenticated-User-Email':'owner@example.test'},...(body?{body:JSON.stringify(body)}:{})}),env);
const record=(overrides={})=>({action:'RECORD_EXTERNAL_ORDER',source:'EVENTBRITE',ticket_type:'General admission',purchaser_name:'External Guest',purchaser_email:'external@example.test',quantity:1,amount_paid_pence:700,external_reference:'EB-100',purchased_at:'2026-10-20',notes:'Local fixture only',payment_collected_externally:true,reason:'Regression fixture',operation_id:`op-${crypto.randomUUID()}`,...overrides});

globalThis.fetch=async()=>{throw new Error('External ticket recording must not contact SumUp or any network service')};

const firstOperation=`op-${crypto.randomUUID()}`,firstRecord=record({operation_id:firstOperation});
let response=await request(firstRecord);assert.equal(response.status,200,await response.clone().text());
response=await request(firstRecord);assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).idempotent,true);
response=await request(record({source:'SKIDDLE',quantity:2,amount_paid_pence:1400,external_reference:'SK-200'}));assert.equal(response.status,200,await response.clone().text());
assert.equal(db.prepare(`SELECT COUNT(*) count FROM external_ticket_orders WHERE status='ACTIVE'`).get().count,2);
assert.equal(db.prepare(`SELECT COUNT(*) count FROM external_ticket_admissions WHERE status='EXPECTED'`).get().count,3);
assert.equal(db.prepare(`SELECT COUNT(*) count FROM customers`).get().count,0);
assert.equal(db.prepare(`SELECT COUNT(*) count FROM loyalty_transactions`).get().count,0);

response=await request(record({external_reference:'EB-100'}));assert.equal(response.status,409);assert.match((await response.json()).error,/already recorded/i);
let state=await mod.externalTicketState(env,'event-1');assert.deepEqual({...state.summary},{website:1,eventbrite:1,skiddle:2,manual:0,complimentary:0,held:0,guest_places:1,external_revenue_pence:2100,capacity:6,external_total:3,total_valid_tickets:4,remaining:1});

response=await request(record({source:'MANUAL',quantity:2,external_reference:'MAN-OVER',amount_paid_pence:1200}));assert.equal(response.status,409);assert.match((await response.json()).error,/capacity/i);
const admission=db.prepare(`SELECT id FROM external_ticket_admissions WHERE status='EXPECTED' ORDER BY admission_number LIMIT 1`).get();
response=await request({action:'CHECK_IN_EXTERNAL_ADMISSION',admission_id:admission.id,reason:'Local check-in fixture',operation_id:`op-${crypto.randomUUID()}`});assert.equal(response.status,200,await response.clone().text());assert.equal(db.prepare(`SELECT status FROM external_ticket_admissions WHERE id=?`).get(admission.id).status,'ATTENDED');assert.equal(db.prepare(`SELECT COUNT(*) count FROM loyalty_transactions`).get().count,0);

const order=db.prepare(`SELECT id FROM external_ticket_orders WHERE source='SKIDDLE'`).get();
response=await request({...record({action:'CORRECT_EXTERNAL_ORDER',id:order.id,source:'SKIDDLE',quantity:3,amount_paid_pence:1800,external_reference:'SK-200',reason:'Correct quantity fixture'})});assert.equal(response.status,200,await response.clone().text());
assert.equal(db.prepare(`SELECT quantity FROM external_ticket_orders WHERE id=?`).get(order.id).quantity,3);
assert.equal(db.prepare(`SELECT COUNT(*) count FROM external_ticket_admissions WHERE order_id=? AND status='EXPECTED'`).get(order.id).count,3);
state=await mod.externalTicketState(env,'event-1');assert.equal(state.summary.remaining,0);
response=await request({action:'CANCEL_EXTERNAL_ORDER',id:order.id,reason:'Local cancellation fixture',operation_id:`op-${crypto.randomUUID()}`});assert.equal(response.status,200,await response.clone().text());state=await mod.externalTicketState(env,'event-1');assert.equal(state.summary.skiddle,0);assert.equal(state.summary.remaining,3);
assert.equal(db.prepare(`SELECT COUNT(*) count FROM bookings WHERE id='web-1' AND status='PAID'`).get().count,1);
assert.equal(db.prepare(`SELECT COUNT(*) count FROM payments`).get().count,0);
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
assert.throws(()=>db.prepare(`DELETE FROM external_ticket_orders WHERE source='EVENTBRITE'`).run(),/cancelled, not deleted/);
assert.throws(()=>db.prepare(`UPDATE external_ticket_audit SET reason='changed'`).run(),/immutable/);

console.log('PASS external ticket orders: Eventbrite/Skiddle, idempotent retry, correction, duplicate rejection, shared capacity, person check-in, cancellation audit, no SumUp/customer/loyalty side effects, website booking preserved, FK/integrity clean.');
