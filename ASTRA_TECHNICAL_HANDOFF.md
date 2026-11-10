# Astra Technical Handoff

Investigation date: 2026-11-09. This is an evidence-based source/Git review.

## A. Repository and Git state

Current branch: deepseek/mountain-expedition-timeline (tracking origin/deepseek/mountain-expedition-timeline).
HEAD: 1527b829bb905c8eca3a20a74c46560a481e7f4f, Add cinematic mountain expedition timeline to About.
Original cinematic baseline: cursor/cinematic-campsite-hero-a447 at e9a08c2; direct comparison was possible.
There are no tracked uncommitted source changes. Only tests/artifacts/ is untracked, containing generated screenshots plus reveal-frames.json. The feature is committed; no files were deleted.

The mountain commit added mountain-expedition.js, two mountain WebPs, the reference PNG, tests/expedition.cjs, tests/reveal-frames.cjs, and tools/build-mountain-art.py. It modified about.html, cinematic-hero.css, paint-reveal.js, styles.css, and all five HTML pages. The branch-wide .dsh/skills files came from earlier commit 9cc83f1, not the mountain commit.

## B. Relevant file map

- assets/cinematic/cinematic-hero.js: homepage film playback and original handoff.
- assets/cinematic/paint-motion.js: original WebGL renderer, textures, shaders, BrushField, pointer input, reveal mask.
- assets/cinematic/paint-reveal.js: Canvas brush-mask generator; DeepSeek added mountain plan.
- assets/cinematic/brush-field.js: sky deformation/fleck field.
- assets/cinematic/shaders/paint.frag and flecks.frag: original GPU passes.
- assets/cinematic/site-nav.js, site-backdrop.js, sky-clock.js: persistent backdrop and navigation.
- assets/cinematic/mountain-expedition.js: new overlay, SVG, scroll, panel controller.
- about.html and styles.css: expedition markup/layout.
- tools/build-mountain-art.py: offline transparent-overlay generator, not browser runtime.

## C. Original working cinematic architecture

Layer order from assets/cinematic/cinematic-hero.css lines 8-43:
1. Opening poster.
2. Hike video.
3. Held last video frame canvas.
4. Cinematic art: painting picture plus WebGL canvas.
5. Vignette/content.

Inner pages use fixed .site-backdrop at z-index 0 (cinematic-hero.css lines 79-105). The painting is beneath WebGL; scrim is above at z-index 3. site-nav.js fetches next local document, replaces main, and moves the existing cinematic-art node into/out of backdrop. It preserves the already-live canvas over navigation.

cinematic-hero.js startHero() is lines 4-181. loadCut() chooses portrait/desktop media. index.html line 71 sets data-photo-end=5, despite six-second videos. watchFrames() uses requestVideoFrameCallback with timeupdate fallback. holdFrame() at line 37 copies the final photographic frame. beginReveal() at line 76 pauses film, holds frame, awaits scene.prime(), then starts WebGL reveal. This means the held film stays visible while art textures/shaders prime: no image jump.

paint-motion.js createPaintMotion() begins line 64. program() line 4 compiles shaders, pipeline() line 45 creates paint/flecks programs, and imageAt() line 38 decodes masks/flow textures. render() line 176 limits DPR to min(devicePixelRatio, 1.5, 2300/max(width,height)).

paint.frag lines 8-24 calculates centered cover UVs, samples the sky mask, offsets only sky, then applies reveal alpha. Thus sky animates while foreground/tent/trees remain stable:
vec2 uv = (vScreen - 0.5) * uView / uCover + 0.5;
float sky = smoothstep(0.15, 0.95, texture2D(uMask, uv).r);
uv += sky * uMotion * (breeze * 0.009 + hand * 0.45);
float cover = texture2D(uRevealMask, vScreen).a;

BrushField is a sparse CSS-pixel spring mesh. stir() at paint-motion.js line 280 handles document pointer input. sky-clock.js line 21 maintains session time excluding hidden duration. Reduced motion/save-data disable animation.

Original PaintReveal normal plan is paint-reveal.js lines 95-138, duration 12,100ms. paint-motion uploads its changed mask to GPU. Reuse these working components; do not rewrite home film, original renderer, or persistent navigation.

## D. DeepSeek new architecture

No new shader/WebGL renderer was added. mountain-expedition.js creates a separate 2D mountain-canvas inside existing cinematic-art. New stack:
1. Existing campsite plus animated WebGL sky.
2. New 2D mountain overlay at z-index 2 (cinematic-hero.css lines 47-57).
3. Existing scrim at z-index 3.
4. About SVG/checkpoints/panel.

paint-reveal.js constructor now accepts duration and variant (lines 11-21); planMountain() at 47-93 is separate from normal plan. All pages now load mountain-expedition.js; pages without data-expedition return without controller creation. This is unnecessary loading, but not a controller leak.

## E. Mountain transition implementation

mountain-expedition.js lines 3-18 define desktop/mobile image specs, matching viewBoxes, SVG paths, and REVEAL_DURATION=1800. Asset selection is orientation, not width breakpoint.

loadMountainImage() lines 40-59 creates an Image with decoding=async and a four-second timeout. It uses onload, not decode(), and reloads on orientation change.

The mountain files are transparent RGBA overlays, not full replacement scenes. mountMountain() at 353-388 appends a 2D canvas. drawImageCover() at 209-221 covers/centers using source dimensions. Mountain assets exactly match painting asset dimensions: desktop 1672x941 and mobile 941x1672. Underlying CSS is centered object-fit cover, so their crops are aligned.

drawMountain() at 223-234 clears full canvas, draws plate, then applies PaintReveal mask via destination-in. revealTick() at 261-269 is elapsed-time rAF, not scroll-driven:
const elapsed = pausedElapsed + (now - revealStart);
const t = clamp(elapsed / REVEAL_DURATION, 0, 1);
drawMasked(t * REVEAL_DURATION);
if (t >= 1) finishMountain();
else revealFrame = requestAnimationFrame(revealTick);

startReveal() lines 271-297 creates a PaintReveal duration 1800, variant mountain. It reuses the bristle implementation but not original full-scene plan. finishMountain() makes final mask permanent, exposes route/panel with data-route-ready, and stops reveal rAF. Visibility pauses elapsed time; reduced motion/save-data draw final state immediately; attach() has six-second route fallback.

## F. Performance diagnosis

### Confirmed

1. drawMountain() executes a full Canvas-2D clear, source cover-draw, and destination-in mask draw every reveal frame. At 1440x900 DPR 1.5 its backing canvas is 2160x1350 (2.916 million pixels), repeatedly composited during nominal 1.8s reveal.

2. planMountain() creates 35 strokes (9+20+6). advance() at paint-reveal.js 160-167 can add 140 segments per stroke. segment() at 140-158 makes roughly 27-30 individual Canvas path/stroke ribbons per non-wet segment. Completion is roughly 35x140x27 = 132,300 Canvas 2D stroke calls in 1.8 seconds. This is a confirmed primary root cause.

3. Original WebGL sky rAF continues under 2D animation. This is intended, but GPU sky work coincides with CPU/2D work.

4. Scroll calls updateRoute() directly (mountain-expedition.js 192-207): reads scrollY, writes two SVG dash values, custom property, classes, and potential panel state. It is not rAF-throttled.

5. Current route is manually hard-coded fixed-viewBox geometry, not terrain-bound data. Its monotonic lower-left to upper-middle coordinates account for diagonal graph appearance.

6. Existing untracked reveal-frames.json reports route ready at nominal 1500ms sample but browser performance time about 2259ms. It establishes delayed sampling/startup evidence, not a device-wide profile.

### Hypotheses only

- Some mobile browsers may software-rasterize or copy the large Canvas 2D composite.
- SVG drop-shadow on lit route (styles.css 890-893) may increase scroll paint.
- Decode/orientation reload may delay first reveal on low-end devices.
- No production getImageData, repeated WebGL init, or multiple mountain rAF loops were found. Readback only occurs in tests. dispose() cancels controller rAFs and listeners.

Top optimizations: use GPU/cached mask rather than per-frame full source composite; drastically reduce/pre-render bristle work; rAF-coalesce route scrolling and avoid filter if profile supports it.

## G. Image assets and compositing

| Asset | Dimensions / format / size | Use |
|---|---|---|
| opening-desktop.webp | 1280x720 WebP RGB, 61,982B | desktop poster |
| opening-mobile.webp | 720x1280 WebP RGB, 44,036B | portrait poster |
| hike desktop/mobile MP4 | video | six-second film, shown through 5s |
| painting-desktop.webp | 1672x941 WebP RGB, 744,748B | desktop campsite/WebGL art |
| painting-mobile.webp | 941x1672 WebP RGB, 712,332B | portrait campsite |
| sky desktop/mobile PNG | 840x473 / 473x840 grayscale | sky mask |
| flow desktop/mobile PNG | 840x473 / 473x840 RGB | fleck direction field |
| mountain-about-desktop.webp | 1672x941 WebP RGBA, 60,124B | transparent overlay |
| mountain-about-mobile.webp | 941x1672 WebP RGBA, 60,322B | transparent overlay |
| about-mountain-reference.png | 1672x941 PNG RGBA, 3,039,497B | build-time only |

Desktop mountain alpha bbox is x=117-1175, y=328-637; mobile is x=0-924, y=574-897. Generator source explicitly preserves original sky/tent/foreground/main trees (tools/build-mountain-art.py lines 3-8), applies foliage exclusion (29-63), tent fade (125-130), and edge feather (132-138). Desktop transform is (0.82,1.0,-180,55), bottom 640. Mobile uses cropped source and y=545 transform.

This is a transparent composite rather than simple opaque layer. It changes distant landscape/cloud band, while sky moves under/around it and protected foreground remains original. Because mountain image is independently generated, alpha/grade seams may still look discontinuous.

## H. SVG route and scroll

about.html lines 70-78 contain three identical paths: base, glow, lit. Desktop path is mountain-expedition.js 3-9; mobile path 10-16. setPathGeometry() lines 123-133 swaps path/viewBox, gets total length, and sets dash array. positionCheckpoints() lines 135-150 samples fractions [0,.19,.38,.57,.76,.96], converts through getScreenCTM(), and writes stage-relative pixel left/top.

SVG fills sticky stage with preserveAspectRatio xMidYMid slice. It is viewBox/image-space-like, while buttons are derived screen pixels. Equal artwork/viewBox aspect makes it generally register; independent crop/aspect changes will break that registration.

Runway is 100svh plus 5x64svh. updateRoute() maps scroll fraction to routeLength*(1-progress) dash offset, and picks discrete panel. Click scrolls to checkpoint. Arrow keys move focus only.

Retain one SVG/dash technique, but redraw both paths as landmark/switchback routes with x reversals, ridges and saddles; derive mobile from mobile painting composition.

## I. Experience panel

There is no JS data store: six static article panels in about.html 107-180 contain direct image/logo srcs. New order is oldest-to-newest; original old timeline was newest-to-oldest.

setActive() 99-121 toggles active, inert, aria-hidden, completed/current check state and aria-live message. CSS stacks panels in same grid cell and fades them (styles.css 991-1009).

Oversized disconnected panel comes from desktop second grid track minmax(320px,400px), full right-side dark gradient and border, 100% width, 30px vertical/24-42px horizontal padding, and centering in full-viewport stage (styles.css 847-855, 973-988). There is no oversized content min-height; header only has 52px min-height. On mobile it is a max-height 46svh bottom sheet with inner overflow-y auto (1347-1363).

Descriptions and links mostly remain, but some details are shortened/split (for example Samsung/IKEA summary). Original open details timeline is removed. No-JS remains readable because articles stay normal flow until is-live is applied.

## J. Lifecycle, responsive, accessibility

Direct About mount creates controller; persistent nav moves existing art then dispatches page:swap, triggering mount. Leaving About causes teardown/dispose: rAF/timer/listeners removed, overlay fades/removes after 340ms. pagehide tears down; BFCache pageshow remounts. Return to About repeats mountain reveal; it is not persisted. site-nav resets navigation scroll to 0. Direct restored/deep scroll determines selected route state after finish.

No obvious controller listener leak. Global module on all pages is unnecessary. Rapid navigation can overlap leaving overlay briefly for 340ms.

Portrait selection is orientation-only. Portrait CSS starts 1327; low-height landscape starts 1404. Resize preserves route fraction/repositions checkpoints. Checkpoints are native labelled buttons with focus, aria-controls/current, group/live support. However arrow keys do not select/scroll. Reduced motion/save-data get final plate/static route. Risks: narrow landscape can crowd desktop 320-400px panel; 46svh mobile sheet may dominate scene/create nested scrolling.

## K. Recommended repair plan

1. Preserve cinematic-hero.js, paint-motion.js, shaders, BrushField, sky clock, site-nav, and original home film handoff.
2. Replace independent per-frame Canvas-2D mountain compositing with existing WebGL texture/mask route or cached low-cost masks.
3. Retain transparent equal-dimension overlay and foreground exclusion; refine seam/grade rather than replace campsite.
4. Redraw SVG routes to terrain-aware switchbacks while retaining base/glow/lit and dash progress.
5. Replace large gradient side slab with compact visually anchored information treatment.
6. rAF-throttle route work; only change active classes at checkpoint transitions; profile/remove SVG filter.
7. Include mountain-expedition.js only on About page; retain dispose mechanism.
8. Test direct load, home-to-About-to-other-to-About, hidden tab, resize mid-reveal, narrow/short landscape, reduced-motion/save-data, and no-JS.

Preserve original renderer/navigation and semantic panels. Modify mountain controller, mountain variant/mask approach, SVG values, CSS. Remove per-tick full-frame Canvas compositor if GPU/cached replacement is used.

## L. Critical references

- Original handoff: assets/cinematic/cinematic-hero.js 76-100.
- Original renderer: assets/cinematic/paint-motion.js 176-231.
- Cover/sky stability shader: assets/cinematic/shaders/paint.frag 8-24.
- Original brush plan: assets/cinematic/paint-reveal.js 95-171.
- Mountain full-frame compositor: assets/cinematic/mountain-expedition.js 223-234.
- Mountain elapsed rAF: same file 261-297.
- Route geometry/checkpoints: same file 123-150.
- Route scroll binding: same file 192-207.
- Controller cleanup: same file 483-504.
- Desktop panel CSS: styles.css 847-1079.
- Responsive panel CSS: styles.css 1327-1450.

## ASTRA IMPLEMENTATION PRIORITIES

1. Replace per-frame high-resolution Canvas-2D compositing/dense bristle loops with GPU or cached-mask reveal.
2. Keep original home WebGL/video handoff and persistent sky unchanged.
3. Preserve transparent matched-dimension mountain composite; repair seams, not entire campsite.
4. Replace diagonal paths with terrain-following switchbacks using same SVG dash architecture.
5. Make panel compact/connected to route and rAF-throttle scroll updates.
