document.documentElement.classList.add('js');

// Mobile navigation, scroll lock, and page widgets.
// page:swap is fired when the top tabs change without reloading the night sky.
(function () {
  const nav = document.getElementById('nav');
  const toggle = document.querySelector('.nav-toggle');

  function closeMenu() {
    if (!nav || !toggle) return;
    nav.classList.remove('nav-open');
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'open menu');
  }

  if (nav && toggle) {
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
  }

  let scrollLocked = false;
  function lockScroll(event) {
    if (document.body.classList.contains('menu-open')) return;
    event.preventDefault();
  }
  function lockKey(event) {
    const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
    if (keys.indexOf(event.key) === -1 || document.body.classList.contains('menu-open')) return;
    const target = event.target;
    if (target && target.closest && target.closest('button, a, input, textarea, select, summary')) return;
    event.preventDefault();
  }
  function syncHomeScroll() {
    const home = document.documentElement.classList.contains('page-home');
    if (home && !scrollLocked) {
      window.addEventListener('wheel', lockScroll, { passive: false });
      window.addEventListener('touchmove', lockScroll, { passive: false });
      window.addEventListener('keydown', lockKey);
      scrollLocked = true;
    } else if (!home && scrollLocked) {
      window.removeEventListener('wheel', lockScroll);
      window.removeEventListener('touchmove', lockScroll);
      window.removeEventListener('keydown', lockKey);
      scrollLocked = false;
    }
  }

  // Hero: optional layers + subtle mouse parallax (transform only)
  (function () {
    const root = document.querySelector('[data-parallax-root]');
    if (!root) return;

    const layers = Array.prototype.slice.call(root.querySelectorAll('[data-parallax-depth]'));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;

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

  let revealObserver = null;
  function mountReveal() {
    if (revealObserver) {
      revealObserver.disconnect();
      revealObserver = null;
    }
    const elements = document.querySelectorAll('.reveal');
    if (!elements.length) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach(function (el) { el.classList.add('visible'); });
      return;
    }

    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px' });

    elements.forEach(function (el) { revealObserver.observe(el); });
  }

  let trailObserver = null;
  function mountTrail() {
    if (trailObserver) {
      trailObserver.disconnect();
      trailObserver = null;
    }
    const trail = document.querySelector('[data-trail]');
    if (!trail || trail.dataset.wired === '1') return;

    const rows = Array.prototype.slice.call(trail.querySelectorAll('.trail-row'));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    trail.dataset.wired = '1';

    rows.forEach(function (row) {
      const details = row.querySelector('details');
      if (!details) return;
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

    trailObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add('is-active');
      });
    }, { threshold: 0.45 });

    rows.forEach(function (row) { trailObserver.observe(row); });

    if (reduced) {
      rows.forEach(function (row) { row.classList.add('is-active'); });
    }
  }

  function mountBelt() {
    const belt = document.querySelector('[data-life-belt]');
    if (!belt || belt.dataset.wired === '1') return;

    const track = belt.querySelector('.life-belt-track');
    const set = belt.querySelector('.life-belt-set');
    if (!track || !set) return;
    belt.dataset.wired = '1';

    function primeVideos(root) {
      root.querySelectorAll('video').forEach(function (video) {
        video.muted = true;
        video.defaultMuted = true;
        video.setAttribute('muted', '');
        video.playsInline = true;
        video.loop = true;
        video.autoplay = true;
        const attempt = video.play();
        if (attempt && attempt.catch) attempt.catch(function () {});
      });
    }

    primeVideos(set);

    const clone = set.cloneNode(true);
    clone.classList.add('life-belt-set-clone');
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('img').forEach(function (img) {
      img.alt = '';
    });
    clone.querySelectorAll('button, a, video').forEach(function (el) {
      el.setAttribute('tabindex', '-1');
    });
    track.appendChild(clone);
    primeVideos(clone);
  }

  function mountLightbox() {
    const dialog = document.getElementById('lightbox');
    if (!dialog || !dialog.showModal || dialog.dataset.wired === '1') return;
    dialog.dataset.wired = '1';

    const image = dialog.querySelector('.lightbox-image');
    const caption = dialog.querySelector('.lightbox-caption');
    const closeBtn = dialog.querySelector('.lightbox-close');
    const primaryTriggers = Array.prototype.slice.call(
      document.querySelectorAll('.life-belt-set:not(.life-belt-set-clone) [data-lightbox-src]')
    );
    const triggers = primaryTriggers.length
      ? primaryTriggers
      : Array.prototype.slice.call(document.querySelectorAll('[data-lightbox-src]'));
    const allTriggers = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox-src]'));
    let lastTrigger = null;

    function resolveTrigger(trigger) {
      const src = trigger.getAttribute('data-lightbox-src');
      const match = triggers.find(function (item) {
        return item.getAttribute('data-lightbox-src') === src;
      });
      return match || trigger;
    }

    function openLightbox(trigger) {
      const resolved = resolveTrigger(trigger);
      lastTrigger = resolved;
      image.src = resolved.getAttribute('data-lightbox-src');
      image.alt = resolved.getAttribute('data-lightbox-alt') || '';
      const fig = resolved.closest('figure');
      const cap = fig ? fig.querySelector('figcaption') : null;
      caption.textContent = cap ? cap.textContent.trim() : '';
      dialog.showModal();
      document.body.classList.add('lightbox-open');
      closeBtn.focus();
    }

    allTriggers.forEach(function (trigger) {
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
  }

  function mountFuelgo() {
    const dialog = document.getElementById('fuelgo-dialog');
    const triggers = document.querySelectorAll('.project-menu-trigger');
    if (!dialog || !dialog.showModal || !triggers.length || dialog.dataset.wired === '1') return;
    dialog.dataset.wired = '1';

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
  }

  function mountPage() {
    syncHomeScroll();
    mountReveal();
    mountTrail();
    mountBelt();
    mountLightbox();
    mountFuelgo();
  }

  mountPage();
  document.addEventListener('page:swap', function () {
    closeMenu();
    document.body.classList.remove('lightbox-open', 'fuelgo-open');
    mountPage();
  });
})();
