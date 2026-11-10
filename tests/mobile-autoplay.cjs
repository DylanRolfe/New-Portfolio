// Run against a local static server. PLAYWRIGHT_MODULE and CHROME_PATH may select existing installs.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
for (const mode of ['desktop','mobile','transient','blocked']) {
const page=await browser.newPage({viewport:mode==='desktop'?{width:1440,height:900}:{width:390,height:844},isMobile:mode!=='desktop',hasTouch:mode!=='desktop'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
if(mode==='mobile') await page.route('**/cinematic-hero.js*',async route=>{
  const response=await route.fetch();
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>0.2);
  assert.equal(await page.locator('video').evaluate(v=>getComputedStyle(v).visibility),'visible');
  assert.equal(await page.locator('[data-cinematic-hero]').getAttribute('data-stage'),'poster');
  await route.fulfill({response});
});
// Native HTML autoplay does not call the JavaScript play() override. Disable
// it only in rejection scenarios so those tests exercise our retry path.
if (mode==='transient'||mode==='blocked') await page.route('**/index.html',async route=>{
const response=await route.fetch();
await route.fulfill({response,body:(await response.text()).replace(' autoplay muted playsinline',' muted playsinline')});
});
await page.addInitScript(mode=>{
window.playAttempts=0;window.loadCalls=0;const play=HTMLMediaElement.prototype.play;
const load=HTMLMediaElement.prototype.load;
HTMLMediaElement.prototype.load=function(){window.loadCalls++;return load.call(this);};
HTMLMediaElement.prototype.play=function(){window.playAttempts++;if ((mode==='transient'&&window.playAttempts<=2)||(mode==='blocked'&&!window.allowPlayback)) return Promise.reject(new DOMException('Blocked','NotAllowedError')); return play.call(this);};
window.stages=[];new MutationObserver(entries=>{for(const e of entries)if(e.target.matches?.('[data-cinematic-hero]')) window.stages.push({stage:e.target.dataset.stage,time:document.querySelector('video')?.currentTime});}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-stage']});
},mode);
await page.goto((process.env.TEST_URL || 'http://127.0.0.1:8766') + '/index.html');
if(mode==='blocked'){
await page.waitForTimeout(2500);
assert.equal(await page.locator('[data-cinematic-hero]').getAttribute('data-stage'),'playing');
assert.equal(await page.locator('.cinematic-play').count(),0);
await page.evaluate(()=>window.allowPlayback=true);await page.locator('body').tap({position:{x:100,y:100}});
}
await page.waitForFunction(()=>document.querySelector('[data-cinematic-hero]').dataset.stage==='revealing',null,{timeout:20000});
const state=await page.evaluate(()=>({time:document.querySelector('video').currentTime,attempts:window.playAttempts,source:document.querySelector('video').currentSrc,loads:window.loadCalls}));
assert.ok(state.time>=4.9,JSON.stringify(state));
assert.equal(state.loads,0,'startup must not reload the browser-selected video');
assert.ok(state.source.endsWith(mode==='desktop'?'hike-desktop.mp4':'hike-mobile.mp4'));
await page.waitForFunction(()=>document.querySelector('[data-cinematic-hero]').dataset.stage==='painted',null,{timeout:20000});
assert.equal(await page.locator('video source').count(),0);
assert.equal(await page.locator('video').evaluate(v=>v.hasAttribute('src')||v.autoplay),false);
assert.equal(await page.locator('video').evaluate(v=>v.paused),true,'finished video must not restart from child sources');
assert.deepEqual(errors,[]);console.log('PASS',mode,JSON.stringify(state));await page.close();
}
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
