precision highp float;
varying vec2 vScreen;
uniform sampler2D uArt, uFlow, uMask, uField;
uniform vec2 uView, uCover;
uniform float uTime, uMotion, uReveal, uBrush;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// One wide brush travels across the screen. Behind the hairs the painting is
// solid. The head is separate bristles with gaps, not a glowing band.
vec2 brushPass(vec2 s, float reveal) {
  vec2 dir = vec2(0.985, 0.17);
  float along = dot(s, dir);
  float across = dot(s, vec2(-dir.y, dir.x));
  float lead = mix(-0.10, 1.32, reveal);
  float passed = lead - along;
  float row = across * 36.0;
  float id = floor(row);
  float f = fract(row);
  float j = hash(vec2(id, 4.0));
  float len = 0.045 + j * 0.07;
  float tip = passed + (j - 0.5) * 0.05;
  float strand = smoothstep(0.0, 0.01, tip) * smoothstep(len, len - 0.018, tip);
  float hair = smoothstep(0.16, 0.28, f) * smoothstep(0.84, 0.70, f);
  hair *= 0.72 + 0.28 * hash(vec2(id, 9.0));
  float solid = smoothstep(0.0, 0.018, passed - len);
  float cover = max(solid, strand * hair);
  if (reveal > 0.985) return vec2(1.0, 0.0);
  return vec2(clamp(cover, 0.0, 1.0), strand * hair);
}

void main() {
  vec2 uv = (vScreen - 0.5) * uView / uCover + 0.5;
  // Idle breeze stays in the sky and stays at zero until the handoff asks for it.
  float sky = smoothstep(0.56, 0.02, vScreen.y);
  vec2 breeze = vec2(
    sin(uTime * 0.48 + vScreen.y * 6.2) * 0.62 + sin(uTime * 0.23 + vScreen.x * 3.1) * 0.38,
    cos(uTime * 0.36 + vScreen.x * 5.2) * 0.72 + sin(uTime * 0.19 + vScreen.y * 3.6) * 0.28
  );
  uv += sky * breeze * 0.018 * uMotion;
  vec4 wake = texture2D(uField, vScreen);
  vec3 color = texture2D(uArt, uv).rgb;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, 1.0 + wake.b * 0.12);
  color += wake.b * (0.012 + 0.055 * luma) * vec3(1.0, 0.82, 0.52);
  // uBrush defaults to 0, so other pages stay fully painted.
  vec2 brush = uBrush > 0.5 ? brushPass(vScreen, uReveal) : vec2(1.0, 0.0);
  float cover = brush.x;
  float hair = brush.y;
  color *= 1.0 - hair * 0.34;
  color += hair * vec3(0.05, 0.045, 0.04);
  gl_FragColor = vec4(color * cover, cover);
}
