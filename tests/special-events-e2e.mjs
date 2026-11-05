import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {
  createSpecialEventReservation,
  applySpecialEventCheckoutState,
  adminSpecialEvents,
  verifySpecialEventPassword,
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
  UPDATE special_events SET artwork_url='/api/special-event-artwork?id=special-event-johnny-rossato-2027',saturday_evening_capacity=20,saturday_evening_capacity_confirmed=1,age_terms='Confirmed isolated fixture',age_terms_confirmed=1,refund_policy='Confirmed isolated fixture',refund_policy_confirmed=1,public_presentation_approved=1,payment_integration_verified=1,production_installation_verified=1;
  UPDATE special_events SET status='PUBLISHED',publication_enabled=1,checkout_enabled=1;`);
const services={resolveCustomerIdentity:async()=>customer,sumUpFetch:async()=>new Response(JSON.stringify({id:'isolated-checkout',hosted_checkout_url:'https://pay.example.test/special'}),{status:201,headers:{'content-type':'application/json'}})};
let passwordResponse=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CONFIGURE_ACCESS_PASSWORD',product_id:'johnny-loyalty-weekend',password:'IsolatedLoyaltyPassword'})}),env,{email:'owner@example.test'});assert.equal(passwordResponse.status,200);assert.equal(await verifySpecialEventPassword(env.BOOKINGS_DB,'johnny-loyalty-weekend','isolatedloyaltypassword'),true);assert.equal(await verifySpecialEventPassword(env.BOOKINGS_DB,'johnny-loyalty-weekend','wrong-password'),false);
const body={slug:'johnny-rossato',product_code:'EARLY_BIRD_WEEKEND',name:'Isolated Tester',email:'isolated@example.test',phone:'07000000000',quantity:2,attendees:[{name:'Adult One',age:28},{name:'Adult Two',age:31}],terms_accepted:true,idempotency_key:'isolated-special-booking'};
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
response=await createSpecialEventReservation(new Request('https://example.test/api/special-event-reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,quantity:1,attendees:body.attendees.slice(0,1),idempotency_key:'isolated-expiry'})}),env,services);
assert.equal(response.status,201);const expiring=db.prepare("SELECT * FROM special_event_bookings WHERE provider_checkout_id='expired-checkout'").get();
await applySpecialEventCheckoutState(env,expiring,{status:'EXPIRED'});
assert.equal(db.prepare('SELECT status FROM special_event_bookings WHERE id=?').get(expiring.id).status,'FAILED');
assert.equal(db.prepare('SELECT status FROM special_event_holds WHERE id=?').get(expiring.hold_id).status,'RELEASED');

services.sumUpFetch=async()=>new Response(JSON.stringify({error:'isolated provider failure'}),{status:502,headers:{'content-type':'application/json'}});
response=await createSpecialEventReservation(new Request('https://example.test/api/special-event-reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,quantity:1,attendees:body.attendees.slice(0,1),idempotency_key:'isolated-provider-failure'})}),env,services);
assert.equal(response.status,502);const failed=db.prepare("SELECT b.status,h.status hold_status FROM special_event_bookings b JOIN special_event_holds h ON h.id=b.hold_id WHERE h.idempotency_key='isolated-provider-failure'").get();
assert.equal(failed.status,'FAILED');assert.equal(failed.hold_status,'RELEASED');

const form=new FormData();form.set('event_id','special-event-johnny-rossato-2027');form.set('title','Private isolated evidence');form.set('category','CONTRACT');form.set('file',new File([new TextEncoder().encode('private fixture')],'fixture.pdf',{type:'application/pdf'}));
response=await specialEventDocumentUpload(new Request('https://example.test/api/admin/special-event-documents/upload',{method:'POST',body:form}),env,{email:'owner@example.test'});
assert.equal(response.status,201,await response.clone().text());const uploaded=await response.json();
const version=db.prepare('SELECT * FROM special_event_document_versions WHERE document_id=?').get(uploaded.document_id);assert(version.storage_key.startsWith('private/special-events/'));
response=await specialEventDocumentDownload(new Request(`https://example.test/api/admin/special-event-documents/download?version=${version.id}`),env,new URL(`https://example.test/api/admin/special-event-documents/download?version=${version.id}`));
assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(await response.text(),'private fixture');

const ranchSource=readFileSync(new URL('../ranch.js',import.meta.url),'utf8');
const generatedLink=ranchSource.match(/href="\$\{ADMIN_API_PREFIX\}(\/special-event-documents\/download\?version=)\$\{encodeURIComponent\(item\.current_version_id\)\}/);
assert(generatedLink,'HQ must generate the authoritative version parameter for private downloads');
const workerSource=readFileSync(new URL('../_worker.js',import.meta.url),'utf8').replace(/^import .*special-events\.js';\s*/m,'');
const specialSource=readFileSync(new URL('../special-events.js',import.meta.url),'utf8').replace(/^export /gm,'');
const worker=await import(`data:text/javascript;base64,${Buffer.from(`${specialSource}\n${workerSource}`).toString('base64')}`);
const hqDownloadUrl=`https://example.test/api/admin${generatedLink[1]}${encodeURIComponent(version.id)}`;
response=await worker.default.fetch(new Request(hqDownloadUrl,{headers:{'Cf-Access-Authenticated-User-Email':'owner@example.test'}}),env,{waitUntil(){}});
assert.equal(response.status,200,await response.clone().text());
assert.equal(response.headers.get('cache-control'),'private, no-store');
assert.equal(await response.text(),'private fixture');
response=await worker.default.fetch(new Request(hqDownloadUrl),env,{waitUntil(){}});
assert.equal(response.status,401,'unauthorised users must not download private evidence');

db.exec(`UPDATE special_events SET status='DRAFT',publication_enabled=0,checkout_enabled=0 WHERE id='special-event-johnny-rossato-2027'`);
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'OPEN_SALES',confirmation:'Johnny Rossato — His UK Debut'})}),env,{email:'owner@example.test'});
assert.equal(response.status,200,await response.clone().text());
assert.deepEqual({...db.prepare(`SELECT status,publication_enabled,checkout_enabled FROM special_events WHERE id='special-event-johnny-rossato-2027'`).get()},{status:'PUBLISHED',publication_enabled:1,checkout_enabled:1});
assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_ticket_products WHERE release_state='ACTIVE'`).get().n,10,'every configured ticket must open together');
assert.equal(db.prepare(`SELECT release_state FROM special_event_ticket_products WHERE code='STANDARD_WEEKEND'`).get().release_state,'ACTIVE');
assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_ticket_products WHERE password_required=1`).get().n,1);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_activity WHERE action='EVENT_AND_SALES_OPENED'`).get().n,1);
const complimentaryPayload={action:'ISSUE_COMPLIMENTARY_TICKETS',product_id:'johnny-standard-weekend',recipient_name:'Complimentary Recipient',recipient_email:'complimentary@example.test',quantity:2,reason:'Isolated services fixture',attendees:[{name:'Complimentary Adult One',age:35},{name:'Complimentary Adult Two',age:42}],competition_attendee_indexes:[0]};
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(complimentaryPayload)}),env,{email:'owner@example.test'});
assert.equal(response.status,201,await response.clone().text());const complimentaryResult=await response.json(),complimentary=db.prepare(`SELECT * FROM special_event_bookings WHERE id=?`).get(complimentaryResult.booking_id);
assert.equal(complimentary.payment_provider,'COMPLIMENTARY');assert.equal(complimentary.amount_pence,0);assert.equal(complimentary.status,'PAID');assert.equal(complimentary.issued_by,'owner@example.test');assert.equal(complimentary.provider_checkout_id,null);
assert.equal(db.prepare(`SELECT SUM(places) n FROM special_event_booking_days WHERE booking_id=?`).get(complimentary.id).n,4,'complimentary weekend passes must reserve both days');
assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_attendees WHERE booking_id=? AND status='ACTIVE'`).get(complimentary.id).n,2);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_competition_entries WHERE booking_id=?`).get(complimentary.id).n,1);
assert.equal(db.prepare(`SELECT status FROM special_event_confirmation_outbox WHERE booking_id=?`).get(complimentary.id).status,'DISABLED');
const compAttendee=db.prepare(`SELECT * FROM special_event_attendees WHERE booking_id=? ORDER BY ticket_number LIMIT 1`).get(complimentary.id);
response=await adminSpecialEvents(new Request(`https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027&verify_qr=${compAttendee.qr_token}`),env,{email:'owner@example.test'});assert.equal(response.status,200);assert.equal((await response.json()).valid,true);
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CHECK_IN_ATTENDEE',attendee_id:compAttendee.id,day_id:'johnny-2027-saturday',attended:true})}),env,{email:'owner@example.test'});assert.equal(response.status,200);
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CHECK_IN_ATTENDEE',attendee_id:compAttendee.id,day_id:'johnny-2027-saturday',attended:true})}),env,{email:'owner@example.test'});assert.equal(response.status,409,'duplicate check-in must be rejected');
assert.equal(db.prepare(`SELECT attended_at IS NOT NULL checked FROM special_event_attendance WHERE attendee_id=? AND day_id='johnny-2027-sunday'`).get(compAttendee.id).checked,0,'Saturday check-in must not mark Sunday attendance');
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CHECK_IN_ATTENDEE',attendee_id:compAttendee.id,day_id:'johnny-2027-saturday',attended:false})}),env,{email:'owner@example.test'});assert.equal(response.status,200,'owner must be able to reverse an accidental check-in');
assert.equal(db.prepare(`SELECT attended_at FROM special_event_attendance WHERE attendee_id=? AND day_id='johnny-2027-saturday'`).get(compAttendee.id).attended_at,null);assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_activity WHERE action='ATTENDEE_CHECK_IN_REVERSED'`).get().n,1);
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'UPDATE_SAFETY_SETTINGS',saturday_capacity:1,sunday_capacity:20,saturday_evening_capacity:20,saturday_evening_capacity_confirmed:true,age_terms:'fixture',age_terms_confirmed:true,refund_policy:'fixture',refund_policy_confirmed:true,payment_integration_verified:true,production_installation_verified:true})}),env,{email:'owner@example.test'});assert.equal(response.status,409,'capacity edits must not undercut paid, complimentary or actively held places');
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CANCEL_COMPLIMENTARY_TICKETS',booking_id:complimentary.id,reason:'Isolated cancellation fixture'})}),env,{email:'owner@example.test'});assert.equal(response.status,200);
assert.equal(db.prepare(`SELECT status FROM special_event_bookings WHERE id=?`).get(complimentary.id).status,'CANCELLED');assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_attendees WHERE booking_id=? AND status='CANCELLED'`).get(complimentary.id).n,2);
response=await adminSpecialEvents(new Request(`https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027&verify_qr=${compAttendee.qr_token}`),env,{email:'owner@example.test'});assert.equal((await response.json()).valid,false,'cancelled complimentary QR must be invalid');
const juniorPayload={action:'ISSUE_COMPLIMENTARY_TICKETS',product_id:'johnny-junior-saturday',recipient_name:'Junior Guardian',recipient_email:'guardian@example.test',quantity:1,reason:'Junior isolated fixture',attendees:[{name:'Junior Dancer',age:15,guardian_name:'Junior Guardian',guardian_email:'guardian@example.test',guardian_phone:'07000000001'}]};
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(juniorPayload)}),env,{email:'owner@example.test'});assert.equal(response.status,201,await response.clone().text());const juniorResult=await response.json();assert.equal(db.prepare(`SELECT age_at_event FROM special_event_attendees WHERE booking_id=?`).get(juniorResult.booking_id).age_at_event,15);
const socialPayload={action:'ISSUE_COMPLIMENTARY_TICKETS',product_id:'johnny-saturday-social',recipient_name:'Social Guest',recipient_email:'social@example.test',quantity:1,reason:'Social-only isolated fixture',attendees:[{name:'Social Guest',age:30}]};
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(socialPayload)}),env,{email:'owner@example.test'});assert.equal(response.status,201,await response.clone().text());const socialResult=await response.json();assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_booking_days WHERE booking_id=?`).get(socialResult.booking_id).n,1,'social-only admission must not gain Sunday access');
db.exec(`UPDATE special_event_ticket_products SET allocation=1 WHERE id='johnny-saturday-experience'`);
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...socialPayload,product_id:'johnny-saturday-experience',recipient_email:'allocation@example.test',quantity:2,attendees:[{name:'Allocation One',age:30},{name:'Allocation Two',age:31}]})}),env,{email:'owner@example.test'});assert.equal(response.status,409,'complimentary issuance must respect product allocation');
db.exec(`UPDATE special_event_days SET capacity=2 WHERE id='johnny-2027-sunday'`);
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...socialPayload,product_id:'johnny-sunday-workshop',recipient_email:'capacity@example.test'})}),env,{email:'owner@example.test'});assert.equal(response.status,409,'complimentary issuance must respect shared day capacity');
response=await worker.default.fetch(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(socialPayload)}),env,{waitUntil(){}});assert.equal(response.status,401,'unauthorised users must not issue complimentary tickets');
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027'),env,{email:'owner@example.test'});const adminReport=await response.json();assert.equal(Number(adminReport.reporting.paid_tickets),2);assert.equal(Number(adminReport.reporting.complimentary_tickets),2);assert.equal(Number(adminReport.reporting.paid_revenue_pence),8000);assert.equal(adminReport.loyalty_password_configured,true);
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CLOSE_SALES',confirmation:'CLOSE SALES'})}),env,{email:'owner@example.test'});
assert.equal(response.status,200,await response.clone().text());
assert.equal(db.prepare(`SELECT checkout_enabled FROM special_events WHERE id='special-event-johnny-rossato-2027'`).get().checkout_enabled,0);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_activity WHERE action='TICKET_SALES_CLOSED'`).get().n,1);
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
console.log('PASS isolated Special Events purchase, simultaneous launch, complimentary capacity/competition/QR/cancellation, payment idempotency, failure release, private evidence and unauthorised rejection');
