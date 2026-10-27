/* v96.4.30: deterministic desktop mode + one consistent desktop header. */
if (!document.querySelector('script[src^="google-analytics.js"]')) {
  const analyticsLoader=document.createElement('script');
  analyticsLoader.src='google-analytics.js';
  analyticsLoader.defer=true;
  document.head.append(analyticsLoader);
}

const BOOT_SCOOTIN_PUBLIC_NAVIGATION = Object.freeze([
  {title:'Discover',subtitle:'Start here and explore Boot Scootin’',items:[
    ['about.html','About Boot Scootin’'],['gallery.html','Gallery'],['ask-nora.html','Contact'],
    ['dance-library.html','Dance Library'],['dance-diary.html','Dance Diary']
  ]},
  {title:'Community',subtitle:'Find your people and country events',items:[
    ['community.html','Community Hub'],['whatsapp-community.html','WhatsApp Community'],
    ['moonshine.html','Moonshine & Good Times Gang'],['long-road-handbook.html','Long Road Handbook'],
    ['country-guide-festivals.html','Festivals & Country Events']
  ]},
  {title:'Country Corner',subtitle:'Music, dancing, places and adventures',items:[
    ['country-corner.html','Nora’s Country Corner'],['country-guide.html','Nora’s Country Guide'],
    ['country-guide-music.html','Country Music'],['country-guide-line-dancing.html','UK Line Dancing'],
    ['country-guide-fashion.html','Western Fashion'],['country-guide-festivals.html','Country Festivals'],
    ['country-guide-food-drink.html','Food & Drink'],['country-guide-places.html','Places'],
    ['country-guide-inspirations.html','Inspirations'],['country-guide-adventures.html','Adventures & Summer Stomp'],
    ['country-map.html','Country Map']
  ]},
  {title:'Businesses & Partners',subtitle:'Recommendations, merchandise and partnerships',items:[
    ['businesses.html','Businesses We Love'],['businesses.html#threefives','Official Merchandise · ThreeFives'],
    ['businesses.html#recommendations','Local Recommendations'],['businesses.html#affiliate-partners','Affiliate Recommendations'],
    ['partnerships.html','Partnerships & Advertising'],['partnerships.html#sponsorship-enquiries','Sponsorship Enquiries']
  ]}
]);
window.BOOT_SCOOTIN_PUBLIC_NAVIGATION=BOOT_SCOOTIN_PUBLIC_NAVIGATION;
let memberNavigationStatusPromise;

function publicNavPath(value=''){
  try{return (new URL(value,location.href).pathname.split('/').pop()?.toLowerCase()||'index').replace(/\.html$/,'');}catch(_){return '';}
}
function publicNavActive(href){
  const page=publicNavPath(location.pathname),target=publicNavPath(href);
  return page===target;
}
function publicNavLinks(items,{desktop=false}={}){
  return items.map(([href,label])=>desktop
    ? `<a${publicNavActive(href)?' class="active" aria-current="page"':''} href="${href}">${label}</a>`
    : `<a${publicNavActive(href)?' aria-current="page"':''} href="${href}"><span>${label}</span><b aria-hidden="true">›</b></a>`
  ).join('');
}
function installMobileNavigationInventory(){
  const sections=document.querySelector('.menu45-sections');
  if(!sections||sections.dataset.sharedNavigation==='true')return;
  sections.innerHTML=BOOT_SCOOTIN_PUBLIC_NAVIGATION.map(group=>`<details class="menu45-section"><summary><span class="menu45-summary-copy"><strong>${group.title}</strong><small>${group.subtitle}</small></span><b aria-hidden="true"></b></summary><div class="menu45-submenu">${publicNavLinks(group.items)}</div></details>`).join('');
  sections.dataset.sharedNavigation='true';
}

(() => {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const isPhoneTablet = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) && !/Macintosh/i.test(ua);
  const isDesktopOS = /Mac|Win|Linux/i.test(platform) && !isPhoneTablet;
  const desktop = isDesktopOS || (!isPhoneTablet && Math.max(screen.width || 0, screen.height || 0) >= 900);
  installMobileNavigationInventory();
  if (!desktop) return;

  document.documentElement.classList.add('desktop-mode');
  const installDesktopHeader = () => {
    document.body?.classList.add('desktop-mode');

    // Use one compact desktop header everywhere. Secondary destinations live
    // in one accessible Explore menu instead of an overcrowded 11-link row.
    const header = document.querySelector('header.honky-header,header.header');
    if (header) {
      const primaryItems = [
        ['index.html','Home'],['bookings.html','Classes'],['class-pass.html','Class Pass'],
        ['private-events.html','Private Events'],['reviews.html','Reviews']
      ];
      const links = primaryItems.map(([href,label]) => `<a${publicNavActive(href)?' class="active" aria-current="page"':''} href="${href}">${label}</a>`).join('');
      const exploreActive=BOOT_SCOOTIN_PUBLIC_NAVIGATION.some(group=>group.items.some(([href])=>publicNavActive(href)));
      const exploreGroups=BOOT_SCOOTIN_PUBLIC_NAVIGATION.map(group=>`<section class="desktop-explore-group"><h2>${group.title}</h2>${publicNavLinks(group.items,{desktop:true})}</section>`).join('');
      header.className = 'honky-header unified-desktop-header';
      header.dataset.publicNavigation='true';
      header.innerHTML = `
        <a class="honky-logo brand-lockup" href="index.html" aria-label="Boot Scootin' Line Dancing home">
          <img class="public-brand-logo" src="boot-scootin-logo-approved.png" alt="">
          <img class="public-brand-wordmark" src="boot-scootin-wordmark-master.png" alt="" aria-hidden="true">
        </a>
        <nav class="honky-desktop-nav" aria-label="Main navigation">${links}<div class="desktop-explore${exploreActive?' is-current':''}"><button class="desktop-explore-toggle" type="button" aria-expanded="false" aria-controls="desktopExploreMenu">Explore <span aria-hidden="true">▼</span></button><div class="desktop-explore-menu" id="desktopExploreMenu" hidden>${exploreGroups}</div></div></nav>
        <a class="honky-account" href="member-hub.html" data-member-account-link><span aria-hidden="true">👤</span> <b data-member-account-label>My account</b></a>
        <a class="honky-book" href="bookings.html">Book a class</a>
        <button aria-controls="nav" aria-expanded="false" class="honky-menu-button" id="menuButton" type="button"><span></span><span></span><span></span><b class="sr-only">Open menu</b></button>`;
      const explore=header.querySelector('.desktop-explore');
      const toggle=header.querySelector('.desktop-explore-toggle');
      const menu=header.querySelector('.desktop-explore-menu');
      const closeExplore=({restoreFocus=false}={})=>{
        if(!toggle||!menu)return;
        toggle.setAttribute('aria-expanded','false');menu.hidden=true;explore?.classList.remove('is-open');
        if(restoreFocus)toggle.focus();
      };
      toggle?.addEventListener('click',()=>{
        const opening=toggle.getAttribute('aria-expanded')!=='true';
        toggle.setAttribute('aria-expanded',String(opening));menu.hidden=!opening;explore?.classList.toggle('is-open',opening);
        if(opening)menu.querySelector('a')?.focus();
      });
      header.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu?.hidden){event.preventDefault();closeExplore({restoreFocus:true});}});
      menu?.addEventListener('keydown',event=>{
        if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
        const links=[...menu.querySelectorAll('a')];if(!links.length)return;
        event.preventDefault();
        const current=Math.max(0,links.indexOf(document.activeElement));
        const next=event.key==='Home'?0:event.key==='End'?links.length-1:event.key==='ArrowDown'?(current+1)%links.length:(current-1+links.length)%links.length;
        links[next].focus();
      });
      document.addEventListener('click',event=>{if(!explore?.contains(event.target))closeExplore();});
      refreshMemberNavigation();
    }
  };
  installDesktopHeader();
  window.addEventListener('pageshow',()=>{
    const toggle=document.querySelector('.desktop-explore-toggle'),menu=document.querySelector('.desktop-explore-menu');
    if(toggle&&menu){toggle.setAttribute('aria-expanded','false');menu.hidden=true;toggle.closest('.desktop-explore')?.classList.remove('is-open');}
    installMobileNavigationInventory();
    memberNavigationStatusPromise=undefined;
    refreshMemberNavigation();
  });
})();

async function refreshMemberNavigation(){
  memberNavigationStatusPromise??=(async()=>{
    try{
      const response=await fetch('/api/member/me',{headers:{Accept:'application/json'},cache:'no-store'});
      if(response.ok){const result=await response.json();return result?.authenticated===true;}
    }catch(_){}
    return false;
  })();
  const authenticated=await memberNavigationStatusPromise;
  document.querySelectorAll('[data-member-account-label]').forEach(label=>{label.textContent=authenticated?'My dashboard':'My account';});
  document.querySelectorAll('[data-member-account-copy]').forEach(copy=>{copy.textContent=authenticated?'Open your Member Zone dashboard':'Sign in or create a free account';});
}

// One approved MP4 powers both Halloween placements. This review branch uses
// a static Pages asset; production can later point this at the R2 media URL.
window.BOOT_SCOOTIN_HALLOWEEN_VIDEO_URL = '/halloween-hoedown-promo-2026.mp4';

// Homepage promotions and optional mailing-list invitation.
(() => {
  const promoTrack = document.querySelector('[data-promo-track]');
  const promoPause = document.querySelector('[data-promo-pause]');
  promoPause?.addEventListener('click', () => {
    const paused = promoTrack?.classList.toggle('is-paused') || false;
    promoPause.setAttribute('aria-pressed', String(paused));
    const icon = promoPause.querySelector('[aria-hidden]');
    const label = promoPause.querySelector('.sr-only');
    if (icon) icon.textContent = paused ? '▶' : 'Ⅱ';
    if (label) label.textContent = paused ? 'Play announcements' : 'Pause announcements';
  });

  const goldenPopup = document.getElementById('goldenTicketPopup');
  const goldenReopen = document.getElementById('goldenTicketReopen');
  const goldenReopenWrap = document.getElementById('goldenTicketReopenWrap');
  const goldenStorageKey = 'bootScootinGoldenTicketHalloween2026Dismissed';
  let goldenPreviousFocus = null;
  let mailingReady = false;
  const londonDate = () => {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const goldenCampaignActive = () => londonDate() <= '2026-10-30';
  const goldenDismissed = () => { try{return localStorage.getItem(goldenStorageKey)==='1';}catch(_){return false;} };
  const closeGoldenPopup = (remember=true) => {
    if(!goldenPopup)return;
    goldenPopup.hidden=true;
    document.body.classList.remove('golden-ticket-popup-open');
    if(remember)try{localStorage.setItem(goldenStorageKey,'1');}catch(_){}
    goldenPreviousFocus?.focus?.();
    // The mailing invitation may have reached its nine-second delay while the
    // higher-priority Golden Ticket dialog was open. Resume it after Golden
    // Ticket closes instead of silently losing that one-time opportunity.
    if(mailingReady)window.setTimeout(openPopup,0);
  };
  const openGoldenPopup = (manual=false) => {
    if(!goldenPopup||!goldenCampaignActive()||(!manual&&goldenDismissed())||!goldenPopup.hidden)return;
    const mailingPopup=document.getElementById('mailingPopup');
    if(mailingPopup&&!mailingPopup.hidden){
      mailingReady=true;
      mailingPopup.hidden=true;
      document.body.classList.remove('mailing-popup-open');
    }
    goldenPreviousFocus=document.activeElement;
    goldenPopup.hidden=false;
    document.body.classList.add('golden-ticket-popup-open');
    goldenPopup.querySelector('.golden-ticket-popup-close')?.focus();
  };
  if(goldenReopenWrap)goldenReopenWrap.hidden=!goldenCampaignActive();
  goldenReopen?.addEventListener('click',()=>openGoldenPopup(true));
  goldenPopup?.querySelectorAll('[data-golden-ticket-close]').forEach(control=>control.addEventListener('click',()=>closeGoldenPopup()));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&goldenPopup&&!goldenPopup.hidden)closeGoldenPopup();});
  if(goldenPopup&&goldenCampaignActive())window.setTimeout(openGoldenPopup,2200);

  const halloweenVideoUrl=window.BOOT_SCOOTIN_HALLOWEEN_VIDEO_URL;
  const halloweenVideoFeature=document.querySelector('[data-halloween-video-feature]');
  if(halloweenVideoFeature&&halloweenVideoUrl&&goldenCampaignActive()){
    const video=halloweenVideoFeature.querySelector('video');
    const source=video?.querySelector('source');
    if(source){source.src=halloweenVideoUrl;video.load();halloweenVideoFeature.hidden=false;}
  }

  const popup = document.getElementById('mailingPopup');
  const form = document.getElementById('mailingPopupForm');
  if (!popup || !form) return;
  const storageKey = 'bootScootinMailingPopupDismissedAt';
  const dismissalDays = 14;
  let previousFocus = null;
  const recentlyDismissed = () => {
    try {
      const dismissedAt = Number(localStorage.getItem(storageKey) || 0);
      return dismissedAt > Date.now() - dismissalDays * 86400000;
    } catch (_) { return false; }
  };
  const closePopup = (remember = true) => {
    popup.hidden = true;
    document.body.classList.remove('mailing-popup-open');
    if (remember) try { localStorage.setItem(storageKey, String(Date.now())); } catch (_) {}
    previousFocus?.focus?.();
  };
  const openPopup = () => {
    if (recentlyDismissed() || !popup.hidden) return;
    if (document.body.classList.contains('golden-ticket-popup-open')) {
      mailingReady = true;
      return;
    }
    mailingReady = false;
    previousFocus = document.activeElement;
    popup.hidden = false;
    document.body.classList.add('mailing-popup-open');
    popup.querySelector('.mailing-popup-close')?.focus();
  };
  popup.querySelectorAll('[data-mailing-popup-close]').forEach(control => control.addEventListener('click', () => closePopup()));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popup.hidden) closePopup();
  });
  window.setTimeout(() => { mailingReady = true; openPopup(); }, 9000);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const status = document.getElementById('mailingPopupStatus');
    const data = new FormData(form);
    const payload = {name:String(data.get('name') || '').trim(),email:String(data.get('email') || '').trim(),consent:data.get('consent') === 'on'};
    if (!payload.name) { if (status) status.textContent = 'Please enter your first name.'; form.elements.name?.focus(); return; }
    button.disabled = true;
    if (status) status.textContent = 'Joining…';
    try {
      const response = await fetch('/api/mailing-list/subscribe', {method:'POST',headers:{'content-type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not join the mailing list.');
      if (status) status.textContent = result.promotion_code
        ? `Welcome! Your personal 10% code is ${result.promotion_code}. Keep it safe for your first regular class booking.`
        : (result.message || 'You’re on the list — welcome!');
      form.reset();
      try { localStorage.setItem(storageKey, String(Date.now())); } catch (_) {}
    } catch (error) {
      if (status) status.textContent = error.message || 'Something went wrong. Please try again.';
    } finally { button.disabled = false; }
  });
})();

// Keep public headers on the approved logo plus the established horizontal
// wordmark. Footers retain the approved primary logo without duplicating the
// header lockup.
function upgradePublicBranding(){
  if(document.body?.matches('.ranch-v91,.ranch-body,.admin-login-body'))return;
  document.querySelectorAll('header .brand-lockup,header .class-pass-brand').forEach(lockup=>{
    // Older pages still ship their original logo/text lockup in the HTML.
    // Remove those direct children before adding the approved pair so the
    // runtime upgrade cannot leave two logos or a vertically wrapped wordmark.
    lockup.querySelectorAll(':scope > .brand-logo,:scope > .class-pass-brand-logo,:scope > .wordmark').forEach(node=>node.remove());
    let logo=lockup.querySelector(':scope > .public-brand-logo,:scope > .class-pass-brand-logo');
    if(!logo){logo=document.createElement('img');lockup.prepend(logo);}
    logo.className='public-brand-logo';logo.src='boot-scootin-logo-approved.png';logo.alt='';
    // Some older pages load a legacy repair layer after styles.css. Keep the
    // approved circular art clipped at the shared branding source of truth.
    logo.style.setProperty('border-radius','50%','important');
    let wordmark=lockup.querySelector(':scope > .public-brand-wordmark');
    if(!wordmark){wordmark=document.createElement('img');lockup.append(wordmark);}
    wordmark.className='public-brand-wordmark';wordmark.src='boot-scootin-wordmark-master.png';wordmark.alt='';wordmark.setAttribute('aria-hidden','true');
  });
  document.querySelectorAll('.footer-lockup,.footer-brand-centred').forEach(lockup=>{
    lockup.querySelectorAll(':scope > .brand-logo,:scope > .footer-logo,:scope > .wordmark').forEach(node=>node.remove());
    let logo=lockup.querySelector(':scope > .public-brand-logo');
    if(!logo){logo=document.createElement('img');lockup.prepend(logo);}
    logo.className='public-brand-logo';logo.src='boot-scootin-logo-approved.png';logo.alt='Boot Scootin’ Line Dancing';
    logo.style.setProperty('border-radius','50%','important');
  });
}

document.addEventListener('DOMContentLoaded',upgradePublicBranding);



const intro = document.getElementById('intro');
const enter = document.getElementById('enterSite');
const menuButton = document.getElementById('menuButton');
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
  panel.querySelectorAll('a[href^="mailto:partnerships@bootscootinlinedancing.co.uk"]').forEach(link => {
    link.href='partnerships.html';
    const label=link.querySelector('span');
    if(label) label.textContent='Partnerships & Advertising';
  });
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
  render('My Boot Scootin’',[
    ['member-hub.html#class-passes','Class Passes',false],
    ['my-bookings.html','My Bookings',false],
    ['rewards.html','My Rewards',false],
    ['reviews.html','Reviews &amp; Feedback',false]
  ]);
  render('Shop & Rewards',[
    ['community.html#merchandise','Official Merchandise',true],
    ['rewards.html','Boot Scootin’ Rewards',true],
    ['passport.html#trail-rewards','Trail & Rewards',false]
  ]);

  // Class Pass is a primary customer journey, not a hidden account feature.
  // Keep it directly after the existing Classes & Bookings destination on
  // every public menu without duplicating the page-specific menu markup.
  const classesLink=panel.querySelector(':scope > .menu45-first');
  if(classesLink && !panel.querySelector(':scope > .menu45-class-pass')){
    const passLink=document.createElement('a');
    passLink.className='menu45-first menu45-class-pass';
    passLink.href='class-pass.html';
    passLink.innerHTML='<span><small>Dance more, save more</small><strong>Class Pass</strong><em>Buy credits once and use them on eligible classes</em></span><b aria-hidden="true">›</b>';
    classesLink.insertAdjacentElement('afterend',passLink);
  }

  // Reviews are a public destination, so keep them visible at the first
  // Explore level as well as in the account/community links below.
  const classPassLink=panel.querySelector(':scope > .menu45-class-pass');
  if(classPassLink && !panel.querySelector(':scope > .menu45-reviews')){
    const reviewsLink=document.createElement('a');
    reviewsLink.className='menu45-first menu45-reviews';
    reviewsLink.href='reviews.html';
    reviewsLink.innerHTML='<span><small>Real words from the dance floor</small><strong>Reviews</strong><em>Read verified dancer feedback</em></span><b aria-hidden="true">›</b>';
    classPassLink.insertAdjacentElement('afterend',reviewsLink);
  }
  const reviewsLink=panel.querySelector(':scope > .menu45-reviews');
  if(reviewsLink&&!panel.querySelector(':scope > .menu45-account')){
    const accountLink=document.createElement('a');
    accountLink.className='menu45-first menu45-account';
    accountLink.href='member-hub.html';
    accountLink.dataset.memberAccountLink='';
    accountLink.innerHTML='<span><small>Your Boot Scootin’ account</small><strong data-member-account-label>My Account</strong><em data-member-account-copy>Sign in or create a free account</em></span><b aria-hidden="true">›</b>';
    reviewsLink.insertAdjacentElement('afterend',accountLink);
  }
  refreshMemberNavigation();
}

document.addEventListener('DOMContentLoaded',repairPersistentExploreLinks);

// VERSION 81 — ONE STABLE MENU CONTROLLER
const navClose = document.getElementById('navClose');
let menuScrollY = 0;

function setMenuOpen(open, {restoreFocus=true, restoreScroll=true}={}) {
  if (!nav) return;
  const wasOpen = nav.classList.contains('open') || document.body.classList.contains('menu-open');

  if (open && !wasOpen) menuScrollY = window.scrollY || document.documentElement.scrollTop || 0;

  nav.classList.toggle('open', open);
  nav.setAttribute('aria-hidden', String(!open));
  menuButton?.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
  document.documentElement.classList.remove('menu-open');

  if (open) {
    repairPersistentExploreLinks();
    nav.scrollTop = 0;
    requestAnimationFrame(() => navClose?.focus({preventScroll:true}));
  } else {
    // Reset the separate mobile drill-down controller on every close. Safari
    // can otherwise restore a hidden root view and stale cloned links.
    window.dispatchEvent(new Event('explore:reset'));
    nav.querySelectorAll('details.menu45-section[open]').forEach(section => {
      section.open = false;
    });
    if (restoreScroll && wasOpen) window.scrollTo({top:menuScrollY,left:0,behavior:'instant'});
    if (restoreFocus) requestAnimationFrame(() => menuButton?.focus({preventScroll:true}));
  }
}

function resetMenuAfterNavigation(){
  repairPersistentExploreLinks();
  setMenuOpen(false,{restoreFocus:false,restoreScroll:true});
}

// iOS Safari can preserve the fixed menu and scroll-lock classes in its
// back-forward cache. Use the same complete close path before caching and
// after restoring instead of clearing only part of the menu state.
window.addEventListener('pagehide', () => setMenuOpen(false,{restoreFocus:false,restoreScroll:true}));
window.addEventListener('pageshow', resetMenuAfterNavigation);

if (nav) {
  // A single click handler works for touch, mouse and keyboard.
  menuButton?.addEventListener('click', event => {
    event.preventDefault();
    setMenuOpen(!nav.classList.contains('open'));
  });

  navClose?.addEventListener('click', event => {
    event.preventDefault();
    setMenuOpen(false);
  });

  nav.addEventListener('click', event => {
    // Delegate link closing so links added by repairPersistentExploreLinks are
    // covered too (notably Class Pass on mobile Safari).
    if (event.target.closest('a[href]')) setMenuOpen(false,{restoreFocus:false});
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
      if (!payload.name) { if (status) status.textContent = 'Please enter your first name.'; form.elements.name?.focus(); return; }
      if (!payload.email || !payload.consent) return;
      button.disabled = true;
      if (status) status.textContent = 'Joining…';
      try {
        const response = await fetch('/api/mailing-list/subscribe', {
          method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not join the mailing list.');
        if (status) status.textContent = result.promotion_code
          ? `You’re on the list! Your personal 10% code is ${result.promotion_code}.`
          : (result.message || 'You’re on the list — welcome to the Boot Scootin’ Round-Up!');
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

  repairPersistentExploreLinks();

  const first = panel.querySelector('.menu45-first');
  const sectionsWrap = panel.querySelector('.menu45-sections');
  const home = panel.querySelector('.menu45-home');
  const footerBrand = panel.querySelector('.menu45-footer-brand');
  // Safari can restore the exact mutated DOM from its back-forward cache.
  // Keep an immutable copy of the root sections and rebuild from it whenever
  // Explore is closed/restored rather than trusting those restored nodes.
  const cleanSectionsMarkup = sectionsWrap?.innerHTML || '';

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
    if (sectionsWrap && cleanSectionsMarkup) sectionsWrap.innerHTML = cleanSectionsMarkup;
    first?.removeAttribute('hidden');
    sectionsWrap?.removeAttribute('hidden');
    home?.removeAttribute('hidden');
    footerBrand?.removeAttribute('hidden');
    panel.querySelectorAll('.menu45-section').forEach(s => { s.open = false; s.classList.remove('menu58-active','menu46-active'); });
    panel.classList.remove('menu58-drilldown','menu46-drilldown','submenu-active','menu61-active');
    scrollMenuTop();
  }

  function showSection(section){
    repairPersistentExploreLinks();
    const summary = section.querySelector(':scope > summary');
    const title = summary?.querySelector('strong')?.textContent?.trim() || 'Explore';
    const subtitle = summary?.querySelector('small')?.textContent?.trim() || '';
    const submenu = section.querySelector(':scope > .menu45-submenu');
    const links = submenu ? [...submenu.querySelectorAll(':scope > a')].map(link => ({
      href: link.getAttribute('href') || '#',
      label: link.querySelector('span')?.textContent?.trim() || link.textContent.replace(/›/g,'').trim(),
      current: link.getAttribute('aria-current')
    })) : [];

    drill.innerHTML = `
      <div class="menu61-section-head">
        <button type="button" class="menu61-back" aria-label="Back to Explore sections">‹</button>
        <div class="menu61-section-copy"><strong>${title}</strong>${subtitle ? `<small>${subtitle}</small>` : ''}</div>
      </div>
      <div class="menu61-links"></div>
      <button type="button" class="menu61-back-text">← Back to Explore sections</button>`;

    const target = drill.querySelector('.menu61-links');
    links.forEach(item => {
      const link = document.createElement('a');
      link.href = item.href;
      if (item.current) link.setAttribute('aria-current', item.current);
      const label = document.createElement('span');
      label.textContent = item.label;
      const arrow = document.createElement('b');
      arrow.setAttribute('aria-hidden','true');
      arrow.textContent = '›';
      link.append(label, arrow);
      link.addEventListener('click', () => setMenuOpen(false));
      target.appendChild(link);
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

  // Delegate from the persistent panel so Safari bfcache restores and menu
  // repairs cannot leave stale summary-node listeners behind.
  panel.addEventListener('click', event => {
    if (!window.matchMedia('(max-width:950px)').matches) return;
    const summary = event.target.closest('summary');
    const section = summary?.closest('.menu45-section');
    if (!section || !panel.contains(section)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showSection(section);
  }, true);

  document.getElementById('navClose')?.addEventListener('click', showRoot, true);
  window.addEventListener('explore:reset', showRoot);
})();;
