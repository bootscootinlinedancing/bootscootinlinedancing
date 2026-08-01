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
