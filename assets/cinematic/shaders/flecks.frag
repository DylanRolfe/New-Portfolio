precision mediump float;
uniform sampler2D uArt, uFlow, uMask;
uniform float uMotion;
varying vec2 vHome;
varying float vHeat, vSeed;
void main() {
  vec3 guide=texture2D(uFlow,vHome).rgb;
  vec2 axis=guide.rg*2.-1.;
  float angle=.5*atan(axis.y,axis.x+.0001)+(vSeed-.5)*.52;
  vec2 tangent=vec2(cos(angle),sin(angle));
  vec2 coord=gl_PointCoord-.5;
  vec2 local=vec2(dot(coord,tangent),dot(coord,vec2(-tangent.y,tangent.x)));
  float edge=length(vec2(local.x*2.15,local.y*(5.8+vSeed*2.)+.30*local.x*local.x));
  float sky=smoothstep(.15,.95,texture2D(uMask,vHome).r);
  float alpha=(1.-smoothstep(.60,1.,edge))*vHeat*.86*sky*uMotion;
  vec3 paint=texture2D(uArt,vHome).rgb;
  paint=paint*(1.16+.28*vSeed)+vec3(.10,.075,.044)*(.65+.35*vSeed);
  gl_FragColor=vec4(paint*alpha,alpha);
}
