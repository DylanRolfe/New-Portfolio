// Local visual and behavior verification for the About expedition timeline.
// Run with a static server on 8766, or set TEST_URL.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.TEST_URL || 'http://127.0.0.1:8766';
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  await fs.mkdir('tests/artifacts/refine-validation', { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chrome,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const failures = [];
  const makePage = async (options = {}, init) => {
    const page = await browser.newPage(options);
    if (init) await page.addInitScript(init);
    page.on('pageerror', error => {
      console.log('PAGEERROR', error.message);
      failures.push(`pageerror: ${error.message}`);
    });
    page.on('console', message => {
      if (message.type() === 'error') {
        console.log('CONSOLE', message.text());
        failures.push(`console: ${message.text()}`);
      }
    });
    page.on('response', response => {
      if (response.status() >= 400 && response.url().startsWith(base)) {
        failures.push(`http ${response.status()}: ${response.url()}`);
      }
    });
    // Keep the test independent of the font CDN without logging a network
    // failure. The local fallback stack is already part of the design.
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '',
    }));
    await page.route('https://fonts.gstatic.com/**', route => route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      body: '',
    }));
    return page;
  };

  const ready = async page => {
    try {
      await page.waitForFunction(
        () => document.querySelector('[data-expedition]')?.hasAttribute('data-route-ready'),
        null,
        { timeout: 12000 },
      );
    } catch (error) {
      console.log('READY TIMEOUT', await page.evaluate(() => ({
        url: location.pathname,
        section: Boolean(document.querySelector('[data-expedition]')),
        live: document.querySelector('[data-expedition]')?.classList.contains('is-live'),
        ready: document.querySelector('[data-expedition]')?.hasAttribute('data-route-ready'),
        canvas: document.querySelectorAll('.mountain-canvas').length,
        canvasSize: (() => {
          const canvas = document.querySelector('.mountain-canvas');
          return canvas ? [canvas.width, canvas.height] : null;
        })(),
        hidden: document.hidden,
        visibility: document.visibilityState,
        art: Boolean(document.querySelector('.cinematic-art')),
      })));
      throw error;
    }
  };

  const stageStart = async page => page.evaluate(() => {
    const runway = document.querySelector('[data-expedition-runway]');
    const stage = document.querySelector('[data-expedition-stage]');
    return runway.getBoundingClientRect().top + window.scrollY;
  });

  const scrollProgress = async (page, fraction) => {
    await page.evaluate(target => {
      document.documentElement.style.scrollBehavior = 'auto';
      const runway = document.querySelector('[data-expedition-runway]');
      const stage = document.querySelector('[data-expedition-stage]');
      const top = runway.getBoundingClientRect().top + window.scrollY;
      const distance = runway.offsetHeight - stage.offsetHeight;
      window.scrollTo(0, top + distance * target);
    }, fraction);
    await page.waitForFunction(
      target => Math.abs(parseFloat(
        getComputedStyle(document.querySelector('[data-expedition]')).getPropertyValue('--expedition-progress'),
      ) - target) < 0.02,
      fraction,
      { timeout: 6000 },
    ).catch(async error => {
      console.log('scroll progress mismatch', await page.evaluate(() => {
        const section = document.querySelector('[data-expedition]');
        const runway = document.querySelector('[data-expedition-runway]');
        const stage = document.querySelector('[data-expedition-stage]');
        return {
          scrollY,
          docHeight: document.documentElement.scrollHeight,
          innerHeight,
          progress: getComputedStyle(section).getPropertyValue('--expedition-progress'),
          sectionTop: section.getBoundingClientRect().top,
          runwayTop: runway.getBoundingClientRect().top,
          runwayHeight: runway.offsetHeight,
          stageHeight: stage.offsetHeight,
          active: section.querySelector('.experience-panel.is-active')?.dataset.panel,
        };
      }));
      throw error;
    });
  };

  const activePanel = page => page.evaluate(() => {
    const panel = document.querySelector('.experience-panel.is-active');
    return {
      index: Number(panel?.dataset.panel),
      org: panel?.querySelector('.experience-org')?.textContent.trim(),
      hidden: panel?.getAttribute('aria-hidden'),
      current: document.querySelector('[data-checkpoint][aria-current="step"]')?.dataset.checkpoint,
      dashOffset: Number(document.querySelector('[data-route-lit]').style.strokeDashoffset),
      dashLength: Number(document.querySelector('[data-route-lit]').style.strokeDasharray),
      routeReady: document.querySelector('[data-expedition]').hasAttribute('data-route-ready'),
      progress: getComputedStyle(document.querySelector('[data-expedition]')).getPropertyValue('--expedition-progress').trim(),
    };
  });

  const overlayCoverage = page => page.evaluate(() => {
    const canvas = document.querySelector('.mountain-canvas');
    if (!canvas) return -1;
    const context = canvas.getContext('2d');
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    let samples = 0;
    for (let y = 0; y < canvas.height; y += 8) {
      for (let x = 0; x < canvas.width; x += 8) {
        samples++;
        if (data[(y * canvas.width + x) * 4 + 3] > 8) visible++;
      }
    }
    return visible / samples;
  });

  try {
    // Desktop journey.
    const desktop = await makePage({ viewport: { width: 1440, height: 900 } });
    await desktop.goto(base + '/about.html', { waitUntil: 'domcontentloaded' });
    await desktop.waitForSelector('.mountain-canvas');
    await desktop.waitForTimeout(550);
    await desktop.screenshot({ path: 'tests/artifacts/refine-validation/about-desktop-reveal.png' });
    await ready(desktop);
    await desktop.waitForTimeout(350);
    await desktop.screenshot({ path: 'tests/artifacts/refine-validation/about-desktop-intro.png' });
    assert.equal(await desktop.locator('.mountain-canvas').count(), 1, 'one mountain overlay is mounted');
    const coverage = await overlayCoverage(desktop);
    assert.ok(coverage > 0.02 && coverage < 0.95, `mountain overlay covers a band, got ${coverage}`);

    await scrollProgress(desktop, 0);
    let state = await activePanel(desktop);
    assert.equal(state.index, 0, 'start is ClearCraft');
    assert.equal(state.org, 'clearcraft');
    assert.equal(state.current, '0');
    assert.ok(state.dashOffset > 0);
    const layout = await desktop.evaluate(() => {
      const panel = document.querySelector('.expedition-info').getBoundingClientRect();
      const hits = [...document.querySelectorAll('.checkpoint')].map(button => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return Boolean(hit?.closest('[data-checkpoint]') === button);
      });
      return { panelLeft: panel.left, panelRight: panel.right, hits, width: innerWidth };
    });
    assert.ok(layout.panelLeft > layout.width * 0.52, 'information rail sits in the right column');
    assert.ok(layout.panelRight <= layout.width, 'information rail stays inside the viewport');
    assert.deepEqual(layout.hits, [true, false, false, false, false, false], 'only the first camp is revealed at the start');
    await desktop.screenshot({ path: 'tests/artifacts/refine-validation/about-desktop-route-start.png' });

    await scrollProgress(desktop, 0.5);
    state = await activePanel(desktop);
    assert.equal(state.index, 2, 'halfway is Samsung & IKEA');
    assert.equal(state.org, 'samsung & ikea');
    assert.ok(state.dashOffset < state.dashLength);
    await desktop.waitForTimeout(450);
    await desktop.screenshot({ path: 'tests/artifacts/refine-validation/about-desktop-route-mid.png' });

    await scrollProgress(desktop, 1);
    state = await activePanel(desktop);
    assert.equal(state.index, 5, 'the route finishes at Waterloo');
    assert.equal(state.org, 'university of waterloo');
    assert.ok(state.dashOffset < 1);
    await desktop.waitForTimeout(450);
    await desktop.screenshot({ path: 'tests/artifacts/refine-validation/about-desktop-route-end.png' });

    await scrollProgress(desktop, 0.1);
    state = await activePanel(desktop);
    assert.equal(state.index, 0, 'reverse scroll returns to the first camp');

    await scrollProgress(desktop, 1);
    await desktop.locator('[data-checkpoint="3"]').click();
    await desktop.waitForFunction(() => document.querySelector('.experience-panel.is-active')?.dataset.panel === '3');
    state = await activePanel(desktop);
    assert.equal(state.org, 'strive');
    assert.equal(state.hidden, 'false');
    assert.equal(await desktop.locator('.experience-panel[aria-hidden="true"]').count(), 5);

    await desktop.locator('[data-checkpoint="0"]').focus();
    await desktop.keyboard.press('End');
    await desktop.waitForFunction(() => document.activeElement?.dataset?.checkpoint === '5');
    const focused = await desktop.evaluate(() => document.activeElement?.dataset?.checkpoint);
    assert.equal(focused, '5', 'arrow/End keys move between checkpoints');

    const panelBox = await desktop.locator('.expedition-info').boundingBox();
    const stageBox = await desktop.locator('[data-expedition-stage]').boundingBox();
    assert.ok(panelBox.width > 300, 'desktop information rail has width');
    assert.ok(stageBox.height >= 850, 'desktop stage is full height');
    assert.equal(await desktop.locator('.checkpoint').count(), 6);

    // Soft navigation away and back must remove and remount exactly one overlay.
    await desktop.locator('#nav a[href="projects.html"]').click();
    await desktop.waitForSelector('body .project-grid-equal');
    await desktop.waitForTimeout(500);
    assert.equal(await desktop.locator('.mountain-canvas').count(), 0, 'overlay removed after leaving About');
    await desktop.locator('#nav a[href="about.html"]').click();
    await desktop.waitForSelector('[data-expedition]');
    await ready(desktop);
    assert.equal(await desktop.locator('.mountain-canvas').count(), 1, 'overlay remounts once on return');
    await desktop.close();

    // Portrait journey and layout.
    const mobile = await makePage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await mobile.goto(base + '/about.html', { waitUntil: 'domcontentloaded' });
    await ready(mobile);
    await mobile.waitForTimeout(250);
    await mobile.screenshot({ path: 'tests/artifacts/refine-validation/about-mobile-intro.png' });
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `no horizontal overflow, got ${overflow}`);
    await scrollProgress(mobile, 0);
    const mobileLayout = await mobile.evaluate(() => {
      const panel = document.querySelector('.expedition-info').getBoundingClientRect();
      const checkpoints = [...document.querySelectorAll('.checkpoint')].map(button => {
        const box = button.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height };
      });
      return {
        panelTop: panel.top,
        viewport: { width: innerWidth, height: innerHeight },
        checkpoints,
        map: document.querySelector('[data-expedition-map]').getAttribute('viewBox'),
        stageHeight: document.querySelector('[data-expedition-stage]').offsetHeight,
      };
    });
    assert.equal(mobileLayout.map, '0 0 941 1672');
    assert.equal(mobileLayout.stageHeight, 844);
    assert.ok(mobileLayout.checkpoints.every(point => point.width >= 44 && point.height >= 44), '44px tap targets');
    assert.ok(mobileLayout.checkpoints.every(point => point.y + point.height / 2 <= mobileLayout.panelTop + 1), 'checkpoints sit above the panel');
    await mobile.screenshot({ path: 'tests/artifacts/refine-validation/about-mobile-route-start.png' });
    await scrollProgress(mobile, 0.5);
    const mobileState = await activePanel(mobile);
    assert.equal(mobileState.index, 2);
    await mobile.waitForTimeout(450);
    await mobile.screenshot({ path: 'tests/artifacts/refine-validation/about-mobile-route-mid.png' });
    await mobile.locator('[data-checkpoint="2"]').focus();
    await mobile.keyboard.press('End');
    await mobile.waitForFunction(() => {
      const progress = parseFloat(getComputedStyle(document.querySelector('[data-expedition]')).getPropertyValue('--expedition-progress'));
      return progress > 0.94 && document.querySelector('.experience-panel.is-active')?.dataset.panel === '5';
    });
    await mobile.waitForTimeout(450);
    await mobile.screenshot({ path: 'tests/artifacts/refine-validation/about-mobile-route-end.png' });

    // Rotate: the shared canvas and route geometry swap, and the same camp is
    // preserved. Return to mid-route for a landscape frame.
    await mobile.setViewportSize({ width: 844, height: 390 });
    await mobile.waitForFunction(() => document.querySelector('[data-expedition-map]')?.getAttribute('viewBox') === '0 0 1672 941');
    assert.equal(await mobile.locator('.mountain-canvas').count(), 1);
    await scrollProgress(mobile, 0.5);
    const landscapeState = await activePanel(mobile);
    assert.equal(landscapeState.index, 2);
    await mobile.waitForTimeout(450);
    await mobile.screenshot({ path: 'tests/artifacts/refine-validation/about-mobile-landscape.png' });
    await mobile.close();

    // Compact phone: every checkpoint must still sit above the information
    // panel with a 44px target and no horizontal overflow.
    const compact = await makePage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
    await compact.goto(base + '/about.html', { waitUntil: 'domcontentloaded' });
    await ready(compact);
    await scrollProgress(compact, 0);
    const compactLayout = await compact.evaluate(() => {
      const panel = document.querySelector('.expedition-info').getBoundingClientRect();
      const points = [...document.querySelectorAll('.checkpoint')].map(button => {
        const box = button.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height };
      });
      let minDistance = Infinity;
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
        minDistance = Math.min(minDistance, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
      }
      return {
        panelTop: panel.top,
        points,
        minDistance,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.ok(compactLayout.points.every(point => point.y + point.height / 2 <= compactLayout.panelTop + 1));
    assert.ok(compactLayout.points.every(point => point.width >= 44 && point.height >= 44));
    assert.ok(compactLayout.minDistance > 36, `checkpoint targets remain distinct, got ${compactLayout.minDistance}`);
    assert.ok(compactLayout.overflow <= 1);
    await compact.screenshot({ path: 'tests/artifacts/refine-validation/about-mobile-compact.png' });
    await compact.close();

    // Reduced motion gets the final plate and a static trail immediately.
    const reduced = await makePage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await reduced.goto(base + '/about.html', { waitUntil: 'domcontentloaded' });
    await ready(reduced);
    const reducedState = await reduced.evaluate(() => ({
      dashOffset: Number(document.querySelector('[data-route-lit]').style.strokeDashoffset),
      covered: Boolean(document.querySelector('.mountain-canvas')),
      static: document.querySelector('[data-expedition]').classList.contains('is-static'),
    }));
    assert.ok(reducedState.covered);
    assert.ok(reducedState.static);
    assert.ok(reducedState.dashOffset > 0, 'reduced-motion trail waits for scrolling');
    await reduced.screenshot({ path: 'tests/artifacts/refine-validation/about-reduced-motion.png' });
    await reduced.close();

    // Data-saver: finished plate and static trail, no brush playback.
    const saveData = await makePage({ viewport: { width: 1280, height: 800 } }, () => {
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true, addEventListener() {}, removeEventListener() {} },
      });
    });
    await saveData.goto(base + '/about.html', { waitUntil: 'domcontentloaded' });
    await ready(saveData);
    const saveState = await saveData.evaluate(() => ({
      dashOffset: Number(document.querySelector('[data-route-lit]').style.strokeDashoffset),
      static: document.querySelector('[data-expedition]').classList.contains('is-static'),
      covered: Boolean(document.querySelector('.mountain-canvas')),
    }));
    assert.ok(saveState.static, 'data-saver uses the static presentation');
    assert.ok(saveState.covered);
    assert.ok(saveState.dashOffset > 0, 'data-saver trail waits for scrolling');
    await saveData.close();

    // No WebGL: the 2D mountain plate and the SVG route remain usable.
    const noWebgl = await makePage({ viewport: { width: 1280, height: 800 } }, () => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === 'webgl' ? null : original.call(this, type, ...args);
      };
    });
    await noWebgl.goto(base + '/about.html', { waitUntil: 'domcontentloaded' });
    await ready(noWebgl);
    assert.equal(await noWebgl.locator('.mountain-canvas').count(), 1);
    assert.equal(await noWebgl.locator('.checkpoint').count(), 6);

    // The photo belt and lightbox now live beneath Follow the Journey.
    assert.equal(await noWebgl.locator('#life').count(), 0);
    await noWebgl.goto(base + '/stay-in-touch.html', { waitUntil: 'domcontentloaded' });
    await noWebgl.locator('#life').scrollIntoViewIfNeeded();
    await noWebgl.evaluate(() => {
      document.querySelector('.life-belt-set:not(.life-belt-set-clone) .life-photo').click();
    });
    await noWebgl.waitForSelector('dialog#lightbox[open]');
    assert.equal(await noWebgl.locator('#lightbox').evaluate(dialog => dialog.open), true);
    await noWebgl.keyboard.press('Escape');
    await noWebgl.waitForFunction(() => !document.querySelector('#lightbox')?.open);
    await noWebgl.close();

    // The homepage's existing campsite transition must still complete and must
    // not acquire the About-only overlay.
    const home = await makePage({ viewport: { width: 1280, height: 800 } });
    await home.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await home.waitForFunction(() => document.querySelector('header')?.dataset.stage === 'painted', null, { timeout: 45000 });
    assert.equal(await home.locator('.mountain-canvas').count(), 0, 'home never receives the mountain canvas');
    assert.equal(await home.locator('video').evaluate(video => video.paused), true);
    await home.evaluate(() => { window.homeSky = document.querySelector('.cinematic-canvas'); });
    await home.locator('#nav a[href="about.html"]').click();
    await ready(home);
    assert.ok(await home.evaluate(() => window.homeSky === document.querySelector('.cinematic-canvas')), 'home to About preserves the renderer');
    await home.locator('#nav a[href="projects.html"]').click();
    await home.waitForSelector('.project-grid-equal');
    await home.waitForTimeout(400);
    assert.equal(await home.locator('.mountain-canvas').count(), 0);
    await home.close();

    assert.deepEqual(failures, [], `page errors or failed requests: ${failures.join('\n')}`);
    console.log('PASS: mountain reveal, scroll route, reverse/click/keyboard, soft navigation, portrait, landscape, reduced motion, and homepage transition.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
