/* v96.4.30: deterministic desktop mode + one consistent desktop header. */
(() => {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const isPhoneTablet = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) && !/Macintosh/i.test(ua);
  const isDesktopOS = /Mac|Win|Linux/i.test(platform) && !isPhoneTablet;
  const desktop = isDesktopOS || (!isPhoneTablet && Math.max(screen.width || 0, screen.height || 0) >= 900);
  if (!desktop) return;

  document.documentElement.classList.add('desktop-mode');
  document.addEventListener('DOMContentLoaded', () => {
    document.body?.classList.add('desktop-mode');

    // Every desktop page now uses the same compact navigation style as the homepage.
    const legacyHeader = document.querySelector('header.header:not(.honky-header)');
    if (legacyHeader) {
      const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
      const navItems = [
        ['index.html','Home'],['about.html','About'],['bookings.html','Classes'],
        ['private-events.html','Private Events'],['gallery.html','Gallery'],['ask-nora.html','Contact']
      ];
      const links = navItems.map(([href,label]) => {
        const active = page === href || (href === 'index.html' && (page === '' || page === '/'));
        return `<a${active ? ' class="active"' : ''} href="${href}">${label}</a>`;
      }).join('');
      legacyHeader.className = 'honky-header unified-desktop-header';
      legacyHeader.innerHTML = `
        <a class="honky-logo brand-lockup" href="index.html" aria-label="Boot Scootin' Line Dancing home">
          <img src="brand-logo-transparent.png" alt=""><span class="brand-lockup-copy"><strong>BOOT SCOOTIN’</strong><b>LINE DANCING</b><small>EST. 2025</small></span>
        </a>
        <nav class="honky-desktop-nav" aria-label="Main navigation">${links}</nav>
        <a class="honky-book" href="bookings.html">Book a class</a>`;
    }
  }, {once:true});
})();



const intro = document.getElementById('intro');
const enter = document.getElementById('enterSite');
const menuButton = document.getElementById('menuButton');
const desktopExploreButton = document.getElementById('desktopExploreButton');
const nav = document.getElementById('nav');

function finishIntro(){
  if (!intro) return;
  window.scrollTo({top:0,left:0,behavior:'instant'});
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
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
  window.scrollTo({top:0,left:0,behavior:'instant'});
  window.setTimeout(() => { finishIntro(); requestAnimationFrame(() => window.scrollTo(0,0)); }, 900);
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



// v96.4.60 — canonical persistent submenu repair.
// Rebuild the two affected submenus from a fixed source of truth whenever
// Explore opens or a drill-down is entered. This prevents Safari/history
// restoration or older menu scripts from dropping the first menu rows.
function repairPersistentExploreLinks(){
  const panel=document.getElementById('menu45');
  if(!panel) return;
  const findSection=(label)=>[...panel.querySelectorAll('details.menu45-section')].find(section =>
    section.querySelector(':scope > summary strong')?.textContent.trim()===label
  );
  const render=(label,items)=>{
    const section=findSection(label);
    const submenu=section?.querySelector(':scope > .menu45-submenu');
    if(!submenu) return;
    submenu.innerHTML=items.map(([href,text,pinned]) =>
      `<a${pinned?' class="menu-pinned-link"':''} href="${href}"><span>${text}</span><b aria-hidden="true">›</b></a>`
    ).join('');
  };
  render('Community',[
    ['moonshine.html','Moonshine &amp; Good Times Gang',true],
    ['community.html','Boot Scootin’ Community',true],
    ['long-road-handbook.html','Long Road Handbook',false],
    ['businesses.html#backroad-boots','Backroad Boots UK',false],
    ['country-guide-festivals.html','Festivals &amp; Country Events',false]
  ]);
  render('Shop & Rewards',[
    ['community.html#merchandise','Official Merchandise',true],
    ['rewards.html','Boot Scootin’ Rewards',true],
    ['passport.html#trail-rewards','Trail Rewards Preview',false]
  ]);
}

document.addEventListener('DOMContentLoaded',repairPersistentExploreLinks);
window.addEventListener('pageshow',repairPersistentExploreLinks);

// VERSION 81 — ONE STABLE MENU CONTROLLER
const navClose = document.getElementById('navClose');

function setMenuOpen(open) {
  if (!nav || !menuButton) return;

  nav.classList.toggle('open', open);
  nav.setAttribute('aria-hidden', String(!open));
  menuButton.setAttribute('aria-expanded', String(open));
  desktopExploreButton?.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);

  if (open) {
    repairPersistentExploreLinks();
    nav.scrollTop = 0;
    requestAnimationFrame(() => navClose?.focus({preventScroll:true}));
  } else {
    nav.querySelectorAll('details.menu45-section[open]').forEach(section => {
      section.open = false;
    });
    requestAnimationFrame(() => menuButton.focus({preventScroll:true}));
  }
}

if (menuButton && nav) {
  // A single click handler works for touch, mouse and keyboard.
  menuButton.addEventListener('click', event => {
    event.preventDefault();
    setMenuOpen(!nav.classList.contains('open'));
  });

  desktopExploreButton?.addEventListener('click', event => {
    event.preventDefault();
    setMenuOpen(!nav.classList.contains('open'));
  });

  navClose?.addEventListener('click', event => {
    event.preventDefault();
    setMenuOpen(false);
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setMenuOpen(false));
  });

  nav.addEventListener('click', event => {
    if (event.target === nav) setMenuOpen(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      setMenuOpen(false);
    }
  });
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



// v96.4.57 — persistent menu self-repair and homepage mailing list
(() => {
  const panel = document.getElementById('menu45');
  if (panel) {
    const findSection = label => [...panel.querySelectorAll('details.menu45-section')].find(d =>
      d.querySelector(':scope > summary strong')?.textContent.trim() === label
    );
    const ensureFirstLink = (section, href, label) => {
      const submenu = section?.querySelector(':scope > .menu45-submenu');
      if (!submenu) return;
      let a = [...submenu.querySelectorAll(':scope > a')].find(link =>
        link.getAttribute('href') === href || link.textContent.trim() === label
      );
      if (!a) {
        a = document.createElement('a');
        a.href = href;
        a.innerHTML = `<span>${label}</span><b aria-hidden="true">›</b>`;
      }
      submenu.prepend(a);
      a.hidden = false;
      a.removeAttribute('aria-hidden');
      a.style.removeProperty('display');
    };
    ensureFirstLink(findSection('Community'), 'community.html', 'Boot Scootin’ Community');
    ensureFirstLink(findSection('Community'), 'moonshine.html', 'Moonshine & Good Times Gang');
    ensureFirstLink(findSection('Shop & Rewards'), 'rewards.html', 'Boot Scootin’ Rewards');
    ensureFirstLink(findSection('Shop & Rewards'), 'community.html#merchandise', 'Official Merchandise');
  }

  const form = document.getElementById('homeMailingPreview');
  if (form && !form.dataset.bound) {
    form.dataset.bound = 'true';
    const status = document.getElementById('homeMailingStatus');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const data = new FormData(form);
      const payload = {
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim(),
        consent: data.get('consent') === 'on'
      };
      if (!payload.email || !payload.consent) return;
      button.disabled = true;
      if (status) status.textContent = 'Joining…';
      try {
        const response = await fetch('/api/mailing-list/subscribe', {
          method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not join the mailing list.');
        if (status) status.textContent = result.message || 'You’re on the list — welcome to the Boot Scootin’ Round-Up!';
        form.reset();
      } catch (error) {
        if (status) status.textContent = error.message || 'Something went wrong. Please try again.';
      } finally {
        button.disabled = false;
      }
    });
  }
})();






// v96.4.61 — isolated mobile Explore drill-down.
// Do not reuse the <details> layout for an opened submenu on phones: older
// theme rules and Safari history restoration could clip the first rows.
// Instead render the selected submenu into its own clean view.
(() => {
  const overlay = document.getElementById('nav');
  const panel = document.getElementById('menu45');
  if (!overlay || !panel) return;

  const sections = [...panel.querySelectorAll('.menu45-section')];
  const first = panel.querySelector('.menu45-first');
  const sectionsWrap = panel.querySelector('.menu45-sections');
  const home = panel.querySelector('.menu45-home');
  const footerBrand = panel.querySelector('.menu45-footer-brand');

  let drill = panel.querySelector('.menu61-drilldown-view');
  if (!drill) {
    drill = document.createElement('section');
    drill.className = 'menu61-drilldown-view';
    drill.hidden = true;
    const head = panel.querySelector('.menu45-head');
    head?.insertAdjacentElement('afterend', drill);
  }

  function scrollMenuTop(){
    overlay.style.scrollBehavior = 'auto';
    overlay.scrollTop = 0;
    panel.scrollTop = 0;
    requestAnimationFrame(() => {
      overlay.scrollTop = 0;
      panel.scrollTop = 0;
      requestAnimationFrame(() => { overlay.scrollTop = 0; panel.scrollTop = 0; });
    });
  }

  function showRoot(){
    drill.hidden = true;
    drill.innerHTML = '';
    first?.removeAttribute('hidden');
    sectionsWrap?.removeAttribute('hidden');
    home?.removeAttribute('hidden');
    footerBrand?.removeAttribute('hidden');
    sections.forEach(s => { s.open = false; s.classList.remove('menu58-active','menu46-active'); });
    panel.classList.remove('menu58-drilldown','menu46-drilldown','submenu-active','menu61-active');
    scrollMenuTop();
  }

  function showSection(section){
    repairPersistentExploreLinks();
    const summary = section.querySelector(':scope > summary');
    const title = summary?.querySelector('strong')?.textContent?.trim() || 'Explore';
    const subtitle = summary?.querySelector('small')?.textContent?.trim() || '';
    const submenu = section.querySelector(':scope > .menu45-submenu');
    const links = submenu ? [...submenu.querySelectorAll(':scope > a')] : [];

    drill.innerHTML = `
      <div class="menu61-section-head">
        <button type="button" class="menu61-back" aria-label="Back to Explore sections">‹</button>
        <div class="menu61-section-copy"><strong>${title}</strong>${subtitle ? `<small>${subtitle}</small>` : ''}</div>
      </div>
      <div class="menu61-links"></div>
      <button type="button" class="menu61-back-text">← Back to Explore sections</button>`;

    const target = drill.querySelector('.menu61-links');
    links.forEach(link => {
      const clone = link.cloneNode(true);
      clone.removeAttribute('style');
      clone.classList.remove('menu-pinned-link');
      clone.addEventListener('click', () => setMenuOpen(false));
      target.appendChild(clone);
    });

    first?.setAttribute('hidden','');
    sectionsWrap?.setAttribute('hidden','');
    home?.setAttribute('hidden','');
    footerBrand?.setAttribute('hidden','');
    drill.hidden = false;
    panel.classList.add('menu61-active');
    panel.classList.remove('menu58-drilldown','menu46-drilldown','submenu-active');
    drill.querySelector('.menu61-back')?.addEventListener('click', showRoot);
    drill.querySelector('.menu61-back-text')?.addEventListener('click', showRoot);
    scrollMenuTop();
  }

  sections.forEach(section => {
    section.querySelector(':scope > summary')?.addEventListener('click', event => {
      if (!window.matchMedia('(max-width:950px)').matches) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showSection(section);
    }, true);
  });

  document.getElementById('navClose')?.addEventListener('click', showRoot, true);
  window.addEventListener('pageshow', showRoot);
})();;
