// Run against a local static server. PLAYWRIGHT_MODULE and CHROME_PATH may select existing installs.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
for (const mode of ['desktop','mobile','transient','blocked']) {
const page=await browser.newPage({viewport:mode==='desktop'?{width:1440,height:900}:{width:390,height:844},isMobile:mode!=='desktop',hasTouch:mode!=='desktop'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(mode=>{
window.playAttempts=0;const play=HTMLMediaElement.prototype.play;
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
const state=await page.evaluate(()=>({time:document.querySelector('video').currentTime,attempts:window.playAttempts,source:document.querySelector('video').src}));
assert.ok(state.time>=4.9,JSON.stringify(state));
await page.waitForFunction(()=>document.querySelector('[data-cinematic-hero]').dataset.stage==='painted',null,{timeout:20000});
assert.deepEqual(errors,[]);console.log('PASS',mode,JSON.stringify(state));await page.close();
}
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
