precision highp float;
varying vec2 vScreen;
uniform sampler2D uArt, uMask, uField, uRevealMask;
uniform vec2 uView, uCover;
uniform float uTime, uMotion;

void main() {
  vec2 uv = (vScreen - 0.5) * uView / uCover + 0.5;
  // Image-space mask follows the actual skyline and the exact cover crop.
  float sky = smoothstep(0.15, 0.95, texture2D(uMask, uv).r);
  vec2 breeze = vec2(
    sin(uTime * 0.48 + uv.y * 6.2) * 0.62 + sin(uTime * 0.23 + uv.x * 3.1) * 0.38,
    cos(uTime * 0.36 + uv.x * 5.2) * 0.72 + sin(uTime * 0.19 + uv.y * 3.6) * 0.28
  );
  vec4 wake = texture2D(uField, vScreen);
  vec2 hand = (wake.rg * 255.0 - 128.0) / 3.0 / uCover;
  uv += sky * uMotion * (breeze * 0.009 + hand * 0.45);
  vec3 color = texture2D(uArt, uv).rgb;
  float heat = wake.b * sky * uMotion;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, 1.0 + heat * 0.12);
  color += heat * (0.012 + 0.055 * luma) * vec3(1.0, 0.82, 0.52);
  float cover = texture2D(uRevealMask, vScreen).a;
  gl_FragColor = vec4(color * cover, cover);
}
