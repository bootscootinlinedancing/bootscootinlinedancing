(()=>{
  const grid=document.getElementById('classGrid');
  const filter=document.getElementById('venueFilter');
  const dialog=document.getElementById('bookingDialog');
  const form=document.getElementById('bookingForm');
  const status=document.getElementById('bookingStatus');
  let classes=[];

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(n)||0);
  const dateFmt=s=>new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s));

  function render(){
    const venue=filter.value;
    const rows=classes.filter(c=>venue==='all'||c.venue===venue);
    grid.innerHTML=rows.length?rows.map(c=>{
      const full=Number(c.spaces_remaining)<1;
      const nearly=Number(c.spaces_remaining)>0&&Number(c.spaces_remaining)<5;
      return `<article class="class-card">
        <div class="class-date"><span>${new Date(c.starts_at).toLocaleDateString('en-GB',{month:'short'}).toUpperCase()}</span><strong>${new Date(c.starts_at).getDate()}</strong></div>
        <div class="class-info">
          <p class="class-venue">${esc(c.venue)}</p><h3>${esc(c.title)}</h3>
          <p>${esc(dateFmt(c.starts_at))}</p><p>${esc(c.location)}</p>
          ${c.public_notes?`<p class="class-public-note">${esc(c.public_notes)}</p>`:''}
          <div class="class-footer"><span><b>${money(c.price)}</b> per person</span>
          <span class="spaces ${nearly?'low':''} ${full?'full':''}">${full?'Class full':`${c.spaces_remaining} spaces left`}</span></div>
        </div>
        <button class="button book-class" data-id="${esc(c.id)}" data-mode="${full?'waitlist':'booking'}">${full?'Join waiting list':'Book now'}</button>
      </article>`;
    }).join(''):'<p class="booking-empty">There are no published classes matching this filter yet.</p>';
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
  }

  grid.addEventListener('click',event=>{
    const button=event.target.closest('.book-class');if(!button)return;
    const c=classes.find(item=>item.id===button.dataset.id);if(!c)return;
    const waitlist=button.dataset.mode==='waitlist';
    document.getElementById('classId').value=c.id;
    document.getElementById('bookingMode').value=waitlist?'waitlist':'booking';
    document.getElementById('bookingDialogKicker').textContent=waitlist?'Join the waiting list':'Book your place';
    document.getElementById('selectedClassName').textContent=c.title;
    document.getElementById('selectedClassMeta').textContent=`${dateFmt(c.starts_at)} · ${c.venue} · ${money(c.price)} per person`;
    document.getElementById('bookingSubmit').textContent=waitlist?'Join Waiting List':'Continue to Secure Payment';
    form.reset();
    document.getElementById('classId').value=c.id;
    document.getElementById('bookingMode').value=waitlist?'waitlist':'booking';
    dialog.showModal();
  });

  document.getElementById('closeBooking').onclick=()=>dialog.close();
  filter.onchange=render;

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