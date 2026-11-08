document.documentElement.classList.add('js');

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

  function lockScroll(event) {
    if (document.body.classList.contains('menu-open')) return;
    event.preventDefault();
  }

  window.addEventListener('wheel', lockScroll, { passive: false });
  window.addEventListener('touchmove', lockScroll, { passive: false });
  window.addEventListener('keydown', function (event) {
    const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
    if (keys.indexOf(event.key) !== -1 && !document.body.classList.contains('menu-open')) {
      event.preventDefault();
    }
  });
})();

// Hero: optional layers + subtle mouse parallax (transform only)
(function () {
  const root = document.querySelector('[data-parallax-root]');
  if (!root) return;

  const layers = Array.prototype.slice.call(root.querySelectorAll('[data-parallax-depth]'));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  // Optional sky/fg: only show if the dedicated asset exists.
  layers.forEach(function (layer) {
    const src = layer.getAttribute('data-layer-src');
    if (!src) return;
    const probe = new Image();
    probe.onload = function () {
      layer.style.backgroundImage = 'url("' + src + '")';
      layer.style.backgroundSize = 'cover';
      layer.style.backgroundPosition = 'center';
      layer.classList.add('is-ready');
      layer.removeAttribute('hidden');
    };
    probe.onerror = function () {
      layer.classList.add('is-missing');
      layer.setAttribute('hidden', '');
    };
    probe.src = src;
  });

  if (reduced || coarse) return;

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let ticking = false;

  function render() {
    currentX += (targetX - currentX) * 0.1;
    currentY += (targetY - currentY) * 0.1;
    layers.forEach(function (layer) {
      if (layer.hasAttribute('hidden')) return;
      const depth = Number(layer.getAttribute('data-parallax-depth') || 10);
      const x = currentX * (depth / 18);
      const y = currentY * (depth / 18);
      layer.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) scale(1.08)';
    });
    ticking = false;
  }

  window.addEventListener('mousemove', function (event) {
    const nx = (event.clientX / window.innerWidth - 0.5) * 2;
    const ny = (event.clientY / window.innerHeight - 0.5) * 2;
    targetX = nx * -16;
    targetY = ny * -10;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(render);
    }
  }, { passive: true });
})();

// Reveal on scroll
(function () {
  const elements = document.querySelectorAll('.reveal');
  if (!elements.length) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion || !('IntersectionObserver' in window)) {
    elements.forEach(function (el) { el.classList.add('visible'); });
    return;
  }

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px' });

  elements.forEach(function (el) { observer.observe(el); });
})();

// Trail timeline: sync aria, waypoint fill on scroll; collapse enhancement when JS on
(function () {
  const trail = document.querySelector('[data-trail]');
  if (!trail) return;

  const rows = Array.prototype.slice.call(trail.querySelectorAll('.trail-row'));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  rows.forEach(function (row) {
    const details = row.querySelector('details');
    if (!details) return;
    // Progressive enhancement: start collapsed when JS is available
    details.open = false;
    details.addEventListener('toggle', function () {
      details.setAttribute('aria-expanded', String(details.open));
    });
    details.setAttribute('aria-expanded', 'false');
  });

  if (!('IntersectionObserver' in window)) {
    rows.forEach(function (row) { row.classList.add('is-active'); });
    return;
  }

  const dotObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) entry.target.classList.add('is-active');
    });
  }, { threshold: 0.45 });

  rows.forEach(function (row) { dotObserver.observe(row); });

  if (reduced) {
    rows.forEach(function (row) { row.classList.add('is-active'); });
  }
})();

// Photo lightbox (about page cards)
(function () {
  const dialog = document.getElementById('lightbox');
  if (!dialog || !dialog.showModal) return;

  const image = dialog.querySelector('.lightbox-image');
  const caption = dialog.querySelector('.lightbox-caption');
  const closeBtn = dialog.querySelector('.lightbox-close');
  const triggers = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox-src]'));
  let lastTrigger = null;

  function openLightbox(trigger) {
    lastTrigger = trigger;
    image.src = trigger.getAttribute('data-lightbox-src');
    image.alt = trigger.getAttribute('data-lightbox-alt') || '';
    const fig = trigger.closest('figure');
    const cap = fig ? fig.querySelector('figcaption') : null;
    caption.textContent = cap ? cap.textContent.trim() : '';
    dialog.showModal();
    document.body.classList.add('lightbox-open');
    closeBtn.focus();
  }

  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function () { openLightbox(trigger); });
  });

  function closeLightbox() {
    dialog.close();
  }

  closeBtn.addEventListener('click', closeLightbox);
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) closeLightbox();
  });
  dialog.addEventListener('cancel', function () {
    document.body.classList.remove('lightbox-open');
  });
  dialog.addEventListener('close', function () {
    document.body.classList.remove('lightbox-open');
    image.removeAttribute('src');
    if (lastTrigger) lastTrigger.focus();
  });
})();

// FuelGo dialog
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
