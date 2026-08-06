

const intro = document.getElementById('intro');
const enter = document.getElementById('enterSite');
const menuButton = document.getElementById('menuButton');
const nav = document.getElementById('nav');

function finishIntro(){
  if (!intro) return;
  intro.classList.add('hide');
  document.body.classList.remove('intro-open');
  try {
    sessionStorage.setItem('bootIntroSeen','1');
  } catch (_) {}
}

function enterWebsite(event){
  if (!intro || intro.classList.contains('hide') || intro.dataset.entering === '1') return;

  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  intro.dataset.entering = '1';
  intro.classList.add('stomping');

  if ('vibrate' in navigator) {
    try { navigator.vibrate([28, 24, 60]); } catch (_) {}
  }

  // Let the stomp register, but do not make visitors wait or tap twice.
  window.setTimeout(finishIntro, 520);
}

// The intro only exists on the homepage.
if (intro) {
  let alreadySeen = false;
  try {
    alreadySeen = sessionStorage.getItem('bootIntroSeen') === '1';
  } catch (_) {}

  if (alreadySeen) {
    intro.classList.add('hide');
    document.body.classList.remove('intro-open');
  } else {
    // The designed Enter area remains a real button.
    enter?.addEventListener('click', enterWebsite, { passive:false });

    // Tapping anywhere on the opening poster also enters reliably.
    intro.addEventListener('click', enterWebsite, { passive:false });

    // Pointer events make entry respond immediately on iPhone.
    intro.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        enterWebsite(event);
      }
    }, { passive:false });

    // Keyboard accessibility.
    intro.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') enterWebsite(event);
    });
  }
}

// Reveal sections on every page.
const revealElements = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  revealElements.forEach(el => observer.observe(el));
} else {
  revealElements.forEach(el => el.classList.add('visible'));
}


// VERSION 20 — HOME SCREEN APP INSTALLATION
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // The website remains fully usable if service-worker registration is unavailable.
    });
  });
}

let deferredInstallPrompt = null;

const installApp = document.getElementById("installApp");
const installAppButton = document.getElementById("installAppButton");
const installAppClose = document.getElementById("installAppClose");
const installGuide = document.getElementById("installGuide");
const installGuideSteps = document.getElementById("installGuideSteps");
const installGuideClose = document.getElementById("installGuideClose");
const installGuideDone = document.getElementById("installGuideDone");

const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid = /android/i.test(navigator.userAgent);
const installDismissed = localStorage.getItem("bootInstallDismissed") === "1";

function showInstallBar() {
  if (!installApp || isStandalone || installDismissed) return;
  installApp.hidden = false;
}

function hideInstallBar(saveDismissal = false) {
  if (installApp) installApp.hidden = true;
  if (saveDismissal) localStorage.setItem("bootInstallDismissed", "1");
}

function openInstallGuide() {
  if (!installGuide || !installGuideSteps) return;

  if (isIOS) {
    installGuideSteps.innerHTML = `
      <li>Open this website in <strong>Safari</strong>.</li>
      <li>Tap the <strong>Share</strong> button.</li>
      <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
      <li>Choose <strong>Open as Web App</strong>, then tap <strong>Add</strong>.</li>
    `;
  } else if (isAndroid) {
    installGuideSteps.innerHTML = `
      <li>Open the browser menu using the <strong>three dots</strong>.</li>
      <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
      <li>Confirm by tapping <strong>Install</strong>.</li>
    `;
  } else {
    installGuideSteps.innerHTML = `
      <li>Open your browser menu.</li>
      <li>Choose <strong>Install Boot Scootin’</strong> or <strong>Add to Home Screen</strong>.</li>
      <li>Confirm the installation.</li>
    `;
  }

  installGuide.hidden = false;
  document.body.classList.add("install-guide-open");
}

function closeInstallGuide() {
  if (installGuide) installGuide.hidden = true;
  document.body.classList.remove("install-guide-open");
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  window.setTimeout(showInstallBar, 1200);
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  hideInstallBar();
  closeInstallGuide();
  localStorage.setItem("bootInstallDismissed", "1");
});

if (!isStandalone && !installDismissed) {
  // iPhones do not expose beforeinstallprompt, so show our simple Safari guide.
  window.setTimeout(showInstallBar, 2600);
}

installAppButton?.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hideInstallBar();
  } else {
    openInstallGuide();
  }
});

installAppClose?.addEventListener("click", () => hideInstallBar(true));
installGuideClose?.addEventListener("click", closeInstallGuide);
installGuideDone?.addEventListener("click", closeInstallGuide);

installGuide?.addEventListener("click", event => {
  if (event.target === installGuide) closeInstallGuide();
});





// v98.2.0 — single mobile navigation controller (prevents stale policy/footer overlays)
(() => {
  const nav = document.getElementById('nav');
  const openButton = document.getElementById('menuButton');
  const closeButton = document.getElementById('navClose');
  if (!nav || !openButton) return;
  const sections = [...nav.querySelectorAll('details.menu45-section')];
  const close = (restoreFocus=false) => {
    nav.classList.remove('open'); nav.setAttribute('aria-hidden','true');
    openButton.setAttribute('aria-expanded','false'); document.body.classList.remove('menu-open','nav-open');
    sections.forEach(s => s.open=false);
    if (restoreFocus) openButton.focus({preventScroll:true});
  };
  const open = () => {
    nav.classList.add('open'); nav.setAttribute('aria-hidden','false');
    openButton.setAttribute('aria-expanded','true'); document.body.classList.add('menu-open');
    nav.scrollTop=0; setTimeout(()=>closeButton?.focus({preventScroll:true}),20);
  };
  openButton.onclick=(e)=>{e.preventDefault(); nav.classList.contains('open')?close(true):open();};
  if(closeButton) closeButton.onclick=(e)=>{e.preventDefault();close(true);};
  nav.addEventListener('click',e=>{if(e.target===nav)close(false);});
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>close(false)));
  sections.forEach(s=>s.addEventListener('toggle',()=>{if(s.open)sections.forEach(o=>{if(o!==s)o.open=false;});}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close(true);});
  window.addEventListener('pageshow',()=>close(false));
  window.addEventListener('hashchange',()=>close(false));
})();

// v98.2.0 — genuine newsletter signup with welcome-email status
(() => {
  const form=document.getElementById('newsletterForm'); const status=document.getElementById('newsletterStatus');
  if(!form||!status)return;
  form.addEventListener('submit',async e=>{
    e.preventDefault(); const email=String(new FormData(form).get('email')||'').trim(); const button=form.querySelector('button');
    form.classList.remove('is-success','is-error');
    if(!/^\S+@\S+\.\S+$/.test(email)){form.classList.add('is-error');status.textContent='Please enter a valid email address.';return;}
    button.disabled=true; status.textContent='Joining the Boot Scootin’ family…';
    try{const r=await fetch('/api/newsletter/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,source:'website-footer'})}); const d=await r.json(); if(!r.ok)throw new Error(d.error||'Unable to subscribe right now.'); form.classList.add('is-success'); status.textContent=d.alreadySubscribed?'You’re already on the list — see y’all soon!':(d.welcomeEmailSent?'You’re in! Check your inbox for your welcome email.':'You’re subscribed. Your welcome email may take a few minutes.'); form.reset();}catch(err){form.classList.add('is-error');status.textContent=err.message||'Unable to subscribe right now.';}finally{button.disabled=false;}
  });
})();

// Force old cached service workers to refresh this release immediately.
if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.update())).catch(()=>{});}
