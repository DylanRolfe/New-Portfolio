precision mediump float;

varying vec2 vUv;
uniform sampler2D uArt;
uniform sampler2D uMask;
uniform sampler2D uFlow;
uniform vec2 uView;
uniform vec2 uImage;
uniform vec2 uPointer;
uniform vec2 uDirection;
uniform float uStrength;

// Match CSS object-fit: cover; object-position: center. vUv is bottom-left;
// texture v = 0 is the top of an unflipped upload.
vec2 coverUv(vec2 css) {
  float cover = max(uView.x / uImage.x, uView.y / uImage.y);
  vec2 displayed = uImage * cover;
  vec2 pixel = css * uView + (displayed - uView) * 0.5;
  return pixel / displayed;
}

void main() {
  vec2 css = vec2(vUv.x, 1.0 - vUv.y);
  vec2 uv = coverUv(css);
  vec4 art = texture2D(uArt, uv);
  float mask = texture2D(uMask, uv).r;
  vec3 flow = texture2D(uFlow, uv).rgb;
  vec2 encoded = flow.rg * 2.0 - 1.0;
  float span = length(encoded);
  float angle = span > 0.001 ? atan(encoded.y, encoded.x) * 0.5 : 0.0;
  vec2 brush = vec2(cos(angle), sin(angle));
  if (dot(brush, uDirection) < 0.0) brush = -brush;

  float dist = distance(css * uView, uPointer * uView);
  float falloff = smoothstep(132.0, 18.0, dist) * mask * flow.b * uStrength;
  float cover = max(uView.x / uImage.x, uView.y / uImage.y);
  vec2 shifted = uv - (brush * (24.0 * falloff) / cover) / uImage;
  vec3 color = mix(art.rgb, texture2D(uArt, shifted).rgb, clamp(falloff, 0.0, 1.0));
  float gold = clamp(art.r - art.b, 0.0, 1.0) * smoothstep(0.25, 0.85, art.g);
  color += vec3(0.15, 0.09, 0.015) * gold * falloff;
  gl_FragColor = vec4(color, 1.0);
}
