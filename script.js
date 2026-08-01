const body = document.body;
const intro = document.getElementById("intro");
const enterSite = document.getElementById("enterSite");
const menuToggle = document.getElementById("menuToggle");
const siteNav = document.getElementById("siteNav");
const musicButton = document.getElementById("musicButton");

body.classList.add("intro-open");

function closeIntro() {
  intro.classList.add("hidden");
  body.classList.remove("intro-open");
  sessionStorage.setItem("bootIntroSeen", "1");
}

if (sessionStorage.getItem("bootIntroSeen") === "1") {
  intro.classList.add("hidden");
  body.classList.remove("intro-open");
}

enterSite.addEventListener("click", closeIntro);

// Allow the intro to be skipped after the logo appears.
setTimeout(() => {
  intro.addEventListener("click", (event) => {
    if (event.target === intro) closeIntro();
  });
}, 4500);

menuToggle.addEventListener("click", () => {
  const isOpen = siteNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

siteNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    siteNav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

/*
  Music is intentionally not bundled yet.
  Browsers require a user click before audio can play.
  When you choose a licensed/royalty-free audio file, place it in /assets
  and update the source below.
*/
let audio;
musicButton.addEventListener("click", () => {
  if (!audio) {
    audio = new Audio("assets/website-ambience.mp3");
    audio.loop = true;
    audio.volume = 0.35;
  }

  if (audio.paused) {
    audio.play()
      .then(() => {
        musicButton.setAttribute("aria-pressed", "true");
        musicButton.querySelector("strong").textContent = "Turn music off";
      })
      .catch(() => {
        alert("The music file will be added before launch.");
      });
  } else {
    audio.pause();
    musicButton.setAttribute("aria-pressed", "false");
    musicButton.querySelector("strong").textContent = "Turn music on";
  }
});
