(() => {
  const state={classes:[],bookings:null,media:[],health:null,privateEvents:[],customers:null,operations:null};
  const money=p=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(p)||0)/100);
  const fmt=s=>s?new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s)):'—';
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function toast(message,kind='success'){
    const node=document.getElementById('ranchToast');if(!node)return;
    node.hidden=false;node.className=`ranch-toast ${kind}`;node.textContent=message;
    clearTimeout(toast.timer);toast.timer=setTimeout(()=>{node.hidden=true;},3200);
  }
  const panels=[...document.querySelectorAll('[data-view-panel]')],nav=[...document.querySelectorAll('.ranch-nav button:not([disabled])')];
  function show(view){panels.forEach(p=>p.classList.toggle('active',p.dataset.viewPanel===view));nav.forEach(b=>b.classList.toggle('active',b.dataset.view===view));document.getElementById('ranchTitle').textContent=nav.find(b=>b.dataset.view===view)?.textContent.trim()||'Boot Scootin’ HQ';document.getElementById('ranchSidebar').classList.remove('open');}
  nav.forEach(b=>b.onclick=()=>show(b.dataset.view));
  document.getElementById('ranchMenuButton').onclick=()=>document.getElementById('ranchSidebar').classList.toggle('open');
  const healthLabels={
    website:['Website','Public website and HQ frontend.'],
    database:['Database','Cloudflare D1 class and booking storage.'],
    media:['Media storage','Cloudflare R2 photos, videos and PDFs.'],
    email:['Email routing','Cloudflare domain email routing.'],
    access:['Admin protection','Cloudflare Access for HQ.'],
    payments:['Payments','SumUp sandbox connection.']
  };
  function normaliseHealth(data){
    if(data?.services)return data;
    const services={};
    for(const key of Object.keys(healthLabels)){
      const item=data?.[key]||{};
      const status=item.status==='ready'?'ready':item.status==='error'?'error':item.status==='info'?'info':'setup';
      services[key]={status,message:item.detail||item.label||healthLabels[key][1]};
    }
    return {services,checked_at:data?.checked_at};
  }
  function healthCard(key,item){
    const [title,desc]=healthLabels[key]||[key,''];
    const status=item?.status||'setup';
    return `<article class="hq-health-card ${esc(status)}" data-health-key="${esc(key)}">
      <span class="health-dot ${esc(status)}"></span>
      <div><strong>${esc(title)}</strong><small>${esc(item?.message||desc)}</small></div>
      <b>${esc(status==='ready'?'ready':status==='info'?'info':status==='error'?'error':'setup')}</b>
    </article>`;
  }
  function renderHealth(){
    const grid=document.getElementById('hqHealthGrid'),mini=document.getElementById('hqHealthMini'),h=state.health;
    if(!h)return;
    const keys=Object.keys(healthLabels);
    if(grid)grid.innerHTML=keys.map(k=>healthCard(k,h.services?.[k])).join('');
    const ready=keys.filter(k=>['ready','online','protected','info'].includes(h.services?.[k]?.status)).length;
    const attention=keys.length-ready;
    if(mini)mini.innerHTML=`<span class="health-dot ${attention?'attention':'ready'}"></span><strong>${ready} ready or confirmed</strong><span> · ${attention} ${attention===1?'item needs':'items need'} setup</span><a href="#" data-open-health>View details</a>`;
    document.querySelectorAll('[data-open-health]').forEach(a=>a.onclick=e=>{e.preventDefault();show('health');});
    updateLaunchChecklist(h);
  }
  function updateLaunchChecklist(h){
    document.querySelectorAll('#hqLaunchChecklist [data-check]').forEach(li=>{
      const status=h.services?.[li.dataset.check]?.status||'setup';
      li.classList.remove('ready','pending','info','error');
      li.classList.add(status==='ready'?'ready':status==='info'?'info':status==='error'?'error':'pending');
    });
    const access=document.getElementById('ranchAccessStatus');
    const accessStatus=h.services?.access?.status;
    if(access){
      access.classList.toggle('protected',accessStatus==='ready');
      access.classList.toggle('setup',accessStatus!=='ready');
      access.innerHTML=`<span></span>${accessStatus==='ready'?'HQ protected by Cloudflare Access':'HQ protection needs attention'}`;
    }
  }
  async function loadHealth(){
    const grid=document.getElementById('hqHealthGrid'),mini=document.getElementById('hqHealthMini');
    if(grid)grid.innerHTML='<article class="hq-health-card checking"><span class="health-dot checking"></span><div><strong>Checking services…</strong><small>This check stops automatically after ten seconds.</small></div></article>';
    if(mini)mini.innerHTML='<span class="health-dot checking"></span> Checking your setup…';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      state.health=normaliseHealth(await jsonFetch('/api/admin/system-health',{cache:'no-store',signal:controller.signal}));
    }catch(e){
      state.health=normaliseHealth({
        website:{status:'ready',label:'This HQ page loaded successfully.'},
        database:{status:'setup',detail:'Protected D1 check unavailable.'},
        media:{status:'setup',detail:'Protected R2 check unavailable.'},
        email:{status:'info',label:'Email routing is managed in Cloudflare.'},
        access:{status:'setup',detail:e.name==='AbortError'?'Health check timed out safely.':e.message},
        payments:{status:'setup',label:'SumUp sandbox is not connected yet.'}
      });
    }finally{clearTimeout(timer);}
    renderHealth();
  }

  async function jsonFetch(url,options={}){
    const headers={Accept:'application/json',...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(options.headers||{})};
    const response=await fetch(url,{...options,headers});
    const text=await response.text();
    let data={};try{data=text?JSON.parse(text):{};}catch(_){data={error:text||'Unexpected server response.'};}
    if(!response.ok)throw new Error(data.error||data.detail||`Request failed (${response.status}).`);
    return data;
  }
  async function loadClasses(){try{state.classes=await jsonFetch('/api/admin/classes');document.getElementById('ranchNotice').hidden=true;}catch(e){state.classes=[];document.getElementById('ranchNotice').hidden=false;document.getElementById('ranchNotice').textContent=e.message+' The dashboard is showing setup mode until Cloudflare D1 and Access are connected.';}renderClasses();renderOverview();}
  function renderBookings(){
    const data=state.bookings||{bookings:[],waiting:[],stats:{}};
    const filter=document.getElementById('bookingAdminFilter')?.value||'all';
    let rows=data.bookings||[];
    if(filter==='active')rows=rows.filter(b=>['PENDING','PAID'].includes(b.status));
    else if(filter==='refund-review')rows=rows.filter(b=>['REFUND_DUE','CREDIT_DUE','REVIEW_IF_RESOLD','ADMIN_REVIEW'].includes(b.refund_status));
    else if(filter!=='all')rows=rows.filter(b=>b.status===filter);

    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
    set('bookingGuestTotal',data.stats?.guests||0);
    set('bookingRevenueTotal',money(data.stats?.paid||0));
    set('bookingRefundTotal',data.stats?.refunds_due||0);
    set('bookingWaitTotal',data.stats?.waiting||0);

    const box=document.getElementById('ranchBookings');
    box.innerHTML=rows.length?rows.map(b=>`<article class="hq-booking-card">
      <div class="hq-booking-main">
        <p class="kicker red">${esc(b.status)}</p>
        <h3>${esc(b.customer_name)}</h3>
        <p>${esc(b.class_title)} · ${fmt(b.starts_at)}</p>
        <small>${esc(b.customer_email)}${b.customer_phone?` · ${esc(b.customer_phone)}`:''}</small>
      </div>
      <dl>
        <div><dt>Reference</dt><dd>${esc(b.reference)}</dd></div>
        <div><dt>Places</dt><dd>${esc(b.quantity)}</dd></div>
        <div><dt>Total</dt><dd>${money(b.amount_pence)}</dd></div>
        <div><dt>Refund / credit</dt><dd>${esc(b.refund_status||'—')}</dd></div>
      </dl>
      <div class="hq-booking-actions">
        ${b.status==='PENDING'?`<button data-booking-action="MARK_PAID" data-booking-id="${esc(b.id)}">Mark paid</button>`:''}
        ${['PENDING','PAID'].includes(b.status)?`<button data-booking-action="CHECK_IN" data-booking-id="${esc(b.id)}">${b.checked_in?'Checked in':'Check in'}</button>`:''}
        ${['PENDING','PAID'].includes(b.status)?`<button data-booking-action="CANCEL" data-booking-id="${esc(b.id)}">Cancel</button>`:''}
        ${b.status==='CANCELLED'&&b.refund_status!=='REFUNDED'?`<button data-booking-action="MARK_REFUNDED" data-booking-id="${esc(b.id)}">Mark refunded</button><button data-booking-action="ISSUE_CREDIT" data-booking-id="${esc(b.id)}">Issue credit</button>`:''}
      </div>
    </article>`).join(''):'<div class="ranch-empty">No bookings match this filter.</div>';

    const waiting=document.getElementById('ranchWaitingList');
    waiting.innerHTML=(data.waiting||[]).length?(data.waiting||[]).map(w=>`<article class="hq-waiting-row">
      <div><strong>${esc(w.customer_name)}</strong><small>${esc(w.customer_email)}</small></div>
      <span>${esc(w.class_title)} · ${fmt(w.starts_at)}</span>
      <b>${esc(w.quantity)} place${Number(w.quantity)===1?'':'s'} · ${esc(w.status)}</b>
      <div class="hq-waiting-actions">
        ${w.status==='WAITING'?`<button data-waiting-action="PROMOTE_WAITLIST" data-waiting-id="${esc(w.id)}">Promote</button><button data-waiting-action="REMOVE_WAITLIST" data-waiting-id="${esc(w.id)}">Remove</button>`:''}
      </div>
    </article>`).join(''):'<div class="ranch-empty">Nobody is waiting at the moment.</div>';
  }

  async function bookingAction(id,action){
    const labels={MARK_PAID:'mark this booking as paid',CHECK_IN:'check this guest in',CANCEL:'cancel this booking',MARK_REFUNDED:'mark the payment as refunded',ISSUE_CREDIT:'issue a class credit'};
    if(!confirm(`Are you sure you want to ${labels[action]||action}?`))return;
    const body={id,action};
    if(action==='MARK_REFUNDED'){
      const booking=(state.bookings?.bookings||[]).find(b=>b.id===id);
      body.refund_amount_pence=booking?.amount_pence||0;
      body.admin_notes=prompt('Optional refund note:','Refund processed through SumUp')||'';
    }
    if(action==='ISSUE_CREDIT')body.admin_notes=prompt('Credit note or reference:','Standard class credit issued')||'Standard class credit issued';
    await jsonFetch('/api/admin/bookings',{method:'PATCH',body:JSON.stringify(body)});
    await loadBookings();toast('Booking updated successfully.');
  }

  async function loadBookings(){const box=document.getElementById('ranchBookings');try{state.bookings=await jsonFetch('/api/admin/bookings');renderBookings();}catch(e){box.innerHTML=`<div class="ranch-empty"><strong>Bookings are not connected yet.</strong><p>${esc(e.message)}</p></div>`;const wait=document.getElementById('ranchWaitingList');if(wait)wait.innerHTML='';}}
  async function loadMedia(){const box=document.getElementById('ranchMedia');if(!box)return;try{const data=await jsonFetch('/api/admin/media');state.media=data.items||[];document.getElementById('ranchMediaCount').textContent=state.media.length;renderMedia();}catch(e){state.media=[];document.getElementById('ranchMediaCount').textContent='—';box.innerHTML=`<div class="ranch-empty"><strong>Media storage is not connected yet.</strong><p>${esc(e.message)}</p></div>`;}}
  async function checkMediaBackend(){const box=document.getElementById('mediaBackendStatus');if(!box)return;box.className='hq-backend-status checking';box.innerHTML='<strong>Checking media connection…</strong><span>Checking HQ login and Cloudflare R2 storage.</span>';try{const r=await fetch('/api/admin/media-status?version=73',{cache:'no-store',headers:{Accept:'application/json'}});const d=await r.json().catch(()=>({}));const checks=d.checks||{};const rows=Object.entries(checks).map(([k,v])=>`<li><b>${v.ready?'✓':'×'}</b><span><strong>${esc(k.replace(/([A-Z])/g,' $1'))}</strong> — ${esc(v.message||'')}</span></li>`).join('');box.className=`hq-backend-status ${d.ready?'ready':'error'}`;box.innerHTML=`<strong>${d.ready?'Media Manager is connected':'Media Manager needs setup'}</strong><span>${esc(d.error||'Uploads can now be stored securely in Cloudflare R2.')}</span><ul class="media-check-list">${rows}</ul>`;return d.ready;}catch(e){box.className='hq-backend-status error';box.innerHTML=`<strong>Connection check failed</strong><span>${esc(e.message)}</span>`;return false;}}
  function renderMedia(){const box=document.getElementById('ranchMedia');if(!box)return;box.innerHTML=state.media.length?state.media.map(m=>`<article class="ranch-media-item"><div class="ranch-media-preview">${m.media_type==='image'?`<img src="/media/${encodeURIComponent(m.storage_key)}" alt="">`:m.media_type==='video'?'<span>VIDEO</span>':m.media_type==='pdf'?'<span>PDF</span>':'<span>FILE</span>'}</div><div class="ranch-media-copy"><strong>${esc(m.title)}</strong><small>${esc(m.original_name)} · ${esc(m.placement||'library')}</small><code>/media/${esc(m.storage_key)}</code></div><div class="ranch-media-actions"><button data-copy-media="${esc(m.storage_key)}">Copy link</button><button data-delete-media="${esc(m.id)}">Delete</button></div></article>`).join(''):'<div class="ranch-empty">No media uploaded yet.</div>';}
  function renderOverview(){
    const open=state.classes.filter(c=>c.status==='open'&&new Date(c.starts_at)>=new Date());
    const sold=state.classes.reduce((n,c)=>n+Number(c.sold||0),0);
    const paid=state.bookings?.stats?.paid||0;
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
    set('overviewUpcoming',open.length);set('overviewBooked',sold);set('overviewRevenue',money(paid));
    const up=document.getElementById('ranchUpcoming');
    if(up)up.innerHTML=open.length?open.slice(0,5).map(c=>`<article><div><strong>${esc(c.title)}</strong><span>${fmt(c.starts_at)} · ${esc(c.venue)}</span></div><b>${Math.max(0,Number(c.capacity)-Number(c.sold||0))} left</b></article>`).join(''):'<div class="ranch-empty">No upcoming classes yet. Add your first class.</div>';
    renderRecentActivity();
  }
  function renderRecentActivity(){
    const box=document.getElementById('ranchRecent');if(!box)return;
    const rows=state.operations?.activity||[];
    box.innerHTML=rows.length?rows.slice(0,6).map(a=>`<article><div><strong>${esc(String(a.action||'Activity').replaceAll('_',' '))}</strong><span>${esc(a.target_type||'platform')} · ${fmt(a.created_at)}</span></div></article>`).join(''):'<div class="ranch-empty">No recent platform activity yet.</div>';
  }
  function renderClasses(){
    const filter=document.getElementById('ranchClassFilter').value;
    let rows=[...state.classes];

    if(filter==='upcoming'){
      rows=rows.filter(c=>new Date(c.starts_at)>=new Date()&&c.status!=='cancelled');
    }else if(filter!=='all'){
      rows=rows.filter(c=>c.status===filter);
    }

    const live=state.classes.filter(c=>c.status==='open'&&new Date(c.starts_at)>=new Date()).length;
    const drafts=state.classes.filter(c=>c.status==='draft').length;
    const booked=state.classes.reduce((sum,c)=>sum+Number(c.sold||0),0);
    const waiting=state.classes.reduce((sum,c)=>sum+Number(c.waiting||0),0);
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
    set('classLiveCount',live);set('classDraftCount',drafts);set('classBookedCount',booked);set('classWaitingCount',waiting);

    const box=document.getElementById('ranchClasses');
    box.innerHTML=rows.length?`
      <div class="ranch-table-head class-manager-head">
        <span>Class</span><span>Date</span><span>Places</span><span>Status</span><span>Actions</span>
      </div>
      ${rows.map(c=>{
        const left=Math.max(0,Number(c.capacity)-Number(c.sold||0));
        const nextStatus=c.status==='cancelled'?'open':c.status==='open'?'closed':'open';
        const statusLabel=c.status==='cancelled'?'Reopen':c.status==='open'?'Close':'Publish';
        return `<article class="ranch-class-row class-manager-row">
          <div>
            <strong>${esc(c.title)}</strong>
            <small>${esc(c.venue)} · ${esc(c.level||'Beginner friendly')}</small>
            ${c.public_notes?`<em>${esc(c.public_notes)}</em>`:''}
          </div>
          <span>${fmt(c.starts_at)}</span>
          <span>
            <b>${Number(c.sold||0)} / ${Number(c.capacity)}</b>
            <small>${left} left${Number(c.waiting||0)?` · ${Number(c.waiting)} waiting`:''}</small>
          </span>
          <span><i class="status-pill ${esc(c.status)}">${esc(c.status)}</i></span>
          <div class="ranch-actions class-manager-actions">
            <button data-edit="${esc(c.id)}">Edit</button>
            <button data-duplicate="${esc(c.id)}">Duplicate</button>
            <button data-status-id="${esc(c.id)}" data-status-value="${nextStatus}">${statusLabel}</button>
            <button class="danger" data-delete="${esc(c.id)}">Delete</button>
          </div>
        </article>`;
      }).join('')}`:'<div class="ranch-empty">No classes in this view.</div>';
  };
  const venueSelect=document.getElementById('ranchVenue');
  venueSelect?.addEventListener('change',()=>{const d=venueDefaults[venueSelect.value];if(!d)return;document.getElementById('ranchCapacity').value=d.capacity;document.getElementById('ranchLocation').value=d.location;});
  function openClass(c){form.reset();if(c&&venueSelect&&!Array.from(venueSelect.options).some(o=>o.value===c.venue)){venueSelect.add(new Option(c.venue,c.venue));}document.getElementById('classDialogTitle').textContent=c?'Edit class':'Add a class';document.getElementById('ranchClassId').value=c?.id||'';if(c){for(const [k,v] of Object.entries(c)){const el=form.elements[k];if(!el)continue;if(k==='starts_at'||k==='ends_at')el.value=v?new Date(v).toISOString().slice(0,16):'';else if(k==='price_pence')form.elements.price.value=(v/100).toFixed(2);else el.value=v??'';}}dialog.showModal();}
  document.querySelectorAll('[data-open-class]').forEach(b=>b.onclick=()=>openClass());
  document.getElementById('closeClassDialog').onclick=()=>dialog.close();
  document.getElementById('ranchClasses').onclick=e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit)openClass(state.classes.find(c=>c.id===edit.dataset.edit));if(del&&confirm('Delete this class? This cannot be undone.'))removeClass(del.dataset.delete);};
  async function removeClass(id){try{await jsonFetch('/api/admin/classes',{method:'DELETE',body:JSON.stringify({id})});await loadClasses();}catch(e){alert(e.message);}}
  form.addEventListener('submit',async e=>{e.preventDefault();const msg=document.getElementById('classFormMessage');msg.textContent='Saving…';const data=Object.fromEntries(new FormData(form));data.capacity=Number(data.capacity);data.price_pence=Math.round(Number(data.price)*100);delete data.price;try{await jsonFetch('/api/admin/classes',{method:data.id?'PATCH':'POST',body:JSON.stringify(data)});dialog.close();await loadClasses();msg.textContent='';}catch(err){msg.textContent=err.message;}});
  document.getElementById('ranchClassFilter').onchange=renderClasses;
  document.getElementById('refreshRanch').onclick=loadClasses;
  document.getElementById('refreshBookings').onclick=loadBookings;
  document.getElementById('bookingAdminFilter')?.addEventListener('change',renderBookings);
  document.getElementById('ranchBookings')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-booking-action]');
    if(button)bookingAction(button.dataset.bookingId,button.dataset.bookingAction).catch(error=>alert(error.message));
  });
  document.getElementById('ranchWaitingList')?.addEventListener('click',async event=>{
    const button=event.target.closest('[data-waiting-action]');if(!button)return;
    const action=button.dataset.waitingAction;
    const wording=action==='PROMOTE_WAITLIST'?'promote this person into a manual booking':'remove this person from the waiting list';
    if(!confirm(`Are you sure you want to ${wording}?`))return;
    button.disabled=true;
    try{
      const result=await jsonFetch('/api/admin/bookings',{method:'PATCH',body:JSON.stringify({id:button.dataset.waitingId,action})});
      await Promise.all([loadBookings(),loadOperations()]);
      toast(action==='PROMOTE_WAITLIST'?`Waiting-list place promoted${result.reference?` (${result.reference})`:''}.`:'Waiting-list entry removed.');
    }catch(error){toast(error.message,'error');button.disabled=false;}
  });
  document.getElementById('exportBookingsCsv')?.addEventListener('click',()=>{
    const rows=state.bookings?.bookings||[];
    const headers=['Reference','Status','Customer','Email','Phone','Class','Date','Venue','Places','Amount GBP','Refund or credit'];
    const csv=[headers,...rows.map(b=>[b.reference,b.status,b.customer_name,b.customer_email,b.customer_phone||'',b.class_title,b.starts_at,b.venue,b.quantity,(Number(b.amount_pence||0)/100).toFixed(2),b.refund_status||''])]
      .map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));link.download=`boot-scootin-bookings-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(link.href);
  });
  document.getElementById('refreshMedia')?.addEventListener('click',loadMedia);
  document.getElementById('checkMediaBackend')?.addEventListener('click',checkMediaBackend);
  document.getElementById('refreshHealth')?.addEventListener('click',loadHealth);
  document.getElementById('refreshHealthSummary')?.addEventListener('click',loadHealth);
  document.getElementById('ranchMedia')?.addEventListener('click',async e=>{const copy=e.target.closest('[data-copy-media]'),del=e.target.closest('[data-delete-media]');if(copy){await navigator.clipboard.writeText(`${location.origin}/media/${copy.dataset.copyMedia}`);copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy link',1200);}if(del&&confirm('Delete this media file? Any page using it will stop displaying it.')){try{await jsonFetch('/api/admin/media',{method:'DELETE',body:JSON.stringify({id:del.dataset.deleteMedia})});await loadMedia();}catch(err){alert(err.message);}}});
  document.getElementById('mediaUploadForm')?.addEventListener('submit',async e=>{e.preventDefault();const formEl=e.currentTarget,msg=document.getElementById('mediaUploadMessage'),button=formEl.querySelector('button[type="submit"]'),file=formEl.elements.file.files[0];msg.className='form-message';if(!file)return;if(file.size>80*1024*1024){msg.classList.add('error');msg.textContent='This file is larger than 80 MB. Please compress it before uploading.';return;}const ready=await checkMediaBackend();if(!ready){msg.classList.add('error');msg.textContent='Upload stopped safely. Complete the connection items shown above, then press Check connection.';return;}const data=new FormData(formEl);button.disabled=true;msg.textContent='Uploading securely… Please keep this page open.';try{const r=await fetch('/api/admin/media',{method:'POST',body:data,headers:{Accept:'application/json'}});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||'Upload failed.');formEl.reset();msg.classList.add('success');msg.textContent=`Upload complete. ${out.note||'The website placement will update automatically.'}`;await loadMedia();}catch(err){msg.classList.add('error');msg.textContent=err.message;}finally{button.disabled=false;}});


  async function loadPrivateEvents(){
    const box=document.getElementById('ranchPrivateEvents'); if(!box)return;
    box.innerHTML='<div class="ranch-empty">Loading private event inquiries…</div>';
    try{const data=await jsonFetch('/api/admin/private-events');state.privateEvents=data.items||[];renderPrivateEvents();}
    catch(e){state.privateEvents=[];box.innerHTML=`<div class="private-secure-lock"><strong>Private-event customer details are securely locked.</strong><p>${esc(e.message)}</p><p>The public inquiry form can still collect requests into D1, but no private details are shown in HQ until Cloudflare Access is enabled.</p></div>`;}
  }
  function renderPrivateEvents(){const box=document.getElementById('ranchPrivateEvents');if(!box)return;box.innerHTML=state.privateEvents.length?state.privateEvents.map(i=>`<article class="private-admin-card"><header><div><span class="private-status">${esc(i.status.replaceAll('_',' '))}</span><h3>${esc(i.event_type)} · ${esc(i.reference)}</h3><small>Received ${fmt(i.created_at)}</small></div><strong>${esc(i.customer_name)}</strong></header><div class="private-admin-meta"><span><small>Preferred date</small><strong>${esc(i.preferred_date)}</strong></span><span><small>Guests</small><strong>${esc(i.guest_count)}</strong></span><span><small>Postcode</small><strong>${esc(i.venue_postcode)}</strong></span><span><small>Venue</small><strong>${esc(i.venue_name||'Not named')}</strong></span><span><small>Equipment</small><strong>${i.sound_system_provided?'Sound ✓':'Sound needed'} · ${i.microphone_provided?'Mic ✓':'Mic needed'}</strong></span><span><small>Latest quote</small><strong>${i.total_pence?money(i.total_pence):'Not sent'}</strong></span></div>${i.additional_notes?`<p class="private-admin-notes">${esc(i.additional_notes)}</p>`:''}<div class="private-admin-actions"><button class="primary" data-quote-private="${esc(i.id)}">Prepare quote</button><button data-private-status="REVIEWING" data-private-id="${esc(i.id)}">Mark reviewing</button><button data-private-status="AWAITING_CUSTOMER" data-private-id="${esc(i.id)}">Awaiting customer</button><button data-private-status="DECLINED" data-private-id="${esc(i.id)}">Decline</button></div></article>`).join(''):'<div class="ranch-empty">No private-event inquiries yet.</div>';}
  const privateQuoteDialog=document.getElementById('privateQuoteDialog'),privateQuoteForm=document.getElementById('privateQuoteForm');
  document.getElementById('closePrivateQuote')?.addEventListener('click',()=>privateQuoteDialog.close());
  document.getElementById('ranchPrivateEvents')?.addEventListener('click',async e=>{const q=e.target.closest('[data-quote-private]'),st=e.target.closest('[data-private-status]');if(q){const i=state.privateEvents.find(x=>x.id===q.dataset.quotePrivate);if(!i)return;privateQuoteForm.reset();document.getElementById('privateInquiryId').value=i.id;document.getElementById('privateQuoteTitle').textContent=`Proposal for ${i.customer_name}`;privateQuoteForm.elements.agreed_date.value=i.preferred_date||'';privateQuoteForm.elements.agreed_start_time.value=i.start_time||'';privateQuoteForm.elements.agreed_end_time.value=i.end_time||'';privateQuoteForm.elements.agreed_venue.value=i.venue_name||'';privateQuoteForm.elements.agreed_address.value=[i.venue_address,i.venue_postcode].filter(Boolean).join(', ');privateQuoteDialog.showModal();}if(st){if(!confirm(`Change this inquiry to ${st.dataset.privateStatus.replaceAll('_',' ').toLowerCase()}?`))return;try{await jsonFetch('/api/admin/private-events',{method:'PATCH',body:JSON.stringify({action:'STATUS',id:st.dataset.privateId,status:st.dataset.privateStatus})});await loadPrivateEvents();}catch(err){alert(err.message);}}});
  privateQuoteForm?.addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(privateQuoteForm));for(const key of ['base_fee','travel_fee','equipment_fee','extra_fee','discount','deposit']){data[`${key}_pence`]=Math.round((Number(data[key])||0)*100);delete data[key];}if(data.quote_expires_at)data.quote_expires_at=new Date(data.quote_expires_at).toISOString();const msg=document.getElementById('privateQuoteMessage');msg.textContent='Saving proposal…';try{await jsonFetch('/api/admin/private-events',{method:'POST',body:JSON.stringify(data)});privateQuoteDialog.close();await loadPrivateEvents();msg.textContent='';}catch(err){msg.textContent=err.message;}});
  document.getElementById('refreshPrivateEvents')?.addEventListener('click',loadPrivateEvents);

  loadClasses();loadBookings();loadPrivateEvents();loadMedia();loadHealth();loadOperations();checkMediaBackend();
})();


/* VERSION 80 — HQ command centre */
(() => {
  const notificationsNode = document.getElementById('hqNotifications');
  const accessNode = document.getElementById('ranchAccessStatus');
  const refreshButton = document.getElementById('refreshNotifications');

  const escapeText = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

  const renderNotifications = items => {
    if (!notificationsNode) return;
    if (!items.length) {
      notificationsNode.innerHTML = '<article class="hq-notification is-good"><span>✓</span><div><strong>Nothing urgent</strong><p>Your connected services are responding and there are no new items requiring attention.</p></div></article>';
      return;
    }
    notificationsNode.innerHTML = items.map(item => `
      <article class="hq-notification ${escapeText(item.kind || '')}">
        <span>${escapeText(item.icon || '•')}</span>
        <div><strong>${escapeText(item.title)}</strong><p>${escapeText(item.message)}</p>${item.action ? `<button type="button" data-notification-view="${escapeText(item.action)}">Open</button>` : ''}</div>
      </article>`).join('');

    notificationsNode.querySelectorAll('[data-notification-view]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button.dataset.notificationView;
        const navButton = document.querySelector(`.ranch-nav [data-view="${target}"]`);
        if (navButton) navButton.click();
      });
    });
  };

  const updateChecklist = health => {
    const states = {
      website: health?.website?.status === 'ONLINE',
      database: health?.database?.status === 'READY',
      media: health?.media?.status === 'READY',
      access: health?.access?.status === 'READY',
      payments: health?.payments?.status === 'READY'
    };
    Object.entries(states).forEach(([key, ready]) => {
      const li = document.querySelector(`[data-check="${key}"]`);
      if (!li) return;
      li.classList.toggle('ready', Boolean(ready));
      li.classList.toggle('pending', !ready);
    });
    const email = document.querySelector('[data-check="email"]');
    if (email) email.classList.add('ready');

    if (accessNode) {
      const protectedState = health?.access?.status === 'READY';
      accessNode.classList.toggle('protected', protectedState);
      accessNode.classList.toggle('setup', !protectedState);
      accessNode.innerHTML = `<span></span>${protectedState ? 'HQ protected by Cloudflare Access' : 'HQ protection still needs Cloudflare Access'}`;
    }
  };

  async function collectNotifications() {
    const items = [];
    let health = null;

    try {
      const response = await fetch('/api/admin/health', {cache: 'no-store'});
      health = await response.json();
      updateChecklist(health);

      if (health?.access?.status !== 'READY') {
        items.push({kind:'is-warning', icon:'🔒', title:'Protect Boot Scootin’ HQ', message:'Cloudflare Access is not confirmed yet. Keep private customer information locked until protection is active.', action:'health'});
      }
      if (health?.payments?.status !== 'READY') {
        items.push({kind:'is-setup', icon:'💳', title:'Payments are still in setup mode', message:'SumUp sandbox is not connected, so paid bookings and deposits remain disabled.', action:'health'});
      }
      if (health?.database?.status !== 'READY') {
        items.push({kind:'is-warning', icon:'🗄️', title:'Database needs attention', message:'D1 is not reporting ready. Classes and private-event records may not load.', action:'health'});
      }
      if (health?.media?.status !== 'READY') {
        items.push({kind:'is-setup', icon:'📸', title:'Media storage needs attention', message:'R2 is not reporting ready, so HQ uploads remain unavailable.', action:'media'});
      }
    } catch (error) {
      items.push({kind:'is-warning', icon:'⚠️', title:'System check could not run', message:'HQ could not reach the health endpoint. The public website may still be available.', action:'health'});
    }

    try {
      const response = await fetch('/api/admin/private-events', {cache:'no-store'});
      if (response.ok) {
        const data = await response.json();
        const newItems = (data.items || []).filter(item => ['NEW','INQUIRY_RECEIVED','CHANGES_REQUESTED'].includes(String(item.status || '').toUpperCase()));
        if (newItems.length) {
          items.unshift({kind:'is-new', icon:'🎉', title:`${newItems.length} private-event item${newItems.length === 1 ? '' : 's'} need attention`, message:'Open the Private Events dashboard to review inquiries or requested changes.', action:'private-events'});
        }
      }
    } catch (_) {}

    try {
      const response = await fetch('/api/admin/classes', {cache:'no-store'});
      if (response.ok) {
        const classes = await response.json();
        const upcoming = Array.isArray(classes) ? classes.filter(item => new Date(item.starts_at) > new Date() && item.status === 'open') : [];
        if (!upcoming.length) {
          items.push({kind:'is-setup', icon:'📅', title:'No upcoming classes are live', message:'Add or open a class so the public booking page has a date to display.', action:'classes'});
        }
      }
    } catch (_) {}

    renderNotifications(items);
  }

  document.querySelectorAll('[data-view-jump]').forEach(button => {
    button.addEventListener('click', () => {
      const navButton = document.querySelector(`.ranch-nav [data-view="${button.dataset.viewJump}"]`);
      if (navButton) navButton.click();
    });
  });

  if (refreshButton) refreshButton.addEventListener('click', collectNotifications);
  window.addEventListener('load', collectNotifications);


  function renderOperations(){
    const data=state.operations||{summary:{},classes:[],queue:[],activity:[]};
    const set=(id,value)=>{const n=document.getElementById(id);if(n)n.textContent=value;};
    set('opsTodayClasses',data.summary?.today_classes||0);
    set('opsTodayGuests',data.summary?.today_guests||0);
    set('opsPaidRevenue',money(data.summary?.paid_revenue||0));
    set('opsPendingPayments',data.summary?.pending_payments||0);
    set('opsWaitingGuests',data.summary?.waiting_guests||0);
    set('opsRefundReview',data.summary?.refund_review||0);

    const queue=document.getElementById('operationsQueue');
    if(queue)queue.innerHTML=(data.queue||[]).length?(data.queue||[]).map(item=>`
      <button class="operations-queue-item ${esc(item.type)}" type="button" data-view-jump="${esc(item.target||'bookings')}">
        <strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span>
      </button>`).join(''):'<div class="ranch-empty">Nothing urgent needs attention.</div>';

    const activity=document.getElementById('operationsActivity');
    if(activity)activity.innerHTML=(data.activity||[]).length?(data.activity||[]).map(item=>`
      <article class="operations-activity-row">
        <strong>${esc(String(item.action||'Activity').replaceAll('_',' '))}</strong>
        <span>${esc(item.target_type||'platform')} · ${fmt(item.created_at)}</span>
      </article>`).join(''):'<div class="ranch-empty">No recorded activity yet.</div>';

    const classes=document.getElementById('operationsClasses');
    if(classes)classes.innerHTML=(data.classes||[]).length?(data.classes||[]).map(c=>`
      <article class="operations-class-row">
        <div><strong>${esc(c.title)}</strong><span>${fmt(c.starts_at)} · ${esc(c.venue)}</span></div>
        <div><b>${Number(c.sold||0)} / ${Number(c.capacity||0)}</b><small>${Number(c.waiting||0)} waiting</small></div>
      </article>`).join(''):'<div class="ranch-empty">No upcoming classes found.</div>';

    renderRecentActivity();
    document.querySelectorAll('#operationsQueue [data-view-jump]').forEach(button=>button.onclick=()=>{
      const navButton=document.querySelector(`.ranch-nav [data-view="${button.dataset.viewJump}"]`);
      if(navButton)navButton.click();
    });
  }

  async function loadOperations(){
    const queue=document.getElementById('operationsQueue');
    try{
      state.operations=await jsonFetch('/api/admin/operations',{cache:'no-store'});
      renderOperations();renderOverview();
    }catch(error){
      state.operations={summary:{},classes:[],queue:[],activity:[]};
      if(queue)queue.innerHTML=`<div class="ranch-empty"><strong>Operations data unavailable.</strong><p>${esc(error.message)}</p></div>`;
      renderRecentActivity();
    }
  }

  function renderCustomers(){
    const box=document.getElementById('ranchCustomers');
    if(!box)return;
    const q=(document.getElementById('customerAdminSearch')?.value||'').trim().toLowerCase();
    const rows=(state.customers?.customers||[]).filter(c=>
      !q || String(c.customer_name||'').toLowerCase().includes(q) || String(c.customer_email||'').toLowerCase().includes(q)
    );
    box.innerHTML=rows.length?rows.map(c=>`
      <article class="hq-customer-card">
        <div>
          <p class="kicker red">${c.marketing_consent?'Marketing opt-in':'Service emails only'}</p>
          <h3>${esc(c.customer_name)}</h3>
          <p>${esc(c.customer_email)}${c.customer_phone?` · ${esc(c.customer_phone)}`:''}</p>
        </div>
        <dl>
          <div><dt>Bookings</dt><dd>${esc(c.total_bookings)}</dd></div>
          <div><dt>Attended</dt><dd>${esc(c.attended_classes)}</dd></div>
          <div><dt>Cancelled</dt><dd>${esc(c.cancelled_bookings)}</dd></div>
          <div><dt>Loyalty</dt><dd>${esc(c.loyalty_progress)} / 9${c.reward_ready?' · Reward ready':''}</dd></div>
        </dl>
      </article>
    `).join(''):'<div class="ranch-empty">No customers match this search.</div>';
  }

  async function loadCustomers(){
    const box=document.getElementById('ranchCustomers');
    if(!box)return;
    try{
      state.customers=await jsonFetch('/api/admin/customers');
      renderCustomers();
    }catch(error){
      box.innerHTML=`<div class="ranch-empty"><strong>Customer register unavailable.</strong><p>${esc(error.message)}</p></div>`;
    }
  }

  document.getElementById('refreshOperations')?.addEventListener('click',loadOperations);
  document.getElementById('printOperationsRegister')?.addEventListener('click',()=>window.print());
    document.getElementById('refreshCustomers')?.addEventListener('click',loadCustomers);
  document.getElementById('customerAdminSearch')?.addEventListener('input',renderCustomers);
  document.getElementById('exportCustomersCsv')?.addEventListener('click',()=>{
    const rows=state.customers?.customers||[];
    const headers=['Name','Email','Phone','Bookings','Paid bookings','Cancelled bookings','Attended','Loyalty progress','Marketing consent'];
    const csv=[headers,...rows.map(c=>[
      c.customer_name,c.customer_email,c.customer_phone||'',c.total_bookings,c.paid_bookings,
      c.cancelled_bookings,c.attended_classes,c.loyalty_progress,c.marketing_consent?'Yes':'No'
    ])].map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const link=document.createElement('a');
    link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    link.download=`boot-scootin-customers-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  loadCustomers();loadOperations();
})();


