(()=>{
  const grid=document.getElementById('classGrid');
  const filter=document.getElementById('venueFilter');
  const dialog=document.getElementById('bookingDialog');
  const form=document.getElementById('bookingForm');
  const status=document.getElementById('bookingStatus');
  let classes=[];
  let selectedClass=null;
  let appliedPromo=null;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(n)||0);
  const dateFmt=s=>new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s));

  function summaryText(text){
    const clean=String(text||'').replace(/\s+/g,' ').trim();
    if(!clean)return '';
    const sentence=clean.match(/^(.{1,170}?[.!?])(?:\s|$)/)?.[1];
    return sentence||`${clean.slice(0,150)}${clean.length>150?'…':''}`;
  }
  function eventUrl(c){return `${location.origin}${location.pathname}?event=${encodeURIComponent(c.id)}`;}
  function render(){
    const venue=filter.value;
    const rows=classes.filter(c=>venue==='all'||c.venue===venue);
    grid.innerHTML=rows.length?rows.map(c=>{
      const full=Number(c.spaces_remaining)<1;
      const nearly=Number(c.spaces_remaining)>0&&Number(c.spaces_remaining)<5;
      return `<article class="class-card" id="event-${esc(c.id)}">
        ${c.poster_url?`<div class="class-poster"><img src="${esc(c.poster_url)}" alt="${esc(c.title)} poster" loading="lazy"></div>`:''}
        <div class="class-date"><span>${new Date(c.starts_at).toLocaleDateString('en-GB',{month:'short'}).toUpperCase()}</span><strong>${new Date(c.starts_at).getDate()}</strong></div>
        <div class="class-info">
          <p class="class-venue">${esc(c.venue)}</p><h3>${esc(c.title)}</h3>
          <p>${esc(dateFmt(c.starts_at))}</p><p>${esc(c.location)}</p>
          <div class="class-footer"><span><b>${money(c.price)}</b> per person</span>
          <span class="spaces ${nearly?'low':''} ${full?'full':''}">${full?'Class full':`${c.spaces_remaining} spaces left`}</span></div>
          <div class="class-card-actions"><button type="button" class="button secondary view-event" data-id="${esc(c.id)}">View details</button><button class="button book-class" data-id="${esc(c.id)}" data-mode="${full?'waitlist':'booking'}">${full?'Join waiting list':'Book now'}</button></div>
        </div>
      </article>`;
    }).join(''):'<p class="booking-empty">There are no published classes matching this filter yet.</p>';
  }

  function openEventDetails(c){
    const d=document.getElementById('eventDetailsDialog'),box=document.getElementById('eventDetailsContent'); if(!d||!box)return;
    const full=Number(c.spaces_remaining)<1; const url=eventUrl(c);
    box.innerHTML=`<p class="eyebrow">${esc(c.venue)}</p><h2>${esc(c.title)}</h2>${c.poster_url?`<img class="event-detail-poster" src="${esc(c.poster_url)}" alt="${esc(c.title)} poster">`:''}<p class="event-detail-meta"><strong>${esc(dateFmt(c.starts_at))}</strong><br>${esc(c.location)}<br>${money(c.price)} per person · ${full?'Class full':`${esc(c.spaces_remaining)} spaces left`}</p>${c.public_notes?`<div class="event-full-description">${esc(c.public_notes).replace(/\n/g,'<br>')}</div>`:''}<div class="event-detail-actions"><button class="button book-class event-book" data-id="${esc(c.id)}" data-mode="${full?'waitlist':'booking'}">${full?'Join waiting list':'Book now'}</button><button type="button" class="button secondary copy-event-link" data-url="${esc(url)}">Copy event link</button></div><p class="event-share-note">Use this event link on social posts, posters and flyers. A QR code can point to this exact link.</p>`;
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
    [...new Set(classes.map(c=>c.venue))].forEach(v=>{
      const option=document.createElement('option');option.value=v;option.textContent=v;filter.append(option);
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
    selectedClass=c;appliedPromo=null;
    const waitlist=button.dataset.mode==='waitlist';
    document.getElementById('classId').value=c.id;
    document.getElementById('bookingMode').value=waitlist?'waitlist':'booking';
    document.getElementById('bookingDialogKicker').textContent=waitlist?'Join the waiting list':'Book your place';
    document.getElementById('selectedClassName').textContent=c.title;
    document.getElementById('selectedClassMeta').textContent=`${dateFmt(c.starts_at)} · ${c.venue} · ${money(c.price)} per person`;
    document.getElementById('bookingSubmit').textContent=waitlist?'Join Waiting List':'Continue to Secure Payment';
    form.reset();
    document.getElementById('promoMessage').textContent='';document.getElementById('promoTotals').hidden=true;
    document.getElementById('classId').value=c.id;
    document.getElementById('bookingMode').value=waitlist?'waitlist':'booking';
    dialog.showModal();
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