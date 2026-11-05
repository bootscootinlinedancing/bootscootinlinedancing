import assert from 'node:assert/strict';

const base=String(process.env.STAGING_URL||process.argv[2]||'').replace(/\/$/,'');
assert(base,'Pass the protected deployment URL as STAGING_URL or the first argument.');
const url=new URL(base);
assert.equal(url.protocol,'https:','Staging must use HTTPS.');
assert(url.hostname.endsWith('.bootscootin-special-events-staging.pages.dev'),'Refusing to smoke-test a non-staging hostname.');

const access=await fetch(`${base}/ranch`,{redirect:'manual'});
assert.equal(access.status,302,'Unauthorised HQ requests must be intercepted by Cloudflare Access.');
assert.match(access.headers.get('location')||'',/\.cloudflareaccess\.com\/cdn-cgi\/access\/login\//,'HQ must redirect to the staging Access application.');

const cookie=process.env.STAGING_ACCESS_COOKIE;
if(!cookie){
  console.log('PASS staging hostname isolation and unauthorised Cloudflare Access boundary.');
  console.log('AUTHENTICATED CHECK REQUIRED: set STAGING_ACCESS_COOKIE only in the protected deployment runner, then rerun before reporting owner readiness.');
  process.exitCode=2;
}else{
  const headers={cookie};
  const [eventResponse,healthResponse]=await Promise.all([
    fetch(`${base}/ranch/api/admin/special-events?id=special-event-johnny-rossato-2027`,{headers,redirect:'manual'}),
    fetch(`${base}/ranch/api/admin/system-health`,{headers,redirect:'manual'})
  ]);
  assert.equal(eventResponse.status,200,'The authenticated Special Events API must be available.');
  assert.equal(healthResponse.status,200,'The authenticated system-health API must be available.');
  const eventData=await eventResponse.json(),health=await healthResponse.json();
  assert.equal(eventData.event?.status,'DRAFT','Johnny must remain Draft in staging.');
  assert.equal(eventData.event?.programme_approval_status,'ARTIST_APPROVED');
  assert.equal(eventData.products?.length,10,'All ten ticket products must load.');
  assert(eventData.programme?.some(item=>item.day_id==='johnny-2027-saturday'),'Saturday programme must load.');
  assert(eventData.programme?.some(item=>item.day_id==='johnny-2027-sunday'),'Sunday programme must load.');
  assert.equal(health.database?.status,'ready','The isolated D1 binding must pass a live query.');
  assert.equal(health.media?.status,'ready','The isolated R2 binding must pass a live list operation.');
  console.log('PASS protected staging Access, isolated D1, Special Events Draft API, ticket/programme data, and R2 health.');
}
