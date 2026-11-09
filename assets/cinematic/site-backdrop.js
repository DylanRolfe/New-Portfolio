import { createPaintMotion } from './paint-motion.js?v=11';
import { skyTime } from './sky-clock.js?v=9';

const root = document.querySelector('[data-site-backdrop]');
if (root) {
  const art = root.querySelector('.cinematic-art');
  const painting = art.querySelector('img');
  const mobile = art.querySelector('source');
  const portrait = matchMedia(mobile.media);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const allowed = () => !reduced.matches && !navigator.connection?.saveData;
  const scene = createPaintMotion(
    root,
    art,
    painting,
    () => portrait.matches ? mobile : painting,
    allowed,
    document,
    false,
    skyTime
  );

  function wake() { scene.refresh(); }

  painting.addEventListener('load', wake);
  portrait.addEventListener('change', wake);
  reduced.addEventListener('change', wake);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) scene.sleep();
    else scene.resume();
  });
  if (painting.complete) wake();
}
