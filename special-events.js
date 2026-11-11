const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const tidy=(value,max=500)=>String(value??'').trim().slice(0,max);
const specialHtmlEscape=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const specialEmailOk=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||''));
const hex=bytes=>[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const fromHex=value=>new Uint8Array(String(value||'').match(/.{1,2}/g)?.map(part=>parseInt(part,16))||[]);
const videoExtension=name=>(String(name||'').split('.').pop()||'').toLowerCase();
const videoContentType=()=> 'video/mp4';
const videoSelectionOk=(name,type)=>videoExtension(name)==='mp4'&&(!type||type==='video/mp4'||type==='application/octet-stream');
const bytesContain=(bytes,text)=>{const needle=[...new TextEncoder().encode(text)];outer:for(let index=0;index<=bytes.length-needle.length;index++){for(let offset=0;offset<needle.length;offset++)if(bytes[index+offset]!==needle[offset])continue outer;return true;}return false;};
const bytesIndexOf=(bytes,text)=>{const needle=[...new TextEncoder().encode(text)];outer:for(let index=0;index<=bytes.length-needle.length;index++){for(let offset=0;offset<needle.length;offset++)if(bytes[index+offset]!==needle[offset])continue outer;return index;}return -1;};
const isIsoVideoContainer=bytes=>bytes.length>=12&&bytesContain(bytes.slice(0,64),'ftyp');
async function mediaObjectBytes(object){if(object?.arrayBuffer)return new Uint8Array(await object.arrayBuffer());return new Uint8Array(await new Response(object?.body).arrayBuffer());}
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
export const SPECIAL_EVENT_CONFIRMATION_SUBJECT="Your Booking Confirmation 🤠 | Johnny Rossato's UK Debut";

export function specialEventTime(value){
  if(!value)return '';
  const match=String(value).match(/T(\d{2}):(\d{2})/);
  if(!match)return '';
  const hour=Number(match[1]),minute=match[2],suffix=hour<12?'am':'pm';
  return `${hour%12||12}:${minute} ${suffix}`;
}

export function specialEventProgrammeRows(programme=[]){
  return programme.map(item=>({...item,time_label:`${specialEventTime(item.starts_at)}${item.ends_at?` – ${specialEventTime(item.ends_at)}`:''}`}));
}

function specialEventEmailDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return String(value||'');
  return new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}).format(new Date(`${value}T12:00:00Z`)).replace(',','');
}

function eventEmailShell({heading,greeting,body,details='',footer=''}){
  return `<!doctype html><html><body style="margin:0;background:#100707;color:#2a1512;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#100707;padding:24px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff8e9;border:2px solid #d51f2b"><tr><td style="padding:28px"><p style="margin:0 0 8px;color:#b31320;font-weight:bold;letter-spacing:.12em">BOOT SCOOTIN’ LINE DANCING</p><h1 style="margin:0 0 18px;font-size:30px;line-height:1.15">${specialHtmlEscape(heading)}</h1><p>${specialHtmlEscape(greeting)}</p>${body}<div style="margin:22px 0;padding:16px;background:#f5e7cf;border-left:4px solid #d51f2b">${details}</div>${footer}</td></tr></table></td></tr></table></body></html>`;
}

export function specialEventConfirmationCopy({booking,event,days=[],attendees=[],competition=[],programme=[]}){
  const testMode=Boolean(booking.test_delivery);
  const amount=Number(booking.amount_pence||0)===0?'Complimentary — £0.00':`£${(Number(booking.amount_pence||0)/100).toFixed(2)}`;
  const dateText=days.map(day=>specialEventEmailDate(day.event_date)).join(' & ');
  const attendeeText=attendees.map(row=>row.name).join(', ')||`${booking.quantity} attendee${Number(booking.quantity)===1?'':'s'}`;
  const entitlement=tidy(booking.product_description,1000);
  const paymentLabel=testMode?'Synthetic delivery test — no payment created':'Confirmed';
  const details=`<p><strong>Event:</strong> Johnny Rossato — His UK Debut</p><p><strong>Reference:</strong> ${specialHtmlEscape(booking.reference)}</p><p><strong>Payment:</strong> ${specialHtmlEscape(paymentLabel)}</p><p><strong>Ticket:</strong> ${specialHtmlEscape(booking.product_name_snapshot)} × ${Number(booking.quantity)}</p>${entitlement?`<p><strong>Admission includes:</strong> ${specialHtmlEscape(entitlement)}</p>`:''}<p><strong>Attendees:</strong> ${specialHtmlEscape(attendeeText)}</p><p><strong>When:</strong> ${specialHtmlEscape(dateText)}</p><p><strong>Venue:</strong> ${specialHtmlEscape(event.venue_name)}${event.venue_address?` · ${specialHtmlEscape(event.venue_address)}`:''}</p><p><strong>${testMode?'Displayed amount':'Paid'}:</strong> ${specialHtmlEscape(amount)}</p>`;
  const junior=attendees.some(row=>Number(row.age_at_event)<18)?'<p><strong>Under-18 reminder:</strong> a responsible adult must remain contactable. Under-18 attendees must leave by 8:30 pm on Saturday and cannot attend the late-night social.</p>':'';
  const heading=testMode?'TEST — Johnny Rossato confirmation email':'Your Johnny Rossato booking is confirmed';
  const welcome=`<p>You're officially booked for Johnny Rossato's UK debut with Boot Scootin' Line Dancing! 🤠</p><p>We're so excited to welcome you for an unforgettable weekend of workshops, dancing and good times.</p><p>You can find the event programme on our website, and we'll email you more information closer to the event.</p>`;
  const body=`${testMode?'<p><strong>This is a controlled delivery test.</strong> No booking, ticket, payment or inventory hold has been created.</p>':''}${welcome}`;
  const links='<p><a href="https://www.bootscootinlinedancing.co.uk/johnny-rossato">View the event page</a> · <a href="https://www.bootscootinlinedancing.co.uk/johnny-rossato">Read the refund policy on the event page</a></p>';
  const signature='<p style="margin-top:24px">Boots &amp; Best Wishes,</p><p><strong>Nora Godollei 🤠</strong><br>Founder &amp; Line Dancing Instructor<br><strong>BOOT SCOOTIN’ LINE DANCING</strong><br>EST. 2025</p><p>🌐 <a href="https://www.bootscootinlinedancing.co.uk">bootscootinlinedancing.co.uk</a><br>📸 Instagram: <a href="https://www.instagram.com/boot.scootin.linedancing/">@boot.scootin.linedancing</a></p><p><strong>Good Boots. Great Moves. Even Better Memories. 🤎</strong></p>';
  const html=eventEmailShell({heading,greeting:`Hi ${booking.customer_name},`,body,details,footer:`${junior}${links}<p><strong>Booking enquiries:</strong> <a href="mailto:bookings@bootscootinlinedancing.co.uk">bookings@bootscootinlinedancing.co.uk</a></p>${signature}`});
  const text=`${heading}\n\nHi ${booking.customer_name},${testMode?'\nThis is a controlled delivery test. No booking, ticket, payment or inventory hold has been created.':''}\n\nYou're officially booked for Johnny Rossato's UK debut with Boot Scootin' Line Dancing! 🤠\n\nWe're so excited to welcome you for an unforgettable weekend of workshops, dancing and good times.\n\nYou can find the event programme on our website, and we'll email you more information closer to the event.\n\nEvent: Johnny Rossato — His UK Debut\nReference: ${booking.reference}\nPayment: ${paymentLabel}\nTicket: ${booking.product_name_snapshot} x ${booking.quantity}${entitlement?`\nAdmission includes: ${entitlement}`:''}\nAttendees: ${attendeeText}\nWhen: ${dateText}\nVenue: ${event.venue_name}${event.venue_address?`, ${event.venue_address}`:''}\n${testMode?'Displayed amount':'Paid'}: ${amount}${attendees.some(row=>Number(row.age_at_event)<18)?'\n\nUnder-18 attendees must leave by 8:30 pm on Saturday and cannot attend the late-night social.':''}\n\nEvent page and refund policy: https://www.bootscootinlinedancing.co.uk/johnny-rossato\nBooking enquiries: bookings@bootscootinlinedancing.co.uk\n\nBoots & Best Wishes,\n\nNora Godollei 🤠\nFounder & Line Dancing Instructor\nBOOT SCOOTIN’ LINE DANCING\nEST. 2025\n\n🌐 bootscootinlinedancing.co.uk\n📸 Instagram: @boot.scootin.linedancing\n\nGood Boots. Great Moves. Even Better Memories. 🤎`;
  return {subject:`${testMode?'TEST — ':''}${SPECIAL_EVENT_CONFIRMATION_SUBJECT}`,html,text};
}

export async function specialEventReadiness(db,eventId){
  const event=await db.prepare(`SELECT * FROM special_events WHERE id=?`).bind(eventId).first();
  if(!event)return null;
  const [days,products,credentials]=await Promise.all([
    db.prepare(`SELECT * FROM special_event_days WHERE event_id=? ORDER BY display_order`).bind(eventId).all(),
    db.prepare(`SELECT p.*,
      CASE WHEN p.code='MINI_COMPETITION' THEN COALESCE((SELECT COUNT(*) FROM special_event_competition_entries c JOIN special_event_bookings b ON b.id=c.booking_id WHERE c.event_id=p.event_id AND c.status<>'WITHDRAWN' AND b.status='PAID' AND b.payment_provider<>'COMPLIMENTARY'),0) ELSE COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b WHERE b.product_id=p.id AND b.status='PAID' AND b.payment_provider<>'COMPLIMENTARY'),0) END sold_count,
      CASE WHEN p.code='MINI_COMPETITION' THEN COALESCE((SELECT COUNT(*) FROM special_event_competition_entries c JOIN special_event_bookings b ON b.id=c.booking_id WHERE c.event_id=p.event_id AND c.status<>'WITHDRAWN' AND b.status='PAID' AND b.payment_provider='COMPLIMENTARY'),0) ELSE COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b WHERE b.product_id=p.id AND b.status='PAID' AND b.payment_provider='COMPLIMENTARY'),0) END complimentary_count,
      COALESCE((SELECT SUM(h.quantity) FROM special_event_holds h WHERE h.product_id=p.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0) held_count,
      CASE WHEN p.allocation IS NULL THEN NULL ELSE MAX(0,p.allocation
        -CASE WHEN p.code='MINI_COMPETITION' THEN COALESCE((SELECT COUNT(*) FROM special_event_competition_entries c JOIN special_event_bookings b ON b.id=c.booking_id WHERE c.event_id=p.event_id AND c.status<>'WITHDRAWN' AND b.status='PAID'),0) ELSE COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b WHERE b.product_id=p.id AND b.status='PAID'),0) END
        -COALESCE((SELECT SUM(h.quantity) FROM special_event_holds h WHERE h.product_id=p.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0)) END remaining
      FROM special_event_ticket_products p WHERE p.event_id=? ORDER BY p.display_order`).bind(eventId).all(),
    db.prepare(`SELECT product_id FROM special_event_access_credentials WHERE event_id=? AND active=1`).bind(eventId).all()
  ]);
  const credentialProducts=new Set((credentials.results||[]).map(row=>row.product_id));
  const blockers=[];
  if((days.results||[]).some(day=>day.capacity==null))blockers.push('DAY_CAPACITY_UNCONFIRMED');
  if((event.saturday_evening_capacity==null||!Number(event.saturday_evening_capacity_confirmed))&&(products.results||[]).some(product=>Number(product.includes_saturday_evening)))blockers.push('SATURDAY_EVENING_CAPACITY_UNCONFIRMED');
  if(!Number(event.age_terms_confirmed))blockers.push('AGE_TERMS_UNCONFIRMED');
  if(!Number(event.refund_policy_confirmed))blockers.push('REFUND_POLICY_UNCONFIRMED');
  if(!Number(event.public_presentation_approved))blockers.push('PUBLIC_PRESENTATION_UNAPPROVED');
  if(!Number(event.payment_integration_verified))blockers.push('PAYMENT_INTEGRATION_UNVERIFIED');
  if(!Number(event.production_installation_verified))blockers.push('PRODUCTION_INSTALLATION_UNVERIFIED');
  if(event.programme_approval_status!=='ARTIST_APPROVED')blockers.push('PROGRAMME_NOT_ARTIST_APPROVED');
  if(!event.artwork_url)blockers.push('EVENT_ARTWORK_NOT_UPLOADED');
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
      const event=await env.BOOKINGS_DB.prepare(`SELECT id,slug,title,subtitle,venue_name,venue_address,venue_notes,public_summary,public_description,artwork_url,promo_video_url,promo_video_title,promo_video_caption,promo_video_poster_url,promo_video_display_enabled,instructor_name,instructor_intro,instructor_biography,instructor_website_url,instructor_photo_url,instructor_photo_caption,programme_approval_status,status,checkout_enabled,age_terms,age_terms_confirmed,refund_policy,refund_policy_confirmed
        FROM special_events WHERE slug=? AND status='PUBLISHED' AND publication_enabled=1`).bind(slug).first();
      if(!event)return response({error:'This event is not currently published.'},404);
      const [days,programme,products,choreographies]=await Promise.all([
        env.BOOKINGS_DB.prepare(`SELECT id,event_date,label,display_order FROM special_event_days WHERE event_id=? ORDER BY display_order`).bind(event.id).all(),
        env.BOOKINGS_DB.prepare(`SELECT p.day_id,p.item_type,p.title,p.description,p.starts_at,p.ends_at,p.timing_confirmed,p.programme_status,p.display_order FROM special_event_programme_items p WHERE p.event_id=? ORDER BY p.day_id,p.display_order`).bind(event.id).all(),
        env.BOOKINGS_DB.prepare(`SELECT p.id,p.code,p.name,p.description,p.product_type,p.price_pence,p.allocation,p.release_state,p.password_required,p.requires_qualifying_admission,p.is_junior,p.requires_guardian,p.competition_eligible,p.includes_saturday_evening,p.max_per_checkout,p.display_order,
          COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b WHERE b.product_id=p.id AND b.status='PAID'),0) sold_count,
          CASE WHEN p.allocation IS NULL THEN NULL ELSE MAX(0,p.allocation-COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b WHERE b.product_id=p.id AND b.status='PAID'),0)-COALESCE((SELECT SUM(h.quantity) FROM special_event_holds h WHERE h.product_id=p.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0)) END remaining,
          CASE WHEN EXISTS(SELECT 1 FROM special_event_product_days pd JOIN special_event_days d ON d.id=pd.day_id WHERE pd.product_id=p.id AND d.capacity IS NOT NULL AND d.capacity<=COALESCE((SELECT SUM(bd.places) FROM special_event_booking_days bd JOIN special_event_bookings b ON b.id=bd.booking_id WHERE bd.day_id=d.id AND b.status='PAID'),0)) OR (p.includes_saturday_evening=1 AND (SELECT saturday_evening_capacity FROM special_events WHERE id=p.event_id) IS NOT NULL AND (SELECT saturday_evening_capacity FROM special_events WHERE id=p.event_id)<=COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b JOIN special_event_ticket_products bp ON bp.id=b.product_id WHERE b.event_id=p.event_id AND b.status='PAID' AND bp.includes_saturday_evening=1),0)) THEN 1 ELSE 0 END shared_capacity_sold_out
          FROM special_event_ticket_products p WHERE p.event_id=? AND p.release_state IN ('ACTIVE','SOLD_OUT') ORDER BY p.display_order`).bind(event.id).all(),
        env.BOOKINGS_DB.prepare(`SELECT id,title,info_url,copperknob_url,bootstepper_url,display_order FROM special_event_choreographies WHERE event_id=? ORDER BY display_order`).bind(event.id).all()
      ]);
      const publicProducts=(products.results||[]).map(product=>{
        const paid=Number(product.sold_count||0),allocation=product.allocation==null?null:Number(product.allocation),temporarilyUnavailable=product.remaining!=null&&Number(product.remaining)<=0&&allocation!=null&&paid<allocation;
        const availability_status=product.release_state==='SOLD_OUT'||Number(product.shared_capacity_sold_out)||(allocation!=null&&paid>=allocation)?'SOLD_OUT':product.release_state==='ACTIVE'?(temporarilyUnavailable?'TEMPORARILY_UNAVAILABLE':'AVAILABLE'):product.release_state==='CLOSED'?'SALES_CLOSED':'NOT_YET_AVAILABLE';
        const {allocation:_allocation,sold_count:_sold,remaining:_remaining,shared_capacity_sold_out:_shared,...safe}=product;
        return {...safe,availability_status};
      });
      return response({event,days:days.results||[],programme:programme.results||[],ticket_products:publicProducts,choreographies:choreographies.results||[]});
    }
    const rows=await env.BOOKINGS_DB.prepare(`SELECT e.slug,e.title,e.subtitle,e.venue_name,e.public_summary,e.artwork_url,
      (SELECT MIN(d.event_date) FROM special_event_days d WHERE d.event_id=e.id) starts_on,
      (SELECT MAX(d.event_date) FROM special_event_days d WHERE d.event_id=e.id) ends_on
      FROM special_events e WHERE e.status='PUBLISHED' AND e.publication_enabled=1 ORDER BY starts_on`).all();
    return response({events:rows.results||[]});
  }catch(error){if(schemaMissing(error))return response({events:[]});throw error;}
}

export async function adminSpecialEvents(request,env,admin,services={}){
  if(!env.BOOKINGS_DB)return response({error:'BOOKINGS_DB is not connected.'},503);
  const url=new URL(request.url),eventId=tidy(url.searchParams.get('id'),160)||'special-event-johnny-rossato-2027';
  if(request.method==='GET'){
    try{
      const ticketAttendee=tidy(url.searchParams.get('ticket_attendee'),180);
      if(ticketAttendee){
        const ticket=await env.BOOKINGS_DB.prepare(`SELECT a.id,a.name,a.ticket_number,a.qr_token,a.status attendee_status,b.reference,b.status booking_status,b.payment_provider,b.product_name_snapshot,e.title,e.venue_name
          FROM special_event_attendees a JOIN special_event_bookings b ON b.id=a.booking_id JOIN special_events e ON e.id=b.event_id
          WHERE a.id=? AND b.event_id=?`).bind(ticketAttendee,eventId).first();
        if(!ticket)return response({error:'Ticket not found.'},404);
        const qrPayload=`${new URL(request.url).origin}/api/admin/special-events?id=${encodeURIComponent(eventId)}&verify_qr=${encodeURIComponent(ticket.qr_token)}`;
        if(url.searchParams.get('format')==='html')return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${specialHtmlEscape(ticket.ticket_number)}</title><style>body{font:18px system-ui;background:#090505;color:#f8eadb;padding:30px}main{max-width:680px;margin:auto;border:2px solid #c5222d;padding:28px;background:#160909}h1{color:#fff}strong{color:#ef3943}code{display:block;overflow-wrap:anywhere;padding:14px;background:#fff;color:#111}button{padding:12px 18px}</style><main><p>BOOT SCOOTIN’ SPECIAL EVENT</p><h1>${specialHtmlEscape(ticket.name)}</h1><p><strong>${specialHtmlEscape(ticket.product_name_snapshot)}</strong></p><p>${specialHtmlEscape(ticket.title)} · ${specialHtmlEscape(ticket.venue_name)}</p><p>Ticket ${specialHtmlEscape(ticket.ticket_number)}</p><p>Status: ${ticket.attendee_status==='ACTIVE'&&ticket.booking_status==='PAID'?'VALID':'NOT VALID'} · ${ticket.payment_provider==='COMPLIMENTARY'?'COMPLIMENTARY — £0.00':specialHtmlEscape(ticket.payment_provider)}</p><p>Secure QR admission payload:</p><code>${specialHtmlEscape(qrPayload)}</code><p><button onclick="print()">Print / Save Ticket</button></p></main>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
        return response({ticket:{...ticket,qr_payload:qrPayload}});
      }
      const verifyQr=tidy(url.searchParams.get('verify_qr'),100);
      if(verifyQr){
        const ticket=await env.BOOKINGS_DB.prepare(`SELECT a.id,a.name,a.ticket_number,a.status attendee_status,b.reference,b.status booking_status,b.payment_provider,b.product_name_snapshot
          FROM special_event_attendees a JOIN special_event_bookings b ON b.id=a.booking_id WHERE a.qr_token=? AND b.event_id=?`).bind(verifyQr,eventId).first();
        if(!ticket)return response({valid:false,error:'Admission code not found.'},404);
        return response({valid:ticket.attendee_status==='ACTIVE'&&ticket.booking_status==='PAID',ticket});
      }
      const ready=await specialEventReadiness(env.BOOKINGS_DB,eventId);
      if(!ready)return response({error:'Special event not found.'},404);
      const [programme,bookings,attendees,attendance,competition,tasks,documents,activity,choreographies,capacity,confirmations,messages]=await Promise.all([
        env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_programme_items WHERE event_id=? ORDER BY day_id,display_order`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT id,reference,customer_name,customer_email,customer_phone,quantity,product_name_snapshot,amount_pence,status,payment_provider,paid_at,created_at FROM special_event_bookings WHERE event_id=? ORDER BY created_at DESC,id ASC LIMIT 250`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT a.id,a.booking_id,a.name,a.age_at_event,a.ticket_number,a.status,b.reference,b.status booking_status,b.payment_provider,b.product_id,b.product_name_snapshot,
          EXISTS(SELECT 1 FROM special_event_competition_entries c WHERE c.event_id=b.event_id AND c.attendee_id=a.id AND c.status<>'WITHDRAWN') competition_registered
          FROM special_event_attendees a JOIN special_event_bookings b ON b.id=a.booking_id
          WHERE b.event_id=? ORDER BY a.name,a.created_at`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT x.attendee_id,x.day_id,x.attended_at,x.checked_in_by FROM special_event_attendance x JOIN special_event_attendees a ON a.id=x.attendee_id JOIN special_event_bookings b ON b.id=a.booking_id WHERE b.event_id=? ORDER BY x.day_id,a.name`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT c.id,c.entry_number,c.status,c.result_notes,c.created_at,c.attendee_id,c.contact_email,c.contact_phone,c.contact_is_guardian,a.name attendee_name,a.age_at_event,b.reference,b.payment_provider,b.product_name_snapshot
          FROM special_event_competition_entries c JOIN special_event_bookings b ON b.id=c.booking_id LEFT JOIN special_event_attendees a ON a.id=c.attendee_id
          WHERE c.event_id=? ORDER BY c.entry_number`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_tasks WHERE event_id=? ORDER BY display_order,created_at`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT d.*,COUNT(v.id) version_count,(SELECT latest.id FROM special_event_document_versions latest WHERE latest.document_id=d.id ORDER BY latest.version DESC LIMIT 1) current_version_id FROM special_event_documents d LEFT JOIN special_event_document_versions v ON v.document_id=d.id WHERE d.event_id=? GROUP BY d.id ORDER BY d.created_at DESC`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_activity WHERE event_id=? ORDER BY created_at DESC LIMIT 250`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_choreographies WHERE event_id=? ORDER BY display_order`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT d.id,d.label,d.capacity,
          COALESCE((SELECT SUM(p.allocation*pd.places_per_ticket) FROM special_event_product_days pd JOIN special_event_ticket_products p ON p.id=pd.product_id WHERE pd.day_id=d.id AND p.product_type='ADMISSION' AND p.allocation IS NOT NULL),0) configured_allocation,
          COALESCE((SELECT SUM(bd.places) FROM special_event_booking_days bd JOIN special_event_bookings b ON b.id=bd.booking_id WHERE bd.day_id=d.id AND b.status='PAID' AND b.payment_provider<>'COMPLIMENTARY'),0) paid,
          COALESCE((SELECT SUM(bd.places) FROM special_event_booking_days bd JOIN special_event_bookings b ON b.id=bd.booking_id WHERE bd.day_id=d.id AND b.status='PAID' AND b.payment_provider='COMPLIMENTARY'),0) complimentary,
          COALESCE((SELECT SUM(hd.places) FROM special_event_hold_days hd JOIN special_event_holds h ON h.id=hd.hold_id WHERE hd.day_id=d.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0) held,
          COALESCE((SELECT COUNT(*) FROM special_event_attendance x JOIN special_event_attendees a ON a.id=x.attendee_id JOIN special_event_bookings b ON b.id=a.booking_id WHERE x.day_id=d.id AND x.attended_at IS NOT NULL AND a.status='ACTIVE' AND b.status='PAID'),0) checked_in
          FROM special_event_days d WHERE d.event_id=? ORDER BY d.display_order`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT o.*,b.reference,b.customer_name,b.product_name_snapshot,b.status booking_status FROM special_event_confirmation_outbox o JOIN special_event_bookings b ON b.id=o.booking_id WHERE b.event_id=? ORDER BY o.created_at DESC`).bind(eventId).all(),
        env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_competitor_messages WHERE event_id=? ORDER BY created_at DESC LIMIT 50`).bind(eventId).all()
      ]);
      const evening=await env.BOOKINGS_DB.prepare(`SELECT e.saturday_evening_capacity capacity,e.saturday_evening_capacity_confirmed capacity_confirmed,
        COALESCE((SELECT SUM(p.allocation) FROM special_event_ticket_products p WHERE p.event_id=e.id AND p.product_type='ADMISSION' AND p.includes_saturday_evening=1 AND p.allocation IS NOT NULL),0) configured_allocation,
        COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id WHERE b.event_id=e.id AND b.status='PAID' AND b.payment_provider<>'COMPLIMENTARY' AND p.includes_saturday_evening=1),0) paid,
        COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id WHERE b.event_id=e.id AND b.status='PAID' AND b.payment_provider='COMPLIMENTARY' AND p.includes_saturday_evening=1),0) complimentary,
        COALESCE((SELECT SUM(h.quantity) FROM special_event_holds h JOIN special_event_ticket_products p ON p.id=h.product_id WHERE h.event_id=e.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND p.includes_saturday_evening=1),0) held
        FROM special_events e WHERE e.id=?`).bind(eventId).first();
      const [reporting,loyaltyCredential]=await Promise.all([
        env.BOOKINGS_DB.prepare(`SELECT
          COALESCE(SUM(CASE WHEN b.status='PAID' AND b.payment_provider<>'COMPLIMENTARY' AND p.product_type='ADMISSION' THEN b.quantity ELSE 0 END),0) paid_tickets,
          COALESCE(SUM(CASE WHEN b.status='PAID' AND b.payment_provider='COMPLIMENTARY' AND p.product_type='ADMISSION' THEN b.quantity ELSE 0 END),0) complimentary_tickets,
          COALESCE(SUM(CASE WHEN b.status='PAID' AND b.payment_provider<>'COMPLIMENTARY' THEN b.amount_pence ELSE 0 END),0) paid_revenue_pence
          FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id WHERE b.event_id=?`).bind(eventId).first(),
        env.BOOKINGS_DB.prepare(`SELECT c.id FROM special_event_access_credentials c JOIN special_event_ticket_products p ON p.id=c.product_id WHERE c.event_id=? AND p.code='LOYALTY_WEEKEND' AND c.active=1 LIMIT 1`).bind(eventId).first()
      ]);
      return response({...ready,programme:programme.results||[],bookings:bookings.results||[],attendees:attendees.results||[],attendance:attendance.results||[],competition:competition.results||[],confirmations:confirmations.results||[],competitor_messages:messages.results||[],tasks:tasks.results||[],documents:documents.results||[],activity:activity.results||[],choreographies:choreographies.results||[],capacity:[...(capacity.results||[]),{id:'saturday-evening',label:'Saturday evening',...evening}],reporting,loyalty_password_configured:Boolean(loyaltyCredential)});
    }catch(error){if(schemaMissing(error))return response({error:'Migration 0032_special_events.sql has not been applied in this environment.',code:'SPECIAL_EVENTS_SCHEMA_MISSING'},503);throw error;}
  }
  const body=await request.json().catch(()=>null);
  if(!body)return response({error:'The request could not be read.'},400);
  if(request.method==='PATCH'){
    const action=tidy(body.action,80);
    if(action==='RECOVER_CORRECTED_CONFIRMATION'){
      if(String(env.SPECIAL_EVENT_EMAILS_ENABLED||'').toLowerCase()!=='true'||typeof services.sendEmail!=='function')return response({error:'Special Event transactional email delivery is not enabled.'},409);
      if(tidy(body.confirmation,80)!=='SEND ONE CORRECTED CONFIRMATION')return response({error:'Type SEND ONE CORRECTED CONFIRMATION to continue.'},400);
      const result=await recoverCorrectedSpecialEventConfirmation(env,services.sendEmail,admin,{eventId,bookingId:tidy(body.booking_id,180),correctedEmail:tidy(body.corrected_email,240)});
      return response(result,result.ok?200:(result.status||500));
    }
    if(action==='RECOVER_PAID_CUSTOMER_CONFIRMATIONS'){
      if(String(env.SPECIAL_EVENT_EMAILS_ENABLED||'').toLowerCase()!=='true'||typeof services.sendEmail!=='function')return response({error:'Special Event transactional email delivery is not enabled.'},409);
      if(tidy(body.confirmation,80)!=='SEND SIX VERIFIED CONFIRMATIONS')return response({error:'Type SEND SIX VERIFIED CONFIRMATIONS to continue.'},400);
      const references=[...new Set((Array.isArray(body.references)?body.references:[]).map(value=>tidy(value,120)).filter(Boolean))];
      if(references.length!==6)return response({error:'Exactly six verified booking references are required.'},400);
      const placeholders=references.map(()=>'?').join(',');
      const rows=await env.BOOKINGS_DB.prepare(`SELECT b.id,b.reference,b.customer_email,b.status,b.payment_provider,o.status confirmation_status FROM special_event_bookings b JOIN special_event_confirmation_outbox o ON o.booking_id=b.id WHERE b.event_id=? AND b.reference IN (${placeholders}) ORDER BY b.reference`).bind(eventId,...references).all(),bookings=rows.results||[];
      if(bookings.length!==6||bookings.some(row=>row.status!=='PAID'||row.payment_provider!=='SUMUP'||!['DISABLED','FAILED','SENT'].includes(row.confirmation_status)||String(row.customer_email||'').toLowerCase()==='nora@bootscootinlinedancing.co.uk'))return response({error:'The recovery set does not match six verified paid customer bookings.'},409);
      const alreadySent=bookings.filter(row=>row.confirmation_status==='SENT');
      for(const booking of bookings.filter(row=>row.confirmation_status!=='SENT')){
        const [event,days,attendees,competition,programme,detail]=await Promise.all([
          env.BOOKINGS_DB.prepare(`SELECT * FROM special_events WHERE id=?`).bind(eventId).first(),
          env.BOOKINGS_DB.prepare(`SELECT d.label,d.event_date FROM special_event_booking_days bd JOIN special_event_days d ON d.id=bd.day_id WHERE bd.booking_id=? ORDER BY d.display_order`).bind(booking.id).all(),
          env.BOOKINGS_DB.prepare(`SELECT name,age_at_event,guardian_email FROM special_event_attendees WHERE booking_id=? ORDER BY created_at,id`).bind(booking.id).all(),
          env.BOOKINGS_DB.prepare(`SELECT a.name attendee_name FROM special_event_competition_entries c LEFT JOIN special_event_attendees a ON a.id=c.attendee_id WHERE c.booking_id=? AND c.status<>'WITHDRAWN'`).bind(booking.id).all(),
          env.BOOKINGS_DB.prepare(`SELECT title,starts_at,ends_at,programme_status,display_order FROM special_event_programme_items WHERE event_id=? ORDER BY day_id,display_order`).bind(eventId).all(),
          env.BOOKINGS_DB.prepare(`SELECT b.*,p.description product_description FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id WHERE b.id=?`).bind(booking.id).first()
        ]),copy=specialEventConfirmationCopy({booking:detail,event,days:days.results||[],attendees:attendees.results||[],competition:competition.results||[],programme:programme.results||[]});
        await env.BOOKINGS_DB.prepare(`UPDATE special_event_confirmation_outbox SET status='READY',recipient_email=?,subject=?,next_attempt_at=CURRENT_TIMESTAMP,last_error=NULL WHERE booking_id=? AND status IN ('DISABLED','FAILED')`).bind(detail.customer_email,copy.subject,booking.id).run();
      }
      const delivery=await processSpecialEventConfirmations(env,services.sendEmail,6);
      const statuses=await env.BOOKINGS_DB.prepare(`SELECT b.reference,o.status,o.provider_id,o.sent_at,o.last_error FROM special_event_bookings b JOIN special_event_confirmation_outbox o ON o.booking_id=b.id WHERE b.event_id=? AND b.reference IN (${placeholders}) ORDER BY b.reference`).bind(eventId,...references).all();
      const results=statuses.results||[],complete=results.length===6&&results.every(row=>row.status==='SENT'&&row.provider_id);
      await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'CUSTOMER_CONFIRMATIONS_RECOVERED','SPECIAL_EVENT',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,eventId,admin.email,'Owner-approved recovery of six verified paid customer confirmations.',JSON.stringify({requested:6,already_sent:alreadySent.length,sent:delivery.sent,failed:delivery.failed}),`customer-confirmation-recovery:${references.slice().sort().join(':')}`).run();
      return response({ok:complete,delivery,results},complete?200:502);
    }
    if(action==='PREVIEW_BOOKING_CONFIRMATION'||action==='QUEUE_BOOKING_CONFIRMATION'){
      const bookingId=tidy(body.booking_id,180),booking=await env.BOOKINGS_DB.prepare(`SELECT b.*,p.description product_description FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id WHERE b.id=? AND b.event_id=?`).bind(bookingId,eventId).first();
      if(!booking)return response({error:'Booking not found.'},404);
      if(booking.status!=='PAID')return response({error:'Only an authoritative PAID booking can receive a confirmation.'},409);
      const [event,days,attendees,competition,programme]=await Promise.all([
        env.BOOKINGS_DB.prepare(`SELECT * FROM special_events WHERE id=?`).bind(eventId).first(),
        env.BOOKINGS_DB.prepare(`SELECT d.label,d.event_date FROM special_event_booking_days bd JOIN special_event_days d ON d.id=bd.day_id WHERE bd.booking_id=? ORDER BY d.display_order`).bind(bookingId).all(),
        env.BOOKINGS_DB.prepare(`SELECT name,age_at_event,guardian_email FROM special_event_attendees WHERE booking_id=? ORDER BY created_at,id`).bind(bookingId).all(),
        env.BOOKINGS_DB.prepare(`SELECT a.name attendee_name FROM special_event_competition_entries c LEFT JOIN special_event_attendees a ON a.id=c.attendee_id WHERE c.booking_id=? AND c.status<>'WITHDRAWN'`).bind(bookingId).all(),
        env.BOOKINGS_DB.prepare(`SELECT title,starts_at,ends_at,programme_status,display_order FROM special_event_programme_items WHERE event_id=? ORDER BY day_id,display_order`).bind(eventId).all()
      ]),copy=specialEventConfirmationCopy({booking,event,days:days.results||[],attendees:attendees.results||[],competition:competition.results||[],programme:programme.results||[]});
      if(action==='PREVIEW_BOOKING_CONFIRMATION')return response({ok:true,...copy,recipient:booking.customer_email});
      if(tidy(body.confirmation,40)!=='QUEUE CONFIRMATION')return response({error:'Type QUEUE CONFIRMATION to continue.'},400);
      await env.BOOKINGS_DB.prepare(`UPDATE special_event_confirmation_outbox SET status='READY',recipient_email=?,subject=?,next_attempt_at=CURRENT_TIMESTAMP,last_error=NULL WHERE booking_id=? AND status IN ('DISABLED','FAILED')`).bind(booking.customer_email,copy.subject,bookingId).run();
      return response({ok:true,status:'READY'});
    }
    if(action==='PREVIEW_COMPETITOR_MESSAGE'||action==='SEND_COMPETITOR_MESSAGE'){
      const subject=tidy(body.subject,240),message=tidy(body.body_text,8000);
      if(!subject||!message)return response({error:'Add a subject and message.'},400);
      const recipients=await env.BOOKINGS_DB.prepare(`SELECT c.id,c.contact_email,a.name attendee_name FROM special_event_competition_entries c LEFT JOIN special_event_attendees a ON a.id=c.attendee_id WHERE c.event_id=? AND c.status<>'WITHDRAWN' AND c.contact_email<>'' ORDER BY c.entry_number`).bind(eventId).all();
      const unique=[...new Map((recipients.results||[]).map(row=>[String(row.contact_email).toLowerCase(),row])).values()];
      if(action==='PREVIEW_COMPETITOR_MESSAGE')return response({ok:true,recipient_count:unique.length,subject,body_text:message,sample_recipients:unique.slice(0,3).map(row=>({attendee_name:row.attendee_name,email_masked:String(row.contact_email).replace(/^(.).+(@.+)$/,'$1…$2')}))});
      if(tidy(body.confirmation,50)!=='EMAIL ALL COMPETITORS')return response({error:'Type EMAIL ALL COMPETITORS to confirm.'},400);
      if(String(env.SPECIAL_EVENT_EMAILS_ENABLED||'').toLowerCase()!=='true'||typeof services.sendEmail!=='function')return response({error:'Outbound Special Event email is intentionally disabled in this environment.'},409);
      const messageId=crypto.randomUUID();
      await env.BOOKINGS_DB.prepare(`INSERT INTO special_event_competitor_messages(id,event_id,subject,body_text,recipient_count,status,created_by,confirmed_by) VALUES(?,?,?,?,?,'SENDING',?,?)`).bind(messageId,eventId,subject,message,unique.length,admin.email,admin.email).run();
      let sent=0,failed=0,lastError='';
      for(const row of unique){const deliveryId=crypto.randomUUID();await env.BOOKINGS_DB.prepare(`INSERT INTO special_event_competitor_message_deliveries(id,message_id,competition_entry_id,recipient_email,status) VALUES(?,?,?,?,'SENDING')`).bind(deliveryId,messageId,row.id,String(row.contact_email).toLowerCase()).run();try{const schedule='<p><strong>Competition schedule:</strong><br>Registration: 7:00–7:30 pm<br>Kingdom of Fear Mini Competition: 7:30–8:00 pm<br>Proposed awards: 8:00–8:15 pm</p>';const result=await services.sendEmail(String(row.contact_email).toLowerCase(),subject,eventEmailShell({heading:subject,greeting:`Hi ${row.attendee_name||'dancer'},`,body:`<p>${specialHtmlEscape(message).replaceAll('\n','<br>')}</p>`,details:`<p>This operational message is about your Kingdom of Fear Mini Competition entry.</p>${schedule}`}),`${message}\n\nCompetition schedule:\nRegistration: 7:00–7:30 pm\nKingdom of Fear Mini Competition: 7:30–8:00 pm\nProposed awards: 8:00–8:15 pm`);await env.BOOKINGS_DB.prepare(`UPDATE special_event_competitor_message_deliveries SET status='SENT',attempt_count=1,provider_id=?,sent_at=CURRENT_TIMESTAMP WHERE id=?`).bind(result?.id||null,deliveryId).run();sent++;}catch(error){lastError=tidy(error?.message||error,500);await env.BOOKINGS_DB.prepare(`UPDATE special_event_competitor_message_deliveries SET status='FAILED',attempt_count=1,last_error=? WHERE id=?`).bind(lastError,deliveryId).run();failed++;}}
      await env.BOOKINGS_DB.batch([env.BOOKINGS_DB.prepare(`UPDATE special_event_competitor_messages SET status=?,sent_count=?,failed_count=?,last_error=?,sent_at=CURRENT_TIMESTAMP WHERE id=?`).bind(failed?'FAILED':'SENT',sent,failed,lastError||null,messageId),env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'COMPETITORS_EMAILED','COMPETITOR_MESSAGE',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,messageId,admin.email,'Owner-confirmed operational competition email.',JSON.stringify({recipient_count:unique.length,sent,failed}),`competitor-message:${messageId}`)]);
      return response({ok:true,message_id:messageId,sent,failed});
    }
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
      const saturday=body.saturday_capacity==null?null:Number(body.saturday_capacity),sunday=body.sunday_capacity==null?null:Number(body.sunday_capacity),evening=body.saturday_evening_capacity==null?null:Number(body.saturday_evening_capacity),eveningConfirmed=body.saturday_evening_capacity_confirmed?1:0;
      if([saturday,sunday,evening].some(value=>value!=null&&(!Number.isInteger(value)||value<1)))return response({error:'Capacities must be positive whole numbers or left unconfirmed.'},400);
      const usage=await env.BOOKINGS_DB.prepare(`SELECT d.display_order,
        COALESCE((SELECT SUM(bd.places) FROM special_event_booking_days bd JOIN special_event_bookings b ON b.id=bd.booking_id WHERE bd.day_id=d.id AND b.status='PAID'),0)+
        COALESCE((SELECT SUM(hd.places) FROM special_event_hold_days hd JOIN special_event_holds h ON h.id=hd.hold_id WHERE hd.day_id=d.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0) committed
        FROM special_event_days d WHERE d.event_id=? ORDER BY d.display_order`).bind(eventId).all();
      const eveningUsage=await env.BOOKINGS_DB.prepare(`SELECT
        COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id WHERE b.event_id=? AND b.status='PAID' AND p.includes_saturday_evening=1),0)+
        COALESCE((SELECT SUM(h.quantity) FROM special_event_holds h JOIN special_event_ticket_products p ON p.id=h.product_id WHERE h.event_id=? AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND p.includes_saturday_evening=1),0) committed`).bind(eventId,eventId).first();
      const byDay=new Map((usage.results||[]).map(row=>[Number(row.display_order),Number(row.committed||0)]));
      if(saturday!=null&&saturday<(byDay.get(1)||0))return response({error:'Saturday capacity cannot be lower than paid, complimentary and actively held places.'},409);
      if(sunday!=null&&sunday<(byDay.get(2)||0))return response({error:'Sunday capacity cannot be lower than paid, complimentary and actively held places.'},409);
      if(evening!=null&&evening<Number(eveningUsage?.committed||0))return response({error:'Saturday evening capacity cannot be lower than paid, complimentary and actively held places.'},409);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_days SET capacity=? WHERE event_id=? AND display_order=1`).bind(saturday,eventId),
        env.BOOKINGS_DB.prepare(`UPDATE special_event_days SET capacity=? WHERE event_id=? AND display_order=2`).bind(sunday,eventId),
        env.BOOKINGS_DB.prepare(`UPDATE special_events SET saturday_evening_capacity=?,saturday_evening_capacity_confirmed=?,age_terms=?,age_terms_confirmed=?,refund_policy=?,refund_policy_confirmed=?,payment_integration_verified=?,production_installation_verified=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).bind(evening,eveningConfirmed,tidy(body.age_terms,4000)||null,body.age_terms_confirmed?1:0,tidy(body.refund_policy,4000)||null,body.refund_policy_confirmed?1:0,body.payment_integration_verified?1:0,body.production_installation_verified?1:0,eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'SAFETY_SETTINGS_UPDATED','SPECIAL_EVENT',?,?,?,?)`).bind(crypto.randomUUID(),eventId,eventId,admin.email,tidy(body.reason,500)||'HQ safety settings update',crypto.randomUUID())
      ]);
      return response({ok:true,readiness:await specialEventReadiness(env.BOOKINGS_DB,eventId)});
    }
    if(action==='UPDATE_PRESENTATION'){
      const artworkUrl=tidy(body.artwork_url,500)||null,publicDescription=tidy(body.public_description,4000)||null,venueNotes=tidy(body.venue_notes,3000)||null;
      if(artworkUrl&&artworkUrl!==`/api/special-event-artwork?id=${encodeURIComponent(eventId)}`)return response({error:'Use the protected Special Events artwork upload.'},400);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_events SET artwork_url=?,title=?,subtitle=?,public_summary=?,public_description=?,venue_name=?,venue_address=?,venue_notes=?,public_presentation_approved=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).bind(artworkUrl,tidy(body.title,240),tidy(body.subtitle,240)||null,tidy(body.public_summary,500)||null,publicDescription,tidy(body.venue_name,240),tidy(body.venue_address,500)||null,venueNotes,body.public_presentation_approved?1:0,eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'EVENT_PRESENTATION_UPDATED','SPECIAL_EVENT',?,?,?,?)`).bind(crypto.randomUUID(),eventId,eventId,admin.email,tidy(body.reason,500)||'Event presentation updated in HQ.',crypto.randomUUID())
      ]);
      return response({ok:true});
    }
    if(action==='UPDATE_PRODUCT'){
      const productId=tidy(body.product_id,160),allocation=body.allocation==null||body.allocation===''?null:Number(body.allocation),state=tidy(body.release_state,20),price=Number(body.price_pence),limit=Number(body.max_per_checkout);
      if(allocation!=null&&(!Number.isInteger(allocation)||allocation<0))return response({error:'Allocation must be a whole number or remain unconfirmed.'},400);
      if(!Number.isInteger(price)||price<0)return response({error:'Price must be a valid amount in pence.'},400);
      if(!Number.isInteger(limit)||limit<1||limit>20)return response({error:'Quantity limit must be between 1 and 20.'},400);
      if(!['INACTIVE','ACTIVE','SOLD_OUT','CLOSED'].includes(state))return response({error:'Choose a valid release state.'},400);
      const product=await env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_ticket_products WHERE id=? AND event_id=?`).bind(productId,eventId).first();if(!product)return response({error:'Ticket product not found.'},404);
      const claimed=await env.BOOKINGS_DB.prepare(`SELECT
        COALESCE((SELECT SUM(quantity) FROM special_event_bookings WHERE product_id=? AND status='PAID'),0)+
        COALESCE((SELECT SUM(quantity) FROM special_event_holds WHERE product_id=? AND status='ACTIVE' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0) total`).bind(productId,productId).first();
      if(allocation!=null&&allocation<Number(claimed?.total||0))return response({error:'Allocation cannot be lower than paid, complimentary and actively held ticket quantity.'},409);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_ticket_products SET price_pence=?,allocation=?,description=?,max_per_checkout=?,release_state=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND event_id=?`).bind(price,allocation,tidy(body.description,2000)||null,limit,state,productId,eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'TICKET_PRODUCT_UPDATED','TICKET_PRODUCT',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,productId,admin.email,tidy(body.reason,500)||'HQ ticket configuration update',JSON.stringify({previous_allocation:product.allocation,new_allocation:allocation,previous_state:product.release_state,new_state:state}),crypto.randomUUID())
      ]);
      return response({ok:true,readiness:await specialEventReadiness(env.BOOKINGS_DB,eventId)});
    }
    if(action==='UPDATE_ALLOCATION'){
      const productId=tidy(body.product_id,160),allocation=Number(body.allocation),reason=tidy(body.reason,500);
      if(!Number.isInteger(allocation)||allocation<0)return response({error:'Allocation must be a non-negative whole number.'},400);
      if(!reason)return response({error:'Add an audit reason for this allocation change.'},400);
      const product=await env.BOOKINGS_DB.prepare(`SELECT id,name,allocation FROM special_event_ticket_products WHERE id=? AND event_id=?`).bind(productId,eventId).first();
      if(!product)return response({error:'Ticket product not found.'},404);
      const previous=product.allocation==null?null:Number(product.allocation),metadata=JSON.stringify({previous_allocation:previous,new_allocation:allocation});
      const [updated]=await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_ticket_products SET allocation=?,release_state=CASE WHEN release_state='SOLD_OUT' THEN 'ACTIVE' ELSE release_state END,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND event_id=? AND allocation IS ? AND ?>=(
            COALESCE((SELECT SUM(quantity) FROM special_event_bookings WHERE product_id=? AND status='PAID'),0)+
            COALESCE((SELECT SUM(quantity) FROM special_event_holds WHERE product_id=? AND status='ACTIVE' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0)
          )`).bind(allocation,productId,eventId,product.allocation,allocation,productId,productId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key)
          SELECT ?,?,'TICKET_ALLOCATION_UPDATED','TICKET_PRODUCT',?,?,?,?,? WHERE changes()>0`).bind(crypto.randomUUID(),eventId,productId,admin.email,reason,metadata,crypto.randomUUID())
      ]);
      if(!Number(updated?.meta?.changes))return response({error:'Allocation changed concurrently or is below paid, complimentary and actively held tickets. Refresh and try again.'},409);
      return response({ok:true,product_id:productId,previous_allocation:previous,new_allocation:allocation,readiness:await specialEventReadiness(env.BOOKINGS_DB,eventId)});
    }
    if(action==='UPDATE_PROMO_VIDEO'){
      const title=tidy(body.title,240)||null,caption=tidy(body.caption,1000)||null,enabled=body.display_enabled?1:0;
      const active=await env.BOOKINGS_DB.prepare(`SELECT id FROM special_event_media WHERE event_id=? AND media_type='PROMO_VIDEO' AND active=1`).bind(eventId).first();
      if(enabled&&!active)return response({error:'Upload an MP4 promotional video before enabling public display.'},409);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_events SET promo_video_title=?,promo_video_caption=?,promo_video_display_enabled=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).bind(title,caption,enabled,eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'PROMO_VIDEO_SETTINGS_UPDATED','SPECIAL_EVENT',?,?,?,?)`).bind(crypto.randomUUID(),eventId,eventId,admin.email,enabled?'Promotional video display enabled.':'Promotional video display disabled.',crypto.randomUUID())
      ]);
      return response({ok:true});
    }
    if(action==='UPDATE_INSTRUCTOR'){
      const website=tidy(body.website_url||body.website,500)||null;
      if(website){try{const parsed=new URL(website);if(parsed.protocol!=='https:')throw new Error();}catch(_){return response({error:'Use a valid HTTPS instructor website URL.'},400);}}
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_events SET instructor_name=?,instructor_intro=?,instructor_biography=?,instructor_website_url=?,instructor_photo_caption=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).bind(tidy(body.name,200)||null,tidy(body.intro,1000)||null,tidy(body.biography,6000)||null,website,tidy(body.photo_caption,500)||null,eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'INSTRUCTOR_PRESENTATION_UPDATED','SPECIAL_EVENT',?,?,?,?)`).bind(crypto.randomUUID(),eventId,eventId,admin.email,'Instructor presentation updated in HQ.',crypto.randomUUID())
      ]);
      return response({ok:true});
    }
    if(action==='UPSERT_CHOREOGRAPHY'){
      const id=tidy(body.id,160)||crypto.randomUUID(),title=tidy(body.title,240),order=Number(body.display_order),copperknobUrl=tidy(body.copperknob_url,500)||null,bootstepperUrl=tidy(body.bootstepper_url,500)||null,infoUrl=copperknobUrl||bootstepperUrl;
      if(!title||!Number.isInteger(order)||order<0)return response({error:'Enter a choreography title and display order.'},400);
      for(const candidate of [copperknobUrl,bootstepperUrl]){if(candidate){try{const parsed=new URL(candidate);if(parsed.protocol!=='https:')throw new Error();}catch(_){return response({error:'Use valid HTTPS choreography links.'},400);}}}
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_choreographies(id,event_id,title,info_url,copperknob_url,bootstepper_url,display_order) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,info_url=excluded.info_url,copperknob_url=excluded.copperknob_url,bootstepper_url=excluded.bootstepper_url,display_order=excluded.display_order,updated_at=CURRENT_TIMESTAMP`).bind(id,eventId,title,infoUrl,copperknobUrl,bootstepperUrl,order),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'CHOREOGRAPHY_SAVED','CHOREOGRAPHY',?,?,?,?)`).bind(crypto.randomUUID(),eventId,id,admin.email,'Verified instructor choreography saved.',crypto.randomUUID())
      ]);
      return response({ok:true,id});
    }
    if(action==='DELETE_CHOREOGRAPHY'){
      const id=tidy(body.id,160);if(!id)return response({error:'Choose a choreography.'},400);
      const existing=await env.BOOKINGS_DB.prepare(`SELECT id FROM special_event_choreographies WHERE id=? AND event_id=?`).bind(id,eventId).first();if(!existing)return response({error:'Choreography not found.'},404);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`DELETE FROM special_event_choreographies WHERE id=? AND event_id=?`).bind(id,eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'CHOREOGRAPHY_REMOVED','CHOREOGRAPHY',?,?,?,?)`).bind(crypto.randomUUID(),eventId,id,admin.email,'Choreography removed from event presentation.',crypto.randomUUID())
      ]);return response({ok:true});
    }
    if(action==='REMOVE_EVENT_MEDIA'){
      const kind=tidy(body.media_type,30);if(!['PROMO_VIDEO','VIDEO_POSTER','INSTRUCTOR_PHOTO'].includes(kind))return response({error:'Choose valid event media.'},400);
      const column=kind==='PROMO_VIDEO'?'promo_video_url':kind==='VIDEO_POSTER'?'promo_video_poster_url':'instructor_photo_url';
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_media SET active=0 WHERE event_id=? AND media_type=? AND active=1`).bind(eventId,kind),
        env.BOOKINGS_DB.prepare(`UPDATE special_events SET ${column}=NULL,promo_video_display_enabled=CASE WHEN ?='PROMO_VIDEO' THEN 0 ELSE promo_video_display_enabled END,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).bind(kind,eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'EVENT_MEDIA_REMOVED','EVENT_MEDIA',?,?,?,?)`).bind(crypto.randomUUID(),eventId,kind,admin.email,'Media removed from the event presentation; stored versions retained.',crypto.randomUUID())
      ]);return response({ok:true});
    }
    if(action==='UPSERT_PROGRAMME_ITEM'){
      const id=tidy(body.id,160)||crypto.randomUUID(),dayId=tidy(body.day_id,160),type=tidy(body.item_type,30),title=tidy(body.title,240),order=Number(body.display_order);
      if(!dayId||!title||!['WORKSHOP','SOCIAL','COMPETITION','PERFORMANCE','BREAK','OTHER'].includes(type)||!Number.isInteger(order))return response({error:'Complete the programme item details.'},400);
      const programmeStatus=tidy(body.programme_status,20)||'PROVISIONAL',startsAt=tidy(body.starts_at,40)||null,endsAt=tidy(body.ends_at,40)||null,timingConfirmed=startsAt?1:0;
      if(!['PROVISIONAL','CONFIRMED','CANCELLED'].includes(programmeStatus))return response({error:'Choose a valid programme status.'},400);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_programme_items(id,event_id,day_id,item_type,title,description,starts_at,ends_at,timing_confirmed,programme_status,display_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET day_id=excluded.day_id,item_type=excluded.item_type,title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,timing_confirmed=excluded.timing_confirmed,programme_status=excluded.programme_status,display_order=excluded.display_order`).bind(id,eventId,dayId,type,title,tidy(body.description,4000)||null,startsAt,endsAt,timingConfirmed,programmeStatus,order),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'PROGRAMME_ITEM_SAVED','PROGRAMME_ITEM',?,?,?,?)`).bind(crypto.randomUUID(),eventId,id,admin.email,timingConfirmed?'Scheduled programme time saved.':'Programme item saved with timing unconfirmed.',crypto.randomUUID())
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
      const attendance=await env.BOOKINGS_DB.prepare(`SELECT x.attendee_id,x.attended_at FROM special_event_attendance x JOIN special_event_attendees a ON a.id=x.attendee_id JOIN special_event_bookings b ON b.id=a.booking_id WHERE x.attendee_id=? AND x.day_id=? AND b.event_id=? AND a.status='ACTIVE' AND b.status='PAID'`).bind(attendeeId,dayId,eventId).first();
      if(!attendance)return response({error:'Event attendee or day not found.'},404);
      if(attended&&attendance.attended_at)return response({error:'This attendee is already checked in for this event day.'},409);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_attendance SET attended_at=${attended?'CURRENT_TIMESTAMP':'NULL'},checked_in_by=? WHERE attendee_id=? AND day_id=?`).bind(attended?admin.email:null,attendeeId,dayId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,?,'ATTENDEE',?,?,?,?)`).bind(crypto.randomUUID(),eventId,attended?'ATTENDEE_CHECKED_IN':'ATTENDEE_CHECK_IN_REVERSED',attendeeId,admin.email,`Attendance ${attended?'recorded':'reversed'} for ${dayId}.`,crypto.randomUUID())
      ]);
      return response({ok:true});
    }
    if(action==='ISSUE_COMPLIMENTARY_TICKETS'){
      const productId=tidy(body.product_id,160),recipientName=tidy(body.recipient_name,120),recipientEmail=tidy(body.recipient_email,160).toLowerCase(),reason=tidy(body.reason,1000)||null,quantity=Number(body.quantity),attendeeInput=Array.isArray(body.attendees)?body.attendees.slice(0,20):[];
      if(!productId||!recipientName||!specialEmailOk(recipientEmail)||!Number.isInteger(quantity)||quantity<1||attendeeInput.length!==quantity)return response({error:'Enter the recipient and every named attendee.'},400);
      const product=await env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_ticket_products WHERE id=? AND event_id=? AND product_type='ADMISSION'`).bind(productId,eventId).first();
      if(!product)return response({error:'Choose an admission ticket product.'},400);
      if(product.allocation==null)return response({error:'Configure this product allocation before issuing complimentary tickets.'},409);
      if(quantity>Number(product.max_per_checkout||20))return response({error:`Issue no more than ${Number(product.max_per_checkout||20)} tickets at once.`},400);
      const invalidAdult=!Number(product.is_junior)&&attendeeInput.some(item=>!tidy(item?.name,120)||!Number.isInteger(Number(item?.age))||Number(item.age)<18||Number(item.age)>120);
      const invalidJunior=Number(product.is_junior)&&attendeeInput.some(item=>!tidy(item?.name,120)||!Number.isInteger(Number(item?.age))||Number(item.age)<0||Number(item.age)>17||!tidy(item?.guardian_name,120)||!specialEmailOk(tidy(item?.guardian_email,160))||!tidy(item?.guardian_phone,40));
      if(invalidAdult||invalidJunior)return response({error:Number(product.is_junior)?'Junior complimentary tickets require an under-18 attendee and responsible-adult details.':'Adult complimentary tickets require named attendees aged 18 or over.'},400);
      const duplicate=await env.BOOKINGS_DB.prepare(`SELECT id,reference FROM special_event_bookings WHERE event_id=? AND product_id=? AND lower(customer_email)=? AND payment_provider='COMPLIMENTARY' AND status='PAID' LIMIT 1`).bind(eventId,productId,recipientEmail).first();
      if(duplicate)return response({error:'This recipient already has an active complimentary admission for this ticket product.',existing_reference:duplicate.reference},409);
      const competitionIndexes=[...new Set((Array.isArray(body.competition_attendee_indexes)?body.competition_attendee_indexes:[]).map(Number))].filter(index=>Number.isInteger(index)&&index>=0&&index<quantity);
      if(competitionIndexes.length&&!Number(product.competition_eligible))return response({error:'This admission product does not qualify for the mini competition.'},409);
      let customer=await env.BOOKINGS_DB.prepare(`SELECT id FROM customers WHERE lower(email)=? LIMIT 1`).bind(recipientEmail).first();
      if(!customer){const customerId=crypto.randomUUID();await env.BOOKINGS_DB.prepare(`INSERT INTO customers(id,name,email) VALUES(?,?,?)`).bind(customerId,recipientName,recipientEmail).run();customer={id:customerId};}
      const bookingId=crypto.randomUUID(),reference=`BSE-COMP-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`,secureToken=specialRandomHex(32),customerToken=specialRandomHex(32);
      const bookingInsert=env.BOOKINGS_DB.prepare(`INSERT INTO special_event_bookings(id,reference,event_id,product_id,customer_id,customer_name,customer_email,quantity,product_code_snapshot,product_name_snapshot,unit_price_pence_snapshot,amount_pence,competition_quantity,status,payment_provider,secure_token,customer_token,terms_accepted_at,paid_at,issued_by,internal_reason)
        SELECT ?,?,e.id,p.id,?,?,?,?,p.code,p.name,0,0,?,'PAID','COMPLIMENTARY',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?
        FROM special_events e JOIN special_event_ticket_products p ON p.event_id=e.id WHERE e.id=? AND p.id=? AND p.product_type='ADMISSION' AND p.allocation IS NOT NULL
          AND ?<=p.allocation-COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b WHERE b.product_id=p.id AND b.status='PAID'),0)
          AND NOT EXISTS(SELECT 1 FROM special_event_product_days pd JOIN special_event_days d ON d.id=pd.day_id WHERE pd.product_id=p.id AND d.capacity IS NOT NULL AND (?*pd.places_per_ticket)>d.capacity-COALESCE((SELECT SUM(bd.places) FROM special_event_booking_days bd JOIN special_event_bookings b ON b.id=bd.booking_id WHERE bd.day_id=d.id AND b.status='PAID'),0))
          AND (?=0 OR ?<=(SELECT allocation FROM special_event_ticket_products WHERE event_id=e.id AND code='MINI_COMPETITION')-COALESCE((SELECT COUNT(*) FROM special_event_competition_entries ce WHERE ce.event_id=e.id AND ce.status<>'WITHDRAWN'),0))
          AND (p.includes_saturday_evening=0 OR e.saturday_evening_capacity IS NULL OR ?<=e.saturday_evening_capacity-COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b JOIN special_event_ticket_products bp ON bp.id=b.product_id WHERE b.event_id=e.id AND b.status='PAID' AND bp.includes_saturday_evening=1),0))`).bind(bookingId,reference,customer.id,recipientName,recipientEmail,quantity,competitionIndexes.length,secureToken,customerToken,admin.email,reason,eventId,productId,quantity,quantity,competitionIndexes.length,competitionIndexes.length,quantity);
      const statements=[bookingInsert,
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_booking_days(booking_id,day_id,places) SELECT ?,pd.day_id,?*pd.places_per_ticket FROM special_event_product_days pd WHERE pd.product_id=? AND EXISTS(SELECT 1 FROM special_event_bookings WHERE id=?)`).bind(bookingId,quantity,productId,bookingId)];
      attendeeInput.forEach((item,index)=>{const attendeeId=`${bookingId}:attendee:${index+1}`;statements.push(env.BOOKINGS_DB.prepare(`INSERT INTO special_event_attendees(id,booking_id,customer_id,name,email,age_at_event,guardian_name,guardian_email,guardian_phone,ticket_number,qr_token) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM special_event_bookings WHERE id=?)`).bind(attendeeId,bookingId,customer.id,tidy(item.name,120),recipientEmail,Number(item.age),tidy(item.guardian_name,120)||null,tidy(item.guardian_email,160).toLowerCase()||null,tidy(item.guardian_phone,40)||null,`${reference}-${String(index+1).padStart(2,'0')}`,specialRandomHex(32),bookingId),env.BOOKINGS_DB.prepare(`INSERT INTO special_event_attendance(attendee_id,day_id) SELECT ?,day_id FROM special_event_booking_days WHERE booking_id=?`).bind(attendeeId,bookingId));});
      competitionIndexes.forEach((attendeeIndex,index)=>{const attendee=attendeeInput[attendeeIndex],junior=Number(attendee.age)<18,contactEmail=junior?tidy(attendee.guardian_email,160).toLowerCase():recipientEmail,contactPhone=junior?tidy(attendee.guardian_phone,40):'';statements.push(env.BOOKINGS_DB.prepare(`INSERT INTO special_event_competition_entries(id,event_id,booking_id,admission_booking_id,customer_id,attendee_id,contact_email,contact_phone,contact_is_guardian,entry_number) SELECT ?,?,?,?,?,?,?,?,?,COALESCE(MAX(entry_number),0)+? FROM special_event_competition_entries WHERE event_id=? AND EXISTS(SELECT 1 FROM special_event_attendees WHERE id=?)`).bind(`${bookingId}:competition:${attendeeIndex+1}`,eventId,bookingId,bookingId,customer.id,`${bookingId}:attendee:${attendeeIndex+1}`,contactEmail,contactPhone||null,junior?1:0,index+1,eventId,`${bookingId}:attendee:${attendeeIndex+1}`));});
      statements.push(env.BOOKINGS_DB.prepare(`INSERT INTO special_event_confirmation_outbox(id,booking_id,status,idempotency_key,recipient_email,subject) SELECT ?,?,'DISABLED',?,?,? WHERE EXISTS(SELECT 1 FROM special_event_bookings WHERE id=?)`).bind(crypto.randomUUID(),bookingId,`special-event-complimentary:${bookingId}`,recipientEmail,SPECIAL_EVENT_CONFIRMATION_SUBJECT,bookingId),env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) SELECT ?,?,'COMPLIMENTARY_TICKETS_ISSUED','BOOKING',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM special_event_bookings WHERE id=?)`).bind(crypto.randomUUID(),eventId,bookingId,admin.email,reason||'Owner-issued complimentary admission.',JSON.stringify({product_code:product.code,quantity,competition_entries:competitionIndexes.length}),`complimentary-issued:${bookingId}`,bookingId));
      const result=await env.BOOKINGS_DB.batch(statements);if(!Number(result[0]?.meta?.changes||0))return response({error:'Complimentary tickets could not be issued because allocation or shared capacity is unavailable.'},409);
      return response({ok:true,booking_id:bookingId,reference,payment_provider:'COMPLIMENTARY',amount_pence:0,email_status:'DISABLED'},201);
    }
    if(action==='CANCEL_COMPLIMENTARY_TICKETS'){
      const bookingId=tidy(body.booking_id,180),reason=tidy(body.reason,1000);if(!bookingId||!reason)return response({error:'Choose a complimentary booking and enter an audit reason.'},400);
      const booking=await env.BOOKINGS_DB.prepare(`SELECT id,status FROM special_event_bookings WHERE id=? AND event_id=? AND payment_provider='COMPLIMENTARY'`).bind(bookingId,eventId).first();if(!booking)return response({error:'Complimentary booking not found.'},404);if(booking.status==='CANCELLED')return response({ok:true,idempotent:true});if(booking.status!=='PAID')return response({error:'Only an active complimentary booking can be cancelled.'},409);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_bookings SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP,cancelled_by=?,cancellation_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PAID' AND payment_provider='COMPLIMENTARY'`).bind(admin.email,reason,bookingId),
        env.BOOKINGS_DB.prepare(`UPDATE special_event_attendees SET status='CANCELLED' WHERE booking_id=?`).bind(bookingId),
        env.BOOKINGS_DB.prepare(`UPDATE special_event_attendance SET attended_at=NULL,checked_in_by=NULL WHERE attendee_id IN (SELECT id FROM special_event_attendees WHERE booking_id=?)`).bind(bookingId),
        env.BOOKINGS_DB.prepare(`UPDATE special_event_competition_entries SET status='WITHDRAWN',result_notes=COALESCE(result_notes||' · ','')||'Complimentary admission cancelled.' WHERE booking_id=?`).bind(bookingId),
        env.BOOKINGS_DB.prepare(`UPDATE special_event_confirmation_outbox SET status='DISABLED' WHERE booking_id=?`).bind(bookingId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'COMPLIMENTARY_TICKETS_CANCELLED','BOOKING',?,?,?,?)`).bind(crypto.randomUUID(),eventId,bookingId,admin.email,reason,`complimentary-cancelled:${bookingId}`)
      ]);
      return response({ok:true,status:'CANCELLED',capacity_released:true,qr_invalidated:true});
    }
    if(action==='SET_PUBLICATION'){
      const readiness=await specialEventReadiness(env.BOOKINGS_DB,eventId);
      if(!readiness?.ready)return response({error:'Publication is blocked until all mandatory settings are confirmed.',blockers:readiness?.blockers||[]},409);
      return response({error:'Publication requires a separate owner-approved release operation.',code:'OWNER_RELEASE_APPROVAL_REQUIRED'},409);
    }
    if(action==='OPEN_SALES'){
      const readiness=await specialEventReadiness(env.BOOKINGS_DB,eventId);
      if(!readiness?.ready)return response({error:'Event and ticket sales cannot open until every mandatory readiness item is complete.',blockers:readiness?.blockers||[]},409);
      if(readiness.event.status!=='DRAFT'||Number(readiness.event.publication_enabled)||Number(readiness.event.checkout_enabled))return response({error:'Only a fully prepared Draft event can be opened.',code:'EVENT_NOT_DRAFT'},409);
      if(tidy(body.confirmation,240)!==readiness.event.title)return response({error:'Type the exact event title to confirm publication.'},400);
      const configured=readiness.products.filter(product=>product.allocation!=null);
      if(!configured.length)return response({error:'At least one approved ticket allocation must be configured before opening sales.'},409);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_event_ticket_products SET release_state=CASE WHEN allocation IS NOT NULL THEN 'ACTIVE' ELSE 'INACTIVE' END,auto_activate_after_product_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE event_id=?`).bind(eventId),
        env.BOOKINGS_DB.prepare(`UPDATE special_events SET status='PUBLISHED',publication_enabled=1,checkout_enabled=1,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND status='DRAFT' AND publication_enabled=0 AND checkout_enabled=0`).bind(eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'EVENT_AND_SALES_OPENED','SPECIAL_EVENT',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,eventId,admin.email,'Owner explicitly opened the event and all configured ticket products together.',JSON.stringify({active_releases:configured.map(product=>({code:product.code,price_pence:product.price_pence,allocation:product.allocation,password_required:Boolean(product.password_required)}))}),crypto.randomUUID())
      ]);
      const opened=await env.BOOKINGS_DB.prepare(`SELECT status,publication_enabled,checkout_enabled FROM special_events WHERE id=?`).bind(eventId).first();
      if(opened?.status!=='PUBLISHED'||!Number(opened.publication_enabled)||!Number(opened.checkout_enabled))return response({error:'The event was not opened. No partial publication was retained.'},409);
      return response({ok:true,status:'PUBLISHED',active_releases:configured.map(product=>product.code)});
    }
    if(action==='CLOSE_SALES'){
      if(tidy(body.confirmation,20)!=='CLOSE SALES')return response({error:'Type CLOSE SALES to confirm.'},400);
      const current=await env.BOOKINGS_DB.prepare(`SELECT status,checkout_enabled FROM special_events WHERE id=?`).bind(eventId).first();
      if(current?.status!=='PUBLISHED'||!Number(current.checkout_enabled))return response({error:'Ticket sales are not currently open.'},409);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE special_events SET checkout_enabled=0,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND status='PUBLISHED'`).bind(eventId),
        env.BOOKINGS_DB.prepare(`UPDATE special_event_ticket_products SET release_state='CLOSED',updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND release_state='ACTIVE'`).bind(eventId),
        env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'TICKET_SALES_CLOSED','SPECIAL_EVENT',?,?,?,?)`).bind(crypto.randomUUID(),eventId,eventId,admin.email,'Owner explicitly closed new ticket sales.',crypto.randomUUID())
      ]);
      return response({ok:true,status:'PUBLISHED',checkout_enabled:false});
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
  // Products launch together. This maintenance only marks exhausted releases;
  // it never activates another release or creates a staggered presale.
  await db.prepare(`UPDATE special_event_ticket_products AS early SET release_state='SOLD_OUT',updated_at=CURRENT_TIMESTAMP
    WHERE early.event_id=? AND early.code='EARLY_BIRD_WEEKEND' AND early.release_state='ACTIVE' AND early.allocation IS NOT NULL
      AND early.allocation<=
        COALESCE((SELECT SUM(quantity) FROM special_event_bookings WHERE product_id=early.id AND status='PAID'),0)`).bind(eventId).run();
}

export async function createSpecialEventReservation(request,env,services,options={}){
  const ownerPaymentTest=options.ownerPaymentTest===true;
  if(!ownerPaymentTest&&String(env.SPECIAL_EVENT_CHECKOUT_DISABLED||'').toLowerCase()==='true')return response({error:'Special Event checkout is disabled in this environment.'},503);
  if(!env.BOOKINGS_DB)return response({error:'Event booking is unavailable.'},503);
  const body=await request.json().catch(()=>null);if(!body)return response({error:'The booking request could not be read.'},400);
  const slug=tidy(body.slug,120),code=tidy(body.product_code,80),name=tidy(body.name,120),email=tidy(body.email,160).toLowerCase(),phone=tidy(body.phone,40),quantity=Number(body.quantity);
  if(!slug||!code||!name||!specialEmailOk(email)||!Number.isInteger(quantity)||quantity<1)return response({error:'Choose a valid event ticket and enter your contact details.'},400);
  if(!body.terms_accepted)return response({error:'Please accept the event booking terms.'},400);
  const event=ownerPaymentTest
    ?await env.BOOKINGS_DB.prepare(`SELECT * FROM special_events WHERE id='special-event-johnny-rossato-2027' AND slug=? AND status='DRAFT' AND publication_enabled=0 AND checkout_enabled=0`).bind(slug).first()
    :await env.BOOKINGS_DB.prepare(`SELECT * FROM special_events WHERE slug=? AND status='PUBLISHED' AND publication_enabled=1 AND checkout_enabled=1`).bind(slug).first();
  if(!event)return response({error:'Ticket sales for this event are not open.'},404);
  const readiness=await specialEventReadiness(env.BOOKINGS_DB,event.id),allowedTestBlockers=new Set(['REFUND_POLICY_UNCONFIRMED','PUBLIC_PRESENTATION_UNAPPROVED','PAYMENT_INTEGRATION_UNVERIFIED','PRODUCTION_INSTALLATION_UNVERIFIED']);
  if(!readiness||(!ownerPaymentTest&&!readiness.ready)||(ownerPaymentTest&&readiness.blockers.some(blocker=>!allowedTestBlockers.has(blocker))))return response({error:'Ticket sales remain blocked while event safety settings are incomplete.'},409);
  if(!ownerPaymentTest)await refreshAutomaticReleases(env.BOOKINGS_DB,event.id);
  const product=ownerPaymentTest
    ?await env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_ticket_products WHERE event_id=? AND code='SATURDAY_SOCIAL' AND name='Saturday Social & Spectator' AND price_pence=1500`).bind(event.id).first()
    :await env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_ticket_products WHERE event_id=? AND code=? AND release_state='ACTIVE'`).bind(event.id,code).first();
  if(!product)return response({error:'This ticket is not currently available.'},409);
  const maximum=Math.min(Number(event.max_admission_per_checkout||4),Number(product.max_per_checkout||event.max_admission_per_checkout||4));
  if(quantity>maximum)return response({error:`Choose no more than ${maximum} ticket${maximum===1?'':'s'} per checkout.`},400);
  if(Number(product.password_required)&&!await verifySpecialEventPassword(env.BOOKINGS_DB,product.id,body.access_password))return response({error:'The loyalty access password was not recognised.'},403);
  const attendeeInput=Array.isArray(body.attendees)?body.attendees.slice(0,20):[];
  if(product.product_type==='ADMISSION'&&attendeeInput.length!==quantity)return response({error:'Enter the name and age of every attendee.'},400);
  if(Number(product.is_junior)){
    const invalid=attendeeInput.some(item=>!tidy(item?.name,120)||!Number.isInteger(Number(item?.age))||Number(item.age)<0||Number(item.age)>17||!tidy(item?.guardian_name,120)||!specialEmailOk(tidy(item?.guardian_email,160))||!tidy(item?.guardian_phone,40));
    if(invalid)return response({error:'Every junior ticket requires the attendee’s name and age plus a responsible adult’s name, email and phone number.'},400);
  }else if(product.product_type==='ADMISSION'&&attendeeInput.some(item=>!tidy(item?.name,120)||!Number.isInteger(Number(item?.age))||Number(item.age)<18||Number(item.age)>120)){
    return response({error:'Adult tickets are for named attendees aged 18 or over.'},400);
  }
  if(attendeeInput.some(item=>item?.competition_entry)&&!Number(product.competition_eligible))return response({error:'This ticket does not qualify for the mini competition.'},409);
  let qualifyingBookingId=null,qualifyingAttendeeId=null;
  if(Number(product.requires_qualifying_admission)){
    const reference=tidy(body.qualifying_booking_reference,120),attendeeName=tidy(body.qualifying_attendee_name,120);
    const qualifying=await env.BOOKINGS_DB.prepare(`SELECT b.id,a.id attendee_id FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id JOIN special_event_attendees a ON a.booking_id=b.id
      WHERE b.event_id=? AND b.reference=? AND lower(b.customer_email)=? AND b.status='PAID' AND p.competition_eligible=1 AND lower(a.name)=lower(?) AND a.status='ACTIVE'
        AND NOT EXISTS(SELECT 1 FROM special_event_competition_entries ce WHERE ce.event_id=b.event_id AND ce.attendee_id=a.id AND ce.status<>'WITHDRAWN') LIMIT 1`).bind(event.id,reference,email,attendeeName).first();
    if(!qualifying)return response({error:'A named attendee on an eligible paid Saturday booking is required, and that attendee must not already be entered.'},409);
    qualifyingBookingId=qualifying.id;qualifyingAttendeeId=qualifying.attendee_id;
  }
  let customer;
  try{customer=await services.resolveCustomerIdentity(env,{email,name,phone,marketingConsent:false,source:'BOOKING'});}catch(_){return response({error:'This customer identity could not be verified safely.'},409);}
  const holdId=crypto.randomUUID(),bookingId=crypto.randomUUID(),idempotencyKey=tidy(body.idempotency_key,160)||crypto.randomUUID(),expiresAt=new Date(Date.now()+15*60*1000).toISOString();
  const competitionQuantity=attendeeInput.filter(item=>item?.competition_entry).length;
  const competitionInventoryQuantity=product.code==='MINI_COMPETITION'?quantity:competitionQuantity;
  if(competitionInventoryQuantity){
    const competitionProduct=await env.BOOKINGS_DB.prepare(`SELECT release_state FROM special_event_ticket_products WHERE event_id=? AND code='MINI_COMPETITION'`).bind(event.id).first();
    if(competitionProduct?.release_state!=='ACTIVE')return response({error:'Mini Competition entry is temporarily unavailable. Your event ticket can still be booked without it.'},409);
  }
  const amount=Number(product.price_pence)*quantity+(competitionQuantity*500),reference=`BSE-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
  const secureToken=crypto.randomUUID()+crypto.randomUUID().replaceAll('-',''),customerToken=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');
  const eventAvailability=ownerPaymentTest?"e.id=? AND e.status='DRAFT' AND e.publication_enabled=0 AND e.checkout_enabled=0":"e.id=? AND e.status='PUBLISHED' AND e.checkout_enabled=1";
  const productAvailability=ownerPaymentTest?'p.id=?':"p.id=? AND p.release_state='ACTIVE'";
  const holdInsert=env.BOOKINGS_DB.prepare(`INSERT INTO special_event_holds(id,event_id,product_id,customer_id,customer_email,quantity,amount_pence,competition_quantity,status,expires_at,idempotency_key)
    SELECT ?,e.id,p.id,?,?,?,?,?,'ACTIVE',?,?
    FROM special_events e JOIN special_event_ticket_products p ON p.event_id=e.id
    WHERE ${eventAvailability} AND ${productAvailability}
      AND (p.allocation IS NULL OR ?<=p.allocation
        -COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b WHERE b.product_id=p.id AND b.status='PAID'),0)
        -COALESCE((SELECT SUM(h.quantity) FROM special_event_holds h WHERE h.product_id=p.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0))
      AND NOT EXISTS(SELECT 1 FROM special_event_product_days pd JOIN special_event_days d ON d.id=pd.day_id
        WHERE pd.product_id=p.id AND d.capacity IS NOT NULL AND (?*pd.places_per_ticket)>d.capacity
          -COALESCE((SELECT SUM(bd.places) FROM special_event_booking_days bd JOIN special_event_bookings b ON b.id=bd.booking_id WHERE bd.day_id=d.id AND b.status='PAID'),0)
          -COALESCE((SELECT SUM(hd.places) FROM special_event_hold_days hd JOIN special_event_holds h ON h.id=hd.hold_id WHERE hd.day_id=d.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0))
      AND (?=0 OR ?<=(SELECT allocation FROM special_event_ticket_products WHERE event_id=e.id AND code='MINI_COMPETITION')
        -COALESCE((SELECT COUNT(*) FROM special_event_competition_entries ce JOIN special_event_bookings b ON b.id=ce.booking_id WHERE ce.event_id=e.id AND ce.status<>'WITHDRAWN' AND b.status='PAID'),0)
        -COALESCE((SELECT SUM(CASE WHEN hp.code='MINI_COMPETITION' THEN h.quantity ELSE h.competition_quantity END) FROM special_event_holds h JOIN special_event_ticket_products hp ON hp.id=h.product_id WHERE h.event_id=e.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0))
      AND (p.includes_saturday_evening=0 OR e.saturday_evening_capacity IS NULL OR ?<=e.saturday_evening_capacity
        -COALESCE((SELECT SUM(b.quantity) FROM special_event_bookings b JOIN special_event_ticket_products bp ON bp.id=b.product_id WHERE b.event_id=e.id AND b.status='PAID' AND bp.includes_saturday_evening=1),0)
        -COALESCE((SELECT SUM(h.quantity) FROM special_event_holds h JOIN special_event_ticket_products hp ON hp.id=h.product_id WHERE h.event_id=e.id AND h.status='ACTIVE' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND hp.includes_saturday_evening=1),0))`)
    .bind(holdId,customer.id,email,quantity,amount,competitionQuantity,expiresAt,idempotencyKey,event.id,product.id,quantity,quantity,competitionInventoryQuantity,competitionInventoryQuantity,quantity);
  const holdDays=env.BOOKINGS_DB.prepare(`INSERT INTO special_event_hold_days(hold_id,day_id,places)
    SELECT h.id,pd.day_id,?*pd.places_per_ticket FROM special_event_holds h JOIN special_event_product_days pd ON pd.product_id=h.product_id
    WHERE h.id=? AND pd.product_id=?`).bind(quantity,holdId,product.id);
  const results=await env.BOOKINGS_DB.batch([holdInsert,holdDays]);
  if(!Number(results[0]?.meta?.changes||0))return response({error:'Those tickets have just sold out or there is not enough day capacity.'},409);
  try{
    const attendeeDrafts=attendeeInput.map((item,index)=>env.BOOKINGS_DB.prepare(`INSERT INTO special_event_booking_attendee_drafts(id,booking_id,attendee_index,name,age_at_event,guardian_name,guardian_email,guardian_phone,competition_requested) VALUES(?,?,?,?,?,?,?,?,?)`).bind(`${bookingId}:draft:${index+1}`,bookingId,index+1,tidy(item.name,120),item.age==null?null:Number(item.age),tidy(item.guardian_name,120)||null,tidy(item.guardian_email,160).toLowerCase()||null,tidy(item.guardian_phone,40)||null,item.competition_entry?1:0));
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`INSERT INTO special_event_bookings(id,reference,event_id,product_id,hold_id,qualifying_booking_id,qualifying_attendee_id,customer_id,customer_name,customer_email,customer_phone,quantity,product_code_snapshot,product_name_snapshot,unit_price_pence_snapshot,amount_pence,competition_quantity,status,payment_provider,secure_token,customer_token,terms_accepted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING','SUMUP',?,?,CURRENT_TIMESTAMP)`).bind(bookingId,reference,event.id,product.id,holdId,qualifyingBookingId,qualifyingAttendeeId,customer.id,name,email,phone||null,quantity,product.code,product.name,product.price_pence,amount,competitionQuantity,secureToken,customerToken),
      env.BOOKINGS_DB.prepare(`INSERT INTO special_event_booking_days(booking_id,day_id,places) SELECT ?,day_id,places FROM special_event_hold_days WHERE hold_id=?`).bind(bookingId,holdId),
      ...attendeeDrafts,
      env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,?,'BOOKING',?,?,?,?,?)`).bind(crypto.randomUUID(),event.id,ownerPaymentTest?'OWNER_PAYMENT_TEST_CREATED':'BOOKING_CREATED',bookingId,ownerPaymentTest?tidy(options.actor,200)||email:email,ownerPaymentTest?'Owner-authorised £15 Draft payment test; event remained private.':'Pending SumUp checkout created.',ownerPaymentTest?JSON.stringify({owner_payment_test:true,public_event_state_unchanged:true,product_code:product.code,amount_pence:amount}):null,`booking-created:${bookingId}`)
    ]);
    const origin=new URL(request.url).origin,returnPath=ownerPaymentTest?'/ranch?special-event-payment-test=1':`/johnny-rossato?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(secureToken)}`;
    const checkoutResponse=await services.sumUpFetch(env,'/v0.1/checkouts',{method:'POST',body:JSON.stringify({checkout_reference:reference,amount:Number((amount/100).toFixed(2)),currency:'GBP',merchant_code:String(env.SUMUP_MERCHANT_CODE),description:`${event.title} — ${product.name} × ${quantity}`,redirect_url:`${origin}${returnPath}`,return_url:`${origin}/api/sumup-webhook`,valid_until:expiresAt,hosted_checkout:{enabled:true}})});
    const checkout=await checkoutResponse.json().catch(()=>({})),raw=checkout.hosted_checkout_url||checkout.hosted_checkout?.url||'';let checkoutUrl='';try{const parsed=new URL(raw);if(parsed.protocol==='https:')checkoutUrl=parsed.toString();}catch(_){ }
    if(!checkoutResponse.ok||!checkout.id||!checkoutUrl)throw new Error('SUMUP_CHECKOUT_FAILED');
    await env.BOOKINGS_DB.prepare(`UPDATE special_event_bookings SET provider_checkout_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(checkout.id,bookingId).run();
    return response({ok:true,reference,status:'PENDING',checkout_url:checkoutUrl,owner_payment_test:ownerPaymentTest},201);
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
    const transaction=tidy(checkout?.transactions?.find(item=>item.status==='SUCCESSFUL')?.id||checkout?.transaction_id,180)||null;
    const ownerPaymentTest=await env.BOOKINGS_DB.prepare(`SELECT id FROM special_event_activity WHERE target_type='BOOKING' AND target_id=? AND action='OWNER_PAYMENT_TEST_CREATED' LIMIT 1`).bind(booking.id).first();
    const confirmationStatus=ownerPaymentTest?'READY':(String(env.SPECIAL_EVENT_EMAILS_ENABLED||'').toLowerCase()==='true'?'READY':'DISABLED');
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`UPDATE special_event_bookings SET status='PAID',provider_transaction_id=?,paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('PENDING','FAILED')`).bind(transaction,booking.id),
      env.BOOKINGS_DB.prepare(`UPDATE special_event_holds SET status='CONSUMED' WHERE id=? AND status IN ('ACTIVE','RELEASED')`).bind(booking.hold_id),
      env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_confirmation_outbox(id,booking_id,status,idempotency_key,recipient_email,subject) VALUES(?,?,?, ?,?,?)`).bind(crypto.randomUUID(),booking.id,confirmationStatus,`special-event-paid:${booking.id}`,booking.customer_email,SPECIAL_EVENT_CONFIRMATION_SUBJECT),
      env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key) VALUES(?,?,'PAYMENT_CONFIRMED','BOOKING',?,'SUMUP','Authoritative SumUp payment confirmed.',?)`).bind(crypto.randomUUID(),booking.event_id,booking.id,`special-event-paid:${booking.id}`)
    ]);
    const product=await env.BOOKINGS_DB.prepare(`SELECT product_type,requires_qualifying_admission,competition_eligible FROM special_event_ticket_products WHERE id=?`).bind(booking.product_id).first();
    if(product?.product_type==='ADMISSION'){
      const drafts=await env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_booking_attendee_drafts WHERE booking_id=? ORDER BY attendee_index`).bind(booking.id).all(),draftRows=drafts.results||[];
      const attendeeStatements=[];
      for(let index=1;index<=Number(booking.quantity);index+=1){
        const attendeeId=`${booking.id}:attendee:${index}`;
        const draft=draftRows[index-1];
        attendeeStatements.push(
          env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_attendees(id,booking_id,customer_id,name,email,age_at_event,guardian_name,guardian_email,guardian_phone,ticket_number,qr_token) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(attendeeId,booking.id,booking.customer_id,draft?.name||booking.customer_name,booking.customer_email,draft?.age_at_event??null,draft?.guardian_name||null,draft?.guardian_email||null,draft?.guardian_phone||null,`${booking.reference}-${String(index).padStart(2,'0')}`,specialRandomHex(32)),
          env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_attendance(attendee_id,day_id) SELECT ?,day_id FROM special_event_booking_days WHERE booking_id=? AND places>0`).bind(attendeeId,booking.id)
        );
      }
      if(attendeeStatements.length)await env.BOOKINGS_DB.batch(attendeeStatements);
      const competitionDrafts=draftRows.filter(row=>Number(row.competition_requested));
      if(Number(product.competition_eligible)&&competitionDrafts.length){
        const existing=await env.BOOKINGS_DB.prepare(`SELECT COALESCE(MAX(entry_number),0) maximum FROM special_event_competition_entries WHERE event_id=?`).bind(booking.event_id).first(),base=Number(existing?.maximum||0);
        await env.BOOKINGS_DB.batch(competitionDrafts.map((row,index)=>env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_competition_entries(id,event_id,booking_id,admission_booking_id,customer_id,attendee_id,contact_email,contact_phone,contact_is_guardian,entry_number) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(`${booking.id}:competition:${row.attendee_index}`,booking.event_id,booking.id,booking.id,booking.customer_id,`${booking.id}:attendee:${row.attendee_index}`,Number(row.age_at_event)<18?row.guardian_email:booking.customer_email,Number(row.age_at_event)<18?row.guardian_phone:null,Number(row.age_at_event)<18?1:0,base+index+1)));
      }
    }
    if(Number(product?.requires_qualifying_admission)&&booking.qualifying_booking_id){
      await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_competition_entries(id,event_id,booking_id,admission_booking_id,customer_id,attendee_id,contact_email,contact_phone,contact_is_guardian,entry_number)
        SELECT ?,?,?,?,?,?,CASE WHEN a.age_at_event<18 THEN a.guardian_email ELSE b.customer_email END,CASE WHEN a.age_at_event<18 THEN a.guardian_phone ELSE b.customer_phone END,CASE WHEN a.age_at_event<18 THEN 1 ELSE 0 END,COALESCE(MAX(c.entry_number),0)+1 FROM special_event_attendees a JOIN special_event_bookings b ON b.id=a.booking_id LEFT JOIN special_event_competition_entries c ON c.event_id=b.event_id WHERE a.id=? AND b.event_id=?`).bind(`${booking.id}:competition`,booking.event_id,booking.id,booking.qualifying_booking_id,booking.customer_id,booking.qualifying_attendee_id,booking.qualifying_attendee_id,booking.event_id).run();
    }
    await refreshAutomaticReleases(env.BOOKINGS_DB,booking.event_id);
  }else if(['FAILED','EXPIRED'].includes(status)){
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`UPDATE special_event_bookings SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'`).bind(booking.id),
      env.BOOKINGS_DB.prepare(`UPDATE special_event_holds SET status='RELEASED',expires_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(booking.hold_id)
    ]);
  }
}

export function verifySpecialEventCheckout(booking,checkout,merchantCode){
  if(!booking||!checkout)return {ok:false,code:'CHECKOUT_UNAVAILABLE'};
  const expectedAmount=Number(booking.amount_pence),actualAmount=Math.round(Number(checkout.amount)*100);
  const checks=[
    ['CHECKOUT_ID_MISMATCH',tidy(checkout.id,180)===tidy(booking.provider_checkout_id,180)],
    ['CHECKOUT_REFERENCE_MISMATCH',tidy(checkout.checkout_reference,120)===tidy(booking.reference,120)],
    ['CHECKOUT_AMOUNT_MISMATCH',Number.isFinite(actualAmount)&&actualAmount===expectedAmount],
    ['CHECKOUT_CURRENCY_MISMATCH',tidy(checkout.currency,12).toUpperCase()==='GBP'],
    ['CHECKOUT_MERCHANT_MISMATCH',tidy(checkout.merchant_code,80)===tidy(merchantCode,80)]
  ];
  const failed=checks.find(([,passed])=>!passed);
  return failed?{ok:false,code:failed[0]}:{ok:true,status:tidy(checkout.status,40).toUpperCase()};
}

export async function processSpecialEventConfirmations(env,sendEmail,limit=20,{bookingId=null}={}){
  if(!env.BOOKINGS_DB||typeof sendEmail!=='function')return {processed:0,disabled:true};
  const emailsEnabled=String(env.SPECIAL_EVENT_EMAILS_ENABLED||'').toLowerCase()==='true';
  const rows=await env.BOOKINGS_DB.prepare(`SELECT o.id outbox_id,o.attempt_count,o.first_attempt_at,o.payload_json,b.*,p.description product_description,e.title event_title,e.venue_name,e.venue_address,e.refund_policy FROM special_event_confirmation_outbox o JOIN special_event_bookings b ON b.id=o.booking_id JOIN special_event_ticket_products p ON p.id=b.product_id JOIN special_events e ON e.id=b.event_id WHERE o.review_required=0 AND b.status='PAID' AND (? IS NULL OR b.id=?) AND ((o.status IN ('READY','FAILED') AND (o.next_attempt_at IS NULL OR o.next_attempt_at<=CURRENT_TIMESTAMP)) OR (o.status='SENDING' AND o.lease_until<=CURRENT_TIMESTAMP)) AND (?=1 OR (lower(b.customer_email)='nora@bootscootinlinedancing.co.uk' AND EXISTS(SELECT 1 FROM special_event_activity a WHERE a.target_type='BOOKING' AND a.target_id=b.id AND a.action='OWNER_PAYMENT_TEST_CREATED'))) ORDER BY o.created_at LIMIT ?`).bind(bookingId,bookingId,emailsEnabled?1:0,Math.max(1,Math.min(50,Number(limit)||20))).all();
  let sent=0,failed=0;
  for(const booking of rows.results||[]){
    const claimId=crypto.randomUUID();
    const claim=await env.BOOKINGS_DB.prepare(`UPDATE special_event_confirmation_outbox SET status='SENDING',claim_id=?,lease_until=datetime('now','+5 minutes'),first_attempt_at=COALESCE(first_attempt_at,CURRENT_TIMESTAMP),attempt_count=attempt_count+1,last_error=NULL WHERE id=? AND review_required=0 AND ((status IN ('READY','FAILED') AND (next_attempt_at IS NULL OR next_attempt_at<=CURRENT_TIMESTAMP)) OR (status='SENDING' AND lease_until<=CURRENT_TIMESTAMP)) AND EXISTS(SELECT 1 FROM special_event_bookings b WHERE b.id=booking_id AND b.status='PAID')`).bind(claimId,booking.outbox_id).run();
    if(!Number(claim.meta?.changes||0))continue;
    const current=await env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_confirmation_outbox WHERE id=? AND claim_id=?`).bind(booking.outbox_id,claimId).first();
    if(!current)continue;
    if(Date.now()-Date.parse(current.first_attempt_at.replace(' ','T')+'Z')>=20*3600000){
      await env.BOOKINGS_DB.prepare(`UPDATE special_event_confirmation_outbox SET status='FAILED',review_required=1,lease_until=NULL,last_error='Delivery outcome needs manual review; retry window expired.' WHERE id=? AND claim_id=?`).bind(booking.outbox_id,claimId).run();failed++;continue;
    }
    try{
      let payload=current.payload_json?JSON.parse(current.payload_json):null;
      if(!payload){
        const [days,attendees,competition,programme]=await Promise.all([
          env.BOOKINGS_DB.prepare(`SELECT d.label,d.event_date FROM special_event_booking_days bd JOIN special_event_days d ON d.id=bd.day_id WHERE bd.booking_id=? ORDER BY d.display_order`).bind(booking.id).all(),
          env.BOOKINGS_DB.prepare(`SELECT name,age_at_event,guardian_email FROM special_event_attendees WHERE booking_id=? ORDER BY created_at,id`).bind(booking.id).all(),
          env.BOOKINGS_DB.prepare(`SELECT a.name attendee_name FROM special_event_competition_entries c LEFT JOIN special_event_attendees a ON a.id=c.attendee_id WHERE c.booking_id=? AND c.status<>'WITHDRAWN'`).bind(booking.id).all(),
          env.BOOKINGS_DB.prepare(`SELECT title,starts_at,ends_at,programme_status,display_order FROM special_event_programme_items WHERE event_id=? ORDER BY day_id,display_order`).bind(booking.event_id).all()
        ]);
        const copy=specialEventConfirmationCopy({booking,event:{title:booking.event_title,venue_name:booking.venue_name,venue_address:booking.venue_address,refund_policy:booking.refund_policy},days:days.results||[],attendees:attendees.results||[],competition:competition.results||[],programme:programme.results||[]});
        payload={to:booking.customer_email,from:String(env.EMAIL_FROM_EVENTS||env.EMAIL_FROM_GENERAL||env.EMAIL_FROM||'').trim(),...copy};
        await env.BOOKINGS_DB.prepare(`UPDATE special_event_confirmation_outbox SET payload_json=? WHERE id=? AND claim_id=?`).bind(JSON.stringify(payload),booking.outbox_id,claimId).run();
      }
      const paid=await env.BOOKINGS_DB.prepare(`SELECT status FROM special_event_bookings WHERE id=?`).bind(booking.id).first();
      if(paid?.status!=='PAID')throw new Error('Booking is no longer paid; confirmation withheld.');
      const result=await sendEmail(payload.to,payload.subject,payload.html,payload.text,{idempotencyKey:`special-event-paid:${booking.id}`,from:payload.from||undefined});
      if(result?.skipped||!result?.id)throw new Error('Email provider did not return an acceptance ID.');
      await env.BOOKINGS_DB.prepare(`UPDATE special_event_confirmation_outbox SET status='SENT',recipient_email=?,subject=?,provider_id=?,sent_at=CURRENT_TIMESTAMP,last_error=NULL,lease_until=NULL WHERE id=? AND claim_id=?`).bind(payload.to,payload.subject,result.id,booking.outbox_id,claimId).run();sent++;
    }catch(error){const attempts=Number(current.attempt_count||0),delay=Math.min(3600,Math.pow(2,Math.min(attempts,6))*60);await env.BOOKINGS_DB.prepare(`UPDATE special_event_confirmation_outbox SET status='FAILED',last_error=?,next_attempt_at=datetime('now',?),lease_until=NULL WHERE id=? AND claim_id=?`).bind(tidy(error?.message||error,500),`+${delay} seconds`,booking.outbox_id,claimId).run();failed++;}
  }
  return {processed:sent+failed,sent,failed};
}

async function recoverCorrectedSpecialEventConfirmation(env,sendEmail,admin,{eventId,bookingId,correctedEmail}){
  const normalizedCorrected=tidy(correctedEmail,240).trim().toLowerCase();
  if(!bookingId||!/^\S+@\S+\.\S+$/.test(normalizedCorrected))return {error:'A valid corrected email address is required.',status:400};
  const booking=await env.BOOKINGS_DB.prepare(`SELECT b.*,p.description product_description,o.status confirmation_status,o.provider_id original_provider_id,o.recipient_email original_recipient FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id JOIN special_event_confirmation_outbox o ON o.booking_id=b.id WHERE b.id=? AND b.event_id=?`).bind(bookingId,eventId).first();
  if(!booking)return {error:'Booking not found.',status:404};
  if(booking.status!=='PAID'||booking.payment_provider!=='SUMUP'||booking.confirmation_status!=='SENT'||!booking.original_provider_id)return {error:'Only an authoritatively paid booking with a preserved original confirmation can use this recovery.',status:409};
  const operationKey=`corrected-confirmation:${booking.id}:v1`;
  const existing=await env.BOOKINGS_DB.prepare(`SELECT action,metadata_json,created_at FROM special_event_activity WHERE idempotency_key IN (?,?) ORDER BY created_at DESC LIMIT 1`).bind(`${operationKey}:sent`,`${operationKey}:unconfirmed`).first();
  if(existing){
    const metadata=JSON.parse(existing.metadata_json||'{}');
    if(existing.action==='CORRECTED_CONFIRMATION_SENT')return {ok:true,idempotent:true,reference:booking.reference,provider_id:metadata.provider_id||null,recipient:normalizedCorrected};
    return {error:'A previous corrected send has an unconfirmed provider result. Inspect Resend before retrying.',status:409};
  }
  const originalEmail=tidy(booking.customer_email,240).trim().toLowerCase();
  if(originalEmail===normalizedCorrected)return {error:'The corrected address matches the current booking address.',status:409};
  const [customerCollision,identityCollision]=await Promise.all([
    env.BOOKINGS_DB.prepare(`SELECT id FROM customers WHERE lower(trim(email))=? AND id<>? LIMIT 1`).bind(normalizedCorrected,booking.customer_id||'').first(),
    env.BOOKINGS_DB.prepare(`SELECT customer_id FROM customer_email_identities WHERE normalized_email=? AND customer_id<>? LIMIT 1`).bind(normalizedCorrected,booking.customer_id||'').first()
  ]);
  if(customerCollision||identityCollision)return {error:'The corrected address belongs to another customer identity. No contact records or email were changed.',status:409};
  const claimed=await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'CORRECTED_CONFIRMATION_CLAIMED','BOOKING',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,booking.id,admin.email,'Owner-authorised correction of a bounced booking confirmation.',JSON.stringify({reference:booking.reference,original_provider_id:booking.original_provider_id,original_recipient:booking.original_recipient}),operationKey).run();
  if(!Number(claimed.meta?.changes||0))return {error:'This corrected confirmation recovery has already been claimed. Inspect its audit history before retrying.',status:409};
  await env.BOOKINGS_DB.batch([
    env.BOOKINGS_DB.prepare(`UPDATE customers SET email=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lower(trim(email))=?`).bind(normalizedCorrected,booking.customer_id,originalEmail),
    env.BOOKINGS_DB.prepare(`UPDATE customer_email_identities SET normalized_email=? WHERE customer_id=? AND normalized_email=?`).bind(normalizedCorrected,booking.customer_id,originalEmail),
    env.BOOKINGS_DB.prepare(`UPDATE special_event_bookings SET customer_email=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lower(trim(customer_email))=?`).bind(normalizedCorrected,booking.id,originalEmail),
    env.BOOKINGS_DB.prepare(`UPDATE special_event_attendees SET email=? WHERE booking_id=? AND lower(trim(COALESCE(email,'')))=?`).bind(normalizedCorrected,booking.id,originalEmail),
    env.BOOKINGS_DB.prepare(`UPDATE special_event_competition_entries SET contact_email=? WHERE booking_id=? AND lower(trim(COALESCE(contact_email,'')))=?`).bind(normalizedCorrected,booking.id,originalEmail)
  ]);
  const [event,days,attendees,competition,programme,correctedBooking]=await Promise.all([
    env.BOOKINGS_DB.prepare(`SELECT * FROM special_events WHERE id=?`).bind(eventId).first(),
    env.BOOKINGS_DB.prepare(`SELECT d.label,d.event_date FROM special_event_booking_days bd JOIN special_event_days d ON d.id=bd.day_id WHERE bd.booking_id=? ORDER BY d.display_order`).bind(booking.id).all(),
    env.BOOKINGS_DB.prepare(`SELECT name,age_at_event,guardian_email FROM special_event_attendees WHERE booking_id=? ORDER BY created_at,id`).bind(booking.id).all(),
    env.BOOKINGS_DB.prepare(`SELECT a.name attendee_name FROM special_event_competition_entries c LEFT JOIN special_event_attendees a ON a.id=c.attendee_id WHERE c.booking_id=? AND c.status<>'WITHDRAWN'`).bind(booking.id).all(),
    env.BOOKINGS_DB.prepare(`SELECT title,starts_at,ends_at,programme_status,display_order FROM special_event_programme_items WHERE event_id=? ORDER BY day_id,display_order`).bind(eventId).all(),
    env.BOOKINGS_DB.prepare(`SELECT b.*,p.description product_description FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id WHERE b.id=?`).bind(booking.id).first()
  ]);
  const copy=specialEventConfirmationCopy({booking:correctedBooking,event,days:days.results||[],attendees:attendees.results||[],competition:competition.results||[],programme:programme.results||[]});
  try{
    const provider=await sendEmail(normalizedCorrected,copy.subject,copy.html,copy.text,{idempotencyKey:`${operationKey}:provider`});
    const providerId=tidy(provider?.id,180)||null;
    if(!providerId)throw new Error('The email provider did not return a message ID.');
    await env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'CORRECTED_CONFIRMATION_SENT','BOOKING',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,booking.id,admin.email,'Corrected replacement confirmation accepted by the provider.',JSON.stringify({reference:booking.reference,provider_id:providerId,recipient:normalizedCorrected,original_provider_id:booking.original_provider_id}),`${operationKey}:sent`).run();
    return {ok:true,reference:booking.reference,provider_id:providerId,recipient:normalizedCorrected,original_provider_id:booking.original_provider_id};
  }catch(error){
    await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'CORRECTED_CONFIRMATION_UNCONFIRMED','BOOKING',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,booking.id,admin.email,'Corrected replacement confirmation was not confirmed by the provider; do not retry blindly.',JSON.stringify({reference:booking.reference,error:tidy(error?.message||error,300),recipient:normalizedCorrected}),`${operationKey}:unconfirmed`).run();
    return {error:'The corrected confirmation was not confirmed by the provider. Inspect Resend before retrying.',status:502};
  }
}

export async function sendSpecialEventConfirmationDeliveryTest(request,env,admin,sendEmail){
  const approvedRecipient='nora@bootscootinlinedancing.co.uk';
  if(String(env.SPECIAL_EVENT_CONFIRMATION_TEST_ENABLED||'').toLowerCase()!=='true')return response({error:'Special Event confirmation delivery tests are disabled.',code:'DELIVERY_TEST_DISABLED'},403);
  const configuredRecipient=tidy(env.SPECIAL_EVENT_CONFIRMATION_TEST_RECIPIENT,254).toLowerCase();
  if(configuredRecipient!==approvedRecipient)return response({error:'The approved Special Event test recipient is not configured.',code:'TEST_RECIPIENT_NOT_CONFIGURED'},503);
  if(typeof sendEmail!=='function')return response({error:'Transactional email delivery is unavailable.',code:'EMAIL_PROVIDER_UNAVAILABLE'},503);
  const body=await request.json().catch(()=>({}));
  const confirmation=tidy(body.confirmation,80),initialConfirmation='SEND ONE SPECIAL EVENT TEST',retryConfirmation='RETRY ONE SPECIAL EVENT TEST';
  if(![initialConfirmation,retryConfirmation].includes(confirmation))return response({error:`Type ${initialConfirmation} to confirm.`,code:'CONFIRMATION_REQUIRED'},400);
  const eventId='special-event-johnny-rossato-2027',operationId='johnny-confirmation-delivery-test-v1',claimKey=`special-event-confirmation-test:${operationId}`;
  const [existing,sent,unconfirmed,retryClaim]=await Promise.all([
    env.BOOKINGS_DB.prepare(`SELECT action,created_at FROM special_event_activity WHERE idempotency_key=?`).bind(claimKey).first(),
    env.BOOKINGS_DB.prepare(`SELECT action FROM special_event_activity WHERE idempotency_key=?`).bind(`${claimKey}:sent`).first(),
    env.BOOKINGS_DB.prepare(`SELECT action,created_at FROM special_event_activity WHERE idempotency_key=?`).bind(`${claimKey}:unconfirmed`).first(),
    env.BOOKINGS_DB.prepare(`SELECT action FROM special_event_activity WHERE idempotency_key=?`).bind(`${claimKey}:retry`).first()
  ]);
  if(sent)return response({ok:true,status:'SENT',idempotent:true,recipient:approvedRecipient});
  const retrying=confirmation===retryConfirmation;
  if(existing&&!retrying)return response({error:'The controlled test was already claimed. Inspect its provider status before attempting the single safe retry.',code:'DELIVERY_TEST_ALREADY_USED',retry_available:Boolean(unconfirmed&&!retryClaim)},409);
  if(retrying){
    if(!existing||!unconfirmed||retryClaim)return response({error:'A safe retry is not available for this controlled test.',code:'DELIVERY_TEST_RETRY_NOT_AVAILABLE'},409);
    const claimedAt=Date.parse(existing.created_at);if(!Number.isFinite(claimedAt)||Date.now()-claimedAt>23*60*60*1000)return response({error:'The provider idempotency window has expired. Inspect the provider log; do not resend from HQ.',code:'DELIVERY_TEST_RETRY_WINDOW_EXPIRED'},409);
  }
  const [event,product,days,programme]=await Promise.all([
    env.BOOKINGS_DB.prepare(`SELECT * FROM special_events WHERE id=?`).bind(eventId).first(),
    env.BOOKINGS_DB.prepare(`SELECT name,description,price_pence FROM special_event_ticket_products WHERE event_id=? AND code='LOYALTY_WEEKEND'`).bind(eventId).first(),
    env.BOOKINGS_DB.prepare(`SELECT label,event_date FROM special_event_days WHERE event_id=? ORDER BY display_order`).bind(eventId).all(),
    env.BOOKINGS_DB.prepare(`SELECT title,starts_at,ends_at,programme_status,display_order FROM special_event_programme_items WHERE event_id=? ORDER BY day_id,display_order`).bind(eventId).all()
  ]);
  if(!event||!product)return response({error:'The Johnny Rossato Draft event is unavailable.',code:'EVENT_UNAVAILABLE'},503);
  try{
    await env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,?,'SPECIAL_EVENT',?,?,?,?,?)`).bind(crypto.randomUUID(),eventId,retrying?'CONFIRMATION_DELIVERY_TEST_RETRY_CLAIMED':'CONFIRMATION_DELIVERY_TEST_CLAIMED',eventId,admin.email,retrying?'Owner-confirmed single idempotent retry.':'Owner-confirmed single synthetic delivery test.',JSON.stringify({recipient:approvedRecipient,operation_id:operationId,no_booking_created:true,no_payment_created:true,provider_idempotency_window_hours:24}),retrying?`${claimKey}:retry`:claimKey).run();
  }catch(error){
    if(/unique|constraint/i.test(String(error?.message||error)))return response({error:'The controlled confirmation operation has already been claimed.',code:'DELIVERY_TEST_ALREADY_USED'},409);
    throw error;
  }
  const copy=specialEventConfirmationCopy({booking:{test_delivery:true,customer_name:'Nora',reference:'TEST-NO-BOOKING',product_name_snapshot:product.name,product_description:product.description,quantity:1,amount_pence:product.price_pence},event,days:days.results||[],attendees:[{name:'Synthetic Test Attendee',age_at_event:18}],programme:programme.results||[]});
  try{
    const result=await sendEmail(approvedRecipient,copy.subject,copy.html,copy.text,{idempotencyKey:claimKey});
    await env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'CONFIRMATION_DELIVERY_TEST_SENT','SPECIAL_EVENT',?,?,?,?,?)`).bind(crypto.randomUUID(),eventId,eventId,admin.email,'Synthetic confirmation delivery accepted by the provider.',JSON.stringify({recipient:approvedRecipient,operation_id:operationId,provider_id:tidy(result?.id,160)||null}),`${claimKey}:sent`).run();
    return response({ok:true,status:'SENT',recipient:approvedRecipient});
  }catch(error){
    if(!retrying)await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'CONFIRMATION_DELIVERY_TEST_UNCONFIRMED','SPECIAL_EVENT',?,?,?,?,?)`).bind(crypto.randomUUID(),eventId,eventId,admin.email,'Provider result was not confirmed; inspect provider logs before retry.',JSON.stringify({recipient:approvedRecipient,operation_id:operationId,error:tidy(error?.message||error,300),retry_deadline:new Date(Date.now()+23*60*60*1000).toISOString()}),`${claimKey}:unconfirmed`).run();
    return response({error:retrying?'The single idempotent retry was not confirmed. Inspect the provider log; no further HQ retry is allowed.':'The controlled delivery was not confirmed. Inspect the provider log before using the single idempotent retry.',code:'DELIVERY_TEST_UNCONFIRMED',retry_available:!retrying},502);
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

export async function specialEventArtworkUpload(request,env,admin){
  if(!env.BOOKINGS_DB||!env.MEDIA_BUCKET)return response({error:'Private artwork storage is unavailable.'},503);
  const form=await request.formData(),file=form.get('file'),eventId=tidy(form.get('event_id'),160);
  if(!(file instanceof File)||!eventId)return response({error:'Choose the approved event artwork.'},400);
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>20*1024*1024)return response({error:'Use an approved JPG, PNG or WebP up to 20 MB.'},400);
  const event=await env.BOOKINGS_DB.prepare(`SELECT id FROM special_events WHERE id=?`).bind(eventId).first();if(!event)return response({error:'Special event not found.'},404);
  let document=await env.BOOKINGS_DB.prepare(`SELECT id,current_version FROM special_event_documents WHERE event_id=? AND category='ARTWORK' AND title='Approved event artwork'`).bind(eventId).first();
  const documentId=document?.id||crypto.randomUUID(),version=Number(document?.current_version||0)+1,versionId=crypto.randomUUID(),extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const storageKey=`private/special-events/${eventId}/${documentId}/v${version}-${versionId}.${extension}`,bytes=await file.arrayBuffer(),sha256=hex(await crypto.subtle.digest('SHA-256',bytes));
  await env.MEDIA_BUCKET.put(storageKey,bytes,{httpMetadata:{contentType:file.type,cacheControl:'private, no-store'}});
  try{await env.BOOKINGS_DB.batch([
    env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO special_event_documents(id,event_id,title,category,created_by) VALUES(?,?,'Approved event artwork','ARTWORK',?)`).bind(documentId,eventId,admin.email),
    env.BOOKINGS_DB.prepare(`INSERT INTO special_event_document_versions(id,document_id,version,storage_key,original_filename,content_type,byte_size,sha256,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(versionId,documentId,version,storageKey,tidy(file.name,255),file.type,file.size,sha256,admin.email),
    env.BOOKINGS_DB.prepare(`UPDATE special_event_documents SET current_version=? WHERE id=?`).bind(version,documentId),
    env.BOOKINGS_DB.prepare(`UPDATE special_events SET artwork_url=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).bind(`/api/special-event-artwork?id=${encodeURIComponent(eventId)}`,eventId),
    env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'EVENT_ARTWORK_VERSION_UPLOADED','DOCUMENT',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,documentId,admin.email,'Approved private event artwork uploaded.',JSON.stringify({version,content_type:file.type,byte_size:file.size,sha256}),`event-artwork:${versionId}`)
  ]);}catch(error){await env.MEDIA_BUCKET.delete(storageKey);throw error;}
  return response({ok:true,url:`/api/special-event-artwork?id=${encodeURIComponent(eventId)}`,version,sha256},201);
}

export async function specialEventArtwork(request,env,url){
  if(!env.BOOKINGS_DB||!env.MEDIA_BUCKET)return new Response('Not found',{status:404});
  const eventId=tidy(url.searchParams.get('id'),160),event=await env.BOOKINGS_DB.prepare(`SELECT status,publication_enabled FROM special_events WHERE id=?`).bind(eventId).first();
  if(!event)return new Response('Not found',{status:404});
  if(!(event.status==='PUBLISHED'&&Number(event.publication_enabled))){const checkEmail=tidy(request.headers.get('cf-access-authenticated-user-email'),200).toLowerCase(),configured=tidy(env.ADMIN_EMAIL,200).toLowerCase();if(!checkEmail||(configured&&checkEmail!==configured))return new Response('Not found',{status:404});}
  const version=await env.BOOKINGS_DB.prepare(`SELECT v.storage_key,v.content_type FROM special_event_document_versions v JOIN special_event_documents d ON d.id=v.document_id WHERE d.event_id=? AND d.category='ARTWORK' AND d.title='Approved event artwork' ORDER BY v.version DESC LIMIT 1`).bind(eventId).first();
  if(!version)return new Response('Not found',{status:404});const object=await env.MEDIA_BUCKET.get(version.storage_key);if(!object)return new Response('Not found',{status:404});
  return new Response(object.body,{headers:{'content-type':version.content_type,'cache-control':event.status==='PUBLISHED'?'public, max-age=3600':'private, no-store','x-content-type-options':'nosniff'}});
}

export async function specialEventMediaMultipartStart(request,env,admin){
  if(!env.BOOKINGS_DB||!env.MEDIA_BUCKET)return response({error:'Private event media storage is unavailable.'},503);
  const body=await request.json().catch(()=>null);if(!body)return response({error:'Upload details could not be read.'},400);
  const eventId=tidy(body.event_id,160),kind=tidy(body.media_type,30),name=tidy(body.name,255),suppliedType=tidy(body.type,100).toLowerCase(),type=videoContentType(name,suppliedType),size=Number(body.size);
  if(!eventId||kind!=='PROMO_VIDEO'||!videoSelectionOk(name,suppliedType)||!Number.isInteger(size)||size<1||size>100*1024*1024)return response({error:'Choose a web-ready MP4 up to 100 MB. H.264 video with AAC audio and fast-start metadata is required for reliable Safari playback.'},415);
  const event=await env.BOOKINGS_DB.prepare(`SELECT id FROM special_events WHERE id=?`).bind(eventId).first();if(!event)return response({error:'Special event not found.'},404);
  const id=crypto.randomUUID(),extension=videoExtension(name),storageKey=`private/special-events/${eventId}/media/promo_video/pending-${id}.${extension}`;
  try{const upload=await env.MEDIA_BUCKET.createMultipartUpload(storageKey,{httpMetadata:{contentType:type,cacheControl:'private, no-store'}});await env.BOOKINGS_DB.prepare(`INSERT INTO special_event_media_uploads(id,event_id,media_type,storage_key,r2_upload_id,original_filename,content_type,byte_size,title,caption,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,eventId,kind,storageKey,upload.uploadId,name,type,size,tidy(body.title,240)||null,tidy(body.caption,1000)||null,admin.email).run();return response({ok:true,upload_id:id,part_size:6*1024*1024},201);}catch(error){return response({error:`Could not start the private R2 upload: ${tidy(error?.message||error,300)}`},502);}
}

export async function specialEventMediaMultipartPart(request,env){
  if(!env.BOOKINGS_DB||!env.MEDIA_BUCKET)return response({error:'Private event media storage is unavailable.'},503);
  const id=tidy(request.headers.get('x-special-upload-id'),180),partNumber=Number(request.headers.get('x-part-number'));
  const row=await env.BOOKINGS_DB.prepare(`SELECT storage_key,r2_upload_id FROM special_event_media_uploads WHERE id=? AND status='UPLOADING'`).bind(id).first();
  if(!row||!Number.isInteger(partNumber)||partNumber<1||partNumber>10000)return response({error:'Upload part details are invalid.'},400);
  const bytes=await request.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>12*1024*1024)return response({error:'Each upload part must be 12 MB or smaller.'},413);
  if(partNumber===1&&!isIsoVideoContainer(new Uint8Array(bytes)))return response({error:'This file is not a valid MP4 video container.'},415);
  const expected=tidy(request.headers.get('x-part-sha256'),64).toLowerCase(),actual=hex(await crypto.subtle.digest('SHA-256',bytes));
  if(!/^[a-f0-9]{64}$/.test(expected)||expected!==actual)return response({error:`Video part ${partNumber} failed checksum verification. Retry the upload.`},422);
  try{const part=await env.MEDIA_BUCKET.resumeMultipartUpload(row.storage_key,row.r2_upload_id).uploadPart(partNumber,bytes);return response({ok:true,part:{...part,sha256:actual}});}catch(error){return response({error:`Video part ${partNumber} could not be stored: ${tidy(error?.message||error,300)}`},502);}
}

export async function specialEventMediaMultipartComplete(request,env,admin){
  if(!env.BOOKINGS_DB||!env.MEDIA_BUCKET)return response({error:'Private event media storage is unavailable.'},503);
  const body=await request.json().catch(()=>null),id=tidy(body?.upload_id,180),parts=Array.isArray(body?.parts)?body.parts:[];
  if(!id||!parts.length||parts.some(part=>!Number.isInteger(Number(part?.partNumber))||!part?.etag||!/^[a-f0-9]{64}$/.test(String(part?.sha256||''))))return response({error:'The upload completion details or part checksums are incomplete.'},400);
  const row=await env.BOOKINGS_DB.prepare(`SELECT * FROM special_event_media_uploads WHERE id=? AND status='UPLOADING' AND created_by=?`).bind(id,admin.email).first();if(!row)return response({error:'Active private upload not found.'},404);
  const sha256=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(parts.map(part=>part.sha256).join(':'))));
  try{await env.MEDIA_BUCKET.resumeMultipartUpload(row.storage_key,row.r2_upload_id).complete(parts.map(({partNumber,etag})=>({partNumber,etag})));const inspectLength=Math.min(Number(row.byte_size),4*1024*1024),head=await env.MEDIA_BUCKET.get(row.storage_key,{range:{offset:0,length:inspectLength}}),tailOffset=Math.max(0,Number(row.byte_size)-inspectLength),tail=await env.MEDIA_BUCKET.get(row.storage_key,{range:{offset:tailOffset,length:inspectLength}});if(!head||!tail)throw new Error('The completed video could not be reopened for format verification.');const headBytes=await mediaObjectBytes(head),inspected=new Uint8Array([...headBytes,...(await mediaObjectBytes(tail))]),hasH264=bytesContain(inspected,'avc1')||bytesContain(inspected,'avc3'),hasAac=bytesContain(inspected,'mp4a'),moovOffset=bytesIndexOf(headBytes,'moov'),mdatOffset=bytesIndexOf(headBytes,'mdat'),hasFastStart=moovOffset>=0&&(mdatOffset<0||moovOffset<mdatOffset);if(!hasH264||!hasAac||!hasFastStart){await env.MEDIA_BUCKET.delete(row.storage_key);await env.BOOKINGS_DB.prepare(`UPDATE special_event_media_uploads SET status='FAILED' WHERE id=?`).bind(id).run();return response({error:!hasFastStart?'This MP4 is not web optimised. Export it with fast-start metadata, H.264 video and AAC audio, then retry.':'This MP4 uses codecs that are not reliably playable in browsers. Export it with H.264 video, AAC audio and fast-start metadata, then retry.'},415);}const current=await env.BOOKINGS_DB.prepare(`SELECT COALESCE(MAX(version),0) version FROM special_event_media WHERE event_id=? AND media_type=?`).bind(row.event_id,row.media_type).first(),version=Number(current?.version||0)+1,mediaId=crypto.randomUUID(),publicUrl=`/api/special-event-media?id=${encodeURIComponent(row.event_id)}&type=PROMO_VIDEO`;await env.BOOKINGS_DB.batch([env.BOOKINGS_DB.prepare(`UPDATE special_event_media SET active=0 WHERE event_id=? AND media_type='PROMO_VIDEO' AND active=1`).bind(row.event_id),env.BOOKINGS_DB.prepare(`INSERT INTO special_event_media(id,event_id,media_type,title,caption,storage_key,content_type,byte_size,sha256,version,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(mediaId,row.event_id,row.media_type,row.title,row.caption,row.storage_key,'video/mp4',row.byte_size,sha256,version,admin.email),env.BOOKINGS_DB.prepare(`UPDATE special_event_media_uploads SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id),env.BOOKINGS_DB.prepare(`UPDATE special_events SET promo_video_url=?,promo_video_title=COALESCE(?,promo_video_title),promo_video_caption=COALESCE(?,promo_video_caption),updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).bind(publicUrl,row.title,row.caption,row.event_id),env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'EVENT_MEDIA_VERSION_UPLOADED','EVENT_MEDIA',?,?,?, ?,?)`).bind(crypto.randomUUID(),row.event_id,mediaId,admin.email,'PROMO_VIDEO multipart version uploaded.',JSON.stringify({version,content_type:'video/mp4',byte_size:row.byte_size,sha256,checksum_scheme:'sha256-part-manifest',verified_codecs:['H264','AAC'],fast_start:true}),`event-media:${mediaId}`)]);return response({ok:true,url:publicUrl,version,sha256,verified_codecs:['H264','AAC'],fast_start:true},201);}catch(error){await env.BOOKINGS_DB.prepare(`UPDATE special_event_media_uploads SET status='FAILED' WHERE id=?`).bind(id).run().catch(()=>{});return response({error:`Could not finish the private R2 upload: ${tidy(error?.message||error,300)}`},502);}
}

export async function specialEventMediaUpload(request,env,admin){
  if(!env.BOOKINGS_DB||!env.MEDIA_BUCKET)return response({error:'Private event media storage is unavailable.'},503);
  const form=await request.formData(),file=form.get('file'),eventId=tidy(form.get('event_id'),160),kind=tidy(form.get('media_type'),30);
  if(!(file instanceof File)||!eventId||!['PROMO_VIDEO','VIDEO_POSTER','INSTRUCTOR_PHOTO'].includes(kind))return response({error:'Choose an event and supported media file.'},400);
  const isVideo=kind==='PROMO_VIDEO',allowed=isVideo?file.type==='video/mp4':['image/jpeg','image/png','image/webp'].includes(file.type),limit=isVideo?100*1024*1024:10*1024*1024;
  if(!allowed||file.size<1||file.size>limit)return response({error:isVideo?'Use an H.264/AAC MP4 up to 100 MB. MOV files should be converted to MP4 first.':'Use a JPG, PNG or WebP thumbnail up to 10 MB.'},415);
  const event=await env.BOOKINGS_DB.prepare(`SELECT id FROM special_events WHERE id=?`).bind(eventId).first();if(!event)return response({error:'Special event not found.'},404);
  const current=await env.BOOKINGS_DB.prepare(`SELECT COALESCE(MAX(version),0) version FROM special_event_media WHERE event_id=? AND media_type=?`).bind(eventId,kind).first(),version=Number(current?.version||0)+1,id=crypto.randomUUID();
  const extension=isVideo?'mp4':file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',storageKey=`private/special-events/${eventId}/media/${kind.toLowerCase()}/v${version}-${id}.${extension}`;
  const bytes=await file.arrayBuffer(),sha256=hex(await crypto.subtle.digest('SHA-256',bytes));
  await env.MEDIA_BUCKET.put(storageKey,bytes,{httpMetadata:{contentType:file.type,cacheControl:'private, no-store'}});
  const publicUrl=`/api/special-event-media?id=${encodeURIComponent(eventId)}&type=${encodeURIComponent(kind)}`,urlColumn=kind==='PROMO_VIDEO'?'promo_video_url':kind==='VIDEO_POSTER'?'promo_video_poster_url':'instructor_photo_url';
  try{await env.BOOKINGS_DB.batch([
    env.BOOKINGS_DB.prepare(`UPDATE special_event_media SET active=0 WHERE event_id=? AND media_type=? AND active=1`).bind(eventId,kind),
    env.BOOKINGS_DB.prepare(`INSERT INTO special_event_media(id,event_id,media_type,title,caption,storage_key,content_type,byte_size,sha256,version,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,eventId,kind,tidy(form.get('title'),240)||null,tidy(form.get('caption'),1000)||null,storageKey,file.type,file.size,sha256,version,admin.email),
    env.BOOKINGS_DB.prepare(`UPDATE special_events SET ${urlColumn}=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).bind(publicUrl,eventId),
    env.BOOKINGS_DB.prepare(`INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key) VALUES(?,?,'EVENT_MEDIA_VERSION_UPLOADED','EVENT_MEDIA',?,?,?, ?,?)`).bind(crypto.randomUUID(),eventId,id,admin.email,`${kind} version uploaded.`,JSON.stringify({kind,version,content_type:file.type,byte_size:file.size,sha256}),`event-media:${id}`)
  ]);}catch(error){await env.MEDIA_BUCKET.delete(storageKey);throw error;}
  return response({ok:true,url:publicUrl,version,sha256},201);
}

export async function specialEventMedia(request,env,url){
  if(!env.BOOKINGS_DB||!env.MEDIA_BUCKET)return new Response('Not found',{status:404});
  const eventId=tidy(url.searchParams.get('id'),160),kind=tidy(url.searchParams.get('type'),30),event=await env.BOOKINGS_DB.prepare(`SELECT status,publication_enabled,promo_video_display_enabled FROM special_events WHERE id=?`).bind(eventId).first();
  if(!event||!['PROMO_VIDEO','VIDEO_POSTER','INSTRUCTOR_PHOTO'].includes(kind))return new Response('Not found',{status:404});
  const isPublic=event.status==='PUBLISHED'&&Number(event.publication_enabled)&&(kind!=='PROMO_VIDEO'||Number(event.promo_video_display_enabled));
  if(!isPublic){const email=tidy(request.headers.get('cf-access-authenticated-user-email'),200).toLowerCase(),configured=tidy(env.ADMIN_EMAIL,200).toLowerCase();if(!email||(configured&&email!==configured))return new Response('Not found',{status:404});}
  const media=await env.BOOKINGS_DB.prepare(`SELECT storage_key,content_type,byte_size FROM special_event_media WHERE event_id=? AND media_type=? AND active=1`).bind(eventId,kind).first();if(!media)return new Response('Not found',{status:404});
  const range=request.headers.get('range');
  if(kind==='PROMO_VIDEO'&&range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range),size=Number(media.byte_size);
    if(!match||!Number.isSafeInteger(size)||size<1)return new Response(null,{status:416});
    let start,end;
    if(match[1]){
      start=Number(match[1]);
      end=match[2]?Math.min(Number(match[2]),size-1):size-1;
    }else if(match[2]){
      const suffixLength=Number(match[2]);
      if(!Number.isSafeInteger(suffixLength)||suffixLength<1)return new Response(null,{status:416,headers:{'content-range':`bytes */${size}`}});
      start=Math.max(0,size-suffixLength);
      end=size-1;
    }else return new Response(null,{status:416,headers:{'content-range':`bytes */${size}`}});
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=size)return new Response(null,{status:416,headers:{'content-range':`bytes */${size}`}});
    const object=await env.MEDIA_BUCKET.get(media.storage_key,{range:{offset:start,length:end-start+1}});if(!object)return new Response('Not found',{status:404});return new Response(object.body,{status:206,headers:{'content-type':media.content_type,'content-length':String(end-start+1),'content-range':`bytes ${start}-${end}/${size}`,'accept-ranges':'bytes','cache-control':isPublic?'public, max-age=3600':'private, no-store'}});
  }
  const object=await env.MEDIA_BUCKET.get(media.storage_key);if(!object)return new Response('Not found',{status:404});
  return new Response(object.body,{headers:{'content-type':media.content_type,'content-length':String(media.byte_size),'accept-ranges':'bytes','cache-control':isPublic?'public, max-age=3600':'private, no-store','x-content-type-options':'nosniff'}});
}

export async function specialEventDocumentDownload(request,env,url){
  const versionId=tidy(url.searchParams.get('version'),160);
  const row=await env.BOOKINGS_DB.prepare(`SELECT storage_key,original_filename,content_type FROM special_event_document_versions WHERE id=?`).bind(versionId).first();
  if(!row)return response({error:'Document version not found.'},404);
  const object=await env.MEDIA_BUCKET.get(row.storage_key);if(!object)return response({error:'Stored document is unavailable.'},404);
  const headers=new Headers();headers.set('content-type',row.content_type);headers.set('cache-control','private, no-store');headers.set('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`);
  return new Response(object.body,{headers});
}
