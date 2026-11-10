// Persistent additive brush mask in CSS pixels. The artwork stays on the same
// WebGL surface before, during and after the reveal.
const STROKE_PACE = 1.2;
export const REVEAL_MS = 7200 * STROKE_PACE;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const random = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function point(stroke, t) {
  const [a,b,c,d] = stroke.path, s = 1-t;
  return {x:s*s*s*a[0]+3*s*s*t*b[0]+3*s*t*t*c[0]+t*t*t*d[0],
    y:s*s*s*a[1]+3*s*s*t*b[1]+3*s*t*t*c[1]+t*t*t*d[1]};
}
export class PaintReveal {
  constructor(options = {}) {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d', {willReadFrequently: true});
    this.width = 0; this.height = 0; this.elapsed = 0; this.complete = false;
    // The hero uses two parallel chains of the original brush gestures.
    // An explicitly selected variant can still supply its own duration.
    this.duration = options.duration || REVEAL_MS;
    this.variant = options.variant || 'camp';
  }
  finish() {
    this.context.fillStyle='#fff';
    this.context.fillRect(0,0,this.width,this.height);
    this.elapsed=this.duration; this.complete=true;
    this.strokes?.forEach(stroke => { stroke.stamp = null; });
  }
  resize(width, height, artWidth, artHeight) {
    if (width === this.width && height === this.height && artWidth === this.artWidth) return false;
    const finished=this.complete;
    this.width = width; this.height = height; this.artWidth = artWidth;
    const ratio = Math.min(1, 768 / Math.max(width,height));
    this.canvas.width = Math.ceil(width * ratio);
    this.canvas.height = Math.ceil(height * ratio);
    this.context.setTransform(this.canvas.width/width,0,0,this.canvas.height/height,0,0);
    this.context.strokeStyle = '#fff';
    this.context.fillStyle = '#fff';
    this.context.lineCap = 'round'; this.context.lineJoin = 'round';
    this.strokes = this.variant === 'mountain'
      ? this.planMountain(width,height,artWidth,artHeight)
      : this.plan(width,height,artWidth,artHeight);
    if (!finished) this.strokes.forEach(stroke => this.stamp(stroke));
    this.elapsed = -1; this.complete = false;
    if(finished) {
      this.finish();
    }
    return true;
  }
  planMountain(w,h,aw,ah) {
    const scale = Math.max(w/aw,h/ah);
    const mapY = y => clamp((y*ah*scale-(ah*scale-h)/2)/h,.08,.94);
    const top = mapY(.31), bottom = mapY(.67);
    const band = Math.max(.16, bottom - top);
    const strokes = [];
    const short = Math.min(w,h);
    const duration = this.duration;
    const push = (path,width,start,window) => {
      const stroke = {
        path:path.map(([x,y])=>[x*w,y*h]), width, duration:1, wet:false,
        seed:strokes.length+1, drawn:0
      };
      stroke.start = start * duration;
      stroke.end = Math.min(duration, (start + window) * duration);
      strokes.push(stroke);
    };
    // First marks: short gestures tracing the distant ridgeline.
    for (let i=0;i<9;i++) {
      const x = .045 + i*.075 + random(i+31)*.02;
      const y = top + band*(.03 + random(i+72)*.17);
      const lift = .018 + random(i+17)*.035;
      push([[x-.06,y+.042],[x+.012,y-lift],[x+.09,y+.015],[x+.155,y+.05]],
        short*(.019+.008*random(i+61)), .005+i*.03, .22);
    }
    // Long, angled carrying strokes build the shaded body. Their length stays
    // well above their width so the brushes read as gestures, not blocks.
    for (let i=0;i<20;i++) {
      const x = -.02 + random(i+112)*.66;
      const y = top + band*(.16 + random(i+193)*.68);
      const dx = .18 + random(i+23)*.17;
      const dy = (random(i+43)-.45)*.12;
      const arc = .05 + random(i+57)*.055;
      const path = i%2
        ? [[x,y+dy],[x+dx*.28,y+arc],[x+dx*.66,y-dy*.5],[x+dx,y+dy*.35]]
        : [[x,y-dy*.4],[x+dx*.22,y-dy],[x+dx*.62,y+arc],[x+dx,y+dy*.2]];
      push(path, short*(.027+.023*random(i+89)), .12+i*.032, .22+.07*random(i+9));
    }
    // Final broad diagonal gestures sweep the remaining slopes. They start and
    // end outside the frame, so no wide stroke can show a rectangular cap.
    for (let i=0;i<6;i++) {
      const y = top + band*((i+.5)/6);
      const rise = (i%2?1:-1)*band*.34;
      const path = [[-.12,y+band*.06],[.18,y-rise*.2],[.62,y+rise*.35],[1.14,y-rise*.25]];
      push(path, short*(.048+.009*random(i+77)), .7+i*.035, .17);
    }
    return strokes;
  }
  plan(w,h,aw,ah) {
    const scale = Math.max(w/aw,h/ah);
    // Map the assets' skyline through centered cover for wide/short viewports.
    const horizon = clamp((.37*ah*scale-(ah*scale-h)/2)/h,.18,.62);
    const strokes = [];
    const add = (path,width,duration,wet=false) => strokes.push({
      path:path.map(([x,y])=>[x*w,y*h]), width, duration, wet,
      seed:strokes.length+1, drawn:0
    });
    const short = Math.min(w,h);
    // First mark: a decisive gesture in the unobscured upper-right sky.
    add([[.88,horizon*.7],[.78,horizon*.08],[.57,horizon*.1],[.46,horizon*.6]],short*.13,1100);
    for (let i=0;i<13;i++) {
      const y = horizon*(.12 + (i%4)*.25), x = .08+(i%3)*.29;
      let path = [[x-.12,y+.04],[x+.02,y-.12],[x+.31,y+.12],[x+.46,y-.025]];
      if(i%2) path=path.reverse();
      add(path,short*(.095+.05*random(i)),650+400*random(i+21));
    }
    // Short diagonal gestures for cloud banks, tree groups, tent and ledges.
    for (let i=0;i<19;i++) {
      const x = .08+random(i+80)*.84;
      const y = horizon+.09+random(i+42)*(1-horizon-.13);
      const dx = (.14+.13*random(i+19))*(i%2?-1:1), dy = i%3===0?-.13:.08;
      add([[x-dx/2,y-dy/2],[x-dx*.1,y-dy*.6],[x+dx*.2,y+dy*.7],[x+dx/2,y+dy/2]],
        short*(.07+.055*random(i+7)),420+320*random(i+54));
    }
    // Wet overlapping passes close dry gaps. The opaque core of each crosses
    // its whole tile, beyond both ends, covering corners without a final fade.
    const cols = w>h?4:2, rows = w>h?6:9;
    const centerTile = Math.floor((rows - 1) / 2) * cols + Math.floor(cols / 2);
    const tiles = Array.from({length:cols*rows},(_,i)=>i);
    tiles.sort((a,b)=>random(a+172)-random(b+172));
    for (const i of tiles) {
      const col=i%cols,row=Math.floor(i/cols), x=col/cols, y=(row+.5)/rows;
      const bend=(i%2?1:-1)*.09/rows;
      let path=[[x-.2/cols,y],[x+.2/cols,y+bend],[x+.8/cols,y-bend],[x+1.2/cols,y]];
      if(i%2) path=path.reverse();
      // This broad horizontal middle pass reads much faster than the finer
      // gestures. Slow its leftward half without changing any other stroke.
      const duration = (380 + 200 * random(i + 123)) * (i === centerTile ? 2.5 : 1);
      add(path,h/rows*1.7,duration,true);
      if (i === centerTile) {
        strokes[strokes.length - 1].delay = 5000;
        // Slow the half that crosses the left side by 50%; which time half
        // corresponds to that segment depends on the stroke's travel direction.
        strokes[strokes.length - 1].slowHalf = path[0][0] < path[3][0] ? 'first' : 'last';
      }
    }
    // Split the ordered plan in half. Both chains start together and keep their
    // original geometry, bristles, and ordering. Stretch their timing by 20%.
    const midpoint = Math.ceil(strokes.length / 2);
    strokes.forEach((s,i)=>{
      s.start=(i%midpoint)*200*STROKE_PACE+(s.delay||0);
      s.end=s.start+s.duration*STROKE_PACE;
    });
    this.skyCompleteAt = Math.max(...strokes.slice(0,14).map(s=>s.end));
    return strokes;
  }
  stamp(stroke) {
    if (stroke.stamp) return stroke.stamp;
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    if (stroke.wet) { ctx.fillStyle='#fff'; ctx.fillRect(0, 6.4, 64, 115.2); }
    for (let j=0;j<30;j++) {
      if (!stroke.wet && (j+stroke.seed)%11===0) continue;
      const grain=random(j+stroke.seed*43), edge=Math.abs(j/29-.5)*2;
      ctx.globalAlpha=edge>.83?.45+grain*.5:1;
      ctx.lineWidth=128/30*(1.1+grain*.25);
      const y=4+j/29*120;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(64,y); ctx.stroke();
    }
    stroke.stamp = canvas;
    return canvas;
  }
  segment(stroke, from, to) {
    const ctx=this.context, a=point(stroke,from), b=point(stroke,to);
    const length=Math.hypot(b.x-a.x,b.y-a.y)||1;
    const width=stroke.width*(stroke.wet?1:(.88+.12*Math.sin(Math.PI*to)));
    ctx.save();
    ctx.translate(a.x,a.y);
    ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x));
    // Cached bristles retain dry edges; a small overlap joins adjacent deposits.
    ctx.drawImage(this.stamp(stroke),-width/60,-width/2,length+width/30,width);
    ctx.restore();
  }
  advance(elapsed) {
    elapsed=clamp(elapsed,0,this.duration);
    if(elapsed===this.elapsed) return false;
    for(const stroke of this.strokes) {
      let progress=clamp((elapsed-stroke.start)/(stroke.end-stroke.start),0,1);
      if(stroke.slowHalf==='first') progress=progress<.6?progress/.6*.5:.5+(progress-.6)/.4*.5;
      else if(stroke.slowHalf==='last') progress=progress<.4?progress/.4*.5:.5+(progress-.4)/.6*.5;
      const t=progress*progress*(3-2*progress);
      const end=Math.floor(t*140);
      for(let step=stroke.drawn;step<end;step++) this.segment(stroke,step/140,(step+1)/140);
      stroke.drawn=end;
    }
    this.elapsed=elapsed; this.complete=elapsed>=this.duration;
    if (this.complete) this.strokes.forEach(stroke => { stroke.stamp = null; });
    return true;
  }
}
