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


  const BOOTSTRAP_CACHE_KEY='boot-scootin-hq-bootstrap-v92-5-0';
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
      version:'V92.6.0',
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
  function setDrawer(open){
    if(!drawer||!menuButton)return;
    drawer.classList.toggle('open',open);
    drawer.setAttribute('aria-hidden',String(!open));
    menuButton.setAttribute('aria-expanded',String(open));
    document.body.classList.toggle('ranch91-drawer-open',open);
    if(backdrop){backdrop.hidden=!open;backdrop.classList.toggle('open',open);}
    if(open){drawer.scrollTop=0;if(closeButton)setTimeout(()=>closeButton.focus({preventScroll:true}),0);}
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

  const titles={overview:'HQ Home',classes:'Classes',bookings:'Bookings',customers:'Customers',operations:'Operations','private-events':'Private Events',media:'Media',health:'System Health',diagnostics:'Diagnostics',settings:'Settings'};
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
  $$('[data-hq-logout]').forEach(link=>link.addEventListener('click',()=>{
    try{sessionStorage.removeItem(BOOTSTRAP_CACHE_KEY);}catch{}
  }));
  document.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-settings]');
    if(open)showView('settings');
  });

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
      <div class="ranch-class-meta"><b>${Number(c.sold||0)} / ${Number(c.capacity||0)}</b><small>${esc(c.status)}</small></div>
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
  function openClassEditor(item=null){
    if(state.bootstrap?.mode!=='protected'){toast('Cloudflare Access must authorise this HQ session.','error');return;}
    const modal=$('#classEditorModal'),form=$('#classEditorForm');if(!modal||!form)return;
    form.reset();
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
    const payload={
      id:id||undefined,title:form.elements.title.value.trim(),venue:form.elements.venue.value.trim(),location:form.elements.location.value.trim(),
      starts_at:form.elements.starts_at.value,ends_at:form.elements.ends_at.value||null,
      price_pence:Math.round(Number(form.elements.price_gbp.value||0)*100),capacity:Number(form.elements.capacity.value||0),
      status:form.elements.status.value,level:form.elements.level.value.trim(),public_notes:form.elements.public_notes.value.trim()
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
    const filter=$('#bookingAdminFilter')?.value||'all';
    let rows=data.bookings||[];

    if(filter==='active')rows=rows.filter(b=>['PENDING','PAID'].includes(b.status));
    else if(filter==='refund-review')rows=rows.filter(b=>['REFUND_DUE','CREDIT_DUE','REVIEW_IF_RESOLD','ADMIN_REVIEW'].includes(b.refund_status));
    else if(filter!=='all')rows=rows.filter(b=>b.status===filter);

    box.innerHTML=rows.length?rows.map(b=>`
      <article class="booking-admin-card ${b.is_test_candidate?'test-booking':''}">
        <header>
          <div>
            <span class="booking-status">${esc(b.status)}</span>
            ${b.is_test_candidate?'<span class="booking-test-badge">TEST CANDIDATE</span>':''}
            <h3>${esc(b.customer_name)}</h3>
            <p>${esc(b.customer_email)}</p>
          </div>
          <strong>${money(b.amount_pence)}</strong>
        </header>
        <dl>
          <div><dt>Class</dt><dd>${esc(b.class_title)}</dd></div>
          <div><dt>Date</dt><dd>${fmt(b.starts_at)}</dd></div>
          <div><dt>Places</dt><dd>${esc(b.quantity)}</dd></div>
          <div><dt>Reference</dt><dd>${esc(b.reference)}</dd></div>
          <div><dt>Payment</dt><dd>${esc(b.payment_provider)}</dd></div>
          <div><dt>Created</dt><dd>${fmt(b.created_at)}</dd></div>
        </dl>
        ${b.is_test_candidate?`<div class="booking-admin-actions"><button type="button" class="danger-outline" data-delete-test-booking="${esc(b.id)}">Delete test booking</button></div>`:''}
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
    },8000);
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
      state.customers=await jsonFetch(`${ADMIN_API_PREFIX}/customers`,{cache:'no-store'});
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
      const data=await jsonFetch(`${ADMIN_API_PREFIX}/private-events`,{cache:'no-store'});
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

  // Events
  $('#ranch91RunChecks')?.addEventListener('click',loadHealth);
  $('#refreshHealth')?.addEventListener('click',loadHealth);
  $('#ranch91RefreshOverview')?.addEventListener('click',()=>loadBootstrap(true,{force:true}));
  $('#ranch92RefreshSetup')?.addEventListener('click',()=>loadBootstrap(true,{force:true}));
  $('#refreshBookings')?.addEventListener('click',()=>loadBookings(true));
  $('#bookingAdminFilter')?.addEventListener('change',()=>renderBookingAdmin());
  $('#deleteAllTestBookings')?.addEventListener('click',deleteAllTestBookings);
  $('#refreshCustomers')?.addEventListener('click',loadCustomers);
  $('#customerAdminSearch')?.addEventListener('input',loadCustomers);
  $('#refreshOperations')?.addEventListener('click',()=>loadBootstrap(true,{force:true}));
  $('#printOperationsRegister')?.addEventListener('click',()=>window.print());
  $('#refreshPrivateEvents')?.addEventListener('click',loadPrivateEvents);
  $('#refreshMedia')?.addEventListener('click',loadMedia);
  $('[data-open-class]')?.addEventListener('click',()=>openClassEditor());
  $('#refreshRanch')?.addEventListener('click',loadClasses);
  $('#ranchClassFilter')?.addEventListener('change',renderClasses);
  $('#classEditorForm')?.addEventListener('submit',saveClass);
  $$('[data-close-class-modal]').forEach(node=>node.addEventListener('click',closeClassEditor));
  $('#exportBookingsCsv')?.addEventListener('click',exportBookingsCsv);
  $('#exportCustomersCsv')?.addEventListener('click',exportCustomersCsv);
  $('#checkMediaBackend')?.addEventListener('click',checkMediaBackend);
  $('#mediaUploadForm')?.addEventListener('submit',uploadMedia);
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
  diagnosticEvent('hq_script_started',{result:'V92.6.0 loaded',online:navigator.onLine,visibility:document.visibilityState});

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