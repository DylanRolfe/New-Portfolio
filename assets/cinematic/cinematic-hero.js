import { createPaintMotion } from './paint-motion.js?v=9';
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
  const allowed = () => !reduced.matches && !navigator.connection?.saveData;
  const selected = () => portrait.matches ? mobile : painting;
  const scene = createPaintMotion(hero, art, painting, selected, allowed, hero, true, skyTime);
  let filmVersion = 0;
  let resumeTime = 0;
  let handoff = false;
  let preparing = false;
  let frameRequest = 0;
  const completionKey = 'dylan-home-campsite-painted';
  function alreadyPainted() {
    try { return sessionStorage.getItem(completionKey) === '1'; }
    catch { return false; }
  }
  function rememberPainting() {
    try { sessionStorage.setItem(completionKey, '1'); }
    catch { /* Keep the in-page completed state when storage is unavailable. */ }
  }
  // These six-second assets contain a baked-in morph after the photographic
  // five-second mark. End the displayed cut here; never seek/reload at handoff.
  const cutEnd = () => Math.min(Number(video.dataset.photoEnd) || Infinity, video.duration || Infinity);
  const atEnd = () => video.ended || video.currentTime >= cutEnd();

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
    const box = hero.getBoundingClientRect();
    return box.width > 1 && box.height > 1 && box.bottom > 0 && box.top < window.innerHeight;
  }

  function announce() {
    if (status) status.textContent = 'Starry Night campsite painting.';
  }
  function showStill() {
    handoff = true;
    filmVersion++;
    video.pause();
    if (frameRequest) video.cancelVideoFrameCallback(frameRequest);
    frameRequest = 0;
    video.style.opacity = '';
    video.style.transition = '';
    scene.cancel();
    hero.dataset.stage = 'painted';
    announce();
    scene.refresh();
  }
  async function beginReveal() {
    if (preparing || handoff || hero.dataset.stage === 'revealing' || hero.dataset.stage === 'painted') return;
    if (away() || !onScreen()) return;
    preparing = true;
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
      rememberPainting();
      hero.dataset.stage = 'painted';
    });
    if (!started) { showStill(); return; }
    hero.dataset.stage = 'revealing';
    announce();
  }
  function playback() {
    if (hero.dataset.stage !== 'playing' || preparing || atEnd()) return;
    if (away() || !onScreen()) { video.pause(); return; }
    const version = filmVersion;
    video.play().catch(error => {
      if (version === filmVersion && error.name !== 'AbortError') showStill();
    });
    watchFrames();
  }
  function loadCut(time) {
    filmVersion++;
    if (frameRequest) video.cancelVideoFrameCallback(frameRequest);
    frameRequest = 0;
    resumeTime = time;
    video.poster = selected().dataset.poster;
    video.src = selected().dataset.intro;
    video.load();
    playback();
  }
  video.addEventListener('loadedmetadata', () => {
    if (resumeTime > 0 && hero.dataset.stage === 'playing') {
      video.currentTime = Math.min(resumeTime, video.duration);
      resumeTime = 0;
    }
  });
  // Keep the paused last frame on screen until the brush canvas is ready.
  video.addEventListener('ended', () => {
    const version = filmVersion;
    requestAnimationFrame(() => { if (version === filmVersion) beginReveal(); });
  });
  // Older browsers without video-frame callbacks still stop on the photo cut.
  video.addEventListener('timeupdate', () => { if (atEnd()) beginReveal(); });
  video.addEventListener('error', () => { if (hero.dataset.stage === 'playing') showStill(); });
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
  navigator.connection?.addEventListener('change', () => {
    if (!allowed()) showStill();
  });
  function visibility() {
    playback();
    if (away() || !onScreen()) scene.sleep();
    else {
      scene.resume();
      if (atEnd() && hero.dataset.stage === 'playing') beginReveal();
    }
  }
  document.addEventListener('visibilitychange', visibility);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(() => visibility()).observe(hero);
  }
  if (!allowed()) showStill();
  else if (alreadyPainted()) {
    handoff = true;
    hero.dataset.stage = 'painted';
    announce();
    scene.present();
    scene.refresh();
  } else {
    hero.dataset.stage = 'playing';
    loadCut(0);
    scene.prime();
  }
}
document.querySelectorAll('[data-cinematic-hero]').forEach(startHero);
