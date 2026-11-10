const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.TEST_URL || 'http://127.0.0.1:8766';
const out = 'tests/artifacts/refine-followup';
(async () => {
  await fs.mkdir(out, {recursive:true});
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const errors=[];
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  const ready=()=>page.waitForSelector('[data-route-ready]');
  const select=async i=>{
    const current = Number(await page.locator('.experience-panel.is-active').getAttribute('data-panel'));
    if (i > current) {
      await page.locator(`[data-checkpoint="${current}"]`).focus();
      for (let next = current + 1; next <= i; next++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(n => document.querySelector('.experience-panel.is-active')?.dataset.panel === String(n), next);
      }
    } else await page.locator(`[data-checkpoint="${i}"]`).click();
    await page.waitForFunction(i=>document.querySelector('.experience-panel.is-active')?.dataset.panel===String(i),i);
    await page.waitForTimeout(450);
  };
  try {
    await page.goto(base+'/about.html');
    await ready();
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => [...document.fonts].some(f => f.family === 'Expedition Plex' && f.status === 'loaded')), 'local IBM Plex Mono actually loads');
    assert.equal(await page.locator('[data-route-base]').evaluate(p=>getComputedStyle(p).stroke),'none');
    assert.equal(await page.locator('.checkpoint:visible').count(),6, 'future camps remain dimly visible');
    await page.screenshot({path:`${out}/about-start.png`});
    await page.evaluate(()=>{window.originalSky=document.querySelector('.cinematic-canvas');window.originalArt=document.querySelector('.cinematic-art');});
    for(const i of [0,1,2,3,4,5,4,3,2,1,0]) await select(i);
    await select(3);
    await page.screenshot({path:`${out}/final-desktop-partial.png`});
    await select(5);
    await page.screenshot({path:`${out}/final-desktop-summit.png`});
    // The summit remains aligned after scrolling to the document's end.
    await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,document.documentElement.scrollHeight);});
    await page.mouse.wheel(0,1800);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-expedition-stage]').evaluate(s=>s.getBoundingClientRect().top),0);
    assert.equal(await page.locator('#life').count(),0);
    assert.equal(await page.locator('.expedition-coordinates').count(),0);
    const nav = await page.locator('#nav').evaluate(n=>{const s=getComputedStyle(n);return [s.backgroundColor,s.backgroundImage,s.backdropFilter,s.borderBottomWidth];});
    assert.deepEqual(nav,['rgba(0, 0, 0, 0)','none','none','0px']);
    await page.locator('#nav a[href="stay-in-touch.html"]').click();
    await page.waitForSelector('#life [data-life-belt][data-wired="1"]');
    assert.equal(await page.locator('.life-belt-set-clone').count(),1);
    await page.locator('#life').scrollIntoViewIfNeeded();
    await page.waitForSelector('#life .life-belt.visible');
    await page.waitForTimeout(700);
    await page.locator('.life-belt-set:not(.life-belt-set-clone) .life-photo').first().evaluate(b=>b.click());
    await page.waitForSelector('#lightbox[open]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#lightbox').open);
    await page.waitForTimeout(400);
    await page.screenshot({path:`${out}/follow-the-journey-workshop.png`});
    await page.locator('#nav a[href="about.html"]').click();
    await ready();
    // Persistent canvas identity, rapid leave during reveal, and repeated return.
    for(let i=0;i<3;i++) {
      await page.locator('#nav a[href="projects.html"]').click();
      await page.waitForSelector('.project-grid-equal');
      await page.waitForTimeout(400);
      assert.equal(await page.locator('.mountain-canvas').count(),0);
      await page.locator('#nav a[href="about.html"]').click();
      await page.waitForSelector('[data-expedition]');
      if(i===2) await ready();
      else await page.waitForTimeout(200);
      assert.equal(await page.locator('.mountain-canvas').count(),1);
      assert.ok(await page.evaluate(()=>window.originalSky===document.querySelector('.cinematic-canvas') && window.originalArt===document.querySelector('.cinematic-art')));
    }
    // Resize without rotation: checkpoints remain on the same artwork points.
    for(const viewport of [{width:1024,height:768},{width:1440,height:900},{width:844,height:390},{width:360,height:640},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      await select(3);
      const layout=await page.evaluate(()=>{
        const points=[...document.querySelectorAll('.checkpoint')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.checkpoint')===b};});
        const panel=document.querySelector('.experience-panel.is-active').getBoundingClientRect();
        const info=document.querySelector('.expedition-info');
        return {points,panelBottom:panel.bottom,overflow:document.documentElement.scrollWidth-innerWidth,nested:getComputedStyle(info).overflowY,viewport:[innerWidth,innerHeight]};
      });
      assert.ok(layout.points.every((p,i)=>p.hit === (i<=3)),JSON.stringify(layout));
      assert.ok(layout.panelBottom<=viewport.height,JSON.stringify(layout));
      assert.ok(layout.overflow<=1);
      assert.notEqual(layout.nested,'auto');
      await page.screenshot({path:`${out}/final-${viewport.width}x${viewport.height}.png`});
      await select(5);
      await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
      await page.mouse.wheel(0,1800);
      await page.waitForTimeout(150);
      assert.equal(await page.locator('[data-expedition-stage]').evaluate(s=>s.getBoundingClientRect().top),0,'summit stays fixed at the document end');
    }
    // Simulate document visibility deterministically (headless tabs do not
    // consistently become hidden). Exercise the real visibilitychange handler.
    await page.goto(base+'/about.html');
    await page.waitForSelector('.mountain-canvas');
    await page.waitForTimeout(300);
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});
      window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(6200);
    assert.equal(await page.locator('[data-route-ready]').count(),0,'hidden time cannot finish reveal');
    await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
    await ready();
    // Live preference changes update the route even without another scroll.
    await select(2);
    const offset = await page.locator('[data-route-lit]').evaluate(p=>Number(p.style.strokeDashoffset));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForSelector('.expedition.is-static');
    assert.equal(await page.locator('[data-route-lit]').evaluate(p=>Number(p.style.strokeDashoffset)), offset);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(()=>Number(document.querySelector('[data-route-lit]').style.strokeDashoffset)>0);
    // A resize during painting keeps one overlay and finishes on portrait art.
    await page.setViewportSize({width:1440,height:900});
    await page.goto(base+'/about.html');
    await page.waitForSelector('.mountain-canvas');
    await page.setViewportSize({width:390,height:844});
    await page.setViewportSize({width:844,height:390});
    await page.setViewportSize({width:390,height:844});
    await ready();
    assert.equal(await page.locator('.mountain-canvas').count(),1);
    assert.equal(await page.locator('[data-expedition-map]').getAttribute('viewBox'),'0 0 941 1672');
    // The cached brush covers the entire mountain before the final still.
    const coverage=await page.evaluate(async()=>{
      const {MountainBrush}=await import('/assets/cinematic/mountain-brush.js?v=1');
      const brush=new MountainBrush(900,276,1800);brush.advance(1799);
      const pixels=brush.context.getImageData(0,0,900,276).data;
      let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>250)opaque++;
      return opaque/(900*276);
    });
    assert.ok(coverage>.995,`no final fill pop: ${coverage}`);
    const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
    await noJS.goto(base+'/about.html');
    assert.equal(await noJS.locator('.experience-panel:visible').count(),6);
    assert.equal(await noJS.locator('.experience-panel[inert]').count(),0);
    await noJS.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: all six camps forward/reverse, repeated navigation and canvas identity, desktop/mobile/landscape resize, simulated hidden interruption, live reduced motion, rotation during reveal, complete brush coverage, no-JS.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
