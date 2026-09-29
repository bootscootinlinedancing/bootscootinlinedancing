import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const backup=process.argv[2];if(!backup)throw new Error('Supply a local SQL backup; never a remote database.');
const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const names=['applySumUpCheckoutState','enqueueBookingConfirmation','processBookingConfirmations','memberSession','createMemberSession','createMemberEmailToken','memberSha256Hex','passwordHash','resolveCustomerIdentity','anniversaryInventory','reconcileClassSold','deliverBookingNotification','sendMerchConfirmation'];
const mod=await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {'+names.join(',')+'};').toString('base64')}`);
let passed=0,fetchCalls=[];
globalThis.fetch=async(...args)=>{fetchCalls.push(args);throw new Error('Unexpected external network call');};
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');db.exec(readFileSync(backup,'utf8'));db.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>/^00(19|20|21)_/.test(f)).sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const prepare=(sql,params=[])=>({sql,params,bind(...v){return prepare(sql,v)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {success:true,meta:db.prepare(sql).run(...params)}}});
 const env={ADMIN_EMAIL:'nora@bootscootinlinedancing.co.uk',RESEND_API_KEY:'LOCAL_FAKE_KEY',EMAIL_FROM:'Owner Test <test@example.test>',EMAIL_FROM_BOOKINGS:'Owner Test <test@example.test>',BOOKINGS_DB:{prepare,async batch(items){db.exec('BEGIN');try{const r=items.map(s=>({success:true,meta:db.prepare(s.sql).run(...s.params)}));db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
 const headers={'Cf-Access-Authenticated-User-Email':env.ADMIN_EMAIL,Origin:'https://bootscootinlinedancing.co.uk','Content-Type':'application/json'};
 const request=(path,body,override={})=>mod.default.fetch(new Request('https://bootscootinlinedancing.co.uk'+path,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{}),...override}),env,{});
 return {db,env,request,headers};
}
function paidFixture(f,id='synthetic-booking',anniversary=false){
 const classId=anniversary?'6672aa15-7bc6-49eb-a0f6-90db946409f6':'synthetic-class';
 if(!anniversary)f.db.prepare("INSERT OR IGNORE INTO classes(id,title,starts_at,ends_at,capacity,price_pence,venue,location,status) VALUES(?,?,?, ?,5,600,'Test Venue','Test location','open')").run(classId,'Synthetic class','2030-01-01T19:00:00.000Z','2030-01-01T20:00:00.000Z');
 f.db.prepare("INSERT INTO booking_holds(id,class_id,quantity,expires_at) VALUES(?,?,1,'2030-01-01T20:00:00.000Z')").run('hold-'+id,classId);
 f.db.prepare("INSERT INTO bookings(id,reference,class_id,hold_id,customer_name,customer_email,quantity,amount_pence,status,payment_provider,anniversary_release_id) VALUES(?,?,?,?, 'Synthetic Customer','synthetic@example.test',1,600,'PENDING','SUMUP',?)").run(id,id,classId,'hold-'+id,anniversary?'anniversary-2026-early':null);
 return f.db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
}
async function test(name,fn){fetchCalls=[];try{await fn();passed++;console.log('PASS',name)}catch(e){console.error('FAIL',name);throw e}}
const count=(db,t)=>db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
const baselineTables=['customers','attendance','loyalty_transactions','member_passes','class_pass_credit_ledger','reviews','review_history','customer_identity_audit'];
const snap=(db,tables=baselineTables)=>Object.fromEntries(tables.map(t=>[t,JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())]));
await test('Original FK defect reproduced; migrated first payment preserves FK, expires hold, queues once, no send',async()=>{
 const f=fixture(),b=paidFixture(f);assert.throws(()=>f.db.prepare('DELETE FROM booking_holds WHERE id=?').run(b.hold_id),/FOREIGN KEY/);
 const before=snap(f.db);await mod.applySumUpCheckoutState(f.env,b,{status:'PAID',transaction_id:'test-tx'});
 assert.equal(f.db.prepare('SELECT status FROM bookings WHERE id=?').get(b.id).status,'PAID');assert.equal(count(f.db,'booking_confirmation_jobs'),1);
 assert(f.db.prepare('SELECT expires_at FROM booking_holds WHERE id=?').get(b.hold_id).expires_at<'2030');assert.equal(f.db.prepare('SELECT sold FROM classes WHERE id=?').get(b.class_id).sold,1);
 assert.deepEqual(snap(f.db),before);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(fetchCalls.length,0);
 await mod.applySumUpCheckoutState(f.env,b,{status:'PAID'});await mod.applySumUpCheckoutState(f.env,{...b,status:'PENDING'},{status:'PAID'});
 assert.equal(count(f.db,'booking_confirmation_jobs'),1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='SUMUP_PAYMENT_CONFIRMED'").get().n,1);assert.deepEqual(snap(f.db),before);
});
await test('Already-paid missing confirmation recovered; historical paid set excluded; delivery paused by default',async()=>{
 const f=fixture(),b=paidFixture(f);f.db.prepare("UPDATE bookings SET status='PAID',paid_at=CURRENT_TIMESTAMP WHERE id=?").run(b.id);
 await mod.applySumUpCheckoutState(f.env,{...b,status:'PAID'},{status:'PAID'});await mod.processBookingConfirmations(f.env);assert.equal(count(f.db,'booking_confirmation_jobs'),1);assert.equal(fetchCalls.length,0);
 const historical=f.db.prepare("SELECT * FROM bookings WHERE status='PAID' AND id!=?").all(b.id);
 for(const old of historical)await mod.applySumUpCheckoutState(f.env,old,{status:'PAID'});
 assert.equal(count(f.db,'booking_confirmation_jobs'),1);
});
await test('Provider failure, retry, duplicate callback and repeated processor use one stable payload/key',async()=>{
 const f=fixture(),b=paidFixture(f);await mod.applySumUpCheckoutState(f.env,b,{status:'PAID'});f.db.exec('UPDATE booking_confirmation_policy SET delivery_enabled=1');
 let attempts=0;const requests=[];globalThis.fetch=async(url,opts)=>{requests.push(opts);attempts++;return new Response(JSON.stringify(attempts===1?{message:'temporary'}:{id:'provider-one'}),{status:attempts===1?503:200})};
 await mod.processBookingConfirmations(f.env);assert.equal(f.db.prepare('SELECT status FROM booking_confirmation_jobs').get().status,'RETRY');assert.equal(f.db.prepare('SELECT status FROM bookings WHERE id=?').get(b.id).status,'PAID');
 f.db.exec("UPDATE booking_confirmation_jobs SET next_attempt_at=datetime('now','-1 minute')");await mod.processBookingConfirmations(f.env);await mod.processBookingConfirmations(f.env);await mod.applySumUpCheckoutState(f.env,b,{status:'PAID'});
 assert.equal(attempts,2);assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM notification_log WHERE booking_id=? AND status='SENT'").get(b.id).n,1);
});
await test('Ambiguous acceptance/crash retries same key; concurrent claims; expired retry window stops',async()=>{
 const f=fixture(),b=paidFixture(f);await mod.applySumUpCheckoutState(f.env,b,{status:'PAID'});f.db.exec('UPDATE booking_confirmation_policy SET delivery_enabled=1');
 const accepted=new Set();let requests=0;globalThis.fetch=async(_u,o)=>{requests++;accepted.add(o.headers['Idempotency-Key']);if(requests===1)throw Error('response lost after provider acceptance');return new Response(JSON.stringify({id:'accepted-once'}))};
 await mod.processBookingConfirmations(f.env);f.db.exec("UPDATE booking_confirmation_jobs SET next_attempt_at=datetime('now','-1 minute')");await Promise.all([mod.processBookingConfirmations(f.env),mod.processBookingConfirmations(f.env)]);assert.equal(accepted.size,1);assert.equal(requests,2);
 f.db.exec("UPDATE booking_confirmation_jobs SET status='PROCESSING',lease_until=datetime('now','-1 minute'),first_attempt_at=datetime('now','-21 hours')");await mod.processBookingConfirmations(f.env);assert.equal(requests,2);assert.equal(f.db.prepare('SELECT status FROM booking_confirmation_jobs').get().status,'REVIEW');
});
await test('Anniversary capacity and holds correct; no loyalty/attendance replay',async()=>{
 const f=fixture(),before=await mod.anniversaryInventory(f.env),b=paidFixture(f,'anniversary-test',true),snapBefore=snap(f.db);await mod.applySumUpCheckoutState(f.env,b,{status:'PAID'});const after=await mod.anniversaryInventory(f.env);assert.equal(after.paid,before.paid+1);assert.equal(after.remaining,before.remaining-1);assert.equal(after.held,before.held);assert.deepEqual(snap(f.db),snapBefore);
});
await test('Zero-price/manual/Class Pass confirmation events converge on one job; cancellation never sends',async()=>{
 const f=fixture(),b=paidFixture(f);f.db.prepare("UPDATE bookings SET status='PAID',paid_at=CURRENT_TIMESTAMP,payment_provider='CLASS_PASS' WHERE id=?").run(b.id);
 await mod.deliverBookingNotification(f.env,b,'BOOKING_PAID');await mod.deliverBookingNotification(f.env,b,'BOOKING_CONFIRMED');assert.equal(count(f.db,'booking_confirmation_jobs'),1);
 f.db.exec('UPDATE booking_confirmation_policy SET delivery_enabled=1');f.db.prepare("UPDATE bookings SET status='CANCELLED' WHERE id=?").run(b.id);globalThis.fetch=async()=>{throw Error('must not send')};await mod.processBookingConfirmations(f.env);assert.equal(f.db.prepare('SELECT status FROM booking_confirmation_jobs').get().status,'CANCELLED');
});
await test('Member revoke/restore auth, immutable audit, sessions/tokens, idempotency and history preservation',async()=>{
 const f=fixture();globalThis.fetch=async(...a)=>{fetchCalls.push(a);throw Error('No network allowed')};const account=f.db.prepare("SELECT * FROM member_accounts WHERE verified_at IS NOT NULL ORDER BY created_at LIMIT 1").get();const before=snap(f.db,[...baselineTables,'bookings','merch_orders','customers','class_pass_admin_operations']);
 const session=await mod.createMemberSession(f.env,account.id,0),token=await mod.createMemberEmailToken(f.env,account.id,'RESET',2);const cookie=`bs_member_session=${session}`;
 const action={action:'REVOKE',customer_id:account.customer_id,member_account_id:account.id,operation_id:'revoke-one',reason:'Local lifecycle test',confirmed:true};
 let response=await f.request('/ranch/api/admin/member-access',action,{headers:{}});assert.equal(response.status,401);
 response=await f.request('/ranch/api/admin/member-access',{...action,reason:''});assert.equal(response.status,400);
 response=await f.request('/ranch/api/admin/member-access',action);assert.equal(response.status,200,await response.clone().text());assert.equal(f.db.prepare('SELECT access_state FROM member_accounts WHERE id=?').get(account.id).access_state,'REVOKED');
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM member_sessions WHERE member_id=?').get(account.id).n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM member_email_tokens WHERE member_id=?').get(account.id).n,0);
 response=await f.request('/ranch/api/admin/member-access',action);assert.equal((await response.json()).idempotent,true);response=await f.request('/ranch/api/admin/member-access',{...action,reason:'conflict'});assert.equal(response.status,409);
 assert.throws(()=>f.db.exec("UPDATE admin_lifecycle_audit SET reason='changed'"),/immutable/);assert.throws(()=>f.db.exec('DELETE FROM admin_lifecycle_audit'),/immutable/);
 assert.equal(await mod.memberSession(new Request('https://example.test',{headers:{Cookie:cookie}}),f.env),null);await assert.rejects(()=>mod.createMemberSession(f.env,account.id,0));await assert.rejects(()=>mod.createMemberEmailToken(f.env,account.id,'RESET',2));
 response=await f.request('/api/member/login',{email:account.email,password:'WrongOrOld1234'});assert.equal(response.status,401);
 response=await f.request('/api/member/register',{email:account.email,password:'Example12345',first_name:'Local',last_name:'Fixture'});assert.equal(response.status,403);
 response=await f.request('/api/member/reset',{token,password:'Example12345'});assert.equal(response.status,400);
 response=await f.request('/api/member/forgot',{email:account.email});assert.equal(response.status,200);assert.equal(fetchCalls.length,0);
 response=await f.request('/ranch/api/admin/member-access',{...action,action:'RESTORE',operation_id:'restore-one'});assert.equal(response.status,200);await assert.rejects(()=>mod.createMemberSession(f.env,account.id,0));assert.equal(await mod.memberSession(new Request('https://example.test',{headers:{Cookie:cookie}}),f.env),null);
 const fresh=await mod.createMemberSession(f.env,account.id,2);assert(fresh);assert.deepEqual(snap(f.db,[...baselineTables,'bookings','merch_orders','customers','class_pass_admin_operations']),before);assert.equal(fetchCalls.length,0);
});
await test('Revoked customer still resolves for future guest booking without reactivation',async()=>{
 const f=fixture(),a=f.db.prepare("SELECT * FROM member_accounts WHERE verified_at IS NOT NULL ORDER BY created_at LIMIT 1").get();f.db.prepare("UPDATE member_accounts SET access_state='REVOKED' WHERE id=?").run(a.id);const total=count(f.db,'customers');const c=await mod.resolveCustomerIdentity(f.env,{email:a.email,name:'Local Fixture',source:'BOOKING'});assert.equal(c.id,a.customer_id);assert.equal(count(f.db,'customers'),total);assert.equal(f.db.prepare('SELECT access_state FROM member_accounts WHERE id=?').get(a.id).access_state,'REVOKED');
});
await test('External refund cancel preserves payment, immutable audit, idempotency, accounting, no network',async()=>{
 const f=fixture();fetchCalls=[];globalThis.fetch=async(...a)=>{fetchCalls.push(a);throw Error('No provider/email permitted')};const order=f.db.prepare("SELECT * FROM merch_orders WHERE status='PAID' ORDER BY created_at LIMIT 1").get(),before=snap(f.db,[...baselineTables,'bookings']);
 const body={action:'CANCEL_EXTERNAL_REFUND',id:order.id,refund_amount_pence:order.amount_pence,refunded_at:'2026-09-01T12:00:00Z',refund_method:'Bank transfer',reason:'Local test: already refunded externally',operation_id:'external-one',confirmed:true};
 let response=await f.request('/api/admin/merch-orders',{...body,confirmed:false});assert.equal(response.status,400);
 response=await f.request('/api/admin/merch-orders',body);assert.equal(response.status,200,await response.clone().text());response=await f.request('/api/admin/merch-orders',body);assert.equal(response.status,200);assert.equal((await response.json()).idempotent,true);
 response=await f.request('/api/admin/merch-orders',{...body,refund_amount_pence:1000});assert.equal(response.status,409);
 const changed=f.db.prepare('SELECT * FROM merch_orders WHERE id=?').get(order.id);for(const k of Object.keys(order))if(!['status','fulfilment_status','cancelled_at'].includes(k))assert.equal(changed[k],order[k],k);assert.equal(changed.status,'CANCELLED');assert.equal(changed.fulfilment_status,'CANCELLED');
 const money=f.db.prepare('SELECT * FROM merch_accounting WHERE order_id=?').get(order.id);assert.equal(money.gross_received_pence,order.amount_pence);assert.equal(money.externally_refunded_pence,order.amount_pence);assert.equal(money.net_received_pence,0);
 assert.throws(()=>f.db.exec('DELETE FROM merch_external_refunds'),/immutable/);assert.throws(()=>f.db.prepare('DELETE FROM merch_orders WHERE id=?').run(order.id),/retained/);
 for(const action of ['READY','DISPATCHED','COMPLETE','MARK_PAID_CASH','MARK_PAID_SUMUP','DELETE']){response=await f.request('/api/admin/merch-orders',{action,id:order.id});assert.equal(response.status,409)}
 response=await f.request('/api/merch-order-status?reference='+order.reference);assert.equal(response.status,200);await mod.sendMerchConfirmation(f.env,order);assert.equal(fetchCalls.length,0);assert.deepEqual(snap(f.db,[...baselineTables,'bookings']),before);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});
console.log(`PASS ${passed} lifecycle/reliability scenarios; all data local; no external messages or payments.`);
