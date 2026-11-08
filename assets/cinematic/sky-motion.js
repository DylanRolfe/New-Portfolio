const shaderText = name => fetch(new URL('./shaders/' + name, import.meta.url)).then(response => {
  if (!response.ok) throw new Error('Shader unavailable: ' + name);
  return response.text();
});

async function createPipeline(gl) {
  const sources = await Promise.all([shaderText('sky.vert'), shaderText('sky.frag')]);
  const program = gl.createProgram();
  for (const [index, type] of [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].entries()) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, sources[index]);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = {};
  for (const name of ['uArt','uMask','uFlow','uView','uImage','uPointer','uDirection','uStrength']) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  ['uArt','uMask','uFlow'].forEach((name, unit) => gl.uniform1i(uniforms[name], unit));
  return uniforms;
}

function makeTexture(gl, img, unit) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  return texture;
}

async function loadMap(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export function createSkyMotion(hero, art, painting, selected, motionAllowed) {
  const canvas = art.querySelector('canvas');
  let gl, programPromise, uniforms;
  let textures = [], pendingKey = '', request = 0, ready = false, frame = 0;
  let energy = 0, lastTick = 0, previous = null;
  let point = [.5, .25], direction = [1, 0];

  function sleep() {
    cancelAnimationFrame(frame);
    frame = 0;
    energy = 0;
    previous = null;
    art.removeAttribute('data-displaying-gl');
  }
  function clearTextures() {
    textures.forEach(texture => gl.deleteTexture(texture));
    textures = [];
    ready = false;
    art.removeAttribute('data-gl-ready');
  }
  async function refresh() {
    const entry = selected();
    const url = new URL(entry.getAttribute('srcset') || entry.getAttribute('src'), document.baseURI).href;
    if (hero.dataset.stage !== 'painted' || !motionAllowed() || painting.currentSrc !== url || !painting.naturalWidth) {
      request++;
      pendingKey = '';
      sleep();
      clearTextures();
      return;
    }
    if (pendingKey === url) return;
    const current = ++request;
    pendingKey = url;
    sleep();
    clearTextures();
    try {
      gl ||= canvas.getContext('webgl', {alpha:true, premultipliedAlpha:true, antialias:false, depth:false, stencil:false});
      if (!gl || gl.isContextLost()) return;
      programPromise ||= createPipeline(gl);
      const [locations, mask, flow] = await Promise.all([programPromise, loadMap(entry.dataset.mask), loadMap(entry.dataset.flow)]);
      if (current !== request || painting.currentSrc !== url || !motionAllowed()) return;
      uniforms = locations;
      textures = [painting, mask, flow].map((image, unit) => makeTexture(gl, image, unit));
      if (gl.getError() !== gl.NO_ERROR) throw new Error('The graphics device rejected a texture.');
      ready = true;
      art.dataset.glReady = '';
    } catch (error) {
      if (current === request) { clearTextures(); console.warn('Campsite uses static artwork.', error); }
    }
  }

  function draw(now) {
    frame = 0;
    const dt = Math.min(100, Math.max(0, now-lastTick));
    lastTick = now;
    energy *= Math.exp(-dt/310);
    if (!ready || energy < .012 || document.hidden || !motionAllowed()) { sleep(); return; }
    const {width, height} = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5, 2400/Math.max(1,width,height));
    const w = Math.max(1, Math.round(width*dpr)), h = Math.max(1, Math.round(height*dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uniforms.uView, width, height);
    gl.uniform2f(uniforms.uImage, painting.naturalWidth, painting.naturalHeight);
    gl.uniform2fv(uniforms.uPointer, point);
    gl.uniform2fv(uniforms.uDirection, direction);
    gl.uniform1f(uniforms.uStrength, energy);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    art.dataset.displayingGl = '';
    frame = requestAnimationFrame(draw);
  }
  function stir(event) {
    if (!ready || !motionAllowed() || !event.isPrimary) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    point = [x / rect.width, y / rect.height];
    const dx = previous ? x-previous[0] : 6, dy = previous ? y-previous[1] : -2;
    const distance = Math.hypot(dx, dy);
    if (distance > .1) direction = [dx/distance, dy/distance];
    energy = Math.min(1, energy + Math.min(.9, distance/45 + .12));
    previous = [x, y];
    if (!frame) { lastTick = performance.now(); frame = requestAnimationFrame(draw); }
  }
  hero.addEventListener('pointermove', stir, {passive:true});
  hero.addEventListener('pointerdown', stir, {passive:true});
  for (const name of ['pointerleave', 'pointercancel', 'pointerup']) {
    hero.addEventListener(name, () => { previous = null; }, {passive:true});
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    request++;
    ready = false;
    art.removeAttribute('data-gl-ready');
    pendingKey = '';
    textures = [];
    programPromise = null;
    sleep();
  });
  canvas.addEventListener('webglcontextrestored', refresh);
  return {refresh, sleep};
}
