// About-only additive mask. A small cached bristle stamp replaces thousands
// of path/ribbon strokes. Coordinates are local to the mountain's alpha bounds.
const clamp = n => Math.max(0, Math.min(1, n));
const noise = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

export class MountainBrush {
  constructor(width, height, duration) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    this.context = this.canvas.getContext('2d');
    this.duration = duration;
    this.stamp = document.createElement('canvas');
    this.stamp.width = 96; this.stamp.height = 96;
    const brush = this.stamp.getContext('2d');
    brush.fillStyle = '#fff';
    // An opaque belly with irregular dry bristles along both edges.
    for (let y = 0; y < 96; y++) {
      const edge = Math.abs(y - 47.5) / 48;
      brush.globalAlpha = edge < .65 ? 1 : (1 - edge) * (1.5 + noise(y) * 1.4);
      const inset = 6 + noise(y + 17) * 14 + edge * edge * 15;
      brush.fillRect(inset, y, 96 - inset * 2, 1);
    }
    this.strokes = [];
    const add = (x, y, dx, bend, size, start, window) => {
      const steps = Math.ceil(Math.abs(dx) / (size * .12));
      this.strokes.push({x,y,dx,bend,size,start,window,steps,drawn:0});
    };
    // Fine gestures find the ridgeline before broad, alternating passes fill it.
    for (let i = 0; i < 8; i++) {
      add(width * (.04 + i * .11), height * (.15 + noise(i) * .5),
        width * .3, -height * .1, height * .15, i * .035, .23);
    }
    for (let i = 0; i < 7; i++) {
      const reverse = i % 2;
      add(reverse ? width * 1.12 : -width * .12, height * (i + .5) / 7,
        width * 1.24 * (reverse ? -1 : 1), height * .025 * (reverse ? -1 : 1),
        height / 7 * 2.3, .23 + i * .073, .29);
    }
  }
  advance(elapsed) {
    const progress = clamp(elapsed / this.duration), ctx = this.context;
    for (const s of this.strokes) {
      const t = clamp((progress - s.start) / s.window);
      const end = Math.floor(t * t * (3 - 2 * t) * s.steps);
      for (let i = s.drawn; i < end; i++) {
        const p = i / s.steps;
        const x = s.x + s.dx * p;
        const y = s.y + Math.sin(p * Math.PI * 2) * s.bend;
        ctx.drawImage(this.stamp, x - s.size / 2, y - s.size / 2, s.size, s.size);
      }
      s.drawn = end;
    }
  }
}
