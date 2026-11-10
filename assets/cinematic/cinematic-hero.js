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
  let playButton;
  function hidePlayButton() {
    if (playButton) playButton.hidden = true;
  }
  function offerPlayback() {
    if (!playButton) {
      playButton = document.createElement('button');
      playButton.type = 'button';
      playButton.className = 'cinematic-play';
      playButton.textContent = 'Play intro';
      playButton.addEventListener('click', () => {
        hidePlayButton();
        playback();
      });
      hero.appendChild(playButton);
    }
    playButton.hidden = false;
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
    const box = art.getBoundingClientRect();
    return box.width > 1 && box.height > 1 && box.bottom > 0 && box.top < window.innerHeight;
  }

  function announce() {
    if (status) status.textContent = 'Starry Night campsite painting.';
  }
  function showStill() {
    hidePlayButton();
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
    hidePlayButton();
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
      // The painted surface now owns the view; release the decoder and held frame.
      video.removeAttribute('src');
      video.load();
      held.width = held.height = 1;
    });
    if (!started) { showStill(); return; }
    hero.dataset.stage = 'revealing';
    announce();
  }
  function playback() {
    if (hero.dataset.stage !== 'playing' || preparing || atEnd()) return;
    if (away() || !onScreen()) { video.pause(); return; }
    const version = filmVersion;
    video.play().then(hidePlayButton).catch(error => {
      if (version !== filmVersion || hero.dataset.stage !== 'playing') return;
      if (error.name === 'NotAllowedError') offerPlayback();
      else if (error.name !== 'AbortError') beginReveal();
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
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(() => visibility()).observe(art);
  }
  if (!allowed()) showStill();
  else {
    // A new document always plays the opening. Internal navigation restores
    // the existing painted surface through site-nav without running this again.
    hero.dataset.stage = 'playing';
    loadCut(0);
    scene.prime();
  }
}
document.querySelectorAll('[data-cinematic-hero]').forEach(startHero);
