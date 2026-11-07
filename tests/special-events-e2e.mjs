import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {
  createSpecialEventReservation,
  applySpecialEventCheckoutState,
  verifySpecialEventCheckout,
  adminSpecialEvents,
  verifySpecialEventPassword,
  specialEventDocumentUpload,
  specialEventDocumentDownload,
  processSpecialEventConfirmations,
  sendSpecialEventConfirmationDeliveryTest,
  specialEventMediaMultipartStart,
  specialEventMediaMultipartPart,
  specialEventMediaMultipartComplete,
  specialEventMedia,
  publicSpecialEvents,
  specialEventConfirmationCopy
} from '../special-events.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE);');
db.exec(readFileSync(new URL('../migrations/0032_special_events.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0033_johnny_programme_times.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0034_johnny_owner_decisions.sql',import.meta.url),'utf8'));
const prepare=(sql,params=[])=>({sql,params,bind(...values){return prepare(sql,values)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {success:true,meta:db.prepare(sql).run(...params)}}});
const objects=new Map(),uploads=new Map();
const env={ADMIN_EMAIL:'owner@example.test',SUMUP_MERCHANT_CODE:'LOCAL_ONLY',BOOKINGS_DB:{prepare,async batch(items){db.exec('BEGIN');try{const result=items.map(item=>({success:true,meta:db.prepare(item.sql).run(...item.params)}));db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}},MEDIA_BUCKET:{async put(key,body,options){objects.set(key,{body:new Uint8Array(body),options})},async get(key,options={}){const value=objects.get(key);if(!value)return null;const range=options.range;if(!range)return {body:value.body};return {body:value.body.slice(range.offset,range.offset+range.length)}},async delete(key){objects.delete(key)},async createMultipartUpload(key,options){const uploadId=`upload-${uploads.size+1}`;uploads.set(uploadId,{key,options,parts:new Map()});return {uploadId}},resumeMultipartUpload(key,uploadId){const upload=uploads.get(uploadId);if(!upload||upload.key!==key)throw new Error('upload missing');return {async uploadPart(partNumber,bytes){upload.parts.set(partNumber,new Uint8Array(bytes));return {partNumber,etag:`etag-${partNumber}`}},async complete(parts){const combined=parts.sort((a,b)=>a.partNumber-b.partNumber).flatMap(part=>[...upload.parts.get(part.partNumber)]);objects.set(key,{body:new Uint8Array(combined),options:upload.options});uploads.delete(uploadId)}}}}};
const customer={id:'special-customer'};
db.prepare('INSERT INTO customers(id,name,email) VALUES(?,?,?)').run(customer.id,'Isolated Tester','isolated@example.test');
db.exec(`INSERT INTO special_event_access_credentials(id,event_id,product_id,password_salt,password_hash,configured_by)
    VALUES('isolated-credential','special-event-johnny-rossato-2027','johnny-loyalty-weekend','00','00','isolated-test');
  UPDATE special_event_days SET capacity=20;
  UPDATE special_event_ticket_products SET allocation=20;
  UPDATE special_event_ticket_products SET release_state='ACTIVE' WHERE code='EARLY_BIRD_WEEKEND';
  UPDATE special_events SET artwork_url='/api/special-event-artwork?id=special-event-johnny-rossato-2027',saturday_evening_capacity=20,saturday_evening_capacity_confirmed=1,age_terms='Confirmed isolated fixture',age_terms_confirmed=1,refund_policy='Tickets are non-refundable except where a refund is required by law. Requests to transfer a ticket to another person may be considered at the organiser''s discretion and must be approved in advance. Tickets must not be resold or transferred without approval. If the event is cancelled or materially changed, any applicable refund rights will be honoured.',refund_policy_confirmed=1,public_presentation_approved=1,payment_integration_verified=1,production_installation_verified=1;
  UPDATE special_events SET status='PUBLISHED',publication_enabled=1,checkout_enabled=1;`);
let resolvedIdentityInput=null;
const services={resolveCustomerIdentity:async(_env,input)=>{resolvedIdentityInput=input;return customer},sumUpFetch:async()=>new Response(JSON.stringify({id:'isolated-checkout',hosted_checkout_url:'https://pay.example.test/special'}),{status:201,headers:{'content-type':'application/json'}})};
let passwordResponse=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CONFIGURE_ACCESS_PASSWORD',product_id:'johnny-loyalty-weekend',password:'IsolatedLoyaltyPassword'})}),env,{email:'owner@example.test'});assert.equal(passwordResponse.status,200);assert.equal(await verifySpecialEventPassword(env.BOOKINGS_DB,'johnny-loyalty-weekend','isolatedloyaltypassword'),true);assert.equal(await verifySpecialEventPassword(env.BOOKINGS_DB,'johnny-loyalty-weekend','wrong-password'),false);
const body={slug:'johnny-rossato',product_code:'EARLY_BIRD_WEEKEND',name:'Isolated Tester',email:'isolated@example.test',phone:'07000000000',quantity:2,attendees:[{name:'Adult One',age:28},{name:'Adult Two',age:31}],terms_accepted:true,idempotency_key:'isolated-special-booking'};
let response=await createSpecialEventReservation(new Request('https://example.test/api/special-event-reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env,services);
assert.equal(response.status,201,await response.clone().text());
assert.equal(resolvedIdentityInput.source,'BOOKING','public Special Event guests must use the production identity source accepted by customer_email_identities');
assert.equal(resolvedIdentityInput.email,'isolated@example.test');
const booking=db.prepare("SELECT * FROM special_event_bookings WHERE reference LIKE 'BSE-%'").get();
assert.equal(booking.status,'PENDING');assert.equal(booking.amount_pence,8000);assert.equal(db.prepare("SELECT SUM(places) n FROM special_event_booking_days WHERE booking_id=?").get(booking.id).n,4);
await applySpecialEventCheckoutState(env,booking,{status:'PAID',transaction_id:'isolated-transaction'});
await applySpecialEventCheckoutState(env,booking,{status:'PAID',transaction_id:'isolated-transaction'});
assert.equal(db.prepare('SELECT status FROM special_event_bookings WHERE id=?').get(booking.id).status,'PAID');
assert.equal(db.prepare('SELECT COUNT(*) n FROM special_event_attendees WHERE booking_id=?').get(booking.id).n,2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM special_event_confirmation_outbox WHERE booking_id=?').get(booking.id).n,1);
const reconciliationWorkerSource=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
assert.match(reconciliationWorkerSource,/reconcilePendingSpecialEventBookings/,'HQ must expose authoritative pending-payment reconciliation');
assert.match(reconciliationWorkerSource,/reconcileSpecialEventReturn/,'the customer return path must recover a missed webhook');
assert.match(reconciliationWorkerSource,/SUMUP_SPECIAL_EVENTS_API_KEY/,'Special Event reconciliation must use the dedicated SumUp credential');
assert.match(reconciliationWorkerSource,/APPROVED_OWNER_TEST_REFUNDS = new Map/,'owner-test refunds must be locked to the approved references');
assert.match(reconciliationWorkerSource,/OWNER_TEST_REFUND_UNCONFIRMED/,'an uncertain SumUp refund must stop before admission cancellation');
assert.match(reconciliationWorkerSource,/special-event-owner-test-refund/,'owner-test refunds must require the protected HQ endpoint');
const reconciliationRanchSource=readFileSync(new URL('../ranch.js',import.meta.url),'utf8');
assert.match(reconciliationRanchSource,/special-event-reconcile-pending/,'HQ must call the protected reconciliation endpoint');
response=await publicSpecialEvents(new Request('https://example.test/api/special-events?slug=johnny-rossato'),env,new URL('https://example.test/api/special-events?slug=johnny-rossato'));
assert.equal(response.status,200);let publicEvent=await response.json();const publicProduct=publicEvent.ticket_products.find(product=>product.code==='EARLY_BIRD_WEEKEND');
assert.equal(publicProduct.availability_status,'AVAILABLE');for(const field of ['allocation','sold_count','remaining'])assert.equal(field in publicProduct,false,`public product must not expose ${field}`);
assert.equal('capacity' in publicEvent.days[0],false,'public event days must not expose capacity');
db.prepare(`UPDATE special_event_ticket_products SET allocation=2 WHERE code='EARLY_BIRD_WEEKEND'`).run();
response=await publicSpecialEvents(new Request('https://example.test/api/special-events?slug=johnny-rossato'),env,new URL('https://example.test/api/special-events?slug=johnny-rossato'));publicEvent=await response.json();assert.equal(publicEvent.ticket_products.find(product=>product.code==='EARLY_BIRD_WEEKEND').availability_status,'SOLD_OUT');
db.prepare(`UPDATE special_event_ticket_products SET allocation=20 WHERE code='EARLY_BIRD_WEEKEND'`).run();
db.prepare(`UPDATE special_event_days SET capacity=2`).run();response=await publicSpecialEvents(new Request('https://example.test/api/special-events?slug=johnny-rossato'),env,new URL('https://example.test/api/special-events?slug=johnny-rossato'));publicEvent=await response.json();assert.equal(publicEvent.ticket_products.find(product=>product.code==='EARLY_BIRD_WEEKEND').availability_status,'SOLD_OUT','genuinely full shared day capacity must report SOLD OUT');db.prepare(`UPDATE special_event_days SET capacity=20`).run();
const allocationRequest=value=>adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'UPDATE_ALLOCATION',product_id:'johnny-early-weekend',allocation:value,reason:`Isolated allocation ${value}`})}),env,{email:'owner@example.test'});
response=await allocationRequest(25);assert.equal(response.status,200,await response.clone().text());assert.equal(db.prepare(`SELECT allocation FROM special_event_ticket_products WHERE id='johnny-early-weekend'`).get().allocation,25);assert.equal(db.prepare(`SELECT price_pence FROM special_event_ticket_products WHERE id='johnny-early-weekend'`).get().price_pence,4000,'allocation-only edits must not change price');
response=await allocationRequest(1);assert.equal(response.status,409,'allocation cannot undercut paid admissions');assert.equal(db.prepare(`SELECT allocation FROM special_event_ticket_products WHERE id='johnny-early-weekend'`).get().allocation,25);
const simultaneous=await Promise.all([allocationRequest(30),allocationRequest(31)]);assert.deepEqual(simultaneous.map(item=>item.status).sort(),[200,409],'concurrent allocation edits must have one winner');
assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_activity WHERE action='TICKET_ALLOCATION_UPDATED'`).get().n,2,'successful allocation edits must be audited exactly once');
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'QUEUE_BOOKING_CONFIRMATION',booking_id:booking.id,confirmation:'QUEUE CONFIRMATION'})}),env,{email:'owner@example.test'});assert.equal(response.status,200);
env.SPECIAL_EVENT_EMAILS_ENABLED='true';const delivered=[];let delivery=await processSpecialEventConfirmations(env,async(to,subject,html,text)=>{delivered.push({to,subject,html,text});return {id:'email-fixture'}});assert.deepEqual(delivery,{processed:1,sent:1,failed:0});assert.equal(delivered.length,1);assert.equal(delivered[0].subject,"Your Booking Confirmation 🤠 | Johnny Rossato's UK Debut");assert.match(delivered[0].html,/Johnny Rossato — His UK Debut/);assert.match(delivered[0].html,/Saturday 20 February 2027 &amp; Sunday 21 February 2027/);assert.match(delivered[0].html,/Early Bird Weekend Pass/);assert.match(delivered[0].html,/Admission includes:/);assert.match(delivered[0].html,/Payment:<\/strong> Confirmed/);assert.match(delivered[0].html,/bookings@bootscootinlinedancing\.co\.uk/);assert.match(delivered[0].html,/You're officially booked for Johnny Rossato's UK debut/);assert.match(delivered[0].html,/Nora Godollei/);assert.match(delivered[0].html,/Good Boots\. Great Moves\. Even Better Memories/);assert.match(delivered[0].html,/View the event page/);assert.doesNotMatch(delivered[0].html,/Weekend programme|Registration is 7:00|competition runs 7:30/);assert.doesNotMatch(delivered[0].text,/Weekend programme|Registration is 7:00|competition runs 7:30/);assert.equal(db.prepare('SELECT status FROM special_event_confirmation_outbox WHERE booking_id=?').get(booking.id).status,'SENT');delivery=await processSpecialEventConfirmations(env,async()=>{throw new Error('duplicate')});assert.equal(delivery.processed,0,'successful confirmation must be exactly once');env.SPECIAL_EVENT_EMAILS_ENABLED='false';
const recoveryReferences=[booking.reference];
for(let index=1;index<=5;index+=1){const id=`recovery-booking-${index}`,reference=`RECOVERY-${index}`;recoveryReferences.push(reference);db.prepare(`INSERT INTO special_event_bookings(id,reference,event_id,product_id,customer_id,customer_name,customer_email,quantity,product_code_snapshot,product_name_snapshot,unit_price_pence_snapshot,amount_pence,status,payment_provider,secure_token,customer_token,terms_accepted_at,paid_at) VALUES(?,?,'special-event-johnny-rossato-2027','johnny-early-weekend',?,'Recovery Customer','recovery@example.test',1,'EARLY_BIRD_WEEKEND','Early Bird Weekend Pass',4000,4000,'PAID','SUMUP',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(id,reference,customer.id,`secure-${index}`,`customer-${index}`);db.prepare(`INSERT INTO special_event_confirmation_outbox(id,booking_id,status,idempotency_key,recipient_email,subject) VALUES(?,?,'DISABLED',?,'recovery@example.test','fixture')`).run(`recovery-outbox-${index}`,id,`special-event-paid:${id}`);}
env.SPECIAL_EVENT_EMAILS_ENABLED='true';const recovered=[];response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'RECOVER_PAID_CUSTOMER_CONFIRMATIONS',confirmation:'SEND SIX VERIFIED CONFIRMATIONS',references:recoveryReferences})}),env,{email:'owner@example.test'},{sendEmail:async(to,_subject,_html,_text,options)=>{recovered.push({to,key:options.idempotencyKey});return {id:`provider-${recovered.length}`}}});assert.equal(response.status,200,await response.clone().text());const recoveryResult=await response.json();assert.equal(recoveryResult.results.length,6);assert.equal(recovered.length,5,'already-sent confirmation must not be duplicated');assert.equal(new Set(recovered.map(item=>item.key)).size,5,'each recovery send must use a distinct booking idempotency key');response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'RECOVER_PAID_CUSTOMER_CONFIRMATIONS',confirmation:'SEND SIX VERIFIED CONFIRMATIONS',references:recoveryReferences})}),env,{email:'owner@example.test'},{sendEmail:async()=>{throw new Error('duplicate recovery send')}});assert.equal(response.status,200);assert.equal(recovered.length,5);for(let index=1;index<=5;index+=1){db.prepare('DELETE FROM special_event_confirmation_outbox WHERE booking_id=?').run(`recovery-booking-${index}`);db.prepare('DELETE FROM special_event_bookings WHERE id=?').run(`recovery-booking-${index}`);}env.SPECIAL_EVENT_EMAILS_ENABLED='false';
const saturdayOnlyCopy=specialEventConfirmationCopy({booking:{customer_name:'Saturday Guest',reference:'TEST-SATURDAY',product_name_snapshot:'Saturday Social & Spectator',product_description:'Saturday evening admission',quantity:1,amount_pence:1500},event:{venue_name:'Low Places Bar',venue_address:'Digbeth, Birmingham'},days:[{label:'Saturday',event_date:'2027-02-20'}],attendees:[{name:'Saturday Guest',age_at_event:18}],programme:[{title:'Must not appear',starts_at:'2027-02-20T10:00:00'}]});assert.match(saturdayOnlyCopy.html,/Saturday 20 February 2027/);assert.doesNotMatch(saturdayOnlyCopy.html,/Sunday 21 February 2027|Must not appear/,'single-day ticket confirmation must show only its booked date and no timetable');

const protectedCountsBefore={
  customers:db.prepare('SELECT COUNT(*) n FROM customers').get().n,
  bookings:db.prepare('SELECT COUNT(*) n FROM special_event_bookings').get().n,
  holds:db.prepare('SELECT COUNT(*) n FROM special_event_holds').get().n,
  outbox:db.prepare('SELECT COUNT(*) n FROM special_event_confirmation_outbox').get().n
};
env.SPECIAL_EVENT_CONFIRMATION_TEST_ENABLED='true';
env.SPECIAL_EVENT_CONFIRMATION_TEST_RECIPIENT='nora@bootscootinlinedancing.co.uk';
const testDeliveries=[];
const confirmationTestRequest=(confirmation='SEND ONE SPECIAL EVENT TEST')=>new Request('https://example.test/api/admin/special-event-confirmation-delivery-test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation})});
response=await sendSpecialEventConfirmationDeliveryTest(confirmationTestRequest(),env,{email:'owner@example.test'},async(to,subject,html,text,options)=>{testDeliveries.push({to,subject,html,text,options});throw new Error('isolated provider timeout after request');});
assert.equal(response.status,502,await response.clone().text());
assert.equal(testDeliveries.length,1);
assert.equal(testDeliveries[0].to,'nora@bootscootinlinedancing.co.uk');
assert.match(testDeliveries[0].subject,/^TEST — /);
assert.match(testDeliveries[0].html,/No booking, ticket, payment or inventory hold has been created/);
assert.match(testDeliveries[0].text,/No booking, ticket, payment or inventory hold has been created/);
assert.match(testDeliveries[0].options.idempotencyKey,/special-event-confirmation-test/);
assert.deepEqual({
  customers:db.prepare('SELECT COUNT(*) n FROM customers').get().n,
  bookings:db.prepare('SELECT COUNT(*) n FROM special_event_bookings').get().n,
  holds:db.prepare('SELECT COUNT(*) n FROM special_event_holds').get().n,
  outbox:db.prepare('SELECT COUNT(*) n FROM special_event_confirmation_outbox').get().n
},protectedCountsBefore,'synthetic delivery must not mutate customers, bookings, holds or booking outbox');
assert.equal(db.prepare("SELECT COUNT(*) n FROM special_event_activity WHERE action='CONFIRMATION_DELIVERY_TEST_CLAIMED'").get().n,1);
assert.equal(db.prepare("SELECT COUNT(*) n FROM special_event_activity WHERE action='CONFIRMATION_DELIVERY_TEST_UNCONFIRMED'").get().n,1);
response=await sendSpecialEventConfirmationDeliveryTest(confirmationTestRequest('RETRY ONE SPECIAL EVENT TEST'),env,{email:'owner@example.test'},async(to,subject,html,text,options)=>{testDeliveries.push({to,subject,html,text,options});return {id:'owner-test-fixture'}});
assert.equal(response.status,200,await response.clone().text());
assert.equal(testDeliveries.length,2);
assert.equal(testDeliveries[1].options.idempotencyKey,testDeliveries[0].options.idempotencyKey,'timeout retry must reuse the exact provider idempotency key');
assert.equal(db.prepare("SELECT COUNT(*) n FROM special_event_activity WHERE action='CONFIRMATION_DELIVERY_TEST_RETRY_CLAIMED'").get().n,1);
assert.equal(db.prepare("SELECT COUNT(*) n FROM special_event_activity WHERE action='CONFIRMATION_DELIVERY_TEST_SENT'").get().n,1);
response=await sendSpecialEventConfirmationDeliveryTest(confirmationTestRequest(),env,{email:'owner@example.test'},async()=>{throw new Error('duplicate delivery must not run')});
assert.equal(response.status,200,'a completed test must return its idempotent sent state');
assert.equal((await response.json()).idempotent,true);
assert.equal(testDeliveries.length,2);
env.SPECIAL_EVENT_CONFIRMATION_TEST_ENABLED='false';

const videoBytes=new TextEncoder().encode('\0\0\0\u0018ftypisom\0\0\0\0moov avc1 browser-compatible video mp4a browser-compatible audio mdat');
const videoPartSha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',videoBytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
response=await specialEventMediaMultipartStart(new Request('https://example.test/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:'special-event-johnny-rossato-2027',media_type:'PROMO_VIDEO',name:'owner-video.mov',type:'video/quicktime',size:videoBytes.length,title:'Owner MOV fixture'})}),env,{email:'owner@example.test'});assert.equal(response.status,415,'MOV uploads must be rejected before storage because Safari playback requires a web-ready MP4');
response=await specialEventMediaMultipartStart(new Request('https://example.test/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:'special-event-johnny-rossato-2027',media_type:'PROMO_VIDEO',name:'owner-video.mp4',type:'video/mp4',size:videoBytes.length,title:'Owner MP4 fixture'})}),env,{email:'owner@example.test'});assert.equal(response.status,201,await response.clone().text());const videoStart=await response.json();
response=await specialEventMediaMultipartPart(new Request('https://example.test/part',{method:'POST',headers:{'X-Special-Upload-Id':videoStart.upload_id,'X-Part-Number':'1','X-Part-SHA256':videoPartSha},body:videoBytes}),env,{email:'owner@example.test'});assert.equal(response.status,200);const videoPart=(await response.json()).part;
response=await specialEventMediaMultipartComplete(new Request('https://example.test/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({upload_id:videoStart.upload_id,parts:[videoPart]})}),env,{email:'owner@example.test'});assert.equal(response.status,201,await response.clone().text());assert.deepEqual((await response.clone().json()).verified_codecs,['H264','AAC']);assert.equal((await response.clone().json()).fast_start,true);assert.equal(db.prepare("SELECT content_type FROM special_event_media WHERE media_type='PROMO_VIDEO' AND active=1").get().content_type,'video/mp4');
const videoUrl=new URL('https://example.test/api/special-event-media?id=special-event-johnny-rossato-2027&type=PROMO_VIDEO');
response=await specialEventMedia(new Request(videoUrl,{headers:{Range:'bytes=-8','Cf-Access-Authenticated-User-Email':'owner@example.test'}}),env,videoUrl);
assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${videoBytes.length-8}-${videoBytes.length-1}/${videoBytes.length}`);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),videoBytes.slice(-8),'Safari suffix ranges must return the tail of the MOV so metadata can load');
response=await specialEventMedia(new Request(videoUrl,{headers:{Range:'bytes=2-5','Cf-Access-Authenticated-User-Email':'owner@example.test'}}),env,videoUrl);
assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 2-5/${videoBytes.length}`);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),videoBytes.slice(2,6));

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
assert.match(ranchSource,/protectedSpecialEventMediaUrl\(event\.promo_video_url\)/,'HQ must use its Access-protected Draft media route');
const eventPageSource=readFileSync(new URL('../special-event-page.js',import.meta.url),'utf8');
assert.match(eventPageSource,/\/ranch\/api\/admin\/special-event-media\?/,'Draft preview must use its Access-protected media route');
const workerSource=readFileSync(new URL('../_worker.js',import.meta.url),'utf8').replace(/^import .*special-events\.js';\s*/m,'');
const specialSource=readFileSync(new URL('../special-events.js',import.meta.url),'utf8').replace(/^export /gm,'');
const worker=await import(`data:text/javascript;base64,${Buffer.from(`${specialSource}\n${workerSource}`).toString('base64')}`);
response=await worker.default.fetch(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'UPDATE_ALLOCATION',product_id:'johnny-early-weekend',allocation:40,reason:'Unauthorised fixture'})}),env,{waitUntil(){}});assert.equal(response.status,401,'allocation management must remain owner-only');
const hqDownloadUrl=`https://example.test/api/admin${generatedLink[1]}${encodeURIComponent(version.id)}`;
response=await worker.default.fetch(new Request(hqDownloadUrl,{headers:{'Cf-Access-Authenticated-User-Email':'owner@example.test'}}),env,{waitUntil(){}});
assert.equal(response.status,200,await response.clone().text());
assert.equal(response.headers.get('cache-control'),'private, no-store');
assert.equal(await response.text(),'private fixture');
response=await worker.default.fetch(new Request(hqDownloadUrl),env,{waitUntil(){}});
assert.equal(response.status,401,'unauthorised users must not download private evidence');
const protectedVideoUrl='https://example.test/ranch/api/admin/special-event-media?id=special-event-johnny-rossato-2027&type=PROMO_VIDEO';
response=await worker.default.fetch(new Request(protectedVideoUrl,{headers:{'Cf-Access-Authenticated-User-Email':'owner@example.test'}}),env,{waitUntil(){}});
assert.equal(response.status,200);assert.equal(Number(response.headers.get('content-length')),videoBytes.length);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),videoBytes);
response=await worker.default.fetch(new Request(protectedVideoUrl,{headers:{Range:'bytes=2-5','Cf-Access-Authenticated-User-Email':'owner@example.test'}}),env,{waitUntil(){}});
assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 2-5/${videoBytes.length}`);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),videoBytes.slice(2,6));
response=await worker.default.fetch(new Request(protectedVideoUrl,{headers:{Range:'bytes=4-','Cf-Access-Authenticated-User-Email':'owner@example.test'}}),env,{waitUntil(){}});
assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 4-${videoBytes.length-1}/${videoBytes.length}`);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),videoBytes.slice(4));
response=await worker.default.fetch(new Request(protectedVideoUrl,{headers:{Range:'bytes=-8','Cf-Access-Authenticated-User-Email':'owner@example.test'}}),env,{waitUntil(){}});
assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${videoBytes.length-8}-${videoBytes.length-1}/${videoBytes.length}`);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),videoBytes.slice(-8));
response=await worker.default.fetch(new Request(protectedVideoUrl),env,{waitUntil(){}});
assert.equal(response.status,401,'unauthorised users must not read Draft event media');
response=await worker.default.fetch(new Request('https://example.test/api/admin/special-event-media/multipart/start',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env,{waitUntil(){}});
assert.equal(response.status,401,'unauthorised users must not start a private Special Event media upload');

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
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(complimentaryPayload)}),env,{email:'owner@example.test'});assert.equal(response.status,409,'duplicate active complimentary admission must be rejected');
assert.equal(db.prepare(`SELECT contact_email FROM special_event_competition_entries WHERE booking_id=?`).get(complimentary.id).contact_email,'complimentary@example.test');
assert.equal(db.prepare(`SELECT status FROM special_event_confirmation_outbox WHERE booking_id=?`).get(complimentary.id).status,'DISABLED');
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'PREVIEW_COMPETITOR_MESSAGE',subject:'Competition update',body_text:'Operational fixture only.'})}),env,{email:'owner@example.test'});assert.equal(response.status,200);assert.equal((await response.json()).recipient_count,1);
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'SEND_COMPETITOR_MESSAGE',subject:'Competition update',body_text:'Operational fixture only.',confirmation:'EMAIL ALL COMPETITORS'})}),env,{email:'owner@example.test'},{sendEmail:async()=>({id:'must-not-send'})});assert.equal(response.status,409,'staging must block outbound competitor email');
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
const juniorPayload={action:'ISSUE_COMPLIMENTARY_TICKETS',product_id:'johnny-junior-saturday',recipient_name:'Junior Guardian',recipient_email:'guardian@example.test',quantity:1,reason:'Junior isolated fixture',attendees:[{name:'Junior Dancer',age:15,guardian_name:'Junior Guardian',guardian_email:'guardian@example.test',guardian_phone:'07000000001'}],competition_attendee_indexes:[0]};
response=await adminSpecialEvents(new Request('https://example.test/api/admin/special-events?id=special-event-johnny-rossato-2027',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(juniorPayload)}),env,{email:'owner@example.test'});assert.equal(response.status,201,await response.clone().text());const juniorResult=await response.json();assert.equal(db.prepare(`SELECT age_at_event FROM special_event_attendees WHERE booking_id=?`).get(juniorResult.booking_id).age_at_event,15);
assert.deepEqual({...db.prepare(`SELECT contact_email,contact_phone,contact_is_guardian FROM special_event_competition_entries WHERE booking_id=?`).get(juniorResult.booking_id)},{contact_email:'guardian@example.test',contact_phone:'07000000001',contact_is_guardian:1});
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
db.exec(`UPDATE special_events SET status='DRAFT',publication_enabled=0,checkout_enabled=0,refund_policy_confirmed=0,public_presentation_approved=0,payment_integration_verified=0,production_installation_verified=0 WHERE id='special-event-johnny-rossato-2027'`);
const ownerTestBody={slug:'johnny-rossato',product_code:'SATURDAY_SOCIAL',name:'Nora — Owner Payment Test',email:'nora@bootscootinlinedancing.co.uk',phone:'',quantity:1,terms_accepted:true,attendees:[{name:'Nora — Owner Payment Test',age:18}],idempotency_key:'johnny-owner-payment-test-v1'};
const ownerTestServices={resolveCustomerIdentity:async()=>customer,sumUpFetch:async(_env,_path,options)=>{const payload=JSON.parse(options.body);assert.equal(payload.amount,15);assert.match(payload.redirect_url,/\/ranch\?special-event-payment-test=1$/);return new Response(JSON.stringify({id:'owner-test-checkout',hosted_checkout_url:'https://pay.example.test/owner-test'}),{status:201,headers:{'content-type':'application/json'}})}};
response=await createSpecialEventReservation(new Request('https://example.test/api/special-event-reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(ownerTestBody)}),env,ownerTestServices);
assert.equal(response.status,404,'the ordinary public route must remain closed while the event is Draft');
db.exec(`UPDATE special_events SET age_terms_confirmed=0 WHERE id='special-event-johnny-rossato-2027'`);response=await createSpecialEventReservation(new Request('https://example.test/ranch/api/admin/special-event-owner-payment-test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(ownerTestBody)}),env,ownerTestServices,{ownerPaymentTest:true,actor:'owner@example.test'});assert.equal(response.status,409,'the owner test must retain operational safety gates');db.exec(`UPDATE special_events SET age_terms_confirmed=1 WHERE id='special-event-johnny-rossato-2027'`);
response=await createSpecialEventReservation(new Request('https://example.test/ranch/api/admin/special-event-owner-payment-test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(ownerTestBody)}),env,ownerTestServices,{ownerPaymentTest:true,actor:'owner@example.test'});
assert.equal(response.status,201,await response.clone().text());const ownerTestResult=await response.json();assert.equal(ownerTestResult.owner_payment_test,true);assert.equal(ownerTestResult.checkout_url,'https://pay.example.test/owner-test');
const ownerTestBooking=db.prepare(`SELECT * FROM special_event_bookings WHERE provider_checkout_id='owner-test-checkout'`).get();assert.equal(ownerTestBooking.amount_pence,1500);assert.equal(ownerTestBooking.product_code_snapshot,'SATURDAY_SOCIAL');
const authoritativeOwnerCheckout={id:'owner-test-checkout',checkout_reference:ownerTestBooking.reference,amount:15,currency:'GBP',merchant_code:'LOCAL_ONLY',status:'PAID',transaction_id:'owner-test-transaction'};
assert.deepEqual(verifySpecialEventCheckout(ownerTestBooking,authoritativeOwnerCheckout,'LOCAL_ONLY'),{ok:true,status:'PAID'});
assert.equal(verifySpecialEventCheckout(ownerTestBooking,{...authoritativeOwnerCheckout,amount:15.01},'LOCAL_ONLY').code,'CHECKOUT_AMOUNT_MISMATCH');
assert.equal(verifySpecialEventCheckout(ownerTestBooking,{...authoritativeOwnerCheckout,merchant_code:'WRONG'},'LOCAL_ONLY').code,'CHECKOUT_MERCHANT_MISMATCH');
assert.deepEqual({...db.prepare(`SELECT status,publication_enabled,checkout_enabled FROM special_events WHERE id='special-event-johnny-rossato-2027'`).get()},{status:'DRAFT',publication_enabled:0,checkout_enabled:0},'owner test must not publish or enable public checkout');
assert.deepEqual({...db.prepare(`SELECT refund_policy_confirmed,public_presentation_approved,payment_integration_verified,production_installation_verified FROM special_events WHERE id='special-event-johnny-rossato-2027'`).get()},{refund_policy_confirmed:0,public_presentation_approved:0,payment_integration_verified:0,production_installation_verified:0},'owner test must not alter or bypass the public release gates');
assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_activity WHERE action='OWNER_PAYMENT_TEST_CREATED' AND target_id=?`).get(ownerTestBooking.id).n,1);
await applySpecialEventCheckoutState(env,ownerTestBooking,authoritativeOwnerCheckout);await applySpecialEventCheckoutState(env,ownerTestBooking,authoritativeOwnerCheckout);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_attendees WHERE booking_id=?`).get(ownerTestBooking.id).n,1,'duplicate payment notifications must create one attendee');
assert.equal(db.prepare(`SELECT COUNT(*) n FROM special_event_confirmation_outbox WHERE booking_id=?`).get(ownerTestBooking.id).n,1,'duplicate payment notifications must create one confirmation');
const ownerDeliveries=[];env.ADMIN_EMAIL='owner@example.test';env.SPECIAL_EVENT_EMAILS_ENABLED='false';delivery=await processSpecialEventConfirmations(env,async(to,_subject,_html,_text,options)=>{ownerDeliveries.push({to,options});return {id:'owner-payment-email'}});assert.deepEqual(delivery,{processed:1,sent:1,failed:0});assert.equal(ownerDeliveries.length,1);assert.equal(ownerDeliveries[0].to,'nora@bootscootinlinedancing.co.uk');
delivery=await processSpecialEventConfirmations(env,async()=>{throw new Error('duplicate owner test email')});assert.equal(delivery.processed,0,'owner payment confirmation must be exactly once');
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
console.log('PASS isolated Special Events purchase, owner-only Draft £15 checkout, simultaneous launch, complimentary capacity/competition/QR/cancellation, payment and email idempotency, failure release, private evidence and unauthorised rejection');
