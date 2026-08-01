const intro = document.getElementById('intro');
const enter = document.getElementById('enterSite');
const menuButton = document.getElementById('menuButton');
const nav = document.getElementById('nav');

function closeIntro(){
  intro.classList.add('hide');
  document.body.classList.remove('intro-open');
  sessionStorage.setItem('bootIntroSeen','1');
}

if(sessionStorage.getItem('bootIntroSeen') === '1'){
  intro.classList.add('hide');
  document.body.classList.remove('intro-open');
}

enter.addEventListener('click', closeIntro);

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
