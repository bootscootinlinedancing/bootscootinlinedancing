const DEFAULT_AUTOMATION_ENDPOINT='https://bootscootinlinedancing.co.uk/api/automation/run';

async function processDueEmails(env){
  const secret=String(env.EMAIL_AUTOMATION_SECRET||'').trim();
  if(!secret)throw new Error('EMAIL_AUTOMATION_SECRET is not configured.');
  const endpoint=String(env.AUTOMATION_ENDPOINT||DEFAULT_AUTOMATION_ENDPOINT).trim();
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{authorization:`Bearer ${secret}`,'user-agent':'Boot-Scootin-Email-Cron/1.0'}
  });
  if(!response.ok){
    throw new Error(`Email automation endpoint returned HTTP ${response.status}`);
  }
  return response.json();
}

export default {
  async scheduled(controller,env,ctx){
    // Separate HTTP invocation gives the recovery scan its own subrequest budget.
    ctx.waitUntil((async()=>{
      const endpoint='https://bootscootinlinedancing.co.uk/api/automation/reconcile-payments';
      const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${String(env.EMAIL_AUTOMATION_SECRET||'').trim()}`},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error(`Payment recovery HTTP ${response.status}`);
      const summary=await response.json();console.info('PAYMENT_RECOVERY_RUN',JSON.stringify(summary));
    })());
    // Independent promises: a recovery HTTP error/timeout must never suppress
    // the original hourly journeys/campaigns at minute five.
    if(new Date(controller.scheduledTime).getUTCMinutes()===5)ctx.waitUntil(processDueEmails(env));
  }
};
