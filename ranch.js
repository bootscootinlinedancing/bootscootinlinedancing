(()=>{
  const state={
    currentView:'overview',
    bootstrap:null,
    classes:[],
    bookings:null,
    customers:null,
    operations:null,
    media:[],
    privateEvents:[],
    bootstrapPromise:null,
    bootstrapLoadedAt:0,
    bootstrapError:null
  };

  const $=selector=>document.querySelector(selector);
  const $$=selector=>[...document.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=pence=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(pence)||0)/100);
  const fmt=value=>{
    if(!value)return '—';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return String(value);
    return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(d);
  };


  const BOOTSTRAP_CACHE_KEY='boot-scootin-hq-bootstrap-v92-2';
  const BOOTSTRAP_FRESH_MS=30000;

  function saveBootstrapCache(data){
    try{
      localStorage.setItem(BOOTSTRAP_CACHE_KEY,JSON.stringify({
        savedAt:Date.now(),
        data
      }));
    }catch(_){}
  }

  function readBootstrapCache(){
    try{
      const cached=JSON.parse(localStorage.getItem(BOOTSTRAP_CACHE_KEY)||'null');
      if(!cached?.data)return null;
      return cached;
    }catch(_){return null;}
  }

  function updateLastUpdated(source='live'){
    const node=document.getElementById('ranch92LastUpdated');
    if(!node)return;
    const time=state.bootstrapLoadedAt?new Date(state.bootstrapLoadedAt):new Date();
    node.textContent=`${source==='cache'?'Showing saved data':'Last updated'} ${time.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
  }

  function setModeLoading(show){
    const title=document.getElementById('ranch92ModeTitle');
    const detail=document.getElementById('ranch92ModeDetail');
    if(!title||!detail)return;
    if(show && !state.bootstrap){
      title.textContent='Checking backend configuration…';
      detail.textContent='Please wait.';
    }
  }

  function toast(message,kind='success'){
    const node=$('#ranch91Toast');if(!node)return;
    node.hidden=false;node.className=`ranch91-toast ${kind}`;node.textContent=message;
    clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,3200);
  }

  async function jsonFetch(url,options={},timeoutMs=10000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(url,{
        ...options,
        signal: options.signal || controller.signal,
        headers:{
          Accept:'application/json',
          ...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),
          ...(options.headers||{})
        }
      });
      const text=await response.text();
      let data={};
      try{data=text?JSON.parse(text):{};}catch(_){data={error:text||'Unexpected server response.'};}
      if(!response.ok){
        const error=new Error(data.error||data.detail||`Request failed (${response.status}).`);
        error.code=data.code||'REQUEST_FAILED';
        error.status=response.status;
        throw error;
      }
      return data;
    }finally{clearTimeout(timer);}
  }

  function lockedPanel(title,detail){
    return `<div class="ranch92-state locked"><strong>${esc(title)}</strong><p>${esc(detail)}</p><button type="button" data-open-settings>Open setup instructions</button></div>`;
  }
  function setupPanel(title,detail){
    return `<div class="ranch92-state setup"><strong>${esc(title)}</strong><p>${esc(detail)}</p><button type="button" data-open-settings>Open setup instructions</button></div>`;
  }
  function emptyPanel(message){
    return `<div class="ranch-empty">${esc(message)}</div>`;
  }

  // Drawer
  const drawer=$('#ranch91Drawer'),backdrop=$('#ranch91Backdrop'),menuButton=$('#ranch91Menu'),closeButton=$('#ranch91Close');
  function setDrawer(open){
    drawer.classList.toggle('open',open);
    drawer.setAttribute('aria-hidden',String(!open));
    menuButton.setAttribute('aria-expanded',String(open));
    document.body.classList.toggle('ranch91-drawer-open',open);
    backdrop.hidden=!open;backdrop.classList.toggle('open',open);
    if(open){drawer.scrollTop=0;setTimeout(()=>closeButton.focus({preventScroll:true}),0);}
  }
  menuButton.addEventListener('click',()=>setDrawer(!drawer.classList.contains('open')));
  closeButton.addEventListener('click',()=>setDrawer(false));
  backdrop.addEventListener('click',()=>setDrawer(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setDrawer(false);});
  window.addEventListener('pageshow',()=>setDrawer(false));

  const titles={overview:'HQ Home',classes:'Classes',bookings:'Bookings',customers:'Customers',operations:'Operations','private-events':'Private Events',media:'Media',health:'System Health',settings:'Settings'};
  function showView(name){
    state.currentView=name;
    $$('.ranch-view').forEach(panel=>panel.classList.toggle('active',panel.dataset.viewPanel===name));
    $$('.ranch91-nav [data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===name));
    $('#ranch91PageTitle').textContent=titles[name]||'HQ';
    setDrawer(false);
    window.scrollTo({top:0,behavior:'instant'});
    if(name==='classes')loadClasses();
    if(name==='bookings')loadBookings();
    if(name==='customers')loadCustomers();
    if(name==='operations')renderOperationsFromBootstrap();
    if(name==='private-events')loadPrivateEvents();
    if(name==='media')loadMedia();
  }
  $$('.ranch91-nav [data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
  document.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-settings]');
    if(open)showView('settings');
  });

  function renderMode(){
    const b=state.bootstrap;
    if(!b)return;
    const modebar=$('#ranch92Modebar');
    const title=$('#ranch92ModeTitle');
    const detail=$('#ranch92ModeDetail');
    modebar.classList.toggle('protected',b.mode==='protected');
    modebar.classList.toggle('pilot',b.mode!=='protected');
    title.textContent=b.mode==='protected'?'Protected HQ mode':'Public pilot mode';
    detail.textContent=b.mode==='protected'
      ?`Signed in${b.admin_email?` as ${b.admin_email}`:''}. Private administration is available.`
      :'Only non-sensitive summaries are shown. Customer and private-event details remain locked until Cloudflare Access is enabled.';
  }

  function renderSetup(){
    const box=$('#ranch92SetupStatus');
    if(!box||!state.bootstrap)return;
    const c=state.bootstrap.configured;
    const rows=[
      ['Cloudflare Access',c.access,'Protects private customer administration.'],
      ['ADMIN_EMAIL',c.admin_email,'Limits HQ access to your email address.'],
      ['D1 database',c.database,'Stores classes, bookings, attendance and event inquiries.'],
      ['R2 media bucket',c.media,'Stores website images, videos and PDFs.'],
      ['SumUp Sandbox',c.sumup,'Tests secure payment checkout before going live.']
    ];
    box.innerHTML=rows.map(([name,ready,detail])=>`<article class="ranch92-connection ${ready?'ready':'setup'}"><span></span><div><strong>${esc(name)}</strong><small>${esc(detail)}</small></div><b>${ready?'Connected':'Setup'}</b></article>`).join('')
      +(state.bootstrap.setup_steps.length?`<div class="ranch92-steps"><h3>Next steps</h3><ol>${state.bootstrap.setup_steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol></div>`:'<div class="ranch92-complete">All core backend connections are available.</div>');
  }

  function renderOverview(){
    const b=state.bootstrap;
    if(!b)return;
    $('#overviewUpcoming').textContent=b.summary.upcoming_classes;
    $('#overviewBooked').textContent=b.summary.places_booked;
    $('#overviewRevenue').textContent=money(b.summary.paid_revenue);
    $('#overviewMedia').textContent=b.summary.media_files;

    const upcoming=$('#ranchUpcoming');
    upcoming.innerHTML=b.classes.length
      ?b.classes.slice(0,6).map(c=>`<article><div><strong>${esc(c.title)}</strong><span>${fmt(c.starts_at)} · ${esc(c.venue)}</span></div><b>${Math.max(0,Number(c.capacity)-Number(c.sold||0))} left</b></article>`).join('')
      :(b.configured.database?emptyPanel('No upcoming classes yet.'):setupPanel('Database not connected','Bind D1 as BOOKINGS_DB to display and manage classes.'));

    const recent=$('#ranchRecent');
    recent.innerHTML=b.activity.length
      ?b.activity.map(a=>`<article><div><strong>${esc(String(a.action||'Activity').replaceAll('_',' '))}</strong><span>${esc(a.target_type||'platform')} · ${fmt(a.created_at)}</span></div></article>`).join('')
      :(b.configured.database?emptyPanel('No activity has been recorded yet.'):setupPanel('Activity unavailable','Connect D1 to record bookings, cancellations, uploads and administrative actions.'));

    const attention=$('#ranch91Attention');
    const items=[];
    if(!b.configured.access)items.push(['Protect HQ','Cloudflare Access is required before private customer administration.','settings']);
    if(!b.configured.database)items.push(['Connect D1','Classes, bookings and operations require the BOOKINGS_DB binding.','settings']);
    if(!b.configured.media)items.push(['Connect R2','Media uploads require the MEDIA_BUCKET binding.','settings']);
    if(!b.configured.sumup)items.push(['Connect SumUp Sandbox','Payment testing can begin after Access and D1 are ready.','settings']);
    if(b.summary.pending_payments)items.push([`${b.summary.pending_payments} pending payment${b.summary.pending_payments===1?'':'s'}`,'Review and confirm payment status.','bookings']);
    if(b.summary.refund_review)items.push([`${b.summary.refund_review} refund or credit review${b.summary.refund_review===1?'':'s'}`,'Open bookings to review the request.','bookings']);
    if(b.summary.waiting_guests)items.push([`${b.summary.waiting_guests} waiting-list guest${b.summary.waiting_guests===1?'':'s'}`,'Review available class capacity.','operations']);
    attention.innerHTML=items.length
      ?items.map(([title,detail,target])=>`<button type="button" class="ranch91-attention-item" data-jump="${esc(target)}"><strong>${esc(title)}</strong><span>${esc(detail)}</span></button>`).join('')
      :emptyPanel('Nothing urgent needs attention.');
    $$('#ranch91Attention [data-jump]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.jump)));
  }

  async function loadBootstrap(showToast=false,{force=false,silent=false}={}){
    const age=Date.now()-state.bootstrapLoadedAt;
    if(!force && state.bootstrap && age<BOOTSTRAP_FRESH_MS){
      renderMode();renderSetup();renderOverview();renderOperationsFromBootstrap();
      return state.bootstrap;
    }

    if(state.bootstrapPromise)return state.bootstrapPromise;

    if(!state.bootstrap){
      const cached=readBootstrapCache();
      if(cached?.data){
        state.bootstrap=cached.data;
        state.bootstrapLoadedAt=cached.savedAt||Date.now();
        renderMode();renderSetup();renderOverview();renderOperationsFromBootstrap();
        updateLastUpdated('cache');
      }
    }

    if(!silent)setModeLoading(true);

    state.bootstrapPromise=(async()=>{
      try{
        const data=await jsonFetch('/api/admin/bootstrap',{cache:'no-store'},6000);
        state.bootstrap=data;
        state.bootstrapLoadedAt=Date.now();
        state.bootstrapError=null;
        saveBootstrapCache(data);
        renderMode();renderSetup();renderOverview();renderOperationsFromBootstrap();
        updateLastUpdated('live');
        if(showToast)toast('Backend status refreshed.');
        return data;
      }catch(error){
        state.bootstrapError=error;
        if(state.bootstrap){
          renderMode();renderSetup();renderOverview();renderOperationsFromBootstrap();
          updateLastUpdated('cache');
          if(showToast)toast('Live refresh was slow. Showing the last successful data.','error');
          return state.bootstrap;
        }

        const title=document.getElementById('ranch92ModeTitle');
        const detail=document.getElementById('ranch92ModeDetail');
        if(title)title.textContent='Backend check unavailable';
        if(detail)detail.textContent='The live check did not finish. Tap Refresh to try again.';
        const attention=document.getElementById('ranch91Attention');
        if(attention)attention.innerHTML=setupPanel('Backend temporarily unavailable','The page stopped waiting after six seconds. Tap Refresh to retry.');
        if(showToast)toast('Backend refresh timed out.','error');
        throw error;
      }finally{
        state.bootstrapPromise=null;
      }
    })();

    return state.bootstrapPromise;
  }

  // Health
  function healthRow(title,item){
    const status=item?.status||'setup';
    return `<article class="ranch91-health-row ${esc(status)}"><span class="ranch91-health-dot"></span><div><strong>${esc(title)}</strong><small>${esc(item?.detail||item?.label||'No detail available.')}</small></div><b>${status==='ready'?'Ready':status==='info'?'Info':status==='error'?'Error':'Setup'}</b></article>`;
  }
  async function loadHealth(){
    const box=$('#ranch91HealthSummary'),button=$('#ranch91RunChecks');
    box.innerHTML=setupPanel('Checking services','Running diagnostic checks…');
    button.disabled=true;button.textContent='Checking…';console.info('[HQ] Running health checks');
    try{
      const h=await jsonFetch('/api/admin/system-health',{cache:'no-store'});
      box.innerHTML=[
        healthRow('Website',h.website),healthRow('Database',h.database),healthRow('Media storage',h.media),
        healthRow('Email routing',h.email),healthRow('Admin protection',h.access),healthRow('Payments',h.payments)
      ].join('');
    }catch(error){
      box.innerHTML=setupPanel('Live check unavailable',error.message);
    }finally{console.info('[HQ] Health checks complete');button.disabled=false;button.textContent='Run checks';}
  }

  // Classes
  function renderClasses(){
    const box=$('#ranchClasses');if(!box)return;
    if(!state.bootstrap?.configured.database){
      box.innerHTML=setupPanel('Class database is not connected','Bind D1 as BOOKINGS_DB. The class manager will become available automatically.');
      return;
    }
    const rows=state.classes;
    box.innerHTML=rows.length?rows.map(c=>`<article class="ranch-class-row"><div><strong>${esc(c.title)}</strong><span>${fmt(c.starts_at)} · ${esc(c.venue)}</span></div><div><b>${Number(c.sold||0)} / ${Number(c.capacity||0)}</b><small>${esc(c.status)}</small></div></article>`).join(''):emptyPanel('No classes have been created yet.');
  }
  async function loadClasses(){
    if(!state.bootstrap){
      await loadBootstrap(false,{silent:true}).catch(()=>null);
    }
    const box=$('#ranchClasses');if(!box)return;
    box.innerHTML=emptyPanel('Loading classes…');
    if(!state.bootstrap?.configured.database){renderClasses();return;}
    try{
      state.classes=await jsonFetch('/api/admin/classes',{cache:'no-store'});
      renderClasses();
    }catch(error){
      box.innerHTML=error.status===401?lockedPanel('Class editing is locked','Enable Cloudflare Access to create or edit classes.'):setupPanel('Classes unavailable',error.message);
    }
  }

  // Bookings
  async function loadBookings(){
    if(!state.bootstrap){
      await loadBootstrap(false,{silent:true}).catch(()=>null);
    }
    const box=$('#ranchBookings'),waiting=$('#ranchWaitingList');
    if(!box)return;
    if(state.bootstrap?.mode!=='protected'){
      box.innerHTML=lockedPanel('Booking details are protected','Enable Cloudflare Access before viewing names, emails, payments or attendance.');
      if(waiting)waiting.innerHTML=lockedPanel('Waiting-list details are protected','Enable Cloudflare Access before viewing customer details.');
      return;
    }
    box.innerHTML='<div class="ranch91-loading">Loading bookings…</div>';
    try{
      state.bookings=await jsonFetch('/api/admin/bookings',{cache:'no-store'});
      box.innerHTML=state.bookings.bookings?.length
        ?state.bookings.bookings.map(b=>`<article class="ranch-booking-row"><div><strong>${esc(b.customer_name)}</strong><span>${esc(b.class_title)} · ${esc(b.reference)}</span></div><b>${esc(b.status)}</b></article>`).join('')
        :emptyPanel('No bookings yet.');
      if(waiting)waiting.innerHTML=state.bookings.waiting?.length
        ?state.bookings.waiting.map(w=>`<article class="hq-waiting-row"><strong>${esc(w.customer_name)}</strong><span>${esc(w.class_title)}</span><b>${esc(w.status)}</b></article>`).join('')
        :emptyPanel('No waiting-list entries.');
    }catch(error){box.innerHTML=lockedPanel('Bookings unavailable',error.message);if(waiting)waiting.innerHTML='';}
  }

  // Customers
  async function loadCustomers(){
    if(!state.bootstrap){
      await loadBootstrap(false,{silent:true}).catch(()=>null);
    }
    const box=$('#ranchCustomers');if(!box)return;
    if(state.bootstrap?.mode!=='protected'){
      box.innerHTML=lockedPanel('Customer register is locked','Enable Cloudflare Access before viewing names, emails, attendance and loyalty records.');
      return;
    }
    box.innerHTML='<div class="ranch91-loading">Loading customers…</div>';
    try{
      state.customers=await jsonFetch('/api/admin/customers',{cache:'no-store'});
      const q=($('#customerAdminSearch')?.value||'').trim().toLowerCase();
      const rows=(state.customers.customers||[]).filter(c=>!q||String(c.customer_name||'').toLowerCase().includes(q)||String(c.customer_email||'').toLowerCase().includes(q));
      box.innerHTML=rows.length?rows.map(c=>`<article class="hq-customer-card"><div><h3>${esc(c.customer_name)}</h3><p>${esc(c.customer_email)}</p></div><dl><div><dt>Bookings</dt><dd>${esc(c.total_bookings)}</dd></div><div><dt>Attended</dt><dd>${esc(c.attended_classes)}</dd></div><div><dt>Loyalty</dt><dd>${esc(c.loyalty_progress)} / 9</dd></div></dl></article>`).join(''):emptyPanel('No customers found.');
    }catch(error){box.innerHTML=lockedPanel('Customer register unavailable',error.message);}
  }

  // Operations safe summary
  function renderOperationsFromBootstrap(){
    const b=state.bootstrap;if(!b)return;
    const set=(id,val)=>{const n=$(`#${id}`);if(n)n.textContent=val;};
    set('opsTodayClasses',b.summary.upcoming_classes);
    set('opsTodayGuests',b.summary.places_booked);
    set('opsPaidRevenue',money(b.summary.paid_revenue));
    set('opsPendingPayments',b.summary.pending_payments);
    set('opsWaitingGuests',b.summary.waiting_guests);
    set('opsRefundReview',b.summary.refund_review);
    const q=$('#operationsQueue');
    if(q)q.innerHTML=b.mode==='protected'
      ?emptyPanel('Open Bookings to review individual actions.')
      :lockedPanel('Detailed action queue is locked','Enable Cloudflare Access before customer-specific actions are shown.');
    const a=$('#operationsActivity');
    if(a)a.innerHTML=b.activity.length?b.activity.map(row=>`<article class="operations-activity-row"><strong>${esc(String(row.action).replaceAll('_',' '))}</strong><span>${esc(row.target_type)} · ${fmt(row.created_at)}</span></article>`).join(''):emptyPanel('No recent activity.');
    const c=$('#operationsClasses');
    if(c)c.innerHTML=b.classes.length?b.classes.map(row=>`<article class="operations-class-row"><div><strong>${esc(row.title)}</strong><span>${fmt(row.starts_at)} · ${esc(row.venue)}</span></div><div><b>${Number(row.sold||0)} / ${Number(row.capacity||0)}</b></div></article>`).join(''):(b.configured.database?emptyPanel('No upcoming classes.'):setupPanel('Class register unavailable','Connect D1 using the BOOKINGS_DB binding.'));
  }
  async function loadOperations(){renderOperationsFromBootstrap();loadBootstrap(false,{silent:true}).catch(()=>{});}

  // Private events
  async function loadPrivateEvents(){
    if(!state.bootstrap){
      await loadBootstrap(false,{silent:true}).catch(()=>null);
    }
    const box=$('#ranchPrivateEvents');if(!box)return;
    if(state.bootstrap?.mode!=='protected'){
      box.innerHTML=lockedPanel('Private-event inquiries are locked','Enable Cloudflare Access before viewing customer names, contact details and event addresses.');
      return;
    }
    box.innerHTML='<div class="ranch91-loading">Loading private events…</div>';
    try{
      const data=await jsonFetch('/api/admin/private-events',{cache:'no-store'});
      state.privateEvents=data.items||[];
      box.innerHTML=state.privateEvents.length?state.privateEvents.map(i=>`<article class="private-admin-card"><header><div><span class="private-status">${esc(String(i.status).replaceAll('_',' '))}</span><h3>${esc(i.event_type)} · ${esc(i.reference)}</h3></div><strong>${esc(i.customer_name)}</strong></header><p>${esc(i.preferred_date)} · ${esc(i.venue_postcode)}</p></article>`).join(''):emptyPanel('No private-event inquiries yet.');
    }catch(error){box.innerHTML=lockedPanel('Private events unavailable',error.message);}
  }

  // Media
  async function loadMedia(){
    if(!state.bootstrap){
      await loadBootstrap(false,{silent:true}).catch(()=>null);
    }
    const box=$('#ranchMedia');if(!box)return;
    if(!state.bootstrap?.configured.media){
      box.innerHTML=setupPanel('Media storage is not connected','Bind an R2 bucket using the name MEDIA_BUCKET.');
      const count=$('#ranchMediaCount');if(count)count.textContent='0';
      return;
    }
    if(state.bootstrap?.mode!=='protected'){
      box.innerHTML=lockedPanel('Media management is locked','Enable Cloudflare Access before listing, uploading or deleting files.');
      return;
    }
    box.innerHTML='<div class="ranch91-loading">Loading media…</div>';
    try{
      const data=await jsonFetch('/api/admin/media',{cache:'no-store'});
      state.media=data.items||data.files||[];
      const count=$('#ranchMediaCount');if(count)count.textContent=state.media.length;
      box.innerHTML=state.media.length?state.media.map(m=>`<article class="ranch-media-item"><div><strong>${esc(m.title||m.original_name)}</strong><small>${esc(m.original_name||m.storage_key)}</small></div></article>`).join(''):emptyPanel('No media uploaded yet.');
    }catch(error){box.innerHTML=lockedPanel('Media unavailable',error.message);}
  }

  // Events
  $('#ranch91RunChecks')?.addEventListener('click',loadHealth);
  $('#ranch91RefreshOverview')?.addEventListener('click',()=>loadBootstrap(true,{force:true}));
  $('#ranch92RefreshSetup')?.addEventListener('click',()=>loadBootstrap(true,{force:true}));
  $('#refreshCustomers')?.addEventListener('click',loadCustomers);
  $('#customerAdminSearch')?.addEventListener('input',loadCustomers);
  $('#refreshOperations')?.addEventListener('click',()=>loadBootstrap(true,{force:true}));
  $('#printOperationsRegister')?.addEventListener('click',()=>window.print());
  $('#refreshPrivateEvents')?.addEventListener('click',loadPrivateEvents);
  $('#refreshMedia')?.addEventListener('click',loadMedia);

  showView('overview');
  const cachedBootstrap=readBootstrapCache();
  if(cachedBootstrap?.data){
    state.bootstrap=cachedBootstrap.data;
    state.bootstrapLoadedAt=cachedBootstrap.savedAt||Date.now();
    renderMode();renderSetup();renderOverview();renderOperationsFromBootstrap();
    updateLastUpdated('cache');
  }
  loadBootstrap(false,{silent:Boolean(state.bootstrap)}).catch(()=>{});
  loadHealth();
  setTimeout(()=>{
    const replacements=[
      ['#ranch92SetupStatus','Connection status is temporarily unavailable. Tap Refresh to retry.'],
      ['#ranch91Attention','Operational status is temporarily unavailable. Tap Refresh to retry.'],
      ['#ranchUpcoming','Class information is temporarily unavailable. Tap Refresh to retry.'],
      ['#ranchRecent','Recent activity is temporarily unavailable. Tap Refresh to retry.'],
      ['#operationsQueue','Action queue is temporarily unavailable.'],
      ['#operationsActivity','Recent activity is temporarily unavailable.'],
      ['#operationsClasses','Class register is temporarily unavailable.']
    ];
    replacements.forEach(([selector,message])=>{
      const node=document.querySelector(selector);
      if(node && /loading|checking/i.test(node.textContent||'')){
        node.innerHTML=`<div class="ranch92-state setup"><strong>Still waiting?</strong><p>${message}</p></div>`;
      }
    });
    const mode=document.getElementById('ranch92ModeTitle');
    if(mode && /checking/i.test(mode.textContent||'')){
      mode.textContent=state.bootstrap?'Using the last successful backend data':'Backend check timed out';
      const detail=document.getElementById('ranch92ModeDetail');
      if(detail)detail.textContent=state.bootstrap?'A live refresh will continue in the background.':'Tap Refresh to try again.';
    }
  },7000);

})();