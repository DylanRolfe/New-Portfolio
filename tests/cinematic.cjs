// Run against `python -m http.server 8765 --bind 127.0.0.1` with Playwright
// installed. PLAYWRIGHT_MODULE and CHROME_PATH may point to existing installs.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const base = process.env.TEST_URL || 'http://127.0.0.1:8765';

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROME_PATH || undefined,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const errors = [];
  const makePage = async options => {
    const page = await browser.newPage(options);
    // Keep local rendering verification independent of the font CDN.
    await page.route('https://fonts.googleapis.com/**',route=>route.abort());
    await page.route('https://fonts.gstatic.com/**',route=>route.abort());
    page.on('pageerror', e => errors.push(e.message));
    return page;
  };
  try {
    const page = await makePage({viewport:{width:1280,height:720}});
    await page.route('**/__renderer_test', route => route.fulfill({contentType:'text/html',body:`
      <base href="${base}/"><style>body{margin:0}#hero,.cinematic-art,canvas,img{position:absolute;inset:0;width:100%;height:100%}img{visibility:hidden}</style>
      <div id="hero" data-stage="revealing"><div class="cinematic-art"><img src="assets/cinematic/Images/painting-desktop.webp" data-mask="assets/cinematic/Images/sky-desktop.png" data-flow="assets/cinematic/Images/flow-desktop.png"><canvas></canvas></div></div>`}));
    await page.goto(base+'/__renderer_test');
    const renderer = await page.evaluate(async () => {
      let now=1000, id=0; const frames=new Map();
      window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
      window.cancelAnimationFrame=id=>frames.delete(id);
      Object.defineProperty(performance,'now',{value:()=>now});
      const {createPaintMotion}=await import('./assets/cinematic/paint-motion.js?v=8');
      const hero=document.querySelector('#hero'), art=document.querySelector('.cinematic-art'), img=document.querySelector('img');
      await img.decode();
      const scene=createPaintMotion(hero,art,img,()=>img,()=>true,hero,true);
      if(!await scene.prime()) throw Error('WebGL did not initialize');
      scene.startReveal(()=>hero.dataset.stage='painted');
      const gl=document.querySelector('canvas').getContext('webgl');
      const step=t=>{now=t+1000;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f(now));};
      const pixels=()=>{const b=new Uint8Array(gl.canvas.width*gl.canvas.height*4);gl.readPixels(0,0,gl.canvas.width,gl.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
      const diff=(a,b)=>a.reduce((n,v,i)=>n+(v!==b[i]),0);
      step(8000); const before=pixels();
      hero.dispatchEvent(new PointerEvent('pointermove',{clientX:800,clientY:100,isPrimary:true}));
      step(8000); const pointerDiff=diff(before,pixels());
      scene.sleep(); now+=10000; scene.resume();
      step(18000); const suspensionDiff=diff(before,pixels());
      step(28000); const end=pixels();
      step(28000); const handoffDiff=diff(end,pixels());
      let minAlpha=255; for(let i=3;i<end.length;i+=4)minAlpha=Math.min(minAlpha,end[i]);
      // Compare the final GL crop/orientation/colors to ordinary 2D cover.
      const expected=document.createElement('canvas'); expected.width=gl.canvas.width;expected.height=gl.canvas.height;
      const ctx=expected.getContext('2d'), scale=Math.max(expected.width/img.naturalWidth,expected.height/img.naturalHeight);
      ctx.drawImage(img,(expected.width-img.naturalWidth*scale)/2,(expected.height-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale);
      const target=ctx.getImageData(0,0,expected.width,expected.height).data;
      let error=0; for(let y=0;y<expected.height;y++)for(let x=0;x<expected.width;x++)for(let c=0;c<3;c++)error+=Math.abs(end[((expected.height-1-y)*expected.width+x)*4+c]-target[(y*expected.width+x)*4+c]);
      step(30000); const live=pixels(); let foregroundDiff=0,skyDiff=0;
      for(let y=0;y<gl.canvas.height;y++)for(let x=0;x<gl.canvas.width;x++){
        const k=(y*gl.canvas.width+x)*4;
        if(live[k]!==end[k]||live[k+1]!==end[k+1]||live[k+2]!==end[k+2]){
          if(y<gl.canvas.height*.42)foregroundDiff++;
          if(y>gl.canvas.height*.7)skyDiff++;
        }
      }
      return {pointerDiff,suspensionDiff,handoffDiff,minAlpha,foregroundDiff,skyDiff,coverMeanError:error/(expected.width*expected.height*3),glError:gl.getError()};
    });
    assert.equal(renderer.pointerDiff,0); assert.equal(renderer.suspensionDiff,0);
    assert.equal(renderer.handoffDiff,0); assert.equal(renderer.minAlpha,255);
    assert.equal(renderer.foregroundDiff,0); assert.ok(renderer.skyDiff>0);
    assert.ok(renderer.coverMeanError<3); assert.equal(renderer.glError,0);
    console.log('Renderer:',renderer);
    const masks=await page.evaluate(async()=>{
      const {PaintReveal}=await import('./assets/cinematic/paint-reveal.js?v=8');
      return [[1280,720,1672,941],[390,844,941,1672],[2560,1080,1672,941],[844,390,1672,941]].map(([w,h,aw,ah])=>{
        const m=new PaintReveal();m.resize(w,h,aw,ah);let previous=null,regressions=0,coverage=[];
        if(m.strokes[1].start-m.strokes[0].start!==200||m.strokes[0].duration<1000)throw Error('Brushes should overlap at 0.2-second intervals while retaining slow strokes');
        for(const t of [100,1800,5000,9000,12100]){
          m.advance(t);const p=m.context.getImageData(0,0,m.canvas.width,m.canvas.height).data;let sum=0;
          for(let i=3;i<p.length;i+=4){sum+=p[i];if(previous&&p[i]<previous[i])regressions++;}
          coverage.push(sum/(p.length/4)/255);previous=p;
        }
        return {w,h,regressions,coverage};
      });
    });
    for(const m of masks){assert.equal(m.regressions,0);assert.equal(m.coverage.at(-1),1);assert.ok(m.coverage[0]>.001);}
    console.log('Cumulative masks:',masks);
    await page.close();

    for(const kind of ['reduced','saveData','autoplay','webgl']){
      const p=await makePage({viewport:{width:800,height:600},reducedMotion:kind==='reduced'?'reduce':'no-preference'});
      if(kind==='saveData')await p.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true,addEventListener(){}}}));
      if(kind==='autoplay')await p.addInitScript(()=>HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Blocked','NotAllowedError')));
      if(kind==='webgl')await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args);};});
      await p.goto(base,{waitUntil:'domcontentloaded'});
      await p.waitForFunction(()=>document.querySelector('header').dataset.stage==='painted',null,{timeout:15000});
      await p.locator('.cinematic-painting').evaluate(img=>img.decode());
      const state=await p.evaluate(()=>({decoded:document.querySelector('.cinematic-painting').naturalWidth>0,paused:document.querySelector('video').paused,visible:getComputedStyle(document.querySelector('.cinematic-painting')).visibility}));
      assert.ok(state.decoded&&state.paused);assert.equal(state.visible,'visible');
      console.log('Fallback:',kind,state);await p.close();
    }

    const phone=await makePage({viewport:{width:390,height:844},deviceScaleFactor:3});
    await phone.goto(base,{waitUntil:'domcontentloaded'});
    await phone.waitForFunction(()=>document.querySelector('header').dataset.stage==='revealing',null,{timeout:15000});
    const start=await phone.evaluate(()=>({time:document.querySelector('video').currentTime,held:document.querySelector('header').hasAttribute('data-held-frame'),width:document.querySelector('.cinematic-canvas').width,src:document.querySelector('.cinematic-painting').currentSrc}));
    assert.ok(start.held&&start.time>=5&&start.time<5.3);assert.equal(start.width,585);assert.ok(start.src.includes('mobile'));
    await phone.setViewportSize({width:844,height:390});
    await phone.waitForFunction(()=>document.querySelector('.cinematic-painting').currentSrc.includes('desktop')&&document.querySelector('.cinematic-art').hasAttribute('data-gl-ready'));
    assert.equal(await phone.locator('header').getAttribute('data-stage'),'revealing');
    await phone.screenshot({path:path.join(os.tmpdir(),'portfolio-brush-landscape.png'),scale:'css'});
    await phone.waitForFunction(()=>document.querySelector('header').dataset.stage==='painted',null,{timeout:45000});
    assert.equal(await phone.locator('video').evaluate(v=>v.currentTime),start.time);
    const contextLost=await phone.evaluate(()=>{const c=document.querySelector('.cinematic-canvas'),gl=c.getContext('webgl');const ext=gl.getExtension('WEBGL_lose_context');ext.loseContext();return !!ext;});
    assert.ok(contextLost);
    await phone.waitForFunction(()=>!document.querySelector('.cinematic-art').hasAttribute('data-displaying-gl'));
    console.log('Portrait, DPR cap, rotation, full lifecycle, held frame and context-loss fallback passed.');
    assert.deepEqual(errors,[]);console.log('PASS: no page errors');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
