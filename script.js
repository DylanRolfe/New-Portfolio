// Mobile navigation
(function () {
  const nav = document.getElementById('nav');
  const toggle = document.querySelector('.nav-toggle');
  if (!nav || !toggle) return;

  function closeMenu() {
    nav.classList.remove('nav-open');
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'open menu');
  }

  toggle.addEventListener('click', function () {
    const isOpen = nav.classList.toggle('nav-open');
    document.body.classList.toggle('menu-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'close menu' : 'open menu');
  });

  document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 700) closeMenu();
  });
})();

// Lock the home page so the document never scrolls.
(function () {
  if (!document.documentElement.classList.contains('page-home')) return;

  function shouldAllow(event) {
    if (document.body.classList.contains('menu-open')) return true;
    const main = document.querySelector('.home-main');
    return !!(main && main.contains(event.target) && main.scrollHeight > main.clientHeight + 2);
  }

  function lockScroll(event) {
    if (shouldAllow(event)) return;
    event.preventDefault();
  }

  window.addEventListener('wheel', lockScroll, { passive: false });
  window.addEventListener('touchmove', lockScroll, { passive: false });
  window.addEventListener('keydown', function (event) {
    const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
    if (keys.indexOf(event.key) === -1 || document.body.classList.contains('menu-open')) return;
    const main = document.querySelector('.home-main');
    if (main && main.scrollHeight > main.clientHeight + 2) return;
    event.preventDefault();
  });
})();

// Subtle mouse parallax on the home mountain photo.
(function () {
  const img = document.querySelector('.home-parallax-img');
  if (!img) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || window.matchMedia('(pointer: coarse)').matches) return;

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let ticking = false;

  function render() {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    img.style.transform =
      'translate(calc(-50% + ' + currentX.toFixed(2) + 'px), calc(-50% + ' + currentY.toFixed(2) + 'px)) scale(1.12)';
    ticking = false;
  }

  window.addEventListener('mousemove', function (event) {
    const nx = (event.clientX / window.innerWidth - 0.5) * 2;
    const ny = (event.clientY / window.innerHeight - 0.5) * 2;
    targetX = nx * -18;
    targetY = ny * -12;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(render);
    }
  }, { passive: true });
})();

// Reveal content as it enters the viewport.
(function () {
  const elements = document.querySelectorAll('.reveal');
  if (!elements.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion || !('IntersectionObserver' in window)) {
    elements.forEach(function (element) {
      element.classList.add('visible');
    });
    return;
  }

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px' });

  elements.forEach(function (element) {
    observer.observe(element);
  });
})();

// Draw the experience vine as you scroll.
(function () {
  const vine = document.querySelector('[data-vine]');
  const path = document.querySelector('.vine-path');
  if (!vine || !path) return;

  const length = path.getTotalLength();
  path.style.strokeDasharray = String(length);
  path.style.strokeDashoffset = String(length);

  function updateVine() {
    const rect = vine.getBoundingClientRect();
    const view = window.innerHeight || 1;
    const start = view * 0.85;
    const end = -rect.height + view * 0.25;
    const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
    path.style.strokeDashoffset = String(length * (1 - progress));
  }

  updateVine();
  window.addEventListener('scroll', updateVine, { passive: true });
  window.addEventListener('resize', updateVine);
})();

// Open the three FuelGo links from either project trigger.
(function () {
  const dialog = document.getElementById('fuelgo-dialog');
  const triggers = document.querySelectorAll('.project-menu-trigger');
  if (!dialog || !dialog.showModal || !triggers.length) return;

  let lastTrigger = null;
  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      lastTrigger = trigger;
      dialog.showModal();
      document.body.classList.add('fuelgo-open');
      dialog.querySelector('.fuelgo-dialog-close').focus();
    });
  });

  dialog.querySelector('.fuelgo-dialog-close').addEventListener('click', function () {
    dialog.close();
  });
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', function () {
    document.body.classList.remove('fuelgo-open');
    if (lastTrigger) lastTrigger.focus();
  });
})();
