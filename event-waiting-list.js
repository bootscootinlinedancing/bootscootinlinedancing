import {reply,digest,enabled,requireWrite,safeError,processManagementNotifications} from './event-management.js';
const stmt=(env,sql,...v)=>env.BOOKINGS_DB.prepare(sql).bind(...v);
const rows=async q=>(await q.all()).results||[];
const uid=()=>crypto.randomUUID();
const email=s=>String(s||'').trim().toLowerCase();
const iso=m=>new Date(Date.now()+m*60000).toISOString();
const token=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function availablePlaces(env,productId){
 const product=await stmt(env,`SELECT p.*,e.status AS event_status,e.checkout_enabled,e.saturday_evening_capacity FROM special_event_ticket_products p JOIN special_events e ON e.id=p.event_id WHERE p.id=?`,productId).first();
 if(!product)return {available:0,eligible:false};
 const sold=await stmt(env,`SELECT coalesce(sum(effective_quantity),0) n FROM event_effective_bookings WHERE product_id=? AND status='PAID'`,productId).first(),held=await stmt(env,`SELECT coalesce(sum(quantity),0) n FROM special_event_holds WHERE product_id=? AND status='ACTIVE' AND julianday(expires_at)>julianday('now')`,productId).first();
 let available=product.allocation==null?0:product.allocation-sold.n-held.n;
 for(const day of await rows(stmt(env,`SELECT d.id,d.capacity,pd.places_per_ticket FROM special_event_product_days pd JOIN special_event_days d ON d.id=pd.day_id WHERE pd.product_id=?`,productId))){
 if(!day.places_per_ticket)continue;
 const used=await stmt(env,`SELECT coalesce((SELECT sum(bd.places) FROM event_effective_booking_days bd JOIN special_event_bookings b ON b.id=bd.booking_id WHERE bd.day_id=? AND b.status='PAID'),0)+coalesce((SELECT sum(h.quantity*pd.places_per_ticket) FROM special_event_holds h JOIN special_event_product_days pd ON pd.product_id=h.product_id WHERE pd.day_id=? AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now')),0) n`,day.id,day.id).first();available=Math.min(available,Math.floor(((day.capacity??0)-used.n)/day.places_per_ticket));
 }
 if(product.includes_saturday_evening){const used=await stmt(env,`SELECT coalesce((SELECT sum(b.effective_quantity) FROM event_effective_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id WHERE b.event_id=? AND b.status='PAID' AND p.includes_saturday_evening=1),0)+coalesce((SELECT sum(h.quantity) FROM special_event_holds h JOIN special_event_ticket_products p ON p.id=h.product_id WHERE h.event_id=? AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now') AND p.includes_saturday_evening=1),0) n`,product.event_id,product.event_id).first();available=Math.min(available,(product.saturday_evening_capacity??0)-used.n)}
 return {product,available:Math.max(0,available),eligible:product.product_type==='ADMISSION'&&['ACTIVE','SOLD_OUT'].includes(product.release_state)&&product.event_status==='PUBLISHED'&&!!product.checkout_enabled};
}
export async function requestWaitingAccess(env,body){
 const contact=email(body.email),name=String(body.name||'').trim().slice(0,120),q=Number(body.quantity);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)||!name||!Number.isInteger(q)||q<1||q>20)throw Error('INVALID_INPUT');
 const inventory=await availablePlaces(env,body.product_id);if(!inventory.eligible||q>Math.min(inventory.product.max_per_checkout||20,20))throw Error('WAIT_NOT_ELIGIBLE');
 const existing=await stmt(env,`SELECT id FROM event_waitlist_entries WHERE product_id=? AND email=? AND status IN('WAITING','OFFERED','CHECKOUT')`,body.product_id,contact).first();
 if(!existing&&inventory.available>=q)throw Error('PLACES_CURRENTLY_AVAILABLE');
 const id=uid(),code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
 await env.BOOKINGS_DB.batch([
 stmt(env,`INSERT INTO event_waitlist_challenges(id,product_id,name,email,quantity,code_hash,expires_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM event_waitlist_challenges WHERE email=? AND created_at>datetime('now','-1 hour'))<3`,id,body.product_id,name,contact,q,await digest(`${id}:${code}`),iso(10),contact),
 stmt(env,`INSERT INTO event_waitlist_notifications(id,recipient_email,kind,payload_json) SELECT ?,?,'WAITLIST_CODE',? WHERE EXISTS(SELECT 1 FROM event_waitlist_challenges WHERE id=?)`,id,contact,JSON.stringify({challenge:id,code}),id)
 ]);return {ok:true};
}
export async function verifyWaitingAccess(env,body){
 const value=token(),hash=await digest(`${body.challenge}:${body.code}`),entryId=uid(),sessionHash=await digest(value);
 const result=await env.BOOKINGS_DB.batch([
 stmt(env,`UPDATE event_waitlist_challenges SET attempts=attempts+1,verification_lease=? WHERE id=? AND consumed_at IS NULL AND attempts<5 AND expires_at>?`,sessionHash,body.challenge,iso(0)),
 stmt(env,`INSERT INTO event_waitlist_sessions(token_hash,entry_id,expires_at) SELECT ?,w.id,? FROM event_waitlist_challenges c JOIN event_waitlist_entries w ON w.product_id=c.product_id AND w.email=c.email AND w.status IN('WAITING','OFFERED','CHECKOUT') WHERE c.verification_lease=? AND c.id=? AND c.code_hash=? AND c.consumed_at IS NULL AND c.expires_at>?`,sessionHash,iso(60),sessionHash,body.challenge,hash,iso(0)),
 // A temporary one-use verification receipt makes the next statements independent of changes() chains.
 stmt(env,`UPDATE event_waitlist_challenges SET consumed_at=? WHERE id=? AND code_hash=? AND attempts BETWEEN 1 AND 5 AND expires_at>? AND consumed_at IS NULL AND verification_lease=?`,sessionHash,body.challenge,hash,iso(0),sessionHash),
 stmt(env,`INSERT INTO event_waitlist_entries(id,product_id,name,email,quantity) SELECT ?,product_id,name,email,quantity FROM event_waitlist_challenges c WHERE id=? AND consumed_at=? AND NOT EXISTS(SELECT 1 FROM event_waitlist_entries w WHERE w.product_id=c.product_id AND w.email=c.email AND w.status IN('WAITING','OFFERED','CHECKOUT'))`,entryId,body.challenge,sessionHash),
 stmt(env,`INSERT OR IGNORE INTO event_waitlist_sessions(token_hash,entry_id,expires_at) SELECT ?,w.id,? FROM event_waitlist_challenges c JOIN event_waitlist_entries w ON w.product_id=c.product_id AND w.email=c.email AND w.status IN('WAITING','OFFERED','CHECKOUT') WHERE c.id=? AND c.consumed_at=?`,sessionHash,iso(60),body.challenge,sessionHash)
 ]);
 return result[1]?.meta?.changes||result[4]?.meta?.changes?value:null;
}
export async function waitingSession(request,env){const raw=request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-event_wait=([a-f0-9]{64})(?:;|$)/)?.[1];return raw?stmt(env,`SELECT entry_id FROM event_waitlist_sessions WHERE token_hash=? AND expires_at>?`,await digest(raw),iso(0)).first():null}
export async function expireOffers(env){
 return stmt(env,`UPDATE event_waitlist_offers SET status='EXPIRED' WHERE (status='OFFERED' AND julianday(expires_at)<=julianday('now')) OR (status='CHECKOUT' AND julianday(checkout_expires_at)<=julianday('now'))`).run();
}
export async function makeOffer(env,entryId,actor='WAITLIST_PROCESSOR',overrideReason=null){
 const entry=await stmt(env,`SELECT w.*,p.event_id FROM event_waitlist_entries w JOIN special_event_ticket_products p ON p.id=w.product_id WHERE w.id=?`,entryId).first();if(!entry)throw Error('NOT_FOUND');
 const config=await stmt(env,`SELECT offer_minutes FROM event_waitlist_settings WHERE event_id=?`,entry.event_id).first();
 const id=uid();await stmt(env,`INSERT INTO event_waitlist_offers(id,entry_id,hold_id,expires_at,override_reason,actor) VALUES(?,?,?,?,?,?)`,id,entryId,`wait:${id}`,iso(config?.offer_minutes||1440),overrideReason,actor).run();return {id};
}
export async function processWaitingList(env,limit=4){
 if(!enabled(env,'EVENT_WAITLIST_OFFERS_ENABLED'))return {disabled:true};
 await expireOffers(env);const heads=await rows(stmt(env,`SELECT w.id FROM event_waitlist_entries w WHERE w.status='WAITING' AND NOT EXISTS(SELECT 1 FROM event_waitlist_entries h WHERE h.product_id=w.product_id AND h.status='WAITING' AND h.seq<w.seq) ORDER BY w.seq LIMIT ?`,Math.min(4,limit)));
 let offers=0;for(const head of heads){try{await makeOffer(env,head.id);offers++}catch{/* Capacity/eligibility/duplicate races leave the head in place; never skip to a smaller party. */}}
 return {offers};
}
export async function acceptOffer(env,entryId,agreedPrice){
 const current=await stmt(env,`SELECT o.*,p.price_pence FROM event_waitlist_offers o JOIN event_waitlist_entries w ON w.id=o.entry_id JOIN special_event_ticket_products p ON p.id=w.product_id WHERE o.entry_id=?`,entryId).first();
 if(!current)throw Error('NOT_FOUND');if(current.price_pence!==agreedPrice)throw Error('PRICE_CHANGED_REVIEW_REQUIRED');
 if(current.status==='CHECKOUT'&&current.checkout_expires_at>iso(0))return {hold_id:current.hold_id,expires_at:current.checkout_expires_at,duplicate:true};
 const expires=iso(15);const changed=await stmt(env,`UPDATE event_waitlist_offers SET status='CHECKOUT',checkout_expires_at=? WHERE id=? AND status='OFFERED'`,expires,current.id).run();
 if(!changed.meta?.changes)throw Error('WAIT_OFFER_EXPIRED_OR_CHANGED');return {hold_id:current.hold_id,expires_at:expires};
}
export async function waitingListApi(request,env,services={}){
 if(!enabled(env,'EVENT_WAITLIST_ENABLED'))return reply({error:'NOT_AVAILABLE'},404);
 try{
 const url=new URL(request.url),action=url.searchParams.get('action')||'status';if(request.method==='POST')requireWrite(request);
 if(action==='access'&&request.method==='POST'){
 if(!enabled(env,'EVENT_MANAGEMENT_NOTIFICATIONS_ENABLED'))return reply({error:'SERVICE_UNAVAILABLE'},503);
 return reply(await requestWaitingAccess(env,await request.json()),202);
 }
 if(action==='verify'&&request.method==='POST'){const t=await verifyWaitingAccess(env,await request.json());return t?reply({ok:true},200,{'set-cookie':`__Host-event_wait=${t}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`}):reply({error:'VERIFICATION_UNSUCCESSFUL'},403)}
 const session=await waitingSession(request,env);if(!session)return reply({error:'SIGN_IN_REQUIRED'},401);
 if(action==='status'&&request.method==='GET'){
 const result=await stmt(env,`SELECT w.id,w.status,w.quantity,w.verified_joined_at,p.name AS product,p.price_pence,(SELECT count(*)+1 FROM event_waitlist_entries earlier WHERE earlier.product_id=w.product_id AND earlier.seq<w.seq AND earlier.status='WAITING') AS position,o.status AS offer_status,o.expires_at,o.checkout_expires_at FROM event_waitlist_entries w JOIN special_event_ticket_products p ON p.id=w.product_id LEFT JOIN event_waitlist_offers o ON o.entry_id=w.id WHERE w.id=?`,session.entry_id).first();return reply(result);
 }
 if(action==='accept'&&request.method==='POST')return reply(await acceptOffer(env,session.entry_id,(await request.json()).price_pence));
 if(action==='leave'&&request.method==='POST'){
 await env.BOOKINGS_DB.batch([stmt(env,`UPDATE event_waitlist_offers SET status='LEFT' WHERE entry_id=? AND status='OFFERED'`,session.entry_id),stmt(env,`UPDATE event_waitlist_entries SET status='LEFT' WHERE id=? AND status='WAITING'`,session.entry_id)]);return reply({ok:true});
 }
 if(action==='checkout'&&request.method==='POST'){
 const entry=await stmt(env,`SELECT w.*,o.hold_id,o.checkout_expires_at,p.code,e.slug FROM event_waitlist_entries w JOIN event_waitlist_offers o ON o.entry_id=w.id JOIN special_event_ticket_products p ON p.id=w.product_id JOIN special_events e ON e.id=p.event_id WHERE w.id=? AND o.status='CHECKOUT' AND o.checkout_expires_at>?`,session.entry_id,iso(0)).first();if(!entry||!services.reserve)throw Error('WAIT_OFFER_EXPIRED_OR_CHANGED');
 const existing=await stmt(env,`SELECT id,status FROM special_event_bookings WHERE hold_id=?`,entry.hold_id).first();if(existing){if(services.resume)return services.resume(existing.id);return reply({error:'CHECKOUT_ALREADY_CREATED',status:existing.status},409);}
 const body=await request.json();if(body.attendees?.some(a=>a.competition_entry))throw Error('ADDITIONAL_COMPETITION_REQUIRES_SEPARATE_BOOKING');
 await stmt(env,`INSERT INTO event_waitlist_checkout_claims(hold_id,operation_id) VALUES(?,?)`,entry.hold_id,uid()).run();
 const bookingRequest=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({...body,slug:entry.slug,product_code:entry.code,name:entry.name,email:entry.email,quantity:entry.quantity})});
 return services.reserve(bookingRequest,env,{hold_id:entry.hold_id,expires_at:entry.checkout_expires_at});
 }
 return reply({error:'NOT_FOUND'},404);
 }catch(error){return safeError(error)}
}
export async function adminWaitingList(request,env,admin){
 if(!enabled(env,'EVENT_WAITLIST_ENABLED'))return reply({error:'NOT_AVAILABLE'},404);
 if(email(admin.email)!==email(env.ADMIN_EMAIL))return reply({error:'OWNER_REQUIRED'},403);
 try{
 if(request.method==='GET')return reply({entries:await rows(stmt(env,`SELECT w.*,p.name AS product,o.id AS offer_id,o.status AS offer_status,o.expires_at,o.checkout_expires_at FROM event_waitlist_entries w JOIN special_event_ticket_products p ON p.id=w.product_id LEFT JOIN event_waitlist_offers o ON o.entry_id=w.id WHERE p.event_id=? ORDER BY w.seq`,new URL(request.url).searchParams.get('event_id'))),notifications:await rows(stmt(env,`SELECT id,kind,status,provider_id,created_at FROM event_waitlist_notifications ORDER BY created_at DESC LIMIT 100`))});
 requireWrite(request);const body=await request.json();
 if(body.action==='OFFER'){if(!enabled(env,'EVENT_WAITLIST_OFFERS_ENABLED'))throw Error('OFFERS_DISABLED');return reply(await makeOffer(env,body.entry_id,admin.email,body.override_reason?.trim()||null))}
 if(body.action==='SET_DURATION'){if(!Number.isInteger(body.minutes)||body.minutes<15||body.minutes>10080||!String(body.reason||'').trim())throw Error('INVALID_INPUT');await env.BOOKINGS_DB.batch([stmt(env,`INSERT INTO event_waitlist_settings(event_id,offer_minutes) VALUES(?,?) ON CONFLICT(event_id) DO UPDATE SET offer_minutes=excluded.offer_minutes`,body.event_id,body.minutes),stmt(env,`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'WAITLIST_DURATION_CHANGED','EVENT',?,?,?,?)`,uid(),body.event_id,body.event_id,admin.email,body.reason,uid())]);return reply({ok:true})}
 return reply(await processWaitingList(env));
 }catch(error){return safeError(error)}
}
export const processWaitingNotifications=(env,send)=>processManagementNotifications(env,send,10,'event_waitlist_notifications');
