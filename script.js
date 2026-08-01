const intro = document.getElementById('intro');
const enter = document.getElementById('enterSite');
const menuButton = document.getElementById('menuButton');
const nav = document.getElementById('nav');

function finishIntro(){
  if (!intro) return;
  intro.classList.add('hide');
  document.body.classList.remove('intro-open');
  sessionStorage.setItem('bootIntroSeen','1');
}

// The intro only exists on the homepage.
if (intro && enter) {
  if (sessionStorage.getItem('bootIntroSeen') === '1') {
    intro.classList.add('hide');
    document.body.classList.remove('intro-open');
  }

  enter.addEventListener('click', () => {
    if (intro.classList.contains('stomping')) return;

    intro.classList.add('stomping');

    if ('vibrate' in navigator) {
      navigator.vibrate([35, 35, 85]);
    }

    window.setTimeout(finishIntro, 920);
  });
}

// Menu works on every page.
if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      menuButton.setAttribute('aria-expanded','false');
    });
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
