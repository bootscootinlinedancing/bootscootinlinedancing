const INDEX_KEY = '__system/media-index.json';
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
    pragma: 'no-cache'
  }
});

const decodeAccessJwtEmail = token => {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const data = JSON.parse(atob(padded));
    return String(data.email || data.common_name || data.sub || '').trim();
  } catch { return ''; }
};
const accessCookieToken = request => {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
};
const accessEmail = request =>
  request.headers.get('Cf-Access-Authenticated-User-Email') ||
  decodeAccessJwtEmail(request.headers.get('Cf-Access-Jwt-Assertion')) ||
  decodeAccessJwtEmail(accessCookieToken(request)) ||
  '';
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
      poster_url TEXT,
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
      provider_transaction_code TEXT,
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
    `CREATE TABLE IF NOT EXISTS merch_orders (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      design TEXT NOT NULL,
      fit TEXT NOT NULL CHECK(fit IN ('unisex','womens')),
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 4),
      unit_price_pence INTEGER NOT NULL,
      amount_pence INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      status TEXT NOT NULL DEFAULT 'PENDING',
      provider_checkout_id TEXT,
      provider_transaction_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TEXT
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
    `CREATE TABLE IF NOT EXISTS oauth_connections (
      provider TEXT PRIMARY KEY,
      access_token_cipher TEXT NOT NULL,
      refresh_token_cipher TEXT,
      expires_at TEXT,
      scope TEXT,
      merchant_code TEXT,
      connected_by TEXT,
      connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      actor TEXT,
      expires_at TEXT NOT NULL,
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

    `CREATE TABLE IF NOT EXISTS member_profiles (
      id TEXT PRIMARY KEY,
      customer_id TEXT UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      display_name TEXT,
      trail_rank TEXT NOT NULL DEFAULT 'First Steps',
      boot_points INTEGER NOT NULL DEFAULT 0 CHECK(boot_points >= 0),
      classes_attended INTEGER NOT NULL DEFAULT 0 CHECK(classes_attended >= 0),
      current_streak INTEGER NOT NULL DEFAULT 0 CHECK(current_streak >= 0),
      whos_going_opt_in INTEGER NOT NULL DEFAULT 0,
      profile_visibility TEXT NOT NULL DEFAULT 'private' CHECK(profile_visibility IN ('private','nora_only','members')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS points_ledger (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member_profiles(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      reason_code TEXT NOT NULL,
      description TEXT,
      source_type TEXT,
      source_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      points_bonus INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS member_achievements (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member_profiles(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL REFERENCES achievements(id),
      earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      source_type TEXT,
      source_id TEXT,
      UNIQUE(member_id,achievement_id)
    )`,
    `CREATE TABLE IF NOT EXISTS reward_catalog (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      points_cost INTEGER NOT NULL CHECK(points_cost > 0),
      stock_limit INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      reward_type TEXT NOT NULL DEFAULT 'perk'
    )`,
    `CREATE TABLE IF NOT EXISTS reward_redemptions (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member_profiles(id) ON DELETE CASCADE,
      reward_id TEXT NOT NULL REFERENCES reward_catalog(id),
      points_spent INTEGER NOT NULL CHECK(points_spent > 0),
      status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','APPROVED','FULFILLED','CANCELLED')),
      requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fulfilled_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_points_member_created ON points_ledger(member_id,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_member_achievements_member ON member_achievements(member_id,earned_at)`,
    `CREATE INDEX IF NOT EXISTS idx_reward_redemptions_member ON reward_redemptions(member_id,requested_at)`,

    `CREATE INDEX IF NOT EXISTS idx_holds_class_expiry ON booking_holds(class_id, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_class_status ON bookings(class_id,status)`,
    `CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code_prefix TEXT, discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENT','FIXED','FREE')),
      discount_value INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, max_uses INTEGER, uses_per_customer INTEGER NOT NULL DEFAULT 1,
      applicable_class_id TEXT, personal_only INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS promotion_codes (
      id TEXT PRIMARY KEY, promotion_id TEXT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE, code TEXT NOT NULL UNIQUE, customer_email TEXT,
      issued_reason TEXT, issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT, max_uses INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS promotion_redemptions (
      id TEXT PRIMARY KEY, promotion_code_id TEXT NOT NULL REFERENCES promotion_codes(id), booking_id TEXT NOT NULL REFERENCES bookings(id),
      customer_email TEXT NOT NULL, discount_pence INTEGER NOT NULL DEFAULT 0, redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(promotion_code_id,booking_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promotion_codes(code)`,
    `CREATE INDEX IF NOT EXISTS idx_promo_redemptions_code ON promotion_redemptions(promotion_code_id)`,
    `CREATE TABLE IF NOT EXISTS notification_log (
      id TEXT PRIMARY KEY,
      booking_id TEXT,
      class_id TEXT,
      event_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      provider_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT,
      UNIQUE(booking_id,event_type,channel)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notification_booking ON notification_log(booking_id,event_type)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(customer_email)`,
    `CREATE INDEX IF NOT EXISTS idx_waiting_class_status ON waiting_list(class_id,status)`,
    `CREATE INDEX IF NOT EXISTS idx_private_event_status ON private_event_inquiries(status,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_private_event_token ON private_event_inquiries(secure_token)`,
    `CREATE INDEX IF NOT EXISTS idx_private_quote_inquiry ON private_event_quotes(inquiry_id,version)`,
    `CREATE TABLE IF NOT EXISTS customer_crm_profiles (
      customer_key TEXT PRIMARY KEY,
      birthday TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      emergency_contact_relationship TEXT,
      medical_notes TEXT,
      instructor_notes_summary TEXT,
      loyalty_adjustment INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customer_crm_notes (
      id TEXT PRIMARY KEY,
      customer_key TEXT NOT NULL,
      note_text TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customer_crm_tags (
      customer_key TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(customer_key,tag)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_customer_crm_notes_key ON customer_crm_notes(customer_key,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_customer_crm_tags_key ON customer_crm_tags(customer_key)`
  ];
  for (const statement of statements) await env.BOOKINGS_DB.prepare(statement).run();

  // V86 booking self-service and cancellation fields. D1 does not support
  // ADD COLUMN IF NOT EXISTS, so each migration is attempted safely.
  const migrations = [
    `ALTER TABLE bookings ADD COLUMN secure_token TEXT`,
    `ALTER TABLE bookings ADD COLUMN customer_token TEXT`,
    `ALTER TABLE bookings ADD COLUMN terms_accepted_at TEXT`,
    `ALTER TABLE bookings ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE bookings ADD COLUMN cancellation_requested_at TEXT`,
    `ALTER TABLE bookings ADD COLUMN cancellation_band TEXT`,
    `ALTER TABLE bookings ADD COLUMN refund_status TEXT`,
    `ALTER TABLE bookings ADD COLUMN refund_amount_pence INTEGER`,
    `ALTER TABLE bookings ADD COLUMN admin_notes TEXT`,
    `ALTER TABLE bookings ADD COLUMN provider_transaction_code TEXT`,
    `ALTER TABLE bookings ADD COLUMN original_amount_pence INTEGER`,
    `ALTER TABLE bookings ADD COLUMN discount_pence INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE bookings ADD COLUMN promo_code TEXT`,
    `ALTER TABLE waiting_list ADD COLUMN secure_token TEXT`,
    `ALTER TABLE merch_orders ADD COLUMN fulfilment_method TEXT NOT NULL DEFAULT 'collection'`,
    `ALTER TABLE merch_orders ADD COLUMN delivery_address TEXT`,
    `ALTER TABLE merch_orders ADD COLUMN delivery_pence INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE merch_orders ADD COLUMN fulfilment_status TEXT NOT NULL DEFAULT 'NEW'`,
    `ALTER TABLE merch_orders ADD COLUMN confirmation_email_sent_at TEXT`,
    `ALTER TABLE merch_orders ADD COLUMN fulfilment_email_sent_at TEXT`,
    `ALTER TABLE classes ADD COLUMN poster_url TEXT`
  ];
  for (const migration of migrations) {
    try { await env.BOOKINGS_DB.prepare(migration).run(); } catch (_) {}
  }
  try { await env.BOOKINGS_DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_secure_token ON bookings(secure_token)`).run(); } catch (_) {}
  try { await env.BOOKINGS_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_booking_customer_token ON bookings(customer_token)`).run(); } catch (_) {}
  try { await env.BOOKINGS_DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_secure_token ON waiting_list(secure_token)`).run(); } catch (_) {}
  await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO venues(id,name,location,capacity) VALUES
    ('ecc','Edgbaston Community Centre','Birmingham',20),
    ('low-places','Low Places','Birmingham',50)`).run();
  await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO classes
    (id,title,venue,location,starts_at,ends_at,price_pence,capacity,sold,status,level,public_notes) VALUES
    ('ecc-2026-08-07','Beginner Line Dancing','Edgbaston Community Centre','Birmingham','2026-08-07T19:30:00+01:00','2026-08-07T20:30:00+01:00',600,20,0,'open','Beginner friendly','No partner needed. Comfortable footwear recommended.'),
    ('low-2026-08-14','Class & Social Dancing','Low Places','Birmingham','2026-08-14T19:15:00+01:00','2026-08-14T21:00:00+01:00',600,50,0,'open','Beginner friendly','Warm-up from 7:15pm, class 7:30–8:30pm and social requests until 9pm.'),
    ('ecc-2026-08-21','Beginner Line Dancing','Edgbaston Community Centre','Birmingham','2026-08-21T19:30:00+01:00','2026-08-21T20:30:00+01:00',600,20,0,'open','Beginner friendly','No partner needed. Come alone and leave smiling.'),
    ('low-2026-08-26','Boot Scootin’ Special','Low Places','Birmingham','2026-08-26T19:15:00+01:00','2026-08-26T21:00:00+01:00',600,50,0,'open','All levels','A special midweek class and social dancing session.')`).run();

  await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO achievements(id,title,description,icon,category,points_bonus) VALUES
    ('first-class','Hay Bale Hopper','Attend your first Boot Scootin’ class','🌾','attendance',0),
    ('five-classes','Rookie Cowgirl','Attend five classes','🤠','attendance',0),
    ('ten-classes','Trail Rider','Attend ten classes','🌵','attendance',0),
    ('fireball-survivor','Fireball Survivor','Complete Fireball without stopping','🔥','dance',0),
    ('festival-friend','Festival Friend','Join a Boot Scootin’ festival meetup','🎪','community',0),
    ('butterfly-season','Butterfly Season','Complete the Spring Steps challenge','🦋','seasonal',0)
  `).run();
  await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO reward_catalog(id,title,description,points_cost,reward_type) VALUES
    ('dance-vote','Dance Request Vote','Vote in a future class dance poll',50,'vote'),
    ('class-credit-5','£5 Class Credit','£5 credit towards a standard class',100,'credit'),
    ('free-class','Free Standard Class','One standard class place, subject to availability',120,'class'),
    ('mystery-reward','Mystery Trail Reward','A surprise Boot Scootin’ perk',150,'physical'),
    ('bring-friend','Bring a Friend','Bring one new friend to a standard class',400,'class'),
    ('legend-reward','Boot Scootin’ Legend Reward','Hall of Fame recognition and a special celebration perk',1000,'milestone')
  `).run();

  const row = await env.BOOKINGS_DB.prepare("SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").first();
  return Number(row?.tables || 0);
}

async function publicClasses(env) {
  if (!env.BOOKINGS_DB) return json({ error: 'Booking database is not connected.' }, 503);
  try {
    await ensureBookingSchema(env);
    const now = new Date().toISOString();
    const { results } = await env.BOOKINGS_DB.prepare(`
      SELECT c.id,c.title,c.venue,c.location,c.starts_at,c.ends_at,c.price_pence,c.capacity,
      COALESCE((
        SELECT SUM(b.quantity)
        FROM bookings b
        WHERE b.class_id=c.id AND b.status='PAID'
      ),0) AS sold,
      c.status,c.level,c.public_notes,c.poster_url,
      MAX(
        0,
        c.capacity
        - COALESCE((
            SELECT SUM(b.quantity)
            FROM bookings b
            WHERE b.class_id=c.id AND b.status='PAID'
          ),0)
        - COALESCE((
            SELECT SUM(h.quantity)
            FROM booking_holds h
            WHERE h.class_id=c.id AND h.expires_at>?
          ),0)
      ) AS spaces_remaining
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

function sumUpConfigured(env) {
  return Boolean(String(env.SUMUP_API_KEY || '').trim() && String(env.SUMUP_MERCHANT_CODE || '').trim());
}

async function sumUpFetch(env, pathname, options = {}, timeoutMs = 10000) {
  const key = String(env.SUMUP_API_KEY || '').trim();
  if (!key) throw new Error('SUMUP_API_KEY is not configured.');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${key}`);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('SUMUP_TIMEOUT'), Math.max(1000, Number(timeoutMs) || 10000));
  try {
    return await fetch(`https://api.sumup.com${pathname}`, { ...options, headers, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error('SumUp did not respond within 10 seconds. No booking record was changed. Check the payment in SumUp before trying again.');
      timeoutError.code = 'SUMUP_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeSumUpTransactionId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value, 180));
}

async function resolveSumUpTransactionId(env, booking) {
  let transactionId = clean(booking?.provider_transaction_id, 180);
  if (looksLikeSumUpTransactionId(transactionId)) return transactionId;

  const checkoutId = clean(booking?.provider_checkout_id, 180);
  if (checkoutId) {
    const checkout = await retrieveSumUpCheckout(env, checkoutId);
    const resolved = checkoutTransactionId(checkout);
    if (resolved) {
      transactionId = clean(resolved, 180);
      await env.BOOKINGS_DB.prepare(
        `UPDATE bookings SET provider_transaction_id=? WHERE id=?`
      ).bind(transactionId, booking.id).run();
    }
  }

  if (!looksLikeSumUpTransactionId(transactionId)) {
    throw new Error('The SumUp transaction UUID could not be found. Refresh the booking payment status and try again.');
  }
  return transactionId;
}

const SUMUP_OAUTH_PROVIDER = 'sumup';
const DEFAULT_SUMUP_OAUTH_REDIRECT_URI = 'https://bootscootinlinedancing.co.uk/api/sumup/callback';

function sumUpOAuthConfig(env) {
  const clientId = clean(env.SUMUP_OAUTH_CLIENT_ID, 500);
  const clientSecret = clean(env.SUMUP_OAUTH_CLIENT_SECRET, 1000);
  // A dedicated encryption key is preferred. For simpler first-time setup,
  // derive the token-encryption key from the OAuth client secret when the
  // optional SUMUP_OAUTH_ENCRYPTION_KEY secret has not been added.
  const encryptionKey = clean(env.SUMUP_OAUTH_ENCRYPTION_KEY, 1000) || clientSecret;
  const redirectUri = clean(env.SUMUP_OAUTH_REDIRECT_URI, 1000) || DEFAULT_SUMUP_OAUTH_REDIRECT_URI;
  // Always request the permissions HQ needs. An older SUMUP_OAUTH_SCOPES value
  // must not be able to silently remove the payments permission.
  const requestedScopes = new Set(
    `${clean(env.SUMUP_OAUTH_SCOPES, 500)} transactions.history user.profile_readonly payments`
      .split(/\s+/)
      .map(value => value.trim())
      .filter(Boolean)
  );
  const scope = [...requestedScopes].join(' ');
  return {
    clientId,
    clientSecret,
    encryptionKey,
    redirectUri,
    scope,
    ready: Boolean(clientId && clientSecret && encryptionKey)
  };
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

async function sumUpOAuthCryptoKey(env) {
  const secret = sumUpOAuthConfig(env).encryptionKey;
  if (!secret) throw new Error('SUMUP_OAUTH_ENCRYPTION_KEY is not configured.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptOAuthSecret(env, value) {
  if (!value) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await sumUpOAuthCryptoKey(env);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(value))));
  return `${bytesToBase64(iv)}.${bytesToBase64(encrypted)}`;
}

async function decryptOAuthSecret(env, value) {
  if (!value) return '';
  const [ivPart, cipherPart] = String(value).split('.');
  if (!ivPart || !cipherPart) throw new Error('Stored SumUp OAuth token is invalid. Reconnect SumUp.');
  const key = await sumUpOAuthCryptoKey(env);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivPart) }, key, base64ToBytes(cipherPart));
  return new TextDecoder().decode(decrypted);
}

async function readSumUpOAuthConnection(env) {
  await ensureBookingSchema(env);
  return env.BOOKINGS_DB.prepare(`SELECT * FROM oauth_connections WHERE provider=?`).bind(SUMUP_OAUTH_PROVIDER).first();
}

async function saveSumUpOAuthConnection(env, tokenData, actor = '') {
  const expiresIn = Math.max(60, Number(tokenData.expires_in || 3600));
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const previous = await readSumUpOAuthConnection(env);
  const refreshToken = clean(tokenData.refresh_token, 4096) || (previous ? await decryptOAuthSecret(env, previous.refresh_token_cipher).catch(() => '') : '');
  const accessCipher = await encryptOAuthSecret(env, clean(tokenData.access_token, 4096));
  const refreshCipher = refreshToken ? await encryptOAuthSecret(env, refreshToken) : '';
  await env.BOOKINGS_DB.prepare(`
    INSERT INTO oauth_connections(provider,access_token_cipher,refresh_token_cipher,expires_at,scope,merchant_code,connected_by,connected_at,updated_at)
    VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(provider) DO UPDATE SET
      access_token_cipher=excluded.access_token_cipher,
      refresh_token_cipher=excluded.refresh_token_cipher,
      expires_at=excluded.expires_at,
      scope=excluded.scope,
      merchant_code=COALESCE(excluded.merchant_code,oauth_connections.merchant_code),
      connected_by=excluded.connected_by,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    SUMUP_OAUTH_PROVIDER,
    accessCipher,
    refreshCipher || null,
    expiresAt,
    clean(tokenData.scope, 500),
    clean(tokenData.merchant_code, 120) || null,
    clean(actor, 320)
  ).run();
  return { expiresAt, refreshToken: Boolean(refreshToken) };
}

async function exchangeSumUpOAuthToken(env, form) {
  const config = sumUpOAuthConfig(env);
  if (!config.ready) throw new Error('SumUp OAuth client settings are incomplete in Cloudflare.');
  const response = await fetch('https://api.sumup.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      ...form,
      client_id: config.clientId,
      client_secret: config.clientSecret
    })
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok || !data.access_token) {
    const detail = clean(data.error_description || data.error || raw || `HTTP ${response.status}`, 400);
    const error = new Error(`SumUp OAuth failed: ${detail}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function getSumUpOAuthAccessToken(env) {
  const legacy = clean(env.SUMUP_REFUND_ACCESS_TOKEN || env.SUMUP_OAUTH_ACCESS_TOKEN, 4096);
  if (legacy) return legacy;
  const connection = await readSumUpOAuthConnection(env);
  if (!connection) return '';
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 120000) return decryptOAuthSecret(env, connection.access_token_cipher);
  const refreshToken = await decryptOAuthSecret(env, connection.refresh_token_cipher).catch(() => '');
  if (!refreshToken) return '';
  try {
    const tokenData = await exchangeSumUpOAuthToken(env, { grant_type: 'refresh_token', refresh_token: refreshToken });
    await saveSumUpOAuthConnection(env, tokenData, connection.connected_by || 'oauth-refresh');
    return clean(tokenData.access_token, 4096);
  } catch (error) {
    await env.BOOKINGS_DB.prepare(`DELETE FROM oauth_connections WHERE provider=?`).bind(SUMUP_OAUTH_PROVIDER).run().catch(() => {});
    throw error;
  }
}

async function sumUpOAuthStatus(env) {
  const config = sumUpOAuthConfig(env);
  const legacy = Boolean(clean(env.SUMUP_REFUND_ACCESS_TOKEN || env.SUMUP_OAUTH_ACCESS_TOKEN, 4096));
  let connection = null;
  try { connection = await readSumUpOAuthConnection(env); } catch {}
  const grantedScope = clean(connection?.scope, 500);
  const grantedScopes = grantedScope.split(/\s+/).filter(Boolean);
  const requestedScopes = config.scope.split(/\s+/).filter(Boolean);
  const paymentsGranted = legacy || grantedScopes.includes('payments');
  return {
    automatic: legacy || Boolean(connection),
    mode: legacy ? 'legacy-token' : connection ? 'oauth' : 'manual',
    configured: config.ready,
    connected: legacy || Boolean(connection),
    refund_ready: Boolean((legacy || connection) && paymentsGranted),
    payments_scope_granted: paymentsGranted,
    requested_scope: config.scope,
    requested_scopes: requestedScopes,
    granted_scope: grantedScope,
    granted_scopes: grantedScopes,
    redirect_uri: config.redirectUri,
    expires_at: connection?.expires_at || null,
    connected_at: connection?.connected_at || null,
    merchant_code: connection?.merchant_code || clean(env.SUMUP_MERCHANT_CODE, 120) || null,
    missing: [
      !config.clientId ? 'SUMUP_OAUTH_CLIENT_ID' : '',
      !config.clientSecret ? 'SUMUP_OAUTH_CLIENT_SECRET' : ''
    ].filter(Boolean)
  };
}

async function sumUpOAuthStart(request, env) {
  const check = requireAccessAdmin(request, env);
  if (check.response) return check.response;
  await ensureBookingSchema(env);
  const requestUrl = new URL(request.url);
  const fresh = requestUrl.searchParams.get('fresh') === '1';
  if (fresh) {
    // Remove the locally stored grant before starting a new authorisation-code
    // flow. This guarantees HQ does not continue using an older token while
    // SumUp is being asked for the expanded scope set.
    await env.BOOKINGS_DB.prepare(`DELETE FROM oauth_connections WHERE provider=?`).bind(SUMUP_OAUTH_PROVIDER).run().catch(() => {});
  }
  const config = sumUpOAuthConfig(env);
  if (!config.ready) {
    return json({ error: 'Add the SumUp OAuth Client ID, Client Secret and encryption key in Cloudflare before connecting.', missing: (await sumUpOAuthStatus(env)).missing }, 409);
  }
  const state = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  await env.BOOKINGS_DB.prepare(`DELETE FROM oauth_states WHERE expires_at < CURRENT_TIMESTAMP`).run();
  await env.BOOKINGS_DB.prepare(`INSERT INTO oauth_states(state,provider,actor,expires_at) VALUES(?,?,?,datetime('now','+10 minutes'))`)
    .bind(state, SUMUP_OAUTH_PROVIDER, check.state.email).run();
  const authorize = new URL('https://api.sumup.com/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', config.clientId);
  authorize.searchParams.set('redirect_uri', config.redirectUri);
  authorize.searchParams.set('scope', config.scope);
  authorize.searchParams.set('state', state);
  return Response.redirect(authorize.toString(), 302);
}

async function sumUpOAuthCallback(request, env, url) {
  await ensureBookingSchema(env);
  const config = sumUpOAuthConfig(env);
  const stateValue = clean(url.searchParams.get('state'), 300);
  const code = clean(url.searchParams.get('code'), 2000);
  const oauthError = clean(url.searchParams.get('error_description') || url.searchParams.get('error'), 500);
  const failureRedirect = message => Response.redirect(`https://bootscootinlinedancing.co.uk/ranch.html?sumup=error&message=${encodeURIComponent(clean(message, 300))}#bookings`, 302);
  if (oauthError) return failureRedirect(oauthError);
  if (!stateValue || !code) return failureRedirect('SumUp did not return a valid authorisation code.');
  const stateRow = await env.BOOKINGS_DB.prepare(`SELECT * FROM oauth_states WHERE state=? AND provider=? AND expires_at >= CURRENT_TIMESTAMP`)
    .bind(stateValue, SUMUP_OAUTH_PROVIDER).first();
  if (!stateRow) return failureRedirect('The SumUp connection request expired or could not be verified. Please try again.');
  await env.BOOKINGS_DB.prepare(`DELETE FROM oauth_states WHERE state=?`).bind(stateValue).run();
  try {
    const tokenData = await exchangeSumUpOAuthToken(env, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri
    });
    let merchantCode = clean(env.SUMUP_MERCHANT_CODE, 120);
    try {
      const me = await fetch('https://api.sumup.com/v0.1/me', { headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' } });
      const profile = await me.json().catch(() => ({}));
      merchantCode = clean(profile.merchant_code || profile.merchant_profile?.merchant_code || merchantCode, 120);
    } catch {}
    await saveSumUpOAuthConnection(env, { ...tokenData, merchant_code: merchantCode }, stateRow.actor || 'hq');
    const grantedScopes = clean(tokenData.scope, 500).split(/\s+/).filter(Boolean);
    const paymentsGranted = grantedScopes.includes('payments');
    await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`)
      .bind(stateRow.actor || 'hq', 'SUMUP_OAUTH_CONNECTED', 'integration', 'sumup', JSON.stringify({ merchant_code: merchantCode, scope: tokenData.scope || '', requested_scope: config.scope, payments_granted: paymentsGranted })).run().catch(() => {});
    const result = paymentsGranted ? 'connected' : 'scope-missing';
    return Response.redirect(`https://bootscootinlinedancing.co.uk/ranch.html?sumup=${result}#bookings`, 302);
  } catch (error) {
    return failureRedirect(error.message || 'SumUp could not be connected.');
  }
}

async function sumUpOAuthAdmin(request, env) {
  const check = requireAccessAdmin(request, env);
  if (check.response) return check.response;
  await ensureBookingSchema(env);
  if (request.method === 'GET') return json(await sumUpOAuthStatus(env));
  if (request.method === 'DELETE' || request.method === 'POST') {
    await env.BOOKINGS_DB.prepare(`DELETE FROM oauth_connections WHERE provider=?`).bind(SUMUP_OAUTH_PROVIDER).run();
    await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`)
      .bind(check.state.email, 'SUMUP_OAUTH_DISCONNECTED', 'integration', 'sumup', '{}').run().catch(() => {});
    return json({ ok: true, connected: false });
  }
  return json({ error: 'Method not allowed.' }, 405);
}

async function refundSumUpTransaction(env, transactionId, amountPence = null) {
  const transaction = clean(transactionId, 180);
  if (!looksLikeSumUpTransactionId(transaction)) {
    const error = new Error('A valid SumUp transaction UUID could not be found for this payment.');
    error.code = 'SUMUP_TRANSACTION_NOT_FOUND';
    throw error;
  }

  // SumUp transaction refunds require a user-authorised OAuth token. The API key
  // used to create/retrieve hosted checkouts is intentionally not reused here.
  const refundToken = await getSumUpOAuthAccessToken(env);
  if (!refundToken) {
    const error = new Error('Automatic refunds are not connected yet. Open HQ and use Connect SumUp refunds, or complete the refund in SumUp and then record it in HQ.');
    error.code = 'SUMUP_REFUND_OAUTH_REQUIRED';
    error.status = 409;
    throw error;
  }

  const headers = new Headers({
    'Authorization': `Bearer ${refundToken}`,
    'Accept': 'application/json'
  });
  const options = { method: 'POST', headers };
  if (amountPence !== null) {
    const amount = Number(amountPence);
    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error('Refund amount must be greater than zero.');
      error.code = 'INVALID_REFUND_AMOUNT';
      throw error;
    }
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify({ amount: Number((amount / 100).toFixed(2)) });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(`https://api.sumup.com/v0.1/me/refund/${encodeURIComponent(transaction)}`, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    const failure = new Error(controller.signal.aborted
      ? 'SumUp did not respond within 10 seconds. No booking record was changed. Check SumUp before trying again.'
      : `SumUp could not be reached: ${clean(error && error.message ? error.message : error, 220)}`);
    failure.code = controller.signal.aborted ? 'SUMUP_REFUND_TIMEOUT' : 'SUMUP_REFUND_NETWORK_ERROR';
    failure.status = 502;
    throw failure;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let raw = '';
    try { raw = await response.text(); } catch (_) {}
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch (_) {}
    const detail = clean(
      payload && (payload.message || payload.error_message || payload.error || payload.detail)
        ? (payload.message || payload.error_message || payload.error || payload.detail)
        : (raw || `HTTP ${response.status}`),
      300
    );
    const authHint = response.status === 401 || response.status === 403
      ? ' The refund token must come from SumUp’s authorisation-code OAuth flow and include transaction permissions.'
      : '';
    const failure = new Error(`SumUp refund failed: ${detail}${authHint}`);
    failure.code = response.status === 401 || response.status === 403 ? 'SUMUP_REFUND_NOT_AUTHORISED' : 'SUMUP_REFUND_REJECTED';
    failure.status = response.status;
    throw failure;
  }

  return { ok: true, status: response.status };
}

async function checkSumUpConnection(env) {
  if (!sumUpConfigured(env)) {
    return { ready: false, status: 'setup', message: 'Add SUMUP_API_KEY and SUMUP_MERCHANT_CODE in Cloudflare.' };
  }
  try {
    const response = await sumUpFetch(env, '/v0.1/me', { method: 'GET' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ready: false, status: 'attention', message: `SumUp rejected the configured API key (HTTP ${response.status}).` };
    }
    const configuredCode = String(env.SUMUP_MERCHANT_CODE).trim().toUpperCase();
    const returnedCode = String(data.merchant_code || data.merchant_profile?.merchant_code || '').trim().toUpperCase();
    if (returnedCode && returnedCode !== configuredCode) {
      return { ready: false, status: 'attention', message: 'The SumUp API key belongs to a different merchant account than SUMUP_MERCHANT_CODE.' };
    }
    return {
      ready: true,
      status: 'test_mode',
      message: `SumUp sandbox connection verified for merchant ${configuredCode}. No real money is processed in sandbox.`
    };
  } catch (error) {
    return { ready: false, status: 'attention', message: `SumUp connection test failed: ${error.message}` };
  }
}


function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}


const SITE_ORIGIN = 'https://bootscootinlinedancing.co.uk';
const BRAND_LOGO_URL = `${SITE_ORIGIN}/brand-logo-v60.webp`;
const BRAND_SOCIALS = {
  website: SITE_ORIGIN,
  instagram: 'https://www.instagram.com/boot.scootin.linedancing/',
  whatsapp: 'https://chat.whatsapp.com/FpM532ZPN6VJHwotIaaCRM'
};

function londonDateParts(value) {
  if (!value) return { date: '', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  return {
    date: date.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'Europe/London' }),
    time: date.toLocaleTimeString('en-GB', { hour:'numeric', minute:'2-digit', hour12:true, timeZone:'Europe/London' }).replace(/\s/g, ' ').toLowerCase()
  };
}

function emailButton(label, href, secondary=false) {
  if (!href) return '';
  const background = secondary ? '#fff8ed' : '#a71924';
  const colour = secondary ? '#a71924' : '#ffffff';
  const border = secondary ? '2px solid #a71924' : '2px solid #a71924';
  return `<a href="${htmlEscape(href)}" style="display:inline-block;margin:6px 8px 6px 0;padding:13px 18px;background:${background};color:${colour};border:${border};text-decoration:none;font-weight:700;border-radius:3px">${htmlEscape(label)}</a>`;
}

function emailSocialFooter(unsubscribeUrl='') {
  return `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #d8c3a5;font-size:13px;color:#705f55">
    <p style="margin:0 0 12px"><a href="${BRAND_SOCIALS.website}" style="color:#a71924">Website</a> &nbsp;·&nbsp; <a href="${BRAND_SOCIALS.instagram}" style="color:#a71924">Instagram</a> &nbsp;·&nbsp; <a href="${BRAND_SOCIALS.whatsapp}" style="color:#a71924">WhatsApp Community</a></p>
    <p style="margin:0">You are receiving this because you booked with Boot Scootin’ or joined the mailing list.${unsubscribeUrl ? ` <a href="${htmlEscape(unsubscribeUrl)}" style="color:#a71924">Unsubscribe from marketing emails</a>.` : ''}</p>
  </div>`;
}

function bookingActionLinks(booking) {
  const calendar = booking.secure_token ? `${SITE_ORIGIN}/api/booking-calendar?token=${encodeURIComponent(booking.secure_token)}` : '';
  const manage = booking.secure_token ? `${SITE_ORIGIN}/booking-confirmation.html?reference=${encodeURIComponent(booking.reference || '')}&token=${encodeURIComponent(booking.secure_token)}&customer=${encodeURIComponent(booking.customer_token || '')}` : `${SITE_ORIGIN}/my-bookings.html`;
  const location = [booking.venue, booking.location].filter(Boolean).join(', ');
  const directions = location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : '';
  const start = booking.starts_at ? new Date(booking.starts_at) : null;
  const end = booking.ends_at ? new Date(booking.ends_at) : (start ? new Date(start.getTime()+3600000) : null);
  const gdate = d => d ? d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z') : '';
  const google = start ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(booking.class_title || booking.title || 'Boot Scootin’ class')}&dates=${gdate(start)}/${gdate(end)}&location=${encodeURIComponent(location)}&details=${encodeURIComponent(`Boot Scootin’ booking ${booking.reference || ''}`)}` : '';
  return { calendar, manage, directions, google };
}

function brandedEmailHtml({ heading, greeting='', paragraphs=[], detail='', buttons=[], unsubscribeUrl='' }) {
  const paragraphHtml = paragraphs.filter(Boolean).map(text => `<p style="font-size:17px;line-height:1.65;margin:0 0 18px">${htmlEscape(text)}</p>`).join('');
  const buttonHtml = buttons.map(button => emailButton(button.label, button.href, button.secondary)).join('');
  return `<div style="background:#f2eadc;padding:24px 10px;font-family:Arial,sans-serif;color:#211515">
    <div style="max-width:640px;margin:auto;background:#fff8ed;border-top:8px solid #c6232c;padding:30px;box-sizing:border-box">
      <img src="${BRAND_LOGO_URL}" alt="Boot Scootin’ Line Dancing" width="180" style="display:block;max-width:180px;height:auto;margin:0 0 22px">
      <h1 style="font-size:29px;line-height:1.2;margin:0 0 22px;color:#211515">${htmlEscape(heading)}</h1>
      ${greeting ? `<p style="font-size:18px;margin:0 0 22px">${htmlEscape(greeting)}</p>` : ''}
      ${paragraphHtml}
      ${detail ? `<div style="border-left:5px solid #a71924;background:#f7ead5;padding:15px 16px;margin:22px 0;font-size:16px;line-height:1.55">${htmlEscape(detail)}</div>` : ''}
      ${buttonHtml ? `<div style="margin:24px 0">${buttonHtml}</div>` : ''}
      <p style="font-size:17px;line-height:1.6;margin:24px 0 0">Nora<br><strong>Boot Scootin’ Line Dancing</strong></p>
      ${emailSocialFooter(unsubscribeUrl)}
    </div>
  </div>`;
}

function emailSender(env, type='general') {
  const senders = {
    general: String(env.EMAIL_FROM_GENERAL || env.EMAIL_FROM || '').trim(),
    bookings: String(env.EMAIL_FROM_BOOKINGS || env.EMAIL_FROM_GENERAL || env.EMAIL_FROM || '').trim(),
    events: String(env.EMAIL_FROM_EVENTS || env.EMAIL_FROM_GENERAL || env.EMAIL_FROM || '').trim(),
    members: String(env.EMAIL_FROM_MEMBERS || env.EMAIL_FROM_GENERAL || env.EMAIL_FROM || '').trim()
  };
  return senders[type] || senders.general;
}

function notificationConfig(env) {
  return {
    emailReady: Boolean(String(env.RESEND_API_KEY || env.EMAIL_API_KEY || '').trim() && emailSender(env, 'general')),
    smsReady: Boolean(String(env.TWILIO_ACCOUNT_SID || '').trim() && String(env.TWILIO_AUTH_TOKEN || '').trim() && (String(env.TWILIO_FROM_NUMBER || '').trim() || String(env.TWILIO_MESSAGING_SERVICE_SID || '').trim()))
  };
}

function normaliseUkPhone(value) {
  let phone = String(value || '').replace(/[^\d+]/g, '');
  if (!phone) return '';
  if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  if (phone.startsWith('0')) phone = '+44' + phone.slice(1);
  if (!phone.startsWith('+')) phone = '+' + phone;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : '';
}

async function sendTransactionalEmail(env, to, subject, html, text, senderType='general') {
  const apiKey = String(env.RESEND_API_KEY || env.EMAIL_API_KEY || '').trim();
  const from = emailSender(env, senderType);
  if (!apiKey || !from) return { skipped: true, reason: 'Email provider is not configured.' };
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Boot-Scootin-Cloudflare-Worker/93.7.0'
      },
      body: JSON.stringify({ from, to: [to], subject, html, text })
    });
  } catch (error) {
    throw new Error(`Email provider connection failed: ${clean(error?.message || error, 220)}`);
  }
  const raw = await response.text().catch(() => '');
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok) {
    const providerMessage = clean(data?.message || data?.error || raw || `HTTP ${response.status}`, 400);
    throw new Error(`Resend rejected the email (HTTP ${response.status}): ${providerMessage}`);
  }
  return { id: clean(data?.id, 160), from };
}

async function sendTransactionalSms(env, to, body) {
  const accountSid = String(env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(env.TWILIO_FROM_NUMBER || '').trim();
  const messagingServiceSid = String(env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) return { skipped: true, reason: 'SMS provider is not configured.' };
  const phone = normaliseUkPhone(to);
  if (!phone) return { skipped: true, reason: 'No valid mobile number was supplied.' };
  const form = new URLSearchParams({ To: phone, Body: body });
  if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);
  else form.set('From', from);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: form.toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(clean(data?.message || `SMS HTTP ${response.status}`, 240));
  return { id: clean(data?.sid, 160) };
}

function notificationCopy(eventType, booking) {
  const className = booking.class_title || booking.title || 'your Boot Scootin’ class';
  const parts = londonDateParts(booking.starts_at);
  const start = parts.date ? `${parts.date} at ${parts.time}` : '';
  const venue = booking.venue || booking.location || '';
  const amount = `£${(Number(booking.refund_amount_pence || booking.amount_pence || 0) / 100).toFixed(2)}`;
  if (eventType === 'BOOKING_CONFIRMED') return {
    subject: `Booking confirmed — ${className}`,
    text: `Hi ${booking.customer_name}, your booking ${booking.reference} is confirmed for ${className}${start ? ` on ${start}` : ''}${venue ? ` at ${venue}` : ''}. Places: ${booking.quantity}. We can’t wait to dance with you!`,
    heading: 'Your booking is confirmed',
    detail: `Reference ${booking.reference} · ${className}${start ? ` · ${start}` : ''}${venue ? ` · ${venue}` : ''}`
  };
  if (eventType === 'CLASS_CANCELLED') return {
    subject: `Class cancelled — ${className}`,
    text: `Hi ${booking.customer_name}, unfortunately ${className}${start ? ` on ${start}` : ''} has been cancelled. Your booking reference is ${booking.reference}. ${booking.status === 'PAID' ? 'Your refund will be processed and confirmed separately.' : 'No payment will be taken.'}`,
    heading: 'Your class has been cancelled',
    detail: `${className}${start ? ` · ${start}` : ''}. Reference ${booking.reference}.`
  };
  if (eventType === 'BOOKING_CANCELLED') return {
    subject: `Booking cancelled — ${booking.reference}`,
    text: `Hi ${booking.customer_name}, your booking for ${className}${start ? ` on ${start}` : ''} has been cancelled. Reference: ${booking.reference}. ${booking.refund_status === 'REFUNDED' ? 'Your refund has also been processed.' : booking.status === 'CANCELLED' && booking.payment_provider === 'SUMUP' ? 'If a refund is due, it will be confirmed separately.' : 'No further payment will be taken.'}`,
    heading: 'Your booking has been cancelled',
    detail: `${className}${start ? ` · ${start}` : ''} · Reference ${booking.reference}`
  };
  if (eventType === 'REFUND_CONFIRMED') return {
    subject: `Refund confirmed — ${booking.reference}`,
    text: `Hi ${booking.customer_name}, your refund of ${amount} for ${className} has been recorded. Reference: ${booking.reference}. Your bank may take several working days to display the refund.`,
    heading: 'Your refund has been confirmed',
    detail: `${amount} · ${className} · Reference ${booking.reference}`
  };
  if (eventType === 'CLASS_UPDATED') return {
    subject: `Class details updated — ${className}`,
    text: `Hi ${booking.customer_name}, the details for ${className} have changed.${start ? ` The class is now on ${start}.` : ''}${venue ? ` Venue: ${venue}.` : ''} Please check your booking and contact us if you have any questions.`,
    heading: 'Your class details have changed',
    detail: `${className}${start ? ` · ${start}` : ''}${venue ? ` · ${venue}` : ''}`
  };
  if (eventType === 'CLASS_REMINDER_48H') return {
    subject: `Coming up — ${className}`,
    text: `Hi ${booking.customer_name}, this is your reminder that ${className}${start ? ` is on ${start}` : ''}${venue ? ` at ${venue}` : ''}. Your booking reference is ${booking.reference}. We can’t wait to dance with you!`,
    heading: 'Your class is coming up',
    detail: `${className}${start ? ` · ${start}` : ''}${venue ? ` · ${venue}` : ''}`
  };
  if (eventType === 'CLASS_DAY_MORNING') return {
    subject: `Today — ${className}`,
    text: `Hi ${booking.customer_name}, your Boot Scootin’ class is today.${start ? ` Start time: ${start}.` : ''}${venue ? ` Venue: ${venue}.` : ''} Your booking reference is ${booking.reference}. See you on the dance floor!`,
    heading: 'Your class is today',
    detail: `${className}${start ? ` · ${start}` : ''}${venue ? ` · ${venue}` : ''}`
  };
  if (eventType === 'CLASS_REMINDER_24H') return {
    subject: `Tomorrow — ${className}`,
    text: `Hi ${booking.customer_name}, this is your reminder that ${className}${start ? ` is on ${start}` : ''}${venue ? ` at ${venue}` : ''}. Your booking reference is ${booking.reference}. We can’t wait to dance with you!`,
    heading: 'Your class is tomorrow',
    detail: `${className}${start ? ` · ${start}` : ''}${venue ? ` · ${venue}` : ''}`
  };
  if (eventType === 'CLASS_REMINDER_3H') return {
    subject: `Today — ${className}`,
    text: `Hi ${booking.customer_name}, your Boot Scootin’ class starts soon.${start ? ` Start time: ${start}.` : ''}${venue ? ` Venue: ${venue}.` : ''} Your booking reference is ${booking.reference}.`,
    heading: 'Your class starts soon',
    detail: `${className}${start ? ` · ${start}` : ''}${venue ? ` · ${venue}` : ''}`
  };
  if (eventType === 'THANK_YOU_AFTER_CLASS') return {
    subject: `Thank you for dancing with us — ${className}`,
    text: `Hi ${booking.customer_name}, thank you for coming to ${className}. We hope you had a brilliant time. You can view and book upcoming classes through the Boot Scootin’ website.`,
    heading: 'Thank you for dancing with us',
    detail: `${className}${start ? ` · ${start}` : ''}`
  };
  return { subject: 'Boot Scootin’ booking update', text: `Your booking ${booking.reference} has been updated.`, heading: 'Booking update', detail: booking.reference };
}

async function deliverBookingNotification(env, booking, eventType) {
  if (!env.BOOKINGS_DB || !booking?.id) return { email: 'skipped', sms: 'skipped' };
  const copy = notificationCopy(eventType, booking);
  const links = bookingActionLinks(booking);
  const bodyText = copy.text.replace(`Hi ${booking.customer_name}, `, '');
  const buttons = [];
  if (!['CLASS_CANCELLED','BOOKING_CANCELLED','REFUND_CONFIRMED'].includes(eventType)) {
    buttons.push({ label: 'Manage my booking', href: links.manage });
    buttons.push({ label: 'Add to Google Calendar', href: links.google, secondary: true });
    buttons.push({ label: 'Add to Apple / Outlook Calendar', href: links.calendar, secondary: true });
    if (links.directions) buttons.push({ label: 'Get directions', href: links.directions, secondary: true });
  } else {
    buttons.push({ label: 'View my bookings', href: links.manage });
  }
  const html = brandedEmailHtml({
    heading: copy.heading,
    greeting: `Hi ${booking.customer_name},`,
    paragraphs: [bodyText],
    detail: copy.detail,
    buttons
  });
  const channels = [
    { channel: 'EMAIL', recipient: clean(booking.customer_email, 160), send: () => sendTransactionalEmail(env, booking.customer_email, copy.subject, html, copy.text, 'bookings') },
    { channel: 'SMS', recipient: normaliseUkPhone(booking.customer_phone), send: () => sendTransactionalSms(env, booking.customer_phone, copy.text) }
  ];
  const results = {};
  for (const item of channels) {
    if (!item.recipient) { results[item.channel.toLowerCase()] = 'skipped'; continue; }
    const existing = await env.BOOKINGS_DB.prepare(`SELECT status FROM notification_log WHERE booking_id=? AND event_type=? AND channel=?`).bind(booking.id,eventType,item.channel).first();
    if (existing?.status === 'SENT') { results[item.channel.toLowerCase()] = 'already_sent'; continue; }
    const logId = crypto.randomUUID();
    await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO notification_log(id,booking_id,class_id,event_type,channel,recipient,status) VALUES(?,?,?,?,?,?,'PENDING')`).bind(logId,booking.id,booking.class_id,eventType,item.channel,item.recipient).run();
    try {
      const response = await item.send();
      if (response?.skipped) {
        await env.BOOKINGS_DB.prepare(`UPDATE notification_log SET status='SKIPPED',error_message=? WHERE booking_id=? AND event_type=? AND channel=?`).bind(clean(response.reason,240),booking.id,eventType,item.channel).run();
        results[item.channel.toLowerCase()] = 'setup_required';
      } else {
        await env.BOOKINGS_DB.prepare(`UPDATE notification_log SET status='SENT',provider_id=?,sent_at=CURRENT_TIMESTAMP,error_message=NULL WHERE booking_id=? AND event_type=? AND channel=?`).bind(response?.id || null,booking.id,eventType,item.channel).run();
        results[item.channel.toLowerCase()] = 'sent';
      }
    } catch (error) {
      await env.BOOKINGS_DB.prepare(`UPDATE notification_log SET status='FAILED',error_message=? WHERE booking_id=? AND event_type=? AND channel=?`).bind(clean(error?.message || error,240),booking.id,eventType,item.channel).run();
      results[item.channel.toLowerCase()] = 'failed';
    }
  }
  return results;
}

async function bookingWithClass(env, bookingId) {
  return env.BOOKINGS_DB.prepare(`SELECT b.*,c.title class_title,c.starts_at,c.venue,c.location FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.id=?`).bind(bookingId).first();
}


function normalisePromoCode(value){return clean(value,48).toUpperCase().replace(/[^A-Z0-9-]/g,'');}
function promoDiscountPence(promo, subtotal){
  const total=Math.max(0,Number(subtotal)||0), value=Math.max(0,Number(promo?.discount_value)||0);
  if(promo?.discount_type==='FREE') return total;
  if(promo?.discount_type==='PERCENT') return Math.min(total,Math.round(total*Math.min(100,value)/100));
  if(promo?.discount_type==='FIXED') return Math.min(total,value);
  return 0;
}
async function validatePromotion(env,{code,email,classId,subtotal}){
  const normalized=normalisePromoCode(code); if(!normalized)return {valid:false,error:'Enter a promo code.'};
  const row=await env.BOOKINGS_DB.prepare(`SELECT pc.*,p.name promotion_name,p.discount_type,p.discount_value,p.starts_at,p.ends_at,p.max_uses promotion_max_uses,p.uses_per_customer,p.applicable_class_id,p.personal_only,p.active promotion_active FROM promotion_codes pc JOIN promotions p ON p.id=pc.promotion_id WHERE pc.code=?`).bind(normalized).first();
  if(!row||!row.active||!row.promotion_active)return {valid:false,error:'This promo code is not valid.'};
  const now=Date.now(); if(row.starts_at&&new Date(row.starts_at).getTime()>now)return {valid:false,error:'This promo code is not active yet.'};
  if((row.ends_at&&new Date(row.ends_at).getTime()<now)||(row.expires_at&&new Date(row.expires_at).getTime()<now))return {valid:false,error:'This promo code has expired.'};
  if(row.applicable_class_id&&row.applicable_class_id!==classId)return {valid:false,error:'This promo code does not apply to this class.'};
  if(row.customer_email&&String(row.customer_email).toLowerCase()!==String(email||'').toLowerCase())return {valid:false,error:'This personal promo code belongs to another customer.'};
  const codeUses=await env.BOOKINGS_DB.prepare(`SELECT COUNT(*) n FROM promotion_redemptions WHERE promotion_code_id=?`).bind(row.id).first();
  if(Number(codeUses?.n||0)>=Number(row.max_uses||1))return {valid:false,error:'This promo code has already been used.'};
  const customerUses=await env.BOOKINGS_DB.prepare(`SELECT COUNT(*) n FROM promotion_redemptions WHERE promotion_code_id=? AND lower(customer_email)=lower(?)`).bind(row.id,email||'').first();
  if(Number(customerUses?.n||0)>=Number(row.uses_per_customer||1))return {valid:false,error:'You have already used this promo code.'};
  const discount=promoDiscountPence(row,subtotal); if(discount<=0)return {valid:false,error:'This promo code does not reduce this booking.'};
  return {valid:true,code:normalized,promotion_code_id:row.id,promotion_name:row.promotion_name,discount_pence:discount,total_pence:Math.max(0,subtotal-discount),discount_type:row.discount_type,discount_value:row.discount_value};
}
async function issuePersonalPromotion(env,{email,name,type='BIRTHDAY',percent=20,days=30}){
  const normalizedEmail=String(email||'').toLowerCase(); if(!emailOk(normalizedEmail))return null;
  const year=new Date().getFullYear(), prefix=type==='LOYALTY'?'FREE':'HBD';
  const existing=await env.BOOKINGS_DB.prepare(`SELECT pc.* FROM promotion_codes pc JOIN promotions p ON p.id=pc.promotion_id WHERE lower(pc.customer_email)=lower(?) AND pc.issued_reason=? AND strftime('%Y',pc.issued_at)=? ORDER BY pc.issued_at DESC LIMIT 1`).bind(normalizedEmail,type,String(year)).first();
  if(existing)return existing;
  const promotionId=type==='LOYALTY'?'auto-loyalty-free':'auto-birthday-20';
  await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO promotions(id,name,code_prefix,discount_type,discount_value,uses_per_customer,personal_only,active) VALUES(?,?,?,?,?,1,1,1)`).bind(promotionId,type==='LOYALTY'?'Loyalty free class':'Birthday 20% off',prefix,type==='LOYALTY'?'FREE':'PERCENT',type==='LOYALTY'?100:percent).run();
  const safeName=String(name||'DANCER').split(/\s+/)[0].replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,8)||'DANCER';
  const code=`${prefix}-${safeName}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
  const expires=new Date(Date.now()+days*86400000).toISOString();
  const id=crypto.randomUUID();
  await env.BOOKINGS_DB.prepare(`INSERT INTO promotion_codes(id,promotion_id,code,customer_email,issued_reason,expires_at,max_uses,active) VALUES(?,?,?,?,?,?,1,1)`).bind(id,promotionId,code,normalizedEmail,type,expires).run();
  return {id,code,expires_at:expires};
}
async function publicPromoValidate(request,env){
  await ensureBookingSchema(env); const body=await request.json().catch(()=>null); if(!body)return json({error:'The promo code request could not be read.'},400);
  const classRow=await env.BOOKINGS_DB.prepare(`SELECT price_pence FROM classes WHERE id=?`).bind(clean(body.classId,120)).first(); if(!classRow)return json({error:'Choose a class first.'},404);
  const quantity=Math.max(1,Math.min(4,Number(body.quantity)||1)); const subtotal=Number(classRow.price_pence||0)*quantity;
  const result=await validatePromotion(env,{code:body.code,email:clean(body.email,160).toLowerCase(),classId:clean(body.classId,120),subtotal});
  return result.valid?json({ok:true,...result,subtotal_pence:subtotal}):json({error:result.error},400);
}

async function createClassReservation(request, env) {
  if (!env.BOOKINGS_DB) return json({ error: 'Booking database is not connected.' }, 503);
  await ensureBookingSchema(env);

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'The booking request could not be read.' }, 400);

  const name = clean(body.name, 100);
  const email = clean(body.email, 160).toLowerCase();
  const phone = clean(body.phone, 30);
  const classId = clean(body.classId, 120);
  const quantity = Math.max(1, Math.min(4, Number(body.quantity) || 1));
  const requestedWaitlist = clean(body.bookingMode, 20) === 'waitlist';
  const requestedPromoCode = normalisePromoCode(body.promo_code || '');

  if (!name || !emailOk(email) || !classId) {
    return json({ error: 'Please enter your full name, a valid email address and choose a class.' }, 400);
  }
  if (!/\S+\s+\S+/.test(name)) {
    return json({ error: 'Please enter your first name and surname so your booking can be identified correctly.' }, 400);
  }
  if (!body.terms_accepted) {
    return json({ error: 'Please accept the booking and cancellation terms.' }, 400);
  }

  const classRow = await env.BOOKINGS_DB.prepare(
    `SELECT * FROM classes WHERE id=? AND status='open' AND starts_at>?`
  ).bind(classId, new Date().toISOString()).first();

  if (!classRow) return json({ error: 'This class is no longer open for booking.' }, 404);

  const held = await env.BOOKINGS_DB.prepare(
    `SELECT COALESCE(SUM(quantity),0) total FROM booking_holds WHERE class_id=? AND expires_at>?`
  ).bind(classId, new Date().toISOString()).first();

  const spaces = Math.max(
    0,
    Number(classRow.capacity || 0) - Number(classRow.sold || 0) - Number(held?.total || 0)
  );

  const id = crypto.randomUUID();
  const secureToken = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  const customerToken = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  const reference = `BS-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;

  if (requestedWaitlist || spaces < quantity) {
    await env.BOOKINGS_DB.prepare(
      `INSERT INTO waiting_list(id,class_id,customer_name,customer_email,quantity,status,secure_token)
       VALUES(?,?,?,?,?,'WAITING',?)`
    ).bind(id, classId, name, email, quantity, secureToken).run();

    return json({
      ok: true,
      waitlisted: true,
      reference,
      status: 'WAITLISTED',
      secure_token: secureToken,
      customer_token: customerToken,
      message: 'You have been added to the waiting list. No payment has been taken.'
    }, 201);
  }

  const originalAmount = Number(classRow.price_pence || 0) * quantity;
  let promotion = null;
  if(requestedPromoCode){
    promotion = await validatePromotion(env,{code:requestedPromoCode,email,classId,subtotal:originalAmount});
    if(!promotion.valid)return json({error:promotion.error},400);
  }
  const discountPence = promotion?.discount_pence || 0;
  const amount = Math.max(0,originalAmount-discountPence);
  const paymentReady = sumUpConfigured(env);
  const holdId = crypto.randomUUID();
  const holdExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await env.BOOKINGS_DB.prepare(
    `INSERT INTO booking_holds(id,class_id,quantity,expires_at) VALUES(?,?,?,?)`
  ).bind(holdId, classId, quantity, holdExpiry).run();

  // Try the upgraded schema first. If the customer_token column has not yet
  // propagated, use the compatible schema and continue safely.
  try {
    await env.BOOKINGS_DB.prepare(
      `INSERT INTO bookings(
        id,reference,class_id,hold_id,customer_name,customer_email,customer_phone,
        quantity,amount_pence,original_amount_pence,discount_pence,promo_code,status,payment_provider,secure_token,customer_token,
        terms_accepted_at,marketing_consent,retention_delete_after
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING',?,?,?,CURRENT_TIMESTAMP,?,datetime('now','+24 months'))`
    ).bind(
      id, reference, classId, holdId, name, email, phone, quantity, amount, originalAmount, discountPence, promotion?.code || null,
      paymentReady ? 'SUMUP' : 'MANUAL', secureToken, customerToken,
      Number(Boolean(body.marketing_consent))
    ).run();
  } catch (_) {
    await env.BOOKINGS_DB.prepare(
      `INSERT INTO bookings(
        id,reference,class_id,hold_id,customer_name,customer_email,customer_phone,
        quantity,amount_pence,original_amount_pence,discount_pence,promo_code,status,payment_provider,secure_token,
        terms_accepted_at,marketing_consent,retention_delete_after
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING',?,?,CURRENT_TIMESTAMP,?,datetime('now','+24 months'))`
    ).bind(
      id, reference, classId, holdId, name, email, phone, quantity, amount, originalAmount, discountPence, promotion?.code || null,
      paymentReady ? 'SUMUP' : 'MANUAL', secureToken,
      Number(Boolean(body.marketing_consent))
    ).run();
  }

  if(Number(Boolean(body.marketing_consent))){
    try{await sendMailingWelcome(env,email,name);}catch(error){console.error('WELCOME_EMAIL_FAILED',error?.message||error);}
  }

  await env.BOOKINGS_DB.prepare(
    `INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json)
     VALUES(?,?,?,?,?)`
  ).bind(
    email, 'BOOKING_CREATED', 'booking', id,
    JSON.stringify({ reference, quantity, terms: true, paymentReady, promo_code:promotion?.code||null, discount_pence:discountPence })
  ).run();

  if(amount===0){
    await env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='PAID',paid_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    if(promotion)await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO promotion_redemptions(id,promotion_code_id,booking_id,customer_email,discount_pence) VALUES(?,?,?,?,?)`).bind(crypto.randomUUID(),promotion.promotion_code_id,id,email,discountPence).run();
    const paidBooking=await bookingWithClass(env,id); if(paidBooking)await deliverBookingNotification(env,paidBooking,'BOOKING_PAID');
    return json({ok:true,reference,status:'PAID',secure_token:secureToken,customer_token:customerToken,discount_pence:discountPence,total_pence:0},201);
  }

  if (paymentReady) {
    try {
      const origin = new URL(request.url).origin;
      const checkoutPayload = {
        checkout_reference: reference,
        amount: Number((amount / 100).toFixed(2)),
        currency: 'GBP',
        merchant_code: String(env.SUMUP_MERCHANT_CODE),
        description: `${classRow.title} — ${quantity} place${quantity === 1 ? '' : 's'}`,
        redirect_url: `${origin}/booking-confirmation.html?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(secureToken)}&customer=${encodeURIComponent(customerToken)}`,
        return_url: `${origin}/api/sumup-webhook`,
        valid_until: holdExpiry,
        hosted_checkout: { enabled: true }
      };

      const sumup = await sumUpFetch(env, '/v0.1/checkouts', {
        method: 'POST',
        body: JSON.stringify(checkoutPayload)
      });

      const checkout = await sumup.json().catch(() => ({}));
      const rawUrl = checkout.hosted_checkout_url || checkout.hosted_checkout?.url || '';
      let checkoutUrl = '';

      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === 'https:') checkoutUrl = parsed.toString();
      } catch (_) {}

      if (sumup.ok && checkout.id && checkoutUrl) {
        await env.BOOKINGS_DB.prepare(
          `UPDATE bookings SET provider_checkout_id=? WHERE id=?`
        ).bind(checkout.id, id).run();

        return json({
          ok: true,
          reference,
          secure_token: secureToken,
          customer_token: customerToken,
          status: 'PENDING',
          payment_enabled: true,
          checkout_url: checkoutUrl
        }, 201);
      }

      const providerMessage = clean(checkout?.message || checkout?.error_message || checkout?.error || '', 180);
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`DELETE FROM booking_holds WHERE id=?`).bind(holdId),
        env.BOOKINGS_DB.prepare(`DELETE FROM bookings WHERE id=?`).bind(id),
        env.BOOKINGS_DB.prepare(
          `INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`
        ).bind(email, 'SUMUP_CHECKOUT_FAILED', 'booking', id, JSON.stringify({ status: sumup.status, providerMessage }))
      ]);
      return json({
        error: 'SumUp could not open the secure payment page. No payment or booking has been taken. Please try again.',
        reference
      }, 502);
    } catch (error) {
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`DELETE FROM booking_holds WHERE id=?`).bind(holdId),
        env.BOOKINGS_DB.prepare(`DELETE FROM bookings WHERE id=?`).bind(id)
      ]);
      return json({
        error: 'The secure payment service is temporarily unavailable. No payment or booking has been taken. Please try again.',
        reference
      }, 502);
    }
  }

  // Safe fallback before SumUp has been configured: reserve the space and let Nora confirm payment manually.
  await env.BOOKINGS_DB.batch([
    env.BOOKINGS_DB.prepare(
      `UPDATE classes SET sold=sold+?,updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND sold+?<=capacity`
    ).bind(quantity, classId, quantity),
    env.BOOKINGS_DB.prepare(`DELETE FROM booking_holds WHERE id=?`).bind(holdId),
    env.BOOKINGS_DB.prepare(
      `UPDATE bookings SET payment_provider='MANUAL',
       admin_notes='Online payment unavailable; manual confirmation required.'
       WHERE id=?`
    ).bind(id)
  ]);

  return json({
    ok: true,
    reference,
    secure_token: secureToken,
    customer_token: customerToken,
    status: 'PENDING',
    payment_enabled: false,
    manual_confirmation: true,
    message: 'Your place has been reserved. Nora will confirm payment separately.'
  }, 201);
}

function checkoutTransactionId(checkout) {
  if (checkout?.transaction_id) return String(checkout.transaction_id);
  const transactions = Array.isArray(checkout?.transactions) ? checkout.transactions : [];
  const successful = transactions.find(item => item && item.status === 'SUCCESSFUL') || transactions[0];
  return successful?.id ? String(successful.id) : null;
}

function checkoutTransactionCode(checkout) {
  if (checkout?.transaction_code) return String(checkout.transaction_code);
  const transactions = Array.isArray(checkout?.transactions) ? checkout.transactions : [];
  const successful = transactions.find(item => item && item.status === 'SUCCESSFUL') || transactions[0];
  return successful?.transaction_code || successful?.code || null;
}

async function applySumUpCheckoutState(env, booking, checkout, actor = 'SUMUP_RECONCILIATION') {
  if (!booking || !checkout) return booking;
  const checkoutStatus = String(checkout.status || '').toUpperCase();
  const transactionId = checkoutTransactionId(checkout);
  const transactionCode = checkoutTransactionCode(checkout);

  if (checkoutStatus === 'PAID' && booking.status !== 'PAID') {
    const paid = await env.BOOKINGS_DB.prepare(
      `UPDATE bookings
       SET status='PAID',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),
           provider_transaction_id=COALESCE(?,provider_transaction_id),
           provider_transaction_code=COALESCE(?,provider_transaction_code)
       WHERE id=? AND status!='PAID'`
    ).bind(transactionId, transactionCode, booking.id).run();

    if (Number(paid?.meta?.changes || 0) > 0) {
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(
          `UPDATE classes SET sold=sold+?,updated_at=CURRENT_TIMESTAMP
           WHERE id=? AND sold+?<=capacity`
        ).bind(booking.quantity, booking.class_id, booking.quantity),
        env.BOOKINGS_DB.prepare(`DELETE FROM booking_holds WHERE id=?`).bind(booking.hold_id),
        env.BOOKINGS_DB.prepare(
          `INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json)
           VALUES(?,?,?,?,?)`
        ).bind(actor, 'SUMUP_PAYMENT_CONFIRMED', 'booking', booking.id, JSON.stringify({
          checkout_id: booking.provider_checkout_id,
          transaction_id: transactionId,
          transaction_code: transactionCode,
          checkout_status: checkoutStatus
        }))
      ]);
      const confirmedBooking = await bookingWithClass(env, booking.id);
      if (confirmedBooking) await deliverBookingNotification(env, confirmedBooking, 'BOOKING_CONFIRMED');
    }
    booking.status = 'PAID';
    if(booking.promo_code){const pc=await env.BOOKINGS_DB.prepare(`SELECT id FROM promotion_codes WHERE code=?`).bind(booking.promo_code).first();if(pc)await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO promotion_redemptions(id,promotion_code_id,booking_id,customer_email,discount_pence) VALUES(?,?,?,?,?)`).bind(crypto.randomUUID(),pc.id,booking.id,booking.customer_email,Number(booking.discount_pence||0)).run();}
    booking.provider_transaction_id = transactionId || booking.provider_transaction_id;
    booking.provider_transaction_code = transactionCode || booking.provider_transaction_code;
    return booking;
  }

  if (['FAILED','EXPIRED'].includes(checkoutStatus) && booking.status === 'PENDING') {
    const failed = await env.BOOKINGS_DB.prepare(
      `UPDATE bookings SET status=? WHERE id=? AND status='PENDING'`
    ).bind(checkoutStatus, booking.id).run();
    if (Number(failed?.meta?.changes || 0) > 0) {
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`DELETE FROM booking_holds WHERE id=?`).bind(booking.hold_id),
        env.BOOKINGS_DB.prepare(
          `INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json)
           VALUES(?,?,?,?,?)`
        ).bind(actor, `SUMUP_${checkoutStatus}`, 'booking', booking.id, JSON.stringify({
          checkout_id: booking.provider_checkout_id,
          checkout_status: checkoutStatus
        }))
      ]);
    }
    booking.status = checkoutStatus;
  }
  return booking;
}

async function retrieveSumUpCheckout(env, checkoutId) {
  if (!checkoutId || !sumUpConfigured(env)) return null;
  const response = await sumUpFetch(env, `/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function syncSumUpBooking(env, booking, actor = 'SUMUP_STATUS_CHECK') {
  if (!booking?.provider_checkout_id || !sumUpConfigured(env)) return booking;
  const checkout = await retrieveSumUpCheckout(env, booking.provider_checkout_id);
  if (!checkout) return booking;
  return applySumUpCheckoutState(env, booking, checkout, actor);
}

async function syncPendingSumUpBookings(env, limit = 20) {
  if (!env.BOOKINGS_DB || !sumUpConfigured(env)) return 0;
  const { results } = await env.BOOKINGS_DB.prepare(
    `SELECT * FROM bookings
     WHERE status='PENDING' AND payment_provider='SUMUP' AND provider_checkout_id IS NOT NULL
     ORDER BY created_at DESC LIMIT ?`
  ).bind(Math.max(1, Math.min(50, Number(limit) || 20))).all();
  let updated = 0;
  for (const booking of results || []) {
    const before = booking.status;
    const after = await syncSumUpBooking(env, booking, 'SUMUP_HQ_RECONCILIATION');
    if (after?.status !== before) updated += 1;
  }
  return updated;
}

async function sumUpWebhook(request, env) {
  if (!env.BOOKINGS_DB || !sumUpConfigured(env)) return new Response(null, { status: 204 });
  await ensureBookingSchema(env);
  const payload = await request.json().catch(() => null);
  const checkoutId = clean(payload?.id, 160);
  if (!checkoutId || clean(payload?.event_type, 80) !== 'CHECKOUT_STATUS_CHANGED') {
    return new Response(null, { status: 204 });
  }

  const booking = await env.BOOKINGS_DB.prepare(
    `SELECT * FROM bookings WHERE provider_checkout_id=?`
  ).bind(checkoutId).first();
  const checkout = await retrieveSumUpCheckout(env, checkoutId);
  if (booking) {
    if (checkout) await applySumUpCheckoutState(env, booking, checkout, 'SUMUP_WEBHOOK');
    return new Response(null, { status: 204 });
  }
  const order=await env.BOOKINGS_DB.prepare(`SELECT * FROM merch_orders WHERE provider_checkout_id=?`).bind(checkoutId).first();
  if(order&&checkout){
    const cs=String(checkout?.status||'').toUpperCase();
    if(cs==='PAID'){
      const tid=clean(checkoutTransactionId(checkout),180)||null;
      await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET status='PAID',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),provider_transaction_id=? WHERE id=?`).bind(tid,order.id).run();
      try{await sendMerchConfirmation(env,{...order,status:'PAID',provider_transaction_id:tid});}catch(_){}
    } else if(['FAILED','EXPIRED'].includes(cs)) await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET status=? WHERE id=?`).bind(cs,order.id).run();
    return new Response(null, { status: 204 });
  }
  const privatePayment=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_payments WHERE provider_reference=?`).bind(checkoutId).first();
  if(privatePayment&&checkout){
    const inquiry=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_inquiries WHERE id=?`).bind(privatePayment.inquiry_id).first();
    const quote=privatePayment.quote_id?await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_quotes WHERE id=?`).bind(privatePayment.quote_id).first():null;
    if(inquiry&&quote) await syncPrivateEventPayment(env,privatePayment,inquiry,quote,'SUMUP_WEBHOOK');
  }
  return new Response(null, { status: 204 });
}

async function bookingStatus(request,env,url){
  if(!env.BOOKINGS_DB)return json({error:'Booking database is not connected.'},503);
  await ensureBookingSchema(env);
  const token=clean(url.searchParams.get('token'),160),reference=clean(url.searchParams.get('reference'),120);
  let booking=null;
  if(token)booking=await env.BOOKINGS_DB.prepare(`SELECT b.*,c.title class_title,c.starts_at,c.venue,c.location FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.secure_token=?`).bind(token).first();
  else if(reference)booking=await env.BOOKINGS_DB.prepare(`SELECT b.*,c.title class_title,c.starts_at,c.venue,c.location FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.reference=?`).bind(reference).first();

  if(!booking&&token){
    const wait=await env.BOOKINGS_DB.prepare(`SELECT w.*,c.title class_title,c.starts_at,c.venue,c.location,0 amount_pence,'WAITLISTED' status FROM waiting_list w JOIN classes c ON c.id=w.class_id WHERE w.secure_token=?`).bind(token).first();
    if(wait)return json({...wait,reference:'WAITLIST',payment_enabled:false,can_cancel:wait.status==='WAITING',cancellation_guidance:'You can leave the waiting list at any time. No payment has been taken.'});
  }
  if(!booking)return json({error:'Booking not found.'},404);
  booking=await syncSumUpBooking(env,booking);
  const hours=(new Date(booking.starts_at)-new Date())/3600000;
  const guidance=hours>=48?'A cancellation now qualifies for a full refund or class credit.':hours>=24?'A cancellation now qualifies for one transfer or class credit.':'This is within 24 hours. A refund or credit is normally available only if the place is resold or exceptional circumstances are agreed.';
  return json({
    reference:booking.reference,status:booking.status,class_title:booking.class_title,starts_at:booking.starts_at,
    venue:booking.venue,location:booking.location,quantity:booking.quantity,amount_pence:booking.amount_pence,
    payment_enabled:sumUpConfigured(env),can_cancel:['PENDING','PAID'].includes(booking.status),
    cancellation_guidance:guidance,refund_outcome:booking.refund_status||''
  });
}

async function cancelBooking(request,env){
  if(!env.BOOKINGS_DB)return json({error:'Booking database is not connected.'},503);
  await ensureBookingSchema(env);
  const body=await request.json().catch(()=>null),token=clean(body?.token,160);
  if(!token)return json({error:'Secure booking token is missing.'},400);

  const booking=await env.BOOKINGS_DB.prepare(`SELECT b.*,c.starts_at FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.secure_token=?`).bind(token).first();
  if(!booking){
    const wait=await env.BOOKINGS_DB.prepare(`SELECT * FROM waiting_list WHERE secure_token=?`).bind(token).first();
    if(!wait)return json({error:'Booking not found.'},404);
    await env.BOOKINGS_DB.prepare(`UPDATE waiting_list SET status='CANCELLED' WHERE id=?`).bind(wait.id).run();
    return json({ok:true,message:'You have been removed from the waiting list. No payment was taken.'});
  }
  if(!['PENDING','PAID'].includes(booking.status))return json({error:'This booking can no longer be cancelled online.'},409);

  const hours=(new Date(booking.starts_at)-new Date())/3600000;
  const band=hours>=48?'FULL_REFUND':hours>=24?'CLASS_CREDIT':'LATE_CANCELLATION';
  const refundStatus=booking.status==='PAID'?(band==='FULL_REFUND'?'REFUND_DUE':band==='CLASS_CREDIT'?'CREDIT_DUE':'REVIEW_IF_RESOLD'):'NO_PAYMENT_TAKEN';

  await env.BOOKINGS_DB.batch([
    env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='CANCELLED',cancellation_requested_at=CURRENT_TIMESTAMP,cancellation_band=?,refund_status=? WHERE id=?`).bind(band,refundStatus,booking.id),
    env.BOOKINGS_DB.prepare(`UPDATE classes SET sold=MAX(0,sold-?),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(booking.quantity,booking.class_id),
    env.BOOKINGS_DB.prepare(`DELETE FROM booking_holds WHERE id=?`).bind(booking.hold_id),
    env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`).bind(booking.customer_email,'CUSTOMER_CANCELLED','booking',booking.id,JSON.stringify({band,refundStatus}))
  ]);

  const message=band==='FULL_REFUND'
    ?'Your cancellation is recorded. A full refund or class credit is due.'
    :band==='CLASS_CREDIT'
      ?'Your cancellation is recorded. You are eligible for one class transfer or class credit.'
      :'Your late cancellation is recorded. A refund or credit is normally considered only if the place is resold or exceptional circumstances are agreed.';
  return json({ok:true,band,refund_status:refundStatus,message});
}




async function systemHealth(request, env) {
  const access = requireAccessAdmin(request, env);
  if (access.response) return access.response;

  const result = {
    website: { status: 'ready', label: 'Public website online' },
    database: { status: 'setup', label: 'D1 database connected' },
    media: { status: 'setup', label: 'R2 media connected' },
    email: { status: 'info', label: 'Cloudflare email routing configured' },
    access: {
      status: 'ready',
      label: 'Cloudflare Access protecting HQ',
      detail: `Secure administrator session verified${access.state.email ? ` for ${access.state.email}` : ''}`
    },
    payments: { status: 'setup', label: 'SumUp sandbox connected' },
    checked_at: new Date().toISOString()
  };

  try {
    if (env.BOOKINGS_DB) {
      await ensureBookingSchema(env);
      const count = await env.BOOKINGS_DB.prepare(
        `SELECT COUNT(*) total FROM sqlite_master WHERE type='table'`
      ).first();
      result.database = {
        status: Number(count?.total || 0) > 0 ? 'ready' : 'setup',
        label: Number(count?.total || 0) > 0 ? 'D1 database connected' : 'D1 database needs setup',
        detail: `${Number(count?.total || 0)} tables available`
      };
    }
  } catch (error) {
    result.database = { status: 'error', label: 'D1 database check failed', detail: error.message };
  }

  try {
    if (env.MEDIA_BUCKET) {
      await env.MEDIA_BUCKET.list({ limit: 1 });
      result.media = { status: 'ready', label: 'R2 media connected' };
    }
  } catch (error) {
    result.media = { status: 'error', label: 'R2 media check failed', detail: error.message };
  }

  const sumupCheck = await checkSumUpConnection(env);
  result.payments = sumupCheck.ready
    ? { status: 'ready', label: 'SumUp sandbox connected', detail: sumupCheck.message }
    : { status: sumupCheck.status === 'setup' ? 'setup' : 'error', label: 'SumUp sandbox needs attention', detail: sumupCheck.message };

  result.email = {
    status: 'info',
    label: 'Cloudflare email routing is managed in the domain dashboard'
  };

  return json(result);
}

async function customerPortalLink(request,env){
  if(!env.BOOKINGS_DB)return json({error:'Booking database is not connected.'},503);
  await ensureBookingSchema(env);
  const body=await request.json().catch(()=>null);
  const reference=clean(body?.reference,120),email=clean(body?.email,160).toLowerCase();
  if(!reference||!emailOk(email))return json({error:'Enter a valid booking reference and email address.'},400);

  let booking=await env.BOOKINGS_DB.prepare(`SELECT * FROM bookings WHERE reference=? AND lower(customer_email)=?`).bind(reference,email).first();
  if(!booking)return json({error:'We could not find a booking matching those details.'},404);

  let customerToken=booking.customer_token;
  if(!customerToken){
    customerToken=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');
    await env.BOOKINGS_DB.prepare(`UPDATE bookings SET customer_token=? WHERE lower(customer_email)=?`).bind(customerToken,email).run();
  }else{
    await env.BOOKINGS_DB.prepare(`UPDATE bookings SET customer_token=? WHERE lower(customer_email)=? AND (customer_token IS NULL OR customer_token='')`).bind(customerToken,email).run();
  }
  return json({ok:true,customer_token:customerToken});
}

async function customerPortal(request,env,url){
  if(!env.BOOKINGS_DB)return json({error:'Booking database is not connected.'},503);
  await ensureBookingSchema(env);
  const token=clean(url.searchParams.get('token'),180);
  if(!token)return json({error:'Secure customer token is missing.'},400);

  const owner=await env.BOOKINGS_DB.prepare(`SELECT customer_email,customer_name FROM bookings WHERE customer_token=? LIMIT 1`).bind(token).first();
  if(!owner)return json({error:'This secure booking link is invalid or has expired.'},404);

  const {results}=await env.BOOKINGS_DB.prepare(`
    SELECT b.*,c.title class_title,c.starts_at,c.ends_at,c.venue,c.location,
      EXISTS(SELECT 1 FROM attendance a WHERE a.booking_id=b.id) attended
    FROM bookings b JOIN classes c ON c.id=b.class_id
    WHERE lower(b.customer_email)=lower(?)
    ORDER BY c.starts_at DESC
  `).bind(owner.customer_email).all();

  const now=Date.now();
  const decorate=b=>{
    const hours=(new Date(b.starts_at)-new Date())/3600000;
    return {
      ...b,
      can_cancel:['PENDING','PAID'].includes(b.status)&&new Date(b.starts_at).getTime()>now,
      payment_label:b.status==='PAID'?'Paid':b.status==='REFUNDED'?'Refunded':b.payment_provider==='MANUAL'?'To be confirmed':b.status,
      cancellation_guidance:hours>=48?'Full refund or class credit available.':hours>=24?'Transfer or class credit available.':'Late-cancellation terms apply.'
    };
  };
  const upcoming=results.filter(b=>new Date(b.starts_at).getTime()>now&&!['CANCELLED','REFUNDED','FAILED'].includes(b.status)).map(decorate);
  const history=results.filter(b=>!upcoming.some(u=>u.id===b.id)).map(decorate);
  const attendedRows=results.filter(b=>Number(b.attended)===1);
  const attended=attendedRows.length;
  const loyaltyProgress=attended%9;
  const paidSpend=results.filter(b=>b.status==='PAID').reduce((sum,b)=>sum+Number(b.amount_pence||0),0);
  const refunded=results.filter(b=>b.status==='REFUNDED').reduce((sum,b)=>sum+Number(b.amount_pence||0),0);
  const profile=await env.BOOKINGS_DB.prepare(`SELECT birthday FROM customer_crm_profiles WHERE lower(customer_key)=lower(?)`).bind(owner.customer_email).first().catch(()=>null);
  const rewardsResult=await env.BOOKINGS_DB.prepare(`
    SELECT pc.code,pc.issued_reason,pc.issued_at,pc.expires_at,pc.max_uses,pc.active,
      p.name,p.discount_type,p.discount_value,
      (SELECT COUNT(*) FROM promotion_redemptions pr WHERE pr.promotion_code_id=pc.id) uses
    FROM promotion_codes pc JOIN promotions p ON p.id=pc.promotion_id
    WHERE lower(pc.customer_email)=lower(?)
    ORDER BY pc.issued_at DESC
  `).bind(owner.customer_email).all().catch(()=>({results:[]}));
  const rewards=(rewardsResult.results||[]).map(r=>({
    ...r,
    available:Number(r.active)===1&&Number(r.uses||0)<Number(r.max_uses||1)&&(!r.expires_at||new Date(r.expires_at).getTime()>now),
    label:r.discount_type==='FREE'?'Free class':r.discount_type==='PERCENT'?`${Number(r.discount_value||0)}% off`:`£${(Number(r.discount_value||0)/100).toFixed(2)} off`
  }));
  const birthday=profile?.birthday||null;
  const birthdayMd=birthday?String(birthday).slice(5,10):'';
  const birthdayDancer=Boolean(birthdayMd&&attendedRows.some(b=>String(b.starts_at||'').slice(5,10)===birthdayMd));
  const achievements=[
    {id:'first_steps',title:'First Steps',description:'Attend your first Boot Scootin’ class.',earned:attended>=1,icon:'🥾'},
    {id:'regular',title:'Boot Scootin’ Regular',description:'Attend 10 classes.',earned:attended>=10,icon:'⭐'},
    {id:'trailblazer',title:'Trailblazer',description:'Attend 25 classes.',earned:attended>=25,icon:'🤠'},
    {id:'legend',title:'Boot Scootin’ Legend',description:'Attend 100 classes.',earned:attended>=100,icon:'🏆'},
    {id:'birthday_dancer',title:'Birthday Dancer',description:'Dance with us on your birthday.',earned:birthdayDancer,icon:'🎂'}
  ];
  const lastAttended=attendedRows.map(b=>new Date(b.starts_at).getTime()).filter(Number.isFinite).sort((a,b)=>b-a)[0]||0;
  const daysSince=lastAttended?Math.floor((now-lastAttended)/86400000):null;
  const health=!attended?'New':daysSince<=30?'Active':daysSince<=56?'At risk':'Inactive';

  return json({
    customer_name:owner.customer_name,
    customer_email:owner.customer_email,
    upcoming,history,rewards,achievements,
    profile:{birthday,health},
    summary:{
      upcoming:upcoming.length,
      attended,
      loyalty_progress:loyaltyProgress,
      reward_ready:attended>0&&attended%9===0,
      rewards_available:rewards.filter(r=>r.available).length,
      lifetime_spend_pence:Math.max(0,paidSpend),
      refunded_pence:refunded
    }
  });
}

async function bookingCalendar(request,env,url){
  if(!env.BOOKINGS_DB)return new Response('Booking database is not connected.',{status:503});
  await ensureBookingSchema(env);
  const token=clean(url.searchParams.get('token'),180);
  const b=await env.BOOKINGS_DB.prepare(`SELECT b.reference,b.customer_name,c.title,c.starts_at,c.ends_at,c.venue,c.location FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.secure_token=?`).bind(token).first();
  if(!b)return new Response('Booking not found.',{status:404});

  const icsDate=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const end=b.ends_at||new Date(new Date(b.starts_at).getTime()+3600000).toISOString();
  const safe=value=>String(value||'').replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n');
  const ics=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Boot Scootin Line Dancing//Bookings//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    `UID:${safe(b.reference)}@bootscootinlinedancing.co.uk`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(b.starts_at)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${safe(b.title)}`,
    `LOCATION:${safe(`${b.venue}, ${b.location}`)}`,
    `DESCRIPTION:${safe(`Boot Scootin' booking ${b.reference} for ${b.customer_name}.`)}`,
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
  return new Response(ics,{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':`attachment; filename="${b.reference}.ics"`}});
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
  const id=crypto.randomUUID(), token=crypto.randomUUID()+crypto.randomUUID().replaceAll('-',''), customerToken=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');
  const reference=`PE-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,5).toUpperCase()}`;
  const values=[id,reference,token,name,email,phone,type,clean(b.event_type_other,80),preferred,clean(b.alternative_date,10),clean(b.start_time,8),clean(b.end_time,8),clean(b.venue_name,160),address,postcode,guests,clean(b.age_range,120),clean(b.experience_level,80),clean(b.session_length,80),clean(b.format_requested,120),clean(b.music_requests,600),Number(Boolean(b.sound_system_provided)),Number(Boolean(b.microphone_provided)),Number(Boolean(b.dance_floor_confirmed)),Number(Boolean(b.power_available)),Number(Boolean(b.parking_loading_available)),clean(b.equipment_notes,600),clean(b.accessibility_notes,600),clean(b.additional_notes,1200)];
  await env.BOOKINGS_DB.batch([
    env.BOOKINGS_DB.prepare(`INSERT INTO private_event_inquiries(id,reference,secure_token,customer_name,customer_email,customer_phone,event_type,event_type_other,preferred_date,alternative_date,start_time,end_time,venue_name,venue_address,venue_postcode,guest_count,age_range,experience_level,session_length,format_requested,music_requests,sound_system_provided,microphone_provided,dance_floor_confirmed,power_available,parking_loading_available,equipment_notes,accessibility_notes,additional_notes) VALUES(${Array(29).fill('?').join(',')})`).bind(...values),
    env.BOOKINGS_DB.prepare(`INSERT INTO private_event_timeline(inquiry_id,actor_type,actor_label,action,details_json) VALUES(?,?,?,?,?)`).bind(id,'CUSTOMER',email,'INQUIRY_SUBMITTED',JSON.stringify({preferred_date:preferred,postcode}))
  ]);

  // Notify Nora/HQ about every new private-event inquiry. This is deliberately
  // non-blocking: the customer's inquiry remains safely stored even if email
  // delivery is temporarily unavailable.
  let adminEmailSent=false, adminEmailWarning='';
  const adminEmail=clean(env.ADMIN_EMAIL || env.EVENTS_NOTIFY_EMAIL || '',254).toLowerCase();
  if(emailOk(adminEmail)){
    try{
      const origin=new URL(request.url).origin;
      const hqUrl=`${origin}/ranch.html`;
      const subject=`New private event inquiry — ${reference}`;
      const timeLabel=[clean(b.start_time,8),clean(b.end_time,8)].filter(Boolean).join('–') || 'Not supplied';
      const textBody=`New private-event inquiry received.\n\nReference: ${reference}\nCustomer: ${name}\nEmail: ${email}\nPhone: ${phone||'Not supplied'}\nEvent: ${type}\nPreferred date: ${preferred}\nTime: ${timeLabel}\nGuests: ${guests}\nVenue: ${clean(b.venue_name,160)||'Not supplied'}\nAddress: ${address}, ${postcode}\n\nOpen Boot Scootin’ HQ to review and quote:\n${hqUrl}`;
      const htmlBody=`<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1a1111"><h2>New private event inquiry</h2><p><strong>${reference}</strong></p><p><strong>Customer:</strong> ${name}<br><strong>Email:</strong> ${email}<br><strong>Phone:</strong> ${phone||'Not supplied'}<br><strong>Event:</strong> ${type}<br><strong>Preferred date:</strong> ${preferred}<br><strong>Time:</strong> ${timeLabel}<br><strong>Guests:</strong> ${guests}<br><strong>Venue:</strong> ${clean(b.venue_name,160)||'Not supplied'}<br><strong>Address:</strong> ${address}, ${postcode}</p><p><a href="${hqUrl}" style="display:inline-block;padding:14px 20px;background:#c81924;color:#fff;text-decoration:none;font-weight:700">OPEN HQ</a></p></div>`;
      const sent=await sendTransactionalEmail(env,adminEmail,subject,htmlBody,textBody,'events');
      adminEmailSent=!sent?.skipped;
      if(sent?.skipped) adminEmailWarning=sent.reason||'Email provider is not configured.';
    }catch(error){adminEmailWarning=clean(error?.message||error,300);}
  }else{
    adminEmailWarning='ADMIN_EMAIL is not configured with a valid notification address.';
  }
  await env.BOOKINGS_DB.prepare(`INSERT INTO private_event_timeline(inquiry_id,actor_type,actor_label,action,details_json) VALUES(?,?,?,?,?)`).bind(id,'SYSTEM','email','ADMIN_INQUIRY_EMAIL',JSON.stringify({sent:adminEmailSent,warning:adminEmailWarning,recipient:adminEmail||null})).run().catch(()=>{});

  return json({ok:true,reference,status_url:`/private-quote.html?token=${encodeURIComponent(token)}`,message:'Your inquiry has been sent. This is not a confirmed booking.',admin_email_sent:adminEmailSent},201);
}

async function publicPrivateQuote(request, env, url) {
  if (!env.BOOKINGS_DB) return json({error:'The private booking service is unavailable.'},503);
  await ensureBookingSchema(env);
  const token=clean(url.searchParams.get('token'),120);
  const inquiry=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_inquiries WHERE secure_token=?`).bind(token).first();
  if(!inquiry) return json({error:'This private booking link is invalid or has expired.'},404);
  let quote=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_quotes WHERE inquiry_id=? ORDER BY version DESC LIMIT 1`).bind(inquiry.id).first();
  let currentInquiry=inquiry;
  let latestPayment=null;
  if(quote){
    latestPayment=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_payments WHERE inquiry_id=? AND quote_id=? ORDER BY created_at DESC LIMIT 1`).bind(inquiry.id,quote.id).first();
    if(latestPayment){
      const synced=await syncPrivateEventPayment(env,latestPayment,currentInquiry,quote,'PRIVATE_QUOTE_VIEW');
      latestPayment=synced.payment; currentInquiry=synced.inquiry; quote=synced.quote;
    }
  }
  const safeInquiry={reference:currentInquiry.reference,event_type:currentInquiry.event_type,preferred_date:currentInquiry.preferred_date,start_time:currentInquiry.start_time,end_time:currentInquiry.end_time,venue_name:currentInquiry.venue_name,venue_address:currentInquiry.venue_address,guest_count:currentInquiry.guest_count,status:currentInquiry.status};
  const safePayment=latestPayment?{payment_kind:latestPayment.payment_kind,amount_pence:latestPayment.amount_pence,status:latestPayment.status,paid_at:latestPayment.paid_at}:null;
  return json({inquiry:safeInquiry,quote,payment:safePayment,payments_enabled:sumUpConfigured(env)});
}



async function sendPrivateEventPaymentEmails(env, inquiry, quote, payment, kind, actor='PRIVATE_PAYMENT') {
  const customerEmail=clean(inquiry?.customer_email,254);
  const adminEmail=clean(env.ADMIN_EMAIL||'',254);
  const pounds=p=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(p)||0)/100);
  const paidAmount=Number(payment?.amount_pence||0);
  const total=Number(quote?.total_pence||0);
  const paidSoFar=kind==='DEPOSIT'?paidAmount:total;
  const remaining=Math.max(0,total-paidSoFar);
  const label=kind==='DEPOSIT'?'deposit':kind==='BALANCE'?'remaining balance':'full payment';
  const confirmed=kind==='DEPOSIT'?'Your date is now secured with the deposit.':'Your private event is now paid in full.';
  const manageUrl=`https://bootscootinlinedancing.co.uk/private-quote.html?token=${encodeURIComponent(inquiry?.secure_token||'')}`;
  let customerSent=false,adminSent=false;
  if(emailOk(customerEmail)) {
    try {
      const subject=`Boot Scootin’ private event ${label} received — ${clean(inquiry.reference,80)}`;
      const text=`Hi ${clean(inquiry.customer_name,120)||'there'},\n\nThank you — we’ve received your ${label} of ${pounds(paidAmount)} for your Boot Scootin’ private event.\n\nReference: ${clean(inquiry.reference,80)}\nEvent date: ${clean(quote?.agreed_date||inquiry?.preferred_date,40)||'To be agreed'}\nTotal: ${pounds(total)}\nPaid now: ${pounds(paidAmount)}\nRemaining balance: ${pounds(remaining)}\n\n${confirmed}\n\nManage your booking: ${manageUrl}\n\nNora\nBoot Scootin’ Line Dancing`;
      const html=`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1111"><h2>Payment received</h2><p>Hi ${clean(inquiry.customer_name,120)||'there'},</p><p>Thank you — we’ve received your <strong>${label}</strong> of <strong>${pounds(paidAmount)}</strong>.</p><p><strong>Reference:</strong> ${clean(inquiry.reference,80)}<br><strong>Event date:</strong> ${clean(quote?.agreed_date||inquiry?.preferred_date,40)||'To be agreed'}<br><strong>Total:</strong> ${pounds(total)}<br><strong>Paid now:</strong> ${pounds(paidAmount)}<br><strong>Remaining balance:</strong> ${pounds(remaining)}</p><p>${confirmed}</p><p><a href="${manageUrl}" style="display:inline-block;padding:14px 20px;background:#c81924;color:#fff;text-decoration:none;font-weight:700">MANAGE MY BOOKING</a></p><p>Nora<br><strong>Boot Scootin’ Line Dancing</strong></p></div>`;
      const sent=await sendTransactionalEmail(env,customerEmail,subject,html,text,'events');
      customerSent=!sent?.skipped;
    } catch(_) {}
  }
  if(emailOk(adminEmail)) {
    try {
      const subject=`Private event payment received — ${clean(inquiry.reference,80)}`;
      const text=`Private-event payment received.\n\nReference: ${clean(inquiry.reference,80)}\nCustomer: ${clean(inquiry.customer_name,120)}\nType: ${label}\nAmount: ${pounds(paidAmount)}\nRemaining: ${pounds(remaining)}\nStatus: ${kind==='DEPOSIT'?'CONFIRMED_DEPOSIT':'CONFIRMED_PAID'}`;
      const html=`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1111"><h2>Private event payment received</h2><p><strong>${clean(inquiry.reference,80)}</strong></p><p>${clean(inquiry.customer_name,120)} paid <strong>${pounds(paidAmount)}</strong> (${label}).<br>Remaining balance: <strong>${pounds(remaining)}</strong>.</p></div>`;
      const sent=await sendTransactionalEmail(env,adminEmail,subject,html,text,'events');
      adminSent=!sent?.skipped;
    } catch(_) {}
  }
  await env.BOOKINGS_DB.prepare(`INSERT INTO private_event_timeline(inquiry_id,actor_type,actor_label,action,details_json) VALUES(?,?,?,?,?)`).bind(inquiry.id,'SYSTEM',actor,'PAYMENT_EMAILS',JSON.stringify({kind,customer_sent:customerSent,admin_sent:adminSent,amount_pence:paidAmount,remaining_pence:remaining})).run().catch(()=>{});
}

async function syncPrivateEventPayment(env, payment, inquiry, quote, actor='PRIVATE_PAYMENT_SYNC') {
  if(!payment?.provider_reference || !sumUpConfigured(env)) return {payment,inquiry,quote};
  const checkout=await retrieveSumUpCheckout(env,payment.provider_reference).catch(()=>null);
  if(!checkout) return {payment,inquiry,quote};
  const status=String(checkout.status||'').toUpperCase();
  if(status==='PAID' && payment.status!=='PAID'){
    const tx=clean(checkoutTransactionId(checkout),180)||null;
    const kind=String(payment.payment_kind||'').toUpperCase();
    const nextInquiry=kind==='DEPOSIT'?'CONFIRMED_DEPOSIT':'CONFIRMED_PAID';
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`UPDATE private_event_payments SET status='PAID',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),provider_reference=? WHERE id=?`).bind(payment.provider_reference,payment.id),
      env.BOOKINGS_DB.prepare(`UPDATE private_event_inquiries SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nextInquiry,inquiry.id),
      env.BOOKINGS_DB.prepare(`UPDATE private_event_quotes SET status='QUOTE_ACCEPTED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(quote.id),
      env.BOOKINGS_DB.prepare(`INSERT INTO private_event_timeline(inquiry_id,actor_type,actor_label,action,details_json) VALUES(?,?,?,?,?)`).bind(inquiry.id,'SYSTEM',actor,kind==='DEPOSIT'?'DEPOSIT_PAID':'FULL_PAYMENT_PAID',JSON.stringify({payment_id:payment.id,checkout_id:payment.provider_reference,transaction_id:tx,amount_pence:payment.amount_pence}))
    ]);
    payment={...payment,status:'PAID',paid_at:new Date().toISOString()};
    inquiry={...inquiry,status:nextInquiry};
    quote={...quote,status:'QUOTE_ACCEPTED'};
    try{await sendPrivateEventPaymentEmails(env,inquiry,quote,payment,kind,actor);}catch(_){}
  }else if(['FAILED','EXPIRED'].includes(status) && payment.status==='PENDING'){
    await env.BOOKINGS_DB.prepare(`UPDATE private_event_payments SET status=? WHERE id=?`).bind(status,payment.id).run().catch(()=>{});
    payment={...payment,status};
  }
  return {payment,inquiry,quote};
}

async function privateEventPay(request, env) {
  if(!env.BOOKINGS_DB) return json({error:'The private booking service is unavailable.'},503);
  await ensureBookingSchema(env);
  if(!sumUpConfigured(env)) return json({error:'Secure SumUp payment is not available right now. No payment has been taken.'},503);
  const isGet=request.method==='GET';
  const url=new URL(request.url);
  const b=isGet ? {token:url.searchParams.get('token'),kind:url.searchParams.get('kind')} : await request.json().catch(()=>null);
  if(!b) return isGet ? Response.redirect(`${url.origin}/private-quote.html?payment=error`,303) : json({error:'The payment request could not be read.'},400);
  const token=clean(b.token,120), requested=clean(b.kind,20).toUpperCase();
  if(!['DEPOSIT','FULL','BALANCE'].includes(requested)) return json({error:'Please choose deposit or full payment.'},400);
  let inquiry=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_inquiries WHERE secure_token=?`).bind(token).first();
  if(!inquiry) return json({error:'This private booking link is invalid.'},404);
  let quote=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_quotes WHERE inquiry_id=? ORDER BY version DESC LIMIT 1`).bind(inquiry.id).first();
  if(!quote) return json({error:'A quote has not been issued for this booking yet.'},409);

  // Reconcile the latest payment first so a second tap cannot accidentally create another charge after payment.
  let latest=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_payments WHERE inquiry_id=? AND quote_id=? ORDER BY created_at DESC LIMIT 1`).bind(inquiry.id,quote.id).first();
  if(latest){
    const synced=await syncPrivateEventPayment(env,latest,inquiry,quote,'PRIVATE_PAYMENT_PRECHECK');
    latest=synced.payment; inquiry=synced.inquiry; quote=synced.quote;
  }
  if(inquiry.status==='CONFIRMED_PAID') return json({error:'This event has already been paid in full.'},409);
  if(requested==='DEPOSIT' && ['CONFIRMED_DEPOSIT','BALANCE_DUE'].includes(inquiry.status)) return json({error:'The deposit has already been paid.'},409);

  const kind=requested==='BALANCE'?'FULL':requested;
  const amount= requested==='DEPOSIT'
    ? Math.max(0,Number(quote.deposit_pence)||0)
    : requested==='BALANCE'
      ? Math.max(0,Number(quote.balance_due_pence)||0)
      : Math.max(0,Number(quote.total_pence)||0);
  if(amount<=0) return json({error:'There is no payment amount due for this option.'},409);

  const id=crypto.randomUUID();
  const suffix=crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase();
  const reference=`PE-${clean(inquiry.reference,40)}-${requested}-${suffix}`.slice(0,90);
  const origin=new URL(request.url).origin;
  const description=requested==='DEPOSIT'
    ? `Boot Scootin’ private event deposit — ${clean(inquiry.reference,60)}`
    : requested==='BALANCE'
      ? `Boot Scootin’ private event balance — ${clean(inquiry.reference,60)}`
      : `Boot Scootin’ private event — ${clean(inquiry.reference,60)}`;
  const payload={
    checkout_reference:reference,
    amount:Number((amount/100).toFixed(2)),currency:'GBP',merchant_code:String(env.SUMUP_MERCHANT_CODE),
    description,
    redirect_url:`${origin}/private-quote.html?token=${encodeURIComponent(token)}&payment=return`,
    return_url:`${origin}/api/sumup-webhook`,
    hosted_checkout:{enabled:true}
  };
  try{
    const r=await sumUpFetch(env,'/v0.1/checkouts',{method:'POST',body:JSON.stringify(payload)});
    const checkout=await r.json().catch(()=>({}));
    const raw=checkout.hosted_checkout_url||checkout.hosted_checkout?.url||''; let checkoutUrl='';
    try{const u=new URL(raw);if(u.protocol==='https:')checkoutUrl=u.toString();}catch(_){}
    if(!r.ok||!checkout.id||!checkoutUrl){
      const providerMessage=clean(checkout?.message||checkout?.error_message||checkout?.error||'',180);
      return json({error:'SumUp could not open the secure payment page. No payment has been taken.',detail:providerMessage},502);
    }
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`INSERT INTO private_event_payments(id,inquiry_id,quote_id,payment_kind,amount_pence,provider,provider_reference,status) VALUES(?,?,?,?,?,'SUMUP',?,'PENDING')`).bind(id,inquiry.id,quote.id,requested,amount,checkout.id),
      env.BOOKINGS_DB.prepare(`UPDATE private_event_inquiries SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(requested==='DEPOSIT'?'AWAITING_DEPOSIT':'QUOTE_ACCEPTED',inquiry.id),
      env.BOOKINGS_DB.prepare(`INSERT INTO private_event_timeline(inquiry_id,actor_type,actor_label,action,details_json) VALUES(?,?,?,?,?)`).bind(inquiry.id,'CUSTOMER','secure link','PAYMENT_STARTED',JSON.stringify({payment_id:id,kind:requested,amount_pence:amount,checkout_id:checkout.id}))
    ]);
    if(isGet) return Response.redirect(checkoutUrl,303);
    return json({ok:true,checkout_url:checkoutUrl,payment_id:id,kind:requested,amount_pence:amount});
  }catch(error){
    return json({error:'The secure payment service is temporarily unavailable. No payment has been taken. Please try again.'},502);
  }
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
  const check=requireAccessAdmin(request,env);
  if(check.response)return check.response;
  await ensureBookingSchema(env);

  if(request.method==='GET'){
    // Reconciliation is helpful, but a temporary SumUp/API problem must never
    // take the Classes screen down. The class list remains available from D1.
    let reconciliation_warning = '';
    try {
      await syncPendingSumUpBookings(env, 30);
    } catch (error) {
      reconciliation_warning = String(error?.message || error || 'Payment reconciliation unavailable.');
    }

    try {
      const response=await env.BOOKINGS_DB.prepare(`
        SELECT
          c.id,c.title,c.venue,c.location,c.starts_at,c.ends_at,c.price_pence,c.capacity,
          c.status,c.level,c.public_notes,c.poster_url,c.created_at,c.updated_at,
          COALESCE((SELECT SUM(quantity) FROM bookings b WHERE b.class_id=c.id AND b.status IN ('PENDING','PAID')),0) AS sold,
          COALESCE((SELECT SUM(quantity) FROM waiting_list w WHERE w.class_id=c.id AND w.status='WAITING'),0) AS waiting,
          COALESCE((SELECT COUNT(*) FROM bookings b WHERE b.class_id=c.id AND b.status IN ('PENDING','PAID')),0) AS booking_count
        FROM classes c
        ORDER BY c.starts_at
      `).all();
      const rows=Array.isArray(response?.results)?response.results:[];
      return json(rows,200);
    } catch (error) {
      return json({
        error:'Classes could not be loaded from the booking database.',
        detail:String(error?.message || error || 'Unknown D1 error.'),
        reconciliation_warning
      },500);
    }
  }

  const b=await request.json().catch(()=>null);
  if(!b)return json({error:'Invalid class request.'},400);

  const action=clean(b.action,30);

  if(request.method==='POST' && action==='DUPLICATE'){
    const original=await env.BOOKINGS_DB.prepare(`SELECT * FROM classes WHERE id=?`).bind(clean(b.id,120)).first();
    if(!original)return json({error:'The class could not be found.'},404);
    const id=crypto.randomUUID();
    const start=new Date(original.starts_at);
    const end=original.ends_at?new Date(original.ends_at):null;
    start.setDate(start.getDate()+7);
    if(end)end.setDate(end.getDate()+7);
    await env.BOOKINGS_DB.prepare(`
      INSERT INTO classes(id,title,venue,location,starts_at,ends_at,price_pence,capacity,status,level,public_notes,poster_url)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id,original.title,original.venue,original.location,start.toISOString(),end?end.toISOString():null,
      original.price_pence,original.capacity,'draft',original.level,original.public_notes,original.poster_url||''
    ).run();
    return json({ok:true,id},201);
  }

  if(request.method==='PATCH' && action==='STATUS'){
    const id=clean(b.id,120);
    const status=clean(b.status,20);
    if(!['draft','open','closed','cancelled'].includes(status))return json({error:'Invalid class status.'},400);
    if(status==='cancelled'){
      const activeResult=await env.BOOKINGS_DB.prepare(`SELECT b.*,c.title class_title,c.starts_at,c.venue,c.location FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.class_id=? AND b.status IN ('PENDING','PAID')`).bind(id).all();
      const active=activeResult?.results||[];
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE classes SET status='cancelled',sold=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id),
        env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='CANCELLED',cancellation_requested_at=COALESCE(cancellation_requested_at,CURRENT_TIMESTAMP),refund_status=CASE WHEN payment_provider='SUMUP' AND paid_at IS NOT NULL THEN COALESCE(refund_status,'REFUND_DUE') ELSE COALESCE(refund_status,'NO_PAYMENT_TAKEN') END WHERE class_id=? AND status IN ('PENDING','PAID')`).bind(id),
        env.BOOKINGS_DB.prepare(`DELETE FROM booking_holds WHERE class_id=?`).bind(id),
        env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`).bind(check.state.email,'CLASS_CANCELLED','class',id,JSON.stringify({affected_bookings:active.length}))
      ]);
      for(const original of active){
        const cancelled={...original,status:'CANCELLED'};
        await deliverBookingNotification(env,cancelled,'CLASS_CANCELLED');
      }
      return json({ok:true,id,status,notified:active.length});
    }
    await env.BOOKINGS_DB.prepare(`UPDATE classes SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,id).run();
    return json({ok:true,id,status});
  }

  if(request.method==='DELETE'){
    const id=clean(b.id,120);
    const linked=await env.BOOKINGS_DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM bookings WHERE class_id=?) +
        (SELECT COUNT(*) FROM waiting_list WHERE class_id=?) AS linked
    `).bind(id,id).first();
    if(Number(linked?.linked||0)>0){
      return json({error:'This class already has bookings or waiting-list entries. Cancel it instead of deleting it.'},409);
    }
    await env.BOOKINGS_DB.prepare(`DELETE FROM classes WHERE id=?`).bind(id).run();
    return json({ok:true});
  }

  const id=clean(b.id,120)||crypto.randomUUID();
  const title=clean(b.title,160);
  const venue=clean(b.venue,160);
  const location=clean(b.location,240);
  const starts=new Date(b.starts_at);
  const ends=b.ends_at?new Date(b.ends_at):null;

  if(!title || !venue || !location || Number.isNaN(starts.getTime())){
    return json({error:'Please complete the class title, venue, location and start time.'},400);
  }
  if(ends && (Number.isNaN(ends.getTime()) || ends<=starts)){
    return json({error:'The finish time must be after the start time.'},400);
  }

  const status=clean(b.status,20)||'draft';
  if(!['draft','open','closed','cancelled'].includes(status))return json({error:'Invalid class status.'},400);

  const vals=[
    title,venue,location,starts.toISOString(),ends?ends.toISOString():null,
    Math.max(0,Number(b.price_pence)||0),Math.max(1,Number(b.capacity)||1),
    status,clean(b.level,80)||'Beginner friendly',clean(b.public_notes,4000),clean(b.poster_url,500)
  ];

  if(request.method==='POST'){
    await env.BOOKINGS_DB.prepare(`
      INSERT INTO classes(id,title,venue,location,starts_at,ends_at,price_pence,capacity,status,level,public_notes,poster_url)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(id,...vals).run();
    const created=await env.BOOKINGS_DB.prepare(`SELECT * FROM classes WHERE id=?`).bind(id).first();
    try{await createNewClassDraft(env,created,check.state.email||'hq');}catch(error){console.error('NEW_CLASS_DRAFT_FAILED',error?.message||error);}
    return json({ok:true,id,email_draft_created:true},201);
  }

  if(request.method==='PATCH'){
    const existing=await env.BOOKINGS_DB.prepare(`SELECT * FROM classes WHERE id=?`).bind(id).first();
    if(!existing)return json({error:'The class could not be found.'},404);
    if(Number(b.capacity)<Number(existing.sold||0)){
      return json({error:`Capacity cannot be lower than the ${existing.sold} places already booked.`},409);
    }
    await env.BOOKINGS_DB.prepare(`
      UPDATE classes
      SET title=?,venue=?,location=?,starts_at=?,ends_at=?,price_pence=?,capacity=?,status=?,level=?,public_notes=?,poster_url=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(...vals,id).run();
    const detailsChanged=existing && (existing.starts_at!==starts.toISOString() || String(existing.venue||'')!==venue || String(existing.location||'')!==location || String(existing.title||'')!==title);
    let notified=0;
    if(detailsChanged && await automationEnabled(env,'class_updates')){
      const active=await env.BOOKINGS_DB.prepare(`SELECT b.*,c.title class_title,c.starts_at,c.ends_at,c.venue,c.location FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.class_id=? AND b.status IN ('PENDING','PAID')`).bind(id).all();
      for(const booking of active.results||[]){await deliverBookingNotification(env,booking,'CLASS_UPDATED');notified++;}
    }
    return json({ok:true,id,notified});
  }

  return json({error:'Method not allowed.'},405);
}




async function adminBootstrap(request, env) {
  const admin = adminState(request, env);
  const result = {
    mode: admin.email && admin.authorised ? 'protected' : 'public_pilot',
    admin_email: admin.authorised ? admin.email : null,
    configured: {
      access: Boolean(admin.email),
      admin_email: Boolean(String(env.ADMIN_EMAIL || '').trim()) || Boolean(admin.email),
      database: Boolean(env.BOOKINGS_DB),
      media: Boolean(env.MEDIA_BUCKET),
      sumup: sumUpConfigured(env)
    },
    summary: {
      upcoming_classes: 0,
      places_booked: 0,
      paid_revenue: 0,
      class_revenue: 0,
      merch_revenue: 0,
      merch_profit: 0,
      media_files: 0,
      pending_payments: 0,
      waiting_guests: 0,
      refund_review: 0,
      private_event_count: 0
    },
    classes: [],
    activity: [],
    setup_steps: [],
    warnings: []
  };

  if (!admin.email) result.setup_steps.push('Protect /ranch* and /api/admin/* with Cloudflare Access.');
  if (!env.BOOKINGS_DB) result.setup_steps.push('Create and bind a D1 database using the binding name BOOKINGS_DB.');
  if (!env.MEDIA_BUCKET) result.setup_steps.push('Create and bind an R2 bucket using the binding name MEDIA_BUCKET.');
  if (!String(env.ADMIN_EMAIL || '').trim() && !admin.email) result.setup_steps.push('Add ADMIN_EMAIL as an environment variable.');
  if (!sumUpConfigured(env)) result.setup_steps.push('Connect SumUp Sandbox after D1 and Access checks pass.');

  if (env.BOOKINGS_DB) {
    try {
      await ensureBookingSchema(env);
    } catch (error) {
      result.database_error = String(error?.message || error || 'Database setup failed.');
      result.warnings.push(`Database setup: ${result.database_error}`);
    }

    // Payment reconciliation is deliberately isolated. A SumUp timeout or an
    // unexpected provider response must not blank all HQ summary cards.
    try {
      await syncPendingSumUpBookings(env, 20);
    } catch (error) {
      result.warnings.push(`Payment reconciliation: ${String(error?.message || error || 'temporarily unavailable')}`);
    }

    const now = new Date().toISOString();

    try {
      const classesResult = await env.BOOKINGS_DB.prepare(`
        SELECT
          c.id,c.title,c.venue,c.location,c.starts_at,c.ends_at,c.price_pence,c.capacity,
          COALESCE((
            SELECT SUM(b.quantity)
            FROM bookings b
            WHERE b.class_id=c.id AND b.status IN ('PENDING','PAID')
          ),0) AS sold,
          c.status,c.level,c.public_notes
        FROM classes c
        WHERE c.starts_at >= ? AND c.status IN ('open','draft')
        ORDER BY starts_at
        LIMIT 20
      `).bind(now).all();
      result.classes = Array.isArray(classesResult?.results) ? classesResult.results : [];
      result.summary.upcoming_classes = result.classes.filter(row => row.status === 'open').length;
    } catch (error) {
      result.warnings.push(`Upcoming classes: ${String(error?.message || error)}`);
    }

    try {
      const stats = await env.BOOKINGS_DB.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN status IN ('PENDING','PAID') THEN quantity ELSE 0 END),0) places_booked,
          COALESCE(SUM(CASE WHEN status='PAID' THEN amount_pence ELSE 0 END),0) paid_revenue,
          COALESCE(SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END),0) pending_payments,
          COALESCE(SUM(CASE WHEN refund_status IN ('REFUND_DUE','CREDIT_DUE','REVIEW_IF_RESOLD','ADMIN_REVIEW') THEN 1 ELSE 0 END),0) refund_review
        FROM bookings
      `).first();
      result.summary.places_booked = Number(stats?.places_booked || 0);
      result.summary.class_revenue = Number(stats?.paid_revenue || 0);
      result.summary.paid_revenue = result.summary.class_revenue;
      result.summary.pending_payments = Number(stats?.pending_payments || 0);
      result.summary.refund_review = Number(stats?.refund_review || 0);
    } catch (error) {
      result.warnings.push(`Booking totals: ${String(error?.message || error)}`);
    }

    try {
      if (sumUpConfigured(env)) {
        const pendingMerch = await env.BOOKINGS_DB.prepare(`SELECT * FROM merch_orders WHERE status='PENDING' AND provider_checkout_id IS NOT NULL ORDER BY created_at DESC LIMIT 15`).all();
        for (const order of (pendingMerch.results || [])) {
          try {
            const checkout = await retrieveSumUpCheckout(env, order.provider_checkout_id);
            const status = String(checkout?.status || '').toUpperCase();
            if (status === 'PAID') {
              const transactionId = clean(checkoutTransactionId(checkout),180) || null;
              await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET status='PAID',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),provider_transaction_id=COALESCE(provider_transaction_id,?) WHERE id=?`).bind(transactionId,order.id).run();
              try { await sendMerchConfirmation(env,{...order,status:'PAID',provider_transaction_id:transactionId}); } catch (_) {}
            } else if (['FAILED','EXPIRED'].includes(status)) {
              await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET status=? WHERE id=?`).bind(status,order.id).run();
            }
          } catch (_) {}
        }
      }
    } catch (error) {
      result.warnings.push(`Merchandise reconciliation: ${String(error?.message || error)}`);
    }

    try {
      const merchStats = await env.BOOKINGS_DB.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN status='PAID' THEN amount_pence ELSE 0 END),0) merch_revenue,
          COALESCE(SUM(CASE WHEN status='PAID' THEN ((unit_price_pence - CASE WHEN fit='womens' THEN 1700 ELSE 1200 END) * quantity) ELSE 0 END),0) merch_profit
        FROM merch_orders
      `).first();
      result.summary.merch_revenue = Number(merchStats?.merch_revenue || 0);
      result.summary.merch_profit = Number(merchStats?.merch_profit || 0);
      result.summary.paid_revenue = Number(result.summary.class_revenue || 0) + result.summary.merch_revenue;
    } catch (error) {
      result.warnings.push(`Merchandise totals: ${String(error?.message || error)}`);
    }

    try {
      const waiting = await env.BOOKINGS_DB.prepare(`
        SELECT COALESCE(SUM(quantity),0) total FROM waiting_list WHERE status='WAITING'
      `).first();
      result.summary.waiting_guests = Number(waiting?.total || 0);
    } catch (error) {
      result.warnings.push(`Waiting list: ${String(error?.message || error)}`);
    }

    try {
      const privateResult = await env.BOOKINGS_DB.prepare(`SELECT COUNT(*) total FROM private_event_inquiries`).first();
      result.summary.private_event_count = Number(privateResult?.total || 0);
    } catch (error) {
      result.warnings.push(`Private events: ${String(error?.message || error)}`);
    }

    try {
      const activityResult = await env.BOOKINGS_DB.prepare(`
        SELECT action,target_type,created_at
        FROM audit_log
        ORDER BY created_at DESC
        LIMIT 10
      `).all();
      result.activity = (Array.isArray(activityResult?.results) ? activityResult.results : []).map(row => ({
        action: row.action,
        target_type: row.target_type,
        created_at: row.created_at
      }));
    } catch (error) {
      result.warnings.push(`Recent activity: ${String(error?.message || error)}`);
    }
  }

  if (env.MEDIA_BUCKET) {
    try {
      const items = await readIndex(env);
      result.summary.media_files = items.length;
    } catch (error) {
      result.media_error = String(error?.message || error || 'Media index unavailable.');
      result.warnings.push(`Media: ${result.media_error}`);
    }
  }

  return json(result);
}

async function cleanupKnownAugustTestBookings(request, env) {
  if (!env.BOOKINGS_DB) return json({ error: 'Booking database is not connected.' }, 503);
  await ensureBookingSchema(env);

  const body = await request.json().catch(() => ({}));
  if (clean(body.confirmation, 80) !== 'DELETE 3 TEST BOOKINGS') {
    return json({ error: 'Type DELETE 3 TEST BOOKINGS exactly to confirm.' }, 400);
  }

  const { results } = await env.BOOKINGS_DB.prepare(`
    SELECT *
    FROM bookings
    WHERE class_id='low-2026-08-26'
      AND status='PENDING'
      AND payment_provider='MANUAL'
      AND date(created_at)='2026-08-03'
      AND paid_at IS NULL
      AND provider_transaction_id IS NULL
      AND refund_status IS NULL
    ORDER BY created_at
  `).all();

  if ((results || []).length !== 3) {
    return json({
      error: `The cleanup expected exactly 3 matching test bookings but found ${(results || []).length}. Nothing was deleted.`,
      matched: (results || []).length
    }, 409);
  }

  let deleted = 0;

  try {
    for (const booking of results) {
      const result = await deleteTestBooking(
        env,
        booking,
        'public-pilot-known-test-cleanup'
      );
      if (result.ok) deleted += 1;
    }
  } catch (error) {
    return json({
      error: 'The test-booking cleanup could not be completed.',
      detail: String(error && error.message ? error.message : error)
    }, 500);
  }

  return json({
    ok: true,
    deleted,
    message: `${deleted} known test bookings were deleted.`
  });
}


const DEFAULT_EMAIL_TEMPLATES = [
  ['next-class','Next class reminder','Your next Boot Scootin’ class — {{class_date}}',`Hi {{first_name}},\n\nJust a reminder that our next Boot Scootin’ class is {{class_name}} on {{class_date}} at {{class_time}}, at {{venue}}.\n\nBook your place here: {{booking_link}}\n\nSee you on the dance floor!\n\nNora\nBoot Scootin’ Line Dancing`],
  ['booking-open','Booking now open','Booking is open — {{class_name}}',`Hi {{first_name}},\n\nBooking is now open for {{class_name}} on {{class_date}} at {{class_time}}.\n\nBook here: {{booking_link}}\n\nNora\nBoot Scootin’ Line Dancing`],
  ['few-spaces','Only a few spaces remaining','Only {{places_remaining}} spaces left — {{class_name}}',`Hi {{first_name}},\n\nThere are only {{places_remaining}} spaces remaining for {{class_name}} on {{class_date}}.\n\nBook here: {{booking_link}}`],
  ['new-date','New class date added','New Boot Scootin’ date added',`Hi {{first_name}},\n\nA new Boot Scootin’ class has been added: {{class_name}}, {{class_date}} at {{class_time}}, at {{venue}}.\n\nBook here: {{booking_link}}`],
  ['venue-update','Venue update','Important venue update — {{class_name}}',`Hi {{first_name}},\n\nThere is an update to the venue for {{class_name}} on {{class_date}}. The class will now take place at {{venue}}.\n\nNora`],
  ['special-event','Special event announcement','A special Boot Scootin’ event is coming',`Hi {{first_name}},\n\nWe have a special Boot Scootin’ event coming up and would love you to join us.\n\n[Add your event details here]\n\nNora`],
  ['thank-you','Thank you for coming','Thank you for dancing with us',`Hi {{first_name}},\n\nThank you for coming to {{class_name}}. I hope you had a brilliant time and I would love to see you again soon.\n\nNora`],
  ['welcome-list','Mailing-list welcome','Welcome to the Boot Scootin’ mailing list',`Hi {{first_name}},

Welcome to the Boot Scootin’ mailing list. You’ll receive class dates, reminders, special events and the latest Boot Scootin’ news.

Nora`],
  ['booking-confirmation-marketing','Booking confirmation follow-up','Your Boot Scootin’ booking is confirmed',`Hi {{first_name}},

Your place for {{class_name}} on {{class_date}} at {{class_time}} is confirmed.

Venue: {{venue}}

We can’t wait to dance with you!

Nora
Boot Scootin’ Line Dancing`],
  ['cancellation-update','Class cancellation update','Important update about {{class_name}}',`Hi {{first_name}},

Unfortunately, {{class_name}} on {{class_date}} at {{class_time}} has been cancelled.

Please accept our apologies for the inconvenience. Any payment or credit arrangements will be confirmed separately.

Nora`],
  ['refund-confirmation-marketing','Refund confirmation','Your Boot Scootin’ refund update',`Hi {{first_name}},

Your refund for {{class_name}} has been processed. Please allow the usual card-provider processing time for it to appear in your account.

Nora
Boot Scootin’ Line Dancing`],
  ['waiting-list-place','Waiting-list place available','A place is available for {{class_name}}',`Hi {{first_name}},

Good news — a place has become available for {{class_name}} on {{class_date}} at {{class_time}}.

Book here: {{booking_link}}

Places may be offered on a first-come, first-served basis.

Nora`],
  ['birthday','Happy birthday','Happy birthday from Boot Scootin’',`Hi {{first_name}},

Happy birthday from everyone at Boot Scootin’ Line Dancing! We hope you have a brilliant day filled with music, dancing and good times.

Nora`],
  ['miss-you','We haven’t seen you for a while','We miss you at Boot Scootin’',`Hi {{first_name}},

We haven’t seen you on the dance floor for a little while and wanted to say hello. We would love to welcome you back at an upcoming class.

See the latest dates here: {{booking_link}}

Nora`],
  ['monthly-newsletter','Monthly newsletter','Boot Scootin’ news and upcoming dates',`Hi {{first_name}},

Here is your latest Boot Scootin’ update.

[Add this month’s news, upcoming dates, dances and special announcements here.]

Book upcoming classes: {{booking_link}}

Nora`],
  ['new-dance','New dance learned','This week’s Boot Scootin’ dance',`Hi {{first_name}},

This week we learned a new dance at Boot Scootin’: [add dance name here].

[Add a recap, song name or practice link here.]

Happy practising!

Nora`],
  ['instructor-announcement','Instructor announcement','A message from Nora at Boot Scootin’',`Hi {{first_name}},

[Add your announcement here.]

Nora
Boot Scootin’ Line Dancing`],
  ['holiday-closure','Holiday closure','Boot Scootin’ holiday dates',`Hi {{first_name}},

Boot Scootin’ classes will pause for the following holiday dates:

[Add closure dates here.]

Classes return on [add return date].

Nora`],
  ['weather-cancellation','Weather cancellation','Weather update for {{class_name}}',`Hi {{first_name}},

Due to unsafe weather conditions, {{class_name}} on {{class_date}} has been cancelled.

Please do not travel to the venue. We will contact affected customers separately about payment or credit arrangements.

Stay safe,
Nora`]
];

async function ensureEmailCentreSchema(env){
  if(!env.BOOKINGS_DB) throw new Error('D1 booking database is not connected.');
  const statements=[
    `CREATE TABLE IF NOT EXISTS email_templates (id TEXT PRIMARY KEY,name TEXT NOT NULL,subject TEXT NOT NULL,body_text TEXT NOT NULL,is_system INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS email_campaigns (id TEXT PRIMARY KEY,subject TEXT NOT NULL,body_text TEXT NOT NULL,audience_type TEXT NOT NULL,audience_json TEXT,recipient_count INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'DRAFT',scheduled_at TEXT,sent_at TEXT,created_by TEXT,provider_message TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS email_campaign_recipients (id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL,email TEXT NOT NULL,name TEXT,status TEXT NOT NULL DEFAULT 'PENDING',provider_id TEXT,error_message TEXT,sent_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(campaign_id,email))`,
    `CREATE TABLE IF NOT EXISTS mailing_unsubscribes (email TEXT PRIMARY KEY,unsubscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,source TEXT)`,
    `CREATE TABLE IF NOT EXISTS mailing_subscribers (email TEXT PRIMARY KEY,name TEXT,source TEXT NOT NULL DEFAULT 'website',subscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS email_automation_log (automation_key TEXT PRIMARY KEY,automation_type TEXT NOT NULL,email TEXT,class_id TEXT,booking_id TEXT,provider_id TEXT,status TEXT NOT NULL DEFAULT 'SENT',error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS email_automation_settings (setting_key TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  ];
  for(const sql of statements) await env.BOOKINGS_DB.prepare(sql).run();
  for(const [id,name,subject,body] of DEFAULT_EMAIL_TEMPLATES){
    await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO email_templates(id,name,subject,body_text,is_system) VALUES(?,?,?,?,1)`).bind(id,name,subject,body).run();
  }
  for(const key of ['welcome','reminder_48h','class_day_morning','birthday','thank_you','new_class_draft','class_updates']){
    await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO email_automation_settings(setting_key,enabled) VALUES(?,1)`).bind(key).run();
  }
}

function emailTokenSecret(env){return String(env.MAILING_LIST_SIGNING_SECRET||env.SUMUP_OAUTH_STATE_SECRET||env.SUMUP_OAUTH_CLIENT_SECRET||'').trim()}
async function mailingToken(env,email){
  const secret=emailTokenSecret(env); if(!secret)return '';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(String(email).toLowerCase()));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function validMailingToken(env,email,token){const expected=await mailingToken(env,email);return Boolean(expected&&token&&expected===token)}

function mergeEmailText(text,recipient,klass){
  const full=String(recipient.name||'').trim(); const first=full.split(/\s+/)[0]||'there';
  const date=klass?.starts_at?new Date(klass.starts_at).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}):'';
  const time=klass?.starts_at?londonDateParts(klass.starts_at).time:'';
  const replacements={first_name:first,full_name:full||first,class_name:klass?.title||'',class_date:date,class_time:time,venue:klass?.venue||'',booking_link:klass?.booking_url||'https://bootscootinlinedancing.co.uk/bookings.html',places_remaining:String(Math.max(0,Number(klass?.capacity||0)-Number(klass?.sold||0)))};
  return String(text||'').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi,(_,key)=>replacements[key]??'');
}
function emailHtmlFromText(text,unsubscribeUrl){
  const lines=String(text||'').split(/\n{2,}/).map(part=>part.trim()).filter(Boolean);
  const heading=lines.shift()||'Boot Scootin’ Line Dancing';
  return brandedEmailHtml({heading,paragraphs:lines,buttons:[{label:'View upcoming classes',href:`${SITE_ORIGIN}/bookings.html`}],unsubscribeUrl});
}


async function automationEnabled(env,key){
  await ensureEmailCentreSchema(env);
  const row=await env.BOOKINGS_DB.prepare(`SELECT enabled FROM email_automation_settings WHERE setting_key=?`).bind(key).first();
  return row ? Number(row.enabled)!==0 : true;
}
async function automationAlreadySent(env,key){
  const row=await env.BOOKINGS_DB.prepare(`SELECT status FROM email_automation_log WHERE automation_key=?`).bind(key).first();
  return row?.status==='SENT';
}
async function recordAutomation(env,key,type,email,meta={},result=null,error=null){
  await env.BOOKINGS_DB.prepare(`INSERT OR REPLACE INTO email_automation_log(automation_key,automation_type,email,class_id,booking_id,provider_id,status,error_message,created_at) VALUES(?,?,?,?,?,?,?, ?,CURRENT_TIMESTAMP)`)
    .bind(key,type,String(email||'').toLowerCase(),meta.class_id||null,meta.booking_id||null,result?.id||null,error?'FAILED':'SENT',error?clean(error?.message||error,400):null).run();
}
async function sendMarketingAutomation(env,{key,type,email,name,subject,text,senderType='general',klass=null,meta={}}){
  if(!email || await automationAlreadySent(env,key)) return {skipped:true,reason:'Already sent or missing email.'};
  const unsub=await env.BOOKINGS_DB.prepare(`SELECT email FROM mailing_unsubscribes WHERE lower(email)=lower(?)`).bind(email).first();
  if(unsub) return {skipped:true,reason:'Unsubscribed.'};
  const token=await mailingToken(env,email);
  const unsubscribeUrl=token?`${SITE_ORIGIN}/api/email/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`:'';
  const recipient={email,name:name||'there'};
  const mergedSubject=mergeEmailText(subject,recipient,klass);
  const mergedText=mergeEmailText(text,recipient,klass);
  try{
    const result=await sendTransactionalEmail(env,email,mergedSubject,emailHtmlFromText(mergedText,unsubscribeUrl),mergedText,senderType);
    if(result?.skipped) return result;
    await recordAutomation(env,key,type,email,meta,result,null);
    return result;
  }catch(error){await recordAutomation(env,key,type,email,meta,null,error);throw error;}
}
async function sendMailingWelcome(env,email,name){
  if(!(await automationEnabled(env,'welcome'))) return {skipped:true};
  const key=`WELCOME:${String(email).toLowerCase()}`;
  return sendMarketingAutomation(env,{key,type:'WELCOME',email,name,subject:'Welcome to the Boot Scootin’ mailing list',text:`Hi {{first_name}},\n\nWelcome to the Boot Scootin’ mailing list. You’ll receive class dates, reminders, special events and the latest Boot Scootin’ news.\n\nView upcoming classes: ${SITE_ORIGIN}/bookings.html\n\nNora\nBoot Scootin’ Line Dancing`});
}
function londonPartsNow(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hour12:false}).formatToParts(date);
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
async function processBirthdayEmails(env){
  if(!(await automationEnabled(env,'birthday'))) return {processed:0};
  const nowParts=londonPartsNow();
  if(Number(nowParts.hour)<8 || Number(nowParts.hour)>10) return {processed:0};
  const md=`${nowParts.month}-${nowParts.day}`; const year=nowParts.year;
  const rows=await env.BOOKINGS_DB.prepare(`SELECT p.customer_key email,p.birthday,MAX(b.customer_name) name FROM customer_crm_profiles p JOIN bookings b ON lower(b.customer_email)=lower(p.customer_key) LEFT JOIN mailing_unsubscribes u ON lower(u.email)=lower(p.customer_key) WHERE p.birthday IS NOT NULL AND substr(p.birthday,6,5)=? AND b.marketing_consent=1 AND u.email IS NULL GROUP BY p.customer_key,p.birthday LIMIT 250`).bind(md).all();
  let processed=0;
  for(const row of rows.results||[]){
    const key=`BIRTHDAY:${year}:${String(row.email).toLowerCase()}`;
    const r=await sendMarketingAutomation(env,{key,type:'BIRTHDAY',email:row.email,name:row.name,subject:'Happy birthday from Boot Scootin’',text:`Hi {{first_name}},\n\nHappy birthday from everyone at Boot Scootin’ Line Dancing! We hope you have a brilliant day filled with music, dancing and good times.\n\nNora\nBoot Scootin’ Line Dancing`,senderType:'members'});
    if(!r?.skipped) processed++;
  }
  return {processed};
}
async function createNewClassDraft(env,klass,createdBy='hq'){
  if(!(await automationEnabled(env,'new_class_draft')) || !klass || klass.status==='cancelled') return;
  const exists=await env.BOOKINGS_DB.prepare(`SELECT id FROM email_campaigns WHERE audience_type='subscribers' AND json_extract(audience_json,'$.automation_class_id')=? AND status='DRAFT'`).bind(klass.id).first();
  if(exists) return;
  const id=crypto.randomUUID();
  await env.BOOKINGS_DB.prepare(`INSERT INTO email_campaigns(id,subject,body_text,audience_type,audience_json,status,created_by) VALUES(?,?,?,?,?,'DRAFT',?)`).bind(id,'New Boot Scootin’ class added — {{class_date}}',`Hi {{first_name}},\n\nA new Boot Scootin’ class has been added.\n\n{{class_name}}\n{{class_date}} at {{class_time}}\n{{venue}}\n\nBook here: {{booking_link}}\n\nNora\nBoot Scootin’ Line Dancing`,'subscribers',JSON.stringify({class_id:klass.id,automation_class_id:klass.id,sender_type:'bookings'}),createdBy).run();
}

async function resolveEmailAudience(env,type,payload={}){
  await ensureEmailCentreSchema(env);
  let rows=[]; let klass=null;
  const classId=String(payload.class_id||'').trim();
  if(type==='subscribers'){
    const r=await env.BOOKINGS_DB.prepare(`
      SELECT email,MAX(name) name FROM (
        SELECT lower(b.customer_email) email,MAX(b.customer_name) name
        FROM bookings b
        LEFT JOIN mailing_unsubscribes u ON lower(u.email)=lower(b.customer_email)
        WHERE b.marketing_consent=1 AND u.email IS NULL
        GROUP BY lower(b.customer_email)
        UNION ALL
        SELECT lower(s.email) email,MAX(s.name) name
        FROM mailing_subscribers s
        LEFT JOIN mailing_unsubscribes u ON lower(u.email)=lower(s.email)
        WHERE u.email IS NULL
        GROUP BY lower(s.email)
      ) GROUP BY email ORDER BY email
    `).all(); rows=r.results||[];
  }else if(type==='all_customers'){
    const r=await env.BOOKINGS_DB.prepare(`SELECT lower(customer_email) email,MAX(customer_name) name FROM bookings WHERE customer_email IS NOT NULL AND customer_email<>'' GROUP BY lower(customer_email) ORDER BY MAX(created_at) DESC`).all(); rows=r.results||[];
  }else if(type==='class_bookings'){
    if(!classId) throw new Error('Choose a class first.');
    const r=await env.BOOKINGS_DB.prepare(`SELECT lower(customer_email) email,MAX(customer_name) name FROM bookings WHERE class_id=? AND status IN ('PAID','PENDING') GROUP BY lower(customer_email)`).bind(classId).all(); rows=r.results||[];
  }else if(type==='class_attendees'){
    if(!classId) throw new Error('Choose a class first.');
    const r=await env.BOOKINGS_DB.prepare(`SELECT lower(b.customer_email) email,MAX(b.customer_name) name FROM attendance a JOIN bookings b ON b.id=a.booking_id WHERE b.class_id=? GROUP BY lower(b.customer_email)`).bind(classId).all(); rows=r.results||[];
  }else if(type==='waiting_list'){
    if(!classId) throw new Error('Choose a class first.');
    const r=await env.BOOKINGS_DB.prepare(`SELECT lower(customer_email) email,MAX(customer_name) name FROM waiting_list WHERE class_id=? AND status='WAITING' GROUP BY lower(customer_email)`).bind(classId).all(); rows=r.results||[];
  }else if(type==='selected_customers'){
    const selected=Array.isArray(payload.selected_emails)?payload.selected_emails:[];
    rows=selected.map(email=>({email:String(email||'').trim().toLowerCase(),name:''}));
    if(rows.length){
      const all=await env.BOOKINGS_DB.prepare(`SELECT lower(customer_email) email,MAX(customer_name) name FROM bookings GROUP BY lower(customer_email)`).all();
      const names=new Map((all.results||[]).map(r=>[r.email,r.name])); rows=rows.map(r=>({...r,name:names.get(r.email)||r.email.split('@')[0]}));
    }
  }else if(type==='selected'){
    rows=String(payload.emails||'').split(/[\s,;]+/).filter(Boolean).map(email=>({email:email.toLowerCase(),name:email.split('@')[0]}));
  }else{
    throw new Error('Choose a valid audience.');
  }
  if(classId){klass=await env.BOOKINGS_DB.prepare(`SELECT * FROM classes WHERE id=?`).bind(classId).first();}
  const unsub=await env.BOOKINGS_DB.prepare(`SELECT lower(email) email FROM mailing_unsubscribes`).all().catch(()=>({results:[]}));
  const blocked=new Set((unsub.results||[]).map(r=>r.email));
  const seen=new Set(); rows=rows.filter(r=>/^\S+@\S+\.\S+$/.test(String(r.email||''))&&!blocked.has(r.email)&&!seen.has(r.email)&&(seen.add(r.email),true));
  return {recipients:rows,klass};
}

async function sendCampaign(env,campaignId){
  await ensureEmailCentreSchema(env);
  const campaign=await env.BOOKINGS_DB.prepare(`SELECT * FROM email_campaigns WHERE id=?`).bind(campaignId).first();
  if(!campaign)throw new Error('Campaign not found.');
  if(campaign.status==='SENT')return {sent:campaign.recipient_count||0,already:true};
  const audience=JSON.parse(campaign.audience_json||'{}');
  const resolved=await resolveEmailAudience(env,campaign.audience_type,audience);
  if(!resolved.recipients.length)throw new Error('This audience has no eligible recipients.');
  await env.BOOKINGS_DB.prepare(`UPDATE email_campaigns SET status='SENDING',recipient_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(resolved.recipients.length,campaignId).run();
  let sent=0,failed=0;
  for(const recipient of resolved.recipients.slice(0,500)){
    const rid=crypto.randomUUID();
    try{
      const subject=mergeEmailText(campaign.subject,recipient,resolved.klass);
      const body=mergeEmailText(campaign.body_text,recipient,resolved.klass);
      const token=campaign.audience_type==='subscribers'?await mailingToken(env,recipient.email):'';
      const unsubscribe=token?`https://bootscootinlinedancing.co.uk/api/email/unsubscribe?email=${encodeURIComponent(recipient.email)}&token=${encodeURIComponent(token)}`:'';
      const senderType=String(audience.sender_type||'general');
      const result=await sendTransactionalEmail(env,recipient.email,subject,emailHtmlFromText(body,unsubscribe),body,senderType);
      if(result.skipped)throw new Error(result.reason||'Email provider is not configured.');
      await env.BOOKINGS_DB.prepare(`INSERT OR REPLACE INTO email_campaign_recipients(id,campaign_id,email,name,status,provider_id,sent_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(rid,campaignId,recipient.email,recipient.name||'', 'SENT',result.id||'').run(); sent++;
    }catch(error){
      await env.BOOKINGS_DB.prepare(`INSERT OR REPLACE INTO email_campaign_recipients(id,campaign_id,email,name,status,error_message) VALUES(?,?,?,?,?,?)`).bind(rid,campaignId,recipient.email,recipient.name||'','FAILED',clean(error.message||error,300)).run(); failed++;
    }
  }
  const finalStatus=sent>0?(failed?'PARTIAL':'SENT'):'FAILED';
  await env.BOOKINGS_DB.prepare(`UPDATE email_campaigns SET status=?,sent_at=CURRENT_TIMESTAMP,provider_message=?,error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(finalStatus,`${sent} sent`,failed?`${failed} failed`:null,campaignId).run();
  return {sent,failed,status:finalStatus};
}

async function processAutomaticBookingNotifications(env){
  if(!env.BOOKINGS_DB || !notificationConfig(env).emailReady) return { skipped:true };
  await ensureBookingSchema(env); await ensureEmailCentreSchema(env);
  const now=Date.now(); let processed=0;
  if(await automationEnabled(env,'reminder_48h')){
    const from=new Date(now+47*3600000).toISOString(),to=new Date(now+49*3600000).toISOString();
    const rows=await env.BOOKINGS_DB.prepare(`SELECT b.*,c.title class_title,c.starts_at,c.ends_at,c.venue,c.location FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.status IN ('PAID','PENDING') AND c.status<>'cancelled' AND c.starts_at>=? AND c.starts_at<? LIMIT 250`).bind(from,to).all();
    for(const booking of rows.results||[]){await deliverBookingNotification(env,booking,'CLASS_REMINDER_48H');processed++;}
  }
  if(await automationEnabled(env,'class_day_morning')){
    const p=londonPartsNow();
    if(Number(p.hour)>=8 && Number(p.hour)<=10){
      const from=new Date(now).toISOString(),to=new Date(now+20*3600000).toISOString();
      const rows=await env.BOOKINGS_DB.prepare(`SELECT b.*,c.title class_title,c.starts_at,c.ends_at,c.venue,c.location FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.status IN ('PAID','PENDING') AND c.status<>'cancelled' AND c.starts_at>=? AND c.starts_at<? LIMIT 250`).bind(from,to).all();
      for(const booking of rows.results||[]){const cp=londonPartsNow(new Date(booking.starts_at));if(cp.year===p.year&&cp.month===p.month&&cp.day===p.day){await deliverBookingNotification(env,booking,'CLASS_DAY_MORNING');processed++;}}
    }
  }
  if(await automationEnabled(env,'thank_you')){
    const thankFrom=new Date(now-36*3600000).toISOString(),thankTo=new Date(now-2*3600000).toISOString();
    const attended=await env.BOOKINGS_DB.prepare(`SELECT b.*,c.title class_title,c.starts_at,c.ends_at,c.venue,c.location FROM attendance a JOIN bookings b ON b.id=a.booking_id JOIN classes c ON c.id=b.class_id WHERE c.starts_at>=? AND c.starts_at<? LIMIT 250`).bind(thankFrom,thankTo).all();
    for(const booking of attended.results||[]){await deliverBookingNotification(env,booking,'THANK_YOU_AFTER_CLASS');processed++;}
  }
  const birthdays=await processBirthdayEmails(env);
  return {processed,birthdays:birthdays.processed||0};
}

async function processDueCampaigns(env){
  await ensureEmailCentreSchema(env);
  const r=await env.BOOKINGS_DB.prepare(`SELECT id FROM email_campaigns WHERE status='SCHEDULED' AND scheduled_at<=CURRENT_TIMESTAMP ORDER BY scheduled_at LIMIT 10`).all();
  const results=[]; for(const row of r.results||[]){try{results.push({id:row.id,...await sendCampaign(env,row.id)})}catch(error){await env.BOOKINGS_DB.prepare(`UPDATE email_campaigns SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(clean(error.message||error,300),row.id).run();results.push({id:row.id,error:error.message});}}
  return results;
}


async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function secureSecretMatch(provided, expected) {
  if (!provided || !expected) return false;
  const [left, right] = await Promise.all([sha256Hex(provided), sha256Hex(expected)]);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function runProtectedEmailAutomations(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const expected = String(env.EMAIL_AUTOMATION_SECRET || '').trim();
  if (!expected) return json({ error: 'EMAIL_AUTOMATION_SECRET is not configured on the main Pages project.', code: 'AUTOMATION_SECRET_MISSING' }, 503);
  const authorization = String(request.headers.get('authorization') || '');
  const provided = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : String(request.headers.get('x-automation-secret') || '').trim();
  if (!(await secureSecretMatch(provided, expected))) return json({ error: 'Not authorised.', code: 'AUTOMATION_NOT_AUTHORISED' }, 401);

  const startedAt = new Date().toISOString();
  try {
    const [campaigns, journeys] = await Promise.all([
      processDueCampaigns(env),
      processAutomaticBookingNotifications(env)
    ]);
    return json({
      ok: true,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      scheduled_campaigns: campaigns,
      automatic_journeys: journeys
    });
  } catch (error) {
    console.error('PROTECTED_EMAIL_AUTOMATION_ERROR', error?.stack || error);
    return json({
      error: `Email automation failed: ${clean(error?.message || error, 500)}`,
      code: 'EMAIL_AUTOMATION_FAILED',
      started_at: startedAt
    }, 500);
  }
}

async function adminEmailCentre(request,env,ctx){
  try { return await adminEmailCentreInner(request,env,ctx); }
  catch(error){
    console.error('EMAIL_CENTRE_ERROR', error?.stack || error);
    return json({error:`Email Centre error: ${clean(error?.message || error, 500)}`,code:'EMAIL_CENTRE_ERROR'},500);
  }
}

async function adminEmailCentreInner(request,env,ctx){
  const check=requireAccessAdmin(request,env);if(check.response)return check.response;
  await ensureBookingSchema(env); await ensureEmailCentreSchema(env);
  if(request.method==='GET'){
    const [templates,campaigns,subscribers,classes]=await Promise.all([
      env.BOOKINGS_DB.prepare(`SELECT * FROM email_templates ORDER BY is_system DESC,name`).all(),
      env.BOOKINGS_DB.prepare(`SELECT * FROM email_campaigns ORDER BY created_at DESC LIMIT 50`).all(),
      env.BOOKINGS_DB.prepare(`
        SELECT email,MAX(name) name,MAX(phone) phone,MAX(last_booking_at) last_booking_at FROM (
          SELECT lower(b.customer_email) email,MAX(b.customer_name) name,MAX(b.customer_phone) phone,MAX(b.created_at) last_booking_at
          FROM bookings b
          LEFT JOIN mailing_unsubscribes u ON lower(u.email)=lower(b.customer_email)
          WHERE b.marketing_consent=1 AND u.email IS NULL
          GROUP BY lower(b.customer_email)
          UNION ALL
          SELECT lower(s.email) email,MAX(s.name) name,'' phone,MAX(s.subscribed_at) last_booking_at
          FROM mailing_subscribers s
          LEFT JOIN mailing_unsubscribes u ON lower(u.email)=lower(s.email)
          WHERE u.email IS NULL
          GROUP BY lower(s.email)
        ) GROUP BY email ORDER BY last_booking_at DESC
      `).all(),
      env.BOOKINGS_DB.prepare(`SELECT id,title,starts_at,venue,capacity,sold FROM classes ORDER BY starts_at DESC LIMIT 100`).all()
    ]);
    const customers=await env.BOOKINGS_DB.prepare(`SELECT lower(customer_email) email,MAX(customer_name) name,MAX(created_at) last_booking_at FROM bookings WHERE customer_email IS NOT NULL AND customer_email<>'' GROUP BY lower(customer_email) ORDER BY last_booking_at DESC LIMIT 1000`).all();
    const automations=await env.BOOKINGS_DB.prepare(`SELECT setting_key,enabled FROM email_automation_settings ORDER BY setting_key`).all();
    const automationHistory=await env.BOOKINGS_DB.prepare(`SELECT * FROM email_automation_log ORDER BY created_at DESC LIMIT 50`).all();
    return json({provider:{ready:notificationConfig(env).emailReady,from:emailSender(env,'general'),senders:{general:emailSender(env,'general'),bookings:emailSender(env,'bookings'),events:emailSender(env,'events'),members:emailSender(env,'members')},scheduling_ready:true,cron_note:'Scheduled campaigns are sent by the Worker scheduled handler or the Process due emails button.'},templates:templates.results||[],campaigns:campaigns.results||[],subscribers:subscribers.results||[],customers:customers.results||[],classes:classes.results||[],automations:automations.results||[],automation_history:automationHistory.results||[]});
  }
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  let body;try{body=await request.json()}catch{return json({error:'Invalid request.'},400)}
  const action=String(body.action||'');
  if(action==='SAVE_AUTOMATIONS'){
    const settings=body.settings||{};
    for(const key of ['welcome','reminder_48h','class_day_morning','birthday','thank_you','new_class_draft','class_updates']){
      await env.BOOKINGS_DB.prepare(`INSERT INTO email_automation_settings(setting_key,enabled,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP`).bind(key,settings[key]===false?0:1).run();
    }
    return json({ok:true,message:'Email automation settings saved.'});
  }
  if(action==='AUDIENCE_PREVIEW'){
    const r=await resolveEmailAudience(env,body.audience_type,body.audience||{});return json({count:r.recipients.length,sample:r.recipients.slice(0,10)});
  }
  if(action==='SAVE_TEMPLATE'){
    const id=clean(body.id||crypto.randomUUID(),80),name=clean(body.name,80),subject=clean(body.subject,160),text=String(body.body_text||'').trim();
    if(!name||!subject||!text)return json({error:'Template name, subject and message are required.'},400);
    await env.BOOKINGS_DB.prepare(`INSERT INTO email_templates(id,name,subject,body_text,is_system,updated_at) VALUES(?,?,?,?,0,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name=excluded.name,subject=excluded.subject,body_text=excluded.body_text,updated_at=CURRENT_TIMESTAMP`).bind(id,name,subject,text).run();return json({ok:true,id});
  }
  if(action==='DELETE_TEMPLATE'){
    await env.BOOKINGS_DB.prepare(`DELETE FROM email_templates WHERE id=? AND is_system=0`).bind(body.id||'').run();return json({ok:true});
  }
  if(action==='SEND_TEST'){
    const email=check.state.email; if(!email)return json({error:'Your Cloudflare Access email is unavailable.'},400);
    const recipient={email,name:'Nora'};let klass=null;if(body.audience?.class_id)klass=await env.BOOKINGS_DB.prepare(`SELECT * FROM classes WHERE id=?`).bind(body.audience.class_id).first();
    const subject=mergeEmailText(body.subject,recipient,klass),text=mergeEmailText(body.body_text,recipient,klass);const senderType=String(body.audience?.sender_type||'general');const result=await sendTransactionalEmail(env,email,`TEST — ${subject}`,emailHtmlFromText(text,''),text,senderType);if(result.skipped)return json({error:result.reason},503);return json({ok:true,message:`Test sent to ${email} from ${result.from}.`});
  }
  if(['SEND_NOW','SCHEDULE'].includes(action)){
    const subject=clean(body.subject,160),text=String(body.body_text||'').trim(),type=clean(body.audience_type,40),audience=body.audience||{};
    if(!subject||!text)return json({error:'Subject and message are required.'},400);
    const preview=await resolveEmailAudience(env,type,audience);if(!preview.recipients.length)return json({error:'This audience has no eligible recipients.'},400);
    const id=crypto.randomUUID(); let scheduled=action==='SCHEDULE'?String(body.scheduled_at||''):null; if(scheduled){const parsed=new Date(scheduled);scheduled=Number.isNaN(parsed.getTime())?'':parsed.toISOString().slice(0,19).replace('T',' ');}
    if(action==='SCHEDULE'&&!scheduled)return json({error:'Choose a date and time.'},400);
    await env.BOOKINGS_DB.prepare(`INSERT INTO email_campaigns(id,subject,body_text,audience_type,audience_json,recipient_count,status,scheduled_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(id,subject,text,type,JSON.stringify(audience),preview.recipients.length,action==='SCHEDULE'?'SCHEDULED':'QUEUED',scheduled,check.state.email||'hq').run();
    if(action==='SEND_NOW'){
      if(ctx?.waitUntil){ctx.waitUntil(sendCampaign(env,id));return json({ok:true,id,message:`Campaign queued for ${preview.recipients.length} recipient${preview.recipients.length===1?'':'s'}.`},202)}
      return json({ok:true,id,...await sendCampaign(env,id)});
    }
    return json({ok:true,id,message:`Email scheduled for ${scheduled}.`});
  }
  if(action==='CANCEL_CAMPAIGN'){
    await env.BOOKINGS_DB.prepare(`UPDATE email_campaigns SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='SCHEDULED'`).bind(body.id||'').run();return json({ok:true});
  }
  if(action==='PROCESS_DUE')return json({ok:true,results:await processDueCampaigns(env)});
  return json({error:'Unknown email action.'},400);
}


async function subscribeMailingList(request,env){
  await ensureEmailCentreSchema(env);
  let body;
  try{ body=await request.json(); }catch{ return json({error:'Please enter your details again.'},400); }

  const name=clean(body?.name||'',80);
  const email=String(body?.email||'').trim().toLowerCase();
  const consent=body?.consent===true;

  if(!consent) return json({error:'Please tick the consent box to join the mailing list.'},400);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:'Please enter a valid email address.'},400);

  await env.BOOKINGS_DB.prepare(`DELETE FROM mailing_unsubscribes WHERE lower(email)=lower(?)`).bind(email).run().catch(()=>{});
  await env.BOOKINGS_DB.prepare(`
    INSERT INTO mailing_subscribers(email,name,source,subscribed_at,updated_at)
    VALUES(?,?, 'website', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE mailing_subscribers.name END,
      source='website',
      updated_at=CURRENT_TIMESTAMP
  `).bind(email,name).run();

  try{ await sendMailingWelcome(env,email,name); }catch(error){ console.error('MAILING_WELCOME_ERROR',error?.message||error); }

  return json({ok:true,message:'You’re on the list — welcome to the Boot Scootin’ Round-Up!'});
}

async function unsubscribeEmail(request,env,url){
  await ensureEmailCentreSchema(env);const email=String(url.searchParams.get('email')||'').toLowerCase(),token=String(url.searchParams.get('token')||'');
  if(!email||!(await validMailingToken(env,email,token)))return new Response('This unsubscribe link is invalid or has expired.',{status:400,headers:{'content-type':'text/plain;charset=UTF-8'}});
  await env.BOOKINGS_DB.prepare(`INSERT OR REPLACE INTO mailing_unsubscribes(email,source) VALUES(?,'email-link')`).bind(email).run();
  await env.BOOKINGS_DB.prepare(`UPDATE bookings SET marketing_consent=0 WHERE lower(customer_email)=?`).bind(email).run();
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>Unsubscribed</title><body style="font-family:Arial;padding:40px;background:#fff8ed;color:#211515"><h1>You have been unsubscribed</h1><p>${htmlEscape(email)} will no longer receive Boot Scootin’ marketing emails. Essential messages about bookings you make may still be sent.</p></body>`,{headers:{'content-type':'text/html;charset=UTF-8'}});
}

async function adminOperations(request, env) {
  const check = requireAccessAdmin(request, env);
  if (check.response) return check.response;
  await ensureBookingSchema(env);

  const [classesResult, bookingsResult, waitingResult, activityResult] = await Promise.all([
    env.BOOKINGS_DB.prepare(`
      SELECT c.*,
        COALESCE((SELECT SUM(quantity) FROM waiting_list w WHERE w.class_id=c.id AND w.status='WAITING'),0) waiting
      FROM classes c
      WHERE c.starts_at >= datetime('now','-1 day')
      ORDER BY c.starts_at
      LIMIT 12
    `).all(),
    env.BOOKINGS_DB.prepare(`
      SELECT b.*,c.title class_title,c.starts_at,c.venue
      FROM bookings b
      JOIN classes c ON c.id=b.class_id
      ORDER BY b.created_at DESC
      LIMIT 100
    `).all(),
    env.BOOKINGS_DB.prepare(`
      SELECT w.*,c.title class_title,c.starts_at,c.venue
      FROM waiting_list w
      JOIN classes c ON c.id=w.class_id
      WHERE w.status='WAITING'
      ORDER BY w.created_at
      LIMIT 50
    `).all(),
    env.BOOKINGS_DB.prepare(`
      SELECT action,target_type,target_id,actor,metadata_json,created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT 20
    `).all()
  ]);

  const classes = classesResult.results || [];
  const bookings = bookingsResult.results || [];
  const waiting = waitingResult.results || [];
  const today = new Date().toISOString().slice(0,10);
  const todayClasses = classes.filter(c => String(c.starts_at || '').slice(0,10) === today);
  const todayIds = new Set(todayClasses.map(c => c.id));
  const active = bookings.filter(b => ['PENDING','PAID'].includes(b.status));

  const reviewStates = new Set(['REFUND_DUE','CREDIT_DUE','REVIEW_IF_RESOLD','ADMIN_REVIEW']);
  const queue = [
    ...bookings.filter(b => b.status === 'PENDING').slice(0,6).map(b => ({
      type:'payment',
      title:`Payment awaiting confirmation — ${b.customer_name}`,
      detail:`${b.class_title} · ${b.reference}`,
      target:'bookings'
    })),
    ...bookings.filter(b => reviewStates.has(b.refund_status)).slice(0,6).map(b => ({
      type:'refund',
      title:`Refund or credit review — ${b.customer_name}`,
      detail:`${b.refund_status} · ${b.reference}`,
      target:'bookings'
    })),
    ...waiting.slice(0,6).map(w => ({
      type:'waiting',
      title:`Waiting list — ${w.customer_name}`,
      detail:`${w.class_title} · ${w.quantity} place${Number(w.quantity)===1?'':'s'}`,
      target:'bookings'
    }))
  ].slice(0,12);

  return json({
    summary:{
      today_classes:todayClasses.length,
      today_guests:active.filter(b => todayIds.has(b.class_id)).reduce((n,b)=>n+Number(b.quantity||0),0),
      paid_revenue:bookings.filter(b=>b.status==='PAID').reduce((n,b)=>n+Number(b.amount_pence||0),0),
      pending_payments:bookings.filter(b=>b.status==='PENDING').length,
      waiting_guests:waiting.reduce((n,w)=>n+Number(w.quantity||0),0),
      refund_review:bookings.filter(b=>reviewStates.has(b.refund_status)).length
    },
    classes,
    queue,
    activity:activityResult.results || []
  });
}

async function adminCustomers(request, env) {
  const check = requireAccessAdmin(request, env);
  if (check.response) return check.response;
  await ensureBookingSchema(env);
  const url = new URL(request.url);
  const email = clean(url.searchParams.get('email') || '', 320).toLowerCase();

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').toUpperCase();
    const customerKey = clean(body.customer_key || body.email || '', 320).toLowerCase();
    if (!customerKey || !customerKey.includes('@')) return json({ error: 'A valid customer email is required.' }, 400);

    if (action === 'SAVE_PROFILE') {
      const birthday = clean(body.birthday || '', 20) || null;
      const emergencyName = clean(body.emergency_contact_name || '', 120) || null;
      const emergencyPhone = clean(body.emergency_contact_phone || '', 80) || null;
      const emergencyRelationship = clean(body.emergency_contact_relationship || '', 80) || null;
      const medicalNotes = clean(body.medical_notes || '', 2000) || null;
      const summary = clean(body.instructor_notes_summary || '', 1200) || null;
      const loyaltyAdjustment = Math.max(-100, Math.min(100, Number(body.loyalty_adjustment || 0)));
      await env.BOOKINGS_DB.prepare(`
        INSERT INTO customer_crm_profiles(customer_key,birthday,emergency_contact_name,emergency_contact_phone,emergency_contact_relationship,medical_notes,instructor_notes_summary,loyalty_adjustment)
        VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(customer_key) DO UPDATE SET birthday=excluded.birthday,emergency_contact_name=excluded.emergency_contact_name,
          emergency_contact_phone=excluded.emergency_contact_phone,emergency_contact_relationship=excluded.emergency_contact_relationship,
          medical_notes=excluded.medical_notes,instructor_notes_summary=excluded.instructor_notes_summary,
          loyalty_adjustment=excluded.loyalty_adjustment,updated_at=CURRENT_TIMESTAMP
      `).bind(customerKey,birthday,emergencyName,emergencyPhone,emergencyRelationship,medicalNotes,summary,loyaltyAdjustment).run();
      await env.BOOKINGS_DB.prepare(`DELETE FROM customer_crm_tags WHERE customer_key=?`).bind(customerKey).run();
      const tags = [...new Set((Array.isArray(body.tags) ? body.tags : []).map(v => clean(v,40)).filter(Boolean))].slice(0,20);
      for (const tag of tags) await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO customer_crm_tags(customer_key,tag) VALUES(?,?)`).bind(customerKey,tag).run();
      await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`).bind(check.state.email||'hq','CUSTOMER_PROFILE_UPDATED','customer',customerKey,JSON.stringify({tags})).run();
      return json({ ok:true, message:'Customer profile saved.' });
    }
    if (action === 'ADD_NOTE') {
      const note = clean(body.note_text || '', 2000);
      if (!note) return json({ error:'Write a note first.' },400);
      const id = crypto.randomUUID();
      await env.BOOKINGS_DB.prepare(`INSERT INTO customer_crm_notes(id,customer_key,note_text,created_by) VALUES(?,?,?,?)`).bind(id,customerKey,note,check.state.email||'hq').run();
      await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`).bind(check.state.email||'hq','CUSTOMER_NOTE_ADDED','customer',customerKey,JSON.stringify({note_id:id})).run();
      return json({ok:true,id,message:'Note added.'});
    }
    if (action === 'DELETE_NOTE') {
      await env.BOOKINGS_DB.prepare(`DELETE FROM customer_crm_notes WHERE id=? AND customer_key=?`).bind(clean(body.note_id||'',80),customerKey).run();
      return json({ok:true,message:'Note deleted.'});
    }
    return json({error:'Unsupported customer action.'},400);
  }

  if (request.method !== 'GET') return json({error:'Method not allowed.'},405);

  const baseQuery = `
    SELECT lower(b.customer_email) customer_key, MAX(b.customer_name) customer_name, lower(b.customer_email) customer_email,
      MAX(b.customer_phone) customer_phone, COUNT(*) total_bookings,
      SUM(CASE WHEN b.status='PAID' THEN 1 ELSE 0 END) paid_bookings,
      SUM(CASE WHEN b.status='CANCELLED' THEN 1 ELSE 0 END) cancelled_bookings,
      SUM(CASE WHEN b.status='REFUNDED' THEN 1 ELSE 0 END) refunded_bookings,
      SUM(CASE WHEN a.booking_id IS NOT NULL THEN 1 ELSE 0 END) attended_classes,
      SUM(CASE WHEN b.status='PAID' THEN b.amount_pence ELSE 0 END) gross_paid_pence,
      SUM(CASE WHEN b.status='REFUNDED' THEN COALESCE(b.refund_amount_pence,b.amount_pence) ELSE 0 END) refunded_pence,
      MAX(b.marketing_consent) marketing_consent, MIN(b.created_at) customer_since, MAX(b.created_at) last_booking_at,
      SUM(CASE WHEN b.status IN ('PAID','PENDING') AND c.starts_at >= CURRENT_TIMESTAMP THEN 1 ELSE 0 END) upcoming_bookings
    FROM bookings b LEFT JOIN attendance a ON a.booking_id=b.id LEFT JOIN classes c ON c.id=b.class_id
  `;

  if (!email) {
    const { results } = await env.BOOKINGS_DB.prepare(baseQuery + ` GROUP BY lower(b.customer_email) ORDER BY last_booking_at DESC`).all();
    const now = Date.now();
    return json({ customers:(results||[]).map(row => {
      const last = row.last_booking_at ? new Date(row.last_booking_at).getTime() : 0;
      const days = last ? Math.floor((now-last)/86400000) : 9999;
      const health_status = days <= 14 ? 'ACTIVE' : days <= 56 ? 'AT_RISK' : 'INACTIVE';
      const attended = Number(row.attended_classes||0);
      return {...row, lifetime_spend_pence:Math.max(0,Number(row.gross_paid_pence||0)-Number(row.refunded_pence||0)), loyalty_progress:attended%9, reward_ready:attended>0&&attended%9===0, health_status};
    })});
  }

  const customer = await env.BOOKINGS_DB.prepare(baseQuery + ` WHERE lower(b.customer_email)=? GROUP BY lower(b.customer_email)`).bind(email).first();
  if (!customer) return json({error:'Customer not found.'},404);
  const [bookings, waiting, notes, tags, profile, notifications, campaigns] = await Promise.all([
    env.BOOKINGS_DB.prepare(`SELECT b.id,b.reference,b.status,b.quantity,b.amount_pence,b.refund_status,b.refund_amount_pence,b.created_at,b.paid_at,c.title class_title,c.starts_at,c.venue,CASE WHEN a.booking_id IS NULL THEN 0 ELSE 1 END attended FROM bookings b LEFT JOIN classes c ON c.id=b.class_id LEFT JOIN attendance a ON a.booking_id=b.id WHERE lower(b.customer_email)=? ORDER BY b.created_at DESC LIMIT 100`).bind(email).all(),
    env.BOOKINGS_DB.prepare(`SELECT w.*,c.title class_title,c.starts_at,c.venue FROM waiting_list w LEFT JOIN classes c ON c.id=w.class_id WHERE lower(w.customer_email)=? ORDER BY w.created_at DESC LIMIT 50`).bind(email).all(),
    env.BOOKINGS_DB.prepare(`SELECT * FROM customer_crm_notes WHERE customer_key=? ORDER BY created_at DESC LIMIT 100`).bind(email).all(),
    env.BOOKINGS_DB.prepare(`SELECT tag FROM customer_crm_tags WHERE customer_key=? ORDER BY tag`).bind(email).all(),
    env.BOOKINGS_DB.prepare(`SELECT * FROM customer_crm_profiles WHERE customer_key=?`).bind(email).first(),
    env.BOOKINGS_DB.prepare(`SELECT event_type,channel,status,created_at,sent_at,error_message FROM notification_log WHERE lower(recipient)=? ORDER BY created_at DESC LIMIT 50`).bind(email).all(),
    env.BOOKINGS_DB.prepare(`SELECT ec.subject,ec.status,ec.sent_at,ec.created_at,ecr.status recipient_status FROM email_campaign_recipients ecr JOIN email_campaigns ec ON ec.id=ecr.campaign_id WHERE lower(ecr.email)=? ORDER BY ec.created_at DESC LIMIT 50`).bind(email).all()
  ]);
  const attended = Number(customer.attended_classes||0) + Number(profile?.loyalty_adjustment||0);
  const last = customer.last_booking_at ? new Date(customer.last_booking_at).getTime() : 0;
  const days = last ? Math.floor((Date.now()-last)/86400000) : 9999;
  const health_status = days <= 14 ? 'ACTIVE' : days <= 56 ? 'AT_RISK' : 'INACTIVE';
  const timeline = [
    ...(bookings.results||[]).map(b=>({type:'BOOKING',title:`${b.status}: ${b.class_title||'Class'}`,detail:b.reference,created_at:b.created_at})),
    ...(notes.results||[]).map(n=>({type:'NOTE',title:'Instructor note added',detail:n.note_text,created_at:n.created_at})),
    ...(notifications.results||[]).map(n=>({type:'COMMUNICATION',title:`${n.event_type} · ${n.status}`,detail:n.channel,created_at:n.sent_at||n.created_at})),
    ...(campaigns.results||[]).map(c=>({type:'EMAIL',title:c.subject,detail:c.recipient_status||c.status,created_at:c.sent_at||c.created_at}))
  ].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,100);
  return json({
    customer:{...customer,health_status,lifetime_spend_pence:Math.max(0,Number(customer.gross_paid_pence||0)-Number(customer.refunded_pence||0)),loyalty_progress:Math.max(0,attended)%9,reward_ready:attended>0&&attended%9===0},
    profile:profile||{customer_key:email,loyalty_adjustment:0}, tags:(tags.results||[]).map(r=>r.tag), notes:notes.results||[], bookings:bookings.results||[], waiting:waiting.results||[], communications:[...(notifications.results||[]),...(campaigns.results||[])], timeline
  });
}


function isTestBookingCandidate(booking) {
  return Boolean(
    booking &&
    booking.status === 'PENDING' &&
    booking.payment_provider === 'MANUAL' &&
    !booking.paid_at &&
    !booking.provider_transaction_id &&
    !booking.refund_status
  );
}

async function deleteTestBooking(env, booking, actor) {
  if (!isTestBookingCandidate(booking)) {
    return { ok: false, error: 'Only unpaid manual pending test bookings can be deleted.' };
  }

  const holdId = booking.hold_id || null;

  await env.BOOKINGS_DB.prepare(
    `DELETE FROM audit_log WHERE target_type='booking' AND target_id=?`
  ).bind(booking.id).run();

  // Delete the booking before its referenced booking hold.
  // This avoids a D1 foreign-key constraint failure.
  await env.BOOKINGS_DB.prepare(
    `DELETE FROM bookings WHERE id=?`
  ).bind(booking.id).run();

  if (holdId) {
    await env.BOOKINGS_DB.prepare(
      `DELETE FROM booking_holds WHERE id=?`
    ).bind(holdId).run();
  }

  await env.BOOKINGS_DB.prepare(`
    UPDATE classes
    SET sold=MAX(0,sold-?),updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(Number(booking.quantity || 0), booking.class_id).run();

  await env.BOOKINGS_DB.prepare(`
    INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json)
    VALUES(?,?,?,?,?)
  `).bind(
    actor || 'hq',
    'TEST_BOOKING_DELETED',
    'class',
    booking.class_id,
    JSON.stringify({
      reference: booking.reference,
      quantity: Number(booking.quantity || 0)
    })
  ).run();

  return { ok: true };
}

async function adminBookings(request, env, ctx) {
  const check=requireAccessAdmin(request,env);if(check.response)return check.response;
  await ensureBookingSchema(env);

  if(request.method==='GET'){
    const {results}=await env.BOOKINGS_DB.prepare(`
      SELECT b.*,c.title class_title,c.starts_at,c.venue,c.location,
      EXISTS(SELECT 1 FROM attendance a WHERE a.booking_id=b.id) checked_in
      FROM bookings b JOIN classes c ON c.id=b.class_id
      ORDER BY c.starts_at DESC,b.created_at DESC
    `).all();
    const {results:waiting}=await env.BOOKINGS_DB.prepare(`
      SELECT w.*,c.title class_title,c.starts_at,c.venue FROM waiting_list w JOIN classes c ON c.id=w.class_id
      ORDER BY c.starts_at,w.created_at
    `).all();
    const stats={
      guests:results.filter(b=>['PENDING','PAID'].includes(b.status)).reduce((n,b)=>n+Number(b.quantity||0),0),
      paid:results.filter(b=>b.status==='PAID').reduce((n,b)=>n+Number(b.amount_pence||0),0),
      refunds_due:results.filter(b=>['REFUND_DUE','REFUND_FAILED','REFUND_PROCESSING','CREDIT_DUE','REVIEW_IF_RESOLD'].includes(b.refund_status)).length,
      waiting:waiting.filter(w=>w.status==='WAITING').reduce((n,w)=>n+Number(w.quantity||0),0)
    };
    return json({
      bookings:(results||[]).map(booking=>({
        ...booking,
        is_test_candidate:isTestBookingCandidate(booking)
      })),
      waiting,
      stats,
      refund_connection: await sumUpOAuthStatus(env)
    });
  }

  const body=await request.json().catch(()=>null);
  if(!body)return json({error:'Invalid booking action.'},400);
  const id=clean(body.id,120),action=clean(body.action,40);

  if(action==='DELETE_TEST_BOOKING'){
    const booking=await env.BOOKINGS_DB.prepare(`SELECT * FROM bookings WHERE id=?`).bind(id).first();
    if(!booking)return json({error:'Booking not found.'},404);
    const result=await deleteTestBooking(env,booking,check.state.email);
    if(!result.ok)return json({error:result.error},409);
    return json({ok:true,deleted:1});
  }

  if(action==='DELETE_ALL_TEST_BOOKINGS'){
    if(clean(body.confirmation,80)!=='DELETE TEST BOOKINGS'){
      return json({error:'Type DELETE TEST BOOKINGS exactly to confirm.'},400);
    }

    const {results:candidates}=await env.BOOKINGS_DB.prepare(`
      SELECT * FROM bookings
      WHERE status='PENDING'
        AND payment_provider='MANUAL'
        AND paid_at IS NULL
        AND provider_transaction_id IS NULL
        AND refund_status IS NULL
      ORDER BY created_at DESC
    `).all();

    let deleted=0;
    for(const booking of candidates||[]){
      const result=await deleteTestBooking(env,booking,check.state.email);
      if(result.ok)deleted++;
    }
    return json({ok:true,deleted});
  }
  const booking=await env.BOOKINGS_DB.prepare(`SELECT * FROM bookings WHERE id=?`).bind(id).first();
  if(!booking)return json({error:'Booking not found.'},404);

  if(action==='REFRESH_PAYMENT_DETAILS'){
    if(booking.payment_provider!=='SUMUP') return json({error:'This booking was not paid through SumUp.'},409);
    if(!booking.provider_checkout_id) return json({error:'No SumUp checkout ID is stored for this booking.'},409);
    try {
      const checkout=await retrieveSumUpCheckout(env,booking.provider_checkout_id);
      const transactionId=checkoutTransactionId(checkout) || booking.provider_transaction_id || '';
      const transactionCode=checkoutTransactionCode(checkout) || booking.provider_transaction_code || '';
      await env.BOOKINGS_DB.prepare(`UPDATE bookings SET provider_transaction_id=COALESCE(?,provider_transaction_id),provider_transaction_code=COALESCE(?,provider_transaction_code) WHERE id=?`)
        .bind(transactionId||null,transactionCode||null,id).run();
      return json({ok:true,payment:{checkout_id:booking.provider_checkout_id,transaction_id:transactionId,transaction_code:transactionCode,status:clean(checkout.status,40),amount:checkout.amount,currency:checkout.currency,date:checkout.date||checkout.timestamp||null}});
    } catch(error) {
      return json({error:`Could not refresh SumUp payment details: ${clean(error && error.message ? error.message : error,300)}`},502);
    }
  }

  if(action==='MARK_PAID'){
    if(booking.status!=='PAID'){
      await env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='PAID',paid_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
      const confirmed=await bookingWithClass(env,id);if(confirmed)await deliverBookingNotification(env,confirmed,'BOOKING_CONFIRMED');
    }
  }else if(action==='CANCEL'){
    if(['PENDING','PAID'].includes(booking.status)){
      const refundStatus = booking.status === 'PAID' && booking.payment_provider === 'SUMUP' ? 'REFUND_DUE' : 'NO_PAYMENT_TAKEN';
      await env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='CANCELLED',cancellation_requested_at=COALESCE(cancellation_requested_at,CURRENT_TIMESTAMP),refund_status=? WHERE id=?`)
        .bind(refundStatus,id).run();
      const cancelled=await bookingWithClass(env,id);if(cancelled)await deliverBookingNotification(env,cancelled,'BOOKING_CANCELLED');
    }
  }else if(action==='REFUND_SUMUP'){
    if(!['PAID','CANCELLED'].includes(booking.status)) return json({error:'Only paid or cancelled paid bookings can be refunded.'},409);
    if(booking.refund_status==='REFUNDED' || booking.status==='REFUNDED') return json({error:'This booking has already been refunded.'},409);
    if(booking.payment_provider!=='SUMUP') return json({error:'This booking was not paid through SumUp.'},409);

    const fullAmount=Math.max(0,Number(booking.amount_pence||0));
    const requested=body.refund_amount_pence===undefined||body.refund_amount_pence===null?fullAmount:Number(body.refund_amount_pence);
    if(!Number.isFinite(requested)||requested<=0||requested>fullAmount){
      return json({error:'Enter a valid refund amount no greater than the original payment.'},400);
    }
    const isFull=requested===fullAmount;

    let transactionId='';
    try {
      transactionId=await resolveSumUpTransactionId(env,booking);
    } catch (error) {
      const message=clean(error && error.message ? error.message : error,360)||'The SumUp transaction could not be resolved.';
      return json({error:message,code:'SUMUP_TRANSACTION_NOT_FOUND'},409);
    }

    const refundTraceId = crypto.randomUUID();
    await env.BOOKINGS_DB.prepare(`UPDATE bookings SET refund_status='REFUND_PROCESSING',provider_transaction_id=?,admin_notes=? WHERE id=?`)
      .bind(transactionId,clean(`Refund processing (${refundTraceId}). ${body.admin_notes||''}`,600),id).run();
    await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`)
      .bind(check.state.email,'REFUND_SUMUP_QUEUED','booking',id,JSON.stringify({trace_id:refundTraceId,requested_amount_pence:requested,transaction_id:transactionId,full_refund:isFull})).run().catch(()=>{});

    const runRefund = async () => {
      try {
        await refundSumUpTransaction(env,transactionId,isFull?null:requested);
        await env.BOOKINGS_DB.prepare(`UPDATE bookings SET status=?,refund_status='REFUNDED',refund_amount_pence=?,provider_transaction_id=?,cancellation_requested_at=COALESCE(cancellation_requested_at,CURRENT_TIMESTAMP),admin_notes=? WHERE id=?`)
          .bind(isFull?'REFUNDED':'CANCELLED',requested,transactionId,clean(`Refund confirmed by SumUp. Trace ${refundTraceId}. ${body.admin_notes||''}`,600),id).run();
        await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`)
          .bind(check.state.email,'REFUND_SUMUP','booking',id,JSON.stringify({trace_id:refundTraceId,requested_amount_pence:requested,transaction_id:transactionId,full_refund:isFull})).run().catch(()=>{});
        try {
          const refunded=await bookingWithClass(env,id);
          if(refunded) await deliverBookingNotification(env,{...refunded,refund_amount_pence:requested},'REFUND_CONFIRMED');
        } catch (notificationError) {
          console.error('Refund notification failed',notificationError);
        }
      } catch (error) {
        const message=clean(error && error.message ? error.message : error,360)||'The refund could not be completed.';
        await env.BOOKINGS_DB.prepare(`UPDATE bookings SET refund_status='REFUND_FAILED',admin_notes=? WHERE id=?`)
          .bind(clean(`Refund failed (${refundTraceId}): ${message}`,600),id).run().catch(()=>{});
        await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`)
          .bind(check.state.email,'REFUND_SUMUP_FAILED','booking',id,JSON.stringify({trace_id:refundTraceId,error:message,code:clean(error && error.code ? error.code : 'SUMUP_REFUND_REJECTED',80),status:Number(error && error.status)||0,transaction_id:transactionId,requested_amount_pence:requested})).run().catch(()=>{});
        console.error('SumUp refund failed', {trace_id:refundTraceId, message, code:error && error.code, status:error && error.status});
      }
    };

    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(runRefund());
    else await runRefund();

    return json({ok:true,queued:true,status:'REFUND_PROCESSING',refund_amount_pence:requested,transaction_id:transactionId,trace_id:refundTraceId},202);
  }else if(action==='MARK_REFUNDED'){
    const refundAmount=Math.max(0,Number(body.refund_amount_pence)||booking.amount_pence);
    await env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='REFUNDED',refund_status='REFUNDED',refund_amount_pence=?,admin_notes=? WHERE id=?`)
      .bind(refundAmount,clean(body.admin_notes,600),id).run();
    const refunded=await bookingWithClass(env,id);if(refunded)await deliverBookingNotification(env,{...refunded,refund_amount_pence:refundAmount},'REFUND_CONFIRMED');
  }else if(action==='ISSUE_CREDIT'){
    await env.BOOKINGS_DB.prepare(`UPDATE bookings SET refund_status='CLASS_CREDIT_ISSUED',admin_notes=? WHERE id=?`).bind(clean(body.admin_notes,600),id).run();
  }else if(action==='CHECK_IN'){
    await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO attendance(id,booking_id,checked_in_by) VALUES(?,?,?)`).bind(crypto.randomUUID(),id,check.state.email).run();
    const checked=await bookingWithClass(env,id); if(checked){const count=await env.BOOKINGS_DB.prepare(`SELECT COUNT(*) n FROM attendance a JOIN bookings b ON b.id=a.booking_id WHERE lower(b.customer_email)=lower(?)`).bind(checked.customer_email).first(); if(Number(count?.n||0)>0&&Number(count.n)%9===0){const reward=await issuePersonalPromotion(env,{email:checked.customer_email,name:checked.customer_name,type:'LOYALTY',days:90}); if(reward)await sendTransactionalEmail(env,checked.customer_email,'You earned a free Boot Scootin’ class',buildBrandedEmail({greeting:`Hi ${checked.customer_name},`,heading:'Your free class reward is ready',bodyHtml:`<p>You have completed nine loyalty stamps, so your tenth class is free.</p><p><strong>Your personal code: ${reward.code}</strong></p><p>Use it within 90 days when booking your next class.</p>`}),'You earned a free class. Code: '+reward.code,'members');}}
  }else if(action==='NO_SHOW'){
    await env.BOOKINGS_DB.prepare(`UPDATE bookings SET admin_notes=? WHERE id=?`).bind(`NO SHOW — ${clean(body.admin_notes,500)}`,id).run();
  }else{
    return json({error:'Unknown booking action.'},400);
  }
  await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`)
    .bind(check.state.email,action,'booking',id,JSON.stringify(body)).run();
  return json({ok:true});
}



function merchOrderReference(){
  const stamp=new Date().toISOString().slice(2,10).replace(/-/g,'');
  const rand=Math.random().toString(36).slice(2,7).toUpperCase();
  return `BS-${stamp}-${rand}`;
}


function merchDeliveryLabel(order){
  return order.fulfilment_method==='delivery'?'UK delivery':'Collection from Boot Scootin’';
}
function merchOrderText(order,heading){
  const money=p=>`£${(Number(p||0)/100).toFixed(2)}`;
  const lines=[heading,`Order ${order.reference}`,`${order.design} — ${order.fit==='womens'?"Women’s premium":"Unisex"} — ${order.size} × ${order.quantity}`,`Items: ${money(Number(order.unit_price_pence||0)*Number(order.quantity||0))}`,`${merchDeliveryLabel(order)}: ${order.delivery_pence?money(order.delivery_pence):'FREE'}`,`Total: ${money(order.amount_pence)}`];
  if(order.fulfilment_method==='delivery'&&order.delivery_address) lines.push(`Delivery address: ${order.delivery_address}`);
  return lines.join('\n');
}
async function sendMerchConfirmation(env,order){
  if(order.confirmation_email_sent_at)return;
  const money=p=>`£${(Number(p||0)/100).toFixed(2)}`;
  const detail=`${order.design} · ${order.fit==='womens'?"Women’s premium":"Unisex"} · ${order.size} · Qty ${order.quantity} · ${merchDeliveryLabel(order)}${order.delivery_pence?` ${money(order.delivery_pence)}`:' FREE'} · Total ${money(order.amount_pence)}`;
  const paragraphs=[`Thanks for your order, ${order.customer_name}. Your payment has been received and your made-to-order Boot Scootin’ T-shirt is now in the queue.`,order.fulfilment_method==='delivery'?'We’ll email you again as soon as your order has been dispatched.':'We’ll email you again as soon as your order is ready to collect.'];
  const html=brandedEmailHtml({heading:'Yeehaw — your order’s in!',greeting:`Order ${order.reference}`,paragraphs,detail});
  const text=merchOrderText(order,'Your Boot Scootin’ order is confirmed.')+'\n\n'+paragraphs.join('\n\n');
  const sent=await sendTransactionalEmail(env,order.customer_email,`Boot Scootin’ order ${order.reference} confirmed`,html,text,'general').catch(()=>null);
  if(sent&&!sent.skipped)await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET confirmation_email_sent_at=CURRENT_TIMESTAMP WHERE id=?`).bind(order.id).run().catch(()=>{});
}
async function sendMerchFulfilmentEmail(env,order){
  const delivery=order.fulfilment_method==='delivery';
  const heading=delivery?'Your Boot Scootin’ order is on its way!':'Your Boot Scootin’ order is ready!';
  const paragraphs=delivery
    ? [`Great news, ${order.customer_name}. Order ${order.reference} has been marked as dispatched.`,`It’s heading to the delivery address you gave us. Thank you for supporting Boot Scootin’!`]
    : [`Great news, ${order.customer_name}. Order ${order.reference} is ready to collect.`,`You can collect it from Nora at your next Boot Scootin’ class. Just quote your order number when you arrive.`];
  const html=brandedEmailHtml({heading,greeting:`Order ${order.reference}`,paragraphs});
  const text=heading+'\n\n'+paragraphs.join('\n\n');
  const sent=await sendTransactionalEmail(env,order.customer_email,`${heading} — ${order.reference}`,html,text,'general');
  if(!sent.skipped)await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET fulfilment_email_sent_at=CURRENT_TIMESTAMP WHERE id=?`).bind(order.id).run().catch(()=>{});
}

async function createMerchOrder(request,env){
  const contentType=String(request.headers.get('content-type')||'').toLowerCase();
  const formMode=contentType.includes('application/x-www-form-urlencoded')||contentType.includes('multipart/form-data');
  const backUrl=(params={})=>{
    const u=new URL('/community.html',request.url);
    u.hash='merchandise';
    Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
    return u.toString();
  };
  const fail=(message,status=400,extra={})=> formMode
    ? Response.redirect(backUrl({merch_error:message,...extra}),303)
    : json({error:message,...extra},status);
  if(!env.BOOKINGS_DB)return fail('Ordering is temporarily unavailable. Please try again shortly.',503);
  await ensureBookingSchema(env);
  let b=null;
  if(formMode){
    const fd=await request.formData().catch(()=>null);
    if(fd){b=Object.fromEntries(fd.entries());b.terms=fd.get('terms')==='on';}
  }else{
    b=await request.json().catch(()=>null);
  }
  if(!b)return fail('The order form could not be read.',400);
  const name=clean(b.name,100),email=clean(b.email,160).toLowerCase(),phone=clean(b.phone,40),design=clean(b.design,100),fit=clean(b.fit,20),size=clean(b.size,30),quantity=Math.max(1,Math.min(4,Number(b.quantity)||1));
  const fulfilment=clean(b.fulfilment_method,20)==='delivery'?'delivery':'collection';
  const deliveryAddress=clean(b.delivery_address,500);
  if(!name||!emailOk(email))return fail('Please add your name and a valid email address.',400);
  if(!['Just One More Dance','No Mistakes, Just Variations'].includes(design))return fail('Please choose one of the available T-shirt designs.',400);
  if(!['unisex','womens'].includes(fit))return fail('Please choose a T-shirt fit.',400);
  const unisexSizes=new Set(['S','M','L','XL','2XL','3XL','4XL','5XL']);
  const womensSizes=new Set(['S (UK 10)','M (UK 12)','L (UK 14)','XL (UK 16)','2XL (UK 18)','3XL (UK 20)','4XL (UK 22)']);
  if(!(fit==='unisex'?unisexSizes:womensSizes).has(size))return fail('Please choose an available size.',400);
  if(!b.terms)return fail('Please confirm that you understand the made-to-order production time.',400);
  if(fulfilment==='delivery'&&!deliveryAddress)return fail('Please add the delivery address, including postcode.',400);
  const unit=fit==='womens'?2200:2000,deliveryPence=fulfilment==='delivery'?395:0,amount=(unit*quantity)+deliveryPence,id=crypto.randomUUID(),reference=merchOrderReference();
  await env.BOOKINGS_DB.prepare(`INSERT INTO merch_orders(id,reference,customer_name,customer_email,customer_phone,design,fit,size,quantity,unit_price_pence,amount_pence,status,fulfilment_method,delivery_address,delivery_pence,fulfilment_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'PENDING',?,?,?,'NEW')`)
    .bind(id,reference,name,email,phone,design,fit,size,quantity,unit,amount,fulfilment,deliveryAddress||null,deliveryPence).run();
  await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`)
    .bind(email,'MERCH_ORDER_CREATED','merch_order',id,JSON.stringify({reference,design,fit,size,quantity,amount_pence:amount,fulfilment_method:fulfilment,delivery_pence:deliveryPence})).run().catch(()=>{});

  if(!sumUpConfigured(env)){
    const message='Your order has been recorded. Nora will contact you about payment.';
    return formMode ? Response.redirect(backUrl({merch_order:reference,merch_message:message}),303) : json({ok:true,reference,status:'PENDING',payment_enabled:false,message},201);
  }
  try{
    const origin=new URL(request.url).origin;
    const payload={
      checkout_reference:reference,
      amount:Number((amount/100).toFixed(2)),currency:'GBP',merchant_code:String(env.SUMUP_MERCHANT_CODE),
      description:`Boot Scootin’ T-shirt — ${design} — ${fit==='womens'?"Women’s premium":"Unisex"} ${size} × ${quantity}`,
      redirect_url:`${origin}/community.html?merch_order=${encodeURIComponent(reference)}#merchandise`,
      hosted_checkout:{enabled:true}
    };
    const r=await sumUpFetch(env,'/v0.1/checkouts',{method:'POST',body:JSON.stringify(payload)});
    const checkout=await r.json().catch(()=>({}));
    const raw=checkout.hosted_checkout_url||checkout.hosted_checkout?.url||''; let checkoutUrl='';
    try{const u=new URL(raw);if(u.protocol==='https:')checkoutUrl=u.toString();}catch(_){}
    if(r.ok&&checkout.id&&checkoutUrl){
      await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET provider_checkout_id=? WHERE id=?`).bind(checkout.id,id).run();
      return formMode ? Response.redirect(checkoutUrl,303) : json({ok:true,reference,status:'PENDING',payment_enabled:true,checkout_url:checkoutUrl},201);
    }
    const providerMessage=clean(checkout?.message||checkout?.error_message||checkout?.error||'',180);
    await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET status='PAYMENT_ERROR' WHERE id=?`).bind(id).run();
    return fail('SumUp could not open the secure payment page. Your order has been saved, but no payment has been taken.',502,{reference,detail:providerMessage});
  }catch(error){
    await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET status='PAYMENT_ERROR' WHERE id=?`).bind(id).run().catch(()=>{});
    return fail('The secure payment service is temporarily unavailable. Your order has been saved and no payment has been taken.',502,{reference});
  }
}

async function merchOrderStatus(request,env,url){
  if(!env.BOOKINGS_DB)return json({error:'Order lookup is unavailable.'},503);
  await ensureBookingSchema(env);
  const reference=clean(url.searchParams.get('reference'),80);
  if(!reference)return json({error:'Order reference required.'},400);
  let order=await env.BOOKINGS_DB.prepare(`SELECT * FROM merch_orders WHERE reference=?`).bind(reference).first();
  if(!order)return json({error:'Order not found.'},404);
  if(order.provider_checkout_id&&sumUpConfigured(env)&&order.status!=='PAID'){
    try{
      const checkout=await retrieveSumUpCheckout(env,order.provider_checkout_id);
      const cs=String(checkout?.status||'').toUpperCase();
      if(cs==='PAID'){
        const tid=clean(checkoutTransactionId(checkout),180)||null;
        await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET status='PAID',paid_at=CURRENT_TIMESTAMP,provider_transaction_id=? WHERE id=?`).bind(tid,order.id).run();
        await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`).bind(order.customer_email,'MERCH_ORDER_PAID','merch_order',order.id,JSON.stringify({reference,transaction_id:tid})).run().catch(()=>{});
        order.status='PAID';
        order.provider_transaction_id=tid;
        try{await sendMerchConfirmation(env,{...order,status:'PAID'});}catch(_){}
      } else if(['FAILED','EXPIRED'].includes(cs)) {
        await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET status=? WHERE id=?`).bind(cs,order.id).run(); order.status=cs;
      }
    }catch(_){}
  }
  return json({ok:true,reference:order.reference,status:order.status,design:order.design,fit:order.fit,size:order.size,quantity:order.quantity,amount_pence:order.amount_pence,fulfilment_method:order.fulfilment_method,delivery_pence:order.delivery_pence,fulfilment_status:order.fulfilment_status});
}


async function adminMerchOrders(request,env){
  const check=requireAccessAdmin(request,env); if(check.response)return check.response;
  await ensureBookingSchema(env);
  if(request.method==='GET'){
    // v96.4.64: remove the pre-live checkout test rows created before 10 Aug 2026.
    // Paid orders (including Lisa's real paid order) are never touched.
    await env.BOOKINGS_DB.prepare(`DELETE FROM merch_orders WHERE status<>'PAID' AND datetime(created_at) < datetime('2026-08-10 00:00:00')`).run().catch(()=>{});
    const rows=await env.BOOKINGS_DB.prepare(`SELECT * FROM merch_orders ORDER BY created_at DESC LIMIT 250`).all();
    return json({items:rows.results||[]});
  }
  const body=await request.json().catch(()=>null); if(!body)return json({error:'Invalid merchandise order request.'},400);
  const id=clean(body.id,120),action=clean(body.action,40);
  const order=await env.BOOKINGS_DB.prepare(`SELECT * FROM merch_orders WHERE id=?`).bind(id).first();
  if(!order)return json({error:'Merchandise order not found.'},404);
  if(action==='READY'){
    if(order.fulfilment_method!=='collection')return json({error:'This order is set for delivery.'},409);
    await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET fulfilment_status='READY_FOR_COLLECTION' WHERE id=?`).bind(id).run();
    await sendMerchFulfilmentEmail(env,{...order,fulfilment_status:'READY_FOR_COLLECTION'});
  } else if(action==='DISPATCHED'){
    if(order.fulfilment_method!=='delivery')return json({error:'This order is set for collection.'},409);
    await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET fulfilment_status='DISPATCHED' WHERE id=?`).bind(id).run();
    await sendMerchFulfilmentEmail(env,{...order,fulfilment_status:'DISPATCHED'});
  } else if(action==='COMPLETE'){
    await env.BOOKINGS_DB.prepare(`UPDATE merch_orders SET fulfilment_status='COMPLETED' WHERE id=?`).bind(id).run();
  } else return json({error:'Unknown merchandise action.'},400);
  await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`).bind(check.state.email,`MERCH_${action}`,'merch_order',id,JSON.stringify({reference:order.reference})).run().catch(()=>{});
  return json({ok:true});
}

async function adminPrivateEvents(request, env) {
  const check=requireAccessAdmin(request,env); if(check.response)return check.response; await ensureBookingSchema(env);
  if(request.method==='GET'){const {results}=await env.BOOKINGS_DB.prepare(`SELECT i.*,q.id quote_id,q.total_pence,q.deposit_pence,q.balance_due_pence,q.status quote_status,q.quote_expires_at, COALESCE((SELECT SUM(p.amount_pence) FROM private_event_payments p WHERE p.inquiry_id=i.id AND p.status='PAID'),0) paid_pence, (SELECT p.payment_kind FROM private_event_payments p WHERE p.inquiry_id=i.id ORDER BY p.created_at DESC LIMIT 1) latest_payment_kind, (SELECT p.status FROM private_event_payments p WHERE p.inquiry_id=i.id ORDER BY p.created_at DESC LIMIT 1) latest_payment_status, (SELECT p.provider_reference FROM private_event_payments p WHERE p.inquiry_id=i.id ORDER BY p.created_at DESC LIMIT 1) latest_payment_reference, (SELECT p.paid_at FROM private_event_payments p WHERE p.inquiry_id=i.id AND p.status='PAID' ORDER BY p.paid_at DESC LIMIT 1) latest_paid_at FROM private_event_inquiries i LEFT JOIN private_event_quotes q ON q.id=(SELECT id FROM private_event_quotes WHERE inquiry_id=i.id ORDER BY version DESC LIMIT 1) ORDER BY i.created_at DESC`).all();return json({items:results});}
  const b=await request.json().catch(()=>null);if(!b)return json({error:'Invalid private event request.'},400);
  if(request.method==='PATCH'&&b.action==='STATUS'){const status=clean(b.status,40);if(!privateStatuses.has(status))return json({error:'Invalid status.'},400);await env.BOOKINGS_DB.prepare(`UPDATE private_event_inquiries SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,clean(b.id,120)).run();return json({ok:true});}
  if(request.method==='DELETE'&&b.action==='DELETE'){
    const inquiryId=clean(b.id,120);
    const inquiry=await env.BOOKINGS_DB.prepare(`SELECT id,reference,customer_name,status FROM private_event_inquiries WHERE id=?`).bind(inquiryId).first();
    if(!inquiry)return json({error:'Private-event inquiry not found.'},404);
    // D1 foreign keys are ON DELETE CASCADE, so removing the inquiry also removes
    // its quote versions, payment rows and timeline entries.
    await env.BOOKINGS_DB.prepare(`DELETE FROM private_event_inquiries WHERE id=?`).bind(inquiryId).run();
    return json({ok:true,deleted_reference:inquiry.reference});
  }
  if(request.method==='POST'&&b.action==='QUOTE'){
    const inquiryId=clean(b.inquiry_id,120);
    const inquiry=await env.BOOKINGS_DB.prepare(`SELECT * FROM private_event_inquiries WHERE id=?`).bind(inquiryId).first();
    if(!inquiry)return json({error:'Private-event inquiry not found.'},404);
    const current=await env.BOOKINGS_DB.prepare(`SELECT COALESCE(MAX(version),0) v FROM private_event_quotes WHERE inquiry_id=?`).bind(inquiryId).first();const version=Number(current?.v||0)+1;
    const base=Math.max(0,Number(b.base_fee_pence)||0),travel=Math.max(0,Number(b.travel_fee_pence)||0),equipment=Math.max(0,Number(b.equipment_fee_pence)||0),extra=Math.max(0,Number(b.extra_fee_pence)||0),discount=Math.max(0,Number(b.discount_pence)||0),total=Math.max(0,base+travel+equipment+extra-discount),deposit=Math.min(total,Math.max(0,Number(b.deposit_pence)||0));
    if(base<=0||total<=0)return json({error:'Add a session/base fee before sending the quote.'},400);
    const quoteId=crypto.randomUUID();
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`INSERT INTO private_event_quotes(id,inquiry_id,version,agreed_date,agreed_start_time,agreed_end_time,agreed_venue,agreed_address,package_description,base_fee_pence,travel_fee_pence,equipment_fee_pence,extra_fee_pence,discount_pence,total_pence,deposit_pence,balance_due_pence,balance_due_date,quote_expires_at,cancellation_terms,customer_notes,internal_notes,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'QUOTE_SENT')`).bind(quoteId,inquiryId,version,clean(b.agreed_date,10),clean(b.agreed_start_time,8),clean(b.agreed_end_time,8),clean(b.agreed_venue,160),clean(b.agreed_address,300),clean(b.package_description,1000),base,travel,equipment,extra,discount,total,deposit,total-deposit,clean(b.balance_due_date,10),clean(b.quote_expires_at,30),clean(b.cancellation_terms,1200),clean(b.customer_notes,1200),clean(b.internal_notes,1200)),
      env.BOOKINGS_DB.prepare(`UPDATE private_event_inquiries SET status='QUOTE_SENT',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(inquiryId),
      env.BOOKINGS_DB.prepare(`INSERT INTO private_event_timeline(inquiry_id,actor_type,actor_label,action,details_json) VALUES(?,?,?,?,?)`).bind(inquiryId,'ADMIN',check.state.email,'QUOTE_SENT',JSON.stringify({quote_id:quoteId,total_pence:total,deposit_pence:deposit}))
    ]);
    let emailSent=false,emailWarning='';
    const customerEmail=clean(inquiry.customer_email,254);
    if(emailOk(customerEmail)){
      try{
        const origin=new URL(request.url).origin;
        const proposalUrl=`${origin}/private-quote.html?token=${encodeURIComponent(inquiry.secure_token)}`;
        const pounds=p=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(p)||0)/100);
        const subject=`Your Boot Scootin’ private event quote — ${clean(inquiry.reference,80)}`;
        const text=`Hi ${clean(inquiry.customer_name,120)||'there'},\n\nYour private event quote is ready.\n\nTotal: ${pounds(total)}\nDeposit: ${pounds(deposit)}\nBalance after deposit: ${pounds(total-deposit)}\n\nReview your secure proposal here:\n${proposalUrl}\n\nYou can review the details and request changes from that page.\n\nNora\nBoot Scootin’ Line Dancing`;
        const html=`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1111"><h2>Your Boot Scootin’ private event quote is ready</h2><p>Hi ${clean(inquiry.customer_name,120)||'there'},</p><p>Your private event proposal is ready to review.</p><p><strong>Total:</strong> ${pounds(total)}<br><strong>Deposit:</strong> ${pounds(deposit)}<br><strong>Balance after deposit:</strong> ${pounds(total-deposit)}</p><p><a href="${proposalUrl}" style="display:inline-block;padding:14px 20px;background:#c81924;color:white;text-decoration:none;font-weight:700">REVIEW YOUR PROPOSAL</a></p><p>You can review the details and request changes securely from that page.</p><p>Nora<br><strong>Boot Scootin’ Line Dancing</strong></p></div>`;
        const sent=await sendTransactionalEmail(env,customerEmail,subject,html,text,'events');
        emailSent=!sent?.skipped;
        if(sent?.skipped)emailWarning=sent.reason||'Email provider is not configured.';
      }catch(error){emailWarning=clean(error?.message||error,300);}
    }else emailWarning='The inquiry does not contain a valid customer email address.';
    await env.BOOKINGS_DB.prepare(`INSERT INTO private_event_timeline(inquiry_id,actor_type,actor_label,action,details_json) VALUES(?,?,?,?,?)`).bind(inquiryId,'SYSTEM','email','QUOTE_EMAIL',JSON.stringify({sent:emailSent,warning:emailWarning})).run().catch(()=>{});
    return json({ok:true,quote_id:quoteId,email_sent:emailSent,email_warning:emailWarning});
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
    email: notificationConfig(env).emailReady ? { status: 'ready', message: 'Transactional email is configured.' } : { status: 'setup', message: 'Add RESEND_API_KEY and EMAIL_FROM for confirmations.' },
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
  const sumupCheck = await checkSumUpConnection(env);
  services.payments = sumupCheck.ready
    ? { status: 'test_mode', message: sumupCheck.message }
    : { status: sumupCheck.status, message: sumupCheck.message };
  if (notificationConfig(env).emailReady) services.email = { status: 'ready', message: 'Email credentials are configured.' };
  services.sms = notificationConfig(env).smsReady ? { status: 'ready', message: 'SMS credentials are configured.' } : { status: 'setup', message: 'Add Twilio credentials to send optional text confirmations.' };
  if (env.BACKUP_LAST_TESTED) services.backups = { status: 'ready', message: `Last restore test recorded: ${String(env.BACKUP_LAST_TESTED).slice(0, 30)}` };

  return json({ mode: 'free-pilot', version: 76, checked_at: new Date().toISOString(), services });
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
  return json({ ready, authorised: admin.authorised, checks, error, version: 76 });
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


async function adminPromotions(request,env){
  const check=await requireAdmin(request,env); if(!check.ok)return check.response; await ensureBookingSchema(env);
  if(request.method==='GET'){
    try{
      const result=await env.BOOKINGS_DB.prepare(`SELECT p.*,(SELECT COUNT(*) FROM promotion_codes pc WHERE pc.promotion_id=p.id) issued,(SELECT COUNT(*) FROM promotion_redemptions pr JOIN promotion_codes pc2 ON pc2.id=pr.promotion_code_id WHERE pc2.promotion_id=p.id) redeemed,(SELECT COALESCE(SUM(pr2.discount_pence),0) FROM promotion_redemptions pr2 JOIN promotion_codes pc3 ON pc3.id=pr2.promotion_code_id WHERE pc3.promotion_id=p.id) discounted_pence FROM promotions p ORDER BY p.created_at DESC`).all();
      return json({promotions:result.results||[]});
    }catch(error){
      console.error('admin promotions GET failed',error);
      return json({error:'Promotions could not be loaded from D1. Run System Health and retry.',detail:String(error?.message||error)},500);
    }
  }
  const body=await request.json().catch(()=>null); if(!body)return json({error:'Promotion request could not be read.'},400);
  if(body.action==='CREATE'){
    const id=crypto.randomUUID(), code=normalisePromoCode(body.code), type=clean(body.discount_type,12);
    if(!clean(body.name,100)||!code||!['PERCENT','FIXED','FREE'].includes(type))return json({error:'Add a name, code and valid discount type.'},400);
    const value=type==='PERCENT'?Math.min(100,Math.max(1,Number(body.discount_value)||0)):type==='FIXED'?Math.max(1,Math.round(Number(body.discount_value)||0)):100;
    await env.BOOKINGS_DB.prepare(`INSERT INTO promotions(id,name,code_prefix,discount_type,discount_value,starts_at,ends_at,max_uses,uses_per_customer,active) VALUES(?,?,?,?,?,?,?,?,?,1)`).bind(id,clean(body.name,100),code,type,value,clean(body.starts_at,30)||null,clean(body.ends_at,30)||null,body.max_uses?Number(body.max_uses):null,Math.max(1,Number(body.uses_per_customer)||1)).run();
    await env.BOOKINGS_DB.prepare(`INSERT INTO promotion_codes(id,promotion_id,code,max_uses,active) VALUES(?,?,?,?,1)`).bind(crypto.randomUUID(),id,code,body.max_uses?Number(body.max_uses):999999).run();
    return json({ok:true,id,code});
  }
  if(body.action==='TOGGLE'){await env.BOOKINGS_DB.prepare(`UPDATE promotions SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?`).bind(clean(body.id,80)).run();return json({ok:true});}
  return json({error:'Unsupported promotion action.'},400);
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
  async scheduled(event, env, ctx) { ctx.waitUntil(Promise.all([processDueCampaigns(env),processAutomaticBookingNotifications(env)])); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const incomingPath = url.pathname;
    const path = incomingPath.startsWith('/ranch/api/admin/')
      ? incomingPath.slice('/ranch'.length)
      : incomingPath;
    try {
      if (path === '/api/admin/health' && request.method === 'GET') return health(request, env);
      if (path === '/api/classes' && request.method === 'GET') return publicClasses(env);
      if (path === '/api/class-reservations' && request.method === 'POST') return createClassReservation(request, env);
      if (path === '/api/promotions/validate' && request.method === 'POST') return publicPromoValidate(request, env);
      if (path === '/api/merch-orders' && request.method === 'POST') return createMerchOrder(request, env);
      if (path === '/api/merch-order-status' && request.method === 'GET') return merchOrderStatus(request, env, url);
      if (path === '/api/admin/merch-orders' && ['GET','PATCH'].includes(request.method)) return adminMerchOrders(request, env);
      if (path === '/api/sumup-webhook' && request.method === 'POST') return sumUpWebhook(request, env);
      if (path === '/api/sumup/callback' && request.method === 'GET') return sumUpOAuthCallback(request, env, url);
      if (path === '/api/booking-status' && request.method === 'GET') return bookingStatus(request, env, url);
      if (path === '/api/booking-cancel' && request.method === 'POST') return cancelBooking(request, env);
      if (path === '/api/admin/system-health' && request.method === 'GET') return systemHealth(request, env);
      if (path === '/api/admin/cleanup-known-august-tests' && request.method === 'POST') return cleanupKnownAugustTestBookings(request, env);
      if (path === '/api/admin/bootstrap' && request.method === 'GET') return adminBootstrap(request, env);
      if (path === '/api/customer-portal-link' && request.method === 'POST') return customerPortalLink(request, env);
      if (path === '/api/customer-portal' && request.method === 'GET') return customerPortal(request, env, url);
      if (path === '/api/booking-calendar' && request.method === 'GET') return bookingCalendar(request, env, url);
      if (path === '/api/private-events/inquiries' && request.method === 'POST') return privateEventInquiry(request, env);
      if (path === '/api/private-events/quote' && request.method === 'GET') return publicPrivateQuote(request, env, url);
      if (path === '/api/private-events/respond' && request.method === 'POST') return privateEventRespond(request, env);
      // Private-event payment compatibility route. Safari/Pages may preserve a trailing slash
      // or an older payment alias from a cached proposal page, so accept all known variants.
      if ((path === '/api/private-events/pay' || path === '/api/private-events/pay/' || path === '/api/private-event-pay' || path === '/api/private-events/payment') && (request.method === 'POST' || request.method === 'GET')) return privateEventPay(request, env);
      if (path === '/api/admin/classes') return adminClasses(request, env);
      if (path === '/api/admin/sumup-oauth/connect' && request.method === 'GET') return sumUpOAuthStart(request, env);
      if (path === '/api/admin/sumup-oauth') return sumUpOAuthAdmin(request, env);
      if (path === '/api/admin/bookings') return adminBookings(request, env, ctx);
      if (path === '/api/admin/customers') return adminCustomers(request, env);
      if (path === '/api/admin/promotions') return adminPromotions(request, env);
      if (path === '/api/admin/emails') return adminEmailCentre(request, env, ctx);
      if (path === '/api/mailing-list/subscribe' && request.method === 'POST') return subscribeMailingList(request, env);
      if (path === '/api/email/unsubscribe' && request.method === 'GET') return unsubscribeEmail(request, env, url);
      if (path === '/api/automation/run') return runProtectedEmailAutomations(request, env);
      if (path === '/api/admin/operations' && request.method === 'GET') return adminOperations(request, env);
      if (path === '/api/admin/private-events') return adminPrivateEvents(request, env);
      if (path === '/api/admin/media-status' && request.method === 'GET') return mediaStatus(request, env);
      if (path === '/api/admin/media') return mediaCollection(request, env);
      if (path.startsWith('/media/')) return serveMedia(request, env, path);
      if (path.startsWith('/api/')) return json({ error: 'This API feature is not connected in the free pilot yet.' }, 404);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (path.startsWith('/api/') || incomingPath.startsWith('/ranch/api/')) return json({ error: 'Server error', detail: clean(error && error.message ? error.message : error, 500), code: 'UNHANDLED_API_ERROR' }, 500);
      return new Response('Boot Scootin’ is temporarily unavailable.', { status: 500 });
    }
  }
};
