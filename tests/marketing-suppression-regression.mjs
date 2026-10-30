import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const worker=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const mod=await import(`data:text/javascript;base64,${Buffer.from(worker+'\nexport {isOwnerAccountRemovalSuppression,sendCampaign};').toString('base64')}`);

assert.equal(mod.isOwnerAccountRemovalSuppression({source:'OWNER_ACCOUNT_REMOVAL'}),true);
assert.equal(mod.isOwnerAccountRemovalSuppression({source:'email-link'}),false);
assert.match(worker,/if\(isOwnerAccountRemovalSuppression\(existingSuppression\)\)/,'public signup must not clear an owner-removal suppression');

const db=new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE bookings(customer_email TEXT,customer_name TEXT);
  INSERT INTO bookings VALUES('suppressed@example.test','Suppressed Customer');
`);
let injectSuppression=true;
const prepare=(sql,params=[])=>({
  sql,params,
  bind(...values){return prepare(sql,values)},
  async first(){return db.prepare(sql).get(...params)||null},
  async all(){
    const results=db.prepare(sql).all(...params);
    if(injectSuppression&&sql.includes('SELECT lower(email) email FROM mailing_unsubscribes')){
      injectSuppression=false;
      db.prepare(`INSERT INTO mailing_unsubscribes(email,source) VALUES('suppressed@example.test','OWNER_ACCOUNT_REMOVAL')`).run();
    }
    return {results};
  },
  async run(){return {success:true,meta:db.prepare(sql).run(...params)}}
});
const env={BOOKINGS_DB:{prepare},RESEND_API_KEY:'must-not-be-used',EMAIL_FROM_GENERAL:'Boot Scootin <hello@example.test>',MAILING_LIST_SIGNING_SECRET:'local-secret'};

await mod.sendCampaign(env,'missing').catch(()=>{});
const campaignId='suppression-race';
db.prepare(`INSERT INTO email_campaigns(id,subject,body_text,audience_type,audience_json,status) VALUES(?,?,?,?,?,'QUEUED')`)
  .run(campaignId,'Fixture','Fixture body','selected_customers',JSON.stringify({selected_emails:['suppressed@example.test']}));
let deliveries=0;
globalThis.fetch=async()=>{deliveries++;return new Response('{}',{status:200})};
const result=await mod.sendCampaign(env,campaignId);
assert.equal(deliveries,0,'a suppression added after audience resolution still blocks provider delivery');
assert.equal(result.suppressed,1);
assert.equal(db.prepare(`SELECT status FROM email_campaign_recipients WHERE campaign_id=?`).get(campaignId).status,'SUPPRESSED');

console.log('PASS durable owner-removal suppression and final send-time check');
