// Run against the local static server; uses the existing Playwright install.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_URL || 'http://127.0.0.1:8766';
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  try {
    for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const page = await browser.newPage({viewport});
      const errors=[];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.heroStages = {};
        new MutationObserver(entries => {
          for (const entry of entries) if (entry.target.matches?.('[data-cinematic-hero]')) {
            const stage = entry.target.dataset.stage;
            window.heroStages[stage] ??= performance.now();
          }
        }).observe(document,{subtree:true,attributes:true,attributeFilter:['data-stage']});
      });
      await page.goto(base+'/index.html');
      const plan = await page.evaluate(async () => {
        const {PaintReveal,REVEAL_MS} = await import('/assets/cinematic/paint-reveal.js?v=9');
        const r = new PaintReveal();
        r.resize(innerWidth,innerHeight,innerWidth>innerHeight?1672:941,innerWidth>innerHeight?941:1672);
        const mid=Math.ceil(r.strokes.length/2);
        const timing=r.strokes.map(s=>({start:s.start,end:s.end,duration:s.duration,delay:s.delay||0}));
        r.advance(120);
        return {duration:REVEAL_MS,mid,timing,slowMiddle:r.strokes.filter(s=>s.wet&&s.duration>600).length,first:r.strokes[0].drawn,second:r.strokes[mid].drawn,next:r.strokes[1].drawn};
      });
      assert.equal(plan.duration,7680);
      assert.equal(plan.slowMiddle,1,'only the broad middle pass gets the extra slowdown');
      assert.equal(plan.timing.filter(s=>s.delay===3000).length,1,'only the middle pass waits an additional three seconds');
      assert.ok(plan.first>0 && plan.second>0 && plan.next===0,'both chains start together');
      plan.timing.forEach((s,i)=>{
        assert.equal(s.start,(i%plan.mid)*240+s.delay);
        assert.ok(Math.abs(s.end-s.start-s.duration*1.2)<.001);
        assert.ok(s.end<=plan.duration,'all gestures finish before settling');
      });
      await page.waitForFunction(()=>document.querySelector('[data-cinematic-hero]')?.dataset.stage==='painted',null,{timeout:40000});
      const elapsed=await page.evaluate(()=>heroStages.painted-heroStages.revealing);
      assert.ok(elapsed>=7400 && elapsed<10500,`reveal timing: ${elapsed}`);
      console.log(`${viewport.width}px: parallel painted reveal ${Math.round(elapsed)} ms`);
      await page.evaluate(()=>window.keptSky=document.querySelector('.cinematic-canvas'));
      if (viewport.width<701) await page.locator('.nav-toggle').click();
      await page.locator('#nav a[href="resume.html"]').click();
      await page.waitForSelector('img.resume-document');
      await page.waitForFunction(()=>document.querySelector('.resume-document').complete);
      assert.ok(await page.evaluate(()=>window.keptSky===document.querySelector('.cinematic-canvas')));
      assert.equal(await page.locator('iframe, embed, object').count(),0,'no PDF viewer controls');
      assert.equal(await page.locator('.resume-heading a').textContent(),'download');
      for (const size of [viewport,{width:360,height:640},{width:844,height:390}]) {
        await page.setViewportSize(size);
        await page.waitForTimeout(150);
        const fit=await page.evaluate(()=>{
          const r=document.querySelector('.resume-document').getBoundingClientRect();
          return {top:r.top,bottom:r.bottom,right:r.right,height:innerHeight,width:innerWidth,scroll:document.documentElement.scrollHeight-innerHeight};
        });
        assert.ok(fit.top>60 && fit.bottom<=fit.height+1 && fit.right<=fit.width && fit.scroll<=1,JSON.stringify(fit));
      }
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('PASS: parallel stroke chains, 20% slower pacing, desktop/mobile homepage completion, persistent sky, full paper preview, no resume scrolling.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
