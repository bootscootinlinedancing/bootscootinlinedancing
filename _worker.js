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
    `CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(customer_email)`,
    `CREATE INDEX IF NOT EXISTS idx_waiting_class_status ON waiting_list(class_id,status)`,
    `CREATE INDEX IF NOT EXISTS idx_private_event_status ON private_event_inquiries(status,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_private_event_token ON private_event_inquiries(secure_token)`,
    `CREATE INDEX IF NOT EXISTS idx_private_quote_inquiry ON private_event_quotes(inquiry_id,version)`
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
    `ALTER TABLE waiting_list ADD COLUMN secure_token TEXT`
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
        WHERE b.class_id=c.id AND b.status IN ('PENDING','PAID')
      ),0) AS sold,
      c.status,c.level,c.public_notes,
      MAX(
        0,
        c.capacity
        - COALESCE((
            SELECT SUM(b.quantity)
            FROM bookings b
            WHERE b.class_id=c.id AND b.status IN ('PENDING','PAID')
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

  if (!name || !emailOk(email) || !classId) {
    return json({ error: 'Please enter your name, a valid email address and choose a class.' }, 400);
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

  const amount = Number(classRow.price_pence || 0) * quantity;
  const paymentReady = Boolean(env.SUMUP_API_KEY && env.SUMUP_MERCHANT_CODE);
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
        quantity,amount_pence,status,payment_provider,secure_token,customer_token,
        terms_accepted_at,marketing_consent,retention_delete_after
      ) VALUES(?,?,?,?,?,?,?,?,?,'PENDING',?,?,?,CURRENT_TIMESTAMP,?,datetime('now','+24 months'))`
    ).bind(
      id, reference, classId, holdId, name, email, phone, quantity, amount,
      paymentReady ? 'SUMUP' : 'MANUAL', secureToken, customerToken,
      Number(Boolean(body.marketing_consent))
    ).run();
  } catch (_) {
    await env.BOOKINGS_DB.prepare(
      `INSERT INTO bookings(
        id,reference,class_id,hold_id,customer_name,customer_email,customer_phone,
        quantity,amount_pence,status,payment_provider,secure_token,
        terms_accepted_at,marketing_consent,retention_delete_after
      ) VALUES(?,?,?,?,?,?,?,?,?,'PENDING',?,?,CURRENT_TIMESTAMP,?,datetime('now','+24 months'))`
    ).bind(
      id, reference, classId, holdId, name, email, phone, quantity, amount,
      paymentReady ? 'SUMUP' : 'MANUAL', secureToken,
      Number(Boolean(body.marketing_consent))
    ).run();
  }

  await env.BOOKINGS_DB.prepare(
    `INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json)
     VALUES(?,?,?,?,?)`
  ).bind(
    email, 'BOOKING_CREATED', 'booking', id,
    JSON.stringify({ reference, quantity, terms: true, paymentReady })
  ).run();

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
        hosted_checkout: { enabled: true }
      };

      const sumup = await fetch('https://api.sumup.com/v0.1/checkouts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SUMUP_API_KEY}`,
          'Content-Type': 'application/json'
        },
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
    } catch (_) {
      // Fall through to manual reservation.
    }
  }

  // Safe fallback: reserve the space and let Nora confirm payment manually.
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

async function syncSumUpBooking(env, booking) {
  if(!booking?.provider_checkout_id||!env.SUMUP_API_KEY) return booking;
  const response=await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(booking.provider_checkout_id)}`,{
    headers:{Authorization:`Bearer ${env.SUMUP_API_KEY}`,Accept:'application/json'}
  });
  if(!response.ok)return booking;
  const checkout=await response.json();
  if(checkout.status==='PAID'&&booking.status!=='PAID'){
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='PAID',paid_at=CURRENT_TIMESTAMP,provider_transaction_id=COALESCE(?,provider_transaction_id) WHERE id=?`).bind(checkout.transaction_id||null,booking.id),
      env.BOOKINGS_DB.prepare(`UPDATE classes SET sold=sold+?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND sold+?<=capacity`).bind(booking.quantity,booking.class_id,booking.quantity),
      env.BOOKINGS_DB.prepare(`DELETE FROM booking_holds WHERE id=?`).bind(booking.hold_id)
    ]);
    booking.status='PAID';
  }else if(['FAILED','EXPIRED'].includes(checkout.status)&&booking.status==='PENDING'){
    await env.BOOKINGS_DB.batch([
      env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='FAILED' WHERE id=?`).bind(booking.id),
      env.BOOKINGS_DB.prepare(`DELETE FROM booking_holds WHERE id=?`).bind(booking.hold_id)
    ]);
    booking.status='FAILED';
  }
  return booking;
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
    payment_enabled:Boolean(env.SUMUP_API_KEY&&env.SUMUP_MERCHANT_CODE),can_cancel:['PENDING','PAID'].includes(booking.status),
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
    access: { status: 'setup', label: 'Cloudflare Access not configured yet' },
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

  result.payments = env.SUMUP_API_KEY && env.SUMUP_MERCHANT_CODE
    ? { status: 'ready', label: 'SumUp sandbox connected' }
    : { status: 'setup', label: 'SumUp sandbox not connected yet' };

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
  const attended=results.filter(b=>Number(b.attended)===1).length;
  const loyaltyProgress=attended%9;

  return json({
    customer_name:owner.customer_name,
    upcoming,history,
    summary:{
      upcoming:upcoming.length,
      attended,
      loyalty_progress:loyaltyProgress,
      reward_ready:attended>0&&attended%9===0
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
  const check=requireAccessAdmin(request,env);
  if(check.response)return check.response;
  await ensureBookingSchema(env);

  if(request.method==='GET'){
    const {results}=await env.BOOKINGS_DB.prepare(`
      SELECT
        c.*,
        COALESCE((SELECT SUM(quantity) FROM waiting_list w WHERE w.class_id=c.id AND w.status='WAITING'),0) AS waiting,
        COALESCE((SELECT COUNT(*) FROM bookings b WHERE b.class_id=c.id AND b.status IN ('PENDING','PAID')),0) AS booking_count
      FROM classes c
      ORDER BY c.starts_at
    `).all();
    return json(results);
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
      INSERT INTO classes(id,title,venue,location,starts_at,ends_at,price_pence,capacity,status,level,public_notes)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id,original.title,original.venue,original.location,start.toISOString(),end?end.toISOString():null,
      original.price_pence,original.capacity,'draft',original.level,original.public_notes
    ).run();
    return json({ok:true,id},201);
  }

  if(request.method==='PATCH' && action==='STATUS'){
    const id=clean(b.id,120);
    const status=clean(b.status,20);
    if(!['draft','open','closed','cancelled'].includes(status))return json({error:'Invalid class status.'},400);
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
    status,clean(b.level,80)||'Beginner friendly',clean(b.public_notes,600)
  ];

  if(request.method==='POST'){
    await env.BOOKINGS_DB.prepare(`
      INSERT INTO classes(id,title,venue,location,starts_at,ends_at,price_pence,capacity,status,level,public_notes)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).bind(id,...vals).run();
    return json({ok:true,id},201);
  }

  if(request.method==='PATCH'){
    const existing=await env.BOOKINGS_DB.prepare(`SELECT sold FROM classes WHERE id=?`).bind(id).first();
    if(!existing)return json({error:'The class could not be found.'},404);
    if(Number(b.capacity)<Number(existing.sold||0)){
      return json({error:`Capacity cannot be lower than the ${existing.sold} places already booked.`},409);
    }
    await env.BOOKINGS_DB.prepare(`
      UPDATE classes
      SET title=?,venue=?,location=?,starts_at=?,ends_at=?,price_pence=?,capacity=?,status=?,level=?,public_notes=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(...vals,id).run();
    return json({ok:true,id});
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
      sumup: Boolean(env.SUMUP_API_KEY && env.SUMUP_MERCHANT_CODE)
    },
    summary: {
      upcoming_classes: 0,
      places_booked: 0,
      paid_revenue: 0,
      media_files: 0,
      pending_payments: 0,
      waiting_guests: 0,
      refund_review: 0,
      private_event_count: 0
    },
    classes: [],
    activity: [],
    setup_steps: []
  };

  if (!admin.email) result.setup_steps.push('Protect /ranch* and /api/admin/* with Cloudflare Access.');
  if (!env.BOOKINGS_DB) result.setup_steps.push('Create and bind a D1 database using the binding name BOOKINGS_DB.');
  if (!env.MEDIA_BUCKET) result.setup_steps.push('Create and bind an R2 bucket using the binding name MEDIA_BUCKET.');
  if (!String(env.ADMIN_EMAIL || '').trim() && !admin.email) result.setup_steps.push('Add ADMIN_EMAIL as an environment variable.');
  if (!(env.SUMUP_API_KEY && env.SUMUP_MERCHANT_CODE)) result.setup_steps.push('Connect SumUp Sandbox after D1 and Access checks pass.');

  if (env.BOOKINGS_DB) {
    try {
      await ensureBookingSchema(env);
      const now = new Date().toISOString();
      const [classesResult, stats, activityResult, privateResult] = await Promise.all([
        env.BOOKINGS_DB.prepare(`
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
        `).bind(now).all(),
        env.BOOKINGS_DB.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN status IN ('PENDING','PAID') THEN quantity ELSE 0 END),0) places_booked,
            COALESCE(SUM(CASE WHEN status='PAID' THEN amount_pence ELSE 0 END),0) paid_revenue,
            COALESCE(SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END),0) pending_payments,
            COALESCE(SUM(CASE WHEN refund_status IN ('REFUND_DUE','CREDIT_DUE','REVIEW_IF_RESOLD','ADMIN_REVIEW') THEN 1 ELSE 0 END),0) refund_review
          FROM bookings
        `).first(),
        env.BOOKINGS_DB.prepare(`
          SELECT action,target_type,created_at
          FROM audit_log
          ORDER BY created_at DESC
          LIMIT 10
        `).all(),
        env.BOOKINGS_DB.prepare(`SELECT COUNT(*) total FROM private_event_inquiries`).first()
      ]);

      const waiting = await env.BOOKINGS_DB.prepare(`
        SELECT COALESCE(SUM(quantity),0) total FROM waiting_list WHERE status='WAITING'
      `).first();

      result.classes = classesResult.results || [];
      result.summary.upcoming_classes = result.classes.filter(row => row.status === 'open').length;
      result.summary.places_booked = Number(stats?.places_booked || 0);
      result.summary.paid_revenue = Number(stats?.paid_revenue || 0);
      result.summary.pending_payments = Number(stats?.pending_payments || 0);
      result.summary.refund_review = Number(stats?.refund_review || 0);
      result.summary.waiting_guests = Number(waiting?.total || 0);
      result.summary.private_event_count = Number(privateResult?.total || 0);
      result.activity = (activityResult.results || []).map(row => ({
        action: row.action,
        target_type: row.target_type,
        created_at: row.created_at
      }));
    } catch (error) {
      result.database_error = error.message;
    }
  }

  if (env.MEDIA_BUCKET) {
    try {
      const items = await readIndex(env);
      result.summary.media_files = items.length;
    } catch (error) {
      result.media_error = error.message;
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

  const { results } = await env.BOOKINGS_DB.prepare(`
    SELECT
      lower(b.customer_email) customer_key,
      MAX(b.customer_name) customer_name,
      lower(b.customer_email) customer_email,
      MAX(b.customer_phone) customer_phone,
      COUNT(*) total_bookings,
      SUM(CASE WHEN b.status='PAID' THEN 1 ELSE 0 END) paid_bookings,
      SUM(CASE WHEN b.status='CANCELLED' THEN 1 ELSE 0 END) cancelled_bookings,
      SUM(CASE WHEN a.booking_id IS NOT NULL THEN 1 ELSE 0 END) attended_classes,
      MAX(b.marketing_consent) marketing_consent,
      MAX(b.created_at) last_booking_at
    FROM bookings b
    LEFT JOIN attendance a ON a.booking_id=b.id
    GROUP BY lower(b.customer_email)
    ORDER BY last_booking_at DESC
  `).all();

  return json({
    customers: results.map(row => ({
      ...row,
      loyalty_progress: Number(row.attended_classes || 0) % 9,
      reward_ready: Number(row.attended_classes || 0) > 0 && Number(row.attended_classes || 0) % 9 === 0
    }))
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

async function adminBookings(request, env) {
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
      refunds_due:results.filter(b=>['REFUND_DUE','CREDIT_DUE','REVIEW_IF_RESOLD'].includes(b.refund_status)).length,
      waiting:waiting.filter(w=>w.status==='WAITING').reduce((n,w)=>n+Number(w.quantity||0),0)
    };
    return json({
      bookings:(results||[]).map(booking=>({
        ...booking,
        is_test_candidate:isTestBookingCandidate(booking)
      })),
      waiting,
      stats
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

  if(action==='MARK_PAID'){
    if(booking.status!=='PAID'){
      await env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='PAID',paid_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    }
  }else if(action==='CANCEL'){
    if(['PENDING','PAID'].includes(booking.status)){
      await env.BOOKINGS_DB.batch([
        env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='CANCELLED',cancellation_requested_at=COALESCE(cancellation_requested_at,CURRENT_TIMESTAMP),refund_status=COALESCE(refund_status,'ADMIN_REVIEW') WHERE id=?`).bind(id),
        env.BOOKINGS_DB.prepare(`UPDATE classes SET sold=MAX(0,sold-?),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(booking.quantity,booking.class_id)
      ]);
    }
  }else if(action==='MARK_REFUNDED'){
    await env.BOOKINGS_DB.prepare(`UPDATE bookings SET status='REFUNDED',refund_status='REFUNDED',refund_amount_pence=?,admin_notes=? WHERE id=?`)
      .bind(Math.max(0,Number(body.refund_amount_pence)||booking.amount_pence),clean(body.admin_notes,600),id).run();
  }else if(action==='ISSUE_CREDIT'){
    await env.BOOKINGS_DB.prepare(`UPDATE bookings SET refund_status='CLASS_CREDIT_ISSUED',admin_notes=? WHERE id=?`).bind(clean(body.admin_notes,600),id).run();
  }else if(action==='CHECK_IN'){
    await env.BOOKINGS_DB.prepare(`INSERT OR IGNORE INTO attendance(id,booking_id,checked_in_by) VALUES(?,?,?)`).bind(crypto.randomUUID(),id,check.state.email).run();
  }else if(action==='NO_SHOW'){
    await env.BOOKINGS_DB.prepare(`UPDATE bookings SET admin_notes=? WHERE id=?`).bind(`NO SHOW — ${clean(body.admin_notes,500)}`,id).run();
  }else{
    return json({error:'Unknown booking action.'},400);
  }
  await env.BOOKINGS_DB.prepare(`INSERT INTO audit_log(actor,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)`)
    .bind(check.state.email,action,'booking',id,JSON.stringify(body)).run();
  return json({ok:true});
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
    const incomingPath = url.pathname;
    const path = incomingPath.startsWith('/ranch/api/admin/')
      ? incomingPath.slice('/ranch'.length)
      : incomingPath;
    try {
      if (path === '/api/admin/health' && request.method === 'GET') return health(request, env);
      if (path === '/api/classes' && request.method === 'GET') return publicClasses(env);
      if (path === '/api/class-reservations' && request.method === 'POST') return createClassReservation(request, env);
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
      if (path === '/api/admin/classes') return adminClasses(request, env);
      if (path === '/api/admin/bookings') return adminBookings(request, env);
      if (path === '/api/admin/customers' && request.method === 'GET') return adminCustomers(request, env);
      if (path === '/api/admin/operations' && request.method === 'GET') return adminOperations(request, env);
      if (path === '/api/admin/private-events') return adminPrivateEvents(request, env);
      if (path === '/api/admin/media-status' && request.method === 'GET') return mediaStatus(request, env);
      if (path === '/api/admin/media') return mediaCollection(request, env);
      if (path.startsWith('/media/')) return serveMedia(request, env, path);
      if (path.startsWith('/api/')) return json({ error: 'This API feature is not connected in the free pilot yet.' }, 404);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (path.startsWith('/api/') || incomingPath.startsWith('/ranch/api/')) return json({ error: 'Server error', detail: error.message }, 500);
      return new Response('Boot Scootin’ is temporarily unavailable.', { status: 500 });
    }
  }
};
