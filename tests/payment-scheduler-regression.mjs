import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../automation-worker/worker.js',import.meta.url),'utf8');
const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const originalFetch=globalThis.fetch;
try{
  for(const mode of ['success','http-error','network-error','timeout','unresolved']){
    const urls=[],pending=[];let release;
    globalThis.fetch=async url=>{
      urls.push(url);
      if(url.endsWith('/reconcile-payments')){
        if(mode==='network-error')throw Error('offline');
        if(mode==='timeout')throw new DOMException('timed out','TimeoutError');
        if(mode==='unresolved')return new Promise(resolve=>{release=()=>resolve(Response.json({inspected:0}));});
        return Response.json({inspected:0},{status:mode==='http-error'?503:200});
      }
      return Response.json({ok:true});
    };
    await worker.scheduled({scheduledTime:Date.parse('2030-01-01T12:05:00Z')},{EMAIL_AUTOMATION_SECRET:'synthetic'},{waitUntil:p=>pending.push(p)});
    assert(urls.some(url=>url.endsWith('/run')),`${mode} must never suppress due emails`);
    assert.equal(pending.length,2,'separate scheduled promises');
    release?.();
    const result=await Promise.allSettled(pending);
    assert.equal(result[1].status,'fulfilled');
    if(['http-error','network-error','timeout'].includes(mode))assert.equal(result[0].status,'rejected');
  }
  let emailCalls=0;const pending=[];
  globalThis.fetch=async url=>{if(url.endsWith('/run'))emailCalls++;return Response.json({disabled:true});};
  await worker.scheduled({scheduledTime:Date.parse('2030-01-01T12:10:00Z')},{EMAIL_AUTOMATION_SECRET:'synthetic'},{waitUntil:p=>pending.push(p)});
  await Promise.all(pending);assert.equal(emailCalls,0,'hourly email cadence stays unchanged');
  console.log('PASS hourly email independence from payment HTTP errors, network failures, timeouts and hung recovery; unchanged minute-five cadence');
}finally{globalThis.fetch=originalFetch;}
