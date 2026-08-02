const INDEX_KEY = '__system/media-index.json';
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
    pragma: 'no-cache'
  }
});

const accessEmail = request => request.headers.get('Cf-Access-Authenticated-User-Email') || '';
const allowedTypes = new Set([
  'image/jpeg','image/png','image/webp',
  'video/mp4','video/webm','video/quicktime',
  'application/pdf'
]);
const mediaType = mime => mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime === 'application/pdf' ? 'pdf' : 'file';
const extension = (name, mime) => {
  const ext = (name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ext) return ext;
  return ({
    'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
    'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','application/pdf':'pdf'
  })[mime] || 'bin';
};

async function readIndex(env) {
  const object = await env.MEDIA_BUCKET.get(INDEX_KEY);
  if (!object) return [];
  try {
    const value = await object.json();
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
async function writeIndex(env, items) {
  await env.MEDIA_BUCKET.put(INDEX_KEY, JSON.stringify(items), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' }
  });
}
function adminState(request, env) {
  const email = accessEmail(request);
  const configured = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const authorised = Boolean(email) && (!configured || email.toLowerCase() === configured);
  return { email, configured, authorised };
}
function requireAdmin(request, env) {
  const state = adminState(request, env);
  if (!state.email) return { response: json({ error: 'HQ is not protected by Cloudflare Access yet.', code: 'ACCESS_NOT_CONFIGURED' }, 401), state };
  if (!state.authorised) return { response: json({ error: 'This email is not authorised to use Boot Scootin’ HQ.', code: 'ADMIN_NOT_AUTHORISED' }, 403), state };
  if (!env.MEDIA_BUCKET) return { response: json({ error: 'The R2 binding MEDIA_BUCKET is missing.', code: 'STORAGE_BINDING_MISSING' }, 503), state };
  return { response: null, state };
}


async function ensureBookingSchema(env) {
  if (!env.BOOKINGS_DB) throw new Error('BOOKINGS_DB binding is missing.');
  const statements = [
    `CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      venue TEXT NOT NULL,
      location TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      price_pence INTEGER NOT NULL CHECK(price_pence >= 0),
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      sold INTEGER NOT NULL DEFAULT 0 CHECK(sold >= 0),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('draft','open','closed','cancelled')),
      level TEXT NOT NULL DEFAULT 'Beginner friendly',
      public_notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      marketing_consent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS booking_holds (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      class_id TEXT NOT NULL REFERENCES classes(id),
      hold_id TEXT REFERENCES booking_holds(id),
      customer_id TEXT REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),
      amount_pence INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','FAILED','CANCELLED','REFUNDED','WAITLISTED')),
      payment_provider TEXT NOT NULL DEFAULT 'SUMUP',
      provider_checkout_id TEXT,
      provider_transaction_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TEXT,
      retention_delete_after TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS waiting_list (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING','OFFERED','CONVERTED','CANCELLED')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      checked_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checked_in_by TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'SUMUP',
      provider_reference TEXT,
      amount_pence INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS private_event_inquiries (
      id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, secure_token TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, customer_phone TEXT,
      event_type TEXT NOT NULL, event_type_other TEXT, preferred_date TEXT NOT NULL, alternative_date TEXT,
      start_time TEXT, end_time TEXT, venue_name TEXT, venue_address TEXT NOT NULL, venue_postcode TEXT NOT NULL,
      guest_count INTEGER NOT NULL CHECK(guest_count > 0), age_range TEXT, experience_level TEXT, session_length TEXT,
      format_requested TEXT, music_requests TEXT, sound_system_provided INTEGER NOT NULL DEFAULT 0,
      microphone_provided INTEGER NOT NULL DEFAULT 0, dance_floor_confirmed INTEGER NOT NULL DEFAULT 0,
      power_available INTEGER NOT NULL DEFAULT 0, parking_loading_available INTEGER NOT NULL DEFAULT 0,
      equipment_notes TEXT, accessibility_notes TEXT, additional_notes TEXT, status TEXT NOT NULL DEFAULT 'NEW_INQUIRY',
      customer_change_request TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS private_event_quotes (
      id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL REFERENCES private_event_inquiries(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1, agreed_date TEXT, agreed_start_time TEXT, agreed_end_time TEXT,
      agreed_venue TEXT, agreed_address TEXT, package_description TEXT, base_fee_pence INTEGER NOT NULL DEFAULT 0,
      travel_fee_pence INTEGER NOT NULL DEFAULT 0, equipment_fee_pence INTEGER NOT NULL DEFAULT 0,
      extra_fee_pence INTEGER NOT NULL DEFAULT 0, discount_pence INTEGER NOT NULL DEFAULT 0, total_pence INTEGER NOT NULL DEFAULT 0,
      deposit_pence INTEGER NOT NULL DEFAULT 0, balance_due_pence INTEGER NOT NULL DEFAULT 0, balance_due_date TEXT,
      quote_expires_at TEXT, cancellation_terms TEXT, customer_notes TEXT, internal_notes TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS private_event_payments (
      id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL REFERENCES private_event_inquiries(id) ON DELETE CASCADE,
      quote_id TEXT REFERENCES private_event_quotes(id) ON DELETE SET NULL, payment_kind TEXT NOT NULL, amount_pence INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'SUMUP', provider_reference TEXT, status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS private_event_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id TEXT NOT NULL REFERENCES private_event_inquiries(id) ON DELETE CASCADE,
      actor_type TEXT NOT NULL, actor_label TEXT, action TEXT NOT NULL, details_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_holds_class_expiry ON booking_holds(class_id, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_class_status ON bookings(class_id,status)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(customer_email)`,
    `CREATE INDEX IF NOT EXISTS idx_waiting_class_status ON waiting_list(class_id,status)`,
    `CREATE INDEX IF NOT EXISTS idx_private_event_status ON private_event_inquiries(status,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_private_event_token ON private_event_inquiries(secure_token)`,
    `CREATE INDEX IF NOT EXISTS idx_private_quote_inquiry ON private_event_quotes(inquiry_id,version)`
  ];
  for (const statement of statements) await env.BOOKINGS_DB.prepare(statement).run();
  await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO venues(id,name,location,capacity) VALUES
    ('ecc','Edgbaston Community Centre','Birmingham',20),
    ('low-places','Low Places','Birmingham',50)`).run();
  const row = await env.BOOKINGS_DB.prepare("SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").first();
  return Number(row?.tables || 0);
}

async function publicClasses(env) {
  if (!env.BOOKINGS_DB) return json({ error: 'Booking database is not connected.' }, 503);
  try {
    await ensureBookingSchema(env);
    const now = new Date().toISOString();
    const { results } = await env.BOOKINGS_DB.prepare(`
      SELECT c.id,c.title,c.venue,c.location,c.starts_at,c.ends_at,c.price_pence,c.capacity,c.sold,c.status,c.level,c.public_notes,
      MAX(0,c.capacity-c.sold-COALESCE((SELECT SUM(h.quantity) FROM booking_holds h WHERE h.class_id=c.id AND h.expires_at>?),0)) AS spaces_remaining
      FROM classes c WHERE c.status='open' AND c.starts_at>? ORDER BY c.starts_at
    `).bind(now,now).all();
    return json(results.map(row => ({ ...row, price: row.price_pence / 100 })));
  } catch (error) {
    return json({ error: 'The booking database could not be prepared.', detail: error.message }, 500);
  }
}


const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const emailOk = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const dateOk = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const privateStatuses = new Set(['NEW_INQUIRY','REVIEWING','CHANGES_REQUESTED','AWAITING_CUSTOMER','QUOTE_SENT','QUOTE_ACCEPTED','AWAITING_DEPOSIT','CONFIRMED_DEPOSIT','CONFIRMED_PAID','BALANCE_DUE','COMPLETED','CANCELLED','DECLINED','EXPIRED']);

function requireAccessAdmin(request, env) {
  const state = adminState(request, env);
  if (!state.email) return { response: json({ error: 'Boot Scootin’ HQ must be protected with Cloudflare Access before private customer details can be viewed.', code: 'ACCESS_REQUIRED' }, 401), state };
  if (!state.authorised) return { response: json({ error: 'This email is not authorised to use Boot Scootin’ HQ.', code: 'ADMIN_NOT_AUTHORISED' }, 403), state };
  if (!env.BOOKINGS_DB) return { response: json({ error: 'BOOKINGS_DB is not connected.', code: 'DATABASE_MISSING' }, 503), state };
  return { response: null, state };
}

async function createClassReservation(request, env) {
  if (!env.BOOKINGS_DB) return json({ error: 'Booking database is not connected.' }, 503);
  await ensureBookingSchema(env);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'The booking request could not be read.' }, 400);
  const name = clean(body.name, 100), email = clean(body.email, 160).toLowerCase(), phone = clean(body.phone, 30);
  const classId = clean(body.classId, 120), quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));
  if (!name || !emailOk(email) || !classId) return json({ error: 'Please enter your name, a valid email address and choose a class.' }, 400);
  const row = await env.BOOKINGS_DB.prepare(`SELECT * FROM classes WHERE id=? AND status='open'`).bind(classId).first();
  if (!row) return json({ error: 'This class is no longer open for booking.' }, 404);
  const spaces = Math.max(0, Number(row.capacity) - Number(row.sold || 0));
  const id = crypto.randomUUID();
  const reference = `BS-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
  if (spaces < quantity) {
    await env.BOOKINGS_DB.prepare(`INSERT INTO waiting_list(id,class_id,customer_name,customer_email,quantity,status) VALUES(?,?,?,?,?,'WAITING')`).bind(id,classId,name,email,quantity).run();
    return json({ ok:true, waitlisted:true, reference, message:'The class is full, so you have been added to the waiting list. No payment has been taken.' }, 201);
  }
  const amount = Number(row.price_pence) * quantity;
  await env.BOOKINGS_DB.batch([
    env.BOOKINGS_DB.prepare(`INSERT INTO bookings(id,reference,class_id,customer_name,customer_email,customer_phone,quantity,amount_pence,status,payment_provider,retention_delete_after) VALUES(?,?,?,?,?,?,?,?, 'PENDING','TEST',datetime('now','+24 months'))`).bind(id,reference,classId,name,email,phone,quantity,amount),
    env.BOOKINGS_DB.prepare(`UPDATE classes SET sold=sold+?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND sold+?<=capacity`).bind(quantity,classId,quantity),
    env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`).bind(email,'TEST_RESERVATION_CREATED','booking',id,JSON.stringify({reference,quantity}))
  ]);
  return json({ ok:true, reference, status:'PENDING', payment_enabled:false, message:'Your place has been recorded in pilot mode. No payment has been taken and the booking is not final until Nora confirms it.' }, 201);
}

async function privateEventInquiry(request, env) {
  if (!env.BOOKINGS_DB) return json({ error:'The inquiry service is temporarily unavailable.' },503);
  await ensureBookingSchema(env);
  const b = await request.json().catch(()=>null);
  if (!b) return json({ error:'The inquiry could not be read.' },400);
  if (clean(b.website,80)) return json({ ok:true, reference:'BS-PRIVATE' },201);
  const name=clean(b.customer_name,100), email=clean(b.customer_email,160).toLowerCase(), phone=clean(b.customer_phone,30);
  const type=clean(b.event_type,60), preferred=clean(b.preferred_date,10), address=clean(b.venue_address,300), postcode=clean(b.venue_postcode,16).toUpperCase();
  const guests=Math.max(1,Math.min(5000,Number(b.guest_count)||0));
  if(!name||!emailOk(email)||!type||!dateOk(preferred)||!address||!postcode||!guests) return json({error:'Please complete your contact details, event type, preferred date, venue address, postcode and guest number.'},400);
  const id=crypto.randomUUID(), token=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');
  const reference=`PE-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,5).toUpperCase()}`;
  const values=[id,reference,token,name,email,phone,type,clean(b.event_type_other,80),preferred,clean(b.alternative_date,10),clean(b.start_time,8),clean(b.end_time,8),clean(b.venue_name,160),address,postcode,guests,clean(b.age_range,120),clean(b.experience_level,80),clean(b.session_length,80),clean(b.format_requested,120),clean(b.music_requests,600),Number(Boolean(b.sound_system_provided)),Number(Boolean(b.microphone_provided)),Number(Boolean(b.dance_floor_confirmed)),Number(Boolean(b.power_available)),Number(Boolean(b.parking_loading_available)),clean(b.equipment_notes,600),clean(b.accessibility_notes,600),clean(b.additional_notes,1200)];
  await env.BOOKINGS_DB.batch([
    env.BOOKINGS_DB.prepare(`INSERT INTO private_event_inquiries(id,reference,secure_token,customer_name,customer_email,customer_phone,event_type,event_type_other,preferred_date,alternative_date,start_time,end_time,venue_name,venue_address,venue_postcode,guest_count,age_range,experience_level,session_length,format_requested,music_requests,sound_system_provided,microphone_provided,dance_floor_confirmed,power_available,parking_loading_available,equipment_notes,accessibility_notes,additional_notes) VALUES(${Array(29).fill('?').join(',')})`).bind(...values),
    env.BOOKINGS_DB.prepare(`INSERT INTO private_event_timeline(inquiry_id,actor_type,actor_label,action,details_json) VALUES(?,?,?,?,?)`).bind(id,'CUSTOMER',email,'INQUIRY_SUBMITTED',JSON.stringify({preferred_date:preferred,postcode}))
  ]);
  return json({ok:true,reference,status_url:`/private-quote.html?token=${encodeURIComponent(token)}`,message:'Your inquiry has been sent. This is not a confirmed booking.'},201);
}

async function publicPrivateQuote(request, env, url) {
  if (!env.BOOKINGS_DB) return json({error:'The private booking service is unavailable.'},503);
  await ensureBookingSchema(env);
  const token=clean(url.searchParams.get('token'),120);
  const inquiry=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_inquiries WHERE secure_token=?`).bind(token).first();
  if(!inquiry) return json({error:'This private booking link is invalid or has expired.'},404);
  const quote=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_quotes WHERE inquiry_id=? ORDER BY version DESC LIMIT 1`).bind(inquiry.id).first();
  const safeInquiry={reference:inquiry.reference,event_type:inquiry.event_type,preferred_date:inquiry.preferred_date,start_time:inquiry.start_time,end_time:inquiry.end_time,venue_name:inquiry.venue_name,venue_address:inquiry.venue_address,guest_count:inquiry.guest_count,status:inquiry.status};
  return json({inquiry:safeInquiry,quote,payments_enabled:Boolean(env.SUMUP_API_KEY&&env.SUMUP_MERCHANT_CODE)});
}

async function privateEventRespond(request, env) {
  if(!env.BOOKINGS_DB) return json({error:'The private booking service is unavailable.'},503);
  await ensureBookingSchema(env);
  const b=await request.json().catch(()=>null); if(!b) return json({error:'Request could not be read.'},400);
  const token=clean(b.token,120), action=clean(b.action,40), message=clean(b.message,1200);
  const inquiry=await env.BOOKINGS_DB.prepare(`SELECT id FROM private_event_inquiries WHERE secure_token=?`).bind(token).first();
  if(!inquiry) return json({error:'This private booking link is invalid.'},404);
  if(action==='REQUEST_CHANGES'){
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`UPDATE private_event_inquiries SET status='CHANGES_REQUESTED',customer_change_request=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(message,inquiry.id),
      env.BOOKINGS_DB.prepare(`INSERT INTO private_event_timeline(inquiry_id,actor_type,actor_label,action,details_json) VALUES(?,?,?,?,?)`).bind(inquiry.id,'CUSTOMER','secure link','CHANGES_REQUESTED',JSON.stringify({message}))
    ]);
    return json({ok:true});
  }
  return json({error:'That action is not available yet.'},400);
}

async function adminClasses(request, env) {
  const check=requireAccessAdmin(request,env); if(check.response)return check.response; await ensureBookingSchema(env);
  if(request.method==='GET'){const {results}=await env.BOOKINGS_DB.prepare(`SELECT * FROM classes ORDER BY starts_at`).all();return json(results);}
  const b=await request.json().catch(()=>null); if(!b)return json({error:'Invalid class request.'},400);
  if(request.method==='DELETE'){await env.BOOKINGS_DB.prepare(`DELETE FROM classes WHERE id=?`).bind(clean(b.id,120)).run();return json({ok:true});}
  const id=clean(b.id,120)||crypto.randomUUID(); const vals=[clean(b.title,160),clean(b.venue,160),clean(b.location,240),new Date(b.starts_at).toISOString(),b.ends_at?new Date(b.ends_at).toISOString():null,Math.max(0,Number(b.price_pence)||0),Math.max(1,Number(b.capacity)||1),clean(b.status,20)||'draft',clean(b.level,80)||'Beginner friendly',clean(b.public_notes,600)];
  if(request.method==='POST'){await env.BOOKINGS_DB.prepare(`INSERT INTO classes(id,title,venue,location,starts_at,ends_at,price_pence,capacity,status,level,public_notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,...vals).run();return json({ok:true,id},201);}
  if(request.method==='PATCH'){await env.BOOKINGS_DB.prepare(`UPDATE classes SET title=?,venue=?,location=?,starts_at=?,ends_at=?,price_pence=?,capacity=?,status=?,level=?,public_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...vals,id).run();return json({ok:true,id});}
  return json({error:'Method not allowed.'},405);
}

async function adminBookings(request, env) {
  const check=requireAccessAdmin(request,env); if(check.response)return check.response; await ensureBookingSchema(env);
  const {results}=await env.BOOKINGS_DB.prepare(`SELECT c.id,c.title,c.starts_at,c.venue,b.id booking_id,b.customer_name name,b.customer_email email,b.quantity,b.reference,b.status FROM classes c LEFT JOIN bookings b ON b.class_id=c.id AND b.status IN ('PENDING','PAID') ORDER BY c.starts_at,b.created_at`).all();
  const map=new Map(); for(const r of results){if(!map.has(r.id))map.set(r.id,{id:r.id,title:r.title,starts_at:r.starts_at,venue:r.venue,bookings:[]});if(r.booking_id)map.get(r.id).bookings.push({id:r.booking_id,name:r.name,email:r.email,quantity:r.quantity,reference:r.reference,status:r.status});}
  return json({classes:[...map.values()],stats:{guests:results.filter(r=>r.booking_id).reduce((n,r)=>n+Number(r.quantity||0),0)}});
}

async function adminPrivateEvents(request, env) {
  const check=requireAccessAdmin(request,env); if(check.response)return check.response; await ensureBookingSchema(env);
  if(request.method==='GET'){const {results}=await env.BOOKINGS_DB.prepare(`SELECT i.*,q.id quote_id,q.total_pence,q.deposit_pence,q.status quote_status,q.quote_expires_at FROM private_event_inquiries i LEFT JOIN private_event_quotes q ON q.id=(SELECT id FROM private_event_quotes WHERE inquiry_id=i.id ORDER BY version DESC LIMIT 1) ORDER BY i.created_at DESC`).all();return json({items:results});}
  const b=await request.json().catch(()=>null);if(!b)return json({error:'Invalid private event request.'},400);
  if(request.method==='PATCH'&&b.action==='STATUS'){const status=clean(b.status,40);if(!privateStatuses.has(status))return json({error:'Invalid status.'},400);await env.BOOKINGS_DB.prepare(`UPDATE private_event_inquiries SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,clean(b.id,120)).run();return json({ok:true});}
  if(request.method==='POST'&&b.action==='QUOTE'){
    const inquiryId=clean(b.inquiry_id,120);const current=await env.BOOKINGS_DB.prepare(`SELECT COALESCE(MAX(version),0) v FROM private_event_quotes WHERE inquiry_id=?`).bind(inquiryId).first();const version=Number(current?.v||0)+1;
    const base=Math.max(0,Number(b.base_fee_pence)||0),travel=Math.max(0,Number(b.travel_fee_pence)||0),equipment=Math.max(0,Number(b.equipment_fee_pence)||0),extra=Math.max(0,Number(b.extra_fee_pence)||0),discount=Math.max(0,Number(b.discount_pence)||0),total=Math.max(0,base+travel+equipment+extra-discount),deposit=Math.min(total,Math.max(0,Number(b.deposit_pence)||0));
    const quoteId=crypto.randomUUID();
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`INSERT INTO private_event_quotes(id,inquiry_id,version,agreed_date,agreed_start_time,agreed_end_time,agreed_venue,agreed_address,package_description,base_fee_pence,travel_fee_pence,equipment_fee_pence,extra_fee_pence,discount_pence,total_pence,deposit_pence,balance_due_pence,balance_due_date,quote_expires_at,cancellation_terms,customer_notes,internal_notes,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'QUOTE_SENT')`).bind(quoteId,inquiryId,version,clean(b.agreed_date,10),clean(b.agreed_start_time,8),clean(b.agreed_end_time,8),clean(b.agreed_venue,160),clean(b.agreed_address,300),clean(b.package_description,1000),base,travel,equipment,extra,discount,total,deposit,total-deposit,clean(b.balance_due_date,10),clean(b.quote_expires_at,30),clean(b.cancellation_terms,1200),clean(b.customer_notes,1200),clean(b.internal_notes,1200)),
      env.BOOKINGS_DB.prepare(`UPDATE private_event_inquiries SET status='QUOTE_SENT',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(inquiryId),
      env.BOOKINGS_DB.prepare(`INSERT INTO private_event_timeline(inquiry_id,actor_type,actor_label,action,details_json) VALUES(?,?,?,?,?)`).bind(inquiryId,'ADMIN',check.state.email,'QUOTE_SENT',JSON.stringify({quote_id:quoteId,total_pence:total,deposit_pence:deposit}))
    ]);
    return json({ok:true,quote_id:quoteId});
  }
  return json({error:'Method not allowed.'},405);
}

async function health(request, env) {
  const admin = adminState(request, env);
  const services = {
    website: { status: 'online', message: 'The website and HQ frontend are responding.' },
    access: admin.email
      ? { status: 'protected', message: `Cloudflare Access is active. Signed in as ${admin.email}.` }
      : { status: 'setup', message: 'HQ is not protected by Cloudflare Access yet. Media uploads remain locked.' },
    database: { status: 'setup', message: 'D1 booking database has not been connected yet.' },
    media: { status: 'setup', message: 'R2 media binding has not been detected yet.' },
    payments: { status: 'setup', message: 'SumUp sandbox is not connected yet.' },
    email: { status: 'setup', message: 'Transactional email is not connected yet.' },
    backups: { status: 'setup', message: 'No tested export and restore record yet.' }
  };

  if (env.BOOKINGS_DB) {
    try {
      const tableCount = await ensureBookingSchema(env);
      services.database = { status: 'ready', message: `Cloudflare D1 is connected, responding and prepared with ${tableCount} booking tables.` };
    } catch (error) {
      services.database = { status: 'attention', message: `D1 is bound, but database setup failed: ${error.message}` };
    }
  }
  if (env.MEDIA_BUCKET) {
    try {
      await env.MEDIA_BUCKET.list({ limit: 1 });
      services.media = { status: 'ready', message: 'Cloudflare R2 is connected to MEDIA_BUCKET and responding.' };
    } catch (error) {
      services.media = { status: 'attention', message: `R2 is bound, but its test request failed: ${error.message}` };
    }
  }
  if (env.SUMUP_API_KEY && env.SUMUP_MERCHANT_CODE) {
    const test = String(env.SUMUP_API_KEY).startsWith('sk_test_');
    services.payments = test
      ? { status: 'test_mode', message: 'SumUp sandbox credentials are present. Live payments remain disabled.' }
      : { status: 'attention', message: 'A live-looking SumUp key is present. Do not launch before full payment testing.' };
  }
  if (env.EMAIL_API_KEY && env.EMAIL_FROM) services.email = { status: 'ready', message: 'Email credentials are configured. A delivery test is still required.' };
  if (env.BACKUP_LAST_TESTED) services.backups = { status: 'ready', message: `Last restore test recorded: ${String(env.BACKUP_LAST_TESTED).slice(0, 30)}` };

  return json({ mode: 'free-pilot', version: 75, checked_at: new Date().toISOString(), services });
}

async function mediaStatus(request, env) {
  const admin = adminState(request, env);
  const checks = {
    website: { ready: true, message: 'HQ and the diagnostic endpoint are responding.' },
    access: { ready: Boolean(admin.email), message: admin.email ? `Cloudflare Access is active for ${admin.email}.` : 'Cloudflare Access is not yet protecting HQ. Uploads stay locked until it is enabled.' },
    adminEmail: { ready: !admin.configured || admin.authorised, message: admin.configured ? (admin.authorised ? 'The signed-in email matches ADMIN_EMAIL.' : 'The signed-in email does not match ADMIN_EMAIL.') : 'ADMIN_EMAIL is optional for the pilot; Cloudflare Access is still required.' },
    storage: { ready: Boolean(env.MEDIA_BUCKET), message: env.MEDIA_BUCKET ? 'MEDIA_BUCKET binding was detected.' : 'The binding named MEDIA_BUCKET was not detected in this deployment.' },
    database: { ready: true, message: 'The pilot media index is stored privately in R2; D1 is not required for uploads.' }
  };
  if (env.MEDIA_BUCKET) {
    try {
      await env.MEDIA_BUCKET.list({ limit: 1 });
      checks.storage = { ready: true, message: 'R2 connection is working.' };
    } catch (error) {
      checks.storage = { ready: false, message: `R2 was detected, but its test request failed: ${error.message}` };
    }
  }
  const ready = checks.access.ready && checks.adminEmail.ready && checks.storage.ready;
  const error = !checks.storage.ready
    ? 'The R2 storage connection still needs attention.'
    : !checks.access.ready
      ? 'R2 is connected. The remaining step is protecting HQ with Cloudflare Access.'
      : !checks.adminEmail.ready
        ? 'Cloudflare Access is active, but this email is not authorised.'
        : '';
  return json({ ready, authorised: admin.authorised, checks, error, version: 75 });
}

async function mediaCollection(request, env) {
  const check = requireAdmin(request, env);
  if (check.response) return check.response;

  if (request.method === 'GET') {
    const items = await readIndex(env);
    return json({ items: items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) });
  }
  if (request.method === 'POST') {
    let data;
    try { data = await request.formData(); }
    catch { return json({ error: 'The upload request could not be read. Try again using Wi‑Fi or a smaller file.', code: 'FORM_DATA_ERROR' }, 400); }
    const file = data.get('file');
    if (!(file instanceof File) || !file.size) return json({ error: 'Please choose a file.', code: 'FILE_REQUIRED' }, 400);
    if (file.size > 80 * 1024 * 1024) return json({ error: 'Maximum upload size is 80 MB. Export or compress the video before uploading.', code: 'FILE_TOO_LARGE' }, 413);
    if (!allowedTypes.has(file.type)) return json({ error: `Unsupported file type (${file.type || 'unknown'}). Use JPG, PNG, WebP, MP4, WebM, MOV or PDF.`, code: 'UNSUPPORTED_TYPE' }, 415);

    const id = crypto.randomUUID();
    const key = `uploads/${id}.${extension(file.name, file.type)}`;
    const title = String(data.get('title') || file.name).trim().slice(0, 140);
    const description = String(data.get('description') || '').trim().slice(0, 500);
    const placement = String(data.get('placement') || 'library').trim().slice(0, 80);
    const published = data.get('published') === '1';
    const createdAt = new Date().toISOString();
    try {
      await env.MEDIA_BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=3600' },
        customMetadata: { title, placement, published: String(published) }
      });
      const items = await readIndex(env);
      items.unshift({
        id, storage_key: key, original_name: file.name, title, description,
        media_type: mediaType(file.type), mime_type: file.type, size_bytes: file.size,
        placement, published: published ? 1 : 0, uploaded_by: check.state.email,
        created_at: createdAt
      });
      await writeIndex(env, items.slice(0, 1000));
    } catch (error) {
      try { await env.MEDIA_BUCKET.delete(key); } catch {}
      return json({ error: `Cloudflare R2 could not save this upload: ${error.message}`, code: 'R2_UPLOAD_FAILED' }, 502);
    }
    return json({ ok: true, id, key, url: `/media/${key}`, placement, published, note: file.type === 'video/quicktime' ? 'MOV uploaded. MP4 is recommended for playback on every browser.' : '' }, 201);
  }
  if (request.method === 'DELETE') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid delete request.' }, 400); }
    const items = await readIndex(env);
    const item = items.find(entry => entry.id === body.id);
    if (!item) return json({ error: 'Media file not found.' }, 404);
    await env.MEDIA_BUCKET.delete(item.storage_key);
    await writeIndex(env, items.filter(entry => entry.id !== body.id));
    return json({ ok: true });
  }
  return json({ error: 'Method not allowed.' }, 405);
}

async function serveMedia(request, env, pathname) {
  if (!env.MEDIA_BUCKET) return new Response('Media storage is not configured.', { status: 503 });
  const key = decodeURIComponent(pathname.slice('/media/'.length));
  if (!key || key.startsWith('__system/')) return new Response('Not found', { status: 404 });
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=3600');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/api/admin/health' && request.method === 'GET') return health(request, env);
      if (path === '/api/classes' && request.method === 'GET') return publicClasses(env);
      if (path === '/api/class-reservations' && request.method === 'POST') return createClassReservation(request, env);
      if (path === '/api/private-events/inquiries' && request.method === 'POST') return privateEventInquiry(request, env);
      if (path === '/api/private-events/quote' && request.method === 'GET') return publicPrivateQuote(request, env, url);
      if (path === '/api/private-events/respond' && request.method === 'POST') return privateEventRespond(request, env);
      if (path === '/api/admin/classes') return adminClasses(request, env);
      if (path === '/api/admin/bookings' && request.method === 'GET') return adminBookings(request, env);
      if (path === '/api/admin/private-events') return adminPrivateEvents(request, env);
      if (path === '/api/admin/media-status' && request.method === 'GET') return mediaStatus(request, env);
      if (path === '/api/admin/media') return mediaCollection(request, env);
      if (path.startsWith('/media/')) return serveMedia(request, env, path);
      if (path.startsWith('/api/')) return json({ error: 'This API feature is not connected in the free pilot yet.' }, 404);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (path.startsWith('/api/')) return json({ error: 'Server error', detail: error.message }, 500);
      return new Response('Boot Scootin’ is temporarily unavailable.', { status: 500 });
    }
  }
};
