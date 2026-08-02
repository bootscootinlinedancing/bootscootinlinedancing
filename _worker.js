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
    `CREATE INDEX IF NOT EXISTS idx_holds_class_expiry ON booking_holds(class_id, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_class_status ON bookings(class_id,status)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(customer_email)`,
    `CREATE INDEX IF NOT EXISTS idx_waiting_class_status ON waiting_list(class_id,status)`
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

  return json({ mode: 'free-pilot', version: 74, checked_at: new Date().toISOString(), services });
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
  return json({ ready, authorised: admin.authorised, checks, error, version: 74 });
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
