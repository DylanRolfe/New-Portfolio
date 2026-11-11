import { createPaintMotion } from './paint-motion.js?v=14';
import { skyTime } from './sky-clock.js?v=9';

function startHero(hero) {
  const video = hero.querySelector('.cinematic-video');
  const held = hero.querySelector('.cinematic-hold');
  const art = hero.querySelector('.cinematic-art');
  const painting = art.querySelector('img');
  const mobile = art.querySelector('source');
  const status = hero.querySelector('[role="status"]');
  const portrait = matchMedia(mobile.media);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const allowed = () => !reduced.matches;
  const selected = () => portrait.matches ? mobile : painting;
  // Listen on document so the sky keeps receiving the pointer after this hero
  // node is left behind during a tab change.
  const scene = createPaintMotion(hero, art, painting, selected, allowed, document, true, skyTime);
  let filmVersion = 0;
  let resumeTime = 0;
  let handoff = false;
  let preparing = false;
  let frameRequest = 0;
  let playPending = false;
  let retryTimer = 0;
  let retryCount = 0;
  // These six-second assets contain a baked-in morph after the photographic
  // five-second mark. End the displayed cut here; never seek/reload at handoff.
  const cutEnd = () => Math.min(Number(video.dataset.photoEnd) || Infinity, video.duration || Infinity);
  const atEnd = () => video.ended || (video.currentTime > 0 && video.currentTime >= cutEnd());

  function holdFrame() {
    if (hero.hasAttribute('data-held-frame') || video.readyState < 2) return;
    try {
      const scale = Math.min(1,1920/Math.max(video.videoWidth,video.videoHeight));
      held.width = Math.round(video.videoWidth*scale);
      held.height = Math.round(video.videoHeight*scale);
      held.getContext('2d').drawImage(video,0,0,held.width,held.height);
      hero.dataset.heldFrame = '';
    } catch { /* The paused video remains the fallback if capture is unavailable. */ }
  }
  function watchFrames() {
    if (!video.requestVideoFrameCallback || frameRequest || handoff) return;
    frameRequest = video.requestVideoFrameCallback((now, frame) => {
      frameRequest = 0;
      if (frame.mediaTime >= cutEnd()) beginReveal();
      else watchFrames();
    });
  }

  function away() {
    return document.hidden;
  }
  function onScreen() {
    const box = art.getBoundingClientRect();
    return box.width > 1 && box.height > 1 && box.bottom > 0 && box.top < window.innerHeight;
  }

  function announce() {
    if (status) status.textContent = 'Starry Night campsite painting.';
  }
  function rememberPainting() {
    try { sessionStorage.setItem('dylan-home-campsite-painted', '1'); }
    catch { /* In-place navigation can still preserve the painted surface. */ }
  }
  function wasPainted() {
    try { return sessionStorage.getItem('dylan-home-campsite-painted') === '1'; }
    catch { return false; }
  }
  function showStill() {
    clearTimeout(retryTimer);
    handoff = true;
    filmVersion++;
    video.pause();
    if (frameRequest) video.cancelVideoFrameCallback(frameRequest);
    frameRequest = 0;
    video.style.opacity = '';
    video.style.transition = '';
    scene.cancel();
    hero.dataset.stage = 'painted';
    rememberPainting();
    announce();
    scene.refresh();
  }
  async function beginReveal() {
    if (preparing || handoff || hero.dataset.stage === 'revealing' || hero.dataset.stage === 'painted') return;
    if (away() || !onScreen()) return;
    preparing = true;
    clearTimeout(retryTimer);
    const version = filmVersion;
    video.pause();
    holdFrame();
    const ok = await scene.prime();
    preparing = false;
    if (version !== filmVersion || !allowed()) return;
    if (away() || !onScreen()) return;
    if (!ok) { showStill(); return; }
    handoff = true;
    const started = scene.startReveal(() => {
      if (version !== filmVersion) return;
      hero.dataset.stage = 'painted';
      rememberPainting();
      // The painted surface now owns the view; release the decoder and held frame.
      video.autoplay = false;
      video.querySelectorAll('source').forEach(source => source.remove());
      video.removeAttribute('src');
      video.load();
      held.width = held.height = 1;
    });
    if (!started) { showStill(); return; }
    hero.dataset.stage = 'revealing';
    announce();
  }
  function playback() {
    if (hero.dataset.stage !== 'playing' || preparing || playPending || atEnd()) return;
    if (away() || !onScreen()) { video.pause(); return; }
    const version = filmVersion;
    clearTimeout(retryTimer);
    playPending = true;
    video.play().catch(error => {
      if (version !== filmVersion || hero.dataset.stage !== 'playing') return;
      // Mobile browsers can reject play while loading or becoming visible.
      // A policy rejection is not the end of the film: keep the opening and
      // retry rather than skipping straight into the finished scene.
      if (error.name === 'NotSupportedError') { beginReveal(); return; }
      if (retryCount++ < 3) retryTimer = setTimeout(playback, 500);
    }).finally(() => {
      if (version === filmVersion) playPending = false;
    });
    watchFrames();
  }
  function loadCut(time) {
    filmVersion++;
    playPending = false;
    retryCount = 0;
    clearTimeout(retryTimer);
    if (frameRequest) video.cancelVideoFrameCallback(frameRequest);
    frameRequest = 0;
    resumeTime = time;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.poster = selected().dataset.poster;
    const intro = new URL(selected().dataset.intro, document.baseURI).href;
    // Let HTML's muted inline autoplay start the first cut. Replacing src and
    // calling load() here would abort that initial browser-managed playback.
    // Only reload when rotating to a different cut.
    if (time > 0 || (video.currentSrc && video.currentSrc !== intro)) {
      video.src = intro;
      video.load();
    }
    playback();
  }
  video.addEventListener('loadedmetadata', () => {
    if (resumeTime > 0 && hero.dataset.stage === 'playing') {
      video.currentTime = Math.min(resumeTime, video.duration);
      resumeTime = 0;
    }
  });
  video.addEventListener('canplay', playback);
  video.addEventListener('playing', () => { retryCount = 0; watchFrames(); });
  // Keep the paused last frame on screen until the brush canvas is ready.
  video.addEventListener('ended', () => {
    const version = filmVersion;
    requestAnimationFrame(() => { if (version === filmVersion) beginReveal(); });
  });
  // Older browsers without video-frame callbacks still stop on the photo cut.
  video.addEventListener('timeupdate', () => { if (atEnd()) beginReveal(); });
  video.addEventListener('error', () => { if (hero.dataset.stage === 'playing') beginReveal(); });
  painting.addEventListener('load', () => scene.refresh());
  portrait.addEventListener('change', () => {
    if (hero.dataset.stage === 'playing' && !hero.hasAttribute('data-held-frame')) loadCut(video.currentTime || resumeTime);
    // During the reveal keep the held frame and elapsed brush progress. The
    // responsive image's load event refreshes its textures when decoding ends.
    scene.refresh();
  });
  reduced.addEventListener('change', () => {
    if (!allowed()) showStill();
    else scene.refresh();
  });
  function parkedSky() {
    return art.isConnected && !art.closest('[data-cinematic-hero]');
  }
  function visibility() {
    playback();
    if (away()) { scene.sleep(); return; }
    // Once the painting lives in the fixed backdrop, tab changes must not
    // pause it just because the original hero is gone.
    if (parkedSky() || onScreen()) {
      scene.resume();
      if (!parkedSky() && atEnd() && hero.dataset.stage === 'playing') beginReveal();
      return;
    }
    scene.sleep();
  }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pageshow', visibility);
  document.addEventListener('hero:finish', () => {
    if (hero.dataset.stage !== 'painted') showStill();
  });
  // A history restore may bring back a document left midway through its intro.
  window.addEventListener('pageshow', () => {
    if (wasPainted() && hero.dataset.stage !== 'painted') showStill();
  });
  // Some phone power-saving policies require a gesture. Retry on ordinary
  // page interaction without introducing an extra control or skipping film.
  document.addEventListener('touchend', playback, { passive: true });
  document.addEventListener('click', playback);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(() => visibility()).observe(art);
  }
  if (!allowed() || wasPainted()) showStill();
  else {
    // Play the opening only until completion or the first subpage departure.
    hero.dataset.stage = 'playing';
    loadCut(0);
    scene.prime();
  }
}
document.querySelectorAll('[data-cinematic-hero]').forEach(startHero);
