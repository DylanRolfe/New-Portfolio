// Mobile navigation
(function () {
  const nav = document.getElementById('nav');
  const toggle = document.querySelector('.nav-toggle');
  if (!nav || !toggle) return;

  function closeMenu() {
    nav.classList.remove('nav-open');
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }

  toggle.addEventListener('click', function () {
    const isOpen = nav.classList.toggle('nav-open');
    document.body.classList.toggle('menu-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });

  document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 700) closeMenu();
  });
})();

// Give the navigation a quiet surface after leaving the hero.
(function () {
  const nav = document.getElementById('nav');
  if (!nav) return;

  function updateNav() {
    nav.classList.toggle('scrolled', window.scrollY > 24);
  }

  updateNav();
  window.addEventListener('scroll', updateNav, { passive: true });
})();

// Reveal content as it enters the viewport.
(function () {
  const elements = document.querySelectorAll('.reveal');
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

// Start the launch video from an explicit click so browsers allow its audio.
(function () {
  const frame = document.querySelector('.hobby-video-frame');
  if (!frame) return;
  const video = frame.querySelector('video');
  const button = frame.querySelector('.video-sound-button');

  button.addEventListener('click', function () {
    video.muted = false;
    video.volume = 1;
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(function () {});
  });
  video.addEventListener('playing', function () {
    frame.classList.add('has-played');
  });
  video.addEventListener('ended', function () {
    frame.classList.remove('has-played');
  });
})();

// Let visitors see the gallery photos at full size without leaving the page.
(function () {
  const dialog = document.querySelector('.gallery-dialog');
  const photos = Array.from(document.querySelectorAll('.hobby-photo'));
  if (!dialog || !photos.length || !dialog.showModal) return;

  const largeImage = dialog.querySelector('.gallery-image');
  const caption = dialog.querySelector('.gallery-caption');
  const count = dialog.querySelector('.gallery-count');
  let currentIndex = 0;
  let lastTrigger = null;
  let touchStartX = 0;

  function showPhoto(index) {
    currentIndex = (index + photos.length) % photos.length;
    const photo = photos[currentIndex];
    const source = photo.querySelector('img');
    largeImage.src = source.currentSrc || source.src;
    largeImage.alt = source.alt;
    caption.textContent = photo.closest('figure').querySelector('figcaption').childNodes[0].textContent.trim();
    count.textContent = (currentIndex + 1) + ' / ' + photos.length;
  }

  photos.forEach(function (photo, index) {
    photo.addEventListener('click', function () {
      lastTrigger = photo;
      showPhoto(index);
      dialog.showModal();
      document.body.classList.add('gallery-open');
    });
  });

  dialog.querySelector('.gallery-close').addEventListener('click', function () {
    dialog.close();
  });
  dialog.querySelector('.gallery-prev').addEventListener('click', function () {
    showPhoto(currentIndex - 1);
  });
  dialog.querySelector('.gallery-next').addEventListener('click', function () {
    showPhoto(currentIndex + 1);
  });

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') showPhoto(currentIndex - 1);
    if (event.key === 'ArrowRight') showPhoto(currentIndex + 1);
  });
  dialog.addEventListener('touchstart', function (event) {
    touchStartX = event.changedTouches[0].screenX;
  }, { passive: true });
  dialog.addEventListener('touchend', function (event) {
    const distance = event.changedTouches[0].screenX - touchStartX;
    if (Math.abs(distance) > 55) showPhoto(currentIndex + (distance < 0 ? 1 : -1));
  }, { passive: true });
  dialog.addEventListener('close', function () {
    document.body.classList.remove('gallery-open');
    if (lastTrigger) lastTrigger.focus();
  });
})();
