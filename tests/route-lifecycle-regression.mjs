import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const backup=process.argv[2];if(!backup)throw new Error('Supply a local SQL backup; never a remote database.');
const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const mod=await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {passwordHash,createMemberSession,createMemberEmailToken,memberSha256Hex,processBookingConfirmations,anniversaryInventory,applySumUpCheckoutState,cleanupExpiredUnreferencedBookingHolds};').toString('base64')}`);
let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS',name)};
function fixture({sumup=false}={}){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');db.exec(readFileSync(backup,'utf8'));db.exec('PRAGMA foreign_keys=ON');
  for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>/^00(19|20|21)_/.test(f)).sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const prepare=(sql,params=[])=>({sql,params,bind(...v){return prepare(sql,v)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {success:true,meta:db.prepare(sql).run(...params)}}});
  const env={ADMIN_EMAIL:'nora@bootscootinlinedancing.co.uk',RESEND_API_KEY:'LOCAL_ONLY',EMAIL_FROM:'Local <local@example.test>',EMAIL_FROM_BOOKINGS:'Local <local@example.test>',
    ...(sumup?{SUMUP_API_KEY:'LOCAL_SUMUP',SUMUP_MERCHANT_CODE:'LOCAL_MERCHANT'}:{}),BOOKINGS_DB:{prepare,async batch(items){db.exec('BEGIN');try{const out=items.map(s=>({success:true,meta:db.prepare(s.sql).run(...s.params)}));db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}}};
  const request=(path,body,options={})=>{const headers={'Content-Type':'application/json',Origin:'https://bootscootinlinedancing.co.uk',...(options.admin?{'Cf-Access-Authenticated-User-Email':env.ADMIN_EMAIL}:{}),...(options.headers||{})};return mod.default.fetch(new Request('https://bootscootinlinedancing.co.uk'+path,{method:body===undefined?'GET':options.method||'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{waitUntil(){}})};
  return {db,env,request};
}
const count=(db,table,where='1=1')=>db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${where}`).get().n;
function addClass(db,{id='route-class',price=600,capacity=4}={}){db.prepare(`INSERT INTO classes(id,title,starts_at,ends_at,capacity,price_pence,venue,location,status,sold) VALUES(?,?,'2030-06-01T18:30:00.000Z','2030-06-01T19:30:00.000Z',?,?,?,'Local test','open',0)`).run(id,'Route class',capacity,price,'Local venue');}
const bookingBody=id=>({name:'Route Tester',email:`${id}@example.test`,phone:'07000000000',classId:id,quantity:1,terms_accepted:true});

await test('ordinary paid booking route + webhook is atomic and duplicate-safe',async()=>{
  const f=fixture({sumup:true});addClass(f.db,{id:'paid-route'});let checkoutReads=0;
  globalThis.fetch=async(url,options={})=>{if(options.method==='POST')return new Response(JSON.stringify({id:'checkout-paid',hosted_checkout_url:'https://pay.example.test/checkout'}));checkoutReads++;return new Response(JSON.stringify({id:'checkout-paid',status:'PAID',transaction_id:'11111111-1111-4111-8111-111111111111'}));};
  let response=await f.request('/api/class-reservations',bookingBody('paid-route'));assert.equal(response.status,201,await response.clone().text());
  const b=f.db.prepare("SELECT * FROM bookings WHERE class_id='paid-route'").get();assert.equal(b.status,'PENDING');
  response=await f.request('/api/sumup-webhook',{id:'checkout-paid',event_type:'CHECKOUT_STATUS_CHANGED'});assert.equal(response.status,204);
  await f.request('/api/sumup-webhook',{id:'checkout-paid',event_type:'CHECKOUT_STATUS_CHANGED'});const paid=f.db.prepare('SELECT * FROM bookings WHERE id=?').get(b.id);
  assert.equal(paid.status,'PAID');assert.equal(count(f.db,'booking_confirmation_jobs'),1);assert.equal(count(f.db,'audit_log',"action='SUMUP_PAYMENT_CONFIRMED'"),1);assert.equal(checkoutReads,2);
  assert(f.db.prepare('SELECT expires_at FROM booking_holds WHERE id=?').get(b.hold_id).expires_at<'2030');assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

await test('payment transition rolls back at every batch boundary and a retry converges once',async()=>{
  for(let failAfter=0;failAfter<4;failAfter++){
    const f=fixture();addClass(f.db,{id:`crash-${failAfter}`});f.db.prepare("INSERT INTO booking_holds(id,class_id,quantity,expires_at) VALUES(?,?,1,'2030-06-01T19:00:00Z')").run(`crash-hold-${failAfter}`,`crash-${failAfter}`);
    f.db.prepare("INSERT INTO bookings(id,reference,class_id,hold_id,customer_name,customer_email,quantity,amount_pence,status,payment_provider,provider_checkout_id) VALUES(?,?,?,?, 'Crash Test','crash@example.test',1,600,'PENDING','SUMUP',?)").run(`crash-booking-${failAfter}`,`CRASH-${failAfter}`,`crash-${failAfter}`,`crash-hold-${failAfter}`,`checkout-crash-${failAfter}`);
    const booking=f.db.prepare('SELECT * FROM bookings WHERE id=?').get(`crash-booking-${failAfter}`),normalBatch=f.env.BOOKINGS_DB.batch;
    f.env.BOOKINGS_DB.batch=async items=>{f.db.exec('BEGIN');try{const out=[];for(let i=0;i<items.length;i++){out.push({success:true,meta:f.db.prepare(items[i].sql).run(...items[i].params)});if(i===failAfter)throw new Error(`FAULT_AFTER_${i}`)}f.db.exec('COMMIT');return out}catch(e){f.db.exec('ROLLBACK');throw e}};
    await assert.rejects(()=>mod.applySumUpCheckoutState(f.env,booking,{status:'PAID',transaction_id:`tx-${failAfter}`}),new RegExp(`FAULT_AFTER_${failAfter}`));
    assert.equal(f.db.prepare('SELECT status FROM bookings WHERE id=?').get(booking.id).status,'PENDING');assert.equal(count(f.db,'booking_confirmation_jobs'),0);assert.equal(count(f.db,'audit_log',"action='SUMUP_PAYMENT_CONFIRMED'"),0);
    f.env.BOOKINGS_DB.batch=normalBatch;await mod.applySumUpCheckoutState(f.env,booking,{status:'PAID',transaction_id:`tx-${failAfter}`});await mod.applySumUpCheckoutState(f.env,f.db.prepare('SELECT * FROM bookings WHERE id=?').get(booking.id),{status:'PAID',transaction_id:`tx-${failAfter}`});
    assert.equal(f.db.prepare('SELECT status FROM bookings WHERE id=?').get(booking.id).status,'PAID');assert.equal(count(f.db,'booking_confirmation_jobs'),1);assert.equal(count(f.db,'audit_log',"action='SUMUP_PAYMENT_CONFIRMED'"),1);
  }
});

await test('Anniversary paid route uses release inventory and queues one confirmation',async()=>{
  const f=fixture({sumup:true}),event=f.db.prepare("SELECT e.class_id FROM anniversary_events e WHERE e.active=1 LIMIT 1").get();assert(event);
  globalThis.fetch=async(_url,options={})=>options.method==='POST'?new Response(JSON.stringify({id:'checkout-anniversary',hosted_checkout_url:'https://pay.example.test/anniversary'})):new Response(JSON.stringify({id:'checkout-anniversary',status:'PAID',transaction_id:'22222222-2222-4222-8222-222222222222'}));
  const before=await mod.anniversaryInventory(f.env);let response=await f.request('/api/class-reservations',{...bookingBody(event.class_id),email:'anniversary-route@example.test'});assert.equal(response.status,201,await response.clone().text());
  await f.request('/api/sumup-webhook',{id:'checkout-anniversary',event_type:'CHECKOUT_STATUS_CHANGED'});const after=await mod.anniversaryInventory(f.env);assert.equal(after.paid,before.paid+1);assert.equal(after.remaining,before.remaining-1);assert.equal(count(f.db,'booking_confirmation_jobs'),1);
});

await test('manual and free routes have explicit confirmation policy',async()=>{
  const manual=fixture();addClass(manual.db,{id:'manual-route'});let response=await manual.request('/api/class-reservations',bookingBody('manual-route'));assert.equal(response.status,201);let b=manual.db.prepare("SELECT * FROM bookings WHERE class_id='manual-route'").get();assert.equal(b.status,'PENDING');assert.equal(b.payment_provider,'MANUAL');assert.equal(count(manual.db,'booking_confirmation_jobs'),0);
  response=await manual.request('/api/admin/bookings',{id:b.id,action:'MARK_PAID'},{admin:true});assert.equal(response.status,200,await response.clone().text());assert.equal(count(manual.db,'booking_confirmation_jobs'),1);
  const free=fixture();addClass(free.db,{id:'free-route',price:0});response=await free.request('/api/class-reservations',bookingBody('free-route'));assert.equal(response.status,201,await response.clone().text());b=free.db.prepare("SELECT * FROM bookings WHERE class_id='free-route'").get();assert.equal(b.status,'PAID');assert.equal(count(free.db,'booking_confirmation_jobs'),1);
});

await test('actual Class Pass route debits once, books once and queues once',async()=>{
  const f=fixture();addClass(f.db,{id:'pass-route'});const a=f.db.prepare('SELECT * FROM member_accounts WHERE verified_at IS NOT NULL LIMIT 1').get();assert(a);f.db.prepare("UPDATE member_accounts SET access_state='ACTIVE',auth_generation=0 WHERE id=?").run(a.id);
  f.db.prepare("INSERT OR REPLACE INTO class_pass_class_eligibility(class_id,eligible,reason) VALUES('pass-route',1,'local test')").run();
  f.db.prepare("INSERT INTO member_passes(id,member_id,customer_id,product_id,status,purchased_at,original_valid_through,valid_through,original_credits,purchase_amount_pence) VALUES('pass-route-pass',?,?, 'class-pass-4','ACTIVE',CURRENT_TIMESTAMP,'2030-12-31','2030-12-31',4,2200)").run(a.id,a.customer_id);
  f.db.prepare("INSERT INTO class_pass_credit_ledger(id,pass_id,member_id,amount,event_type,reason,actor_type,idempotency_key) VALUES('pass-seed','pass-route-pass',?,4,'PURCHASE','Local seed','SYSTEM','pass-seed')").run(a.id);
  const token=await mod.createMemberSession(f.env,a.id,0),headers={Cookie:`bs_member_session=${token}`};
  let response=await f.request('/api/member/class-credit-booking',{class_id:'pass-route',operation_id:'route-pass-operation'},{headers});assert.equal(response.status,201,await response.clone().text());
  response=await f.request('/api/member/class-credit-booking',{class_id:'pass-route',operation_id:'route-pass-operation'},{headers});assert.equal(response.status,200);assert.equal((await response.json()).idempotent,true);
  assert.equal(count(f.db,'bookings',"class_id='pass-route' AND payment_provider='CLASS_PASS'"),1);assert.equal(f.db.prepare("SELECT SUM(amount) balance FROM class_pass_credit_ledger WHERE pass_id='pass-route-pass'").get().balance,3);assert.equal(count(f.db,'booking_confirmation_jobs'),1);
});

await test('active/expired holds and full-capacity waiting list behave through real route',async()=>{
  const f=fixture();addClass(f.db,{id:'hold-route',capacity:1});f.db.prepare("INSERT INTO booking_holds(id,class_id,quantity,expires_at) VALUES('active-hold','hold-route',1,'2030-01-01T00:00:00Z')").run();
  let response=await f.request('/api/class-reservations',bookingBody('hold-route'));let data=await response.json();assert.equal(data.waitlisted,true);assert.equal(count(f.db,'bookings',"class_id='hold-route'"),0);
  f.db.prepare("UPDATE booking_holds SET expires_at='2020-01-01T00:00:00Z' WHERE id='active-hold'").run();response=await f.request('/api/class-reservations',{...bookingBody('hold-route'),email:'second@example.test'});data=await response.json();assert.equal(data.manual_confirmation,true);assert.equal(count(f.db,'bookings',"class_id='hold-route'"),1);
});

await test('hold cleanup deletes only expired unreferenced holds and preserves booking FK history',async()=>{
  const f=fixture();addClass(f.db,{id:'cleanup-route'});f.db.prepare("INSERT INTO booking_holds(id,class_id,quantity,expires_at) VALUES('unreferenced-expired','cleanup-route',1,'2020-01-01T00:00:00Z'),('referenced-expired','cleanup-route',1,'2020-01-01T00:00:00Z')").run();
  f.db.prepare("INSERT INTO bookings(id,reference,class_id,hold_id,customer_name,customer_email,quantity,amount_pence,status,payment_provider) VALUES('cleanup-booking','CLEANUP','cleanup-route','referenced-expired','Cleanup Test','cleanup@example.test',1,600,'FAILED','SUMUP')").run();
  await mod.cleanupExpiredUnreferencedBookingHolds(f.env);assert.equal(count(f.db,'booking_holds',"id='unreferenced-expired'"),0);assert.equal(count(f.db,'booking_holds',"id='referenced-expired'"),1);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

await test('revoke/restore routes invalidate races, old sessions/tokens, then allow fresh password login',async()=>{
  const f=fixture(),a=f.db.prepare('SELECT * FROM member_accounts WHERE verified_at IS NOT NULL LIMIT 1').get();assert(a);const password='LocalPass1234',salt='local-salt',hash=await mod.passwordHash(password,salt);f.db.prepare("UPDATE member_accounts SET access_state='ACTIVE',auth_generation=0,password_hash=?,password_salt=? WHERE id=?").run(hash,salt,a.id);
  const oldSession=await mod.createMemberSession(f.env,a.id,0),oldReset=await mod.createMemberEmailToken(f.env,a.id,'RESET',2),cookie={Cookie:`bs_member_session=${oldSession}`};let response=await f.request('/api/member/login',{email:a.email,password},{headers:{}});assert.equal(response.status,200);
  const action={action:'REVOKE',customer_id:a.customer_id,member_account_id:a.id,reason:'Route race test',operation_id:'route-revoke',confirmed:true};const raced=await Promise.all([f.request('/api/member/me',undefined,{headers:cookie}),f.request('/api/admin/member-access',action,{admin:true})]);assert(raced.some(r=>r.status===200));
  assert.equal((await f.request('/api/member/me',undefined,{headers:cookie})).status,401);assert.equal((await f.request('/api/member/login',{email:a.email,password})).status,401);assert.equal((await f.request('/api/member/reset',{token:oldReset,password:'ChangedPass1234'})).status,400);
  response=await f.request('/api/member/register',{first_name:'Route',last_name:'Tester',email:a.email,password:'ChangedPass1234'});assert.equal(response.status,403);
  const customerBefore=f.db.prepare('SELECT * FROM customers WHERE id=?').get(a.customer_id),historyBefore=count(f.db,'bookings',`customer_id='${a.customer_id}'`);
  response=await f.request('/api/admin/member-access',{...action,action:'RESTORE',operation_id:'route-restore'},{admin:true});assert.equal(response.status,200);assert.equal((await f.request('/api/member/me',undefined,{headers:cookie})).status,401);response=await f.request('/api/member/login',{email:a.email,password});assert.equal(response.status,200);
  assert.deepEqual(f.db.prepare('SELECT * FROM customers WHERE id=?').get(a.customer_id),customerBefore);assert.equal(count(f.db,'bookings',`customer_id='${a.customer_id}'`),historyBefore);assert.equal(count(f.db,'admin_lifecycle_audit'),2);
});

await test('verification token and guest booking respect revocation; registration race creates one account',async()=>{
  const f=fixture();f.env.RESEND_API_KEY='';addClass(f.db,{id:'revoked-guest'});const a=f.db.prepare('SELECT * FROM member_accounts WHERE verified_at IS NOT NULL LIMIT 1').get();assert(a);
  const verify=await mod.createMemberEmailToken(f.env,a.id,'VERIFY',24),action={action:'REVOKE',customer_id:a.customer_id,member_account_id:a.id,reason:'Verification route test',operation_id:'verify-revoke',confirmed:true};assert.equal((await f.request('/api/admin/member-access',action,{admin:true})).status,200);
  assert.equal((await f.request('/api/member/verify',{token:verify})).status,400);
  const guest=await f.request('/api/class-reservations',{...bookingBody('revoked-guest'),email:a.email,name:'Revoked Guest'});assert.equal(guest.status,201,await guest.clone().text());assert.equal(f.db.prepare("SELECT customer_id FROM bookings WHERE class_id='revoked-guest'").get().customer_id,a.customer_id);assert.equal(f.db.prepare('SELECT access_state FROM member_accounts WHERE id=?').get(a.id).access_state,'REVOKED');
  const email='registration-race@example.test',payload={first_name:'Registration',last_name:'Race',email,password:'Registration123',phone:'07000000001'};const responses=await Promise.all([f.request('/api/member/register',payload),f.request('/api/member/register',payload)]);const statuses=responses.map(r=>r.status).sort();assert.deepEqual(statuses,[201,409]);assert.equal(count(f.db,'member_accounts',`email='${email}'`),1);
});

await test('external refund route is concurrent-idempotent and late payment cannot resurrect order',async()=>{
  const f=fixture({sumup:true}),order=f.db.prepare("SELECT * FROM merch_orders WHERE status='PAID' LIMIT 1").get();assert(order);f.db.prepare("UPDATE merch_orders SET provider_checkout_id='cancelled-checkout' WHERE id=?").run(order.id);let providerCalls=0;globalThis.fetch=async()=>{providerCalls++;return new Response(JSON.stringify({id:'cancelled-checkout',status:'PAID',transaction_id:'33333333-3333-4333-8333-333333333333'}));};
  const body={action:'CANCEL_EXTERNAL_REFUND',id:order.id,refund_amount_pence:order.amount_pence,refunded_at:new Date().toISOString(),refund_method:'Bank transfer',reason:'Local route test',operation_id:'route-refund',confirmed:true};const responses=await Promise.all([f.request('/api/admin/merch-orders',body,{admin:true}),f.request('/api/admin/merch-orders',body,{admin:true})]);assert(responses.every(r=>r.status===200));
  await f.request('/api/sumup-webhook',{id:'cancelled-checkout',event_type:'CHECKOUT_STATUS_CHANGED'});let response=await f.request('/api/merch-order-status?reference='+encodeURIComponent(order.reference));assert.equal(response.status,200);assert.equal((await response.json()).status,'CANCELLED');assert.equal(providerCalls,0);assert.equal(count(f.db,'merch_external_refunds'),1);assert.equal(count(f.db,'admin_lifecycle_audit',"action='MERCH_CANCEL_EXTERNAL_REFUND'"),1);
});

await test('owner delivery-test route is off by default and allowlist-only when enabled',async()=>{
  const f=fixture(),booking=f.db.prepare('SELECT id FROM bookings LIMIT 1').get();let response=await f.request('/api/admin/booking-confirmation-delivery-test',{booking_id:booking.id,operation_id:'test-disabled',recipient:'owner@example.test'},{admin:true});assert.equal(response.status,403);assert.equal(count(f.db,'booking_confirmation_delivery_tests'),0);
  f.env.BOOKING_CONFIRMATION_TEST_ENABLED='true';f.env.BOOKING_CONFIRMATION_TEST_ALLOWLIST='owner@example.test';response=await f.request('/api/admin/booking-confirmation-delivery-test',{booking_id:booking.id,operation_id:'test-denied',recipient:'customer@example.test'},{admin:true});assert.equal(response.status,403);assert.equal(count(f.db,'booking_confirmation_delivery_tests'),0);
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'local-test-provider'}));response=await f.request('/api/admin/booking-confirmation-delivery-test',{booking_id:booking.id,operation_id:'test-owner',recipient:'owner@example.test'},{admin:true});assert.equal(response.status,200,await response.clone().text());assert.equal(f.db.prepare("SELECT status FROM booking_confirmation_delivery_tests WHERE operation_id='test-owner'").get().status,'SENT');
});

console.log(`PASS ${passed} route-level lifecycle scenarios; local database only.`);
