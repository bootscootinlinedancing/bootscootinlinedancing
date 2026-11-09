import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const migration=readFileSync(new URL('../migrations/0036_resend_delivery_tracking.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const db=new DatabaseSync(':memory:');db.exec(migration);
assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='email_delivery_events'").get());
db.prepare(`INSERT INTO email_delivery_events(id,provider_event_id,event_type,payload_json,signature_timestamp) VALUES('one','evt_one','email.delivered','{}',1)`).run();
assert.throws(()=>db.prepare(`UPDATE email_delivery_events SET event_type='email.bounced' WHERE id='one'`).run(),/immutable/);
assert.throws(()=>db.prepare(`DELETE FROM email_delivery_events WHERE id='one'`).run(),/immutable/);
assert.match(worker,/RESEND_WEBHOOK_SIGNING_SECRET/);
assert.match(worker,/Math\.abs\(Date\.now\(\)\/1000-timestamp\)>300/,'signed events must expire after five minutes');
assert.match(worker,/constantTimeBytesEqual/,'signature comparison must be timing-safe');
assert.match(worker,/INSERT OR IGNORE INTO email_delivery_events/,'provider event IDs must be replay-idempotent');
assert.match(worker,/path === '\/api\/resend-webhook'/);
console.log('Resend signed webhook and immutable delivery-event regression checks passed.');
