// Prints the resume sheet in resume.html to assets/dylan-rolfe-resume.pdf, so the
// page and the PDF always say the same thing. Edit the resume in resume.html,
// then run:  node tools/build-resume-pdf.cjs
// PLAYWRIGHT_MODULE and CHROME_PATH may point at existing installs, as in tests/.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  try {
    // No scripts are needed to print, and without them nothing animates.
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.goto(pathToFileURL(path.join(root, 'resume.html')).href, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    const out = path.join(root, 'assets', 'dylan-rolfe-resume.pdf');
    await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    console.log('wrote', out);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
