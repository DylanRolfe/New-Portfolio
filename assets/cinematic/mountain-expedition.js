import { MountainBrush } from './mountain-brush.js?v=1';

const DESKTOP = {
  width: 1672,
  height: 941,
  image: 'assets/cinematic/Images/mountain-about-desktop.webp?v=1',
  viewBox: '0 0 1672 941',
  bounds: [112, 320, 1072, 328],
  start: 'M 260 792',
  legs: [
    'C 254 750 388 742 350 680',
    'C 302 625 355 610 448 616 C 520 623 580 621 570 590',
    'C 560 559 475 562 501 538 C 532 510 654 551 650 515',
    'C 646 486 713 486 751 469 C 790 452 796 440 755 440',
    'C 699 441 726 411 774 398 C 818 385 819 367 839 350',
  ],
};
const MOBILE = {
  width: 941,
  height: 1672,
  image: 'assets/cinematic/Images/mountain-about-mobile.webp?v=1',
  viewBox: '0 0 941 1672',
  bounds: [0, 568, 941, 340],
  start: 'M 170 960',
  legs: [
    'C 145 920 360 932 340 880',
    'C 322 840 190 840 220 795',
    'C 253 746 418 805 510 791 C 554 785 615 793 600 760',
    'C 576 711 413 717 450 665',
    'C 473 633 530 646 560 590',
  ],
};
// Fractions are measured from the five terrain-defined legs, not uniform intervals.
const REVEAL_DURATION = 1800;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const portrait = matchMedia('(orientation: portrait)');

let controller = null;

function spec() {
  return portrait.matches ? MOBILE : DESKTOP;
}

function staticMotion() {
  return reduceMotion.matches || Boolean(navigator.connection?.saveData);
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function imageUrl(entry) {
  return new URL(entry.image, document.baseURI).href;
}

function loadMountainImage(url, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.src = '';
      reject(new Error('Mountain artwork timed out.'));
    }, timeout);
    image.decoding = 'async';
    image.onload = async () => {
      try {
        await image.decode();
        if (image.naturalWidth < 1) throw new Error('Mountain artwork was empty.');
        resolve(image);
      } catch (error) {
        reject(error);
      } finally {
        clearTimeout(timer);
      }
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Mountain artwork failed to load.'));
    };
    image.src = url;
  });
}

function createController(section) {
  const art = document.querySelector('.cinematic-art');
  const stage = section.querySelector('[data-expedition-stage]');
  const runway = section.querySelector('[data-expedition-runway]');
  const map = section.querySelector('[data-expedition-map]');
  const basePath = section.querySelector('[data-route-base]');
  const litPath = section.querySelector('[data-route-lit]');
  const glowPath = section.querySelector('[data-route-glow]');
  // All pigment strokes share the existing geometry and scroll dash state.
  const pigmentPaths = [glowPath, section.querySelector('[data-route-edge]'),
    litPath, section.querySelector('[data-route-highlight]')].filter(Boolean);
  const checkpointLayer = section.querySelector('[data-checkpoints]');
  const checkpointButtons = Array.from(section.querySelectorAll('[data-checkpoint]'));
  const panels = Array.from(section.querySelectorAll('[data-panel]'));
  const announcer = section.querySelector('[data-expedition-announcer]');
  let activeIndex = -1;
  let pendingFocus = null;
  let routeLength = 1;
  let screenLength = 1;
  let runwayTop = 0;
  let scrollDistance = 1;
  let measureFrame = 0;
  let routeFrame = 0;
  let lastProgress = -1;
  let checkpoints = [0];
  let sourceCache = null;
  let paintedSpec = null;
  let pendingProgress = null;
  let disposed = false;
  let image = null;
  let imageGeneration = 0;
  let revealMask = null;
  let revealStart = 0;
  let pausedElapsed = 0;
  let revealFrame = 0;
  let readyFallback = 0;
  let mountainReady = false;
  let canvas = null;
  let context = null;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let currentSpec = spec();

  function ensureLive() {
    section.classList.add('is-live');
    stage?.removeAttribute('aria-busy');
  }

  function setActive(index) {
    index = clamp(index, 0, panels.length - 1);
    if (index === activeIndex) return;
    activeIndex = index;

    panels.forEach((panel, i) => {
      const isActive = i === index;
      panel.classList.toggle('is-active', isActive);
      panel.toggleAttribute('inert', !isActive);
      panel.setAttribute('aria-hidden', String(!isActive));
    });
    checkpointButtons.forEach((button, i) => {
      button.classList.toggle('is-active', i === index);
      button.classList.toggle('is-complete', i < index);
      button.tabIndex = i <= index ? 0 : -1;
      if (i === index) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    if (pendingFocus === index) {
      checkpointButtons[index]?.focus({ preventScroll: true });
      pendingFocus = null;
    }

    if (announcer) {
      const org = panels[index]?.querySelector('.experience-org')?.textContent.trim();
      announcer.textContent = org ? `camp ${index + 1} of ${panels.length}: ${org}` : '';
    }
  }

  function setPathGeometry() {
    if (!map || !basePath || !litPath || !glowPath) return;
    const entry = spec();
    map.setAttribute('viewBox', entry.viewBox);
    let route = entry.start;
    const lengths = [0];
    for (const leg of entry.legs) {
      route += ' ' + leg;
      basePath.setAttribute('d', route);
      lengths.push(basePath.getTotalLength());
    }
    for (const path of pigmentPaths) path.setAttribute('d', route);
    checkpoints = lengths.map(length => length / lengths.at(-1));
    lastProgress = -1;
    routeLength = Math.max(1, litPath.getTotalLength());
    for (const path of pigmentPaths) {
      path.style.strokeDasharray = `${routeLength}`;
      path.style.strokeDashoffset = `${routeLength}`;
    }
  }

  function positionCheckpoints() {
    if (!map || !basePath || !stage || !checkpointButtons.length) return;
    const stageRect = stage.getBoundingClientRect();
    const matrix = basePath.getScreenCTM();
    if (!matrix) return;
    // Non-scaling strokes express dash lengths in screen units too. Without
    // this conversion the portrait route lights ahead of the selected camp.
    screenLength = routeLength * Math.hypot(matrix.a, matrix.b);
    for (const path of pigmentPaths) path.style.strokeDasharray = `${screenLength}`;
    lastProgress = -1;
    const point = map.createSVGPoint();
    checkpointButtons.forEach((button, i) => {
      const fraction = checkpoints[i] ?? i / Math.max(1, checkpointButtons.length - 1);
      const position = basePath.getPointAtLength(routeLength * fraction);
      point.x = position.x;
      point.y = position.y;
      const screen = point.matrixTransform(matrix);
      button.classList.toggle('label-left', (i === 1 || i === 3) && screen.x - stageRect.left > 230);
      button.style.left = `${screen.x - stageRect.left}px`;
      button.style.top = `${screen.y - stageRect.top}px`;
    });
  }

  function measure() {
    if (disposed) return;
    measureFrame = 0;
    if (map?.getAttribute('viewBox') !== spec().viewBox) setPathGeometry();
    positionCheckpoints();
    runwayTop = runway ? runway.getBoundingClientRect().top + window.scrollY : 0;
    scrollDistance = Math.max(1, (runway?.offsetHeight || 1) - (stage?.offsetHeight || 1));
    if (pendingProgress !== null) {
      // Preserve the camp the visitor was reading across a rotation or resize
      // instead of leaving them at an arbitrary point in the document.
      const target = runwayTop + pendingProgress * scrollDistance;
      pendingProgress = null;
      if (Math.abs(window.scrollY - target) > 2) {
        window.scrollTo({ top: target, left: 0, behavior: 'instant' });
      }
    }
    updateRoute();
  }

  function scheduleMeasure() {
    if (measureFrame || disposed) return;
    measureFrame = requestAnimationFrame(measure);
  }

  function onResize() {
    if (disposed) return;
    const engaged = window.scrollY >= runwayTop && window.scrollY <= runwayTop + scrollDistance;
    if (engaged) pendingProgress = clamp((window.scrollY - runwayTop) / scrollDistance, 0, 1);
    resizeMountain();
    scheduleMeasure();
  }

  function activeIndexFor(progress) {
    let index = 0;
    for (let i = 0; i < checkpoints.length; i++) {
      if (progress + 0.001 >= checkpoints[i]) index = i;
    }
    return index;
  }

  function updateRoute() {
    cancelAnimationFrame(routeFrame);
    routeFrame = 0;
    if (disposed) return;
    const progress = clamp((window.scrollY - runwayTop) / scrollDistance, 0, 1);
    if (progress === lastProgress) return;
    lastProgress = progress;
    if (litPath && glowPath) {
      // Reduced motion skips automatic animation, but the trail still follows
      // the visitor's scroll rather than showing the entire route on arrival.
      const offset = screenLength * (1 - progress);
      for (const path of pigmentPaths) path.style.strokeDashoffset = `${offset}`;
    }
    section.style.setProperty('--expedition-progress', progress.toFixed(4));
    section.classList.toggle('is-started', progress > 0.012);
    setActive(activeIndexFor(progress));
  }

  function onScroll() {
    if (!disposed && !routeFrame) routeFrame = requestAnimationFrame(updateRoute);
  }

  function drawMountain(mask) {
    if (!canvas || !context || !image || !sourceCache) return;
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.drawImage(sourceCache, 0, 0);
    if (mask) {
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(mask.canvas, 0, 0);
      context.globalCompositeOperation = 'source-over';
    }
  }

  function drawMasked(elapsed) {
    if (!revealMask) return;
    revealMask.advance(elapsed);
    drawMountain(revealMask);
  }

  function finishMountain() {
    if (disposed || mountainReady) return;
    mountainReady = true;
    clearTimeout(readyFallback);
    cancelAnimationFrame(revealFrame);
    revealFrame = 0;
    // Only the final still uses display resolution. No full-frame composites.
    setCanvasSize();
    drawMountain(null);
    revealMask = null;
    section.setAttribute('data-route-ready', '');
    scheduleMeasure();
    // Use the current scroll position so a restored deep link cannot snap the
    // panel back to camp one after the mountains finish painting.
    updateRoute();
  }

  function revealTick(now) {
    if (disposed) return;
    if (!revealStart) revealStart = now;
    const elapsed = pausedElapsed + (now - revealStart);
    const t = clamp(elapsed / REVEAL_DURATION, 0, 1);
    drawMasked(t * REVEAL_DURATION);
    if (t >= 1) finishMountain();
    else revealFrame = requestAnimationFrame(revealTick);
  }

  function startReveal() {
    if (disposed || mountainReady) return;
    if (!image) {
      finishMountain();
      return;
    }
    if (staticMotion()) {
      finishMountain();
      return;
    }
    cancelAnimationFrame(revealFrame);
    revealFrame = 0;
    revealMask = new MountainBrush(canvasWidth, canvasHeight, REVEAL_DURATION);
    drawMasked(0);
    revealStart = 0;
    pausedElapsed = 0;
    if (!document.hidden) revealFrame = requestAnimationFrame(revealTick);
  }

  function setCanvasSize() {
    if (!canvas || !art) return false;
    const rect = art.getBoundingClientRect();
    const [x, y, width, height] = currentSpec.bounds;
    const cover = Math.max(rect.width / currentSpec.width, rect.height / currentSpec.height);
    // The canvas occupies only the transparent plate's non-empty band, using
    // the exact same centered cover transform as the shared painting.
    Object.assign(canvas.style, {
      left: `${(rect.width - currentSpec.width * cover) / 2 + x * cover}px`,
      top: `${(rect.height - currentSpec.height * cover) / 2 + y * cover}px`,
      width: `${width * cover}px`, height: `${height * cover}px`,
    });
    const ratio = mountainReady ? Math.min(1.5, devicePixelRatio || 1) * cover : Math.min(900 / width, cover);
    const w = Math.max(1, Math.ceil(width * ratio)), h = Math.max(1, Math.ceil(height * ratio));
    if (canvasWidth === w && canvasHeight === h && paintedSpec === image) return false;
    canvas.width = canvasWidth = w; canvas.height = canvasHeight = h;
    sourceCache = document.createElement('canvas');
    sourceCache.width = w; sourceCache.height = h;
    if (image) sourceCache.getContext('2d').drawImage(image, x, y, width, height, 0, 0, w, h);
    paintedSpec = image;
    return true;
  }

  function resizeMountain() {
    if (disposed || !canvas || !setCanvasSize()) return;
    if (mountainReady) drawMountain(null);
    else if (revealMask) {
      const elapsed = pausedElapsed + (revealStart ? performance.now() - revealStart : 0);
      revealMask = new MountainBrush(canvasWidth, canvasHeight, REVEAL_DURATION);
      drawMasked(elapsed);
    }
  }

  async function useLandscape() {
    const generation = ++imageGeneration;
    const entry = spec();
    let nextImage;
    try {
      nextImage = await loadMountainImage(imageUrl(entry));
    } catch (error) {
      console.warn('Mountain artwork unavailable; keeping the original campsite.', error);
      if (disposed || generation !== imageGeneration) return;
      image = null;
      finishMountain();
      return;
    }
    if (disposed || generation !== imageGeneration) return;
    cancelAnimationFrame(revealFrame);
    image = nextImage;
    currentSpec = entry;
    setCanvasSize();
    // A stalled decode may have tripped the 6-second route fallback. If the
    // plate arrives later, place it immediately instead of replaying a reveal
    // the visitor has already scrolled past.
    if (mountainReady) drawMountain(null);
    else startReveal();
  }

  function mountMountain() {
    if (!art) {
      // The content and route can still work if the shared backdrop is absent.
      finishMountain();
      return;
    }
    currentSpec = spec();
    // Any overlay from a previous About visit is disposed before a new one is
    // added, so repeated navigation can never stack canvases.
    art.querySelectorAll('.mountain-canvas').forEach(node => node.remove());
    canvas = document.createElement('canvas');
    canvas.className = 'mountain-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvasWidth = 0;
    canvasHeight = 0;
    context = canvas.getContext('2d', { alpha: true });
    art.appendChild(canvas);
    setCanvasSize();
    if (!context) {
      finishMountain();
      return;
    }
    useLandscape();
  }

  function onVisibility() {
    if (!revealMask || mountainReady || disposed) return;
    if (document.hidden) {
      pausedElapsed += performance.now() - (revealStart || performance.now());
      revealStart = 0;
      cancelAnimationFrame(revealFrame);
      clearTimeout(readyFallback);
      revealFrame = 0;
    } else if (!revealFrame) {
      revealStart = 0;
      revealFrame = requestAnimationFrame(revealTick);
    }
  }

  function onCheckpointClick(event) {
    const button = event.target.closest('[data-checkpoint]');
    if (!button) return;
    const index = Number(button.dataset.checkpoint);
    if (!Number.isFinite(index)) return;
    const target = runwayTop + (checkpoints[index] ?? 0) * scrollDistance;
    window.scrollTo({
      top: target,
      behavior: staticMotion() ? 'auto' : 'smooth',
    });
    button.focus({ preventScroll: true });
  }

  function onCheckpointKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = checkpointButtons.indexOf(document.activeElement);
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = checkpointButtons.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else next = Math.min(checkpointButtons.length - 1, index + 1);
    if (next <= activeIndex) {
      pendingFocus = null;
      checkpointButtons[next]?.focus({ preventScroll: true });
    } else {
      // Keyboard users can advance to an undiscovered camp without placing
      // invisible buttons in the tab order. Focus follows the arriving trail.
      pendingFocus = next;
      window.scrollTo({
        top: runwayTop + checkpoints[next] * scrollDistance,
        behavior: staticMotion() ? 'instant' : 'smooth',
      });
    }
  }

  function onMotionChange() {
    section.classList.toggle('is-static', staticMotion());
    lastProgress = -1;
    if (staticMotion()) {
      finishMountain();
    }
    updateRoute();
  }

  function onConnectionChange() {
    onMotionChange();
  }

  function onPortraitChange() {
    // A generation ticket prevents a slow portrait decode winning a later
    // landscape request during rapid rotation.
    useLandscape();
    scheduleMeasure();
  }

  function attach() {
    ensureLive();
    section.classList.toggle('is-static', staticMotion());
    setPathGeometry();
    mountMountain();
    readyFallback = setTimeout(() => {
      if (!disposed && !mountainReady && !document.hidden) finishMountain();
    }, 6000);
    checkpointLayer?.addEventListener('click', onCheckpointClick);
    checkpointLayer?.addEventListener('keydown', onCheckpointKey);
    portrait.addEventListener('change', onPortraitChange);
    reduceMotion.addEventListener('change', onMotionChange);
    navigator.connection?.addEventListener?.('change', onConnectionChange);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    scheduleMeasure();
    // The initial frame has the route in its dim state; ensure the first panel
    // is active even before the mountain has finished painting.
    setActive(0);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(measureFrame);
    cancelAnimationFrame(routeFrame);
    cancelAnimationFrame(revealFrame);
    clearTimeout(readyFallback);
    checkpointLayer?.removeEventListener('click', onCheckpointClick);
    checkpointLayer?.removeEventListener('keydown', onCheckpointKey);
    portrait.removeEventListener('change', onPortraitChange);
    reduceMotion.removeEventListener('change', onMotionChange);
    navigator.connection?.removeEventListener?.('change', onConnectionChange);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    if (canvas) {
      canvas.classList.add('is-leaving');
      const old = canvas;
      setTimeout(() => old.remove(), 340);
    }
    canvas = null;
    context = null;
  }

  attach();
  return { dispose, remeasure: scheduleMeasure };
}

function teardown() {
  controller?.dispose();
  controller = null;
}

function mount() {
  const section = document.querySelector('[data-expedition]');
  if (!section) {
    teardown();
    return;
  }
  if (controller) return;
  controller = createController(section);
}

mount();
document.addEventListener('page:swap', mount);
window.addEventListener('pagehide', teardown);
window.addEventListener('pageshow', event => {
  if (event.persisted) mount();
});
