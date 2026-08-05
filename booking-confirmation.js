(async()=>{
  const params=new URLSearchParams(window.location.search||'');
  const ref=(params.get('reference')||'').trim();
  const token=(params.get('token')||'').trim();
  const customerToken=(params.get('customer')||'').trim();
  const title=document.getElementById('confirmationTitle');
  const text=document.getElementById('confirmationText');
  const details=document.getElementById('confirmationDetails');
  const panel=document.getElementById('manageBookingPanel');
  const policy=document.getElementById('manageBookingPolicy');
  const cancelButton=document.getElementById('cancelBookingButton');
  const message=document.getElementById('manageBookingMessage');
  const portalLink=document.getElementById('openCustomerPortal');

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>{
    const parsed=new Date(value);
    return Number.isNaN(parsed.getTime())?'Date to be confirmed':new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(parsed);
  };
  const money=pence=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(pence)||0)/100);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  if(!ref&&!token){
    title.textContent='Booking reference missing';
    text.textContent='Please return to the booking page or contact Nora.';
    return;
  }

  function statusUrl(){
    const url=new URL('/api/booking-status',window.location.origin);
    if(token)url.searchParams.set('token',token);
    else url.searchParams.set('reference',ref);
    return url.toString();
  }

  function render(b){
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
          :b.payment_enabled?'Your payment was received and is still being matched to your booking. This page will update automatically.':'Online payment is not yet enabled, so Nora will confirm the next step.';

    details.innerHTML=`<dl>
      <dt>Reference</dt><dd>${esc(b.reference)}</dd>
      <dt>Class</dt><dd>${esc(b.class_title)}</dd>
      <dt>Date</dt><dd>${esc(date(b.starts_at))}</dd>
      <dt>Venue</dt><dd>${esc(b.venue)}</dd>
      <dt>Places</dt><dd>${esc(b.quantity)}</dd>
      <dt>Total</dt><dd>${esc(money(b.amount_pence))}</dd>
      <dt>Status</dt><dd>${esc(String(b.status||'PENDING').replaceAll('_',' '))}</dd>
    </dl>`;

    if(portalLink){
      const portal=new URL('/my-bookings.html',window.location.origin);
      portal.searchParams.set('token',customerToken||token||'');
      portalLink.href=portal.toString();
    }
    if(token&&!cancelled){
      panel.hidden=false;
      policy.textContent=b.cancellation_guidance||'';
      cancelButton.disabled=!b.can_cancel;
    }else panel.hidden=true;
  }

  async function fetchStatus(){
    const response=await fetch(statusUrl(),{headers:{Accept:'application/json'},cache:'no-store',credentials:'same-origin'});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||'Unable to verify booking');
    return body;
  }

  async function load(){
    try{
      let booking=null;
      const delays=[0,1200,2200,3500,5000];
      for(const delay of delays){
        if(delay)await sleep(delay);
        booking=await fetchStatus();
        render(booking);
        if(booking.status!=='PENDING')break;
      }
      if(booking?.status==='PENDING'){
        text.textContent='Your payment is successful, but the booking record is taking a little longer to update. Your reference is secure; please check My Bookings shortly.';
      }
    }catch(error){
      title.textContent='We could not verify the booking';
      text.textContent='Your payment page reported success, but this confirmation screen could not load the booking details. Please keep your booking reference and contact Nora if it does not appear in My Bookings.';
      console.error('Booking confirmation verification failed',error);
    }
  }

  cancelButton?.addEventListener('click',async()=>{
    if(!confirm('Send a cancellation request for this booking? The displayed refund or credit rules will apply.'))return;
    cancelButton.disabled=true;message.textContent='Recording your cancellation…';
    try{
      const response=await fetch('/api/booking-cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'Cancellation could not be recorded.');
      message.textContent=body.message;await load();
    }catch(error){message.textContent=error.message;cancelButton.disabled=false;}
  });

  await load();
})();
