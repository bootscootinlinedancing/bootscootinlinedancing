import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE customer_email_identities(id TEXT PRIMARY KEY,customer_id TEXT,normalized_email TEXT,status TEXT);`);
 for(const file of ['0032_special_events.sql','0033_johnny_programme_times.sql','0034_johnny_owner_decisions.sql','0035_special_event_competition_entries.sql','0040_event_management.sql'])db.exec(readFileSync(new URL(`../../migrations/${file}`,import.meta.url),'utf8'));
 const prepare=(sql,args=[])=>({sql,args,bind(...v){return prepare(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return {meta:db.prepare(sql).run(...args)}}});
 const objects=new Map();let failAt=-1;
 const env={ADMIN_EMAIL:'owner@example.test',SUMUP_MERCHANT_CODE:'SYNTHETIC',EVENT_MANAGEMENT_ENABLED:'true',EVENT_REFUND_EXECUTION_ENABLED:'true',EVENT_MANAGEMENT_NOTIFICATIONS_ENABLED:'true',BOOKINGS_DB:{prepare,async batch(items){db.exec('BEGIN');try{const out=items.map((item,i)=>{if(i===failAt)throw Error('INJECTED_FAILURE');return {meta:db.prepare(item.sql).run(...item.args)}});db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}},EVENT_EVIDENCE_BUCKET:{async put(key,body){objects.set(key,body)},async get(key){return objects.has(key)?{body:objects.get(key)}:null},async delete(key){objects.delete(key)}}};
 db.exec(`INSERT INTO customers(id,name,email) VALUES('customer','Synthetic purchaser','purchaser@example.test');UPDATE special_event_ticket_products SET allocation=20;UPDATE special_event_days SET capacity=20;UPDATE special_events SET saturday_evening_capacity=20;`);
 function booking(id='booking',quantity=3){
 db.prepare(`INSERT INTO special_event_bookings(id,reference,event_id,product_id,customer_id,customer_name,customer_email,quantity,product_code_snapshot,product_name_snapshot,unit_price_pence_snapshot,amount_pence,status,secure_token,customer_token,terms_accepted_at,paid_at,provider_checkout_id,provider_transaction_id) VALUES(?,?,'special-event-johnny-rossato-2027','johnny-early-weekend','customer','Synthetic purchaser','purchaser@example.test',?,'EARLY_BIRD_WEEKEND','Synthetic weekend',4000,?,'PAID',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?)`).run(id,`SYNTH-${id}`,quantity,quantity*4000,`secret-${id}`,`customer-${id}`,`checkout-${id}`,`transaction-${id}`);
 db.prepare(`INSERT INTO special_event_booking_days SELECT ?,id,? FROM special_event_days`).run(id,quantity);
 for(let n=1;n<=quantity;n++){
 const aid=`${id}-a${n}`;
 db.prepare(`INSERT INTO special_event_attendees(id,booking_id,name,email,age_at_event,ticket_number,qr_token) VALUES(?,? ,?,'purchaser@example.test',30,?,?)`).run(aid,id,`Synthetic attendee ${n}`,`${id}-${n}`,`qr-${id}-${n}`);
 db.prepare(`INSERT INTO special_event_attendance(attendee_id,day_id) SELECT ?,id FROM special_event_days`).run(aid);
 }
 return id;
 }
 return {db,env,objects,booking,failBatchAt(i){failAt=i}};
}
