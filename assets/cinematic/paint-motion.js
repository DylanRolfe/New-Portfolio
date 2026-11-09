import { BrushField } from './brush-field.js?v=7';

async function program(gl, name, attributes, uniformNames) {
  const sources = await Promise.all(['vert','frag'].map(async ext => {
    const response = await fetch(new URL('./shaders/'+name+'.'+ext+'?v=7',import.meta.url), {cache:'no-store'});
    if (!response.ok) throw new Error('Missing '+name+'.'+ext);
    return response.text();
  }));
  const handle = gl.createProgram();
  [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].forEach((type,i) => {
    const shader=gl.createShader(type);
    gl.shaderSource(shader,sources[i]);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(handle,shader);
    gl.deleteShader(shader);
  });
  attributes.forEach((attribute,i)=>gl.bindAttribLocation(handle,i,attribute));
  gl.linkProgram(handle);
  if (!gl.getProgramParameter(handle,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle));
  const uniforms={};
  for (const name of uniformNames) uniforms[name]=gl.getUniformLocation(handle,name);
  return {handle,uniforms};
}

function texture(gl,unit,image) {
  const tex=gl.createTexture();
  gl.activeTexture(gl.TEXTURE0+unit);
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  if (image) gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  return tex;
}
async function imageAt(url) {
  const img=new Image();
  img.src=url;
  await img.decode();
  return img;
}

async function pipeline(gl) {
  const [warp,flecks]=await Promise.all([
    program(gl,'paint',['aPosition'],['uArt','uMask','uFlow','uField','uView','uCover','uTime','uMotion','uReveal','uBrush']),
    program(gl,'flecks',['aHome','aShift','aHeat','aSeed'],['uArt','uFlow','uView','uCover','uDpr'])
  ]);
  for (const pass of [warp,flecks]) {
    gl.useProgram(pass.handle);
    const samplers=['uArt','uMask','uFlow','uField'];
    samplers.forEach((name,i)=>{ if (pass.uniforms[name]) gl.uniform1i(pass.uniforms[name],i); });
  }
  const quad=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,quad);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
  return {warp,flecks,quad,points:gl.createBuffer()};
}

export function createPaintMotion(hero,art,painting,selected,motionAllowed,pointerTarget=hero,manual=false) {
  const canvas=art.querySelector('canvas');
  const revealMs=1400, settleMs=2000;
  let gl, pipelinePromise, passes, field, textures=[];
  let ticket=0, urlKey='', ready=false, animation=0, lastTime=0, previous=null, priming=null, flight=null, flightUrl='';
  let phase=manual?'hold':'live';
  let reveal=1, motion=1, brush=0, revealStart=0, settleStart=0, onRevealed=null, notified=false;
  let skew=0, hiddenAt=0;
  function sleep() {
    cancelAnimationFrame(animation);
    animation=0;
    previous=null;
    field=null;
    if (!hiddenAt && document.hidden && (phase==='reveal'||phase==='settle')) hiddenAt=performance.now();
    art.removeAttribute('data-displaying-gl');
  }
  function release() {
    ready=false;
    art.removeAttribute('data-gl-ready');
    textures.forEach(tex=>gl.deleteTexture(tex));
    textures=[];
    sleep();
  }
  function sourceUrl() {
    const entry=selected();
    return new URL(entry.getAttribute('srcset')||entry.getAttribute('src'),document.baseURI).href;
  }
  async function upload(url, generation) {
    urlKey=url;
    ready=false;
    art.removeAttribute('data-gl-ready');
    textures.forEach(tex=>gl&&gl.deleteTexture(tex));
    textures=[];
    try {
      const entry=selected();
      gl ||= canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false});
      if (!gl||gl.isContextLost()) return false;
      pipelinePromise ||= pipeline(gl);
      const [built,mask,flow]=await Promise.all([pipelinePromise,imageAt(entry.dataset.mask),imageAt(entry.dataset.flow)]);
      if (ticket!==generation||!motionAllowed()||painting.currentSrc!==sourceUrl()) return false;
      passes=built;
      textures=[painting,mask,flow,null].map((img,i)=>texture(gl,i,img));
      if (gl.getError()!==gl.NO_ERROR) throw new Error('Texture upload failed');
      ready=true;
      art.dataset.glReady='';
      if (phase!=='hold') resume();
      return true;
    } catch (error) {
      if (ticket===generation) { release(); console.warn('Using static campsite artwork.',error); }
      return false;
    }
  }
  async function refresh() {
    if (!motionAllowed()) { ticket++; urlKey=''; release(); return false; }
    const url=sourceUrl();
    const engaged=hero.dataset.stage==='painted'||hero.dataset.stage==='revealing'||manual;
    if (!engaged||painting.currentSrc!==url||!painting.naturalWidth) {
      if (!manual) { ticket++; urlKey=''; release(); }
      return false;
    }
    if (urlKey===url&&ready) { if (phase!=='hold') resume(); return true; }
    if (flight&&flightUrl===url) return flight;
    const generation=++ticket;
    flightUrl=url;
    flight=upload(url, generation).finally(()=>{ if (flightUrl===url) flight=null; });
    return flight;
  }
  function prime() {
    if (ready&&urlKey===sourceUrl()) return Promise.resolve(true);
    if (!priming) {
      priming=(async()=>{
        try { await painting.decode(); }
        catch { return false; }
        if (!motionAllowed()) return false;
        return refresh();
      })().finally(()=>{ priming=null; });
    }
    return priming;
  }
  function sizeField() {
    const {width,height}=canvas.getBoundingClientRect();
    if (width<2||height<2) return null;
    if (!field||field.width!==width||field.height!==height) {
      field=new BrushField(width,height);
      gl.activeTexture(gl.TEXTURE3);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,field.cols,field.rows,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    }
    return {width,height};
  }
  function grade(now) {
    const clockNow=now-skew;
    if (phase==='reveal') {
      const t=Math.min(1,(clockNow-revealStart)/revealMs);
      reveal=t*t*(3-2*t);
      motion=0; brush=1;
      if (t>=1) { reveal=1; brush=0; motion=0; phase='settle'; settleStart=clockNow; }
    } else if (phase==='settle') {
      const t=Math.min(1,(clockNow-settleStart)/settleMs);
      motion=t*t*(3-2*t);
      brush=0; reveal=1;
      if (t>=1) phase='live';
    } else if (phase==='live' && manual) {
      motion=1; brush=0; reveal=1;
    }
    return clockNow;
  }
  function render(now, clockNow) {
    if (!ready||!motionAllowed()||!passes) return false;
    const view=sizeField();
    if (!view) return false;
    const dt=Math.min(.064,Math.max(.001,lastTime?(now-lastTime)/1000:.016));
    lastTime=now;
    const clock=manual?(settleStart?(clockNow-settleStart)/1000:0):now/1000;
    const {active,count}=field.advance(dt,clock,motion);
    if (!active&&phase==='live') { sleep(); return false; }
    const {width,height}=view;
    const dpr=Math.min(devicePixelRatio||1,1.5,2300/Math.max(width,height));
    const w=Math.max(1,Math.round(width*dpr)), h=Math.max(1,Math.round(height*dpr));
    if (canvas.width!==w||canvas.height!==h) { canvas.width=w; canvas.height=h; }
    gl.viewport(0,0,w,h);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE3);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,field.cols,field.rows,gl.RGBA,gl.UNSIGNED_BYTE,field.texture);
    const scale=Math.max(width/painting.naturalWidth,height/painting.naturalHeight);
    function bind(pass) {
      gl.useProgram(pass.handle);
      gl.uniform2f(pass.uniforms.uView,width,height);
      gl.uniform2f(pass.uniforms.uCover,painting.naturalWidth*scale,painting.naturalHeight*scale);
    }
    bind(passes.warp);
    gl.uniform1f(passes.warp.uniforms.uTime, clock);
    gl.uniform1f(passes.warp.uniforms.uMotion, motion);
    gl.uniform1f(passes.warp.uniforms.uReveal, reveal);
    gl.uniform1f(passes.warp.uniforms.uBrush, brush);
    gl.bindBuffer(gl.ARRAY_BUFFER,passes.quad);
    for(let i=1;i<4;i++) gl.disableVertexAttribArray(i);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    if (count&&brush<0.5&&motion>0.02) {
      bind(passes.flecks);
      gl.uniform1f(passes.flecks.uniforms.uDpr,dpr);
      gl.bindBuffer(gl.ARRAY_BUFFER,passes.points);
      gl.bufferData(gl.ARRAY_BUFFER,field.flecks.subarray(0,count*6),gl.DYNAMIC_DRAW);
      [2,2,1,1].forEach((size,i)=>{
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i,size,gl.FLOAT,false,24,[0,8,16,20][i]);
      });
      gl.drawArrays(gl.POINTS,0,count);
    }
    return true;
  }
  function draw(now) {
    animation=0;
    if (phase==='hold') return;
    if (!ready||!motionAllowed()||document.hidden) { sleep(); return; }
    const clockNow=now-skew;
    const finishing=phase==='reveal'&&(clockNow-revealStart)>=revealMs;
    grade(now);
    if (!render(now, clockNow)) return;
    art.dataset.displayingGl='';
    if (finishing&&!notified) { notified=true; onRevealed&&onRevealed(); }
    animation=requestAnimationFrame(draw);
  }
  function startReveal(done) {
    if (!ready) return false;
    onRevealed=done;
    notified=false;
    phase='reveal';
    reveal=0; motion=0; brush=1;
    revealStart=performance.now()-skew;
    settleStart=0;
    if (!render(revealStart+skew, revealStart)) { phase='hold'; brush=0; reveal=1; return false; }
    art.dataset.displayingGl='';
    resume();
    return true;
  }
  function cancel() {
    notified=true;
    onRevealed=null;
    if (!manual||phase==='hold') return;
    if (phase==='reveal') {
      phase='settle';
      settleStart=performance.now();
      reveal=1; brush=0; motion=0;
    }
  }
  function stir(event) {
    if (phase==='hold'||!ready||!motionAllowed()||!event.isPrimary) return;
    const rect=canvas.getBoundingClientRect();
    sizeField();
    if (!field) return;
    const point={x:event.clientX-rect.left,y:event.clientY-rect.top};
    const tap=event.type==='pointerdown'||!previous;
    field.sweep(previous||point,point,tap);
    previous=point;
    if (!animation) { lastTime=performance.now(); animation=requestAnimationFrame(draw); }
  }
  function resume() {
    if (hiddenAt) { skew+=performance.now()-hiddenAt; hiddenAt=0; }
    if (phase==='hold'||!ready||!motionAllowed()||document.hidden||animation) return;
    lastTime=performance.now();
    animation=requestAnimationFrame(draw);
  }
  pointerTarget.addEventListener('pointerdown',stir,{passive:true});
  pointerTarget.addEventListener('pointermove',stir,{passive:true});
  for (const name of ['pointerleave','pointerup','pointercancel']) pointerTarget.addEventListener(name,()=>{previous=null;},{passive:true});
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();
    ticket++; urlKey=''; textures=[]; pipelinePromise=null; release();
  });
  canvas.addEventListener('webglcontextrestored',refresh);
  return {sleep,refresh,resume,prime,startReveal,cancel};
}
