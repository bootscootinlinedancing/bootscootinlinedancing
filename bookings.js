(()=>{
  const grid=document.getElementById('classGrid');
  const filter=document.getElementById('venueFilter');
  const dialog=document.getElementById('bookingDialog');
  const form=document.getElementById('bookingForm');
  const status=document.getElementById('bookingStatus');
  let classes=[];
  let selectedClass=null;
  let appliedPromo=null;
  let creditOperationId='';

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(n)||0);
  const dateFmt=s=>new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
  const dayFmt=s=>new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(s));
  const timeFmt=s=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(s));
  const venueLabel=venue=>/^(low places bar|low places bar birmingham)$/i.test(String(venue||'').trim())?'Low Places Bar Birmingham':String(venue||'').trim();
  const venueKey=venue=>venueLabel(venue).toLowerCase();

  function summaryText(text){
    const clean=String(text||'').replace(/\s+/g,' ').trim();
    if(!clean)return '';
    const sentence=clean.match(/^(.{1,170}?[.!?])(?:\s|$)/)?.[1];
    return sentence||`${clean.slice(0,150)}${clean.length>150?'…':''}`;
  }
  function descriptionHtml(text){
    return String(text||'').trim().split(/\n\s*\n/).filter(Boolean).map(paragraph=>`<p>${esc(paragraph).replace(/\n/g,'<br>')}</p>`).join('');
  }
  function eventUrl(c){return `${location.origin}${location.pathname}?event=${encodeURIComponent(c.id)}`;}
  async function loadClassCreditOption(c){
    const box=document.getElementById('classCreditOption'),button=document.getElementById('classCreditSubmit'),summary=document.getElementById('classCreditSummary');
    box.hidden=true;summary.textContent='';
    try{
      const response=await fetch(`/api/member/class-credit-options?class_id=${encodeURIComponent(c.id)}`,{headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)return;
      const result=await response.json();
      if(!result.can_use_credit)return;
      box.hidden=false;
      button.textContent=result.class_full?'Join Waiting List — No Credit Used':'Use 1 Class Credit';
      summary.textContent=`Signed-in member option: ${result.pass.product_name} · ${result.pass.remaining_credits} credit${Number(result.pass.remaining_credits)===1?'':'s'} remaining.`;
    }catch(_){}
  }
  function render(){
    const venue=filter.value;
    const rows=classes.filter(c=>venue==='all'||venueKey(c.venue)===venue);
    grid.innerHTML=rows.length?rows.map(c=>{
      const full=Number(c.spaces_remaining)<1;
      const closed=c.booking_open!==true&&c.waiting_list_open!==true;
      const nearly=Number(c.spaces_remaining)>0&&Number(c.spaces_remaining)<5;
      return `<article class="class-card" id="event-${esc(c.id)}">
        ${c.poster_url?`<div class="class-poster"><img src="${esc(c.poster_url)}" alt="${esc(c.title)} poster" loading="lazy"></div>`:''}
        <div class="class-date"><span>${new Date(c.starts_at).toLocaleDateString('en-GB',{month:'short'}).toUpperCase()}</span><strong>${new Date(c.starts_at).getDate()}</strong></div>
        <div class="class-info">
          <p class="class-venue">${esc(venueLabel(c.venue))}</p><h3>${esc(c.title)}</h3>${c.event_type==='ANNIVERSARY'&&c.ticket_release?`<p class="anniversary-ticket-release"><strong>${esc(c.ticket_release.name)}</strong> · ${money(c.ticket_release.price_pence/100)} · ${esc(c.ticket_release.remaining)} release tickets available</p>`:''}
          <p>${esc(dateFmt(c.starts_at))}</p><p>${esc(c.location)}</p>
          <div class="class-footer"><span><b>${money(c.price)}</b> per person</span>
          <span class="spaces ${nearly?'low':''} ${full?'full':''}">${closed?'Booking closed':full?'Class full':`${c.spaces_remaining} spaces left`}</span></div>
          <div class="class-card-actions"><button type="button" class="button secondary view-event" data-id="${esc(c.id)}">View details</button><button class="button book-class" data-id="${esc(c.id)}" data-mode="${full?'waitlist':'booking'}" ${closed?'disabled aria-disabled="true"':''}>${closed?'Booking closed':full?'Join waiting list':'Book now'}</button></div>
        </div>
      </article>`;
    }).join(''):'<p class="booking-empty">There are no published classes matching this filter yet.</p>';
  }

  function openEventDetails(c){
    const d=document.getElementById('eventDetailsDialog'),box=document.getElementById('eventDetailsContent'); if(!d||!box)return;
    const full=Number(c.spaces_remaining)<1; const closed=c.booking_open!==true&&c.waiting_list_open!==true; const url=eventUrl(c);
    const availability=closed?'Booking closed':c.event_type==='ANNIVERSARY'?(full?'Event full':`${esc(c.spaces_remaining)} tickets available in the current release`):(full?'Class full':`${esc(c.spaces_remaining)} spaces left`);
    const overall=c.event_type==='ANNIVERSARY'?(c.releases||[]).find(release=>release.allocation==null)?.remaining:null;
    const schedule=`${dayFmt(c.starts_at)} · ${timeFmt(c.starts_at)}${c.ends_at?`–${timeFmt(c.ends_at)}`:''}`;
    box.innerHTML=`<p class="eyebrow">${esc(venueLabel(c.venue))}</p><h2>${esc(c.title)}</h2><div class="event-detail-body ${c.poster_url?'has-poster':''}">${c.poster_url?`<figure class="event-detail-poster-shell"><img class="event-detail-poster" src="${esc(c.poster_url)}" alt="${esc(c.title)} poster"></figure>`:''}<div class="event-detail-copy"><p class="event-detail-meta"><strong>${esc(schedule)}</strong><br>${esc(venueLabel(c.venue))}${c.location?` · ${esc(c.location)}`:''}<br>${money(c.price)} per person · ${availability}${overall!=null?` · ${esc(overall)} event places overall`:''}</p>${c.event_type==='ANNIVERSARY'&&c.ticket_release?`<div class="anniversary-public-release"><strong>Current release: ${esc(c.ticket_release.name)}</strong><span>${money(c.ticket_release.price_pence/100)} per ticket · ${esc(c.ticket_release.remaining)} tickets remain in this release</span></div>`:''}${Number(c.class_pass_eligible)===1?`<p class="event-class-pass-note"><strong>Class Pass eligible.</strong> Signed-in members can use one available class credit for one place.</p>`:''}${c.public_notes?`<div class="event-full-description">${descriptionHtml(c.public_notes)}</div>`:''}<div class="event-detail-actions">${closed?'':`<button class="button book-class event-book" data-id="${esc(c.id)}" data-mode="${full?'waitlist':'booking'}">${full?'Join waiting list':'Book now'}</button>`}<button type="button" class="button secondary copy-event-link" data-url="${esc(url)}">Copy event link</button></div><p class="event-share-note">Use this event link on social posts, posters and flyers. A QR code can point to this exact link.</p></div></div>`;
    if(typeof d.showModal==='function')d.showModal();
  }

  async function load(){
    try{
      const r=await fetch('/api/classes',{headers:{Accept:'application/json'},cache:'no-store'});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Classes could not be loaded.');
      classes=Array.isArray(data)?data:[];
      status.hidden=true;
    }catch(e){
      classes=[];
      status.hidden=false;
      status.textContent='The live class register is temporarily unavailable. Please try again shortly or email bookings@bootscootinlinedancing.co.uk.';
    }
    filter.innerHTML='<option value="all">All venues</option>';
    [...new Map(classes.map(c=>[venueKey(c.venue),venueLabel(c.venue)])).entries()].forEach(([key,label])=>{
      const option=document.createElement('option');option.value=key;option.textContent=label;filter.append(option);
    });
    render();
    const requested=new URLSearchParams(location.search).get('event');
    if(requested){const c=classes.find(item=>String(item.id)===requested);if(c)setTimeout(()=>{document.getElementById(`event-${CSS.escape(String(c.id))}`)?.scrollIntoView({block:'center'});openEventDetails(c);},80);}
  }

  grid.addEventListener('click',event=>{
    const detail=event.target.closest('.view-event');
    if(detail){const c=classes.find(item=>item.id===detail.dataset.id);if(c)openEventDetails(c);return;}
    const button=event.target.closest('.book-class');if(!button)return;
    const c=classes.find(item=>item.id===button.dataset.id);if(!c)return;
    if(c.booking_open!==true&&c.waiting_list_open!==true)return;
    selectedClass=c;appliedPromo=null;
    const waitlist=button.dataset.mode==='waitlist';
    document.getElementById('classId').value=c.id;
    document.getElementById('bookingMode').value=waitlist?'waitlist':'booking';
    document.getElementById('bookingDialogKicker').textContent=waitlist?'Join the waiting list':'Book your place';
    document.getElementById('selectedClassName').textContent=c.title;
    document.getElementById('selectedClassMeta').textContent=`${dateFmt(c.starts_at)} · ${venueLabel(c.venue)} · ${money(c.price)} per person`;
    document.getElementById('bookingSubmit').textContent=waitlist?'Join Waiting List':'Continue to Secure Payment';
    form.reset();
    document.getElementById('promoMessage').textContent='';document.getElementById('promoTotals').hidden=true;
    document.getElementById('classId').value=c.id;
    document.getElementById('bookingMode').value=waitlist?'waitlist':'booking';
    dialog.showModal();
    creditOperationId=crypto.randomUUID();
    loadClassCreditOption(c);
  });

  document.getElementById('closeEventDetails')?.addEventListener('click',()=>document.getElementById('eventDetailsDialog')?.close());
  document.getElementById('eventDetailsDialog')?.addEventListener('click',event=>{
    const copy=event.target.closest('.copy-event-link');
    if(copy){navigator.clipboard?.writeText(copy.dataset.url).then(()=>{copy.textContent='Link copied ✓';setTimeout(()=>copy.textContent='Copy event link',1600);});return;}
    const book=event.target.closest('.event-book');
    if(book){document.getElementById('eventDetailsDialog')?.close();const proxy=document.querySelector(`.class-card .book-class[data-id="${CSS.escape(book.dataset.id)}"]`);proxy?.click();}
  });
  document.getElementById('closeBooking').onclick=()=>dialog.close();
  filter.onchange=render;
  document.getElementById('classCreditSubmit').addEventListener('click',async()=>{
    if(!selectedClass||!creditOperationId)return;
    const button=document.getElementById('classCreditSubmit'),msg=document.getElementById('formMessage');
    button.disabled=true;msg.textContent='Using your class credit…';
    try{
      const response=await fetch('/api/member/class-credit-booking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({class_id:selectedClass.id,operation_id:creditOperationId})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Your class credit could not be used.');
      location.href=`booking-confirmation.html?reference=${encodeURIComponent(result.reference||'')}&token=${encodeURIComponent(result.secure_token||'')}&customer=${encodeURIComponent(result.customer_token||'')}`;
    }catch(error){msg.textContent=error.message;button.disabled=false;}
  });


  function showPromoTotals(result){
    const box=document.getElementById('promoTotals');
    if(!result){box.hidden=true;box.innerHTML='';return;}
    box.innerHTML=`<strong><span>Original total</span><span>${money(result.subtotal_pence/100)}</span></strong><strong class="promo-success"><span>${esc(result.promotion_name||'Discount')}</span><span>−${money(result.discount_pence/100)}</span></strong><strong><span>Total to pay</span><span>${money(result.total_pence/100)}</span></strong>`;
    box.hidden=false;
  }
  async function applyPromo(){
    const code=document.getElementById('promoCode').value.trim();
    const msg=document.getElementById('promoMessage');
    if(!code){appliedPromo=null;showPromoTotals(null);msg.textContent='Enter a promo or reward code.';msg.className='form-message promo-error';return;}
    if(!selectedClass){msg.textContent='Choose a class first.';return;}
    const email=form.elements.email.value.trim();
    if(!email){msg.textContent='Enter your email address first. Personal birthday and loyalty codes are linked to your email.';msg.className='form-message promo-error';return;}
    const button=document.getElementById('applyPromo');button.disabled=true;msg.textContent='Checking code…';
    try{
      const r=await fetch('/api/promotions/validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,email,classId:selectedClass.id,quantity:Number(form.elements.quantity.value||1)})});
      const out=await r.json();if(!r.ok)throw new Error(out.error||'This code could not be applied.');
      appliedPromo=out;document.getElementById('promoCode').value=out.code;msg.textContent=`✓ ${out.promotion_name} applied`;msg.className='form-message promo-success';showPromoTotals(out);
    }catch(error){appliedPromo=null;showPromoTotals(null);msg.textContent=error.message;msg.className='form-message promo-error';}
    finally{button.disabled=false;}
  }
  document.getElementById('applyPromo').addEventListener('click',applyPromo);
  form.elements.quantity.addEventListener('change',()=>{if(appliedPromo)applyPromo();});
  form.elements.email.addEventListener('change',()=>{if(appliedPromo)applyPromo();});

  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const msg=document.getElementById('formMessage');
    const button=document.getElementById('bookingSubmit');
    button.disabled=true;msg.textContent='Securing your place…';
    const data=Object.fromEntries(new FormData(form));
    data.terms_accepted=Boolean(data.terms);
    data.marketing_consent=Boolean(data.marketing_consent);
    try{
      const r=await fetch('/api/class-reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      const out=await r.json();if(!r.ok)throw new Error(out.error||'Booking could not be created.');
      if(out.checkout_url){
        location.href=out.checkout_url;
        return;
      }
      location.href=`booking-confirmation.html?reference=${encodeURIComponent(out.reference)}&token=${encodeURIComponent(out.secure_token||'')}&customer=${encodeURIComponent(out.customer_token||'')}`;
    }catch(e){msg.textContent=(e&&e.message&&e.message!=='The string did not match the expected pattern.')?e.message:'Your booking could not be completed online. Please try again or email bookings@bootscootinlinedancing.co.uk.';button.disabled=false;}
  });

  load();
})();
