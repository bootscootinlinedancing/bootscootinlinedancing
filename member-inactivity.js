(async()=>{
  try{const r=await fetch('/api/member/me',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;}catch(_){return;}
  const LIMIT=15*60*1000;
  const WARNING_AT=13*60*1000;
  let last=Date.now(), warning=null, tick=null;
  const activity=()=>{ last=Date.now(); closeWarning(); };
  function closeWarning(){ if(warning){warning.remove();warning=null;} }
  async function logout(reason='inactive'){
    try{await fetch('/api/member/logout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});}catch(_){ }
    const u=new URL('/member-hub.html',location.origin); u.searchParams.set('logged_out',reason); location.replace(u.toString());
  }
  function showWarning(){
    if(warning)return;
    warning=document.createElement('div'); warning.setAttribute('role','dialog'); warning.setAttribute('aria-modal','true');
    warning.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:24px';
    warning.innerHTML='<div style="max-width:460px;background:#160b0c;border:1px solid #a82c34;padding:28px;color:#f7eee4;font-family:Arial,sans-serif;box-shadow:0 18px 70px #000"><h2 style="margin:0 0 12px;font-family:Georgia,serif;font-size:30px">Still there?</h2><p style="font-size:17px;line-height:1.55">For your security, you’ll be logged out after 15 minutes of inactivity.</p><div style="display:flex;gap:12px;flex-wrap:wrap"><button data-stay style="padding:13px 18px;background:#b32630;color:white;border:1px solid #ef4a55;font-weight:800">STAY LOGGED IN</button><button data-out style="padding:13px 18px;background:#080606;color:white;border:1px solid #744;font-weight:800">LOG OUT</button></div></div>';
    document.body.appendChild(warning);
    warning.querySelector('[data-stay]').onclick=activity;
    warning.querySelector('[data-out]').onclick=()=>logout('manual');
  }
  ['pointerdown','keydown','touchstart','scroll'].forEach(e=>addEventListener(e,activity,{passive:true}));
  addEventListener('visibilitychange',()=>{ if(!document.hidden && Date.now()-last>=LIMIT) logout(); });
  tick=setInterval(()=>{const idle=Date.now()-last;if(idle>=LIMIT){clearInterval(tick);logout();}else if(idle>=WARNING_AT)showWarning();},5000);
})();
