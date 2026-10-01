import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const [sqlPath,mappingPath]=process.argv.slice(2);
if(!sqlPath||!mappingPath)throw new Error('Usage: node tests/customer-crm-regression.mjs <backup.sql> <approved-mappings.json>');
const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const db=new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=OFF'); db.exec(readFileSync(sqlPath,'utf8')); db.exec('PRAGMA foreign_keys=ON');
for(const file of ['0019_booking_confirmation_outbox.sql','0020_member_access_lifecycle.sql','0021_merch_external_refund.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
let writes=0,calls=0;
const prepare=(sql,params=[])=>({
 bind(...values){return prepare(sql,values)},
 async all(){calls++;return {results:db.prepare(sql).all(...params)}},
 async first(){calls++;return db.prepare(sql).get(...params)||null},
 async run(){writes++;return {success:true,meta:db.prepare(sql).run(...params)}},
 sql,params
});
const env={ADMIN_EMAIL:'nora@bootscootinlinedancing.co.uk',BOOKINGS_DB:{prepare,async batch(items){db.exec('BEGIN');try{const result=items.map(s=>{writes++;return {success:true,meta:db.prepare(s.sql).run(...s.params)}});db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}}};
const base='https://bootscootinlinedancing.co.uk';
const headers={'Cf-Access-Authenticated-User-Email':env.ADMIN_EMAIL,Origin:base,'Content-Type':'application/json'};
const request=(path,options={})=>worker.fetch(new Request(base+path,{headers,...options}),env,{});
const snapshot=()=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(({name})=>[name,JSON.stringify(db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all())]));
const before=snapshot();
let response=await request('/ranch/api/admin/customers',{headers:{}});assert.equal(response.status,401);
response=await request('/ranch/api/admin/customers',{headers:{'Cf-Access-Authenticated-User-Email':'other@example.com'}});assert.equal(response.status,403);
response=await request('/ranch/api/admin/customers');assert.equal(response.status,200);
const {customers}=await response.json();assert(customers.length>0);
for(const customer of customers){const start=calls;response=await request('/ranch/api/admin/customers?email='+encodeURIComponent(customer.customer_email));assert.equal(response.status,200);const data=await response.json();assert.equal(data.customer.customer_id,customer.customer_id);assert.equal(calls-start,11);}
assert.equal(writes,0,'CRM GET requests must not run setup or seed writes');assert.deepEqual(snapshot(),before);
const mappings=JSON.parse(readFileSync(mappingPath,'utf8'));assert.equal(mappings.length,14);
for(const [i,m] of mappings.entries()){
 const body=JSON.stringify({action:'HISTORICAL_BOOKING_LINK',booking_id:m.booking_id,proposed_customer_id:m.customer_id,operation_id:'local-regression-'+i,reason:'Owner-reviewed historical reconciliation — deterministic normalized-email match'});
 response=await request('/ranch/api/admin/customers',{method:'POST',body});assert.equal(response.status,200,await response.clone().text());
 response=await request('/ranch/api/admin/customers',{method:'POST',body});assert.equal(response.status,200);assert.equal((await response.json()).idempotent,true);
}
assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings WHERE customer_id IS NULL').get().n,13);
assert.equal(db.prepare("SELECT COUNT(*) n FROM customer_identity_audit WHERE action='HISTORICAL_BOOKING_LINKED'").get().n,14);
const after=snapshot();for(const table of Object.keys(before))if(!['bookings','customer_identity_audit'].includes(table))assert.equal(after[table],before[table],table+' must be unchanged');
const oldBookings=JSON.parse(before.bookings);const newBookings=JSON.parse(after.bookings);const approved=new Map(mappings.map(m=>[m.booking_id,m.customer_id]));
for(const b of oldBookings){if(approved.has(b.id))b.customer_id=approved.get(b.id)}assert.deepEqual(newBookings,oldBookings);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
console.log(`PASS: ${customers.length} profiles; zero GET writes; 14 local audited links; idempotency; only approved customer_id changes; all other tables unchanged; foreign keys valid.`);
