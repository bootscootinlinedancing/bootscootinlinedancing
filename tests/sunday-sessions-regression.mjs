import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sundaySessionSelection,sundaySessionProducts} from '../_worker.js';

const price=(selection_code,adult_count,child_5_9_count,child_10_17_count,under_5_count=0)=>sundaySessionSelection({selection_code,adult_count,child_5_9_count,child_10_17_count,under_5_count});
assert.equal(price('INDIVIDUAL',1,0,0).calculated_amount_pence,600);
assert.equal(price('INDIVIDUAL',0,1,0).calculated_amount_pence,300);
assert.equal(price('INDIVIDUAL',0,0,1).calculated_amount_pence,400);
assert.deepEqual([price('FAMILY_1A1C',1,1,0).calculated_amount_pence,price('FAMILY_1A2C',1,2,0).calculated_amount_pence,price('FAMILY_2A1C',2,1,0).calculated_amount_pence,price('FAMILY_2A2C',2,2,0).calculated_amount_pence],[800,1000,1300,1500]);
assert.equal(price('FAMILY_2A2C',2,0,2,1).calculated_amount_pence,1700);
assert.equal(price('FAMILY_2A2C',2,0,2,1).total_people,5,'free under-5 must consume capacity');
assert.throws(()=>price('FAMILY_1A1C',1,2,0),/does not match/);
assert.throws(()=>price('INDIVIDUAL',0,0,0,2),/paid attendee/);
assert.throws(()=>price('INDIVIDUAL',10,0,0,1),/between 1 and 10/);
assert.equal(sundaySessionProducts().length,5);
assert.ok(sundaySessionProducts().every(product=>product.class_pass_eligible===false));

const db=new DatabaseSync(':memory:');
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE classes(id TEXT PRIMARY KEY,title TEXT,venue TEXT,location TEXT,starts_at TEXT,ends_at TEXT,price_pence INTEGER,capacity INTEGER,status TEXT,level TEXT,public_notes TEXT,poster_url TEXT);
CREATE TABLE bookings(id TEXT PRIMARY KEY,class_id TEXT NOT NULL REFERENCES classes(id),quantity INTEGER NOT NULL,amount_pence INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING');
CREATE TABLE waiting_list(id TEXT PRIMARY KEY,class_id TEXT NOT NULL REFERENCES classes(id),quantity INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'WAITING');
CREATE TABLE booking_attendees(id TEXT PRIMARY KEY,booking_id TEXT REFERENCES bookings(id),attendee_name TEXT);
CREATE TABLE class_guest_list(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),places INTEGER NOT NULL DEFAULT 1);
CREATE TABLE booking_holds(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),quantity INTEGER NOT NULL,expires_at TEXT NOT NULL);
`);
db.exec(fs.readFileSync(new URL('../migrations/0027_sunday_sessions.sql',import.meta.url),'utf8'));
const seeded=db.prepare(`SELECT status,capacity,special_booking_format FROM classes WHERE id='sunday-sessions-2026-11-29'`).get();
assert.equal(seeded.status,'draft');
assert.equal(seeded.capacity,75);
assert.equal(seeded.special_booking_format,'SUNDAY_SESSIONS');

const insertDetail=db.prepare(`INSERT INTO sunday_session_booking_details(booking_id,class_id,selection_code,adult_count,child_10_17_count,child_5_9_count,under_5_count,total_people,calculated_amount_pence,price_breakdown_json) VALUES(?,?,?,?,?,?,?,?,?,?)`);
db.prepare(`INSERT INTO bookings(id,class_id,quantity,amount_pence) VALUES('good','sunday-sessions-2026-11-29',5,1700)`).run();
insertDetail.run('good','sunday-sessions-2026-11-29','FAMILY_2A2C',2,2,0,1,5,1700,'{"bundle":1500,"teen_supplement":200}');
db.prepare(`INSERT INTO bookings(id,class_id,quantity,amount_pence) VALUES('bad-headcount','sunday-sessions-2026-11-29',4,1700)`).run();
assert.throws(()=>insertDetail.run('bad-headcount','sunday-sessions-2026-11-29','FAMILY_2A2C',2,2,0,1,5,1700,'{}'),/composition does not match/);
db.prepare(`INSERT INTO bookings(id,class_id,quantity,amount_pence) VALUES('bad-amount','sunday-sessions-2026-11-29',5,1600)`).run();
assert.throws(()=>insertDetail.run('bad-amount','sunday-sessions-2026-11-29','FAMILY_2A2C',2,2,0,1,5,1700,'{}'),/composition does not match/);
assert.throws(()=>db.prepare(`UPDATE sunday_session_booking_details SET adult_count=3 WHERE booking_id='good'`).run(),/immutable/);
assert.throws(()=>db.prepare(`DELETE FROM sunday_session_booking_details WHERE booking_id='good'`).run(),/immutable/);

db.prepare(`INSERT INTO waiting_list(id,class_id,quantity) VALUES('wait-good','sunday-sessions-2026-11-29',3)`).run();
db.prepare(`INSERT INTO sunday_session_waiting_details(waiting_id,class_id,selection_code,adult_count,child_10_17_count,child_5_9_count,under_5_count,total_people,calculated_amount_pence,price_breakdown_json) VALUES('wait-good','sunday-sessions-2026-11-29','FAMILY_1A1C',1,1,0,1,3,900,'{}')`).run();
assert.throws(()=>db.prepare(`UPDATE sunday_session_waiting_details SET total_people=2 WHERE waiting_id='wait-good'`).run(),/immutable/);

// The same atomic capacity predicate used by the Worker admits one winner only.
db.prepare(`INSERT INTO booking_holds(id,class_id,quantity,expires_at) VALUES('existing','sunday-sessions-2026-11-29',70,'2099-01-01T00:00:00Z')`).run();
const claim=db.prepare(`INSERT INTO booking_holds(id,class_id,quantity,expires_at)
SELECT ?,c.id,?,'2099-01-01T00:00:00Z' FROM classes c WHERE c.id=? AND ?<=c.capacity-COALESCE((SELECT SUM(quantity) FROM booking_holds WHERE class_id=c.id AND expires_at>CURRENT_TIMESTAMP),0)`);
assert.equal(claim.run('winner',5,'sunday-sessions-2026-11-29',5).changes,1);
assert.equal(claim.run('loser',1,'sunday-sessions-2026-11-29',1).changes,0);
assert.equal(db.prepare(`SELECT SUM(quantity) total FROM booking_holds`).get().total,75);
assert.deepEqual(db.prepare(`PRAGMA foreign_key_check`).all(),[]);
assert.equal(db.prepare(`PRAGMA integrity_check`).get().integrity_check,'ok');

const worker=fs.readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
assert.ok(worker.indexOf('if(sundayDetails)setupStatements.push(sundaySessionDetailInsert')<worker.indexOf("sumUpFetch(env, '/v0.1/checkouts'"),'composition must be persisted before external checkout');
assert.match(worker,/status='FAILED'[\s\S]*Payment provider unavailable/,'provider failure must preserve a failed booking snapshot for audit');
assert.match(worker,/LEFT JOIN sunday_session_booking_details sd[\s\S]*serveBookingConfirmed|serveBookingConfirmed[\s\S]*LEFT JOIN sunday_session_booking_details sd/,'confirmation summary must load composition');
assert.match(worker,/admission_category/,'attendance must retain age category');
console.log('Sunday Sessions pricing, migration, capacity and lifecycle fixtures passed');
