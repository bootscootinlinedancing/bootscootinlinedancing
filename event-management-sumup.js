// Current merchant refund API: request amount is GBP minor units (pence).
// Transaction and checkout amounts / event amounts are major units. No generic fetch or credential access.
import {verifySpecialEventCheckout} from './special-events.js';
const pence=value=>{if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))throw Error('PROVIDER_AMOUNT_INVALID');const result=Math.round(Number(value)*100);if(!Number.isSafeInteger(result)||Math.abs(Number(value)*100-result)>0.00001||result<0)throw Error('PROVIDER_AMOUNT_INVALID');return result};
async function data(response){if(!response?.ok)throw Error('PROVIDER_UNAVAILABLE');return response.json()}
export function sumUpRefundProvider(env,fetchSumUp){
 const fetchJson=async(path,options={method:'GET'})=>data(await fetchSumUp(env,path,options));
 const transaction=op=>fetchJson(`/v2.1/merchants/${encodeURIComponent(op.merchant_code)}/transactions?id=${encodeURIComponent(op.transaction_id)}`);
 function events(tx){
  const list=tx.transaction_events??tx.events;if(!Array.isArray(list))throw Error('PROVIDER_REFUND_HISTORY_MISSING');
  return list.filter(e=>(e.event_type||e.type)==='REFUND').map(e=>({id:String(e.id??''),status:e.status,amount_pence:pence(e.amount),timestamp:e.timestamp||e.date}));
 }
 return {
 async verifyExactPayment(op){
  if(op.merchant_code!==String(env.SUMUP_MERCHANT_CODE)||!op.provider_checkout_id)throw Error('PAYMENT_REQUIRES_MANUAL_REVIEW');
  const booking=await env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_bookings WHERE id=?`).bind(op.booking_id).first();
  const checkout=await fetchJson(`/v0.1/checkouts/${encodeURIComponent(op.provider_checkout_id)}`);
  const verified=verifySpecialEventCheckout(booking,checkout,op.merchant_code);
  if(!verified.ok||verified.status!=='PAID'||!Array.isArray(checkout.transactions)||checkout.transactions.filter(t=>t.status==='SUCCESSFUL').length!==1||checkout.transactions.find(t=>t.status==='SUCCESSFUL')?.id!==op.transaction_id)throw Error('PAYMENT_REQUIRES_MANUAL_REVIEW');
  // All known payment families are checked; missing historical schema fails closed.
  for(const [table,column,local] of [['special_event_bookings','provider_transaction_id',true],['bookings','provider_transaction_id',false],['member_passes','provider_transaction_id',false],['merch_orders','provider_transaction_id',false],['private_event_payments','provider_reference',false],['payments','provider_reference',false]]){
   const checkoutColumn=['private_event_payments','payments'].includes(table)?'provider_reference':'provider_checkout_id';
   const claim=await env.BOOKINGS_DB.prepare(`SELECT id FROM ${table} WHERE (${column}=? OR ${checkoutColumn}=?)${local?' AND id<>?':''} LIMIT 1`).bind(...(local?[op.transaction_id,op.provider_checkout_id,op.booking_id]:[op.transaction_id,op.provider_checkout_id])).first();if(claim)throw Error('PAYMENT_DUPLICATE_CLAIM');
  }
  const tx=await transaction(op);if(tx.id!==op.transaction_id||tx.merchant_code!==op.merchant_code||tx.currency!=='GBP'||pence(tx.amount)!==op.paid_pence||!['SUCCESSFUL','REFUNDED'].includes(tx.status))throw Error('PAYMENT_REQUIRES_MANUAL_REVIEW');
  const refunds=events(tx);if(refunds.some(e=>!['SUCCESSFUL','REFUNDED','FAILED'].includes(e.status)))throw Error('PROVIDER_REFUND_UNRESOLVED');
  return {exact:true,refunded_pence:refunds.filter(e=>['SUCCESSFUL','REFUNDED'].includes(e.status)).reduce((sum,e)=>sum+e.amount_pence,0)};
 },
 async refundMinorUnits(input){
  const response=await fetchSumUp(env,`/v1.0/merchants/${encodeURIComponent(input.merchant_code)}/payments/${encodeURIComponent(input.transaction_id)}/refunds`,{method:'POST',body:JSON.stringify({amount:input.amount})});
  if(response.status!==201)throw Error('REFUND_REQUIRES_MANUAL_REVIEW');
  // API does not promise a request idempotency key or a uniquely correlated response body.
  // Never infer that an unrelated new event belongs to this POST. Owner verifies its event ID.
  return {confirmed:false};
 },
 async verifyRefundEvent(op,eventId){
  const tx=await transaction(op);if(tx.id!==op.transaction_id||tx.merchant_code!==op.merchant_code||tx.currency!=='GBP'||pence(tx.amount)!==op.paid_pence)throw Error('PAYMENT_REQUIRES_MANUAL_REVIEW');
  const match=events(tx).find(e=>e.id===String(eventId));
  if(!match||!Number.isFinite(Date.parse(match.timestamp))||Date.parse(match.timestamp)<Date.parse(op.started_at+'Z')||!['SUCCESSFUL','REFUNDED'].includes(match.status)||match.amount_pence!==op.amount_pence)throw Error('REFUND_REQUIRES_MANUAL_REVIEW');
  return {provider_refund_id:match.id,amount_pence:match.amount_pence};
 }
 };
}
