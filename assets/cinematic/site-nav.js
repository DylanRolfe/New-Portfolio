// The top tabs are separate documents. Reloading them rebuilds the night-sky
// canvas, and the swirls snap back to the still before the clock catches up.
// Once the sky is on screen, swap the page in place and keep that canvas.
(function () {
  const pagePattern = /\/(?:index|projects|writing|about|stay-in-touch|resume)\.html$/;
  let ticket = 0;

  function skyArt() {
    const hero = document.querySelector('[data-cinematic-hero]');
    if (hero && hero.dataset.stage !== 'painted') return null;
    return document.querySelector('.cinematic-art[data-displaying-gl], .cinematic-art[data-gl-ready]');
  }

  function tabUrl(anchor, event) {
    if (!anchor || !anchor.closest('#nav')) return null;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    if (anchor.target && anchor.target !== '_self') return null;
    let url;
    try { url = new URL(anchor.href, location.href); }
    catch { return null; }
    if (url.origin !== location.origin || !pagePattern.test(url.pathname)) return null;
    return url;
  }

  function rememberPainting() {
    try { sessionStorage.setItem('dylan-home-campsite-painted', '1'); }
    catch { /* The canvas already on screen keeps the sky for this visit. */ }
  }

  function placeInBackdrop(doc) {
    const art = skyArt();
    if (!art) return;
    let backdrop = document.querySelector('[data-site-backdrop]');
    if (!backdrop) {
      const incoming = doc.querySelector('[data-site-backdrop]');
      if (!incoming) return;
      incoming.querySelector('.cinematic-art')?.remove();
      backdrop = document.importNode(incoming, true);
      document.body.prepend(backdrop);
    }
    const scrim = backdrop.querySelector('.site-backdrop-scrim');
    if (art.parentElement !== backdrop) backdrop.insertBefore(art, scrim);
  }

  function placeInHero() {
    const art = skyArt();
    const hero = document.querySelector('[data-cinematic-hero]');
    const media = hero && hero.querySelector('.cinematic-media');
    if (!art || !media) return;
    const placeholder = media.querySelector('.cinematic-art');
    if (placeholder && placeholder !== art) placeholder.replaceWith(art);
    else if (art.parentElement !== media) media.appendChild(art);
    hero.dataset.stage = 'painted';
    const backdrop = document.querySelector('[data-site-backdrop]');
    if (backdrop && !backdrop.contains(art)) backdrop.remove();
  }

  function applyChrome(doc) {
    document.title = doc.title;
    document.documentElement.classList.toggle('page-home', doc.documentElement.classList.contains('page-home'));
    const live = document.querySelector('#nav');
    const next = doc.querySelector('#nav');
    if (!live || !next) return;
    live.className = next.className;
    live.querySelectorAll('a[aria-current]').forEach(function (link) {
      link.removeAttribute('aria-current');
    });
    const current = next.querySelector('a[aria-current="page"]');
    if (!current) return;
    const match = live.querySelector('a[href="' + current.getAttribute('href') + '"]');
    if (match) match.setAttribute('aria-current', 'page');
  }

  function swapContent(doc) {
    const nextMain = doc.querySelector('#main');
    const main = document.querySelector('#main');
    if (nextMain && main) main.replaceWith(document.importNode(nextMain, true));
    document.querySelectorAll('dialog').forEach(function (dialog) {
      if (dialog.open) dialog.close();
      dialog.remove();
    });
    doc.querySelectorAll('dialog').forEach(function (dialog) {
      document.body.appendChild(document.importNode(dialog, true));
    });
  }

  async function navigate(url, historyMode) {
    if (!skyArt()) { location.assign(url.href); return; }
    const mine = ++ticket;
    let response;
    try {
      response = await fetch(url.href, { credentials: 'same-origin' });
    } catch {
      if (mine === ticket) location.assign(url.href);
      return;
    }
    if (mine !== ticket) return;
    if (!response.ok) { location.assign(url.href); return; }
    const html = await response.text();
    if (mine !== ticket) return;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const home = doc.documentElement.classList.contains('page-home');
    rememberPainting();
    if (!home) placeInBackdrop(doc);
    applyChrome(doc);
    swapContent(doc);
    if (home) placeInHero();
    if (historyMode === 'push') history.pushState({ sky: 1 }, '', url.href);
    window.scrollTo(0, 0);
    document.dispatchEvent(new Event('page:swap'));
    // Intersection updates run before the next frame and can pause the sky.
    // Start it again after that.
    requestAnimationFrame(() => document.dispatchEvent(new Event('sky:resume')));
  }

  document.addEventListener('click', function (event) {
    const anchor = event.target.closest && event.target.closest('a');
    const url = tabUrl(anchor, event);
    if (!url) return;
    if (url.pathname === location.pathname && url.search === location.search) {
      event.preventDefault();
      return;
    }
    if (!skyArt()) return;
    event.preventDefault();
    navigate(url, 'push');
  });

  window.addEventListener('popstate', function () {
    if (!skyArt() || !pagePattern.test(location.pathname)) return;
    navigate(new URL(location.href), 'skip');
  });
})();
