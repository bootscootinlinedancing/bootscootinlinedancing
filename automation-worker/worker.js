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
    const body=await response.text().catch(()=>'');
    throw new Error(`Email automation endpoint returned HTTP ${response.status}: ${body.slice(0,300)}`);
  }
  return response.json();
}

export default {
  async scheduled(_controller,env,ctx){
    ctx.waitUntil(processDueEmails(env));
  }
};
