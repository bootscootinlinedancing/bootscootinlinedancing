import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
assert.match(source,/INSERT INTO bookings\([\s\S]+welcomePromotionClaimed=await claimWelcomePromotion/,'booking marker is created before atomic welcome claim');
assert.match(source,/if\(!welcomePromotionClaimed\)\{[\s\S]+DELETE FROM bookings WHERE id=\?[\s\S]+UPDATE booking_holds SET expires_at/,'losing checkout removes its provisional booking and expires its hold');
const mod=await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {issueWelcomePromotion,validatePromotion,claimWelcomePromotion,releaseWelcomePromotion};').toString('base64')}`);
const db=new DatabaseSync(':memory:');
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE promotions(id TEXT PRIMARY KEY,name TEXT,code_prefix TEXT,discount_type TEXT,discount_value INTEGER,starts_at TEXT,ends_at TEXT,max_uses INTEGER,uses_per_customer INTEGER,applicable_class_id TEXT,personal_only INTEGER,active INTEGER);
CREATE TABLE promotion_codes(id TEXT PRIMARY KEY,promotion_id TEXT REFERENCES promotions(id),code TEXT UNIQUE,customer_email TEXT,issued_reason TEXT,issued_at TEXT DEFAULT CURRENT_TIMESTAMP,expires_at TEXT,max_uses INTEGER,active INTEGER);
CREATE TABLE bookings(id TEXT PRIMARY KEY,customer_email TEXT,status TEXT,promo_code TEXT,hold_id TEXT);
CREATE TABLE booking_holds(id TEXT PRIMARY KEY,expires_at TEXT);
CREATE TABLE promotion_redemptions(id TEXT PRIMARY KEY,promotion_code_id TEXT REFERENCES promotion_codes(id),booking_id TEXT,customer_email TEXT,discount_pence INTEGER);
`);
const env={BOOKINGS_DB:{prepare(sql){let args=[];return{bind(...values){args=values;return this},async first(){return db.prepare(sql).get(...args)||null},async run(){const result=db.prepare(sql).run(...args);return{meta:{changes:Number(result.changes)}}}}}}};
const email='new.dancer@example.com';
const offer=await mod.issueWelcomePromotion(env,email);
assert.ok(offer?.code?.startsWith('WELCOME-'),'new subscriber receives welcome code');
assert.equal((await mod.issueWelcomePromotion(env,email)).code,offer.code,'exact signup retry returns same code');

const input={code:offer.code,email,classId:'class-a',subtotal:600,anniversary:false};
assert.equal((await mod.validatePromotion(env,input)).valid,true,'A: new subscriber with no paid booking is valid');
assert.equal((await mod.validatePromotion(env,{...input,email:'someone.else@example.com'})).valid,false,'F: different email is rejected');
assert.match((await mod.validatePromotion(env,{...input,anniversary:true})).error,/regular class/i,'E: Anniversary is rejected');

const validated=await mod.validatePromotion(env,input);
const claims=await Promise.all([mod.claimWelcomePromotion(env,validated),mod.claimWelcomePromotion(env,validated)]);
assert.deepEqual(claims.sort(),[false,true],'overlapping checkouts have exactly one winner');
db.prepare(`INSERT INTO booking_holds(id,expires_at) VALUES('hold-a',strftime('%Y-%m-%dT%H:%M:%fZ','now','+15 minutes'))`).run();
db.prepare(`INSERT INTO bookings(id,customer_email,status,promo_code,hold_id) VALUES('pending-a',?,'PENDING',?,'hold-a')`).run(email,offer.code);
await mod.releaseWelcomePromotion(env,offer.id);
assert.equal(db.prepare(`SELECT active FROM promotion_codes WHERE id=?`).get(offer.id).active,0,'active pending checkout retains reservation');
db.prepare(`UPDATE bookings SET status='FAILED' WHERE id='pending-a'`).run();
db.prepare(`UPDATE booking_holds SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute') WHERE id='hold-a'`).run();
await mod.releaseWelcomePromotion(env,offer.id);
assert.equal(db.prepare(`SELECT active FROM promotion_codes WHERE id=?`).get(offer.id).active,1,'failed/expired attempt releases offer');
assert.equal(await mod.claimWelcomePromotion(env,validated),true,'failed payment can retry');

db.prepare(`INSERT INTO bookings(id,customer_email,status,promo_code) VALUES('paid-a',?,'PAID',?)`).run(email,offer.code);
db.prepare(`INSERT INTO promotion_redemptions(id,promotion_code_id,booking_id,customer_email,discount_pence) VALUES('redemption-a',?,'paid-a',?,60)`).run(offer.id,email);
assert.match((await mod.validatePromotion(env,input)).error,/first booking/i,'B: later validation is rejected after a paid booking');
await mod.releaseWelcomePromotion(env,offer.id);
assert.equal(db.prepare(`SELECT active FROM promotion_codes WHERE id=?`).get(offer.id).active,0,'successful redemption remains consumed');

const paidEmail='existing@example.com';
db.prepare(`INSERT INTO bookings(id,customer_email,status) VALUES('paid-existing',?,'PAID')`).run(paidEmail);
assert.equal(await mod.issueWelcomePromotion(env,paidEmail),null,'D: existing paid customer gets no welcome code');
console.log('PASS welcome first-booking, ownership, Anniversary exclusion, atomic claim, retry release and permanent one-use redemption');
