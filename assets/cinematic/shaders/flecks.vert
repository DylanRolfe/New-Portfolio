attribute vec2 aHome, aShift;
attribute float aHeat, aSeed;
uniform vec2 uView, uCover;
uniform float uDpr;
varying vec2 vHome;
varying float vHeat, vSeed;
void main() {
  vHome=(aHome-.5)*uView/uCover+.5;
  vHeat=aHeat; vSeed=aSeed;
  vec2 pos=aHome+clamp(aShift,vec2(-12.),vec2(12.))*(.65+.35*aSeed)/uView;
  gl_Position=vec4(pos*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
  gl_PointSize=(7.+9.*aSeed)*uDpr*(.72+.48*aHeat);
}
