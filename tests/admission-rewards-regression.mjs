import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root=new URL('../',import.meta.url).pathname;
const migration=readFileSync(join(root,'migrations/0028_admission_rewards.sql'),'utf8');
const worker=readFileSync(join(root,'_worker.js'),'utf8');
const temp=mkdtempSync(join(tmpdir(),'boots-admission-reward-'));
const db=join(temp,'fixture.sqlite');
const base=`
PRAGMA foreign_keys=ON;
CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE);
CREATE TABLE member_accounts(id TEXT PRIMARY KEY,customer_id TEXT REFERENCES customers(id),verified_at TEXT,access_state TEXT NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE classes(id TEXT PRIMARY KEY,title TEXT NOT NULL,starts_at TEXT,status TEXT NOT NULL DEFAULT 'open');
CREATE TABLE bookings(id TEXT PRIMARY KEY,customer_id TEXT REFERENCES customers(id),class_id TEXT REFERENCES classes(id),payment_provider TEXT,status TEXT);
`;
try{
  writeFileSync(join(temp,'setup.sql'),base+migration);
  execFileSync('sqlite3',[db,`.read ${join(temp,'setup.sql')}`],{stdio:'pipe'});
  const query=sql=>execFileSync('sqlite3',['-batch','-noheader',db,sql],{encoding:'utf8'}).trim();
  assert.equal(query(`SELECT code||':'||default_admissions||':'||notification_enabled FROM admission_reward_programs;`),'GOLDEN_TICKET:12:0');
  assert.equal(query(`SELECT COUNT(*) FROM customer_admission_rewards;`),'0','migration must not assign a live customer reward');
  assert.equal(query(`SELECT eligible FROM admission_reward_ticket_eligibility WHERE ticket_product_code='CLASS_SOCIAL';`),'1');
  assert.equal(query(`SELECT eligible FROM admission_reward_ticket_eligibility WHERE ticket_product_code='SOCIAL_ONLY';`),'0');
  query(`INSERT INTO customers VALUES('customer-fixture','Fixture Dancer','fixture@example.test');
    INSERT INTO member_accounts VALUES('member-fixture','customer-fixture',CURRENT_TIMESTAMP,'ACTIVE');
    INSERT INTO classes VALUES('class-a','Fixture Class','2099-01-01T19:30:00Z','open');
    INSERT INTO classes VALUES('class-b','Second Fixture Class','2099-01-08T19:30:00Z','open');
    INSERT INTO customer_admission_rewards(id,program_id,customer_id,member_id,original_allocation,active_from,original_expires_on,expires_on,source_type,assigned_by)
      VALUES('reward-a','admission-program-golden-ticket','customer-fixture','member-fixture',2,'2098-01-01','2099-12-31','2099-12-31','COMPETITION','FIXTURE');
    INSERT INTO admission_reward_ledger(id,reward_id,amount,event_type,reason,actor_type,actor_id,idempotency_key)
      VALUES('ledger-allocation','reward-a',2,'ALLOCATION','Fixture allocation','ADMIN','FIXTURE','fixture-allocation');`);
  assert.equal(query(`SELECT COUNT(*) FROM admission_reward_class_eligibility;`),'0','classes must default to ineligible');
  query(`INSERT INTO admission_reward_class_eligibility VALUES('admission-program-golden-ticket','class-a',1,'Fixture approval','FIXTURE',CURRENT_TIMESTAMP);
    INSERT INTO bookings VALUES('booking-a','customer-fixture','class-a','ADMISSION_REWARD','PAID');
    INSERT INTO admission_reward_ledger(id,reward_id,booking_id,class_id,amount,event_type,reason,actor_type,actor_id,idempotency_key)
      VALUES('ledger-redeem','reward-a','booking-a','class-a',-1,'REDEMPTION','Fixture redemption','MEMBER','member-fixture','fixture-redeem');
    INSERT INTO admission_reward_booking_claims(id,reward_id,booking_id,class_id,status,redemption_ledger_id,idempotency_key)
      VALUES('claim-a','reward-a','booking-a','class-a','CONFIRMED','ledger-redeem','fixture-claim');`);
  assert.equal(query(`SELECT SUM(amount) FROM admission_reward_ledger WHERE reward_id='reward-a';`),'1');
  const mutateLedger=spawnSync('sqlite3',['-batch',db,`UPDATE admission_reward_ledger SET reason='changed' WHERE id='ledger-redeem';`],{encoding:'utf8'});
  assert.notEqual(mutateLedger.status,0,'ledger must be immutable');
  query(`INSERT INTO admission_reward_ledger(id,reward_id,booking_id,class_id,amount,event_type,reason,actor_type,actor_id,idempotency_key)
      VALUES('ledger-restore','reward-a','booking-a','class-a',1,'RESTORATION','Fixture cancellation','SYSTEM','FIXTURE','fixture-restore');
    UPDATE admission_reward_booking_claims SET status='RELEASED',restoration_ledger_id='ledger-restore',released_at=CURRENT_TIMESTAMP WHERE id='claim-a';`);
  assert.equal(query(`SELECT SUM(amount) FROM admission_reward_ledger WHERE reward_id='reward-a';`),'2','restoration returns exactly one admission');
  query(`INSERT INTO bookings VALUES('booking-b','customer-fixture','class-a','ADMISSION_REWARD','PAID');
    INSERT INTO admission_reward_ledger VALUES('ledger-overlap','reward-a','booking-b','class-a',-1,'REDEMPTION','Overlap','MEMBER','member-fixture','fixture-overlap',CURRENT_TIMESTAMP);
    UPDATE admission_reward_booking_claims SET status='CONFIRMED',restoration_ledger_id=NULL,released_at=NULL WHERE id='claim-a';`);
  const overlap=spawnSync('sqlite3',['-batch',db,`INSERT INTO admission_reward_booking_claims(id,reward_id,booking_id,class_id,status,redemption_ledger_id,idempotency_key) VALUES('claim-b','reward-a','booking-b','class-a','CONFIRMED','ledger-overlap','fixture-claim-b');`],{encoding:'utf8'});
  assert.notEqual(overlap.status,0,'one reward cannot hold two confirmed claims for one class');
  const deleteAudit=spawnSync('sqlite3',['-batch',db,`INSERT INTO admission_reward_audit(id,reward_id,action,reason,actor,idempotency_key) VALUES('audit-a','reward-a','TEST','Fixture','FIXTURE','fixture-audit'); DELETE FROM admission_reward_audit WHERE id='audit-a';`],{encoding:'utf8'});
  assert.notEqual(deleteAudit.status,0,'audit history must be immutable');

  assert.match(worker,/payment_provider='ADMISSION_REWARD'/);
  assert.match(worker,/amount_pence,original_amount_pence,discount_pence,status,payment_provider/);
  assert.match(worker,/Number\(attendee\.amount_pence\|\|0\)>0\|\|attendee\.payment_provider==='CLASS_PASS'/,'complimentary admission must not qualify for loyalty');
  assert.doesNotMatch(worker,/Sarah Kavanagh/i,'general implementation must not hardcode the intended winner');
  assert.match(worker,/REWARD_ASSIGNED','DISABLED'/,'assignment notification must remain disabled');
  console.log('admission rewards regression: PASS');
}finally{
  rmSync(temp,{recursive:true,force:true});
}
