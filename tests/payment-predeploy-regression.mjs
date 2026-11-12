// Explicit preflight: provide a SELECT-only sqlite_master snapshot, never a database.
// Every row created below is synthetic. All network access is replaced with a mock.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {applySpecialEventCheckoutState,processSpecialEventConfirmations} from '../special-events.js';
import {runBoundedReconciliation} from '../payment-reconciliation.js';
const schema=JSON.parse(readFileSync(process.argv[2],'utf8'))[0];
assert(schema.every(row=>['table','index','trigger'].includes(row.type)));
let source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8')
  .replaceAll("'./special-events.js'",JSON.stringify(new URL('../special-events.js',import.meta.url).href))
  .replaceAll("'./payment-reconciliation.js'",JSON.stringify(new URL('../payment-reconciliation.js',import.meta.url).href));
const mod=await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {applySumUpCheckoutState,processBookingConfirmations,runProtectedEmailAutomations};').toString('base64')}`);
const sqlFile=name=>readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
const originalFetch=globalThis.fetch;
// 0038 must preserve old statuses/provider IDs and quarantine only ambiguous sends.
{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');db.exec(schema.find(r=>r.name==='special_event_confirmation_outbox').sql);
  for(const [index,status] of ['SENT','SENDING','FAILED','READY'].entries())db.prepare(`INSERT INTO special_event_confirmation_outbox(id,booking_id,status,idempotency_key,attempt_count,provider_id) VALUES(?,?,?,?,1,?)`).run(String(index),String(index),status,'history-'+index,'preserved-'+index);
  const before=db.prepare('SELECT * FROM special_event_confirmation_outbox ORDER BY id').all();db.exec(sqlFile('0038_confirmation_dispatch_reliability.sql'));
  const after=db.prepare('SELECT * FROM special_event_confirmation_outbox ORDER BY id').all();
  for(let n=0;n<before.length;n++){for(const key of Object.keys(before[n]))assert.equal(after[n][key],before[n][key]);assert.equal(after[n].review_required,[1,2].includes(n)?1:0);}
  assert.throws(()=>db.exec(sqlFile('0038_confirmation_dispatch_reliability.sql')),/duplicate column/,'raw SQL is deliberately not run twice; migration history must gate application');
  db.close();console.log('PASS 0038 preserves historical statuses/provider IDs, quarantines ambiguous attempts; accidental raw reapplication fails closed');
}
const accepted=new Map();let uncertain=false;
globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.resend.com/emails','no external provider calls');
  const key=options.headers['Idempotency-Key'],payload=JSON.parse(options.body);
  assert(payload.to.toString().endsWith('@example.test'));
  if(accepted.has(key))assert.deepEqual(accepted.get(key).payload,payload,'retry payload is frozen');
  else accepted.set(key,{id:'mock-'+key,payload});
  if(uncertain){uncertain=false;throw Error('Synthetic response lost AFTER provider acceptance');}
  return Response.json({id:accepted.get(key).id});
};
function fixture({enabled=true,failAfter=-1}={}){
  const db=new DatabaseSync(':memory:');
  // Recreate the ACTUAL production constraints, indexes and immutable triggers.
  for(const type of ['table','index','trigger'])for(const row of schema.filter(r=>r.type===type&&r.sql&&!r.name.startsWith('sqlite_')))db.exec(row.sql);
  db.exec(sqlFile('0032_special_events.sql').slice(sqlFile('0032_special_events.sql').indexOf('INSERT INTO special_events(')));
  db.exec(sqlFile('0033_johnny_programme_times.sql'));db.exec(sqlFile('0034_johnny_owner_decisions.sql'));
  db.exec(sqlFile('0038_confirmation_dispatch_reliability.sql'));db.exec(sqlFile('0039_payment_reconciliation.sql'));
  db.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO customers(id,name,email) VALUES('synthetic','Synthetic','synthetic@example.test');
    INSERT INTO classes(id,title,venue,location,starts_at,capacity,price_pence) VALUES('synthetic','Synthetic','Synthetic','Synthetic','2030-01-01',20,800);
    INSERT INTO booking_confirmation_policy(id,eligible_paid_from,delivery_enabled) VALUES(1,'2000-01-01',1);
    UPDATE special_event_days SET capacity=100;UPDATE special_events SET saturday_evening_capacity=100;
    UPDATE special_event_ticket_products SET allocation=100;`);
  let armed=failAfter,trace=[];
  const prepare=(sql,params=[])=>({sql,params,bind(...v){return prepare(sql,v)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {meta:db.prepare(sql).run(...params)}}});
  const env={PAYMENT_RECONCILIATION_ENABLED:String(enabled),SUMUP_MERCHANT_CODE:'MOCK',SPECIAL_EVENT_EMAILS_ENABLED:'true',RESEND_API_KEY:'SYNTHETIC_ONLY',EMAIL_FROM_BOOKINGS:'Synthetic <synthetic@example.test>',EMAIL_FROM_EVENTS:'Synthetic <synthetic@example.test>',BOOKINGS_DB:{prepare,async batch(items){
    db.exec('BEGIN');try{const results=items.map((item,index)=>{trace.push(item.sql);const result={meta:db.prepare(item.sql).run(...item.params)};if(index===armed){armed=-1;throw Error('SYNTHETIC_DATABASE_FAILURE')}return result;});db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}
  }}};
  function regular(id='regular'){
    db.prepare(`INSERT INTO booking_holds(id,class_id,quantity,expires_at) VALUES(?,'synthetic',2,'2099-01-01')`).run('hold-'+id);
    db.prepare(`INSERT INTO bookings(id,reference,class_id,hold_id,customer_id,customer_name,customer_email,quantity,amount_pence,provider_checkout_id) VALUES(?,?,'synthetic',?,'synthetic','Synthetic','synthetic@example.test',2,1600,?)`).run(id,'BS-'+id,'hold-'+id,'checkout-'+id);
    for(let n=1;n<=2;n++)db.prepare(`INSERT INTO booking_attendees(id,booking_id,class_id,place_number,role,snapshot_name) VALUES(?,?,'synthetic',?,'GUEST','Synthetic')`).run(id+'-'+n,id,n);
    return db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
  }
  function special(id='special'){
    db.prepare(`INSERT INTO special_event_holds(id,event_id,product_id,customer_email,quantity,amount_pence,expires_at,idempotency_key) VALUES(?,'special-event-johnny-rossato-2027','johnny-standard-weekend','synthetic@example.test',2,10000,'2099-01-01',?)`).run('hold-'+id,id);
    db.prepare(`INSERT INTO special_event_bookings(id,reference,event_id,product_id,hold_id,customer_id,customer_name,customer_email,quantity,product_code_snapshot,product_name_snapshot,unit_price_pence_snapshot,amount_pence,provider_checkout_id,secure_token,customer_token,terms_accepted_at) VALUES(?,?,'special-event-johnny-rossato-2027','johnny-standard-weekend',?,'synthetic','Synthetic','synthetic@example.test',2,'STANDARD_WEEKEND','Standard Weekend Pass',5000,10000,?,?,?,CURRENT_TIMESTAMP)`).run(id,'BSE-'+id,'hold-'+id,'checkout-'+id,'secure-'+id,'token-'+id);
    db.prepare(`INSERT INTO special_event_booking_days SELECT ?,day_id,2*places_per_ticket FROM special_event_product_days WHERE product_id='johnny-standard-weekend'`).run(id);
    for(let n=1;n<=2;n++)db.prepare(`INSERT INTO special_event_booking_attendee_drafts(id,booking_id,attendee_index,name,age_at_event) VALUES(?,?,?,'Synthetic',30)`).run(id+'-'+n,id,n);
    return db.prepare('SELECT * FROM special_event_bookings WHERE id=?').get(id);
  }
  return {db,env,regular,special,trace,count:(table)=>db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n};
}
const checkout=b=>({id:b.provider_checkout_id,checkout_reference:b.reference,merchant_code:'MOCK',amount:b.amount_pence/100,currency:'GBP',status:'PAID',transactions:[{id:'declined-'+b.id,status:'FAILED',amount:b.amount_pence/100,currency:'GBP'},{id:'captured-'+b.id,status:'SUCCESSFUL',amount:b.amount_pence/100,currency:'GBP'}]});
const apply=(f,kind,b)=>kind==='regular'?mod.applySumUpCheckoutState(f.env,b,checkout(b)):applySpecialEventCheckoutState(f.env,b,checkout(b));
try{
  for(const kind of ['regular','special']){
    const f=fixture(),b=f[kind]();
    await Promise.all(Array.from({length:8},()=>apply(f,kind,b)));
    assert.equal(f.count('verified_payment_claims'),1);assert.equal(f.db.prepare(`SELECT status FROM ${kind==='regular'?'bookings':'special_event_bookings'}`).get().status,'PAID');
    if(kind==='regular'){assert.equal(f.count('booking_confirmation_jobs'),1);assert.equal(f.db.prepare('SELECT sold FROM classes').get().sold,2);}
    else{assert.equal(f.count('special_event_attendees'),2);assert.equal(f.count('special_event_attendance'),4);assert.equal(f.count('special_event_confirmation_outbox'),1);}
    const batchLength=f.trace.findIndex(sql=>sql.includes("SET state='COMPLETE'"))+1;
    assert(batchLength>0);
    for(let failAfter=0;failAfter<batchLength;failAfter++){
      const broken=fixture({failAfter}),pending=broken[kind]();
      await assert.rejects(()=>apply(broken,kind,pending));
      assert.equal(broken.db.prepare(`SELECT status FROM ${kind==='regular'?'bookings':'special_event_bookings'}`).get().status,'PENDING');
      assert.equal(broken.count('verified_payment_claims'),0,`no stranded claim at ${kind}:${failAfter}`);
      assert.equal(broken.count(kind==='regular'?'booking_confirmation_jobs':'special_event_confirmation_outbox'),0);
      assert.equal(broken.db.prepare(kind==='regular'?"SELECT COUNT(*) n FROM audit_log WHERE action='SUMUP_PAYMENT_CONFIRMED'":"SELECT COUNT(*) n FROM special_event_activity WHERE action='PAYMENT_CONFIRMED'").get().n,0);
      if(kind==='regular')assert.equal(broken.db.prepare('SELECT sold FROM classes').get().sold,0);
      else{assert.equal(broken.count('special_event_attendees'),0);assert.equal(broken.count('special_event_attendance'),0);}
      broken.db.close();
    }
    console.log(`PASS actual production schema: ${kind}, rollback after each of ${batchLength} batch statements and eight concurrent confirmations`);
    // Lost acknowledgement after a provider capture is retried with ONE provider key.
    const retries=fixture(),retryBooking=retries[kind]('retry-'+kind);uncertain=true;
    await apply(retries,kind,retryBooking);
    if(kind==='regular'){
      retries.db.exec("UPDATE booking_confirmation_jobs SET next_attempt_at=datetime('now','-1 minute')");
      await Promise.all([mod.processBookingConfirmations(retries.env),mod.processBookingConfirmations(retries.env)]);
      assert.equal(retries.db.prepare('SELECT status FROM booking_confirmation_jobs').get().status,'SENT');
    }else{
      const send=async(to,subject,html,text,options)=>{const response=await fetch('https://api.resend.com/emails',{headers:{'Idempotency-Key':options.idempotencyKey},body:JSON.stringify({to,subject,html,text,from:options.from})});return response.json();};
      await processSpecialEventConfirmations(retries.env,send);
      retries.db.exec("UPDATE special_event_confirmation_outbox SET next_attempt_at=datetime('now','-1 minute')");
      await Promise.all([processSpecialEventConfirmations(retries.env,send),processSpecialEventConfirmations(retries.env,send)]);
      assert.equal(retries.db.prepare('SELECT status FROM special_event_confirmation_outbox').get().status,'SENT');
    }
    assert.equal([...accepted.keys()].filter(key=>key.endsWith('retry-'+kind)).length,1);
    // Disabling recovery must keep the existing live fulfilment/sender functional.
    const off=fixture({enabled:false}),offBooking=off[kind]('off-'+kind);
    await apply(off,kind,offBooking);assert.equal(off.count('verified_payment_claims'),0);
    assert.equal(off.db.prepare(`SELECT status FROM ${kind==='regular'?'bookings':'special_event_bookings'}`).get().status,'PAID');
    const before=off.db.totalChanges;assert.deepEqual(await runBoundedReconciliation(off.env),{disabled:true});assert.equal(off.db.totalChanges,before);
    console.log(`PASS ${kind}: frozen Resend retry after lost acknowledgement; flag-off fulfilment and disabled scheduler`);
  }
  const disabledHourly=fixture({enabled:false});disabledHourly.special('disabled-hourly-pending');disabledHourly.env.EMAIL_AUTOMATION_SECRET='synthetic-automation';
  const onlyResend=globalThis.fetch;let disabledProviderReads=0;globalThis.fetch=async(url,options)=>{if(String(url).includes('api.sumup.com')){disabledProviderReads++;throw Error('Disabled recovery must not access payment provider');}return onlyResend(url,options);};
  const hourlyResponse=await mod.runProtectedEmailAutomations(new Request('https://fixture.example.test/api/automation/run',{method:'POST',headers:{authorization:'Bearer synthetic-automation'}}),disabledHourly.env);globalThis.fetch=onlyResend;
  assert.equal(hourlyResponse.status,200);assert.equal(disabledProviderReads,0);assert.equal(disabledHourly.db.prepare('SELECT status FROM special_event_bookings').get().status,'PENDING');
  console.log('PASS flag-off hourly email endpoint performs no legacy payment scan and leaves pending event unchanged');
  const old=fixture(),oldBooking=old.regular('expired');old.db.exec("UPDATE booking_holds SET expires_at='2000-01-01'");
  const result=await runBoundedReconciliation(old.env,{retrieve:async()=>checkout(oldBooking),regular:()=>{throw Error('Expired hold must not auto-recover')},special:()=>{}});
  assert.equal(result.review,1);assert.equal(old.count('verified_payment_claims'),0);assert.equal(old.db.prepare('SELECT status FROM bookings').get().status,'PENDING');
  const unnamed=fixture(),group=unnamed.regular('unnamed');unnamed.db.exec("DELETE FROM booking_attendees WHERE place_number=2");await apply(unnamed,'regular',group);assert.equal(unnamed.db.prepare('SELECT status FROM bookings').get().status,'PAID');assert.equal(unnamed.db.prepare('SELECT sold FROM classes').get().sold,2);assert.equal(unnamed.count('booking_attendees'),1,'existing unnamed guest experience is preserved');
  const release=fixture(),limited=release.regular('release');release.db.exec(`INSERT INTO anniversary_events(id,class_id,title,total_capacity) VALUES('anniversary','synthetic','Synthetic',20);INSERT INTO anniversary_ticket_releases(id,event_id,code,name,price_pence,allocation,display_order) VALUES('release','anniversary','TEST','Synthetic',800,2,1);UPDATE bookings SET anniversary_release_id='release';UPDATE booking_holds SET anniversary_release_id='release';INSERT INTO anniversary_ticket_adjustments(id,event_id,release_id,source,external_reference,places,created_by) VALUES('external','anniversary','release','MANUAL','synthetic',1,'synthetic');`);
  await assert.rejects(()=>apply(release,'regular',limited));assert.equal(release.count('verified_payment_claims'),0);assert.equal(release.count('booking_confirmation_jobs'),0);
  const badDays=fixture(),badDayBooking=badDays.special('missing-day');badDays.db.exec("DELETE FROM special_event_booking_days WHERE day_id=(SELECT day_id FROM special_event_booking_days LIMIT 1)");await assert.rejects(()=>apply(badDays,'special',badDayBooking));assert.equal(badDays.count('verified_payment_claims'),0);
  const competing=fixture();
  const normalPrepare=competing.env.BOOKINGS_DB.prepare;
  competing.env.BOOKINGS_DB.prepare=sql=>sql.includes('COALESCE(MAX(entry_number),0) maximum')?{bind(){return this;},async first(){return {maximum:0};}}:normalPrepare(sql);
  const competitionBookings=[competing.special('entrant-one'),competing.special('entrant-two')];
  competing.db.exec("UPDATE special_event_bookings SET competition_quantity=1;UPDATE special_event_booking_attendee_drafts SET competition_requested=1 WHERE attendee_index=1");
  await apply(competing,'special',competitionBookings[0]);await assert.rejects(()=>apply(competing,'special',competitionBookings[1]));
  assert.equal(competing.count('special_event_competition_entries'),1);assert.equal(competing.count('verified_payment_claims'),1);assert.equal(competing.db.prepare("SELECT status FROM special_event_bookings WHERE id='entrant-two'").get().status,'PENDING','competition number collision rolls back rather than silently losing an entry');
  const raceClaim=fixture(),claimBooking=raceClaim.regular('claim-target');raceClaim.regular('other-owner');const normalBatch=raceClaim.env.BOOKINGS_DB.batch;
  raceClaim.env.BOOKINGS_DB.batch=async items=>{raceClaim.db.exec("INSERT OR IGNORE INTO payments(id,booking_id,provider_reference,amount_pence) VALUES('racing-payment','other-owner','captured-claim-target',1600)");return normalBatch(items);};
  await assert.rejects(()=>apply(raceClaim,'regular',claimBooking));assert.equal(raceClaim.count('verified_payment_claims'),0);assert.equal(raceClaim.count('booking_confirmation_jobs'),0);
  console.log('PASS unnamed group places preserved; Anniversary external inventory, missing event day, competition collision and cross-family race fail atomically');
  // Simulated rollback: old code (flag false) remains compatible with retained
  // additive tables/triggers and earlier recorded claims and accepted emails.
  const rollback=fixture(),first=rollback.regular('retained');await apply(rollback,'regular',first);
  const history=JSON.stringify(rollback.db.prepare('SELECT * FROM booking_confirmation_jobs').all());rollback.env.PAYMENT_RECONCILIATION_ENABLED='false';
  await apply(rollback,'regular',rollback.regular('after-rollback'));assert.equal(rollback.count('verified_payment_claims'),1);
  assert.equal(JSON.stringify(rollback.db.prepare("SELECT * FROM booking_confirmation_jobs WHERE booking_id='retained'").all()),history);
  assert.deepEqual(rollback.db.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('PASS expired-hold manual review; flag rollback preserves claim/email history and subsequent checkout fulfilment; actual-schema foreign keys clean');
  if(process.argv[3]){
    const oldSpecialUrl=pathToFileURL(process.argv[3]+'/special-events.js').href;
    const oldSource=readFileSync(process.argv[3]+'/_worker.js','utf8').replaceAll("'./special-events.js'",JSON.stringify(oldSpecialUrl));
    const oldWorker=await import(`data:text/javascript;base64,${Buffer.from(oldSource+'\nexport {applySumUpCheckoutState,processBookingConfirmations,runProtectedEmailAutomations};').toString('base64')}`);
    const oldSpecial=await import(oldSpecialUrl);
    await oldWorker.applySumUpCheckoutState(rollback.env,rollback.regular('original-main'),checkout(rollback.db.prepare("SELECT * FROM bookings WHERE id='original-main'").get()));
    await oldWorker.processBookingConfirmations(rollback.env);
    assert.equal(rollback.db.prepare("SELECT status FROM booking_confirmation_jobs WHERE booking_id='original-main'").get().status,'SENT');
    const event=rollback.special('original-event');await oldSpecial.applySpecialEventCheckoutState(rollback.env,event,checkout(event));
    assert.equal(rollback.count('special_event_attendees'),2);assert.equal(rollback.count('special_event_attendance'),4);
    assert.equal(rollback.count('verified_payment_claims'),1);assert.deepEqual(rollback.db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(JSON.stringify(rollback.db.prepare("SELECT * FROM booking_confirmation_jobs WHERE booking_id='retained'").all()),history);
    console.log('PASS exact original main payment/sender modules run on retained 0038/0039 schema; previous claim and confirmation history unchanged');
  }
}finally{globalThis.fetch=originalFetch;}
