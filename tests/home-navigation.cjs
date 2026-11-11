const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_URL || 'http://127.0.0.1:8766';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const errors = [];
  async function makePage(options = {}) {
    const page = await browser.newPage(options);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    return page;
  }
  async function tab(page, href) {
    const toggle = page.locator('.nav-toggle');
    if (await toggle.isVisible()) {
      const open = await toggle.getAttribute('aria-expanded') === 'true';
      if (open !== (href !== 'index.html')) await toggle.click();
    }
    await page.locator(`#nav a[href="${href}"]`).click();
    await page.waitForURL(`**/${href}`);
  }
  async function painted(page) {
    await page.waitForFunction(() => document.querySelector('[data-cinematic-hero]')?.dataset.stage === 'painted');
    await page.waitForFunction(() => {
      const copy = document.querySelector('.hero-copy');
      return copy && [...copy.children].every(child => Number(getComputedStyle(child).opacity) > .99);
    });
    assert.equal(await page.locator('[data-site-backdrop]').count(), 0, 'painting returns to the hero');
    assert.equal(await page.locator('.cinematic-art').count(), 1, 'only one painted surface');
    assert.equal(await page.locator('.cinematic-video').evaluate(v => getComputedStyle(v).visibility), 'hidden');
  }
  try {
    for (const viewport of [{width:1440,height:900}, {width:390,height:844}]) {
      const page = await makePage({viewport});
      await page.goto(base + '/');
      await page.waitForFunction(() => document.querySelector('[data-cinematic-hero]')?.dataset.stage === 'playing');
      await page.waitForFunction(() => document.querySelector('[data-cinematic-hero]')?.dataset.stage === 'painted', null, {timeout:45000});
      assert.equal(await page.evaluate(() => sessionStorage.getItem('dylan-home-campsite-painted')), '1');
      await page.evaluate(() => window.keptArt = document.querySelector('.cinematic-art'));
      for (const href of ['projects.html', 'writing.html', 'resume.html']) {
        await tab(page, href);
        await tab(page, 'index.html');
        await painted(page);
        assert.ok(await page.evaluate(() => window.keptArt === document.querySelector('.cinematic-art')), 'preserves live artwork');
      }
      await tab(page, 'projects.html');
      await page.goBack();
      await painted(page);
      await page.goForward();
      await page.waitForSelector('.project-grid-equal, .project-grid');
      await page.reload();
      await tab(page, 'index.html');
      await painted(page);
      await page.reload();
      await painted(page);
      await page.close();
      console.log(`PASS ${viewport.width}px: completed intro, repeated tabs, history, reload`);
    }
    for (const stage of ['playing', 'revealing']) {
      const page = await makePage();
      await page.goto(base + '/');
      await page.waitForFunction(stage => document.querySelector('[data-cinematic-hero]')?.dataset.stage === stage, stage, {timeout:30000});
      await tab(page, 'projects.html');
      await page.goBack();
      await painted(page);
      await page.close();
      console.log(`PASS departure during ${stage}`);
    }
    const page = await makePage({reducedMotion:'reduce'});
    await page.goto(base + '/projects.html');
    await tab(page, 'index.html');
    await painted(page);
    await tab(page, 'projects.html');
    await tab(page, 'index.html');
    await painted(page);
    await page.close();
    assert.deepEqual(errors, []);
    console.log('PASS reduced-motion/static fallback and direct subpage entry; no page errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
