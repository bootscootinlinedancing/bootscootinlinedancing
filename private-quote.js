(() => {
  const root = document.getElementById('quoteRoot');
  const token = new URLSearchParams(location.search).get('token');
  const money = p => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(p)||0)/100);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function request(url, options={}) { const r=await fetch(url,{headers:{Accept:'application/json','Content-Type':'application/json'},...options}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'This private booking link is unavailable.'); return d; }
  async function load(){
    if(!token){root.innerHTML='<div class="booking-alert">This private booking link is incomplete.</div>';return;}
    try{
      const d=await request(`/api/private-events/quote?token=${encodeURIComponent(token)}`);
      const q=d.quote;
      root.innerHTML=`<section class="quote-card"><p class="kicker red">Private event proposal</p><h1>${esc(d.inquiry.event_type)} with Boot Scootin’</h1><p class="quote-reference">Reference ${esc(d.inquiry.reference)}</p>
      <div class="quote-details"><article><span>Date</span><strong>${esc(q?.agreed_date||d.inquiry.preferred_date)}</strong></article><article><span>Time</span><strong>${esc([q?.agreed_start_time||d.inquiry.start_time,q?.agreed_end_time||d.inquiry.end_time].filter(Boolean).join(' – ')||'To be agreed')}</strong></article><article><span>Venue</span><strong>${esc(q?.agreed_venue||d.inquiry.venue_name||'To be agreed')}</strong><small>${esc(q?.agreed_address||d.inquiry.venue_address)}</small></article><article><span>Guests</span><strong>${esc(d.inquiry.guest_count)}</strong></article></div>
      ${q?`<div class="quote-money"><div><span>Session/package</span><strong>${money(q.base_fee_pence)}</strong></div>${q.travel_fee_pence?`<div><span>Travel</span><strong>${money(q.travel_fee_pence)}</strong></div>`:''}${q.equipment_fee_pence?`<div><span>Equipment</span><strong>${money(q.equipment_fee_pence)}</strong></div>`:''}${q.extra_fee_pence?`<div><span>Additional items</span><strong>${money(q.extra_fee_pence)}</strong></div>`:''}${q.discount_pence?`<div><span>Discount</span><strong>−${money(q.discount_pence)}</strong></div>`:''}<div class="total"><span>Total</span><strong>${money(q.total_pence)}</strong></div><div><span>Deposit</span><strong>${money(q.deposit_pence)}</strong></div><div><span>Balance after deposit</span><strong>${money(q.balance_due_pence)}</strong></div></div>
      <p>${esc(q.package_description||'')}</p><div class="quote-actions"><button class="button" data-action="accept_deposit" ${d.payments_enabled?'':'disabled'}>Accept & pay deposit</button><button class="button secondary" data-action="accept_full" ${d.payments_enabled?'':'disabled'}>Accept & pay in full</button><button class="button ghost" data-action="changes">Request a change</button></div>${d.payments_enabled?'':'<div class="booking-alert">Online payment is being prepared. You can review the proposal or request a change, but no card payment can be taken yet.</div>'}`:'<div class="booking-alert">Your inquiry has been received. Nora has not issued a quote yet.</div>'}</section>`;
      root.querySelectorAll('[data-action="changes"]').forEach(b=>b.onclick=async()=>{const text=prompt('What would you like to change?');if(!text)return;await request('/api/private-events/respond',{method:'POST',body:JSON.stringify({token,action:'REQUEST_CHANGES',message:text})});alert('Your change request has been sent.');load();});
    }catch(e){root.innerHTML=`<div class="booking-alert">${esc(e.message)}</div>`;}
  }
  load();
})();
