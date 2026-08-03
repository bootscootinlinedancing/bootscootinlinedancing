(() => {
  const state={classes:[],bookings:null,media:[],health:null,privateEvents:[]};
  const money=p=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(p)||0)/100);
  const fmt=s=>s?new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s)):'—';
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const panels=[...document.querySelectorAll('[data-view-panel]')],nav=[...document.querySelectorAll('.ranch-nav button:not([disabled])')];
  function show(view){panels.forEach(p=>p.classList.toggle('active',p.dataset.viewPanel===view));nav.forEach(b=>b.classList.toggle('active',b.dataset.view===view));document.getElementById('ranchTitle').textContent=nav.find(b=>b.dataset.view===view)?.textContent.trim()||'Boot Scootin’ HQ';document.getElementById('ranchSidebar').classList.remove('open');}
  nav.forEach(b=>b.onclick=()=>show(b.dataset.view));
  document.getElementById('ranchMenuButton').onclick=()=>document.getElementById('ranchSidebar').classList.toggle('open');


  const healthLabels={
    website:['Website','Public site and HQ frontend are responding.'],
    database:['Database','Cloudflare D1 class and booking storage.'],
    media:['Media storage','Cloudflare R2 photos, videos and PDFs.'],
    payments:['Payments','SumUp connection and operating mode.'],
    email:['Email confirmations','Transactional email provider.'],
    access:['Admin protection','Cloudflare Access identity header.'],
    backups:['Backups','Pilot backup and export readiness.']
  };
  function healthCard(key,item){const [title,desc]=healthLabels[key]||[key,''];const status=item?.status||'unknown';return `<article class="hq-health-card ${esc(status)}"><span class="health-dot ${esc(status)}"></span><div><strong>${esc(title)}</strong><small>${esc(item?.message||desc)}</small></div><b>${esc(status.replaceAll('_',' '))}</b></article>`;}
  function renderHealth(){const grid=document.getElementById('hqHealthGrid'),mini=document.getElementById('hqHealthMini'),h=state.health;if(!h)return;const keys=['website','access','database','media','payments','email','backups'];if(grid)grid.innerHTML=keys.map(k=>healthCard(k,h.services?.[k])).join('');const ready=keys.filter(k=>['ready','online','protected'].includes(h.services?.[k]?.status)).length;const attention=keys.length-ready;if(mini)mini.innerHTML=`<span class="health-dot ${attention?'attention':'ready'}"></span><strong>${ready} ready</strong><span> · ${attention} ${attention===1?'item needs':'items need'} attention</span><a href="#" data-open-health>View details</a>`;document.querySelectorAll('[data-open-health]').forEach(a=>a.onclick=e=>{e.preventDefault();show('health');});}
  async function loadHealth(){const grid=document.getElementById('hqHealthGrid'),mini=document.getElementById('hqHealthMini');if(grid)grid.innerHTML='<article class="hq-health-card"><span class="health-dot checking"></span><div><strong>Checking services…</strong><small>Please wait.</small></div></article>';if(mini)mini.innerHTML='<span class="health-dot checking"></span> Checking your setup…';try{state.health=await jsonFetch('/api/admin/health?version=73',{cache:'no-store'});renderHealth();}catch(e){state.health={services:{website:{status:'online',message:'This page loaded successfully.'},access:{status:'attention',message:e.message},database:{status:'attention',message:'Could not run the protected health check.'},media:{status:'attention',message:'Could not run the protected health check.'},payments:{status:'setup',message:'Not connected to SumUp sandbox yet.'},email:{status:'setup',message:'Not connected yet.'},backups:{status:'setup',message:'Export and restore test not completed yet.'}}};renderHealth();}}

  async function jsonFetch(url,options){const r=await fetch(url,{headers:{Accept:'application/json','Content-Type':'application/json',...(options?.headers||{})},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'The Ranch backend is not configured yet.');return d;}
  async function loadClasses(){try{state.classes=await jsonFetch('/api/admin/classes');document.getElementById('ranchNotice').hidden=true;}catch(e){state.classes=[];document.getElementById('ranchNotice').hidden=false;document.getElementById('ranchNotice').textContent=e.message+' The dashboard is showing setup mode until Cloudflare D1 and Access are connected.';}renderClasses();renderOverview();}
  async function loadBookings(){const box=document.getElementById('ranchBookings');try{state.bookings=await jsonFetch('/api/admin/bookings');renderBookings();}catch(e){box.innerHTML=`<div class="ranch-empty"><strong>Bookings are not connected yet.</strong><p>${esc(e.message)}</p></div>`;}}
  async function loadMedia(){const box=document.getElementById('ranchMedia');if(!box)return;try{const data=await jsonFetch('/api/admin/media');state.media=data.items||[];document.getElementById('ranchMediaCount').textContent=state.media.length;renderMedia();}catch(e){state.media=[];document.getElementById('ranchMediaCount').textContent='—';box.innerHTML=`<div class="ranch-empty"><strong>Media storage is not connected yet.</strong><p>${esc(e.message)}</p></div>`;}}
  async function checkMediaBackend(){const box=document.getElementById('mediaBackendStatus');if(!box)return;box.className='hq-backend-status checking';box.innerHTML='<strong>Checking media connection…</strong><span>Checking HQ login and Cloudflare R2 storage.</span>';try{const r=await fetch('/api/admin/media-status?version=73',{cache:'no-store',headers:{Accept:'application/json'}});const d=await r.json().catch(()=>({}));const checks=d.checks||{};const rows=Object.entries(checks).map(([k,v])=>`<li><b>${v.ready?'✓':'×'}</b><span><strong>${esc(k.replace(/([A-Z])/g,' $1'))}</strong> — ${esc(v.message||'')}</span></li>`).join('');box.className=`hq-backend-status ${d.ready?'ready':'error'}`;box.innerHTML=`<strong>${d.ready?'Media Manager is connected':'Media Manager needs setup'}</strong><span>${esc(d.error||'Uploads can now be stored securely in Cloudflare R2.')}</span><ul class="media-check-list">${rows}</ul>`;return d.ready;}catch(e){box.className='hq-backend-status error';box.innerHTML=`<strong>Connection check failed</strong><span>${esc(e.message)}</span>`;return false;}}
  function renderMedia(){const box=document.getElementById('ranchMedia');if(!box)return;box.innerHTML=state.media.length?state.media.map(m=>`<article class="ranch-media-item"><div class="ranch-media-preview">${m.media_type==='image'?`<img src="/media/${encodeURIComponent(m.storage_key)}" alt="">`:m.media_type==='video'?'<span>VIDEO</span>':m.media_type==='pdf'?'<span>PDF</span>':'<span>FILE</span>'}</div><div class="ranch-media-copy"><strong>${esc(m.title)}</strong><small>${esc(m.original_name)} · ${esc(m.placement||'library')}</small><code>/media/${esc(m.storage_key)}</code></div><div class="ranch-media-actions"><button data-copy-media="${esc(m.storage_key)}">Copy link</button><button data-delete-media="${esc(m.id)}">Delete</button></div></article>`).join(''):'<div class="ranch-empty">No media uploaded yet.</div>';}
  function renderOverview(){const open=state.classes.filter(c=>c.status==='open'&&new Date(c.starts_at)>=new Date());const sold=state.classes.reduce((n,c)=>n+Number(c.sold||0),0);const revenue=state.classes.reduce((n,c)=>n+(Number(c.sold||0)*Number(c.price_pence||0)),0);const stats=document.getElementById('ranchStats').children;stats[0].querySelector('strong').textContent=open.length;stats[1].querySelector('strong').textContent=sold;stats[2].querySelector('strong').textContent=money(revenue);const up=document.getElementById('ranchUpcoming');up.innerHTML=open.length?open.slice(0,5).map(c=>`<article><div><strong>${esc(c.title)}</strong><span>${fmt(c.starts_at)} · ${esc(c.venue)}</span></div><b>${Math.max(0,c.capacity-c.sold)} left</b></article>`).join(''):'<div class="ranch-empty">No upcoming classes yet. Add your first class.</div>';}
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

  loadClasses();loadBookings();loadPrivateEvents();loadMedia();loadHealth();checkMediaBackend();
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
})();
