// Persistent additive brush mask in CSS pixels. The artwork stays on the same
// WebGL surface before, during and after the reveal.
export const REVEAL_MS = 12100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const random = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function point(stroke, t) {
  const [a,b,c,d] = stroke.path, s = 1-t;
  return {x:s*s*s*a[0]+3*s*s*t*b[0]+3*s*t*t*c[0]+t*t*t*d[0],
    y:s*s*s*a[1]+3*s*s*t*b[1]+3*s*t*t*c[1]+t*t*t*d[1]};
}
export class PaintReveal {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.width = 0; this.height = 0; this.elapsed = 0; this.complete = false;
  }
  finish() {
    this.context.fillStyle='#fff';
    this.context.fillRect(0,0,this.width,this.height);
    this.elapsed=REVEAL_MS; this.complete=true;
  }
  resize(width, height, artWidth, artHeight) {
    if (width === this.width && height === this.height && artWidth === this.artWidth) return false;
    const finished=this.complete;
    this.width = width; this.height = height; this.artWidth = artWidth;
    const ratio = Math.min(1.5, 1440 / Math.max(width,height));
    this.canvas.width = Math.ceil(width * ratio);
    this.canvas.height = Math.ceil(height * ratio);
    this.context.setTransform(this.canvas.width/width,0,0,this.canvas.height/height,0,0);
    this.context.strokeStyle = '#fff';
    this.context.fillStyle = '#fff';
    this.context.lineCap = 'round'; this.context.lineJoin = 'round';
    this.strokes = this.plan(width,height,artWidth,artHeight);
    this.elapsed = -1; this.complete = false;
    if(finished) {
      this.finish();
    }
    return true;
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
    const tiles = Array.from({length:cols*rows},(_,i)=>i);
    tiles.sort((a,b)=>random(a+172)-random(b+172));
    for (const i of tiles) {
      const col=i%cols,row=Math.floor(i/cols), x=col/cols, y=(row+.5)/rows;
      const bend=(i%2?1:-1)*.09/rows;
      let path=[[x-.2/cols,y],[x+.2/cols,y+bend],[x+.8/cols,y-bend],[x+1.2/cols,y]];
      if(i%2) path=path.reverse();
      add(path,h/rows*1.7,380+200*random(i+123),true);
    }
    // Keep each brush unhurried while another stroke begins every 0.2 seconds.
    strokes.forEach((s,i)=>{
      s.start=i*200;
      s.end=s.start+s.duration;
    });
    return strokes;
  }
  segment(stroke, from, to) {
    const ctx=this.context, a=point(stroke,from), b=point(stroke,to);
    const length=Math.hypot(b.x-a.x,b.y-a.y)||1;
    const nx=-(b.y-a.y)/length, ny=(b.x-a.x)/length;
    const width=stroke.width*(stroke.wet?1:(.88+.12*Math.sin(Math.PI*to)));
    const line=(offset,thickness,alpha=1)=>{
      ctx.globalAlpha=alpha; ctx.lineWidth=thickness;
      ctx.beginPath(); ctx.moveTo(a.x+nx*offset,a.y+ny*offset);
      ctx.lineTo(b.x+nx*offset,b.y+ny*offset); ctx.stroke();
    };
    if(stroke.wet) line(0,width*.9);
    // Bristle ribbons deposit pigment; never erase earlier marks.
    for(let j=0;j<30;j++) {
      if(!stroke.wet && (j+stroke.seed)%11===0) continue;
      const grain=random(j+stroke.seed*43), edge=Math.abs(j/29-.5)*2;
      const offset=(j/29-.5)*width*(1+.025*Math.sin(to*27+j));
      line(offset,width/30*(1.1+grain*.25),edge>.83?.45+grain*.5:1);
    }
    ctx.globalAlpha=1;
  }
  advance(elapsed) {
    elapsed=clamp(elapsed,0,REVEAL_MS);
    if(elapsed===this.elapsed) return false;
    for(const stroke of this.strokes) {
      const t=clamp((elapsed-stroke.start)/(stroke.end-stroke.start),0,1);
      const end=Math.floor(t*t*(3-2*t)*140);
      for(let step=stroke.drawn;step<end;step++) this.segment(stroke,step/140,(step+1)/140);
      stroke.drawn=end;
    }
    this.elapsed=elapsed; this.complete=elapsed>=REVEAL_MS;
    return true;
  }
}
