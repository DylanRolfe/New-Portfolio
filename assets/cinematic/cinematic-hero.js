import { createPaintMotion } from './paint-motion.js?v=7';

function startHero(hero) {
  const video = hero.querySelector('.cinematic-video');
  const art = hero.querySelector('.cinematic-art');
  const painting = art.querySelector('img');
  const mobile = art.querySelector('source');
  const status = hero.querySelector('[role="status"]');
  const portrait = matchMedia(mobile.media);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const allowed = () => !reduced.matches && !navigator.connection?.saveData;
  const selected = () => portrait.matches ? mobile : painting;
  const scene = createPaintMotion(hero, art, painting, selected, allowed, hero, true);
  let filmVersion = 0;
  let resumeTime = 0;
  let handoff = false;

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
    video.style.opacity = '';
    video.style.transition = '';
    scene.cancel();
    hero.dataset.stage = 'painted';
    announce();
    scene.refresh();
  }
  function dissolve() {
    handoff = true;
    filmVersion++;
    scene.cancel();
    video.pause();
    hero.dataset.stage = 'dissolving';
    announce();
    const done = () => {
      video.style.opacity = '';
      video.style.transition = '';
      if (hero.dataset.stage === 'dissolving') hero.dataset.stage = 'painted';
    };
    requestAnimationFrame(() => {
      video.style.transition = 'opacity 1.25s linear';
      video.style.opacity = '0';
    });
    const timer = setTimeout(done, 1400);
    video.addEventListener('transitionend', () => { clearTimeout(timer); done(); }, {once:true});
  }
  async function beginReveal() {
    if (handoff || hero.dataset.stage === 'revealing' || hero.dataset.stage === 'painted') return;
    if (away() || !onScreen()) return;
    const version = filmVersion;
    video.pause();
    const ok = await scene.prime();
    if (version !== filmVersion || !allowed()) return;
    if (away() || !onScreen()) return;
    if (!ok) { dissolve(); return; }
    handoff = true;
    const started = scene.startReveal(() => {
      if (version !== filmVersion) return;
      hero.dataset.stage = 'painted';
    });
    if (!started) { dissolve(); return; }
    hero.dataset.stage = 'revealing';
    announce();
  }
  function playback() {
    if (hero.dataset.stage !== 'playing' || video.ended) return;
    if (away() || !onScreen()) { video.pause(); return; }
    const version = filmVersion;
    video.play().catch(error => {
      if (version === filmVersion && error.name !== 'AbortError') showStill();
    });
  }
  function loadCut(time) {
    filmVersion++;
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
  video.addEventListener('error', () => { if (hero.dataset.stage === 'playing') showStill(); });
  painting.addEventListener('load', () => scene.refresh());
  portrait.addEventListener('change', () => {
    if (hero.dataset.stage === 'playing') loadCut(video.currentTime || resumeTime);
    else if (hero.dataset.stage === 'revealing' || hero.dataset.stage === 'dissolving') showStill();
    scene.refresh();
  });
  reduced.addEventListener('change', () => {
    if (!allowed()) showStill();
    else scene.refresh();
  });
  function visibility() {
    playback();
    if (away() || !onScreen()) scene.sleep();
    else {
      scene.resume();
      if (video.ended && hero.dataset.stage === 'playing') beginReveal();
    }
  }
  document.addEventListener('visibilitychange', visibility);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(() => visibility()).observe(hero);
  }
  if (allowed()) {
    hero.dataset.stage = 'playing';
    loadCut(0);
    scene.prime();
  } else showStill();
}
document.querySelectorAll('[data-cinematic-hero]').forEach(startHero);
