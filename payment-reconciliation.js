// Shared by callbacks, returns, HQ and the bounded recovery worker. No customer copy.
export const reconciliationEnabled=env=>String(env.PAYMENT_RECONCILIATION_ENABLED)==='true';
const tableFor=kind=>kind==='regular'?'bookings':'special_event_bookings';
export function verifiedTransaction(booking,checkout,merchant){
  if(!checkout||checkout.id!==booking.provider_checkout_id||checkout.checkout_reference!==booking.reference||!merchant||checkout.merchant_code!==merchant||checkout.currency!=='GBP'||(booking.currency&&booking.currency!=='GBP')||Math.round(Number(checkout.amount)*100)!==Number(booking.amount_pence))throw Error('PAYMENT_REFERENCE_MISMATCH');
  const successful=(Array.isArray(checkout.transactions)?checkout.transactions:[]).filter(t=>t.status==='SUCCESSFUL');
  if(checkout.status!=='PAID')return null;
  if(successful.length!==1||!successful[0].id||successful[0].currency!=='GBP'||Math.round(Number(successful[0].amount)*100)!==Number(booking.amount_pence)|| (checkout.transaction_id&&checkout.transaction_id!==successful[0].id))throw Error('PAYMENT_TRANSACTION_AMBIGUOUS');
  return successful[0];
}
export async function paymentReview(env,kind,booking,code){
  await env.BOOKINGS_DB.prepare(`INSERT INTO payment_reconciliation_jobs(kind,booking_id,checkout_id,state,code,next_attempt_at) VALUES(?,?,?,'REVIEW',?,datetime('now','+1 day')) ON CONFLICT(kind,booking_id) DO UPDATE SET state='REVIEW',code=excluded.code,updated_at=CURRENT_TIMESTAMP`).bind(kind,booking.id,booking.provider_checkout_id,code).run();
}
export function paymentFulfilmentFence(env,kind,id){
  return reconciliationEnabled(env)?[env.BOOKINGS_DB.prepare(`UPDATE payment_reconciliation_jobs SET fulfil_guard=fulfil_guard+1 WHERE kind=? AND booking_id=?`).bind(kind,id)]:[];
}
export async function fulfilVerifiedPayment(env,kind,booking,checkout,fulfil){
  if(!reconciliationEnabled(env))return fulfil(booking,checkout);
  const db=env.BOOKINGS_DB,table=tableFor(kind),lease=crypto.randomUUID();
  await db.prepare(`INSERT OR IGNORE INTO payment_reconciliation_jobs(kind,booking_id,checkout_id) VALUES(?,?,?)`).bind(kind,booking.id,booking.provider_checkout_id).run();
  const locked=await db.prepare(`UPDATE payment_reconciliation_jobs SET lease_id=?,lease_until=datetime('now','+2 minutes') WHERE kind=? AND booking_id=? AND (lease_until IS NULL OR lease_until<=CURRENT_TIMESTAMP)`).bind(lease,kind,booking.id).run();
  if(!Number(locked.meta?.changes))return db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(booking.id).first();
  try{
    const current=await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(booking.id).first();
    if(!current||!['PENDING','PAID'].includes(current.status)||current.payment_provider!=='SUMUP')return current;
    if(current.status==='PAID')return current; // Never rewrite historical transaction IDs or emails.
    const transaction=verifiedTransaction(current,checkout,env.SUMUP_MERCHANT_CODE);
    if(!transaction)return current; // PENDING/FAILED/EXPIRED are observations, not captured funds.
    for(const [family,other,cc,tc] of [['regular','bookings','provider_checkout_id','provider_transaction_id'],['special','special_event_bookings','provider_checkout_id','provider_transaction_id'],['pass','member_passes','provider_checkout_id','provider_transaction_id'],['merch','merch_orders','provider_checkout_id','provider_transaction_id'],['private','private_event_payments','provider_reference','provider_reference'],['regular','payments','provider_reference','provider_reference']]){
      const rows=await db.prepare(`SELECT ${other==='payments'?'booking_id AS id':'id'} FROM ${other} WHERE ${cc}=? OR ${tc}=?`).bind(checkout.id,transaction.id).all();
      if((rows.results||[]).some(r=>family!==kind||r.id!==current.id))throw Error('PAYMENT_DUPLICATE_CLAIM');
    }
    if(kind==='regular'){
      const people=await db.prepare(`SELECT COUNT(*) total FROM booking_attendees WHERE booking_id=? AND attendance_status<>'CANCELLED'`).bind(current.id).first();
      if(Number(people?.total)!==Number(current.quantity))throw Error('PAYMENT_ATTENDEE_REVIEW');
    }
    // Unique keys close the race between different families/bookings claiming one payment.
    await db.prepare(`INSERT OR IGNORE INTO verified_payment_claims(checkout_id,transaction_id,kind,booking_id) VALUES(?,?,?,?)`).bind(checkout.id,transaction.id,kind,current.id).run();
    const claim=await db.prepare(`SELECT * FROM verified_payment_claims WHERE checkout_id=? OR transaction_id=?`).bind(checkout.id,transaction.id).all();
    if(claim.results?.length!==1||claim.results[0].kind!==kind||claim.results[0].booking_id!==current.id||claim.results[0].transaction_id!==transaction.id)throw Error('PAYMENT_DUPLICATE_CLAIM');
    // Capacity/cancellation triggers run in the same D1 transaction as the PAID transition.
    await fulfil(current,{...checkout,transaction_id:transaction.id,transactions:[transaction]});
    const after=await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(current.id).first();
    if(after?.status!=='PAID')throw Error('PAYMENT_FULFILMENT_INCOMPLETE');
    await db.prepare(`UPDATE payment_reconciliation_jobs SET state='COMPLETE',code=NULL,updated_at=CURRENT_TIMESTAMP WHERE kind=? AND booking_id=? AND lease_id=?`).bind(kind,current.id,lease).run();
    return after;
  }catch(error){
    // Fixed codes only: no provider payloads, credentials, contacts or exceptions in logs.
    const code=/^PAYMENT_[A-Z_]+$/.test(error.message)?error.message:'PAYMENT_FULFILMENT_REVIEW';
    await paymentReview(env,kind,booking,code);
    throw Error(code);
  }finally{await db.prepare(`UPDATE payment_reconciliation_jobs SET lease_id=NULL,lease_until=NULL WHERE kind=? AND booking_id=? AND lease_id=?`).bind(kind,booking.id,lease).run();}
}
export async function runBoundedReconciliation(env,{retrieve,regular,special,limit=4}={}){
  if(!reconciliationEnabled(env))return {disabled:true};
  const db=env.BOOKINGS_DB;
  // Oldest due observation first; provider failures back off without starving other bookings.
  const rows=await db.prepare(`SELECT c.* FROM (SELECT 'regular' kind,id,provider_checkout_id,created_at FROM bookings WHERE status='PENDING' AND payment_provider='SUMUP' AND provider_checkout_id IS NOT NULL UNION ALL SELECT 'special',id,provider_checkout_id,created_at FROM special_event_bookings WHERE status='PENDING' AND payment_provider='SUMUP' AND provider_checkout_id IS NOT NULL) c LEFT JOIN payment_reconciliation_jobs j ON j.kind=c.kind AND j.booking_id=c.id WHERE (j.state IS NULL OR j.state='WAIT') AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=CURRENT_TIMESTAMP) AND (j.lease_until IS NULL OR j.lease_until<=CURRENT_TIMESTAMP) ORDER BY COALESCE(j.next_attempt_at,c.created_at),c.kind,c.id LIMIT ?`).bind(Math.max(1,Math.min(4,Number(limit)||4))).all();
  const summary={inspected:0,paid:0,review:0,retry:0};
  for(const row of rows.results||[]){
    summary.inspected++;
    await db.prepare(`INSERT OR IGNORE INTO payment_reconciliation_jobs(kind,booking_id,checkout_id) VALUES(?,?,?)`).bind(row.kind,row.id,row.provider_checkout_id).run();
    const booking=await db.prepare(`SELECT * FROM ${tableFor(row.kind)} WHERE id=?`).bind(row.id).first();
    if(booking?.status!=='PENDING')continue;
    try{
      const checkout=await retrieve(row.kind,row.provider_checkout_id);
      if(!checkout)throw Error('PROVIDER_UNAVAILABLE');
      verifiedTransaction(booking,checkout,env.SUMUP_MERCHANT_CODE);
      if(checkout.status==='PAID'){
        await (row.kind==='regular'?regular:special)(booking,checkout);
        const fresh=await db.prepare(`SELECT status FROM ${tableFor(row.kind)} WHERE id=?`).bind(row.id).first();
        if(fresh?.status==='PAID'){summary.paid++;continue;}
      }
      if(['FAILED','EXPIRED'].includes(checkout.status)){await paymentReview(env,row.kind,booking,'PAYMENT_NOT_CAPTURED');summary.review++;continue;}
      throw Error('PROVIDER_PENDING');
    }catch(error){
      const job=await db.prepare(`SELECT state FROM payment_reconciliation_jobs WHERE kind=? AND booking_id=?`).bind(row.kind,row.id).first();
      if(job?.state==='REVIEW'){summary.review++;continue;}
      if(/^PAYMENT_/.test(error.message)){await paymentReview(env,row.kind,booking,error.message);summary.review++;continue;}
      await db.prepare(`UPDATE payment_reconciliation_jobs SET attempts=attempts+1,code='PROVIDER_RETRY',next_attempt_at=datetime('now','+'||MIN(360,5*(1<<MIN(attempts,6)))||' minutes'),updated_at=CURRENT_TIMESTAMP WHERE kind=? AND booking_id=?`).bind(row.kind,row.id).run();summary.retry++;
    }
  }
  console.info('PAYMENT_RECONCILIATION',JSON.stringify(summary));
  return summary;
}
export async function reconciliationWarnings(env){
  if(!reconciliationEnabled(env))return [];
  const jobs=(await env.BOOKINGS_DB.prepare(`SELECT kind,booking_id,checkout_id,code,updated_at FROM payment_reconciliation_jobs WHERE state='REVIEW' OR (state='WAIT' AND updated_at<datetime('now','-30 minutes')) ORDER BY updated_at LIMIT 50`).all()).results||[];
  const incomplete=(await env.BOOKINGS_DB.prepare(`SELECT 'special' kind,b.id booking_id,b.provider_checkout_id checkout_id,'PAYMENT_PAID_FULFILMENT_REVIEW' code,b.paid_at updated_at FROM special_event_bookings b WHERE b.status='PAID' AND b.payment_provider='SUMUP' AND ((SELECT COUNT(*) FROM special_event_attendees a WHERE a.booking_id=b.id AND a.status='ACTIVE')<>b.quantity OR NOT EXISTS(SELECT 1 FROM special_event_confirmation_outbox o WHERE o.booking_id=b.id)) LIMIT 25`).all()).results||[];
  return [...jobs,...incomplete];
}
