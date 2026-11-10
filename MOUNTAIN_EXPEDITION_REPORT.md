Mountain expedition refinement — 2026-11-09

Current refinements: Painted Pigment is the only trail style. Reached checkpoints retain their company logos at reduced opacity; only the active label is bold, and future labels are hidden. ClearCraft uses the transparent PNG on the trail and the JPG on its experience card. The navigation is transparent, Newsletter retains the Follow the Journey card, and Resume is an internal tab with a full-viewport paper preview and a PDF download. Homepage reloads replay the opening, while internal navigation preserves the painted sky. The original home strokes now run in two parallel chains over 7.68 seconds; the broad central fill pass alone runs at half speed. `tests/home-and-resume.cjs` checks the parallel scheduling, isolated slowdown, actual desktop/mobile completion, persistent sky, and no-scroll resume layout. Local generated captures and timing data are excluded by `.gitignore` and remain available in the workspace.

Follow-up refinement: About now uses a transparent navigation bar and omits the location eyebrow. The trail's geometry reference is invisible, and future checkpoints appear only when reached. Reduced-motion/data-saver modes also preserve scroll-driven discovery. Keyboard arrows and End can advance to an unreached camp, with focus following its reveal. Outside the Workshop, its original media, and its lightbox have moved below Follow the Journey. About ends at the expedition runway, with the scene fixed to the viewport, so reaching the bottom leaves Waterloo and the trail aligned with the mountain. This also eliminates a subpixel offset caused by the browser rounding the document scroll height at some viewport sizes. Follow-up screenshots are in `tests/artifacts/refine-followup/`; this paragraph supersedes the earlier descriptions of a visible inactive route and the workshop's location below About.

Implemented on `astra/mountain-expedition-refine`, created from verified HEAD `1527b829bb905c8eca3a20a74c46560a481e7f4f`. No commit, push, merge, or deployment was performed. The original cinematic branch remains at `e9a08c25954db49f19c84ab864d60f33e1b5f466`. The supplied handoff, mockup, and existing test artifacts were preserved. New captures use separate `refine-*` directories.

The design uses `Images/expedition-mountain-timeline-mockup.png` as its composition reference while keeping the actual campsite's registration. The heading now shares the expedition stage, the route makes rounded switchbacks, camps have small annotations, and the selected experience sits in a compact editorial column. The tent and sky retain their original positions. The six experience articles were compared with the cinematic baseline: their existing role/description combinations preserve its substantive content, so no new accomplishments or expanded claims were added.

The performance problem was the combination of dense procedural ribbon drawing and repeated full-viewport Canvas compositing alongside the animated sky. Instrumentation counted 133,840 Canvas stroke calls in the old reveal. Its desktop composite was 2160 × 1350 at a 1440 × 900 viewport and DPR 1.5. Scroll events also wrote directly to the DOM, and non-scaling SVG strokes used image-space dash lengths, which made portrait illumination run ahead of checkpoints.

The replacement uses a separate About-only `MountainBrush`, leaving the original home brush code untouched. It draws a 96 × 96 textured bristle stamp once, then deposits that cached stamp along eight fine gestures and seven curved, overlapping carrying strokes. The additive mask produces a painted reveal, not an opacity crossfade. Both the mask and its cached source are restricted to the mountain's alpha bounds, with a maximum animated width of 900 pixels. Only this small region is composited each frame. At completion, one higher-resolution still replaces it and the mask is released. An automated mask test checks over 99.5% opaque coverage before the final frame, preventing a large final fill pop.

This bounded Canvas approach was chosen over adding textures and passes to the shared WebGL renderer. It removes the expensive mountain work without changing the original shaders, renderer API, homepage handoff, or WebGL lifecycle, and it still works when WebGL is unavailable. No second WebGL renderer was introduced.

The following are measured samples in local headless Chrome, not device-wide guarantees. Warm comparisons start on Projects, let the shared sky render, then navigate to About. The baseline is served directly from the original commit using test response interception; the working tree is never reset. Screenshots and pixel readbacks occur after the timed interval. Callback times include instrumented JavaScript and Canvas command submission, not GPU raster time.

| Measurement | Desktop before | Desktop final | Mobile before | Mobile final |
|---|---:|---:|---:|---:|
| Viewport / DPR | 1440 × 900 / 1.5 | same | 390 × 844 / 1.5 | same |
| Animated composite | 2160 × 1350 | 900 × 276 | 585 × 1266 | 476 × 172 |
| Canvas stroke calls | 133,840 | 0 | 133,840 | 0 |
| Canvas image draws | 216 | 1,378 | 222 | 1,215 |
| Total reveal callback CPU time | 108.2 ms | 20.7 ms | 118.3 ms | 19.5 ms |
| 95th-percentile callback | 1.7 ms | 0.3 ms | 2.0 ms | 0.4 ms |
| Reveal elapsed | 1,837 ms | 1,820 ms | 1,823 ms | 1,819 ms |
| Median frame interval | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms |
| 95th-percentile frame interval | 16.8 ms | 16.9 ms | 16.8 ms | 17.2 ms |
| Maximum frame interval | 50.4 ms | 67.1 ms | 18.2 ms | 18.6 ms |

Derived from those measurements, the animated pixel area falls about 91% on desktop and 89% on mobile; total reveal callback time falls about 81% and 84%. The median frame interval did not improve: both versions were already near 60 fps in the warm run on this machine. An earlier after run measured 27.2 / 20.8 ms total callback time, illustrating normal variation. Initial cold-load samples had 167 ms maximum frame gaps before and 183 ms after; cold startup stalls remain a limitation. These results establish reduced work, not elimination of all dropped frames.

Raw measurements: `tests/artifacts/refine-before/performance.json`, `refine-after/performance.json`, `refine-before-warm/performance.json`, `refine-after-warm/performance.json`, and `refine-after-final-warm/performance.json`.

The desktop route follows five authored terrain legs from the lower rock shelves, across a forest shoulder, through broad middle switchbacks, and up the summit ridge to image coordinate `(839, 350)`. Portrait uses a separately composed route ending at `(560, 590)`, matching the portrait mountain. Checkpoints are measured at leg endpoints using SVG path length, giving deliberate uneven spacing. Their positions use the image's centered cover transform through the SVG matrix. The line is 2 pixels with a restrained wider blue stroke beneath it; the SVG blur filter is removed. Screen-space dash lengths keep the illuminated endpoint aligned at different scales.

Scroll events schedule one animation-frame update. Geometry and path lengths are cached; unchanged progress is skipped; article and checkpoint states change only when the selected camp changes. Reverse scrolling remains deterministic. Native button targets stay 44 × 44 pixels, with keyboard focus, active-step semantics, an announcement region, and inert inactive articles. Hidden-tab time does not advance the reveal, orientation requests use generation tickets, and pending frames/listeners are cancelled on exit.

The information column occupies roughly the right third of the viewport with a text block capped at 340 pixels, leaving the larger portion for the route and landscape. A feathered local gradient supports contrast without a rectangular card. It keeps organization logos, years, roles, descriptions, and links, with gentle fade/translation changes. Phone layouts use a compact bottom text treatment without inner scrolling; short landscape layouts use a smaller right column. The actual IBM Plex Mono web fonts are now served locally under an expedition-only CSS alias. The previous Google Fonts link had no stylesheet relationship and did not load the font. Other pages retain their existing typography. Four unmodified Latin WOFF2 files total approximately 60 KB, with the SIL OFL license included.

Exact source and test files changed or added:

- `about.html` — integrated heading, new path fallback and checkpoint labels; asset versions.
- `styles.css` — expedition layout, trail, compact information, responsive rules, scoped local font faces.
- `assets/cinematic/mountain-expedition.js` — bounded compositor, geometry, scroll scheduling, decode and lifecycle handling.
- `assets/cinematic/mountain-brush.js` — new cached bristle mask renderer.
- `assets/fonts/ibm-plex-mono-400.woff2`
- `assets/fonts/ibm-plex-mono-500.woff2`
- `assets/fonts/ibm-plex-mono-600.woff2`
- `assets/fonts/ibm-plex-mono-700.woff2`
- `assets/fonts/OFL.txt` — upstream font license.
- `index.html`, `projects.html`, `writing.html`, `stay-in-touch.html` — only shared stylesheet/module cache-version updates, needed when entering About through persistent navigation.
- `tests/expedition.cjs` — separate artifact directory and additional home-to-About renderer-identity check.
- `tests/reveal-frames.cjs` — separate artifact directory to preserve earlier captures.
- `tests/expedition-performance.cjs` — comparable cold/warm measurements and baseline interception.
- `tests/expedition-lifecycle.cjs` — additional lifecycle, responsive, mask-completion, and fallback checks.
- `MOUNTAIN_EXPEDITION_REPORT.md` — this report.

The original images, `cinematic-hero.js`, `paint-motion.js`, `paint-reveal.js`, shader files, sky clock, navigation implementation, and cinematic CSS were not modified. The global module inclusion is retained because the persistent navigator imports page content without executing incoming scripts; removing it from Home/Projects would break entry into About.

Validation completed:

- `node tests/expedition.cjs` — passed: direct About, progressive reveal, forward/reverse/click/keyboard state, About → Projects → About, portrait, compact portrait, landscape, reduced motion, data saver, no WebGL, photo belt/lightbox, homepage video/painting completion, and Home → About with the same sky canvas.
- `node tests/reveal-frames.cjs` — passed: sampled coverage progresses and settles; intermediate painted frames captured.
- `node tests/expedition-lifecycle.cjs` — passed: all six camps forward/backward, repeated visits including exit during reveal, persistent canvas identity, desktop resizing, 844 × 390 landscape, 360 × 640 and 390 × 844 portrait, visibility pause beyond six seconds, live motion preference changes, rapid orientation changes during reveal, mask completeness, and six readable no-JS articles.
- `node tests/expedition-performance.cjs before-warm --warm` and `after-final-warm --warm` — completed; values above.
- `git diff --check` — passed.
- Screenshots were inspected against the supplied mockup and the original composite. The font correction prompted another responsive verification and new final captures.

Final screenshots in `tests/artifacts/refine-validation/`:

- `reveal-2000ms.png` — completed mountain reveal.
- `final-desktop-partial.png` — partial trail at Strive.
- `final-desktop-summit.png` — completed ascent at Waterloo.
- `final-390x844.png` — portrait phone.
- `final-360x640.png` — compact phone.
- `final-844x390.png` — narrow landscape.
- `final-1024x768.png` — narrower desktop.

Preview at `http://127.0.0.1:8766/about.html` while the local server is running. To restart it, run `python -m http.server 8766 --bind 127.0.0.1` in the repository. The existing Playwright installation is used without installing dependencies:

```powershell
$env:NODE_PATH='C:/Users/Dylan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node tests/expedition.cjs
node tests/reveal-frames.cjs
node tests/expedition-lifecycle.cjs
node tests/expedition-performance.cjs after-local --warm
```

Remaining limits: measurements are individual local Chrome runs, not a cross-device benchmark. Mobile layouts were viewport emulations, not physical iOS/Android hardware. Safari and Firefox were not tested. Visibility interruption was simulated through the real visibilitychange handler because headless tab hiding is inconsistent; actual OS backgrounding remains unverified. The transparent mountain assets and their existing compositing seams were intentionally retained. The result follows the mockup's composition while preserving this site's different campsite/sky arrangement; it is not a replacement with the mockup artwork.
