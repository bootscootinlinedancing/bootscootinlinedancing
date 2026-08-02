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
      await env.BOOKINGS_DB.prepare('SELECT 1 AS ok').first();
      services.database = { status: 'ready', message: 'Cloudflare D1 is connected and responding.' };
    } catch (error) {
      services.database = { status: 'attention', message: `D1 is bound, but its test query failed: ${error.message}` };
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

  return json({ mode: 'free-pilot', version: 73, checked_at: new Date().toISOString(), services });
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
  return json({ ready, authorised: admin.authorised, checks, error, version: 73 });
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
