// Customer care domain. No schema installation, logging, cron or provider credentials here.
export const reply=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','pragma':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers}});
const text=(v,max=4000)=>String(v??'').trim().slice(0,max);
const email=v=>text(v,254).toLowerCase();
const emailOK=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const uid=()=>crypto.randomUUID();
export const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value)),b=>b.toString(16).padStart(2,'0')).join('');
export const enabled=(env,key)=>String(env[key]||'').toLowerCase()==='true';
const iso=minutes=>new Date(Date.now()+minutes*60000).toISOString();
const stmt=(env,sql,...args)=>env.BOOKINGS_DB.prepare(sql).bind(...args);
const rows=async query=>(await query.all()).results||[];
const sameOrigin=request=>request.headers.get('Origin')===new URL(request.url).origin;
export function requireWrite(request){if(!sameOrigin(request))throw new Error('ORIGIN_REQUIRED');}
const allowedError=/^(ORIGIN_REQUIRED|INVALID_INPUT|NOT_FOUND|STALE_REQUEST|INVALID_OR_USED_ADMISSION|APPROVAL_REQUIRED|TRANSFER_ELIGIBILITY|REFUND_NOT_AUTHORISED|ADMISSION_ALREADY_USED|INVALID_ADMISSION|EVIDENCE_LIMIT|AMBIGUOUS_DAY_ALLOCATION|OPERATION_INCOMPLETE)$/;
export function safeError(error){const code=String(error?.message||'').match(/[A-Z_]{5,}/g)?.find(code=>allowedError.test(code));return reply({error:code||'REQUEST_COULD_NOT_BE_COMPLETED',manual_review:!code},code==='NOT_FOUND'?404:409);}
export async function manageSession(request,env){
 const token=request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-event_manage=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return null;
 return stmt(env,`SELECT s.booking_id FROM event_management_sessions s WHERE s.token_hash=? AND s.expires_at>?`,await digest(token),iso(0)).first();
}
function randomToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');}
export async function requestAccess(env,{reference,contact}){
 // The response never reveals whether a booking exists. Email goes only to the stored purchaser.
 const booking=await stmt(env,`SELECT id,customer_email FROM special_event_bookings WHERE reference=? AND lower(customer_email)=? AND paid_at IS NOT NULL`,text(reference,80),email(contact)).first();
 if(!booking)return {ok:true};
 const challenge=uid(),code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
 const hash=await digest(`${challenge}:${code}`);
 await env.BOOKINGS_DB.batch([
 stmt(env,`INSERT INTO event_management_challenges(id,booking_id,code_hash,expires_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM event_management_challenges WHERE booking_id=? AND created_at>datetime('now','-1 hour'))<3`,challenge,booking.id,hash,iso(10),booking.id),
 stmt(env,`INSERT INTO event_management_notifications(id,booking_id,recipient_email,kind,payload_json) SELECT ?,?,?, 'ACCESS_CODE',? WHERE EXISTS(SELECT 1 FROM event_management_challenges WHERE id=?)`,challenge,booking.id,booking.customer_email,JSON.stringify({challenge,code}),challenge)
 ]);
 return {ok:true};
}
export async function verifyAccess(env,{challenge,code}){
 const token=randomToken(),hash=await digest(`${text(challenge,80)}:${text(code,6)}`),tokenHash=await digest(token);
 // Single batch: every guess increments, one-use claim and session creation cannot split.
 const out=await env.BOOKINGS_DB.batch([
 stmt(env,`UPDATE event_management_challenges SET attempts=attempts+1 WHERE id=? AND consumed_at IS NULL AND expires_at>? AND attempts<5`,text(challenge,80),iso(0)),
 stmt(env,`INSERT INTO event_management_sessions(token_hash,booking_id,expires_at) SELECT ?,booking_id,? FROM event_management_challenges WHERE changes()=1 AND id=? AND code_hash=? AND attempts BETWEEN 1 AND 5 AND consumed_at IS NULL AND expires_at>?`,tokenHash,iso(60),text(challenge,80),hash,iso(0)),
 stmt(env,`UPDATE event_management_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM event_management_sessions WHERE token_hash=?)`,text(challenge,80),tokenHash)
 ]);
 if(!out[1]?.meta?.changes)return null;
 return token;
}
export async function bookingManagementView(env,bookingId){
 const booking=await stmt(env,`SELECT b.reference,b.customer_name,b.quantity,b.status,b.effective_quantity,p.name AS ticket_type,e.refund_policy FROM event_effective_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id JOIN special_events e ON e.id=b.event_id WHERE b.id=?`,bookingId).first();
 if(!booking)throw new Error('NOT_FOUND');
 return {booking,attendees:await rows(stmt(env,`SELECT a.id,a.name,a.status,a.age_at_event,group_concat(d.label,', ') AS sessions FROM special_event_attendees a LEFT JOIN special_event_attendance x ON x.attendee_id=a.id LEFT JOIN special_event_days d ON d.id=x.day_id WHERE a.booking_id=? GROUP BY a.id ORDER BY a.name`,bookingId)),requests:await rows(stmt(env,`SELECT id,kind,status,cancellation_state,transfer_state,requested_refund_pence,created_at,closed_at FROM event_change_requests WHERE booking_id=? ORDER BY created_at DESC`,bookingId))};
}
export async function submitRequest(env,bookingId,body){
 if(!['CANCELLATION','REFUND','TRANSFER'].includes(body.kind)||!text(body.idempotency_key,100))throw new Error('INVALID_INPUT');
 const prior=await stmt(env,`SELECT id,booking_id FROM event_change_requests WHERE submission_key=?`,body.idempotency_key).first();
 if(prior){if(prior.booking_id!==bookingId)throw new Error('INVALID_INPUT');return {id:prior.id,duplicate:true};}
 const booking=await stmt(env,`SELECT id,customer_email FROM special_event_bookings WHERE id=? AND status='PAID' AND paid_at IS NOT NULL`,bookingId).first();
 if(!booking)throw new Error('NOT_FOUND');
 const ids=Array.isArray(body.items)?body.items:[];
 if(ids.length>20||(['CANCELLATION','TRANSFER'].includes(body.kind)&&!ids.length))throw new Error('INVALID_INPUT');
 if(new Set(ids.map(i=>i.attendee_id)).size!==ids.length)throw new Error('INVALID_INPUT');
 const amount=body.requested_refund_pence??null;
 if(amount!==null&&(!Number.isSafeInteger(amount)||amount<0))throw new Error('INVALID_INPUT');
 const id=uid(),statements=[stmt(env,`INSERT INTO event_change_requests(id,booking_id,kind,reason,requested_refund_pence,cancellation_state,transfer_state,submission_key) VALUES(?,?,?,?,?,?,?,?)`,id,bookingId,body.kind,text(body.reason),amount,body.kind==='CANCELLATION'?'REQUESTED':'NONE',body.kind==='TRANSFER'?'REQUESTED':'NONE',body.idempotency_key)];
 for(const item of ids){
 const valid=await stmt(env,`SELECT id FROM event_effective_attendees WHERE id=? AND booking_id=?`,text(item.attendee_id,160),bookingId).first();
 if(!valid)throw new Error('INVALID_ADMISSION');
 if(body.kind==='TRANSFER'&&(!text(item.replacement_name,120)||!emailOK(email(item.replacement_email))||!Number.isInteger(item.replacement_age)))throw new Error('INVALID_INPUT');
 statements.push(stmt(env,`INSERT INTO event_change_items(request_id,attendee_id,replacement_name,replacement_email,replacement_age,guardian_name,guardian_email,guardian_phone) VALUES(?,?,?,?,?,?,?,?)`,id,valid.id,text(item.replacement_name,120)||null,email(item.replacement_email)||null,item.replacement_age??null,text(item.guardian_name,120)||null,email(item.guardian_email)||null,text(item.guardian_phone,40)||null));
 }
 statements.push(stmt(env,`INSERT INTO event_management_notifications(id,booking_id,recipient_email,kind,payload_json) VALUES(?,?,?,'REQUEST_RECEIVED',?)`,id,bookingId,booking.customer_email,JSON.stringify({request_id:id})),stmt(env,`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) SELECT ?,event_id,'CUSTOMER_REQUEST_SUBMITTED','CHANGE_REQUEST',?,'CUSTOMER','Customer request submitted; no admission or financial change.',? FROM special_event_bookings WHERE id=?`,uid(),id,`request:${id}`,bookingId));
 await env.BOOKINGS_DB.batch(statements);
 return {id,status:'SUBMITTED'};
}
export async function decideRequest(env,actor,body){
 if(!text(body.operation_id,100)||!text(body.reason)||!Number.isInteger(body.version))throw new Error('INVALID_INPUT');
 const prior=await stmt(env,`SELECT * FROM event_change_operations WHERE id=?`,body.operation_id).first();
 if(prior){if(prior.request_id!==body.request_id||prior.action!==body.action||prior.actor!==actor||prior.reason!==text(body.reason)||prior.expected_version!==body.version)throw new Error('INVALID_INPUT');return {ok:true,duplicate:true};}
 await stmt(env,`INSERT INTO event_change_operations(id,request_id,expected_version,action,actor,reason) VALUES(?,?,?,?,?,?)`,body.operation_id,body.request_id,body.version,body.action,actor,text(body.reason)).run();
 return {ok:true};
}
export async function authoriseRefund(env,actor,body){
 if(!Number.isSafeInteger(body.amount_pence)||body.amount_pence<=0||!text(body.operation_id,100))throw new Error('INVALID_INPUT');
 const booking=await stmt(env,`SELECT b.* FROM special_event_bookings b JOIN event_change_requests r ON r.booking_id=b.id WHERE r.id=? AND r.status='APPROVED'`,body.request_id).first();
 if(!booking)throw new Error('NOT_FOUND');
 const existing=await stmt(env,`SELECT * FROM event_refund_operations WHERE id=?`,body.operation_id).first();
 if(existing){if(existing.request_id!==body.request_id||existing.amount_pence!==body.amount_pence)throw new Error('INVALID_INPUT');return {ok:true,duplicate:true};}
 await env.BOOKINGS_DB.batch([stmt(env,`INSERT INTO event_refund_operations(id,request_id,booking_id,amount_pence,author,transaction_id,merchant_code) VALUES(?,?,?,?,?,?,?)`,body.operation_id,body.request_id,booking.id,body.amount_pence,actor,booking.provider_transaction_id,text(env.SUMUP_MERCHANT_CODE,80)),stmt(env,`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'REFUND_AUTHORISED','REFUND',?,?,'Exact refund amount authorised; not executed.',?)`,uid(),booking.event_id,body.operation_id,actor,`refund-authorised:${body.operation_id}`)]);
 return {ok:true,status:'AUTHORISED'};
}
// This function takes a narrowly typed provider adapter. It never retries a POST.
// Adapter must verify exact checkout, merchant, GBP, captured transaction, previous refunds.
export async function executeRefund(env,actor,id,provider){
 if(!enabled(env,'EVENT_REFUND_EXECUTION_ENABLED'))throw new Error('REFUND_EXECUTION_DISABLED');
 let op=await stmt(env,`SELECT r.*,b.provider_checkout_id,b.reference,b.amount_pence AS paid_pence FROM event_refund_operations r JOIN special_event_bookings b ON b.id=r.booking_id WHERE r.id=?`,id).first();
 if(!op)throw new Error('NOT_FOUND');
 if(op.status!=='AUTHORISED')return {status:op.status,duplicate:true};
 if(!provider?.verifyExactPayment||!provider?.refundMinorUnits)throw new Error('PROVIDER_ADAPTER_UNAVAILABLE');
 const verified=await provider.verifyExactPayment(op);
 if(!verified?.exact||!Number.isSafeInteger(verified.refunded_pence)||verified.refunded_pence<0||op.amount_pence>op.paid_pence-verified.refunded_pence)throw new Error('PAYMENT_REQUIRES_MANUAL_REVIEW');
 const claim=await stmt(env,`UPDATE event_refund_operations SET status='STARTED',baseline_refunded_pence=?,started_at=CURRENT_TIMESTAMP WHERE id=? AND status='AUTHORISED'`,verified.refunded_pence,id).run();
 if(!claim.meta?.changes)return {status:'ALREADY_CLAIMED'};
 try{
 const result=await provider.refundMinorUnits({merchant_code:op.merchant_code,transaction_id:op.transaction_id,amount:op.amount_pence,operation_id:op.id});
 // 201 alone is insufficient. Only exact provider refund event + matching amount completes.
 if(result?.confirmed===true&&result.operation_id===id&&result.amount_pence===op.amount_pence&&text(result.provider_refund_id,180)){
 await env.BOOKINGS_DB.batch([stmt(env,`UPDATE event_refund_operations SET status='CONFIRMED',provider_refund_id=?,provider_confirmed_pence=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=? AND status='STARTED'`,result.provider_refund_id,result.amount_pence,id),stmt(env,`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) SELECT ?,event_id,'REFUND_PROVIDER_CONFIRMED','REFUND',?,?,'Provider refund evidence verified.',? FROM special_event_bookings WHERE id=?`,uid(),id,actor,`refund-confirmed:${id}`,op.booking_id)]);
 return {status:'CONFIRMED'};
 }
 }catch{/* Do not record provider body, credentials or personal information. */}
 await stmt(env,`UPDATE event_refund_operations SET status='UNKNOWN_REVIEW' WHERE id=? AND status='STARTED'`,id).run();
 return {status:'UNKNOWN_REVIEW',retry_allowed:false};
}
export function validateEvidence(bytes,type){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>5242880)throw new Error('INVALID_INPUT');
 const starts=(...signature)=>signature.every((b,i)=>bytes[i]===b);
 if(type==='application/pdf'&&starts(37,80,68,70,45))return true;
 if(type==='image/png'&&starts(137,80,78,71,13,10,26,10))return true;
 if(type==='image/jpeg'&&starts(255,216,255)&&bytes.at(-2)===255&&bytes.at(-1)===217)return true;
 throw new Error('INVALID_INPUT');
}
export async function uploadEvidence(env,bookingId,requestId,file){
 const owned=await stmt(env,`SELECT id FROM event_change_requests WHERE id=? AND booking_id=? AND closed_at IS NULL`,requestId,bookingId).first();
 if(!owned||!env.EVENT_EVIDENCE_BUCKET)throw new Error('NOT_FOUND');
 const bytes=new Uint8Array(await file.arrayBuffer());validateEvidence(bytes,file.type);
 const id=uid(),key=`quarantine/${id}`;
 // Metadata first enforces the concurrent three-file cap. Failure leaves a removable quarantine record.
 await stmt(env,`INSERT INTO event_evidence(id,request_id,object_key,media_type,bytes,sha256) VALUES(?,?,?,?,?,?)`,id,requestId,key,file.type,bytes.length,await digest(bytes)).run();
 await env.EVENT_EVIDENCE_BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
 // No scanner binding means quarantine remains closed. Scanner is isolated, never a public callback.
 if(env.EVENT_EVIDENCE_SCANNER){
 const result=await env.EVENT_EVIDENCE_SCANNER.scan({key,sha256:await digest(bytes)});
 if(result?.verdict==='CLEAN'&&result.sha256===await digest(bytes)&&text(result.reference,180))await stmt(env,`UPDATE event_evidence SET state='CLEAN',scan_reference=? WHERE id=? AND state='QUARANTINED'`,result.reference,id).run();
 else if(result?.verdict==='INFECTED')await stmt(env,`UPDATE event_evidence SET state='REJECTED',scan_reference=? WHERE id=? AND state='QUARANTINED'`,text(result.reference,180),id).run();
 }
 return {id,state:(await stmt(env,`SELECT state FROM event_evidence WHERE id=?`,id).first()).state};
}
export async function deleteEvidence(env,id,actor){
 const claimed=await stmt(env,`UPDATE event_evidence SET state='DELETE_PENDING' WHERE id=? AND legal_hold=0 AND state<>'DELETED'`,id).run();
 if(!claimed.meta?.changes)throw new Error('NOT_FOUND');
 const record=await stmt(env,`SELECT * FROM event_evidence WHERE id=?`,id).first();
 await env.EVENT_EVIDENCE_BUCKET.delete(record.object_key);
 await env.BOOKINGS_DB.batch([stmt(env,`UPDATE event_evidence SET state='DELETED',sha256='',scan_reference=NULL,deleted_at=CURRENT_TIMESTAMP WHERE id=? AND legal_hold=0`,id),stmt(env,`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) SELECT ?,b.event_id,'EVIDENCE_DELETED','EVIDENCE',?,?,'Private evidence deleted; content not retained in audit.',? FROM event_change_requests r JOIN special_event_bookings b ON b.id=r.booking_id WHERE r.id=?`,uid(),id,actor,`evidence-delete:${id}`,record.request_id)]);
 return {ok:true};
}
export async function evidenceDownload(env,id,bookingId=null){
 const record=await stmt(env,`SELECT e.* FROM event_evidence e JOIN event_change_requests r ON r.id=e.request_id WHERE e.id=? AND e.state='CLEAN' AND (? IS NULL OR r.booking_id=?)`,id,bookingId,bookingId).first();
 if(!record)return reply({error:'NOT_FOUND'},404);
 const object=await env.EVENT_EVIDENCE_BUCKET?.get(record.object_key);
 if(!object)return reply({error:'NOT_FOUND'},404);
 return new Response(object.body,{headers:{'content-type':record.media_type,'content-disposition':`attachment; filename="evidence.${record.media_type==='application/pdf'?'pdf':record.media_type==='image/png'?'png':'jpg'}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'"}});
}
export async function processManagementNotifications(env,send,limit=10,table='event_management_notifications'){
 if(!['event_management_notifications','event_waitlist_notifications'].includes(table))throw new Error('INVALID_INPUT');
 if(!enabled(env,'EVENT_MANAGEMENT_NOTIFICATIONS_ENABLED'))return {disabled:true};
 // Crash/timeout after a send may have been accepted. Do not blindly reclaim and send again.
 await stmt(env,`UPDATE ${table} SET status='UNKNOWN_REVIEW' WHERE status='SENDING' AND leased_at<datetime('now','-10 minutes')`).run();
 const pending=await rows(stmt(env,`SELECT * FROM ${table} WHERE status IN('READY','RETRY') AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at,id LIMIT ?`,iso(0),Math.min(10,limit)));
 let accepted=0;
 for(const item of pending){
 const lease=uid(),claimed=await stmt(env,`UPDATE ${table} SET status='SENDING',lease_id=?,leased_at=CURRENT_TIMESTAMP,attempts=attempts+1 WHERE id=? AND status IN('READY','RETRY')`,lease,item.id).run();
 if(!claimed.meta?.changes)continue;
 const content=managementNotificationCopy(item);
 try{
 const result=await send(item.recipient_email,content.subject,content.html,content.text,{idempotencyKey:`event-care:${item.id}`});
 if(result?.id||result?.provider_id){await stmt(env,`UPDATE ${table} SET status='SENT',provider_id=?,sent_at=CURRENT_TIMESTAMP WHERE id=? AND lease_id=?`,result.id||result.provider_id,item.id,lease).run();accepted++;}
 else await stmt(env,`UPDATE ${table} SET status=?,next_attempt_at=? WHERE id=? AND lease_id=?`,result?.definitely_not_accepted?'RETRY':'UNKNOWN_REVIEW',iso(5),item.id,lease).run();
 }catch{await stmt(env,`UPDATE ${table} SET status='UNKNOWN_REVIEW' WHERE id=? AND lease_id=?`,item.id,lease).run();}
 }
 return {accepted};
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function managementNotificationCopy(item){
 const data=JSON.parse(item.payload_json),base='Please reply to bookings@bootscootinlinedancing.co.uk if you need help. No card or bank details are needed.';
 let message;
 if(item.kind==='WAITLIST_CODE')message=`Your waiting-list verification code is ${data.code}. Enter challenge ${data.challenge} and the code on the waiting-list page within 10 minutes. Joining does not guarantee a place.`;
 else if(item.kind==='WAITLIST_OFFER')message=`There is a Johnny Rossato waiting-list offer for your group of ${data.quantity}. Sign in to the waiting-list page to review and accept before ${data.expiry}. Acceptance gives a 15-minute checkout reservation; a place is confirmed only after successful payment and booking confirmation. No payment has been taken automatically.`;
 else if(item.kind==='ACCESS_CODE')message=`Your booking-management verification code is ${data.code}. Enter challenge ${data.challenge} with this code on the booking-management page. It expires after 10 minutes. If you did not request this, ignore this email.`;
 else if(item.kind==='REQUEST_RECEIVED')message=`We have received your booking change request (${data.request_id}). Your admission has not been cancelled or transferred, and no refund has been issued. We will review your request under the published event policy.`;
 else if(item.kind==='TRANSFER_COMPLETED')message='An owner-approved Johnny Rossato attendee transfer has been completed. The purchaser retains control of the booking. Please contact us for admission enquiries.';
 else message=`Your Johnny Rossato booking change request has been updated: ${data.status}. ${data.action==='CANCEL'?'The approved admission cancellation is committed. This does not mean money has been refunded.':data.action==='TRANSFER'?'The approved attendee transfer is complete.':'Please open Manage My Booking for the operational status. Approval alone does not mean a refund has been issued.'}`;
 const body=`Hey there! 🤠\n\n${message}\n\n${base}\n\nBoot Scootin’ Line Dancing`;
 return {subject:item.kind==='ACCESS_CODE'?'Boot Scootin’ booking-management code':'Your Johnny Rossato booking request',text:body,html:`<div style="white-space:pre-wrap">${escape(body)}</div>`};
}
export async function customerManagement(request,env){
 if(!enabled(env,'EVENT_MANAGEMENT_ENABLED'))return reply({error:'NOT_AVAILABLE'},404);
 try{
 const url=new URL(request.url),action=url.searchParams.get('action')||'booking';
 if(request.method==='POST')requireWrite(request);
 if(action==='access'&&request.method==='POST'){
 if(!enabled(env,'EVENT_MANAGEMENT_NOTIFICATIONS_ENABLED'))return reply({error:'SERVICE_UNAVAILABLE'},503);
 return reply(await requestAccess(env,await request.json()),202);
 }
 if(action==='verify'&&request.method==='POST'){
 const token=await verifyAccess(env,await request.json());
 return token?reply({ok:true},200,{'set-cookie':`__Host-event_manage=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`}):reply({error:'VERIFICATION_UNSUCCESSFUL'},403);
 }
 const session=await manageSession(request,env);if(!session)return reply({error:'SIGN_IN_REQUIRED'},401);
 if(action==='booking'&&request.method==='GET')return reply(await bookingManagementView(env,session.booking_id));
 if(action==='request'&&request.method==='POST')return reply(await submitRequest(env,session.booking_id,await request.json()),201);
 if(action==='evidence'&&request.method==='POST'){
 const length=Number(request.headers.get('content-length'));if(!length||length>5242880+65536)return reply({error:'UPLOAD_TOO_LARGE_OR_LENGTH_MISSING'},413);
 const form=await request.formData(),file=form.get('file');if(!file||!form.get('request_id'))throw new Error('INVALID_INPUT');
 return reply(await uploadEvidence(env,session.booking_id,text(form.get('request_id'),100),file),201);
 }
 if(action==='evidence'&&request.method==='GET')return evidenceDownload(env,url.searchParams.get('id'),session.booking_id);
 return reply({error:'NOT_FOUND'},404);
 }catch(error){return safeError(error);}
}
export async function adminManagement(request,env,admin,services={}){
 if(!enabled(env,'EVENT_MANAGEMENT_ENABLED'))return reply({error:'NOT_AVAILABLE'},404);
 try{
 if(admin.email?.toLowerCase()!==email(env.ADMIN_EMAIL))return reply({error:'OWNER_REQUIRED'},403);
 const url=new URL(request.url);
 if(request.method==='GET'){
 if(url.searchParams.get('evidence'))return evidenceDownload(env,url.searchParams.get('evidence'));
 const eventId=url.searchParams.get('event_id');if(!eventId)throw new Error('INVALID_INPUT');
 return reply({requests:await rows(stmt(env,`SELECT r.*,b.reference,b.customer_name,b.customer_email,b.amount_pence FROM event_change_requests r JOIN special_event_bookings b ON b.id=r.booking_id WHERE b.event_id=? ORDER BY r.created_at DESC LIMIT 250`,eventId)),items:await rows(stmt(env,`SELECT i.*,a.name AS original_name FROM event_change_items i JOIN event_change_requests r ON r.id=i.request_id JOIN special_event_bookings b ON b.id=r.booking_id JOIN special_event_attendees a ON a.id=i.attendee_id WHERE b.event_id=?`,eventId)),refunds:await rows(stmt(env,`SELECT r.* FROM event_refund_operations r JOIN special_event_bookings b ON b.id=r.booking_id WHERE b.event_id=?`,eventId)),evidence:await rows(stmt(env,`SELECT e.id,e.request_id,e.media_type,e.bytes,e.state,e.legal_hold,e.created_at FROM event_evidence e JOIN event_change_requests r ON r.id=e.request_id JOIN special_event_bookings b ON b.id=r.booking_id WHERE b.event_id=?`,eventId)),notifications:await rows(stmt(env,`SELECT n.id,n.kind,n.status,n.provider_id,n.created_at,n.sent_at FROM event_management_notifications n JOIN special_event_bookings b ON b.id=n.booking_id WHERE b.event_id=?`,eventId))});
 }
 requireWrite(request);const body=await request.json();
 if(body.action==='AUTHORISE_REFUND')return reply(await authoriseRefund(env,admin.email,body));
 if(body.action==='VERIFY_REFUND'){
 const op=await stmt(env,`SELECT r.*,b.amount_pence AS paid_pence FROM event_refund_operations r JOIN special_event_bookings b ON b.id=r.booking_id WHERE r.id=? AND r.status IN('STARTED','UNKNOWN_REVIEW')`,body.operation_id).first();
 if(!op||!services.refundProvider?.verifyRefundEvent||!text(body.provider_event_id,80)||!text(body.reason))throw new Error('INVALID_INPUT');
 const evidence=await services.refundProvider.verifyRefundEvent(op,body.provider_event_id);
 await env.BOOKINGS_DB.batch([stmt(env,`UPDATE event_refund_operations SET status='CONFIRMED',provider_refund_id=?,provider_confirmed_pence=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=? AND status IN('STARTED','UNKNOWN_REVIEW')`,evidence.provider_refund_id,evidence.amount_pence,op.id),stmt(env,`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) SELECT ?,event_id,'REFUND_OWNER_PROVIDER_VERIFIED','REFUND',?,?,'Owner verified exact provider refund event; no payment request repeated.',? FROM special_event_bookings WHERE id=?`,uid(),op.id,admin.email,`refund-verified:${op.id}`,op.booking_id)]);
 return reply({ok:true,status:'CONFIRMED'});
 }
 if(body.action==='EXECUTE_REFUND')return reply(await executeRefund(env,admin.email,body.operation_id,services.refundProvider));
 if(body.action==='DELETE_EVIDENCE')return reply(await deleteEvidence(env,body.evidence_id,admin.email));
 if(body.action==='PROCESS_NOTIFICATIONS')return reply(await processManagementNotifications(env,services.sendEmail,10));
 return reply(await decideRequest(env,admin.email,body));
 }catch(error){return safeError(error);}
}
