// Capture the mountain brush reveal as it progresses. This is a visual aid and
// a timing/coverage sanity check, not a substitute for the full behavior suite.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');

const base = process.env.TEST_URL || 'http://127.0.0.1:8766';
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  await fs.mkdir('tests/artifacts', { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(base + '/about.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mountain-canvas');
  const started = Date.now();
  const frames = [];
  for (const at of [120, 450, 800, 1150, 1500, 2000]) {
    const wait = Math.max(0, at - (Date.now() - started));
    if (wait) await page.waitForTimeout(wait);
    const state = await page.evaluate(() => {
      const canvas = document.querySelector('.mountain-canvas');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let covered = 0;
      let total = 0;
      for (let y = 0; y < canvas.height; y += 8) {
        for (let x = 0; x < canvas.width; x += 8) {
          total++;
          if (data[(y * canvas.width + x) * 4 + 3] > 8) covered++;
        }
      }
      return {
        coverage: covered / total,
        routeReady: document.querySelector('[data-expedition]').hasAttribute('data-route-ready'),
        elapsed: performance.now(),
      };
    });
    const shot = `tests/artifacts/reveal-${String(at).padStart(4, '0')}ms.png`;
    await page.screenshot({ path: shot });
    frames.push({ at, ...state, shot });
    console.log(at + 'ms', state);
  }
  await fs.writeFile('tests/artifacts/reveal-frames.json', JSON.stringify(frames, null, 2));
  const first = frames[0].coverage;
  const last = frames.at(-1).coverage;
  if (!(first < last) || last < 0.02) throw new Error('Mountain reveal was not progressive');
  console.log('PASS: mountain reveal coverage increases and settles.');
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
