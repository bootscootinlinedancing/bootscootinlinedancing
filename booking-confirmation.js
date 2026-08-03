(async()=>{
  const p=new URLSearchParams(location.search);
  const ref=p.get('reference'), token=p.get('token');
  const title=document.getElementById('confirmationTitle');
  const text=document.getElementById('confirmationText');
  const details=document.getElementById('confirmationDetails');
  const panel=document.getElementById('manageBookingPanel');
  const policy=document.getElementById('manageBookingPolicy');
  const cancelButton=document.getElementById('cancelBookingButton');
  const message=document.getElementById('manageBookingMessage');

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  const money=pence=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(pence)||0)/100);

  if(!ref&&!token){title.textContent='Booking reference missing';text.textContent='Please return to the booking page or contact Nora.';return;}

  async function load(){
    try{
      const query=token?'token='+encodeURIComponent(token):'reference='+encodeURIComponent(ref);
      const r=await fetch('/api/booking-status?'+query,{cache:'no-store'});
      const b=await r.json();
      if(!r.ok)throw new Error(b.error||'Unable to verify booking');

      const confirmed=b.status==='PAID';
      const waitlisted=b.status==='WAITLISTED';
      const cancelled=['CANCELLED','REFUNDED'].includes(b.status);

      title.textContent=waitlisted?'You’re on the waiting list':confirmed?'You’re booked!':cancelled?'Booking cancelled':'Your place is reserved';
      text.textContent=waitlisted
        ?'No payment has been taken. You will be contacted if enough places become available.'
        :confirmed
          ?'Payment is confirmed and your place is secure.'
          :cancelled
            ?(b.refund_outcome||'Your cancellation has been recorded.')
            :b.payment_enabled?'Payment is still being confirmed.':'Online payment is not yet enabled, so Nora will confirm the next step.';

      details.innerHTML=`<dl>
        <dt>Reference</dt><dd>${esc(b.reference)}</dd>
        <dt>Class</dt><dd>${esc(b.class_title)}</dd>
        <dt>Date</dt><dd>${esc(date(b.starts_at))}</dd>
        <dt>Venue</dt><dd>${esc(b.venue)}</dd>
        <dt>Places</dt><dd>${esc(b.quantity)}</dd>
        <dt>Total</dt><dd>${esc(money(b.amount_pence))}</dd>
        <dt>Status</dt><dd>${esc(b.status.replaceAll('_',' '))}</dd>
      </dl>`;

      if(token&&!cancelled){
        panel.hidden=false;
        policy.textContent=b.cancellation_guidance;
        cancelButton.disabled=!b.can_cancel;
      }else{
        panel.hidden=true;
      }
    }catch(e){title.textContent='We could not verify the booking';text.textContent=e.message;}
  }

  cancelButton?.addEventListener('click',async()=>{
    if(!confirm('Send a cancellation request for this booking? The displayed refund or credit rules will apply.'))return;
    cancelButton.disabled=true;message.textContent='Recording your cancellation…';
    try{
      const r=await fetch('/api/booking-cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
      const b=await r.json();if(!r.ok)throw new Error(b.error||'Cancellation could not be recorded.');
      message.textContent=b.message;await load();
    }catch(e){message.textContent=e.message;cancelButton.disabled=false;}
  });

  await load();
})();