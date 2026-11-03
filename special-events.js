const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const tidy=(value,max=500)=>String(value??'').trim().slice(0,max);
const specialEmailOk=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||''));
const hex=bytes=>[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const fromHex=value=>new Uint8Array(String(value||'').match(/.{1,2}/g)?.map(part=>parseInt(part,16))||[]);
const specialRandomHex=(length=32)=>{const value=new Uint8Array(length);crypto.getRandomValues(value);return hex(value);};
const normalizeAccessPassword=value=>String(value||'').trim().toLocaleUpperCase('en-GB');
async function accessHash(password,salt){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(normalizeAccessPassword(password)),{name:'PBKDF2'},false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:fromHex(salt),iterations:100000},key,256);
  return hex(bits);
}
function safeEqual(a,b){
  const left=String(a||''),right=String(b||'');let diff=left.length^right.length;
  for(let i=0;i<Math.max(left.length,right.length);i++)diff|=(left.charCodeAt(i)||0)^(right.charCodeAt(i)||0);
  return diff===0;
}
const schemaMissing=error=>/no such table|no such column/i.test(String(error?.message||error||''));

export async function specialEventReadiness(db,eventId){
  const event=await db.prepare(`SELECT * FROM special_events WHERE id=?`).bind(eventId).first();
  if(!event)return null;
  const [days,products,credentials]=await Promise.all([
    db.prepare(`SELECT * FROM special_event_days WHERE event_id=? ORDER BY display_order`).bind(eventId).all(),
    db.prepare(`SELECT * FROM special_event_ticket_products WHERE event_id=? ORDER BY display_order`).bind(eventId).all(),
    db.prepare(`SELECT product_id FROM special_event_access_credentials WHERE event_id=? AND active=1`).bind(eventId).all()
  ]);
  const credentialProducts=new Set((credentials.results||[]).map(row=>row.product_id));
  const blockers=[];
  if((days.results||[]).some(day=>day.capacity==null))blockers.push('DAY_CAPACITY_UNCONFIRMED');
  if((products.results||[]).some(product=>product.allocation==null))blockers.push('TICKET_ALLOCATION_UNCONFIRMED');
  if(!Number(event.age_terms_confirmed))blockers.push('AGE_TERMS_UNCONFIRMED');
  if(!Number(event.refund_policy_confirmed))blockers.push('REFUND_POLICY_UNCONFIRMED');
  if((products.results||[]).some(product=>Number(product.password_required)&&!credentialProducts.has(product.id)))blockers.push('RESTRICTED_RELEASE_PASSWORD_NOT_CONFIGURED');
  return {event,days:days.results||[],products:products.results||[],blockers,ready:blockers.length===0};
}

export async function publicSpecialEvents(request,env,url){
  const slug=tidy(url.searchParams.get('slug'),120);
  if(!env.BOOKINGS_DB)return slug?response({error:'This event is not currently published.'},404):response({events:[]});
  try{
    const reference=tidy(url.searchParams.get('reference'),120),token=tidy(url.searchParams.get('token'),180);
    if(reference||token){
      if(!reference||!token)return response({error:'Confirmation details are incomplete.'},400);
      const booking=await env.BOOKINGS_DB.prepare(`SELECT b.reference,b.customer_name,b.quantity,b.product_name_snapshot,b.amount_pence,b.status,b.paid_at,e.title,e.venue_name
        FROM special_event_bookings b JOIN special_events e ON e.id=b.event_id WHERE b.reference=? AND b.secure_token=?`).bind(reference,token).first();
      if(!booking)return response({error:'Booking confirmation not found.'},404);
      if(booking.status!=='PAID')return response({status:booking.status==='PENDING'?'PENDING':'NOT_CONFIRMED'});
      return response({status:'PAID',booking});
    }
    if(slug){
      const event=await env.BOOKINGS_DB.prepare(`SELECT id,slug,title,subtitle,venue_name,venue_address,public_summary,public_description,artwork_url,status
        FROM special_events WHERE slug=? AND status='PUBLISHED' AND publication_enabled=1`).bind(slug).first();
      if(!event)return response({error:'This event is not currently published.'},404);
      const [days,programme,products]=await Promise.all([
        env.BOOKINGS_DB.prepare(`SELECT id,event_date,label,capacity,display_order FROM special_event_days WHERE event_id=? ORDER BY display_order`).bind(event.id).all(),
        env.BOOKINGS_DB.prepare(`SELECT p.day_id,p.item_type,p.title,p.description,p.starts_at,p.ends_at,p.timing_confirmed,p.display_order FROM special_event_programme_items p WHERE p.event_id=? ORDER BY p.day_id,p.display_order`).bind(event.id).all(),
        env.BOOKINGS_DB.prepare(`SELECT id,code,name,description,product_type,price_pence,allocation,release_state,password_required,requires_qualifying_admission,max_per_checkout,display_order FROM special_event_ticket_products WHERE event_id=? AND release_state IN ('ACTIVE','SOLD_OUT') ORDER BY display_order`).bind(event.id).all()
      ]);
      return response({event,days:days.results||[],programme:programme.results||[],ticket_products:products.results||[]});
    }
    const rows=await env.BOOKINGS_DB.prepare(`SELECT slug,title,subtitle,venue_name,public_summary,artwork_url FROM special_events WHERE status='PUBLISHED' AND publication_enabled=1 ORDER BY created_at`).all();
    return response({events:rows.results||[]});
  }catch(error){if(schemaMissing(error))return response({events:[]});throw error;}
}

export async function adminSpecialEvents(request,env,admin){
  if(!env.BOOKINGS_DB)return response({error:'BOOKINGS_DB is not connected.'},503);
  const url=new URL(request.url),eventId=tidy(url.searchParams.get('id'),160)||'special-event-johnny-rossato-2027';
  if(request.method==='GET'){
    try{
      const ready=await specialEventReadiness(env.BOOKINGS_DB,eventId);
      if(!ready)return response({error:'Special event not found.'},404);
      const [programme,bookings,attendees,competition,tasks,documents,activity]=await Promise.all([
        env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_programme_items WHERE event_id=? ORDER BY day_id,display_order`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT id,reference,customer_name,quantity,product_name_snapshot,amount_pence,status,created_at FROM special_event_bookings WHERE event_id=? ORDER BY created_at DESC LIMIT 250`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT a.id,a.booking_id,a.name,a.ticket_number,a.status,COUNT(CASE WHEN x.attended_at IS NOT NULL THEN 1 END) checked_in_days
          FROM special_event_attendees a JOIN special_event_bookings b ON b.id=a.booking_id LEFT JOIN special_event_attendance x ON x.attendee_id=a.id
          WHERE b.event_id=? GROUP BY a.id ORDER BY a.created_at`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT id,entry_number,status,result_notes,created_at FROM special_event_competition_entries WHERE event_id=? ORDER BY entry_number`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_tasks WHERE event_id=? ORDER BY display_order,created_at`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT d.*,COUNT(v.id) version_count,(SELECT latest.id FROM special_event_document_versions latest WHERE latest.document_id=d.id ORDER BY latest.version DESC LIMIT 1) current_version_id FROM special_event_documents d LEFT JOIN special_event_document_versions v ON v.document_id=d.id WHERE d.event_id=? GROUP BY d.id ORDER BY d.created_at DESC`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_activity WHERE event_id=? ORDER BY created_at DESC LIMIT 250`).bind(eventId).all()
      ]);
      return response({...ready,programme:programme.results||[],bookings:bookings.results||[],attendees:attendees.results||[],competition:competition.results||[],tasks:tasks.results||[],documents:documents.results||[],activity:activity.results||[]});
    }catch(error){if(schemaMissing(error))return response({error:'Migration 0031_special_events.sql has not been applied in this environment.',code:'SPECIAL_EVENTS_SCHEMA_MISSING'},503);throw error;}
  }
  const body=await request.json().catch(()=>null);
  if(!body)return response({error:'The request could not be read.'},400);
  if(request.method==='PATCH'){
    const action=tidy(body.action,80);
    if(action==='CONFIGURE_ACCESS_PASSWORD'){
      const productId=tidy(body.product_id,160),password=String(body.password||'');
      if(password.length<12)return response({error:'Use an access password of at least 12 characters.'},400);
      const product=await env.BOOKINGS_DB.prepare(`SELECT id FROM special_event_ticket_products WHERE id=? AND event_id=? AND password_required=1`).bind(productId,eventId).first();
      if(!product)return response({error:'Restricted ticket product not found.'},404);
      const salt=specialRandomHex(),hash=await accessHash(password,salt),id=crypto.randomUUID(),auditId=crypto.randomUUID();
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_access_credentials SET active=0,replaced_at=CURRENT_TIMESTAMP WHERE product_id=? AND active=1`).bind(productId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_access_credentials(id,event_id,product_id,password_salt,password_hash,configured_by) VALUES(?,?,?,?,?,?)`).bind(id,eventId,productId,salt,hash,admin.email),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'ACCESS_PASSWORD_CONFIGURED','TICKET_PRODUCT',?,?,?,?)`).bind(auditId,eventId,productId,admin.email,'Restricted-release credential configured; plaintext was not stored.',`access-password:${id}`)
      ]);
      return response({ok:true});
    }
    if(action==='UPDATE_SAFETY_SETTINGS'){
      const saturday=body.saturday_capacity==null?null:Number(body.saturday_capacity),sunday=body.sunday_capacity==null?null:Number(body.sunday_capacity);
      if((saturday!=null&&(!Number.isInteger(saturday)||saturday<1))||(sunday!=null&&(!Number.isInteger(sunday)||sunday<1)))return response({error:'Capacities must be positive whole numbers or left unconfirmed.'},400);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_days SET capacity=? WHERE event_id=? AND display_order=1`).bind(saturday,eventId),
        env.BOOKINGS_DB.prepare(`UPDATE special_event_days SET capacity=? WHERE event_id=? AND display_order=2`).bind(sunday,eventId),
        env.BOOKINGS_DB.prepare(`UPDATE special_events SET age_terms=?,age_terms_confirmed=?,refund_policy=?,refund_policy_confirmed=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).bind(tidy(body.age_terms,4000)||null,body.age_terms_confirmed?1:0,tidy(body.refund_policy,4000)||null,body.refund_policy_confirmed?1:0,eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'SAFETY_SETTINGS_UPDATED','SPECIAL_EVENT',?,?,?,?)`).bind(crypto.randomUUID(),eventId,eventId,admin.email,tidy(body.reason,500)||'HQ safety settings update',crypto.randomUUID())
      ]);
      return response({ok:true,readiness:await specialEventReadiness(env.BOOKINGS_DB,eventId)});
    }
    if(action==='UPDATE_PRODUCT'){
      const productId=tidy(body.product_id,160),allocation=body.allocation==null||body.allocation===''?null:Number(body.allocation),state=tidy(body.release_state,20);
      if(allocation!=null&&(!Number.isInteger(allocation)||allocation<0))return response({error:'Allocation must be a whole number or remain unconfirmed.'},400);
      if(!['INACTIVE','ACTIVE','SOLD_OUT','CLOSED'].includes(state))return response({error:'Choose a valid release state.'},400);
      const product=await env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_ticket_products WHERE id=? AND event_id=?`).bind(productId,eventId).first();if(!product)return response({error:'Ticket product not found.'},404);
      const claimed=await env.BOOKINGS_DB.prepare(`SELECT COALESCE(SUM(quantity),0) total FROM special_event_bookings WHERE product_id=? AND status='PAID'`).bind(productId).first();
      if(allocation!=null&&allocation<Number(claimed?.total||0))return response({error:'Allocation cannot be lower than paid ticket quantity.'},409);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_ticket_products SET allocation=?,release_state=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND event_id=?`).bind(allocation,state,productId,eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'TICKET_PRODUCT_UPDATED','TICKET_PRODUCT',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,productId,admin.email,tidy(body.reason,500)||'HQ ticket configuration update',JSON.stringify({previous_allocation:product.allocation,new_allocation:allocation,previous_state:product.release_state,new_state:state}),crypto.randomUUID())
      ]);
      return response({ok:true,readiness:await specialEventReadiness(env.BOOKINGS_DB,eventId)});
    }
    if(action==='UPSERT_PROGRAMME_ITEM'){
      const id=tidy(body.id,160)||crypto.randomUUID(),dayId=tidy(body.day_id,160),type=tidy(body.item_type,30),title=tidy(body.title,240),order=Number(body.display_order);
      if(!dayId||!title||!['WORKSHOP','SOCIAL','COMPETITION','PERFORMANCE','BREAK','OTHER'].includes(type)||!Number.isInteger(order))return response({error:'Complete the programme item details.'},400);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_programme_items(id,event_id,day_id,item_type,title,description,starts_at,ends_at,timing_confirmed,display_order) VALUES(?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET day_id=excluded.day_id,item_type=excluded.item_type,title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,timing_confirmed=excluded.timing_confirmed,display_order=excluded.display_order`).bind(id,eventId,dayId,type,title,tidy(body.description,4000)||null,tidy(body.starts_at,40)||null,tidy(body.ends_at,40)||null,body.timing_confirmed?1:0,order),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'PROGRAMME_ITEM_SAVED','PROGRAMME_ITEM',?,?,?,?)`).bind(crypto.randomUUID(),eventId,id,admin.email,body.timing_confirmed?'Confirmed programme timing saved.':'Draft programme item saved with timing unconfirmed.',crypto.randomUUID())
      ]);
      return response({ok:true,id});
    }
    if(action==='UPSERT_TASK'){
      const id=tidy(body.id,160)||crypto.randomUUID(),title=tidy(body.title,240),status=tidy(body.status,30)||'OPEN';
      if(!title||!['OPEN','IN_PROGRESS','BLOCKED','DONE','CANCELLED'].includes(status))return response({error:'Complete the tracker task details.'},400);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_tasks(id,event_id,title,description,status,due_at,assigned_to,display_order) VALUES(?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,status=excluded.status,due_at=excluded.due_at,assigned_to=excluded.assigned_to,display_order=excluded.display_order,updated_at=CURRENT_TIMESTAMP`).bind(id,eventId,title,tidy(body.description,4000)||null,status,tidy(body.due_at,40)||null,tidy(body.assigned_to,160)||null,Number(body.display_order)||0),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'TASK_SAVED','TASK',?,?,?,?)`).bind(crypto.randomUUID(),eventId,id,admin.email,tidy(body.reason,500)||'Event tracker updated.',crypto.randomUUID())
      ]);
      return response({ok:true,id});
    }
    if(action==='RECORD_COMPETITION_RESULT'){
      const entryId=tidy(body.entry_id,160),status=tidy(body.status,30);
      if(!entryId||!['ENTERED','WITHDRAWN','FINALIST','WINNER'].includes(status))return response({error:'Choose a valid competition entry and result.'},400);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_competition_entries SET status=?,result_notes=? WHERE id=? AND event_id=?`).bind(status,tidy(body.result_notes,2000)||null,entryId,eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'COMPETITION_RESULT_RECORDED','COMPETITION_ENTRY',?,?,?,?)`).bind(crypto.randomUUID(),eventId,entryId,admin.email,tidy(body.reason,500)||`Competition status set to ${status}.`,crypto.randomUUID())
      ]);
      return response({ok:true});
    }
    if(action==='CHECK_IN_ATTENDEE'){
      const attendeeId=tidy(body.attendee_id,180),dayId=tidy(body.day_id,180),attended=Boolean(body.attended);
      const attendance=await env.BOOKINGS_DB.prepare(`SELECT x.attendee_id FROM special_event_attendance x JOIN special_event_attendees a ON a.id=x.attendee_id JOIN special_event_bookings b ON b.id=a.booking_id WHERE x.attendee_id=? AND x.day_id=? AND b.event_id=?`).bind(attendeeId,dayId,eventId).first();
      if(!attendance)return response({error:'Event attendee or day not found.'},404);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_attendance SET attended_at=${attended?'CURRENT_TIMESTAMP':'NULL'},checked_in_by=? WHERE attendee_id=? AND day_id=?`).bind(attended?admin.email:null,attendeeId,dayId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,?,'ATTENDEE',?,?,?,?)`).bind(crypto.randomUUID(),eventId,attended?'ATTENDEE_CHECKED_IN':'ATTENDEE_CHECK_IN_REVERSED',attendeeId,admin.email,`Attendance ${attended?'recorded':'reversed'} for ${dayId}.`,crypto.randomUUID())
      ]);
      return response({ok:true});
    }
    if(action==='SET_PUBLICATION'){
      const readiness=await specialEventReadiness(env.BOOKINGS_DB,eventId);
      if(!readiness?.ready)return response({error:'Publication is blocked until all mandatory settings are confirmed.',blockers:readiness?.blockers||[]},409);
      return response({error:'Publication requires a separate owner-approved release operation.',code:'OWNER_RELEASE_APPROVAL_REQUIRED'},409);
    }
    return response({error:'Unsupported Special Events action.'},400);
  }
  return response({error:'Method not allowed.'},405);
}

export async function verifySpecialEventPassword(db,productId,password){
  const row=await db.prepare(`SELECT password_salt,password_hash FROM special_event_access_credentials WHERE product_id=? AND active=1 ORDER BY created_at DESC LIMIT 1`).bind(productId).first();
  if(!row)return false;
  return safeEqual(await accessHash(password,row.password_salt),row.password_hash);
}

async function refreshAutomaticReleases(db,eventId){
  // A temporary hold can make Early Bird unavailable, but only authoritative
  // PAID bookings permanently sell the release out and unlock Standard.
  await db.prepare(`UPDATE special_event_ticket_products AS early SET release_state='SOLD_OUT',updated_at=CURRENT_TIMESTAMP
    WHERE early.event_id=? AND early.code='EARLY_BIRD_WEEKEND' AND early.release_state='ACTIVE' AND early.allocation IS NOT NULL
      AND early.allocation<=
        COALESCE((SELECT SUM(quantity) FROM special_event_bookings WHERE product_id=early.id AND status='PAID'),0)`).bind(eventId).run();
  await db.prepare(`UPDATE special_event_ticket_products AS standard SET release_state='ACTIVE',updated_at=CURRENT_TIMESTAMP
    WHERE standard.event_id=? AND standard.code='STANDARD_WEEKEND' AND standard.release_state='INACTIVE'
      AND EXISTS(SELECT 1 FROM special_event_ticket_products prior WHERE prior.id=standard.auto_activate_after_product_id AND prior.release_state='SOLD_OUT')`).bind(eventId).run();
}

export async function createSpecialEventReservation(request,env,services){
  if(!env.BOOKINGS_DB)return response({error:'Event booking is unavailable.'},503);
  const body=await request.json().catch(()=>null);if(!body)return response({error:'The booking request could not be read.'},400);
  const slug=tidy(body.slug,120),code=tidy(body.product_code,80),name=tidy(body.name,120),email=tidy(body.email,160).toLowerCase(),phone=tidy(body.phone,40),quantity=Number(body.quantity);
  if(!slug||!code||!name||!specialEmailOk(email)||!Number.isInteger(quantity)||quantity<1)return response({error:'Choose a valid event ticket and enter your contact details.'},400);
  if(!body.terms_accepted)return response({error:'Please accept the event booking terms.'},400);
  const event=await env.BOOKINGS_DB.prepare(`SELECT * FROM special_events WHERE slug=? AND status='PUBLISHED' AND publication_enabled=1 AND checkout_enabled=1`).bind(slug).first();
  if(!event)return response({error:'Ticket sales for this event are not open.'},404);
  const readiness=await specialEventReadiness(env.BOOKINGS_DB,event.id);if(!readiness?.ready)return response({error:'Ticket sales remain blocked while event safety settings are incomplete.'},409);
  await refreshAutomaticReleases(env.BOOKINGS_DB,event.id);
  const product=await env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_ticket_products WHERE event_id=? AND code=? AND release_state='ACTIVE'`).bind(event.id,code).first();
  if(!product)return response({error:'This ticket is not currently available.'},409);
  const maximum=Math.min(Number(event.max_admission_per_checkout||4),Number(product.max_per_checkout||event.max_admission_per_checkout||4));
  if(quantity>maximum)return response({error:`Choose no more than ${maximum} ticket${maximum===1?'':'s'} per checkout.`},400);
  if(Number(product.password_required)&&!await verifySpecialEventPassword(env.BOOKINGS_DB,product.id,body.access_password))return response({error:'The loyalty access password was not recognised.'},403);
  let qualifyingBookingId=null;
  if(Number(product.requires_qualifying_admission)){
    const reference=tidy(body.qualifying_booking_reference,120);
    const qualifying=await env.BOOKINGS_DB.prepare(`SELECT b.id FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id
      WHERE b.event_id=? AND b.reference=? AND lower(b.customer_email)=? AND b.status='PAID' AND p.product_type='ADMISSION' LIMIT 1`).bind(event.id,reference,email).first();
    if(!qualifying)return response({error:'A paid event-admission booking for this email is required before competition entry.'},409);
    qualifyingBookingId=qualifying.id;
  }
  let customer;
  try{customer=await services.resolveCustomerIdentity(env,{email,name,phone,marketingConsent:false,source:'SPECIAL_EVENT_BOOKING'});}catch(_){return response({error:'This customer identity could not be verified safely.'},409);}
  const holdId=crypto.randomUUID(),bookingId=crypto.randomUUID(),idempotencyKey=tidy(body.idempotency_key,160)||crypto.randomUUID(),expiresAt=new Date(Date.now()+15*60*1000).toISOString();
  const amount=Number(product.price_pence)*quantity,reference=`BSE-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
  const secureToken=crypto.randomUUID()+crypto.randomUUID().replaceAll('-',''),customerToken=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');
  const holdInsert=env.BOOKINGS_DB.prepare(`INSERT INTO special_event_holds(id,event_id,product_id,customer_id,customer_email,quantity,amount_pence,status,expires_at,idempotency_key)
    SELECT ?,e.id,p.id,?,?,?,?,'ACTIVE',?,?
    FROM special_events e JOIN special_event_ticket_products p ON p.event_id=e.id
    WHERE e.id=? AND e.status='PUBLISHED' AND e.checkout_enabled=1 AND p.id=? AND p.release_state='ACTIVE'
      AND (p.allocation IS NULL OR ?<=p.allocation
        -COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b WHERE b.product_id=p.id AND b.status='PAID'),0)
        -COALESCE((SELECT SUM(h.quantity) FROM special_event_holds h WHERE h.product_id=p.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0))
      AND NOT EXISTS(SELECT 1 FROM special_event_product_days pd JOIN special_event_days d ON d.id=pd.day_id
        WHERE pd.product_id=p.id AND d.capacity IS NOT NULL AND (?*pd.places_per_ticket)>d.capacity
          -COALESCE((SELECT SUM(bd.places) FROM special_event_booking_days bd JOIN special_event_bookings b ON b.id=bd.booking_id WHERE bd.day_id=d.id AND b.status='PAID'),0)
          -COALESCE((SELECT SUM(hd.places) FROM special_event_hold_days hd JOIN special_event_holds h ON h.id=hd.hold_id WHERE hd.day_id=d.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0))`)
    .bind(holdId,customer.id,email,quantity,amount,expiresAt,idempotencyKey,event.id,product.id,quantity,quantity);
  const holdDays=env.BOOKINGS_DB.prepare(`INSERT INTO special_event_hold_days(hold_id,day_id,places)
    SELECT h.id,pd.day_id,?*pd.places_per_ticket FROM special_event_holds h JOIN special_event_product_days pd ON pd.product_id=h.product_id
    WHERE h.id=? AND pd.product_id=?`).bind(quantity,holdId,product.id);
  const results=await env.BOOKINGS_DB.batch([holdInsert,holdDays]);
  if(!Number(results[0]?.meta?.changes||0))return response({error:'Those tickets have just sold out or there is not enough day capacity.'},409);
  try{
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`INSERT INTO special_event_bookings(id,reference,event_id,product_id,hold_id,qualifying_booking_id,customer_id,customer_name,customer_email,customer_phone,quantity,product_code_snapshot,product_name_snapshot,unit_price_pence_snapshot,amount_pence,status,payment_provider,secure_token,customer_token,terms_accepted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING','SUMUP',?,?,CURRENT_TIMESTAMP)`).bind(bookingId,reference,event.id,product.id,holdId,qualifyingBookingId,customer.id,name,email,phone||null,quantity,product.code,product.name,product.price_pence,amount,secureToken,customerToken),
      env.BOOKINGS_DB.prepare(`INSERT INTO special_event_booking_days(booking_id,day_id,places) SELECT ?,day_id,places FROM special_event_hold_days WHERE hold_id=?`).bind(bookingId,holdId),
      env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'BOOKING_CREATED','BOOKING',?,?,?,?)`).bind(crypto.randomUUID(),event.id,bookingId,email,'Pending SumUp checkout created.',`booking-created:${bookingId}`)
    ]);
    const origin=new URL(request.url).origin;
    const checkoutResponse=await services.sumUpFetch(env,'/v0.1/checkouts',{method:'POST',body:JSON.stringify({checkout_reference:reference,amount:Number((amount/100).toFixed(2)),currency:'GBP',merchant_code:String(env.SUMUP_MERCHANT_CODE),description:`${event.title} — ${product.name} × ${quantity}`,redirect_url:`${origin}/johnny-rossato?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(secureToken)}`,return_url:`${origin}/api/sumup-webhook`,valid_until:expiresAt,hosted_checkout:{enabled:true}})});
    const checkout=await checkoutResponse.json().catch(()=>({})),raw=checkout.hosted_checkout_url||checkout.hosted_checkout?.url||'';let checkoutUrl='';try{const parsed=new URL(raw);if(parsed.protocol==='https:')checkoutUrl=parsed.toString();}catch(_){ }
    if(!checkoutResponse.ok||!checkout.id||!checkoutUrl)throw new Error('SUMUP_CHECKOUT_FAILED');
    await env.BOOKINGS_DB.prepare(`UPDATE special_event_bookings SET provider_checkout_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(checkout.id,bookingId).run();
    return response({ok:true,reference,status:'PENDING',checkout_url:checkoutUrl},201);
  }catch(error){
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`UPDATE special_event_bookings SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'`).bind(bookingId),
      env.BOOKINGS_DB.prepare(`UPDATE special_event_holds SET status='RELEASED',expires_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(holdId)
    ]).catch(()=>{});
    return response({error:'The secure payment checkout could not be created. No payment has been taken.'},502);
  }
}

export async function applySpecialEventCheckoutState(env,booking,checkout){
  const status=String(checkout?.status||'').toUpperCase();
  if(status==='PAID'){
    const transaction=tidy(checkout?.transactions?.[0]?.id||checkout?.transaction_id,180)||null;
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`UPDATE special_event_bookings SET status='PAID',provider_transaction_id=?,paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'`).bind(transaction,booking.id),
      env.BOOKINGS_DB.prepare(`UPDATE special_event_holds SET status='CONSUMED' WHERE id=? AND status='ACTIVE'`).bind(booking.hold_id),
      env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_confirmation_outbox(id,booking_id,status,idempotency_key) VALUES(?,?,'DISABLED',?)`).bind(crypto.randomUUID(),booking.id,`special-event-paid:${booking.id}`),
      env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'PAYMENT_CONFIRMED','BOOKING',?,'SUMUP','Authoritative SumUp payment confirmed.',?)`).bind(crypto.randomUUID(),booking.event_id,booking.id,`special-event-paid:${booking.id}`)
    ]);
    const product=await env.BOOKINGS_DB.prepare(`SELECT product_type,requires_qualifying_admission FROM special_event_ticket_products WHERE id=?`).bind(booking.product_id).first();
    if(product?.product_type==='ADMISSION'){
      const attendeeStatements=[];
      for(let index=1;index<=Number(booking.quantity);index+=1){
        const attendeeId=`${booking.id}:attendee:${index}`;
        attendeeStatements.push(
          env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_attendees(id,booking_id,customer_id,name,email,ticket_number) VALUES(?,?,?,?,?,?)`).bind(attendeeId,booking.id,booking.customer_id,booking.customer_name,booking.customer_email,`${booking.reference}-${String(index).padStart(2,'0')}`),
          env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_attendance(attendee_id,day_id) SELECT ?,day_id FROM special_event_booking_days WHERE booking_id=? AND places>0`).bind(attendeeId,booking.id)
        );
      }
      if(attendeeStatements.length)await env.BOOKINGS_DB.batch(attendeeStatements);
    }
    if(Number(product?.requires_qualifying_admission)&&booking.qualifying_booking_id){
      await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_competition_entries(id,event_id,booking_id,admission_booking_id,customer_id,entry_number)
        SELECT ?,?,?,?, ?,COALESCE(MAX(entry_number),0)+1 FROM special_event_competition_entries WHERE event_id=?`).bind(`${booking.id}:competition`,booking.event_id,booking.id,booking.qualifying_booking_id,booking.customer_id,booking.event_id).run();
    }
    await refreshAutomaticReleases(env.BOOKINGS_DB,booking.event_id);
  }else if(['FAILED','EXPIRED'].includes(status)){
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`UPDATE special_event_bookings SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'`).bind(booking.id),
      env.BOOKINGS_DB.prepare(`UPDATE special_event_holds SET status='RELEASED',expires_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(booking.hold_id)
    ]);
  }
}

export async function specialEventDocumentUpload(request,env,admin){
  if(!env.BOOKINGS_DB||!env.MEDIA_BUCKET)return response({error:'Private document storage is unavailable.'},503);
  const form=await request.formData(),file=form.get('file'),eventId=tidy(form.get('event_id'),160),title=tidy(form.get('title'),240),category=tidy(form.get('category'),50)||'OTHER';
  const allowed=new Set(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','image/jpeg','image/png','image/webp']);
  if(!(file instanceof File)||!eventId||!title)return response({error:'Event, title and document are required.'},400);
  if(!allowed.has(file.type)||file.size<1||file.size>25*1024*1024)return response({error:'Use PDF, DOCX, XLSX, CSV, JPG, PNG or WebP up to 25 MB.'},400);
  const documentId=tidy(form.get('document_id'),160)||crypto.randomUUID();
  const current=await env.BOOKINGS_DB.prepare(`SELECT current_version FROM special_event_documents WHERE id=? AND event_id=?`).bind(documentId,eventId).first();
  const version=Number(current?.current_version||0)+1,versionId=crypto.randomUUID();
  const extension=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'bin';
  const storageKey=`private/special-events/${eventId}/${documentId}/v${version}-${versionId}.${extension}`;
  const bytes=await file.arrayBuffer(),sha256=hex(await crypto.subtle.digest('SHA-256',bytes));
  await env.MEDIA_BUCKET.put(storageKey,bytes,{httpMetadata:{contentType:file.type,cacheControl:'private, no-store'}});
  try{
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_documents(id,event_id,title,category,created_by) VALUES(?,?,?,?,?)`).bind(documentId,eventId,title,category,admin.email),
      env.BOOKINGS_DB.prepare(`INSERT INTO special_event_document_versions(id,document_id,version,storage_key,original_filename,content_type,byte_size,sha256,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(versionId,documentId,version,storageKey,tidy(file.name,255),file.type,file.size,sha256,admin.email),
      env.BOOKINGS_DB.prepare(`UPDATE special_event_documents SET title=?,category=?,current_version=? WHERE id=?`).bind(title,category,version,documentId),
      env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'DOCUMENT_VERSION_UPLOADED','DOCUMENT',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,documentId,admin.email,'Private evidence uploaded.',JSON.stringify({version,content_type:file.type,byte_size:file.size,sha256}),`document-version:${versionId}`)
    ]);
  }catch(error){await env.MEDIA_BUCKET.delete(storageKey);throw error;}
  return response({ok:true,document_id:documentId,version,sha256},201);
}

export async function specialEventDocumentDownload(request,env,url){
  const versionId=tidy(url.searchParams.get('version'),160);
  const row=await env.BOOKINGS_DB.prepare(`SELECT storage_key,original_filename,content_type FROM special_event_document_versions WHERE id=?`).bind(versionId).first();
  if(!row)return response({error:'Document version not found.'},404);
  const object=await env.MEDIA_BUCKET.get(row.storage_key);if(!object)return response({error:'Stored document is unavailable.'},404);
  const headers=new Headers();headers.set('content-type',row.content_type);headers.set('cache-control','private, no-store');headers.set('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`);
  return new Response(object.body,{headers});
}
