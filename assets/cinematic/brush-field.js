// Sparse pointer input energizes a regular spring mesh in CSS pixels. The same
// mesh drives the image warp and the paint flecks, so their momentum agrees.
export class BrushField {
  constructor(width,height) {
    this.width = width;
    this.height = height;
    const pitch = Math.max(11, Math.max(width,height)/136);
    this.cols = Math.max(2, Math.ceil(width/pitch));
    this.rows = Math.max(2, Math.ceil(height/pitch));
    this.n = this.cols*this.rows;
    this.dx = new Float32Array(this.n); this.dy = new Float32Array(this.n);
    this.vx = new Float32Array(this.n); this.vy = new Float32Array(this.n);
    this.heat = new Float32Array(this.n);
    this.texture = new Uint8Array(this.n*4);
    this.flecks = new Float32Array(this.n*6);
    this.sx = width/this.cols; this.sy = height/this.rows;

  }

  sweep(start,end,tap) {
    const ax=end.x-start.x, ay=end.y-start.y, length=Math.hypot(ax,ay);
    const radius=Math.min(139,Math.max(65,Math.min(this.width,this.height)*.21));
    const impulse=tap ? 185 : Math.min(230, 30+5*length);
    const x0=Math.max(0,Math.floor((Math.min(start.x,end.x)-radius)/this.sx));
    const x1=Math.min(this.cols-1,Math.ceil((Math.max(start.x,end.x)+radius)/this.sx));
    const y0=Math.max(0,Math.floor((Math.min(start.y,end.y)-radius)/this.sy));
    const y1=Math.min(this.rows-1,Math.ceil((Math.max(start.y,end.y)+radius)/this.sy));
    for (let row=y0;row<=y1;row++) for (let col=x0;col<=x1;col++) {
      const x=(col+.5)*this.sx-start.x, y=(row+.5)*this.sy-start.y;
      const t=length ? Math.min(1,Math.max(0,(x*ax+y*ay)/(length*length))) : 0;
      const rx=x-t*ax, ry=y-t*ay, distance=Math.hypot(rx,ry);
      if (distance>=radius) continue;
      const weight=(1-distance/radius)**1.55, inv=1/Math.max(3,distance);
      const i=row*this.cols+col;
      // A drag carries pigment with the hand and to the sides; taps send a ring.
      const fx=rx*inv+.75*ax/Math.max(length,1)-.24*ry*inv;
      const fy=ry*inv+.75*ay/Math.max(length,1)+.24*rx*inv;
      this.vx[i]=Math.max(-440,Math.min(440,this.vx[i]+impulse*weight*fx));
      this.vy[i]=Math.max(-440,Math.min(440,this.vy[i]+impulse*weight*fy));
      this.heat[i]=Math.min(1,this.heat[i]+weight*(tap?1.25:.9));
    }
  }

  advance(elapsed, time, motion=1) {
    const steps=Math.max(1,Math.ceil(elapsed/.012));
    const dt=elapsed/steps, damp=Math.exp(-9.4*dt);
    const gain=Number.isFinite(motion)?Math.max(0,Math.min(1,motion)):1;
    for(let step=0;step<steps;step++) {
      for(let i=0;i<this.n;i++) {
        this.vx[i]=(this.vx[i]-101*this.dx[i]*dt)*damp;
        this.vy[i]=(this.vy[i]-101*this.dy[i]*dt)*damp;
        this.dx[i]+=this.vx[i]*dt;
        this.dy[i]+=this.vy[i]*dt;
      }
    }
    const decay=Math.exp(-elapsed*2.35);
    const breathe=Number.isFinite(time);
    const t=breathe?time:0;
    let count=0, active=breathe;
    for(let i=0;i<this.n;i++) {
      this.heat[i]*=decay;
      const col=i%this.cols, row=(i/this.cols)|0;
      const u=(col+.5)/this.cols, v=(row+.5)/this.rows;
      // Idle current stays in the sky. The tent and foreground keep the
      // registration baked into the still.
      const sky=Math.max(0,(0.58-v)/0.58);
      const skyCurve=sky*sky;
      const band=Math.sin(t*0.55+u*8+v*3.4);
      const band2=Math.sin(t*0.34-u*4.2+v*5.6);
      const patch=Math.pow(Math.max(0,band)*Math.max(0,band2),1.05);
      const drift=breathe ? skyCurve*(0.55+patch)*gain : 0;
      const x=this.dx[i]+Math.sin(t*0.62+v*5)*11.*drift;
      const y=this.dy[i]+Math.cos(t*0.41+u*4)*5.*drift;
      const heat=Math.min(1,this.heat[i]+(breathe?patch*skyCurve*0.95*gain:0));
      const strength=Math.min(1,Math.abs(x)*.07+Math.abs(y)*.07+heat);
      if (strength>.012 || Math.abs(this.vx[i])+Math.abs(this.vy[i])>1) active=true;
      const k=i*4;
      this.texture[k]=Math.round(128+Math.max(-42,Math.min(42,x))*3);
      this.texture[k+1]=Math.round(128+Math.max(-42,Math.min(42,y))*3);
      this.texture[k+2]=Math.round(heat*255);
      this.texture[k+3]=Math.round(strength*255);
      if (strength<.04) continue;
      const seed=((i*1664525+1013904223)>>>0)%919/919;
      const j=count++*6;
      this.flecks[j]=(i%this.cols+.18+.65*seed)/this.cols;
      this.flecks[j+1]=(Math.floor(i/this.cols)+.15+.7*((seed*13.1)%1))/this.rows;
      this.flecks[j+2]=x; this.flecks[j+3]=y;
      this.flecks[j+4]=Math.min(1,heat*.8+strength*.2);
      this.flecks[j+5]=seed;
    }
    return {active,count};
  }
}
