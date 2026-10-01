import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const [backup,mappingsFile]=process.argv.slice(2);if(!backup||!mappingsFile)throw new Error('Usage: node tests/migration-0019-0021-rehearsal.mjs <backup.sql> <approved-mappings.json>');
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');db.exec(readFileSync(backup,'utf8'));db.exec('PRAGMA foreign_keys=ON');
const mappings=JSON.parse(readFileSync(mappingsFile,'utf8'));assert.equal(mappings.length,14);
for(const [index,m] of mappings.entries()){
  const booking=db.prepare('SELECT customer_id,lower(trim(customer_email)) email FROM bookings WHERE id=?').get(m.booking_id);assert(booking);assert.equal(booking.customer_id,null);
  const customer=db.prepare('SELECT id FROM customers WHERE id=? AND lower(trim(email))=?').get(m.customer_id,booking.email);assert(customer);
  const operationId=`historical-booking-link:production-shaped-${index}`;
  db.prepare("INSERT INTO customer_identity_audit(id,customer_id,action,normalized_email,actor,reason,metadata_json) VALUES(?,?,'HISTORICAL_BOOKING_LINKED',?,'hq','Owner-reviewed historical reconciliation — deterministic normalized-email match',?)")
    .run(operationId,m.customer_id,booking.email,JSON.stringify({booking_id:m.booking_id,operation_id:operationId,prior_customer_id:null,proposed_customer_id:m.customer_id}));
  db.prepare('UPDATE bookings SET customer_id=? WHERE id=? AND customer_id IS NULL').run(m.customer_id,m.booking_id);
}
assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings WHERE customer_id IS NULL').get().n,13);assert.equal(db.prepare("SELECT COUNT(*) n FROM customer_identity_audit WHERE action='HISTORICAL_BOOKING_LINKED'").get().n,14);
const tables=['customers','member_accounts','classes','bookings','attendance','loyalty_transactions','member_passes','class_pass_credit_ledger','reviews','review_history','customer_identity_audit','merch_orders'];
const originalColumns=Object.fromEntries(tables.map(t=>[t,db.prepare(`PRAGMA table_info(${t})`).all().map(c=>`"${c.name}"`).join(',')]));
const snapshot=()=>Object.fromEntries(tables.map(t=>[t,JSON.stringify(db.prepare(`SELECT ${originalColumns[t]} FROM ${t} ORDER BY rowid`).all())]));
const before=snapshot(),protectedOrder=db.prepare("SELECT * FROM merch_orders WHERE status='PAID' ORDER BY created_at LIMIT 1").get();
const protectedAccount=protectedOrder&&db.prepare('SELECT * FROM member_accounts WHERE lower(email)=lower(?)').get(protectedOrder.customer_email);assert(protectedAccount&&protectedOrder);
const migrations=[];
for(const name of ['0019_booking_confirmation_outbox.sql','0020_member_access_lifecycle.sql','0021_merch_external_refund.sql']){
  const sql=readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'),sha256=createHash('sha256').update(sql).digest('hex');db.exec(sql);migrations.push({name,sha256});
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
}
const after=snapshot();for(const table of tables)assert.equal(after[table],before[table],`${table} changed during additive migrations`);
assert.equal(JSON.stringify(db.prepare('SELECT id,customer_id,email,password_hash,password_salt,verified_at,created_at,updated_at FROM member_accounts WHERE id=?').get(protectedAccount.id)),JSON.stringify(Object.fromEntries(['id','customer_id','email','password_hash','password_salt','verified_at','created_at','updated_at'].map(k=>[k,protectedAccount[k]]))));
assert.equal(JSON.stringify(db.prepare('SELECT id,reference,status,fulfilment_status,amount_pence,paid_at,provider_transaction_id FROM merch_orders WHERE id=?').get(protectedOrder.id)),JSON.stringify(Object.fromEntries(['id','reference','status','fulfilment_status','amount_pence','paid_at','provider_transaction_id'].map(k=>[k,protectedOrder[k]]))));
assert.equal(db.prepare('SELECT COUNT(*) n FROM booking_confirmation_jobs').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM booking_confirmation_delivery_tests').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_lifecycle_audit').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM merch_external_refunds').get().n,0);
// Additive-migration rollback compatibility: existing rows and legacy-style writes
// remain valid if application deployment is rolled back. New feature writes remain
// dormant; migrations themselves are intentionally not reversed.
db.exec('BEGIN');const classId=db.prepare('SELECT id FROM classes LIMIT 1').get().id;db.prepare("INSERT INTO booking_holds(id,class_id,quantity,expires_at) VALUES('rollback-compat-hold',?,1,'2035-01-01T00:00:00Z')").run(classId);db.prepare("UPDATE classes SET sold=sold WHERE id=?").run(classId);db.exec('ROLLBACK');assert.equal(db.prepare("SELECT COUNT(*) n FROM booking_holds WHERE id='rollback-compat-hold'").get().n,0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings WHERE customer_id IS NULL').get().n,13);assert.equal(db.prepare("SELECT COUNT(*) n FROM customer_identity_audit WHERE action='HISTORICAL_BOOKING_LINKED'").get().n,14);
console.log(JSON.stringify({ok:true,migrations,counts:Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n])),unmatched:13,reconciliation_audits:14,integrity:'ok',foreign_keys:0,rollback_compatibility:'additive schema remains; legacy reads/writes valid; no reverse migration required'},null,2));
