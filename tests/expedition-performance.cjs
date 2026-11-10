// Same browser/settings for before/after. No screenshots or pixel readbacks
// during timing; these would perturb the very animation being measured.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const label = process.argv[2] || 'after';
const warm = process.argv.includes('--warm');
const out = `tests/artifacts/refine-${label}`;
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const reports = [];
  try {
    for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const page = await browser.newPage({viewport, deviceScaleFactor:1.5});
      if (label.startsWith('before')) {
        // Reproduce the committed baseline without changing the working tree.
        for (const file of ['about.html', 'styles.css', 'assets/cinematic/mountain-expedition.js']) {
          const body = execFileSync('git', ['show', `1527b829:${file}`], {encoding:'utf8'});
          await page.route(`**/${file}*`, route => route.fulfill({status:200, contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html', body}));
        }
      }
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({status:200,contentType:'text/css',body:''}));
      await page.addInitScript(() => {
        const stats = window.revealStats = { strokes:0, draws:0, canvasMs:0, tickMs:[], gaps:[], longTasks:[] };
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = callback => raf.call(window, now => {
          const start = performance.now();
          callback(now);
          if (callback.name === 'revealTick') stats.tickMs.push(performance.now()-start);
        });
        for (const name of ['stroke','drawImage','clearRect','fillRect']) {
          const original = CanvasRenderingContext2D.prototype[name];
          CanvasRenderingContext2D.prototype[name] = function(...args) {
            if (stats.done) return original.apply(this,args);
            if (name === 'stroke') stats.strokes++;
            if (name === 'drawImage') stats.draws++;
            if (this.canvas.classList.contains('mountain-canvas') && !stats.firstDraw) {
              stats.firstDraw = performance.now();
              stats.backing = [this.canvas.width, this.canvas.height];
              stats.longTasks = [];
            }
            const start = performance.now();
            const result = original.apply(this,args);
            stats.canvasMs += performance.now()-start;
            return result;
          };
        }
        new PerformanceObserver(list => { if (!stats.done) stats.longTasks.push(...list.getEntries().map(e=>e.duration)); }).observe({type:'longtask',buffered:true});
        let previous;
        function tick(now) {
          if (previous && stats.firstDraw) stats.gaps.push(now-previous);
          previous=now;
          if (document.querySelector('[data-route-ready]')) {
            stats.ready=performance.now(); stats.done=true;
          } else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      const base = process.env.TEST_URL || 'http://127.0.0.1:8766';
      if (warm) {
        await page.goto(base+'/projects.html');
        await page.waitForSelector('[data-displaying-gl]');
        await page.waitForTimeout(700);
        await page.locator('#nav a[href="about.html"]').evaluate(a=>a.click());
      } else await page.goto(base+'/about.html');
      await page.waitForFunction(()=>window.revealStats.done);
      const report=await page.evaluate(()=>{
        const s=window.revealStats, sorted=[...s.gaps].sort((a,b)=>a-b);
        const ticks=[...s.tickMs].sort((a,b)=>a-b);
        return {...s, gaps:undefined, tickMs:undefined, tickTotal:ticks.reduce((a,b)=>a+b,0), tickP95:ticks[Math.floor(ticks.length*.95)], tickMax:Math.max(...ticks), frames:sorted.length, frameMedian:sorted[Math.floor(sorted.length*.5)], frameP95:sorted[Math.floor(sorted.length*.95)], maxFrame:Math.max(...sorted), revealMs:s.ready-s.firstDraw};
      });
      reports.push({viewport,...report});
      await page.waitForTimeout(500);
      await page.screenshot({path:`${out}/${viewport.width}-initial.png`});
      await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';const r=document.querySelector('[data-expedition-runway]');scrollTo(0,r.offsetTop+(r.offsetHeight-innerHeight)*.66);});
      await page.waitForTimeout(500);
      await page.screenshot({path:`${out}/${viewport.width}-route.png`});
      await page.close();
    }
  } finally { await browser.close(); }
  await fs.writeFile(`${out}/performance.json`,JSON.stringify(reports,null,2));
  console.log(JSON.stringify(reports,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
