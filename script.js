

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
  window.setTimeout(finishIntro, 900);
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

// VERSION 81 — ONE STABLE MENU CONTROLLER
const navClose = document.getElementById('navClose');

function setMenuOpen(open) {
  if (!nav || !menuButton) return;

  nav.classList.toggle('open', open);
  nav.setAttribute('aria-hidden', String(!open));
  menuButton.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);

  if (open) {
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



// VERSION 96.1 — CONTAINED DRILL-DOWN MENU
(() => {
  const overlay = document.getElementById('nav');
  const sections = [...document.querySelectorAll('#menu45 details.menu45-section')];
  if (!overlay || !sections.length) return;

  sections.forEach(section => {
    section.addEventListener('toggle', () => {
      const panel = document.getElementById('menu45');
      if (section.open) {
        sections.forEach(other => { if (other !== section) other.open = false; });
        panel?.classList.add('submenu-active');
        requestAnimationFrame(() => {
          overlay.scrollTop = 0;
          section.querySelector(':scope > summary')?.focus?.({preventScroll:true});
        });
      } else if (!sections.some(item => item.open)) {
        panel?.classList.remove('submenu-active');
        overlay.scrollTop = 0;
      }
    });
  });

  // Safari back/forward cache can preserve a stale open overlay.
  window.addEventListener('pageshow', () => {
    setMenuOpen(false);
  });
})();
