(() => {
  const root = document.getElementById('quoteRoot');
  const token = new URLSearchParams(location.search).get('token');
  const money = p => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(p)||0)/100);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function request(url, options={}) {
    const r=await fetch(url,{headers:{Accept:'application/json','Content-Type':'application/json'},...options});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error||'This private booking link is unavailable.');
    return d;
  }
  function setPayBusy(button, busy, label){
    if(!button) return;
    if(busy){button.dataset.originalText=button.textContent;button.textContent=label||'OPENING SECURE PAYMENT…';button.disabled=true;}
    else{button.textContent=button.dataset.originalText||button.textContent;button.disabled=false;}
  }
  async function pay(kind, button){
    setPayBusy(button,true,kind==='DEPOSIT'?'OPENING DEPOSIT PAYMENT…':'OPENING FULL PAYMENT…');
    try{
      const d=await request('/api/private-events/pay',{method:'POST',body:JSON.stringify({token,kind})});
      if(!d.checkout_url) throw new Error('The secure SumUp payment page could not be opened.');
      window.location.assign(d.checkout_url);
    }catch(e){
      alert(e.message||'The secure payment page could not be opened. No payment has been taken.');
      setPayBusy(button,false);
    }
  }
  async function load(){
    if(!token){root.innerHTML='<div class="booking-alert">This private booking link is incomplete.</div>';return;}
    try{
      const d=await request(`/api/private-events/quote?token=${encodeURIComponent(token)}`);
      const q=d.quote;
      const status=String(d.inquiry?.status||'');
      const paidFull=status==='CONFIRMED_PAID';
      const paidDeposit=status==='CONFIRMED_DEPOSIT'||status==='BALANCE_DUE';
      const returnPayment=new URLSearchParams(location.search).get('payment');
      const statusMessage=paidFull
        ? '<div class="booking-alert success"><strong>Paid in full.</strong> Your private event is confirmed. Nora will be in touch with the final arrangements.</div>'
        : paidDeposit
          ? `<div class="booking-alert success"><strong>Deposit received.</strong> Your event is confirmed with a deposit. Remaining balance: ${money(q?.balance_due_pence||0)}.</div>`
          : returnPayment==='return'
            ? '<div class="booking-alert">Thanks. We are checking the SumUp payment status now. If you have just paid, refresh this page in a moment.</div>'
            : '';
      const payDisabled=!d.payments_enabled||paidFull;
      const fullKind=paidDeposit?'BALANCE':'FULL';
      root.innerHTML=`<section class="quote-card"><p class="kicker red">Private event proposal</p><h1>${esc(d.inquiry.event_type)} with Boot Scootin’</h1><p class="quote-reference">Reference ${esc(d.inquiry.reference)}</p>
      <div class="quote-details"><article><span>Date</span><strong>${esc(q?.agreed_date||d.inquiry.preferred_date)}</strong></article><article><span>Time</span><strong>${esc([q?.agreed_start_time||d.inquiry.start_time,q?.agreed_end_time||d.inquiry.end_time].filter(Boolean).join(' – ')||'To be agreed')}</strong></article><article><span>Venue</span><strong>${esc(q?.agreed_venue||d.inquiry.venue_name||'To be agreed')}</strong><small>${esc(q?.agreed_address||d.inquiry.venue_address)}</small></article><article><span>Guests</span><strong>${esc(d.inquiry.guest_count)}</strong></article></div>
      ${q?`<div class="quote-money"><div><span>Session/package</span><strong>${money(q.base_fee_pence)}</strong></div>${q.travel_fee_pence?`<div><span>Travel</span><strong>${money(q.travel_fee_pence)}</strong></div>`:''}${q.equipment_fee_pence?`<div><span>Equipment</span><strong>${money(q.equipment_fee_pence)}</strong></div>`:''}${q.extra_fee_pence?`<div><span>Additional items</span><strong>${money(q.extra_fee_pence)}</strong></div>`:''}${q.discount_pence?`<div><span>Discount</span><strong>−${money(q.discount_pence)}</strong></div>`:''}<div class="total"><span>Total</span><strong>${money(q.total_pence)}</strong></div><div><span>Deposit</span><strong>${money(q.deposit_pence)}</strong></div><div><span>Balance after deposit</span><strong>${money(q.balance_due_pence)}</strong></div></div>
      <p>${esc(q.package_description||'')}</p>${statusMessage}<div class="quote-actions">${payDisabled||paidDeposit?`<span class="button disabled-link">${paidDeposit?'Deposit paid':'Deposit unavailable'}</span>`:`<button type="button" class="button payment-link" data-pay-kind="DEPOSIT">Accept & pay deposit</button>`}${payDisabled?`<span class="button secondary disabled-link">${paidFull?'Paid in full':'Payment unavailable'}</span>`:`<button type="button" class="button secondary payment-link" data-pay-kind="${fullKind}">${paidDeposit?'Pay remaining balance':'Accept & pay in full'}</button>`}<button class="button ghost" data-action="changes" ${paidFull?'disabled':''}>Request a change</button></div>${d.payments_enabled?'':'<div class="booking-alert">Online payment is being prepared. You can review the proposal or request a change, but no card payment can be taken yet.</div>'}`:'<div class="booking-alert">Your inquiry has been received. Nora has not issued a quote yet.</div>'}</section>`;
      root.querySelectorAll('[data-pay-kind]').forEach(b=>{b.onclick=()=>pay(b.dataset.payKind,b);});
      root.querySelectorAll('[data-action="changes"]').forEach(b=>{if(!b.disabled)b.onclick=async()=>{const text=prompt('What would you like to change?');if(!text)return;await request('/api/private-events/respond',{method:'POST',body:JSON.stringify({token,action:'REQUEST_CHANGES',message:text})});alert('Your change request has been sent.');load();};});
    }catch(e){root.innerHTML=`<div class="booking-alert">${esc(e.message)}</div>`;}
  }
  load();
})();
