(()=>{
  const state={
    currentView:'overview',
    classes:[],
    bookings:null,
    customers:null,
    operations:null,
    media:[],
    health:null,
    privateEvents:[]
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

  function toast(message,kind='success'){
    const node=$('#ranch91Toast');
    if(!node)return;
    node.hidden=false;
    node.className=`ranch91-toast ${kind}`;
    node.textContent=message;
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>node.hidden=true,3200);
  }

  async function jsonFetch(url,options={}){
    const response=await fetch(url,{
      ...options,
      headers:{
        Accept:'application/json',
        ...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),
        ...(options.headers||{})
      }
    });
    const text=await response.text();
    let data={};
    try{data=text?JSON.parse(text):{};}catch(_){data={error:text||'Unexpected server response.'};}
    if(!response.ok)throw new Error(data.error||data.detail||`Request failed (${response.status}).`);
    return data;
  }

  // -------------------------
  // Drawer / navigation
  // -------------------------
  const drawer=$('#ranch91Drawer');
  const backdrop=$('#ranch91Backdrop');
  const menuButton=$('#ranch91Menu');
  const closeButton=$('#ranch91Close');

  function setDrawer(open){
    drawer.classList.toggle('open',open);
    drawer.setAttribute('aria-hidden',String(!open));
    menuButton.setAttribute('aria-expanded',String(open));
    document.body.classList.toggle('ranch91-drawer-open',open);
    backdrop.hidden=!open;
    backdrop.classList.toggle('open',open);
    if(open){
      drawer.scrollTop=0;
      setTimeout(()=>closeButton.focus({preventScroll:true}),0);
    }
  }

  menuButton.addEventListener('click',()=>setDrawer(!drawer.classList.contains('open')));
  closeButton.addEventListener('click',()=>setDrawer(false));
  backdrop.addEventListener('click',()=>setDrawer(false));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drawer.classList.contains('open'))setDrawer(false);
  });
  window.addEventListener('pageshow',()=>setDrawer(false));

  const viewTitles={
    overview:'HQ Home',
    classes:'Classes',
    bookings:'Bookings',
    customers:'Customers',
    operations:'Operations',
    'private-events':'Private Events',
    media:'Media',
    health:'System Health',
    settings:'Settings'
  };

  function showView(name){
    state.currentView=name;
    $$('.ranch-view').forEach(panel=>panel.classList.toggle('active',panel.dataset.viewPanel===name));
    $$('.ranch91-nav [data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===name));
    $('#ranch91PageTitle').textContent=viewTitles[name]||'HQ';
    setDrawer(false);
    window.scrollTo({top:0,behavior:'instant'});
  }

  $$('.ranch91-nav [data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));

  // -------------------------
  // Overview / operations
  // -------------------------
  function renderOverview(){
    const upcoming=state.classes.filter(c=>c.status==='open'&&new Date(c.starts_at)>=new Date());
    $('#overviewUpcoming').textContent=upcoming.length;
    $('#overviewBooked').textContent=state.classes.reduce((sum,c)=>sum+Number(c.sold||0),0);
    $('#overviewRevenue').textContent=money(state.bookings?.stats?.paid||0);
    $('#overviewMedia').textContent=state.media.length;

    const upcomingBox=$('#ranchUpcoming');
    upcomingBox.innerHTML=upcoming.length
      ?upcoming.slice(0,5).map(c=>`<article><div><strong>${esc(c.title)}</strong><span>${fmt(c.starts_at)} · ${esc(c.venue)}</span></div><b>${Math.max(0,Number(c.capacity)-Number(c.sold||0))} left</b></article>`).join('')
      :'<div class="ranch-empty">No upcoming classes yet.</div>';

    const recent=$('#ranchRecent');
    const activity=state.operations?.activity||[];
    recent.innerHTML=activity.length
      ?activity.slice(0,6).map(item=>`<article><div><strong>${esc(String(item.action||'Activity').replaceAll('_',' '))}</strong><span>${esc(item.target_type||'platform')} · ${fmt(item.created_at)}</span></div></article>`).join('')
      :'<div class="ranch-empty">No recent activity yet.</div>';

    const attention=$('#ranch91Attention');
    const queue=state.operations?.queue||[];
    attention.innerHTML=queue.length
      ?queue.slice(0,8).map(item=>`<button type="button" data-jump="${esc(item.target||'bookings')}" class="ranch91-attention-item ${esc(item.type||'')}"><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></button>`).join('')
      :'<div class="ranch-empty">Nothing urgent needs attention.</div>';

    $$('#ranch91Attention [data-jump]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.jump)));
  }

  async function loadOverviewData(){
    const results=await Promise.allSettled([
      jsonFetch('/api/admin/classes',{cache:'no-store'}),
      jsonFetch('/api/admin/bookings',{cache:'no-store'}),
      jsonFetch('/api/admin/media',{cache:'no-store'}),
      jsonFetch('/api/admin/operations',{cache:'no-store'})
    ]);

    if(results[0].status==='fulfilled')state.classes=results[0].value.classes||[];
    if(results[1].status==='fulfilled')state.bookings=results[1].value;
    if(results[2].status==='fulfilled')state.media=results[2].value.files||[];
    if(results[3].status==='fulfilled')state.operations=results[3].value;

    renderOverview();
  }

  // -------------------------
  // Health
  // -------------------------
  function healthRow(title,item){
    const status=item?.status||'setup';
    const label=status==='ready'?'Ready':status==='info'?'Info':status==='error'?'Error':'Setup';
    return `<article class="ranch91-health-row ${esc(status)}"><span class="ranch91-health-dot"></span><div><strong>${esc(title)}</strong><small>${esc(item?.detail||item?.label||'No detail available.')}</small></div><b>${esc(label)}</b></article>`;
  }

  function renderHealth(){
    const box=$('#ranch91HealthSummary');
    const h=state.health||{};
    box.innerHTML=[
      healthRow('Website',h.website),
      healthRow('Database',h.database),
      healthRow('Media storage',h.media),
      healthRow('Email routing',h.email),
      healthRow('Admin protection',h.access),
      healthRow('Payments',h.payments)
    ].join('');
  }

  async function loadHealth(){
    const box=$('#ranch91HealthSummary');
    const button=$('#ranch91RunChecks');
    box.innerHTML='<div class="ranch91-loading">Checking services…</div>';
    button.disabled=true;
    button.textContent='Checking…';

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);

    try{
      state.health=await jsonFetch('/api/admin/system-health',{cache:'no-store',signal:controller.signal});
    }catch(error){
      state.health={
        website:{status:'ready',label:'This HQ page loaded successfully.'},
        database:{status:'setup',label:'Live database check unavailable.'},
        media:{status:'setup',label:'Live media check unavailable.'},
        email:{status:'info',label:'Email routing is managed in Cloudflare.'},
        access:{status:'setup',label:'Cloudflare Access is not configured yet.'},
        payments:{status:'setup',label:'SumUp sandbox is not connected yet.'}
      };
      toast(error.name==='AbortError'?'System check timed out safely.':'Some live checks were unavailable.','error');
    }finally{
      clearTimeout(timer);
      button.disabled=false;
      button.textContent='Run checks';
      renderHealth();
    }
  }

  $('#ranch91RunChecks').addEventListener('click',loadHealth);
  $('#ranch91RefreshOverview').addEventListener('click',async()=>{
    await loadOverviewData();
    toast('HQ refreshed.');
  });

  // -------------------------
  // Existing feature hooks
  // -------------------------
  async function loadCustomers(){
    const box=$('#ranchCustomers');
    if(!box)return;
    try{
      state.customers=await jsonFetch('/api/admin/customers',{cache:'no-store'});
      const q=($('#customerAdminSearch')?.value||'').trim().toLowerCase();
      const rows=(state.customers.customers||[]).filter(c=>!q||String(c.customer_name||'').toLowerCase().includes(q)||String(c.customer_email||'').toLowerCase().includes(q));
      box.innerHTML=rows.length?rows.map(c=>`<article class="hq-customer-card"><div><h3>${esc(c.customer_name)}</h3><p>${esc(c.customer_email)}</p></div><dl><div><dt>Bookings</dt><dd>${esc(c.total_bookings)}</dd></div><div><dt>Attended</dt><dd>${esc(c.attended_classes)}</dd></div><div><dt>Loyalty</dt><dd>${esc(c.loyalty_progress)} / 9</dd></div></dl></article>`).join(''):'<div class="ranch-empty">No customers found.</div>';
    }catch(error){
      box.innerHTML=`<div class="ranch-empty">${esc(error.message)}</div>`;
    }
  }

  $('#refreshCustomers')?.addEventListener('click',loadCustomers);
  $('#customerAdminSearch')?.addEventListener('input',loadCustomers);

  // Initial load
  showView('overview');
  loadOverviewData();
  loadHealth();
  loadCustomers();
})();