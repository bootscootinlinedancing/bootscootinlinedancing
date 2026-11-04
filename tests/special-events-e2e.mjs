import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {
  createSpecialEventReservation,
  applySpecialEventCheckoutState,
  specialEventDocumentUpload,
  specialEventDocumentDownload
} from '../special-events.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE);');
db.exec(readFileSync(new URL('../migrations/0032_special_events.sql',import.meta.url),'utf8'));
const prepare=(sql,params=[])=>({sql,params,bind(...values){return prepare(sql,values)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {success:true,meta:db.prepare(sql).run(...params)}}});
const objects=new Map();
const env={ADMIN_EMAIL:'owner@example.test',SUMUP_MERCHANT_CODE:'LOCAL_ONLY',BOOKINGS_DB:{prepare,async batch(items){db.exec('BEGIN');try{const result=items.map(item=>({success:true,meta:db.prepare(item.sql).run(...item.params)}));db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}},MEDIA_BUCKET:{async put(key,body,options){objects.set(key,{body:new Uint8Array(body),options})},async get(key){const value=objects.get(key);return value?{body:value.body}:null},async delete(key){objects.delete(key)}}};
const customer={id:'special-customer'};
db.prepare('INSERT INTO customers(id,name,email) VALUES(?,?,?)').run(customer.id,'Isolated Tester','isolated@example.test');
db.exec(`INSERT INTO special_event_access_credentials(id,event_id,product_id,password_salt,password_hash,configured_by)
    VALUES('isolated-credential','special-event-johnny-rossato-2027','johnny-loyalty-weekend','00','00','isolated-test');
  UPDATE special_event_days SET capacity=20;
  UPDATE special_event_ticket_products SET allocation=20;
  UPDATE special_event_ticket_products SET release_state='ACTIVE' WHERE code='EARLY_BIRD_WEEKEND';
  UPDATE special_events SET artwork_url='/api/special-event-artwork?id=special-event-johnny-rossato-2027',age_terms='Confirmed isolated fixture',age_terms_confirmed=1,refund_policy='Confirmed isolated fixture',refund_policy_confirmed=1;
  UPDATE special_events SET status='PUBLISHED',publication_enabled=1,checkout_enabled=1;`);
const services={resolveCustomerIdentity:async()=>customer,sumUpFetch:async()=>new Response(JSON.stringify({id:'isolated-checkout',hosted_checkout_url:'https://pay.example.test/special'}),{status:201,headers:{'content-type':'application/json'}})};
const body={slug:'johnny-rossato',product_code:'EARLY_BIRD_WEEKEND',name:'Isolated Tester',email:'isolated@example.test',phone:'07000000000',quantity:2,terms_accepted:true,idempotency_key:'isolated-special-booking'};
let response=await createSpecialEventReservation(new Request('https://example.test/api/special-event-reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env,services);
assert.equal(response.status,201,await response.clone().text());
const booking=db.prepare("SELECT * FROM special_event_bookings WHERE reference LIKE 'BSE-%'").get();
assert.equal(booking.status,'PENDING');assert.equal(booking.amount_pence,8000);assert.equal(db.prepare("SELECT SUM(places) n FROM special_event_booking_days WHERE booking_id=?").get(booking.id).n,4);
await applySpecialEventCheckoutState(env,booking,{status:'PAID',transaction_id:'isolated-transaction'});
await applySpecialEventCheckoutState(env,booking,{status:'PAID',transaction_id:'isolated-transaction'});
assert.equal(db.prepare('SELECT status FROM special_event_bookings WHERE id=?').get(booking.id).status,'PAID');
assert.equal(db.prepare('SELECT COUNT(*) n FROM special_event_attendees WHERE booking_id=?').get(booking.id).n,2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM special_event_confirmation_outbox WHERE booking_id=?').get(booking.id).n,1);

services.sumUpFetch=async()=>new Response(JSON.stringify({id:'expired-checkout',hosted_checkout_url:'https://pay.example.test/expired'}),{status:201,headers:{'content-type':'application/json'}});
response=await createSpecialEventReservation(new Request('https://example.test/api/special-event-reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,quantity:1,idempotency_key:'isolated-expiry'})}),env,services);
assert.equal(response.status,201);const expiring=db.prepare("SELECT * FROM special_event_bookings WHERE provider_checkout_id='expired-checkout'").get();
await applySpecialEventCheckoutState(env,expiring,{status:'EXPIRED'});
assert.equal(db.prepare('SELECT status FROM special_event_bookings WHERE id=?').get(expiring.id).status,'FAILED');
assert.equal(db.prepare('SELECT status FROM special_event_holds WHERE id=?').get(expiring.hold_id).status,'RELEASED');

services.sumUpFetch=async()=>new Response(JSON.stringify({error:'isolated provider failure'}),{status:502,headers:{'content-type':'application/json'}});
response=await createSpecialEventReservation(new Request('https://example.test/api/special-event-reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,quantity:1,idempotency_key:'isolated-provider-failure'})}),env,services);
assert.equal(response.status,502);const failed=db.prepare("SELECT b.status,h.status hold_status FROM special_event_bookings b JOIN special_event_holds h ON h.id=b.hold_id WHERE h.idempotency_key='isolated-provider-failure'").get();
assert.equal(failed.status,'FAILED');assert.equal(failed.hold_status,'RELEASED');

const form=new FormData();form.set('event_id','special-event-johnny-rossato-2027');form.set('title','Private isolated evidence');form.set('category','CONTRACT');form.set('file',new File([new TextEncoder().encode('private fixture')],'fixture.pdf',{type:'application/pdf'}));
response=await specialEventDocumentUpload(new Request('https://example.test/api/admin/special-event-documents/upload',{method:'POST',body:form}),env,{email:'owner@example.test'});
assert.equal(response.status,201,await response.clone().text());const uploaded=await response.json();
const version=db.prepare('SELECT * FROM special_event_document_versions WHERE document_id=?').get(uploaded.document_id);assert(version.storage_key.startsWith('private/special-events/'));
response=await specialEventDocumentDownload(new Request(`https://example.test/api/admin/special-event-documents/download?version=${version.id}`),env,new URL(`https://example.test/api/admin/special-event-documents/download?version=${version.id}`));
assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(await response.text(),'private fixture');
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
console.log('PASS isolated Special Events purchase, PAID idempotency, EXPIRED/FAILED release, private evidence version and download');
