// Hamburger nav toggle
(function () {
  var nav = document.getElementById('nav');
  var toggle = document.querySelector('.nav-toggle');
  if (!nav || !toggle) return;
  toggle.addEventListener('click', function () {
    var isOpen = nav.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', function () {
      nav.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
    });
  });
})();

// Hero parallax exit
(function () {
  var heroEl = document.querySelector('.hero');
  var heroInner = document.querySelector('.hero-inner');
  if (!heroEl || !heroInner) return;
  window.addEventListener('scroll', function () {
    var h = heroEl.offsetHeight;
    var progress = Math.min(1, window.scrollY / h);
    heroInner.style.transform = 'translateY(' + (-progress * 70) + 'px)';
    heroInner.style.opacity = String(1 - progress * 1.4);
  }, { passive: true });
})();

// Background GIF cycling
(function () {
  var gifs = ['Images/Idle.gif', 'Images/Wiring.gif', 'Images/Curl.gif'];
  var img = document.getElementById('bg-gif');
  if (!img) return;
  var current = 0;
  setInterval(function () {
    img.style.opacity = '0';
    setTimeout(function () {
      current = (current + 1) % gifs.length;
      img.src = gifs[current];
      img.style.opacity = '0.35';
    }, 400);
  }, 8000);
})();

// Pixel character speech bubble
(function () {
  var messages = [
    "hey, click something!",
    "nice to meet you \uD83D\uDC4B",
    "let's build something cool",
    "you scrolled all the way down?",
    "hire me for co-op maybe?",
    "I also make cool 3D prints",
    "currently tinkering with AI",
    "this site was fun to build"
  ];

  var wrap = document.querySelector('.contact-pixel-wrap');
  var textEl = document.querySelector('.pixel-bubble-text');
  if (!wrap || !textEl) return;

  // Pre-populate so the bubble has a size before first hover
  textEl.textContent = messages[Math.floor(Math.random() * messages.length)];

  wrap.addEventListener('mouseenter', function () {
    textEl.textContent = messages[Math.floor(Math.random() * messages.length)];
  });
})();

// Fade-in on scroll
const fadeEls = document.querySelectorAll('.fade-in');

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

fadeEls.forEach((el) => observer.observe(el));

// Smooth scroll for nav links (fallback for browsers that ignore CSS scroll-behavior)
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href');
    const target = document.querySelector(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

