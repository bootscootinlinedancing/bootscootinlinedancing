(()=>{
  const state={
    currentView:'overview',
    bootstrap:null,
    classes:[],
    bookings:null,
    customers:null,
    emailCentre:null,
    operations:null,
    media:[],
    privateEvents:[],
    bootstrapPromise:null,
    bootstrapLoadedAt:0,
    bootstrapError:null,
    diagnostics:[],
    frontendErrors:0,
    requestSequence:0
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


  const BOOTSTRAP_CACHE_KEY='boot-scootin-hq-bootstrap-v93-2-0';
  const ADMIN_API_PREFIX='/ranch/api/admin';
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
    state.requestSequence=Number.isFinite(state.requestSequence)?state.requestSequence+1:1;
    const requestId=state.requestSequence;
    const started=performance.now();
    const method=options.method||'GET';
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    diagnosticEvent('request_started',{endpoint:url,method,request_id:requestId,timeout_ms:timeoutMs});
    try{
      const response=await fetch(url,{
        ...options,
        signal:options.signal||controller.signal,
        headers:{
          Accept:'application/json',
          ...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),
          ...(options.headers||{}),
          'X-HQ-Diagnostic-Request':String(requestId)
        }
      });
      const text=await response.text();
      let data={};
      try{data=text?JSON.parse(text):{};}catch(_){data={error:text||'Unexpected server response.'};}
      const duration=Math.round(performance.now()-started);
      diagnosticEvent('request_completed',{endpoint:url,method,request_id:requestId,status:response.status,duration_ms:duration});
      if(!response.ok){
        const error=new Error(data.error||data.detail||`Request failed (${response.status}).`);
        error.code=data.code||'REQUEST_FAILED';
        error.status=response.status;
        throw error;
      }
      return data;
    }catch(error){
      const duration=Math.round(performance.now()-started);
      diagnosticEvent('request_failed',{endpoint:url,method,request_id:requestId,duration_ms:duration,result:error.name==='AbortError'?'Timed out':'Failed',error:safeError(error)});
      throw error;
    }finally{clearTimeout(timer);}
  }


  const DIAGNOSTIC_LIMIT=100;

  function safeError(error){
    return {
      name:error?.name||'Error',
      message:String(error?.message||error||'Unknown error').slice(0,500),
      code:error?.code||null,
      status:error?.status||null
    };
  }

  function diagnosticEvent(type,detail={}){
    try{
      if(!Array.isArray(state.diagnostics))state.diagnostics=[];
      if(!Number.isFinite(state.frontendErrors))state.frontendErrors=0;
      const event={time:new Date().toISOString(),type,...detail};
      state.diagnostics.unshift(event);
      state.diagnostics=state.diagnostics.slice(0,DIAGNOSTIC_LIMIT);
      try{sessionStorage.setItem('boot-scootin-hq-diagnostics',JSON.stringify(state.diagnostics));}catch(_){}
      try{renderDiagnostics();}catch(_){}
      try{console.info('[HQ DIAGNOSTIC]',event);}catch(_){}
    }catch(_){/* Diagnostics must never stop HQ. */}
  }

  function setConnectionIndicator(status,label){
    const node=document.getElementById('hqConnectionIndicator');
    if(!node)return;
    node.className=`hq-connection-indicator ${status}`;
    const text=node.querySelector('b');
    if(text)text.textContent=label;
  }

  function renderDiagnostics(){
    const box=document.getElementById('diagnosticLog');
    if(!box)return;
    const events=Array.isArray(state.diagnostics)?state.diagnostics:[];
    const bootstrap=events.find(item=>item.endpoint===`${ADMIN_API_PREFIX}/bootstrap`);
    const health=events.find(item=>item.endpoint===`${ADMIN_API_PREFIX}/system-health`);
    const latest=events[0];
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
    set('diagBootstrap',bootstrap?`${bootstrap.status||bootstrap.result||'Error'} · ${bootstrap.duration_ms||0}ms`:'Not tested');
    set('diagHealth',health?`${health.status||health.result||'Error'} · ${health.duration_ms||0}ms`:'Not tested');
    set('diagLastRequest',latest?.endpoint||latest?.type||'—');
    set('diagErrorCount',state.frontendErrors);
    if(!events.length){
      box.innerHTML='<div class="ranch-empty">No diagnostic events recorded yet.</div>';
      return;
    }
    box.innerHTML=events.map(item=>{
      const cls=item.status>=200&&item.status<300?'success':(item.status===401||item.status===403?'protected':(item.error?'error':'info'));
      return `<article class="diagnostic-row ${cls}">
        <div><strong>${esc(item.endpoint||item.type.replaceAll('_',' '))}</strong><span>${esc(new Date(item.time).toLocaleTimeString('en-GB'))} · ${esc(item.status?`HTTP ${item.status}`:(item.result||'Recorded'))}</span></div>
        <div class="diagnostic-meta">${item.duration_ms!=null?`<b>${esc(item.duration_ms)}ms</b>`:''}${item.request_id?`<small>#${esc(item.request_id)}</small>`:''}</div>
        ${item.error?`<p>${esc(item.error.message||item.error)}</p>`:''}
      </article>`;
    }).join('');
  }

  function buildDiagnosticReport(){
    return JSON.stringify({
      generated_at:new Date().toISOString(),
      location:location.href,
      user_agent:navigator.userAgent,
      online:navigator.onLine,
      visibility:document.visibilityState,
      version:'V95.0.0',
      bootstrap_loaded:Boolean(state.bootstrap),
      bootstrap_loaded_at:state.bootstrapLoadedAt?new Date(state.bootstrapLoadedAt).toISOString():null,
      frontend_errors:state.frontendErrors,
      events:state.diagnostics
    },null,2);
  }

  window.addEventListener('error',event=>{
    state.frontendErrors++;
    diagnosticEvent('javascript_error',{error:safeError(event.error||event.message),filename:event.filename||null,line:event.lineno||null,column:event.colno||null});
  });
  window.addEventListener('unhandledrejection',event=>{
    state.frontendErrors++;
    diagnosticEvent('unhandled_promise_rejection',{error:safeError(event.reason)});
  });
  window.addEventListener('online',()=>{
    diagnosticEvent('network_online',{result:'Browser reports online'});
    setConnectionIndicator('checking','Rechecking');
    loadBootstrap(false,{force:true,silent:true}).catch(()=>{});
  });
  window.addEventListener('offline',()=>{
    diagnosticEvent('network_offline',{result:'Browser reports offline'});
    setConnectionIndicator('error','Offline');
  });

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
  let drawerPageScrollY=0;
  function setDrawer(open){
    if(!drawer||!menuButton)return;
    drawer.classList.toggle('open',open);
    drawer.setAttribute('aria-hidden',String(!open));
    menuButton.setAttribute('aria-expanded',String(open));
    document.body.classList.toggle('ranch91-drawer-open',open);
    if(backdrop){backdrop.hidden=!open;backdrop.classList.toggle('open',open);}
    if(open){
      drawerPageScrollY=window.scrollY||document.documentElement.scrollTop||0;
      document.documentElement.classList.add('ranch91-menu-lock');
      document.body.classList.add('ranch91-menu-lock');
      drawer.scrollTop=0;
      requestAnimationFrame(()=>{ drawer.scrollTop=0; });
      if(closeButton)setTimeout(()=>closeButton.focus({preventScroll:true}),0);
    }else{
      document.documentElement.classList.remove('ranch91-menu-lock');
      document.body.classList.remove('ranch91-menu-lock');
      /* Recover from stale iOS body locks from older releases. */
      document.body.style.position='';document.body.style.top='';document.body.style.left='';document.body.style.right='';document.body.style.width='';
    }
  }
  menuButton?.addEventListener('click',event=>{
    if(typeof window.BootScootinHQMenuToggle==='function')return;
    event.preventDefault();
    setDrawer(!drawer.classList.contains('open'));
  });
  closeButton?.addEventListener('click',()=>setDrawer(false));
  backdrop?.addEventListener('click',()=>setDrawer(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setDrawer(false);});
  window.addEventListener('pageshow',()=>setDrawer(false));

  const titles={overview:'HQ Home',classes:'Classes',bookings:'Bookings',customers:'Customers','merch-orders':'Merch Orders',emails:'Emails & Mailing List',promotions:'Promotions & Rewards',operations:'Operations','private-events':'Private Events',media:'Media',health:'System Health',diagnostics:'Diagnostics',settings:'Settings'};
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
    if(name==='merch-orders')loadMerchOrders();
    if(name==='emails')loadEmailCentre();
    if(name==='promotions')loadPromotions();
    if(name==='operations')renderOperationsFromBootstrap();
    if(name==='private-events')loadPrivateEvents();
    if(name==='media')loadMedia();
  }
  $$('.ranch91-nav [data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
  $$('[data-hq-logout]').forEach(link=>link.addEventListener('click',()=>{
    try{sessionStorage.removeItem(BOOTSTRAP_CACHE_KEY);}catch{}
  }));
  document.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-settings]');
    if(open)showView('settings');
  });

  function moneyPence(value){return `£${(Number(value||0)/100).toFixed(2)}`;}
  async function loadMerchOrders(){
    const box=$('#ranchMerchOrders'); if(!box)return;
    box.innerHTML='<div class="ranch91-loading">Loading merchandise orders…</div>';
    try{
      const data=await jsonFetch('/api/admin/merch-orders'); const rows=data.items||[];
      if(!rows.length){box.innerHTML='<div class="ranch91-empty">No merchandise orders yet.</div>';return;}
      box.innerHTML=rows.map(o=>{const qty=Number(o.quantity||1),productionCost=(o.fit==='womens'?1700:1200)*qty,itemSales=Number(o.unit_price_pence||0)*qty,itemProfit=Math.max(0,itemSales-productionCost);return `<article class="ranch91-list-card merch-admin-card"><div><strong>${esc(o.reference)}</strong><span>${esc(o.customer_name)} · ${esc(o.customer_email)}</span><span>${esc(o.design)} · ${esc(o.fit==='womens'?"Women’s premium":"Unisex")} · ${esc(o.size)} × ${qty}</span><span>${o.fulfilment_method==='delivery'?`Delivery · ${esc(o.delivery_address||'Address missing')}`:'Collection'} · ${moneyPence(o.amount_pence)} · ${esc(o.status)}</span><span class="merch-profit-line">T-shirt sales ${moneyPence(itemSales)} · Production cost ${moneyPence(productionCost)} · Est. item profit ${moneyPence(itemProfit)}</span><small class="merch-profit-note">Estimated profit is before SumUp fees and excludes the delivery charge/postage cost.</small><span>Fulfilment: ${esc(o.fulfilment_status||'NEW')}</span></div><div class="ranch91-row-actions">${o.status==='PAID'&&o.fulfilment_method==='collection'&&o.fulfilment_status!=='READY_FOR_COLLECTION'?`<button class="button compact" data-merch-action="READY" data-id="${esc(o.id)}">Ready for collection</button>`:''}${o.status==='PAID'&&o.fulfilment_method==='delivery'&&o.fulfilment_status!=='DISPATCHED'?`<button class="button compact" data-merch-action="DISPATCHED" data-id="${esc(o.id)}">Mark dispatched</button>`:''}${['READY_FOR_COLLECTION','DISPATCHED'].includes(o.fulfilment_status)?`<button class="button secondary compact" data-merch-action="COMPLETE" data-id="${esc(o.id)}">Complete</button>`:''}</div></article>`}).join('');
      box.querySelectorAll('[data-merch-action]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await jsonFetch('/api/admin/merch-orders',{method:'PATCH',body:JSON.stringify({id:btn.dataset.id,action:btn.dataset.merchAction})});await loadMerchOrders();}catch(e){alert(e.message||'Could not update order.');btn.disabled=false;}}));
    }catch(e){box.innerHTML=`<div class="ranch91-error">${esc(e.message||'Could not load merchandise orders.')}</div>`;}
  }
  $('#refreshMerchOrders')?.addEventListener('click',loadMerchOrders);

  function displayNameFromEmail(email){
    if(!email)return 'Nora';
    const local=String(email).split('@')[0].replace(/[._-]+/g,' ').trim();
    if(!local)return 'Nora';
    return local.split(/\s+/).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ');
  }

  function setAccessPresentation(protectedMode,email){
    const name=displayNameFromEmail(email);
    const welcome=$('#ranch91Welcome');
    const drawerWelcome=$('#ranch91DrawerWelcome');
    if(welcome)welcome.textContent=`Welcome, ${name}`;
    if(drawerWelcome)drawerWelcome.textContent=`Welcome, ${name}`;

    const warning=$('#ranch91AccessWarning');
    if(warning){
      warning.hidden=protectedMode;
      if(!protectedMode){
        warning.querySelector('strong').textContent='⚠ HQ is currently publicly accessible.';
        warning.querySelector('span').textContent='Do not store sensitive customer information here until Cloudflare Access is enabled.';
      }
    }

    const note=$('#ranch91AccessNote');
    if(note){
      note.classList.toggle('protected',protectedMode);
      note.querySelector('strong').textContent=protectedMode?'Protected by Cloudflare Access':'Public until protected';
      note.querySelector('span').textContent=protectedMode
        ?`Secure session verified for ${email||name}.`
        :'Cloudflare Access is not configured yet.';
    }
  }

  function renderMode(){
    const b=state.bootstrap;
    if(!b)return;
    const modebar=$('#ranch92Modebar');
    const title=$('#ranch92ModeTitle');
    const detail=$('#ranch92ModeDetail');
    modebar.classList.toggle('protected',b.mode==='protected');
    modebar.classList.toggle('pilot',b.mode!=='protected');
    setAccessPresentation(b.mode==='protected',b.admin_email);
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
    const cleanupCard=document.getElementById('knownTestCleanupCard');
    if(cleanupCard)cleanupCard.hidden=Number(b.summary.pending_payments||0)===0;
    $('#overviewRevenue').textContent=money(b.summary.paid_revenue);
    const revenueBreakdown=$('#overviewRevenueBreakdown');if(revenueBreakdown)revenueBreakdown.textContent=`Classes ${money(b.summary.class_revenue||0)} · Merch ${money(b.summary.merch_revenue||0)} · Est. merch profit ${money(b.summary.merch_profit||0)}`;
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

    if(state.bootstrapPromise){diagnosticEvent('bootstrap_deduplicated',{result:'Reused active request'});return state.bootstrapPromise;}

    if(!state.bootstrap){
      const cached=readBootstrapCache();
      if(cached?.data){
        state.bootstrap=cached.data;
        state.bootstrapLoadedAt=cached.savedAt||Date.now();
        renderMode();renderSetup();renderOverview();renderOperationsFromBootstrap();
        updateLastUpdated('cache');
      }
    }

    if(!silent&&!state.bootstrap)setModeLoading(true);

    setConnectionIndicator('checking','Checking');
    state.bootstrapPromise=(async()=>{
      try{
        const data=await jsonFetch(`${ADMIN_API_PREFIX}/bootstrap`,{cache:'no-store'},6000);
        state.bootstrap=data;
        state.bootstrapLoadedAt=Date.now();
        state.bootstrapError=null;
        saveBootstrapCache(data);
        renderMode();renderSetup();renderOverview();renderOperationsFromBootstrap();
        updateLastUpdated('live');
        setConnectionIndicator('success','Connected');
        if(showToast)toast('Backend status refreshed.');
        return data;
      }catch(error){
        state.bootstrapError=error;
        setConnectionIndicator(state.bootstrap?'cached':'error',state.bootstrap?'Saved data':'Unavailable');
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
  function healthCard(title,item){
    const status=item?.status||'setup';
    const label=status==='ready'?'Ready':status==='info'?'Info':status==='error'?'Error':'Setup';
    return `<article class="hq-health-card ${esc(status)}"><span class="health-dot ${esc(status)}"></span><div><strong>${esc(title)}</strong><small>${esc(item?.detail||item?.label||'No detail available.')}</small></div><b>${label}</b></article>`;
  }
  function renderHealthPanels(h){
    const rows=[
      ['Website',h.website],['Database',h.database],['Media storage',h.media],
      ['Email routing',h.email],['Admin protection',h.access],['Payments',h.payments]
    ];
    const summary=$('#ranch91HealthSummary');
    const grid=$('#hqHealthGrid');
    if(summary)summary.innerHTML=rows.map(([title,item])=>healthRow(title,item)).join('');
    if(grid)grid.innerHTML=rows.map(([title,item])=>healthCard(title,item)).join('');
  }
  async function loadHealth(){
    const summary=$('#ranch91HealthSummary');
    const grid=$('#hqHealthGrid');
    const buttons=[$('#ranch91RunChecks'),$('#refreshHealth')].filter(Boolean);
    if(summary)summary.innerHTML=setupPanel('Checking services','Running diagnostic checks…');
    if(grid)grid.innerHTML='<article class="hq-health-card"><span class="health-dot checking"></span><div><strong>Checking services…</strong><small>Please wait.</small></div><b>Checking</b></article>';
    buttons.forEach(button=>{button.disabled=true;button.textContent='Checking…';});
    console.info('[HQ] Running health checks');
    try{
      const h=await jsonFetch(`${ADMIN_API_PREFIX}/system-health`,{cache:'no-store'},10000);state.health=h;
      const settingsPay=$('#settingsSumupStatus');
      if(settingsPay){
        const pay=h?.payments||{}; const ready=String(pay.status||'').toLowerCase()==='ready';
        settingsPay.classList.toggle('ready',ready);settingsPay.classList.toggle('attention',!ready);
        settingsPay.innerHTML=`<span></span> ${esc(pay.detail||pay.label||(ready?'SumUp payment checkout ready':'Check payment setup in System Health'))}`;
      }
      renderHealthPanels(h);
    }catch(error){
      if(summary)summary.innerHTML=setupPanel('Live check unavailable',error.message);
      if(grid)grid.innerHTML=`<article class="hq-health-card attention"><span class="health-dot attention"></span><div><strong>Live check unavailable</strong><small>${esc(error.message||'The check did not finish. Tap Run checks to retry.')}</small></div><b>Error</b></article>`;
    }finally{
      console.info('[HQ] Health checks complete');
      buttons.forEach(button=>{button.disabled=false;button.textContent='Run checks';});
    }
  }

  // Classes
  function classLocalValue(value){
    if(!value)return '';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '';
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function updateClassSummary(rows){
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
    set('classLiveCount',rows.filter(c=>c.status==='open').length);
    set('classDraftCount',rows.filter(c=>c.status==='draft').length);
    set('classBookedCount',rows.reduce((n,c)=>n+Number(c.sold||0),0));
    set('classWaitingCount',rows.reduce((n,c)=>n+Number(c.waiting||0),0));
  }
  function filteredClasses(){
    const filter=$('#ranchClassFilter')?.value||'upcoming';
    const now=Date.now();
    if(filter==='all')return state.classes;
    if(filter==='draft')return state.classes.filter(c=>c.status==='draft');
    if(filter==='closed')return state.classes.filter(c=>['closed','cancelled'].includes(c.status));
    return state.classes.filter(c=>new Date(c.starts_at).getTime()>=now && !['cancelled'].includes(c.status));
  }
  function renderClasses(){
    const box=$('#ranchClasses');if(!box)return;
    if(!state.bootstrap?.configured.database){
      box.innerHTML=setupPanel('Class database is not connected','Bind D1 as BOOKINGS_DB. The class manager will become available automatically.');
      updateClassSummary([]);
      return;
    }
    updateClassSummary(state.classes);
    const rows=filteredClasses();
    box.innerHTML=rows.length?rows.map(c=>`<article class="ranch-class-row" data-class-id="${esc(c.id)}">
      <div class="ranch-class-main"><strong>${esc(c.title)}</strong><span>${fmt(c.starts_at)} · ${esc(c.venue)} · ${money(c.price_pence)}</span></div>
      <div class="ranch-class-meta">${Math.max(0,Number(c.capacity||0)-Number(c.sold||0))===0
        ?`<b>FULL</b><small>Waiting list open</small>`
        :`<b>${Math.max(0,Number(c.capacity||0)-Number(c.sold||0))} place${Math.max(0,Number(c.capacity||0)-Number(c.sold||0))===1?'':'s'} remaining</b><small>${esc(c.status)}</small>`}</div>
      <div class="ranch-class-actions">
        <button type="button" class="button secondary compact" data-edit-class="${esc(c.id)}">Edit</button>
        <button type="button" class="button secondary compact" data-duplicate-class="${esc(c.id)}">Duplicate</button>
        ${c.status==='open'?`<button type="button" class="button secondary compact" data-class-status="closed" data-class-id="${esc(c.id)}">Close</button>`:`<button type="button" class="button secondary compact" data-class-status="open" data-class-id="${esc(c.id)}">Open</button>`}
        <button type="button" class="button danger compact" data-delete-class="${esc(c.id)}">Delete</button>
      </div>
    </article>`).join(''):emptyPanel('No classes match this filter.');
    box.querySelectorAll('[data-edit-class]').forEach(btn=>btn.addEventListener('click',()=>openClassEditor(state.classes.find(c=>c.id===btn.dataset.editClass))));
    box.querySelectorAll('[data-duplicate-class]').forEach(btn=>btn.addEventListener('click',()=>duplicateClass(btn.dataset.duplicateClass)));
    box.querySelectorAll('[data-class-status]').forEach(btn=>btn.addEventListener('click',()=>changeClassStatus(btn.dataset.classId,btn.dataset.classStatus)));
    box.querySelectorAll('[data-delete-class]').forEach(btn=>btn.addEventListener('click',()=>deleteClass(btn.dataset.deleteClass)));
  }
  async function loadClasses(){
    if(!state.bootstrap){
      await loadBootstrap(false,{silent:true}).catch(()=>null);
    }
    const box=$('#ranchClasses');if(!box)return;
    box.innerHTML=emptyPanel('Loading classes…');
    if(!state.bootstrap?.configured.database){renderClasses();return;}
    try{
      state.classes=await jsonFetch(`${ADMIN_API_PREFIX}/classes`,{cache:'no-store'});
      renderClasses();
    }catch(error){
      box.innerHTML=(error.status===401||error.status===403)?lockedPanel('Class editing is locked','Cloudflare Access must authorise this HQ session.'):setupPanel('Classes unavailable',error.message);
    }
  }
  const CLASS_VENUE_TEMPLATES={
    edgbaston:{
      title:'Beginner Line Dancing',venue:'Edgbaston Community Centre',location:'40 Woodview Drive, Birmingham, B15 2HU',start:'19:30',end:'20:30',price:'6.00',capacity:20,level:'Beginner friendly',
      notes:`Come and join Boot Scootin’ Line Dancing for a fun, friendly beginner class in the heart of Edgbaston. Whether you are completely new or have a little experience, the session is relaxed, welcoming and taught step-by-step — no pressure, no judgement and no partner needed.

What to expect:
• Beginner-friendly line dances
• Clear step-by-step guidance
• Great music, good energy and plenty of laughs
• A fun way to stay active without the gym

Venue: Edgbaston Community Centre, 40 Woodview Drive, Birmingham, B15 2HU. Free parking is available at the venue. Wear comfortable clothing and secure shoes or boots you can move in, and bring water.

Spaces are limited, so advance booking is recommended. Coming solo is absolutely fine. For more detailed first-class advice, open “New Here?” on the Boot Scootin’ website.

Follow @boot.scootin.linedancing on Instagram and Boot Scootin’ Line Dancing on Facebook for class updates, dance videos and upcoming events.`
    },
    lowplaces:{
      title:'Class & Social Dancing',venue:'Low Places Bar Birmingham',location:'60–64 Heath Mill Lane, Deritend, Birmingham, B9 4AR',start:'19:15',end:'21:00',price:'6.00',capacity:50,level:'Beginner friendly',
      notes:`Boot Scootin’ Line Dancing at Low Places — Birmingham’s country dive bar / honky-tonk. Join us for a fun, beginner-friendly evening of country music, line dancing, social dancing and good vibes. Everyone is welcome, whether it is your first ever class or you are already a regular on the dance floor.

The usual Low Places lineup:
• 7:15–7:30pm — Saddle Up warm-up
• 7:30–8:30pm — Beginner-friendly line dancing class, taught step-by-step
• 8:30–9:00pm — Your Requests & Social Dancing
• From 9:00pm — Stay for a drink, music and the Low Places atmosphere

Venue: Low Places Bar, 60–64 Heath Mill Lane, Deritend, Birmingham, B9 4AR. Paid parking is available nearby/opposite the venue. No partner is needed. Wear comfortable clothing and secure shoes or boots you can move in.

£6 per person plus any applicable booking fee. Advance booking is required to take part in the class. Not dancing? You are still welcome to come along, grab a drink and enjoy the atmosphere.

Send dance requests before the session and we will fit in as many favourites as we can. For more detailed first-class advice, open “New Here?” on the Boot Scootin’ website.

Follow @boot.scootin.linedancing on Instagram and Boot Scootin’ Line Dancing on Facebook for class updates, dance videos and upcoming events.`
    }
  };
  let activeClassTemplate='';
  function applyTemplateTimes(form,key){
    const t=CLASS_VENUE_TEMPLATES[key];if(!t||!form)return;
    const current=String(form.elements.starts_at.value||'');
    const date=current.slice(0,10);
    if(date){form.elements.starts_at.value=`${date}T${t.start}`;form.elements.ends_at.value=`${date}T${t.end}`;}
  }
  function applyClassTemplate(key){
    const form=$('#classEditorForm'),status=$('#classTemplateStatus');if(!form)return;
    if(key==='custom'){activeClassTemplate='';['title','venue','location','starts_at','ends_at','public_notes'].forEach(n=>{if(form.elements[n])form.elements[n].value='';});form.elements.price_gbp.value='6.00';form.elements.capacity.value=20;form.elements.level.value='Beginner friendly';if(status)status.textContent='Custom venue mode — enter the details manually.';return;}
    const t=CLASS_VENUE_TEMPLATES[key];if(!t)return;activeClassTemplate=key;
    form.elements.title.value=t.title;form.elements.venue.value=t.venue;form.elements.location.value=t.location;form.elements.price_gbp.value=t.price;form.elements.capacity.value=t.capacity;form.elements.level.value=t.level;form.elements.public_notes.value=t.notes;applyTemplateTimes(form,key);
    if(status)status.textContent=`${t.venue} loaded · usual time ${t.start}–${t.end} · capacity ${t.capacity}. Choose/change the date as needed.`;
  }

  function setClassPosterPreview(url=''){
    const form=$('#classEditorForm'),wrap=$('#classPosterPreviewWrap'),img=$('#classPosterPreview'),remove=$('#removeClassPoster'),status=$('#classPosterStatus');
    if(!form)return;
    form.elements.poster_url.value=url||'';
    if(url){if(img)img.src=url;if(wrap)wrap.hidden=false;if(remove)remove.hidden=false;if(status)status.textContent='Poster ready to use.';}
    else{if(img)img.removeAttribute('src');if(wrap)wrap.hidden=true;if(remove)remove.hidden=true;if(status)status.textContent='No poster selected.';}
  }
  async function uploadClassPosterIfNeeded(){
    const input=$('#classPosterFile'),form=$('#classEditorForm'),status=$('#classPosterStatus');
    const file=input?.files?.[0];
    if(!file)return form?.elements.poster_url?.value||'';
    if(status)status.textContent='Uploading poster…';
    const data=new FormData();data.append('file',file);data.append('title',`${form.elements.title.value||'Boot Scootin class'} poster`);data.append('description','Class/event poster uploaded from Boot Scootin HQ');data.append('placement','class-poster');data.append('published','1');
    const result=await jsonFetch(`${ADMIN_API_PREFIX}/media`,{method:'POST',body:data},30000);
    setClassPosterPreview(result.url||'');
    input.value='';
    if(status)status.textContent='Poster uploaded and linked to this class.';
    return result.url||'';
  }

  function openClassEditor(item=null){
    // Opening the editor is a local UI action and must never depend on the
    // asynchronous bootstrap request. Cloudflare Access and the Worker still
    // enforce authorisation when the form is submitted.
    const modal=$('#classEditorModal'),form=$('#classEditorForm');
    if(!modal||!form){
      toast('The class editor could not be opened. Please refresh HQ.','error');
      return;
    }
    form.reset();
    activeClassTemplate='';
    const templateStatus=$('#classTemplateStatus');if(templateStatus)templateStatus.textContent=item?'Editing an existing class — fields remain fully editable.':'Pick a template, then choose the date. The usual start and finish times will be applied automatically.';
    form.elements.id.value=item?.id||'';
    form.elements.title.value=item?.title||'';
    form.elements.venue.value=item?.venue||'';
    form.elements.location.value=item?.location||'';
    form.elements.starts_at.value=classLocalValue(item?.starts_at);
    form.elements.ends_at.value=classLocalValue(item?.ends_at);
    form.elements.price_gbp.value=((Number(item?.price_pence??600))/100).toFixed(2);
    form.elements.capacity.value=Number(item?.capacity||20);
    form.elements.status.value=item?.status||'draft';
    form.elements.level.value=item?.level||'Beginner friendly';
    form.elements.public_notes.value=item?.public_notes||'';
    if($('#classPosterFile'))$('#classPosterFile').value='';
    setClassPosterPreview(item?.poster_url||'');
    $('#classEditorTitle').textContent=item?'Edit class':'Create class';
    $('#classEditorMessage').textContent='';
    modal.hidden=false;document.body.classList.add('hq-modal-open');
    setTimeout(()=>form.elements.title.focus(),0);
  }
  function closeClassEditor(){
    const modal=$('#classEditorModal');if(modal)modal.hidden=true;
    document.body.classList.remove('hq-modal-open');
  }
  async function saveClass(event){
    event.preventDefault();
    const form=event.currentTarget,button=$('#saveClassButton'),message=$('#classEditorMessage');
    const id=form.elements.id.value;
    let posterUrl=form.elements.poster_url.value||'';
    try{posterUrl=await uploadClassPosterIfNeeded();}catch(error){message.textContent=`Poster upload failed: ${error.message}`;toast(message.textContent,'error');return;}
    const payload={
      id:id||undefined,title:form.elements.title.value.trim(),venue:form.elements.venue.value.trim(),location:form.elements.location.value.trim(),
      starts_at:form.elements.starts_at.value,ends_at:form.elements.ends_at.value||null,
      price_pence:Math.round(Number(form.elements.price_gbp.value||0)*100),capacity:Number(form.elements.capacity.value||0),
      status:form.elements.status.value,level:form.elements.level.value.trim(),public_notes:form.elements.public_notes.value.trim(),poster_url:posterUrl
    };
    button.disabled=true;button.textContent='Saving…';message.textContent='Saving class…';
    try{
      await jsonFetch(`${ADMIN_API_PREFIX}/classes`,{method:id?'PATCH':'POST',body:JSON.stringify(payload)},10000);
      closeClassEditor();
      await loadClasses();
      await loadBootstrap(false,{force:true,silent:true});
      toast(id?'Class updated.':'Class created.');
    }catch(error){message.textContent=error.message;toast(error.message,'error');}
    finally{button.disabled=false;button.textContent='Save class';}
  }
  async function duplicateClass(id){
    try{await jsonFetch(`${ADMIN_API_PREFIX}/classes`,{method:'POST',body:JSON.stringify({id,action:'DUPLICATE'})});await loadClasses();toast('Class duplicated as a draft one week later.');}
    catch(error){toast(error.message,'error');}
  }
  async function changeClassStatus(id,status){
    try{await jsonFetch(`${ADMIN_API_PREFIX}/classes`,{method:'PATCH',body:JSON.stringify({id,action:'STATUS',status})});await loadClasses();await loadBootstrap(false,{force:true,silent:true});toast(`Class ${status}.`);}
    catch(error){toast(error.message,'error');}
  }
  async function deleteClass(id){
    if(!confirm('Delete this class? Classes with bookings cannot be deleted and should be cancelled instead.'))return;
    try{await jsonFetch(`${ADMIN_API_PREFIX}/classes`,{method:'DELETE',body:JSON.stringify({id})});await loadClasses();await loadBootstrap(false,{force:true,silent:true});toast('Class deleted.');}
    catch(error){toast(error.message,'error');}
  }

  // Bookings

  function renderBookingAdmin(){
    const box=$('#ranchBookings');
    const waiting=$('#ranchWaitingList');
    if(!box)return;

    const data=state.bookings||{bookings:[],waiting:[],stats:{}};
    const setStat=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
    setStat('bookingGuestTotal',Number(data.stats?.guests||0));
    setStat('bookingRevenueTotal',money(data.stats?.paid||0));
    setStat('bookingRefundTotal',Number(data.stats?.refunds_due||0));
    setStat('bookingWaitTotal',Number(data.stats?.waiting||0));

    const refundConnection=data.refund_connection||{automatic:false,mode:'manual'};
    const refundNotice=$('#refundConnectionNotice');
    if(refundNotice){
      refundNotice.classList.toggle('is-ready',Boolean(refundConnection.connected));
      refundNotice.classList.toggle('needs-setup',!refundConnection.connected);
      if(refundConnection.connected){
        const grantedScopes=Array.isArray(refundConnection.granted_scopes)?refundConnection.granted_scopes:[];
        const scopeRows=['payments','transactions.history','user.profile_readonly'].map(scope=>
          `<li class="${grantedScopes.includes(scope)?'scope-ok':'scope-missing'}"><strong>${grantedScopes.includes(scope)?'✓':'!'}</strong> ${esc(scope)}</li>`
        ).join('');
        refundNotice.innerHTML=`
          <strong>${refundConnection.refund_ready?'SumUp refunds connected':'SumUp connected — refund permission missing'}</strong>
          <span>${refundConnection.refund_ready
            ?`Refunds are sent to the exact SumUp transaction attached to the selected booking.${refundConnection.merchant_code?` Merchant: ${esc(refundConnection.merchant_code)}.`:''}`
            :'Your SumUp login worked, but SumUp has not enabled the payments permission for this OAuth application yet.'}</span>
          <div class="sumup-scope-panel">
            <b>Granted permissions</b>
            <ul>${scopeRows}</ul>
          </div>
          ${refundConnection.refund_ready?'':`<p class="sumup-scope-help">SumUp support must activate the <code>payments</code> scope for your Client ID. Reconnecting before they confirm approval may show an “application is misconfigured” page.</p>`}
          <div class="refund-connection-actions">
            ${refundConnection.refund_ready
              ?`<a class="button secondary compact" href="${ADMIN_API_PREFIX}/sumup-oauth/connect?fresh=1">Reconnect SumUp</a>`
              :`<button type="button" class="button secondary compact sumup-waiting-button" disabled>Waiting for SumUp approval</button>
                 <details class="sumup-approval-reconnect"><summary>SumUp has confirmed the payments scope is active</summary><p>Only continue after SumUp support confirms activation for your Client ID.</p><a class="button secondary compact" href="${ADMIN_API_PREFIX}/sumup-oauth/connect?fresh=1">Reconnect now</a></details>`}
            <button type="button" class="danger-outline compact" id="disconnectSumUpRefunds">Disconnect</button>
          </div>`;
      }else if(refundConnection.configured){
        refundNotice.innerHTML=`
          <strong>Connect SumUp refunds</strong>
          <span>Sign in to SumUp once to authorise secure one-click refunds from HQ.</span>
          <a class="button sumup-connect-button" href="${ADMIN_API_PREFIX}/sumup-oauth/connect?fresh=1">Connect SumUp refunds</a>`;
      }else{
        refundNotice.innerHTML=`
          <strong>SumUp OAuth setup required</strong>
          <span>Add the OAuth Client ID and Client Secret to Cloudflare, deploy the latest version, then return here to connect your SumUp account.</span>
          <small>Registered callback URL: <code>${esc(refundConnection.redirect_uri||'https://bootscootinlinedancing.co.uk/api/sumup/callback')}</code></small>`;
      }
    }

    document.getElementById('disconnectSumUpRefunds')?.addEventListener('click',async()=>{
      if(!confirm('Disconnect SumUp refunds from HQ? Existing bookings and payments will not be changed.'))return;
      try{
        await jsonFetch(`${ADMIN_API_PREFIX}/sumup-oauth`,{method:'DELETE'},10000);
        await loadBookings();
        toast('SumUp refunds disconnected.');
      }catch(error){toast(error.message,'error');}
    });

    const filter=$('#bookingAdminFilter')?.value||'all';
    let rows=data.bookings||[];

    if(filter==='active')rows=rows.filter(b=>['PENDING','PAID'].includes(b.status));
    else if(filter==='refund-review')rows=rows.filter(b=>['REFUND_DUE','REFUND_PROCESSING','REFUND_FAILED','CREDIT_DUE','REVIEW_IF_RESOLD','ADMIN_REVIEW'].includes(b.refund_status));
    else if(['REFUND_DUE','REFUND_PROCESSING','REFUND_FAILED'].includes(filter))rows=rows.filter(b=>b.refund_status===filter);
    else if(filter!=='all')rows=rows.filter(b=>b.status===filter);

    box.innerHTML=rows.length?rows.map(b=>`
      <article class="booking-admin-card ${b.is_test_candidate?'test-booking':''}">
        <header>
          <div>
            <span class="booking-status">${esc(b.status)}</span>
            ${b.is_test_candidate?'<span class="booking-test-badge">TEST CANDIDATE</span>':''}
            <span class="booking-customer-label">Customer</span>
            <h3 class="booking-customer-name">${esc(b.customer_name||'Name not supplied')}</h3>
            <p class="booking-customer-contact"><strong>Email:</strong> ${esc(b.customer_email||'Not supplied')}</p>
            <p class="booking-customer-contact"><strong>Phone:</strong> ${esc(b.customer_phone||'Not supplied')}</p>
          </div>
          <strong>${money(b.amount_pence)}</strong>
        </header>
        <dl>
          <div><dt>Class</dt><dd>${esc(b.class_title)}</dd></div>
          <div><dt>Date</dt><dd>${fmt(b.starts_at)}</dd></div>
          <div><dt>Places</dt><dd>${esc(b.quantity)}</dd></div>
          <div><dt>Reference</dt><dd>${esc(b.reference)}</dd></div>
          <div><dt>Payment status</dt><dd>${esc(b.status)}</dd></div>
          <div><dt>Amount paid</dt><dd>${money(b.amount_pence)}</dd></div>
          <div><dt>Payment provider</dt><dd>${esc(b.payment_provider)}</dd></div>
          <div><dt>Booked</dt><dd>${fmt(b.created_at)}</dd></div>
        </dl>
        ${b.payment_provider==='SUMUP'?`<details class="payment-details"><summary>View payment details</summary><dl>
          <div><dt>Customer</dt><dd>${esc(b.customer_name)} · ${esc(b.customer_email)}${b.customer_phone?` · ${esc(b.customer_phone)}`:''}</dd></div>
          <div><dt>Booking reference</dt><dd>${esc(b.reference)}</dd></div>
          <div><dt>Checkout ID</dt><dd><code>${esc(b.provider_checkout_id||'Not stored')}</code>${b.provider_checkout_id?` <button type="button" class="copy-mini" data-copy-value="${esc(b.provider_checkout_id)}">Copy</button>`:''}</dd></div>
          <div><dt>Transaction code</dt><dd><code>${esc(b.provider_transaction_code||'Refresh to retrieve')}</code>${b.provider_transaction_code?` <button type="button" class="copy-mini" data-copy-value="${esc(b.provider_transaction_code)}">Copy</button>`:''}</dd></div>
          <div><dt>Transaction UUID</dt><dd><code>${esc(b.provider_transaction_id||'Refresh to retrieve')}</code>${b.provider_transaction_id?` <button type="button" class="copy-mini" data-copy-value="${esc(b.provider_transaction_id)}">Copy</button>`:''}</dd></div>
          <div><dt>Paid at</dt><dd>${b.paid_at?fmt(b.paid_at):'Not confirmed'}</dd></div>
        </dl><button type="button" class="danger-outline" data-refresh-payment="${esc(b.id)}">Refresh SumUp details</button></details>`:''}
        <div class="booking-admin-actions">
          ${['PENDING','PAID'].includes(b.status)?`<button type="button" class="danger-outline" data-cancel-booking="${esc(b.id)}">Cancel booking</button>`:''}
          ${b.payment_provider==='SUMUP' && ['PAID','CANCELLED'].includes(b.status) && !['REFUNDED','REFUND_PROCESSING'].includes(b.refund_status)
            ?(refundConnection.refund_ready
              ?`<button type="button" class="button" data-refund-booking="${esc(b.id)}" data-refund-pence="${Number(b.amount_pence||0)}">Refund payment</button>`
              :`<button type="button" class="button refund-not-connected" data-refund-not-connected="1" disabled title="Connect your SumUp account to enable automatic refunds">Connect SumUp refunds</button>`)
            :''}
          ${b.payment_provider==='SUMUP' && b.status==='CANCELLED' && b.refund_status==='REFUND_DUE'?`<button type="button" class="danger-outline" data-record-manual-refund="${esc(b.id)}" data-refund-pence="${Number(b.amount_pence||0)}">Record refund already completed in SumUp</button>`:''}
          ${b.refund_status?`<span class="booking-refund-state">${esc(String(b.refund_status).replaceAll('_',' '))}</span>`:''}${b.refund_status==='REFUND_FAILED'&&b.admin_notes?`<div class="booking-refund-error"><strong>Refund could not be completed.</strong><p>${esc(String(b.admin_notes).includes('Insufficient scopes')?'SumUp has not yet activated the payments permission for this connection. Once SumUp confirms it is enabled, reconnect and retry the refund.':'The refund was not accepted. Open diagnostics below for the technical response.')}</p><details><summary>View diagnostics</summary><code>${esc(b.admin_notes)}</code></details></div>`:''}
          ${b.is_test_candidate?`<button type="button" class="danger-outline" data-delete-test-booking="${esc(b.id)}">Delete test booking</button>`:''}
        </div>
      </article>
    `).join(''):emptyPanel('No bookings match this filter.');

    const candidates=(data.bookings||[]).filter(b=>b.is_test_candidate);
    const panel=$('#bookingCleanupPanel');
    if(panel)panel.hidden=false;
    const count=$('#testBookingCount');
    if(count)count.textContent=`${candidates.length} test booking${candidates.length===1?'':'s'} found`;
    const allButton=$('#deleteAllTestBookings');
    if(allButton)allButton.disabled=!candidates.length;

    box.querySelectorAll('[data-delete-test-booking]').forEach(button=>{
      button.addEventListener('click',()=>deleteSingleTestBooking(button.dataset.deleteTestBooking));
    });
    box.querySelectorAll('[data-cancel-booking]').forEach(button=>{
      button.addEventListener('click',()=>cancelBooking(button.dataset.cancelBooking));
    });
    box.querySelectorAll('[data-refund-booking]').forEach(button=>{
      button.addEventListener('click',()=>refundBooking(button.dataset.refundBooking,Number(button.dataset.refundPence||0)));
    });
    box.querySelectorAll('[data-record-manual-refund]').forEach(button=>{
      button.addEventListener('click',()=>recordManualRefund(button.dataset.recordManualRefund,Number(button.dataset.refundPence||0)));
    });
    box.querySelectorAll('[data-refresh-payment]').forEach(button=>{
      button.addEventListener('click',()=>refreshPaymentDetails(button.dataset.refreshPayment));
    });
    box.querySelectorAll('[data-copy-value]').forEach(button=>{
      button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copyValue||'');toast('Copied.');}catch(_){toast('Could not copy.','error');}});
    });

    if(waiting){
      waiting.innerHTML=(data.waiting||[]).length
        ?data.waiting.map(w=>`<article class="hq-waiting-row"><strong>${esc(w.customer_name)}</strong><span>${esc(w.class_title)} · ${fmt(w.starts_at)}</span><b>${esc(w.status)}</b></article>`).join('')
        :emptyPanel('No waiting-list entries.');
    }
  }

  async function bookingAdminAction(payload){
    return jsonFetch(`${ADMIN_API_PREFIX}/bookings`,{
      method:'PATCH',
      body:JSON.stringify(payload)
    },20000);
  }

  async function cancelBooking(id){
    const booking=(state.bookings?.bookings||[]).find(item=>item.id===id);
    if(!booking)return toast('Booking not found.','error');
    const paid=booking.status==='PAID';
    const message=paid
      ?`Cancel ${booking.customer_name}'s booking for ${booking.class_title}? The place will be released. The payment will remain marked for refund until you press Refund.`
      :`Cancel ${booking.customer_name}'s booking for ${booking.class_title}? The place will be released.`;
    if(!confirm(message))return;
    try{
      await bookingAdminAction({id,action:'CANCEL'});
      localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
      await Promise.all([loadBookings(true),loadClasses(),loadBootstrap(false,{force:true,silent:true})]);
      toast(paid?'Booking cancelled. Refund is now due.':'Booking cancelled and place released.');
    }catch(error){toast(error.message,'error');}
  }

  async function refundBooking(id,amountPence){
    const booking=(state.bookings?.bookings||[]).find(item=>item.id===id);
    if(!booking)return toast('Booking not found.','error');
    const amount=money(amountPence);
    const confirmation=prompt(`Refund ${amount} to ${booking.customer_name} through SumUp? This cannot be undone. The booking will be cancelled and the place released.

Type REFUND to continue.`);
    if(confirmation!=='REFUND')return;
    try{
      const result=await bookingAdminAction({id,action:'REFUND_SUMUP',refund_amount_pence:amountPence,admin_notes:'Full refund issued from Boot Scootin HQ'});
      localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
      await Promise.all([loadBookings(true),loadClasses(),loadBootstrap(false,{force:true,silent:true})]);
      if(result && result.queued){
        toast(`${amount} refund submitted to SumUp. HQ will update automatically when SumUp replies.`);
        setTimeout(()=>loadBookings(true).catch(()=>{}),3500);
      }else{
        toast(`${amount} refund sent to SumUp and customer notified.`);
      }
    }catch(error){toast(error.message,'error');}
  }

  async function refreshPaymentDetails(id){
    try{
      await bookingAdminAction({id,action:'REFRESH_PAYMENT_DETAILS'});
      await loadBookings(true);
      toast('SumUp payment details refreshed.');
    }catch(error){toast(error.message,'error');}
  }

  async function recordManualRefund(id,amountPence){
    const booking=(state.bookings?.bookings||[]).find(item=>item.id===id);
    if(!booking)return toast('Booking not found.','error');
    const amount=money(amountPence);
    const confirmation=prompt(`This button does not move money. Only use it after SumUp confirms that the ${amount} refund has been sent back to the customer. HQ will then record it, adjust revenue and notify the customer.

Type REFUNDED to continue.`);
    if(confirmation!=='REFUNDED')return;
    try{
      await bookingAdminAction({id,action:'MARK_REFUNDED',refund_amount_pence:amountPence,admin_notes:'Refund completed manually in SumUp and recorded in Boot Scootin HQ'});
      localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
      await Promise.all([loadBookings(true),loadClasses(),loadBootstrap(false,{force:true,silent:true})]);
      toast(`${amount} manual refund recorded and customer notification queued.`);
    }catch(error){toast(error.message,'error');}
  }

  async function deleteSingleTestBooking(id){
    if(!confirm('Delete this test booking? Its class spaces will be restored.'))return;
    try{
      await bookingAdminAction({id,action:'DELETE_TEST_BOOKING'});
      localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
      await loadBookings(true);
      await loadBootstrap(false,{force:true,silent:true});
      toast('Test booking deleted and class capacity restored.');
    }catch(error){
      toast(error.message,'error');
    }
  }

  async function deleteAllTestBookings(){
    const candidates=(state.bookings?.bookings||[]).filter(b=>b.is_test_candidate);
    if(!candidates.length){
      toast('No eligible test bookings found.','error');
      return;
    }

    const confirmation=prompt(`This will delete ${candidates.length} unpaid manual test booking${candidates.length===1?'':'s'} and restore their class spaces.\n\nType DELETE TEST BOOKINGS to continue.`);
    if(confirmation!=='DELETE TEST BOOKINGS')return;

    try{
      const result=await bookingAdminAction({
        action:'DELETE_ALL_TEST_BOOKINGS',
        confirmation
      });
      localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
      await loadBookings(true);
      await loadBootstrap(false,{force:true,silent:true});
      toast(`${result.deleted||0} test booking${Number(result.deleted)===1?'':'s'} deleted.`);
    }catch(error){
      toast(error.message,'error');
    }
  }

  async function loadBookings(force=false){
    if(!state.bootstrap){
      await loadBootstrap(false,{silent:true}).catch(()=>null);
    }

    const box=$('#ranchBookings');
    const waiting=$('#ranchWaitingList');
    if(!box)return;

    if(state.bootstrap?.mode!=='protected'){
      box.innerHTML=lockedPanel('Booking details are protected','Enable Cloudflare Access before viewing names, emails, payments or deleting test bookings.');
      if(waiting)waiting.innerHTML=lockedPanel('Waiting-list details are protected','Enable Cloudflare Access before viewing customer details.');
      const panel=$('#bookingCleanupPanel');
      if(panel)panel.hidden=true;
      return;
    }

    if(!state.bookings || force){
      box.innerHTML='<div class="ranch91-loading">Loading bookings…</div>';
    }

    try{
      state.bookings=await jsonFetch(`${ADMIN_API_PREFIX}/bookings`,{cache:'no-store'},8000);
      renderBookingAdmin();
    }catch(error){
      if(state.bookings){
        renderBookingAdmin();
        toast('Booking refresh was slow. Keeping the previous list.','error');
      }else{
        box.innerHTML=lockedPanel('Bookings unavailable',error.message);
        if(waiting)waiting.innerHTML='';
      }
    }
  }

  // Customer CRM
  const CRM_TAGS=['Beginner','Improver','Advanced','Regular','VIP','Volunteer','Instructor','Loyalty Member','Inactive','Birthday Month'];
  function customerHealthBadge(status){const label=status==='ACTIVE'?'Active':status==='AT_RISK'?'At risk':'Inactive';return `<span class="crm-health crm-health-${String(status||'').toLowerCase()}">${label}</span>`;}

  async function loadPromotions(){
    const box=$('#promotionList');if(!box)return;box.innerHTML='<div class="ranch-loading">Loading promotions…</div>';
    try{
      const data=await jsonFetch(`${ADMIN_API_PREFIX}/promotions`,{cache:'no-store'});
      const rows=data.promotions||[];
      box.innerHTML=rows.length?rows.map(p=>`<article class="ranch-card"><div class="ranch-row"><div><h3>${esc(p.name)}</h3><p><strong>${esc(p.code_prefix||'Personal codes')}</strong> · ${p.discount_type==='FREE'?'Free class':p.discount_type==='PERCENT'?`${p.discount_value}% off`:`£${(Number(p.discount_value||0)/100).toFixed(2)} off`}</p><p>${Number(p.issued||0)} issued · ${Number(p.redeemed||0)} redeemed · £${(Number(p.discounted_pence||0)/100).toFixed(2)} discounted</p></div><button class="ranch-button secondary" data-toggle-promotion="${esc(p.id)}">${Number(p.active)?'Pause':'Activate'}</button></div></article>`).join(''):emptyPanel('No promotions created yet. Birthday and loyalty rewards will appear as they are issued.');
    }catch(error){box.innerHTML=lockedPanel('Promotions unavailable',error.message);}
  }
  async function createPromotion(){
    const type=$('#promoAdminType').value;
    const payload={action:'CREATE',name:$('#promoAdminName').value.trim(),code:$('#promoAdminCode').value.trim(),discount_type:type,discount_value:type==='FIXED'?Math.round(Number($('#promoAdminValue').value||0)*100):Number($('#promoAdminValue').value||0),starts_at:$('#promoAdminStart').value||'',ends_at:$('#promoAdminEnd').value||'',max_uses:$('#promoAdminMaxUses').value||null,uses_per_customer:$('#promoAdminPerCustomer').value||1};
    try{await jsonFetch(`${ADMIN_API_PREFIX}/promotions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});toast('Promotion created.','success');$('#promoAdminName').value='';$('#promoAdminCode').value='';await loadPromotions();}catch(error){toast(error.message,'error');}
  }
  async function loadCustomers(){
    if(!state.bootstrap)await loadBootstrap(false,{silent:true}).catch(()=>null);
    const box=$('#ranchCustomers');if(!box)return;
    if(state.bootstrap?.mode!=='protected'){box.innerHTML=lockedPanel('Customer CRM is locked','Enable Cloudflare Access before viewing customer profiles.');return;}
    box.innerHTML='<div class="ranch91-loading">Loading customers…</div>';
    try{
      state.customers=await jsonFetch(`${ADMIN_API_PREFIX}/customers`,{cache:'no-store'});
      const q=($('#customerAdminSearch')?.value||'').trim().toLowerCase();
      const rows=(state.customers.customers||[]).filter(c=>!q||`${c.customer_name||''} ${c.customer_email||''} ${c.customer_phone||''}`.toLowerCase().includes(q));
      box.innerHTML=rows.length?rows.map(c=>`<article class="hq-customer-card crm-customer-card" data-customer-email="${esc(c.customer_email)}" tabindex="0"><div><div class="crm-card-heading"><h3>${esc(c.customer_name||'Name not supplied')}</h3>${customerHealthBadge(c.health_status)}</div><p>${esc(c.customer_email)}</p><p>${esc(c.customer_phone||'Phone not supplied')}</p><button type="button" class="button compact crm-open-profile" data-customer-email="${esc(c.customer_email)}">Open profile</button></div><dl><div><dt>Lifetime spend</dt><dd>${money(c.lifetime_spend_pence)}</dd></div><div><dt>Attended</dt><dd>${esc(c.attended_classes)}</dd></div><div><dt>Upcoming</dt><dd>${esc(c.upcoming_bookings)}</dd></div><div><dt>Loyalty</dt><dd>${esc(c.loyalty_progress)} / 9</dd></div></dl></article>`).join(''):emptyPanel('No customers found.');
    }catch(error){box.innerHTML=lockedPanel('Customer CRM unavailable',error.message);}
  }
  function renderCrmProfile(data){
    const c=data.customer||{},p=data.profile||{},tags=data.tags||[],notes=data.notes||[],bookings=data.bookings||[],timeline=data.timeline||[];
    const attended=Number(c.attended_classes||0), total=Number(c.total_bookings||0), attendanceRate=total?Math.round(attended/total*100):0;
    const upcoming=bookings.filter(b=>['PAID','PENDING'].includes(b.status)&&b.starts_at&&new Date(b.starts_at)>new Date());
    return `<div class="crm-profile" data-customer-key="${esc(c.customer_email)}">
      <header class="crm-profile-header"><div><p class="kicker red">Customer profile</p><h2>${esc(c.customer_name||'Customer')}</h2><p>${esc(c.customer_email)}${c.customer_phone?` · ${esc(c.customer_phone)}`:''}</p></div>${customerHealthBadge(c.health_status)}</header>
      <div class="crm-metrics"><article><span>Lifetime spend</span><strong>${money(c.lifetime_spend_pence)}</strong></article><article><span>Classes attended</span><strong>${attended}</strong></article><article><span>Attendance rate</span><strong>${attendanceRate}%</strong></article><article><span>Upcoming</span><strong>${upcoming.length}</strong></article><article><span>Loyalty</span><strong>${esc(c.loyalty_progress)} / 9</strong></article><article><span>Customer since</span><strong>${esc(fmt(c.customer_since))}</strong></article></div>
      <nav class="crm-tabs" aria-label="Customer profile sections"><button class="active" data-crm-tab="overview">Overview</button><button data-crm-tab="activity">Activity</button><button data-crm-tab="bookings">Bookings</button><button data-crm-tab="notes">Notes</button><button data-crm-tab="private">Private details</button></nav>
      <section class="crm-tab-panel active" data-crm-panel="overview">
        <div class="crm-two-col"><article class="crm-box"><h3>Contact & consent</h3><p><strong>Email:</strong> ${esc(c.customer_email)}</p><p><strong>Phone:</strong> ${esc(c.customer_phone||'Not supplied')}</p><p><strong>Marketing:</strong> ${Number(c.marketing_consent)?'Opted in':'Not opted in'}</p><p><strong>Birthday:</strong> ${esc(p.birthday||'Not supplied')}</p></article>
        <article class="crm-box"><h3>Customer tags</h3><div class="crm-tag-list">${CRM_TAGS.map(t=>`<label><input type="checkbox" value="${esc(t)}" data-crm-tag ${tags.includes(t)?'checked':''}> ${esc(t)}</label>`).join('')}</div></article></div>
        <article class="crm-box"><h3>Instructor summary</h3><textarea id="crmInstructorSummary" rows="4" placeholder="Helpful non-sensitive notes for instructors…">${esc(p.instructor_notes_summary||'')}</textarea></article>
        <div class="crm-actions"><button class="button" type="button" id="saveCrmOverview">Save profile</button><button class="button secondary" type="button" data-crm-email>Compose email</button></div>
      </section>
      <section class="crm-tab-panel" data-crm-panel="activity"><div class="crm-timeline">${timeline.length?timeline.map(t=>`<article><span>${esc(t.type)}</span><div><strong>${esc(t.title)}</strong><p>${esc(t.detail||'')}</p><small>${esc(fmt(t.created_at))}</small></div></article>`).join(''):emptyPanel('No activity yet.')}</div></section>
      <section class="crm-tab-panel" data-crm-panel="bookings"><div class="crm-booking-list">${bookings.length?bookings.map(b=>`<article><div><strong>${esc(b.class_title||'Class')}</strong><p>${esc(fmt(b.starts_at))} · ${esc(b.venue||'')}</p></div><div><b>${esc(b.status)}</b><span>${money(b.amount_pence)}</span>${b.attended?'<em>Attended</em>':''}</div></article>`).join(''):emptyPanel('No bookings found.')}</div></section>
      <section class="crm-tab-panel" data-crm-panel="notes"><div class="crm-note-compose"><textarea id="crmNewNote" rows="3" placeholder="Add a private instructor note…"></textarea><button class="button" id="addCrmNote" type="button">Add note</button></div><div class="crm-notes">${notes.length?notes.map(n=>`<article><p>${esc(n.note_text)}</p><small>${esc(n.created_by||'HQ')} · ${esc(fmt(n.created_at))}</small><button type="button" class="crm-delete-note" data-note-id="${esc(n.id)}">Delete</button></article>`).join(''):emptyPanel('No private notes yet.')}</div></section>
      <section class="crm-tab-panel" data-crm-panel="private"><div class="crm-two-col"><article class="crm-box"><h3>Emergency contact</h3><label>Name<input id="crmEmergencyName" value="${esc(p.emergency_contact_name||'')}"></label><label>Phone<input id="crmEmergencyPhone" value="${esc(p.emergency_contact_phone||'')}"></label><label>Relationship<input id="crmEmergencyRelationship" value="${esc(p.emergency_contact_relationship||'')}"></label></article><article class="crm-box"><h3>Optional private information</h3><label>Birthday<input id="crmBirthday" type="date" value="${esc(p.birthday||'')}"></label><label>Loyalty adjustment<input id="crmLoyaltyAdjustment" type="number" min="-100" max="100" value="${esc(p.loyalty_adjustment||0)}"></label><label>Medical or accessibility notes<textarea id="crmMedicalNotes" rows="5" placeholder="Only record information the customer has chosen to share and that instructors genuinely need.">${esc(p.medical_notes||'')}</textarea></label></article></div><div class="crm-privacy-note">Private details are available only inside Cloudflare-protected HQ. Record only what is necessary and keep it accurate.</div><button class="button" type="button" id="saveCrmPrivate">Save private details</button></section>
    </div>`;
  }
  async function openCustomerCrm(email){const dialog=$('#customerCrmDialog'),box=$('#customerCrmProfile');if(!dialog||!box)return;box.innerHTML='<div class="ranch91-loading">Loading customer profile…</div>';document.documentElement.classList.add('crm-dialog-open');document.body.classList.add('crm-dialog-open');dialog.showModal();try{const data=await jsonFetch(`${ADMIN_API_PREFIX}/customers?email=${encodeURIComponent(email)}`,{cache:'no-store'});state.customerProfile=data;box.innerHTML=renderCrmProfile(data);}catch(error){box.innerHTML=lockedPanel('Customer profile unavailable',error.message);}}
  async function saveCrmProfile(privateOnly=false){const key=$('.crm-profile')?.dataset.customerKey;if(!key)return;const p=state.customerProfile?.profile||{};const payload={action:'SAVE_PROFILE',customer_key:key,birthday:$('#crmBirthday')?.value||p.birthday||'',emergency_contact_name:$('#crmEmergencyName')?.value||p.emergency_contact_name||'',emergency_contact_phone:$('#crmEmergencyPhone')?.value||p.emergency_contact_phone||'',emergency_contact_relationship:$('#crmEmergencyRelationship')?.value||p.emergency_contact_relationship||'',medical_notes:$('#crmMedicalNotes')?.value||p.medical_notes||'',instructor_notes_summary:$('#crmInstructorSummary')?.value||p.instructor_notes_summary||'',loyalty_adjustment:Number($('#crmLoyaltyAdjustment')?.value??p.loyalty_adjustment??0),tags:$$('[data-crm-tag]:checked').map(n=>n.value)};try{await jsonFetch(`${ADMIN_API_PREFIX}/customers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});toast('Customer profile saved.','success');await openCustomerCrm(key);loadCustomers();}catch(error){toast(error.message,'error');}}
  async function addCrmNote(){const key=$('.crm-profile')?.dataset.customerKey,note=$('#crmNewNote')?.value.trim();if(!note)return toast('Write a note first.','error');try{await jsonFetch(`${ADMIN_API_PREFIX}/customers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'ADD_NOTE',customer_key:key,note_text:note})});toast('Note added.','success');await openCustomerCrm(key);}catch(error){toast(error.message,'error');}}
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
      const data=await jsonFetch(`${ADMIN_API_PREFIX}/private-events`,{cache:'no-store'});
      state.privateEvents=data.items||[];
      box.innerHTML=state.privateEvents.length?state.privateEvents.map(i=>`<button type="button" class="private-admin-card private-admin-open" data-private-event-id="${esc(i.id)}" aria-label="Open ${esc(i.reference)}"><header><div><span class="private-status">${esc(String(i.status).replaceAll('_',' '))}</span><h3>${esc(i.event_type)} · ${esc(i.reference)}</h3></div><strong>${esc(i.customer_name)}</strong></header><p>${esc(i.preferred_date)} · ${esc(i.venue_postcode)}</p><span class="private-open-hint">Open inquiry →</span></button>`).join(''):emptyPanel('No private-event inquiries yet.');
    }catch(error){box.innerHTML=lockedPanel('Private events unavailable',error.message);}
  }


  function privateStatusLabel(value){return String(value||'NEW_INQUIRY').replaceAll('_',' ');}
  function privateMoneyInput(pence){return ((Number(pence||0))/100).toFixed(2);}
  function privatePence(value){const n=Number.parseFloat(String(value||'0').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,Math.round(n*100)):0;}
  function privateField(label,value){return `<div class="private-detail-field"><span>${esc(label)}</span><strong>${esc(value||'—')}</strong></div>`;}
  function openPrivateEvent(id){
    const item=state.privateEvents.find(row=>String(row.id)===String(id));
    const dialog=$('#privateEventDialog'),box=$('#privateEventDetail');
    if(!item||!dialog||!box)return;
    const phone=item.customer_phone?`<a href="tel:${esc(item.customer_phone)}">${esc(item.customer_phone)}</a>`:'—';
    const email=item.customer_email?`<a href="mailto:${esc(item.customer_email)}">${esc(item.customer_email)}</a>`:'—';
    box.innerHTML=`<section class="private-detail" data-private-id="${esc(item.id)}">
      <div class="private-detail-head"><div><p class="kicker red">Private event inquiry</p><h2>${esc(item.event_type)} · ${esc(item.reference)}</h2><p>${esc(item.customer_name)} · ${email} · ${phone}</p></div><span class="private-status large">${esc(privateStatusLabel(item.status))}</span></div>
      <div class="private-detail-grid">
        ${privateField('Preferred date',item.preferred_date)}${privateField('Alternative date',item.alternative_date)}${privateField('Time',[item.start_time,item.end_time].filter(Boolean).join(' – '))}${privateField('Guests',item.guest_count)}
        ${privateField('Venue',item.venue_name)}${privateField('Postcode',item.venue_postcode)}${privateField('Experience',item.experience_level)}${privateField('Session length',item.session_length)}
      </div>
      <div class="private-detail-block"><span>Venue address</span><p>${esc(item.venue_address||'—')}</p></div>
      <div class="private-detail-block"><span>Requested format</span><p>${esc(item.format_requested||'—')}</p></div>
      <div class="private-detail-block"><span>Music requests</span><p>${esc(item.music_requests||'—')}</p></div>
      <div class="private-detail-block"><span>Accessibility / additional notes</span><p>${esc([item.accessibility_notes,item.additional_notes].filter(Boolean).join('\n\n')||'—')}</p></div>

      ${item.quote_id?`<section class="private-payment-summary"><h3>Payment status</h3><div class="private-detail-grid">${privateField('Quote total',money(item.total_pence||0))}${privateField('Paid',money(item.paid_pence||0))}${privateField('Remaining',money(Math.max(0,Number(item.total_pence||0)-Number(item.paid_pence||0))))}${privateField('Latest payment',item.latest_payment_status?`${privateStatusLabel(item.latest_payment_kind)} · ${privateStatusLabel(item.latest_payment_status)}`:'No payment yet')}</div>${item.latest_payment_reference?`<p class="private-payment-ref">SumUp checkout: ${esc(item.latest_payment_reference)}</p>`:''}${item.latest_paid_at?`<p class="private-payment-ref">Last paid: ${esc(fmt(item.latest_paid_at))}</p>`:''}</section>`:''}

      <section class="private-workflow-box">
        <h3>Review decision</h3>
        <div class="private-status-actions">
          <button type="button" class="button secondary" data-private-status="REVIEWING">Mark reviewing</button>
          <button type="button" class="button" data-private-status="AWAITING_CUSTOMER">Approve for quote</button>
          <button type="button" class="button danger" data-private-status="DECLINED">Decline inquiry</button>
          <button type="button" class="button danger private-delete-inquiry" data-private-delete="1">Delete test / unwanted inquiry</button>
        </div>
      </section>

      <form id="privateQuoteForm" class="private-quote-admin-form">
        <h3>Create / revise quote</h3>
        <p class="private-form-help">Submitting this creates a new quote version and marks the inquiry as QUOTE SENT.</p>
        <div class="hq-form-grid"><label>Agreed date<input name="agreed_date" type="date" value="${esc(item.preferred_date||'')}"></label><label>Quote expires<input name="quote_expires_at" type="date"></label></div>
        <div class="hq-form-grid"><label>Start time<input name="agreed_start_time" type="time" value="${esc((item.start_time||'').slice(0,5))}"></label><label>End time<input name="agreed_end_time" type="time" value="${esc((item.end_time||'').slice(0,5))}"></label></div>
        <label>Agreed venue<input name="agreed_venue" value="${esc(item.venue_name||'')}"></label>
        <label>Agreed address<textarea name="agreed_address" rows="3">${esc(item.venue_address||'')}</textarea></label>
        <label>Package / session description<textarea name="package_description" rows="4" placeholder="e.g. 1-hour beginner-friendly private line dancing session, music and teaching included"></textarea></label>
        <div class="private-money-grid">
          <label>Base fee (£)<input name="base_fee" inputmode="decimal" value="${item.total_pence?privateMoneyInput(item.total_pence):''}" placeholder="200.00"></label>
          <label>Travel (£)<input name="travel_fee" inputmode="decimal" value="0.00"></label>
          <label>Equipment (£)<input name="equipment_fee" inputmode="decimal" value="0.00"></label>
          <label>Extras (£)<input name="extra_fee" inputmode="decimal" value="0.00"></label>
          <label>Discount (£)<input name="discount" inputmode="decimal" value="0.00"></label>
          <label>Deposit (£)<input name="deposit" inputmode="decimal" value="${item.deposit_pence?privateMoneyInput(item.deposit_pence):'50.00'}"></label>
        </div>
        <div class="hq-form-grid"><label>Balance due date<input name="balance_due_date" type="date"></label><label>Customer note<input name="customer_notes" placeholder="Anything the customer should know"></label></div>
        <label>Cancellation terms<textarea name="cancellation_terms" rows="3" placeholder="Add the agreed cancellation / refund terms"></textarea></label>
        <label>Private HQ note<textarea name="internal_notes" rows="3" placeholder="Internal note — not shown to the customer"></textarea></label>
        <div class="private-quote-total" id="privateQuoteTotal">Quote total: £0.00</div>
        <div id="privateQuoteSubmitStatus" class="private-quote-submit-status" hidden aria-live="polite"></div>
        <button type="submit" class="button booking-submit">Save & send quote</button>
      </form>
    </section>`;
    dialog.showModal();
    updatePrivateQuoteTotal();
  }
  function updatePrivateQuoteTotal(){
    const f=$('#privateQuoteForm'),out=$('#privateQuoteTotal');if(!f||!out)return;
    const total=privatePence(f.base_fee.value)+privatePence(f.travel_fee.value)+privatePence(f.equipment_fee.value)+privatePence(f.extra_fee.value)-privatePence(f.discount.value);
    out.textContent=`Quote total: ${money(Math.max(0,total))}`;
  }
  async function setPrivateEventStatus(id,status){
    try{await jsonFetch(`${ADMIN_API_PREFIX}/private-events`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'STATUS',id,status})});toast(`Inquiry marked ${privateStatusLabel(status).toLowerCase()}.`,'success');$('#privateEventDialog')?.close();await loadPrivateEvents();}
    catch(error){toast(error.message,'error');}
  }
  async function deletePrivateEvent(id){
    const item=state.privateEvents.find(row=>String(row.id)===String(id));
    if(!item)return;
    const ok=window.confirm(`Delete ${item.reference}?\n\nThis permanently removes this private-event inquiry and its test quote/payment history from HQ.`);
    if(!ok)return;
    try{
      const result=await jsonFetch(`${ADMIN_API_PREFIX}/private-events`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({action:'DELETE',id})});
      toast(`${result.deleted_reference||item.reference} deleted.`,'success');
      $('#privateEventDialog')?.close();
      await loadPrivateEvents();
    }catch(error){toast(error.message,'error');}
  }
  async function submitPrivateQuote(event){
    event.preventDefault();
    // This handler is delegated from #privateEventDetail, so currentTarget is the
    // container rather than the form. Use the submitted form itself.
    const form=event.target?.closest?.('#privateQuoteForm') || document.getElementById('privateQuoteForm');
    const id=form?.closest('.private-detail')?.dataset.privateId || $('.private-detail')?.dataset.privateId;
    const status=$('#privateQuoteSubmitStatus');
    if(!form||!id){
      if(status){status.hidden=false;status.className='private-quote-submit-status error';status.textContent='The quote form could not be read. Please close this inquiry and open it again.';}
      toast('Could not read the quote form. Please reopen the inquiry.','error');
      return;
    }
    const fd=new FormData(form);
    const value=name=>String(fd.get(name)||'').trim();
    const payload={
      action:'QUOTE',inquiry_id:id,
      agreed_date:value('agreed_date'),agreed_start_time:value('agreed_start_time'),agreed_end_time:value('agreed_end_time'),
      agreed_venue:value('agreed_venue'),agreed_address:value('agreed_address'),package_description:value('package_description'),
      base_fee_pence:privatePence(value('base_fee')),travel_fee_pence:privatePence(value('travel_fee')),
      equipment_fee_pence:privatePence(value('equipment_fee')),extra_fee_pence:privatePence(value('extra_fee')),
      discount_pence:privatePence(value('discount')),deposit_pence:privatePence(value('deposit')),
      balance_due_date:value('balance_due_date'),quote_expires_at:value('quote_expires_at'),
      cancellation_terms:value('cancellation_terms'),customer_notes:value('customer_notes'),internal_notes:value('internal_notes')
    };
    const button=form.querySelector('button[type="submit"]');
    if(payload.base_fee_pence<=0){
      if(status){status.hidden=false;status.className='private-quote-submit-status error';status.textContent='Please add the session/base fee before sending the quote.';}
      form.elements.namedItem('base_fee')?.focus();
      form.elements.namedItem('base_fee')?.scrollIntoView({behavior:'smooth',block:'center'});
      toast('Add the base fee before sending the quote.','error');
      return;
    }
    if(payload.deposit_pence>payload.base_fee_pence+payload.travel_fee_pence+payload.equipment_fee_pence+payload.extra_fee_pence-payload.discount_pence){
      if(status){status.hidden=false;status.className='private-quote-submit-status error';status.textContent='The deposit cannot be more than the quote total.';}
      return;
    }
    if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='SAVING & SENDING…';}
    if(status){status.hidden=false;status.className='private-quote-submit-status';status.textContent='Saving the quote and sending the customer their secure proposal link…';}
    try{
      const result=await jsonFetch(`${ADMIN_API_PREFIX}/private-events`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      if(status){status.className='private-quote-submit-status success';status.textContent=result.email_sent===false?'Quote saved. The customer email could not be sent automatically, so please send the secure proposal link manually.':'Quote saved and emailed to the customer.';}
      toast(result.email_sent===false?'Quote saved — email needs sending manually.':'Quote saved and sent to the customer.','success');
      setTimeout(async()=>{$('#privateEventDialog')?.close();await loadPrivateEvents();},700);
    } catch(error){
      if(status){status.hidden=false;status.className='private-quote-submit-status error';status.textContent=error.message||'The quote could not be saved.';}
      toast(error.message,'error');
    } finally {
      if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Save & send quote';}
    }
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
      const data=await jsonFetch(`${ADMIN_API_PREFIX}/media`,{cache:'no-store'});
      state.media=data.items||data.files||[];
      const count=$('#ranchMediaCount');if(count)count.textContent=state.media.length;
      box.innerHTML=state.media.length?state.media.map(m=>`<article class="ranch-media-item"><div><strong>${esc(m.title||m.original_name)}</strong><small>${esc(m.original_name||m.storage_key)}</small></div></article>`).join(''):emptyPanel('No media uploaded yet.');
    }catch(error){box.innerHTML=lockedPanel('Media unavailable',error.message);}
  }

  function csvCell(value){
    const text=String(value??'');
    return /[",\n\r]/.test(text)?`"${text.replaceAll('\"','\"\"')}"`:text;
  }
  function downloadCsv(filename,headers,rows){
    const csv='\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportBookingsCsv(){
    if(!state.bookings)await loadBookings(true);
    const rows=state.bookings?.bookings||[];
    if(!rows.length){toast('There are no bookings to export.','error');return;}
    downloadCsv(`boot-scootin-bookings-${new Date().toISOString().slice(0,10)}.csv`,
      ['Reference','Customer name','Email','Phone','Class','Starts','Venue','Places','Status','Payment provider','Amount GBP','Refund status','Created'],
      rows.map(b=>[b.reference,b.customer_name,b.customer_email,b.customer_phone,b.class_title,b.starts_at,b.venue,b.quantity,b.status,b.payment_provider,(Number(b.amount_pence||0)/100).toFixed(2),b.refund_status,b.created_at]));
    toast('Bookings CSV downloaded.');
  }
  async function exportCustomersCsv(){
    if(!state.customers)await loadCustomers();
    const rows=state.customers?.customers||[];
    if(!rows.length){toast('There are no customers to export.','error');return;}
    downloadCsv(`boot-scootin-customers-${new Date().toISOString().slice(0,10)}.csv`,
      ['Customer name','Email','Phone','Total bookings','Paid bookings','Cancelled bookings','Attended classes','Loyalty progress','Reward ready','Marketing consent','Last booking'],
      rows.map(c=>[c.customer_name,c.customer_email,c.customer_phone,c.total_bookings,c.paid_bookings,c.cancelled_bookings,c.attended_classes,c.loyalty_progress,c.reward_ready?'Yes':'No',c.marketing_consent?'Yes':'No',c.last_booking_at]));
    toast('Customers CSV downloaded.');
  }
  async function checkMediaBackend(){
    const node=$('#mediaBackendStatus'),button=$('#checkMediaBackend');
    if(button){button.disabled=true;button.textContent='Checking…';}
    if(node)node.innerHTML='<strong>Checking media connection…</strong><span>Please wait.</span>';
    try{
      const data=await jsonFetch(`${ADMIN_API_PREFIX}/media-status`,{cache:'no-store'});
      if(node)node.innerHTML=`<strong>${data.ready?'Media is ready':'Media needs attention'}</strong><span>${esc(data.error||Object.values(data.checks||{}).map(i=>i.message).join(' '))}</span>`;
      toast(data.ready?'R2 media connection is ready.':'Media connection needs attention.',data.ready?'success':'error');
    }catch(error){if(node)node.innerHTML=`<strong>Media check failed</strong><span>${esc(error.message)}</span>`;toast(error.message,'error');}
    finally{if(button){button.disabled=false;button.textContent='Check connection';}}
  }
  async function uploadMedia(event){
    event.preventDefault();
    const form=event.currentTarget,file=form.elements.file.files?.[0],message=$('#mediaUploadMessage'),progress=$('#mediaUploadProgress'),button=form.querySelector('[type=submit]');
    if(!file){message.textContent='Please choose a file.';return;}
    const body=new FormData(form);
    button.disabled=true;button.textContent='Uploading…';message.textContent='Uploading to HQ…';if(progress)progress.hidden=false;
    try{
      const result=await jsonFetch(`${ADMIN_API_PREFIX}/media`,{method:'POST',body},120000);
      message.textContent=result.note||'Upload complete.';form.reset();await loadMedia();toast('Media uploaded to HQ.');
    }catch(error){message.textContent=error.message;toast(error.message,'error');}
    finally{button.disabled=false;button.textContent='Upload to HQ';if(progress)progress.hidden=true;}
  }


  function selectedCustomerEmails(){return [...document.querySelectorAll('[data-email-customer]:checked')].map(el=>el.value);}
  function emailAudiencePayload(){
    return {class_id:$('#emailClassPicker')?.value||'',emails:$('#emailSelectedRecipients')?.value||'',selected_emails:selectedCustomerEmails(),sender_type:$('#emailSenderType')?.value||'general'};
  }
  function currentEmailDraft(){
    return {subject:$('#emailSubject')?.value.trim()||'',body_text:$('#emailBody')?.value.trim()||'',audience_type:$('#emailAudienceType')?.value||'subscribers',audience:emailAudiencePayload()};
  }
  function renderEmailCentre(){
    const data=state.emailCentre;if(!data)return;
    const provider=$('#emailProviderStatus');
    if(provider){provider.className=`email-centre-status ${data.provider?.ready?'ready':'setup'}`;provider.innerHTML=data.provider?.ready?`<strong>Email sending connected</strong><br>General: ${esc(data.provider.senders?.general||data.provider.from||'configured')}<br>Bookings: ${esc(data.provider.senders?.bookings||'configured')}<br>Events: ${esc(data.provider.senders?.events||'configured')}<br>Members: ${esc(data.provider.senders?.members||'configured')}<br>Scheduled campaigns are supported.`:`<strong>Email setup required</strong><br>Add RESEND_API_KEY and at least EMAIL_FROM_GENERAL or EMAIL_FROM in Cloudflare before sending.`;}
    const automationWrap=$('#emailAutomationSettings');
    if(automationWrap){const labels={welcome:'Welcome email after opt-in',reminder_48h:'Reminder about 48 hours before class',class_day_morning:'Reminder on the morning of the class',birthday:'Birthday email',thank_you:'Thank-you email after attendance',new_class_draft:'Prepare new-class announcement as a draft',class_updates:'Email booked customers when class details change'};const settings=Object.fromEntries((data.automations||[]).map(x=>[x.setting_key,Number(x.enabled)!==0]));automationWrap.innerHTML=Object.entries(labels).map(([key,label])=>`<label class="email-customer-option"><input type="checkbox" data-email-automation="${key}" ${settings[key]!==false?'checked':''}><span><strong>${esc(label)}</strong></span></label>`).join('');}
    const history=$('#emailAutomationHistory');if(history){history.innerHTML=(data.automation_history||[]).length?(data.automation_history||[]).map(x=>`<div class="email-campaign-item"><strong>${esc(x.automation_type)}</strong><span>${esc(x.email||'')} · ${esc(fmt(x.created_at))} · ${esc(x.status)}</span></div>`).join(''):'No automatic emails yet.';}
    const templateSelect=$('#emailTemplateSelect');if(templateSelect){templateSelect.innerHTML='<option value="">Start from blank</option>'+data.templates.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');}
    const classPicker=$('#emailClassPicker');if(classPicker){classPicker.innerHTML='<option value="">Choose a class</option>'+data.classes.map(c=>`<option value="${esc(c.id)}">${esc(c.title)} — ${esc(fmt(c.starts_at))}</option>`).join('');}
    const list=$('#emailTemplatesList');if(list){list.innerHTML=data.templates.length?data.templates.map(t=>`<article class="email-template-item"><strong>${esc(t.name)}</strong><span>${esc(t.subject)}</span><div class="email-template-actions"><button type="button" data-use-template="${esc(t.id)}">Use</button>${t.is_system?'':`<button type="button" data-edit-template="${esc(t.id)}">Edit</button><button type="button" data-delete-template="${esc(t.id)}">Delete</button>`}</div></article>`).join(''):'<div class="email-empty">No templates yet.</div>';}
    renderEmailCustomerPicker();
    const campaigns=$('#emailCampaignList');if(campaigns){campaigns.innerHTML=data.campaigns.length?data.campaigns.map(c=>`<article class="email-campaign-row"><div><strong>${esc(c.subject)}</strong><br><small>${esc(c.audience_type.replaceAll('_',' '))}</small></div><span>${Number(c.recipient_count||0)} recipient${Number(c.recipient_count||0)===1?'':'s'}</span><span class="email-status-pill ${esc(String(c.status||'').toLowerCase())}">${esc(c.status)}</span><div>${c.scheduled_at?esc(fmt(c.scheduled_at)):c.sent_at?esc(fmt(c.sent_at)):esc(fmt(c.created_at))}${c.status==='SCHEDULED'?`<br><button type="button" data-cancel-campaign="${esc(c.id)}">Cancel</button>`:''}${c.error_message?`<br><small>${esc(c.error_message)}</small>`:''}</div></article>`).join(''):'<div class="email-empty">No campaigns yet.</div>';}
    const subscribers=$('#emailSubscriberList');if(subscribers){
      const count=Array.isArray(data.subscribers)?data.subscribers.length:0;
      subscribers.innerHTML=`<div class="email-subscriber-summary"><span>Total subscribed</span><strong>${count}</strong></div>`+(count?data.subscribers.map(r=>`<article class="email-subscriber-row"><strong>${esc(r.name||'Subscriber')}</strong><span>${esc(r.email)}</span><small>Joined / last activity ${esc(fmt(r.last_booking_at))}</small></article>`).join(''):'<div class="email-empty">No mailing-list subscribers yet.</div>');
    }
  }
  async function loadEmailCentre(){
    const provider=$('#emailProviderStatus');if(provider)provider.textContent='Loading email centre…';
    try{state.emailCentre=await jsonFetch(`${ADMIN_API_PREFIX}/emails`,{},15000);renderEmailCentre();}
    catch(error){if(provider){provider.className='email-centre-status setup';provider.textContent=error.message;}toast(error.message,'error');}
  }
  function renderEmailCustomerPicker(){
    const list=$('#emailCustomerPickerList');if(!list)return;
    const search=String($('#emailCustomerSearch')?.value||'').toLowerCase();
    const selected=new Set(selectedCustomerEmails());
    const customers=(state.emailCentre?.customers||[]).filter(c=>!search||String(c.name||'').toLowerCase().includes(search)||String(c.email||'').toLowerCase().includes(search));
    list.innerHTML=customers.length?customers.map(c=>`<label class="email-customer-option"><input type="checkbox" data-email-customer value="${esc(c.email)}" ${selected.has(c.email)?'checked':''}><span><strong>${esc(c.name||'Customer')}</strong><small>${esc(c.email)}</small></span></label>`).join(''):'<div class="email-empty">No matching customers.</div>';
  }
  function updateEmailAudienceFields(){
    const type=$('#emailAudienceType')?.value;
    if($('#emailClassPickerWrap'))$('#emailClassPickerWrap').hidden=!['class_bookings','class_attendees','waiting_list'].includes(type);
    if($('#emailSelectedWrap'))$('#emailSelectedWrap').hidden=type!=='selected';
    if($('#emailCustomerPickerWrap'))$('#emailCustomerPickerWrap').hidden=type!=='selected_customers';
    renderEmailCustomerPicker();
  }
  async function previewEmailAudience(){
    const result=$('#emailAudienceResult');if(result)result.textContent='Checking recipients…';
    try{const d=currentEmailDraft();const response=await jsonFetch(`${ADMIN_API_PREFIX}/emails`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'AUDIENCE_PREVIEW',audience_type:d.audience_type,audience:d.audience})});if(result)result.innerHTML=`<strong>${response.count} eligible recipient${response.count===1?'':'s'}</strong>${response.sample?.length?`<br>${response.sample.map(r=>esc(r.name||r.email)).join(', ')}`:''}`;return response;}
    catch(error){if(result)result.textContent=error.message;toast(error.message,'error');return null;}
  }
  function applyEmailTemplate(id,edit=false){
    const t=state.emailCentre?.templates?.find(x=>String(x.id)===String(id));if(!t)return;
    if(edit){$('#templateId').value=t.id;$('#templateName').value=t.name;$('#templateSubject').value=t.subject;$('#templateBody').value=t.body_text;document.querySelector('.email-template-editor')?.setAttribute('open','');}
    else{$('#emailSubject').value=t.subject;$('#emailBody').value=t.body_text;$('#emailTemplateSelect').value=t.id;toast(`Loaded ${t.name}.`,'success');}
  }
  async function emailCampaignAction(action){
    const status=$('#emailComposeStatus');const draft=currentEmailDraft();
    if(!draft.subject||!draft.body_text){toast('Add a subject and message first.','error');return;}
    if(action==='SCHEDULE')draft.scheduled_at=$('#emailScheduleAt')?.value?new Date($('#emailScheduleAt').value).toISOString():'';
    if(status)status.textContent=action==='SEND_NOW'?'Queueing email…':'Saving schedule…';
    try{const preview=await previewEmailAudience();if(!preview)return;const response=await jsonFetch(`${ADMIN_API_PREFIX}/emails`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...draft})},30000);if(status)status.textContent=response.message||'Saved.';toast(response.message||'Email action completed.','success');setTimeout(loadEmailCentre,1500);}
    catch(error){if(status)status.textContent=error.message;toast(error.message,'error');}
  }
  async function saveEmailAutomations(){
    const settings={};document.querySelectorAll('[data-email-automation]').forEach(el=>settings[el.dataset.emailAutomation]=el.checked);
    try{const r=await jsonFetch(`${ADMIN_API_PREFIX}/emails`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'SAVE_AUTOMATIONS',settings})});toast(r.message||'Automation settings saved.','success');await loadEmailCentre();}catch(error){toast(error.message,'error');}
  }
  async function saveEmailTemplate(){
    const payload={action:'SAVE_TEMPLATE',id:$('#templateId').value,name:$('#templateName').value,subject:$('#templateSubject').value,body_text:$('#templateBody').value};
    try{await jsonFetch(`${ADMIN_API_PREFIX}/emails`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});toast('Template saved.','success');clearEmailTemplate();await loadEmailCentre();}catch(error){toast(error.message,'error');}
  }
  function clearEmailTemplate(){['templateId','templateName','templateSubject','templateBody'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});}
  async function sendEmailTest(){
    const draft=currentEmailDraft();if(!draft.subject||!draft.body_text){toast('Add a subject and message first.','error');return;}
    try{const r=await jsonFetch(`${ADMIN_API_PREFIX}/emails`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'SEND_TEST',...draft})},30000);toast(r.message||'Test email sent.','success');}catch(error){toast(error.message,'error');}
  }

  // Events
  $('#ranch91RunChecks')?.addEventListener('click',loadHealth);
  $('#refreshHealth')?.addEventListener('click',loadHealth);
  $('#ranch91RefreshOverview')?.addEventListener('click',()=>loadBootstrap(true,{force:true}));
  $('#ranch92RefreshSetup')?.addEventListener('click',()=>loadBootstrap(true,{force:true}));
  $('#refreshBookings')?.addEventListener('click',()=>loadBookings(true));
  $('#bookingAdminFilter')?.addEventListener('change',()=>renderBookingAdmin());

  const oauthResult=new URLSearchParams(location.search).get('sumup');
  if(oauthResult){
    const message=new URLSearchParams(location.search).get('message');
    setTimeout(()=>toast(oauthResult==='connected'?'SumUp refunds connected successfully.':(message||'SumUp could not be connected.'),oauthResult==='connected'?'success':'error'),500);
    try{
      const cleanUrl=new URL(location.href);
      cleanUrl.searchParams.delete('sumup');cleanUrl.searchParams.delete('message');
      history.replaceState(null,'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);
    }catch(_){}
  }
  $('#deleteAllTestBookings')?.addEventListener('click',deleteAllTestBookings);
  $('#refreshPromotions')?.addEventListener('click',loadPromotions);
  $('#createPromotion')?.addEventListener('click',createPromotion);
  $('#promotionList')?.addEventListener('click',async event=>{const button=event.target.closest('[data-toggle-promotion]');if(!button)return;try{await jsonFetch(`${ADMIN_API_PREFIX}/promotions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'TOGGLE',id:button.dataset.togglePromotion})});await loadPromotions();}catch(error){toast(error.message,'error');}});
  $('#refreshCustomers')?.addEventListener('click',loadCustomers);
  $('#refreshEmailCentre')?.addEventListener('click',loadEmailCentre);
  $('#emailAudienceType')?.addEventListener('change',updateEmailAudienceFields);
  $('#emailCustomerSearch')?.addEventListener('input',renderEmailCustomerPicker);
  $('#selectAllEmailCustomers')?.addEventListener('click',()=>{document.querySelectorAll('[data-email-customer]').forEach(el=>el.checked=true);});
  $('#clearEmailCustomers')?.addEventListener('click',()=>{document.querySelectorAll('[data-email-customer]').forEach(el=>el.checked=false);});
  $('#previewEmailAudience')?.addEventListener('click',()=>previewEmailAudience().catch(()=>{}));
  $('#sendEmailTest')?.addEventListener('click',sendEmailTest);
  $('#sendEmailNow')?.addEventListener('click',()=>emailCampaignAction('SEND_NOW'));
  $('#scheduleEmail')?.addEventListener('click',()=>emailCampaignAction('SCHEDULE'));
  $('#saveEmailTemplate')?.addEventListener('click',saveEmailTemplate);
  $('#saveEmailAutomations')?.addEventListener('click',saveEmailAutomations);
  $('#clearEmailTemplate')?.addEventListener('click',clearEmailTemplate);
  $('#emailTemplateSelect')?.addEventListener('change',event=>event.target.value&&applyEmailTemplate(event.target.value));
  $('#closePrivateEventDialog')?.addEventListener('click',()=>$('#privateEventDialog')?.close());
  $('#privateEventDialog')?.addEventListener('click',event=>{if(event.target.id==='privateEventDialog')event.currentTarget.close();});
  $('#privateEventDetail')?.addEventListener('input',event=>{if(event.target.closest('#privateQuoteForm'))updatePrivateQuoteTotal();});
  $('#privateEventDetail')?.addEventListener('submit',event=>{if(event.target.id==='privateQuoteForm')submitPrivateQuote(event);});
  $('#closeCustomerCrm')?.addEventListener('click',()=>{const dialog=$('#customerCrmDialog');dialog?.close();document.documentElement.classList.remove('crm-dialog-open');document.body.classList.remove('crm-dialog-open');});
  $('#customerCrmDialog')?.addEventListener('close',()=>{document.documentElement.classList.remove('crm-dialog-open');document.body.classList.remove('crm-dialog-open');});
  $('#customerCrmDialog')?.addEventListener('click',event=>{if(event.target.id==='customerCrmDialog')event.currentTarget.close();});
  $('#processDueEmails')?.addEventListener('click',async()=>{try{const r=await jsonFetch(`${ADMIN_API_PREFIX}/emails`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'PROCESS_DUE'})},60000);toast(`Processed ${r.results?.length||0} due campaign(s).`,'success');loadEmailCentre();}catch(error){toast(error.message,'error');}});
  $('#customerAdminSearch')?.addEventListener('input',loadCustomers);
  $('#refreshOperations')?.addEventListener('click',()=>loadBootstrap(true,{force:true}));
  $('#printOperationsRegister')?.addEventListener('click',()=>window.print());
  $('#refreshPrivateEvents')?.addEventListener('click',loadPrivateEvents);
  $('#refreshMedia')?.addEventListener('click',loadMedia);
  $$('[data-open-class]').forEach(button=>button.addEventListener('click',event=>{
    event.preventDefault();
    openClassEditor();
  }));
  // Delegated fallback protects the action if HQ markup is refreshed or a
  // cached page is paired with the latest script.
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-open-class]');
    if(!button||button.dataset.classOpenHandled==='1')return;
    event.preventDefault();
    openClassEditor();
  });
  $$('[data-open-class]').forEach(button=>button.dataset.classOpenHandled='1');
  $('#refreshRanch')?.addEventListener('click',loadClasses);
  $('#classPosterFile')?.addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;const url=URL.createObjectURL(file);const wrap=$('#classPosterPreviewWrap'),img=$('#classPosterPreview'),remove=$('#removeClassPoster'),status=$('#classPosterStatus');if(img)img.src=url;if(wrap)wrap.hidden=false;if(remove)remove.hidden=false;if(status)status.textContent=`Selected: ${file.name}. It will upload when you save the class.`;});
  $('#removeClassPoster')?.addEventListener('click',()=>{const input=$('#classPosterFile');if(input)input.value='';setClassPosterPreview('');});
  $('#ranchClassFilter')?.addEventListener('change',renderClasses);
  $('#classEditorForm')?.addEventListener('submit',saveClass);
  $$('[data-class-template]').forEach(node=>node.addEventListener('click',()=>applyClassTemplate(node.dataset.classTemplate)));
  $('#classEditorForm')?.elements?.starts_at?.addEventListener('change',event=>{if(activeClassTemplate)applyTemplateTimes(event.currentTarget.form,activeClassTemplate);});
  $$('[data-close-class-modal]').forEach(node=>node.addEventListener('click',closeClassEditor));
  $('#exportBookingsCsv')?.addEventListener('click',exportBookingsCsv);
  $('#exportCustomersCsv')?.addEventListener('click',exportCustomersCsv);
  $('#checkMediaBackend')?.addEventListener('click',checkMediaBackend);
  $('#mediaUploadForm')?.addEventListener('submit',uploadMedia);
  document.addEventListener('click',async event=>{
    const openProfile=event.target.closest?.('[data-customer-email]');if(openProfile&&openProfile.closest('.crm-customer-card')){event.preventDefault();openCustomerCrm(openProfile.dataset.customerEmail||openProfile.closest('.crm-customer-card').dataset.customerEmail);return;}
    const tab=event.target.closest?.('[data-crm-tab]');if(tab){$$('[data-crm-tab]').forEach(n=>n.classList.toggle('active',n===tab));$$('[data-crm-panel]').forEach(n=>n.classList.toggle('active',n.dataset.crmPanel===tab.dataset.crmTab));return;}
    if(event.target.closest?.('#saveCrmOverview')||event.target.closest?.('#saveCrmPrivate')){saveCrmProfile();return;}
    if(event.target.closest?.('#addCrmNote')){addCrmNote();return;}
    const delNote=event.target.closest?.('.crm-delete-note');if(delNote&&confirm('Delete this private note?')){const key=$('.crm-profile')?.dataset.customerKey;try{await jsonFetch(`${ADMIN_API_PREFIX}/customers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'DELETE_NOTE',customer_key:key,note_id:delNote.dataset.noteId})});await openCustomerCrm(key);}catch(error){toast(error.message,'error');}return;}
    if(event.target.closest?.('[data-crm-email]')){$('#customerCrmDialog')?.close();showView('emails');const email=state.customerProfile?.customer?.customer_email;if($('#emailSelectedRecipients'))$('#emailSelectedRecipients').value=email||'';if($('#emailAudienceType'))$('#emailAudienceType').value='selected';return;}

    const privateOpen=event.target.closest?.('[data-private-event-id]');if(privateOpen){event.preventDefault();openPrivateEvent(privateOpen.dataset.privateEventId);return;}
    const privateStatus=event.target.closest?.('[data-private-status]');if(privateStatus){event.preventDefault();const id=$('.private-detail')?.dataset.privateId;if(id)setPrivateEventStatus(id,privateStatus.dataset.privateStatus);return;}
    const use=event.target.closest?.('[data-use-template]');if(use){applyEmailTemplate(use.dataset.useTemplate);return;}
    const edit=event.target.closest?.('[data-edit-template]');if(edit){applyEmailTemplate(edit.dataset.editTemplate,true);return;}
    const del=event.target.closest?.('[data-delete-template]');if(del&&confirm('Delete this email template?')){try{await jsonFetch(`${ADMIN_API_PREFIX}/emails`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'DELETE_TEMPLATE',id:del.dataset.deleteTemplate})});loadEmailCentre();}catch(error){toast(error.message,'error');}return;}
    const cancel=event.target.closest?.('[data-cancel-campaign]');if(cancel&&confirm('Cancel this scheduled email?')){try{await jsonFetch(`${ADMIN_API_PREFIX}/emails`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CANCEL_CAMPAIGN',id:cancel.dataset.cancelCampaign})});loadEmailCentre();}catch(error){toast(error.message,'error');}}
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#classEditorModal')?.hidden)closeClassEditor();});



  async function cleanupKnownAugustTests(){
    const button=document.getElementById('cleanupKnownAugustTests');
    const status=document.getElementById('knownTestCleanupStatus');
    const confirmation=prompt('This deletes only the three known 3 August test bookings for the 26 August class.\n\nType DELETE 3 TEST BOOKINGS to continue.');
    if(confirmation!=='DELETE 3 TEST BOOKINGS')return;

    if(button){button.disabled=true;button.textContent='Deleting…';}
    if(status)status.textContent='Deleting the three known test bookings and recalculating capacity…';

    try{
      const result=await jsonFetch(`${ADMIN_API_PREFIX}/cleanup-known-august-tests`,{
        method:'POST',
        body:JSON.stringify({confirmation})
      },10000);

      localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
      state.bootstrap=null;
      state.bootstrapLoadedAt=0;
      await loadBootstrap(false,{force:true,silent:true});

      if(status)status.textContent=`${result.deleted||0} test bookings deleted. The 26 August class capacity and dashboard totals have been refreshed.`;
      if(button){button.hidden=true;}
      toast('Three test bookings deleted.');
    }catch(error){
      if(status)status.textContent=error.message;
      toast(error.message,'error');
    }finally{
      if(button&&!button.hidden){button.disabled=false;button.textContent='Delete 3 test bookings';}
    }
  }

  document.getElementById('cleanupKnownAugustTests')?.addEventListener('click',cleanupKnownAugustTests);

  async function runDiagnosticTests(){
    const button=document.getElementById('runDiagnosticTests');
    if(button){button.disabled=true;button.textContent='Testing…';}
    diagnosticEvent('diagnostic_suite_started',{result:'Running'});
    try{
      await loadBootstrap(false,{force:true,silent:true});
      try{await jsonFetch(`${ADMIN_API_PREFIX}/system-health`,{cache:'no-store'},6000);}
      catch(error){
        if(error.status===401||error.status===403){
          diagnosticEvent('health_endpoint_protected',{endpoint:`${ADMIN_API_PREFIX}/system-health`,status:error.status,result:'Expected until Cloudflare Access is configured'});
        }
      }
      diagnosticEvent('diagnostic_suite_completed',{result:'Finished'});
      toast('Diagnostic tests completed.');
    }finally{
      if(button){button.disabled=false;button.textContent='Run tests';}
    }
  }

  async function copyDiagnosticReport(){
    const text=buildDiagnosticReport();
    try{await navigator.clipboard.writeText(text);}
    catch(_){
      const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
    }
    toast('Diagnostic report copied.');
  }

  document.getElementById('runDiagnosticTests')?.addEventListener('click',runDiagnosticTests);
  document.getElementById('copyDiagnosticReport')?.addEventListener('click',copyDiagnosticReport);
  document.getElementById('clearDiagnosticLog')?.addEventListener('click',()=>{
    state.diagnostics=[];state.frontendErrors=0;
    try{sessionStorage.removeItem('boot-scootin-hq-diagnostics');}catch(_){}
    renderDiagnostics();toast('Diagnostic log cleared.');
  });
  try{
    const previous=JSON.parse(sessionStorage.getItem('boot-scootin-hq-diagnostics')||'[]');
    if(Array.isArray(previous))state.diagnostics=previous.slice(0,DIAGNOSTIC_LIMIT);
    else state.diagnostics=[];
  }catch(_){}
  diagnosticEvent('hq_script_started',{result:'V95.0.0 loaded',online:navigator.onLine,visibility:document.visibilityState});

  showView('overview');
  const cachedBootstrap=readBootstrapCache();
  if(cachedBootstrap?.data){
    state.bootstrap=cachedBootstrap.data;
    state.bootstrapLoadedAt=cachedBootstrap.savedAt||Date.now();
    renderMode();renderSetup();renderOverview();renderOperationsFromBootstrap();
    updateLastUpdated('cache');
  }
  loadBootstrap(false,{silent:Boolean(state.bootstrap)}).catch(()=>{});
  renderDiagnostics();

  document.addEventListener('click',event=>{
    const jump=event.target.closest('[data-view-jump]');
    if(!jump)return;
    const name=jump.dataset.viewJump;
    const nav=document.querySelector(`.ranch91-nav [data-view="${name}"]`);
    if(nav)nav.click();
  });
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


  document.addEventListener('click',event=>{
    const del=event.target.closest('[data-private-delete]');
    if(!del)return;
    const id=del.closest('.private-detail')?.dataset.privateId;
    if(id) deletePrivateEvent(id);
  });
})();
// v96.4.96 — HQ inactivity protection. Cloudflare Access owns the HQ login,
// so automatic logout ends the Access session rather than only hiding the page.
(()=>{
  const LIMIT=15*60*1000, WARNING_AT=13*60*1000;
  let last=Date.now(), warning=null;
  function close(){if(warning){warning.remove();warning=null;}}
  function activity(){last=Date.now();close();}
  function logout(){location.replace('/cdn-cgi/access/logout?returnTo='+encodeURIComponent(location.origin+'/admin-login.html?logged_out=inactive'));}
  function warn(){if(warning)return;warning=document.createElement('div');warning.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.8);display:grid;place-items:center;padding:24px';warning.innerHTML='<div style="max-width:460px;background:#150b0c;border:1px solid #a82c34;padding:28px;color:#fff;font-family:Arial,sans-serif"><h2 style="margin-top:0">HQ security check</h2><p>You’ve been inactive. HQ will log out after 15 minutes of inactivity.</p><div style="display:flex;gap:12px"><button data-stay style="padding:13px 18px;background:#b32630;color:#fff;border:1px solid #ef4a55;font-weight:800">STAY LOGGED IN</button><button data-out style="padding:13px 18px;background:#080606;color:#fff;border:1px solid #744;font-weight:800">LOG OUT</button></div></div>';document.body.appendChild(warning);warning.querySelector('[data-stay]').onclick=activity;warning.querySelector('[data-out]').onclick=logout;}
  ['pointerdown','keydown','touchstart','scroll'].forEach(e=>addEventListener(e,activity,{passive:true}));
  addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-last>=LIMIT)logout();});
  setInterval(()=>{const idle=Date.now()-last;if(idle>=LIMIT)logout();else if(idle>=WARNING_AT)warn();},5000);
})();
