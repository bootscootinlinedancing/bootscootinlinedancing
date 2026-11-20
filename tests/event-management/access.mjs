import assert from 'node:assert/strict';import {eventOwnerAccess} from '../../event-management-access.js';
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'synthetic'};
const env={ADMIN_EMAIL:'owner@example.test',EVENT_MANAGEMENT_HQ_ORIGIN:'https://hq.example.test',EVENT_MANAGEMENT_ACCESS_ISSUER:'https://access.example.test',EVENT_MANAGEMENT_ACCESS_AUD:'synthetic-audience',EVENT_MANAGEMENT_ACCESS_JWKS:JSON.stringify([jwk])};
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
async function jwt(claims={}){const prefix=encode({alg:'RS256',kid:'synthetic'})+'.'+encode({email:env.ADMIN_EMAIL,iss:env.EVENT_MANAGEMENT_ACCESS_ISSUER,aud:[env.EVENT_MANAGEMENT_ACCESS_AUD],exp:Math.floor(Date.now()/1000)+600,...claims});return prefix+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(prefix))).toString('base64url')}
const request=token=>new Request('https://hq.example.test/ranch/api/admin/event-management',{headers:{'Cf-Access-Jwt-Assertion':token}});
assert.equal((await eventOwnerAccess(request(await jwt()),env)).state.email,env.ADMIN_EMAIL);
for(const claim of [{email:'other@example.test'},{exp:0},{iss:'wrong'},{aud:['wrong']},{nbf:Date.now()/1000+9999}])assert((await eventOwnerAccess(request(await jwt(claim)),env)).response);
assert.equal((await eventOwnerAccess(new Request('https://hq.example.test/ranch/api/admin/event-management',{headers:{'Cf-Access-Authenticated-User-Email':env.ADMIN_EMAIL}}),env)).response.status,401);
assert.equal((await eventOwnerAccess(new Request('https://spoof.example.test/ranch/api/admin/event-management',{headers:{'Cf-Access-Jwt-Assertion':await jwt()}}),env)).response.status,404);
console.log('PASS signed owner gate, spoofed headers, wrong origin/issuer/audience/expiry/not-before and non-owner rejection. Synthetic keys only.');
