import {reply} from './event-management.js';
// Public signing keys mirror the existing exact-payment diagnostic. Rotation fails closed.
const pinnedKeys=[{"kid": "6bf0d866e68daa7718f87ddef9265b13213411f77605b6fa941d55aa712dad13", "kty": "RSA", "alg": "RS256", "use": "sig", "e": "AQAB", "n": "rZTqvBrSE8CxVl_OjlZhexE00CqrkVckqQUMSBI-KDVsUamzLzmvw3qykP0KPG03K3hTTy8Wm-vQ3xRN92zZptN2HL_hzREN91O2I69e9AFsDxIdOp7f76XtDM9NyUCluhg7cv6q6SHI-WcDS1mgJwPx-6CBU-1x_lMZdaIy3RZkxKNkczmvP3f4lb6GUBDavzKW4l3K-1cnOmIpjdAJhpdYzWQ3nwlQRthYqAkLkGS2gSk_Fbq1EdYIgWPoSXes7eaZ1ioOor3FRdct33vpFiRY0INzB8sUKZOrAN5lFG-Vw2xLtQ7VkDq8IfDB378-LzfBa68m5UpoSe_pOJgxzw"}, {"kid": "16870b82dffc15ff575024b8d8e60762e70b375fd5750bfb0906d77756474129", "kty": "RSA", "alg": "RS256", "use": "sig", "e": "AQAB", "n": "xkUNm2Glj0RKlgpPv5F1wuAQuDvhTpcbrBJ2nBng9Ik0dWkuHz-7c24MwY1TYxl1cdMJjdwCC0B2_u3lg1S4EpGUb4imCBlIUvZ1E5XEfhvCZEsWX_cN9Q8p3_P3sSgeHUzuj-IgicNdNHbOxK5cMHvXwDP5zeBo911kB4R_tqX7nUrAodAngvYlR4oD9tKB42StVs9giIrK1EsDeAr4ONx1Fc0tsjP_faA5rhyD3sf2HiqAKEnHOB2v3F6xIK0XjfqDDO180HTPN_-gYWSqj1paeyAPRriFZQAmJqWYR7tVNUxsmJURLnDrabhlkw502qamkL4PfH24De6Z_auftw"}];
export async function eventOwnerAccess(request,env){
 try{
 const url=new URL(request.url),origin=env.EVENT_MANAGEMENT_HQ_ORIGIN||'https://bootscootinlinedancing.co.uk';
 if(url.origin!==origin||!url.pathname.startsWith('/ranch/'))return {response:reply({error:'NOT_FOUND'},404)};
 const jwt=request.headers.get('Cf-Access-Jwt-Assertion')||request.headers.get('cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
 const parts=String(jwt||'').split('.');if(parts.length!==3)throw Error();
 const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
 const header=JSON.parse(new TextDecoder().decode(bytes(parts[0]))),claims=JSON.parse(new TextDecoder().decode(bytes(parts[1])));
 const keys=env.EVENT_MANAGEMENT_ACCESS_JWKS?JSON.parse(env.EVENT_MANAGEMENT_ACCESS_JWKS):pinnedKeys;
 const jwk=keys.find(k=>k.kid===header.kid);
 if(header.alg!=='RS256'||!jwk||claims.iss!==(env.EVENT_MANAGEMENT_ACCESS_ISSUER||'https://still-sunset-1371.cloudflareaccess.com')||![].concat(claims.aud||[]).includes(env.EVENT_MANAGEMENT_ACCESS_AUD||'bad3d946a17b7b31b9c97dbfbe9ed3f55b1120ca47636adf95c3e918bf496eb3')||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now()||(claims.nbf&&claims.nbf*1000>Date.now()+60000))throw Error();
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error();
 const owner=String(env.ADMIN_EMAIL||'').trim().toLowerCase(),email=String(claims.email||'').toLowerCase(),forwarded=String(request.headers.get('Cf-Access-Authenticated-User-Email')||'').toLowerCase();
 if(!owner||email!==owner||(forwarded&&forwarded!==owner))return {response:reply({error:'OWNER_REQUIRED'},403)};
 return {state:{email}};
 }catch{return {response:reply({error:'HQ_SIGN_IN_REQUIRED'},401)}}
}
