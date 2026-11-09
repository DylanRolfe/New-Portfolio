import { PaintReveal } from './paint-reveal.js?v=10';

const DESKTOP = {
  width: 1672,
  height: 941,
  image: 'assets/cinematic/Images/mountain-about-desktop.webp?v=1',
  viewBox: '0 0 1672 941',
  path: 'M 168 788 C 246 762 246 724 322 708 C 398 692 386 648 458 626 C 530 604 512 566 582 544 C 648 523 650 488 710 466 C 764 447 758 406 802 392 C 824 385 830 364 846 338',
};
const MOBILE = {
  width: 941,
  height: 1672,
  image: 'assets/cinematic/Images/mountain-about-mobile.webp?v=1',
  viewBox: '0 0 941 1672',
  path: 'M 150 900 C 200 878 200 844 255 826 C 312 808 318 776 378 758 C 438 741 432 704 492 686 C 542 672 538 642 580 626 C 606 616 614 606 630 596',
};
const CHECKPOINTS = [0, 0.19, 0.38, 0.57, 0.76, 0.96];
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
    image.onload = () => {
      clearTimeout(timer);
      if (image.naturalWidth < 1) reject(new Error('Mountain artwork was empty.'));
      else resolve(image);
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
  const checkpointLayer = section.querySelector('[data-checkpoints]');
  const checkpointButtons = Array.from(section.querySelectorAll('[data-checkpoint]'));
  const panels = Array.from(section.querySelectorAll('[data-panel]'));
  const announcer = section.querySelector('[data-expedition-announcer]');
  let activeIndex = -1;
  let routeLength = 1;
  let runwayTop = 0;
  let scrollDistance = 1;
  let measureFrame = 0;
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
      if (i === index) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });

    if (announcer) {
      const org = panels[index]?.querySelector('.experience-org')?.textContent.trim();
      announcer.textContent = org ? `camp ${index + 1} of ${panels.length}: ${org}` : '';
    }
  }

  function setPathGeometry() {
    if (!map || !basePath || !litPath || !glowPath) return;
    currentSpec = spec();
    map.setAttribute('viewBox', currentSpec.viewBox);
    for (const path of [basePath, litPath, glowPath]) path.setAttribute('d', currentSpec.path);
    routeLength = Math.max(1, litPath.getTotalLength());
    for (const path of [litPath, glowPath]) {
      path.style.strokeDasharray = `${routeLength}`;
      path.style.strokeDashoffset = `${routeLength}`;
    }
  }

  function positionCheckpoints() {
    if (!map || !basePath || !stage || !checkpointButtons.length) return;
    const stageRect = stage.getBoundingClientRect();
    const matrix = basePath.getScreenCTM();
    if (!matrix) return;
    const point = map.createSVGPoint();
    checkpointButtons.forEach((button, i) => {
      const fraction = CHECKPOINTS[i] ?? i / Math.max(1, checkpointButtons.length - 1);
      const position = basePath.getPointAtLength(routeLength * fraction);
      point.x = position.x;
      point.y = position.y;
      const screen = point.matrixTransform(matrix);
      button.style.left = `${screen.x - stageRect.left}px`;
      button.style.top = `${screen.y - stageRect.top}px`;
    });
  }

  function measure() {
    if (disposed) return;
    measureFrame = 0;
    setPathGeometry();
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
    for (let i = 0; i < CHECKPOINTS.length; i++) {
      if (progress + 0.001 >= CHECKPOINTS[i]) index = i;
    }
    return index;
  }

  function updateRoute() {
    if (disposed) return;
    const progress = clamp((window.scrollY - runwayTop) / scrollDistance, 0, 1);
    if (litPath && glowPath) {
      const offset = staticMotion() ? 0 : routeLength * (1 - progress);
      litPath.style.strokeDashoffset = `${offset}`;
      glowPath.style.strokeDashoffset = `${offset}`;
    }
    section.style.setProperty('--expedition-progress', progress.toFixed(4));
    section.classList.toggle('is-started', progress > 0.012);
    setActive(activeIndexFor(progress));
  }

  function onScroll() {
    if (!disposed) updateRoute();
  }

  function drawImageCover(targetContext, source, width, height) {
    if (!source) return;
    const scale = Math.max(width / currentSpec.width, height / currentSpec.height);
    const drawWidth = currentSpec.width * scale;
    const drawHeight = currentSpec.height * scale;
    targetContext.drawImage(
      source,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  }

  function drawMountain(mask) {
    if (!canvas || !context || !image) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    drawImageCover(context, image, canvasWidth, canvasHeight);
    if (mask) {
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(mask.canvas, 0, 0, canvasWidth, canvasHeight);
      context.globalCompositeOperation = 'source-over';
    }
  }

  function drawMasked(elapsed) {
    if (!revealMask) return;
    revealMask.advance(elapsed);
    drawMountain(revealMask);
  }

  function finishMountain(instant = false) {
    if (disposed || mountainReady) return;
    mountainReady = true;
    clearTimeout(readyFallback);
    cancelAnimationFrame(revealFrame);
    revealFrame = 0;
    if (instant) {
      drawMountain(null);
    } else {
      revealMask?.finish();
      drawMountain(revealMask);
    }
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
      finishMountain(true);
      return;
    }
    if (staticMotion()) {
      finishMountain(true);
      return;
    }
    cancelAnimationFrame(revealFrame);
    revealFrame = 0;
    if (!revealMask) {
      revealMask = new PaintReveal({ duration: REVEAL_DURATION, variant: 'mountain' });
    }
    const rect = art.getBoundingClientRect();
    revealMask.resize(
      Math.max(1, rect.width),
      Math.max(1, rect.height),
      currentSpec.width,
      currentSpec.height,
    );
    drawMasked(0);
    revealStart = 0;
    pausedElapsed = 0;
    revealFrame = requestAnimationFrame(revealTick);
  }

  function setCanvasSize() {
    if (!canvas || !art) return false;
    const rect = art.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const ratio = Math.min(1.5, devicePixelRatio || 1);
    const backingWidth = Math.max(1, Math.round(width * ratio));
    const backingHeight = Math.max(1, Math.round(height * ratio));
    if (canvasWidth === backingWidth && canvasHeight === backingHeight) return false;
    canvasWidth = backingWidth;
    canvasHeight = backingHeight;
    canvas.width = backingWidth;
    canvas.height = backingHeight;
    return true;
  }

  function resizeMountain() {
    if (disposed || !canvas) return;
    if (!setCanvasSize()) return;
    if (mountainReady) {
      drawMountain(null);
      return;
    }
    if (revealMask) {
      const rect = art.getBoundingClientRect();
      const elapsed = revealStart ? pausedElapsed + (performance.now() - revealStart) : 0;
      revealMask.resize(rect.width, rect.height, currentSpec.width, currentSpec.height);
      drawMasked(clamp(elapsed / REVEAL_DURATION, 0, 1) * REVEAL_DURATION);
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
      image = null;
      finishMountain(true);
      return;
    }
    if (disposed || generation !== imageGeneration) return;
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
      finishMountain(true);
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
      finishMountain(true);
      return;
    }
    if (staticMotion()) {
      // The final plate is shown immediately for reduced motion or save-data,
      // and the route remains static.
      loadMountainImage(imageUrl(currentSpec)).then(nextImage => {
        if (disposed) return;
        image = nextImage;
        setCanvasSize();
        drawMountain(null);
        finishMountain(true);
      }).catch(() => finishMountain(true));
    } else {
      useLandscape();
    }
  }

  function onVisibility() {
    if (!revealMask || mountainReady || disposed) return;
    if (document.hidden) {
      pausedElapsed += performance.now() - (revealStart || performance.now());
      revealStart = 0;
      cancelAnimationFrame(revealFrame);
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
    const target = runwayTop + (CHECKPOINTS[index] ?? 0) * scrollDistance;
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
    checkpointButtons[next]?.focus();
  }

  function onMotionChange() {
    section.classList.toggle('is-static', staticMotion());
    if (staticMotion()) {
      finishMountain(true);
      updateRoute();
    }
  }

  function onConnectionChange() {
    section.classList.toggle('is-static', staticMotion());
    if (staticMotion()) finishMountain(true);
  }

  function onPortraitChange() {
    if (mountainReady) {
      imageGeneration++;
      const previous = image;
      currentSpec = spec();
      loadMountainImage(imageUrl(currentSpec)).then(nextImage => {
        if (disposed) return;
        image = nextImage;
        setCanvasSize();
        drawMountain(null);
        scheduleMeasure();
      }).catch(() => {
        if (!disposed) image = previous;
      });
    } else {
      useLandscape();
    }
    scheduleMeasure();
  }

  function attach() {
    ensureLive();
    section.classList.toggle('is-static', staticMotion());
    setPathGeometry();
    mountMountain();
    readyFallback = setTimeout(() => {
      if (!disposed && !mountainReady) finishMountain(true);
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
