const intro = document.getElementById('intro');
const enter = document.getElementById('enterSite');
const menuButton = document.getElementById('menuButton');
const nav = document.getElementById('nav');

function finishIntro(){
  intro.classList.add('hide');
  document.body.classList.remove('intro-open');
  sessionStorage.setItem('bootIntroSeen','1');
}

function markReady(){
  intro.classList.add('ready');
}

if(sessionStorage.getItem('bootIntroSeen') === '1'){
  intro.classList.add('hide');
  document.body.classList.remove('intro-open');
} else {
  window.setTimeout(markReady, 4200);
}

enter.addEventListener('click', () => {
  if(intro.classList.contains('stomping')) return;
  intro.classList.remove('ready');
  intro.classList.add('stomping');
  window.setTimeout(finishIntro, 620);
});

menuButton.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});

nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded','false');
}));

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if(entry.isIntersecting) entry.target.classList.add('visible');
  });
},{threshold:.12});

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
