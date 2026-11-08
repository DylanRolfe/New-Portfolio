import { createSkyMotion } from './sky-motion.js';

const HOLD_MS = 650;
const DISSOLVE_MS = 2100;
// Roof peak x/y and footprint width as fractions of the uncropped photograph.
const PHOTO_TENT = [.501, .59, .13];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function startHero(hero) {
  const video = hero.querySelector('.cinematic-video');
  const photo = hero.querySelector('.cinematic-freeze');
  const art = hero.querySelector('.cinematic-art');
  const painting = art.querySelector('img');
  const mobile = art.querySelector('source');
  const media = hero.querySelector('.cinematic-media');
  const skip = hero.querySelector('[data-skip]');
  const status = hero.querySelector('[role="status"]');
  const portrait = matchMedia(mobile.media);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => !reduced.matches && !navigator.connection?.saveData;
  const selected = () => portrait.matches ? mobile : painting;
  const scene = createSkyMotion(hero, art, painting, selected, motionAllowed);
  let timer = 0;
  let version = 0;
  let visible = true;
  let animations = [];

  function stage(name) { hero.dataset.stage = name; }
  function cancelTransition() {
    clearTimeout(timer);
    animations.forEach(animation => animation.cancel());
    animations = [];
    version++;
  }
  function finish() {
    cancelTransition();
    video.pause();
    stage('painted');
    if (skip) skip.hidden = true;
    if (status) status.textContent = 'Starry Night campsite painting.';
    scene.refresh();
  }

  // Compare landmarks in displayed pixels after each image's independent
  // center-cover crop. Translation is bounded so the still always fills the hero.
  function landmark(image, anchor, width, height) {
    const cover = Math.max(width/image.naturalWidth, height/image.naturalHeight);
    const w = image.naturalWidth * cover, h = image.naturalHeight * cover;
    return { x: (anchor[0]-.5)*w, y: (anchor[1]-.5)*h, size: anchor[2]*w };
  }
  function registeredTransform() {
    const {width, height} = media.getBoundingClientRect();
    const from = landmark(photo, PHOTO_TENT, width, height);
    const to = landmark(painting, selected().dataset.anchor.split(',').map(Number), width, height);
    const scale = clamp(to.size/from.size, 1, 1.72);
    const maxX = width*(scale-1)/2, maxY = height*(scale-1)/2;
    const dx = clamp(to.x-from.x*scale, -maxX, maxX);
    const dy = clamp(to.y-from.y*scale, -maxY, maxY);
    return 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')';
  }
  function dissolve() {
    if (!motionAllowed() || !painting.naturalWidth || !photo.naturalWidth || !art.animate) {
      finish();
      return;
    }
    const animationOptions = { duration: DISSOLVE_MS, fill: 'both', easing: 'ease-in-out' };
    const target = registeredTransform();
    const camera = photo.animate([
      {transform:'none'}, {transform:target, offset:.78}, {transform:target}
    ], animationOptions);
    const reveal = art.animate([
      {opacity:0}, {opacity:.04, offset:.24}, {opacity:.90, offset:.79}, {opacity:1}
    ], animationOptions);
    stage('transform');
    animations = [camera, reveal];
    reveal.onfinish = finish;
  }

  async function endFilm() {
    if (hero.dataset.stage !== 'playing') return;
    const request = ++version;
    // Keep the video's last frame visible while its lossless still decodes.
    try { await photo.decode(); } catch { if (request === version) finish(); return; }
    if (request !== version) return;
    stage('freeze');
    timer = setTimeout(async () => {
      try { await painting.decode(); } catch { /* The photograph remains underneath. */ }
      if (request === version) dissolve();
    }, HOLD_MS);
  }
  function playback() {
    if (hero.dataset.stage !== 'playing' || video.ended) return;
    if (!visible || document.hidden) {
      video.pause();
      return;
    }
    video.play().catch(error => {
      if (error.name !== 'AbortError' && hero.dataset.stage === 'playing') finish();
    });
  }
  function updateVisibility() {
    playback();
    if (!visible || document.hidden) scene.sleep();
  }
  video.addEventListener('ended', endFilm);
  video.addEventListener('error', () => { if (hero.dataset.stage === 'playing') finish(); });
  skip?.addEventListener('click', finish);
  painting.addEventListener('load', () => scene.refresh());
  painting.addEventListener('error', () => scene.sleep());
  portrait.addEventListener('change', () => {
    if (hero.dataset.stage === 'transform') finish();
    scene.refresh();
  });
  reduced.addEventListener('change', () => {
    if (!motionAllowed()) finish();
    else scene.refresh();
  });
  document.addEventListener('visibilitychange', updateVisibility);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      updateVisibility();
    }).observe(hero);
  }
  if (motionAllowed()) {
    stage('playing');
    if (skip) skip.hidden = false;
    video.src = video.dataset.src;
    playback();
  } else finish();
}

document.querySelectorAll('[data-cinematic-hero]').forEach(startHero);
