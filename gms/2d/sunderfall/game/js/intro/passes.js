/* Every GL pass the intro uses. Colour is worked in linear HDR and only tonemapped at the end,
 * which is why the emissive bits bloom like film instead of clipping like a web page.
 */

import { makeProgram, makeTarget, bindTarget, clear, drawQuad, BLEND, VS_QUAD, GLSL_LIB } from './gl.js';

/* ── sky ──────────────────────────────────────────────────────────────────── */

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform vec2 uRes;
uniform float uTime, uStars, uCloud, uHaze, uSunI, uBandY, uHorizon;
uniform vec2 uSun;              // sun position in uv
uniform vec3 uTop, uMid, uLow, uSunCol;
uniform vec2 uScroll;
${GLSL_LIB}
void main(){
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);   // vUv is bottom-up; every sky term is authored top-down
  vec2 p = (uv - 0.5) * vec2(uRes.x/uRes.y, 1.0);

  float h = clamp((uv.y - uHorizon) / max(0.001, (uBandY - uHorizon)), 0.0, 1.0);
  vec3 col = mix(uTop, uMid, smoothstep(0.0, 1.0, clamp(uv.y/max(uBandY,0.001),0.0,1.0)));
  col = mix(col, uLow, smoothstep(uBandY*0.75, 1.0, uv.y));

  // stars, only where the sky is dark
  if (uStars > 0.001) {
    vec2 sp = uv * vec2(uRes.x/uRes.y, 1.0) * 240.0;
    vec2 gi = floor(sp);
    vec2 gf = fract(sp) - 0.5;
    vec2 r = hash22(gi);
    float d = length(gf - (r-0.5)*0.7);
    float mag = step(0.90, hash12(gi+3.1));
    float tw = 0.6 + 0.4*sin(uTime*(1.5+r.x*3.0) + r.y*30.0);
    col += vec3(0.75,0.82,1.0) * mag * tw * smoothstep(0.075,0.0,d) * uStars *
           smoothstep(0.85, 0.15, uv.y);
  }

  // clouds — two warped fbm layers, the near one moving faster
  if (uCloud > 0.001) {
    vec2 q = uv*vec2(uRes.x/uRes.y,1.0);
    vec2 w1 = vec2(fbm(q*2.1 + uScroll*0.7), fbm(q*2.1 + 5.2 + uScroll*0.7));
    float c1 = fbm(q*3.0 + w1*1.4 + vec2(uTime*0.010, 0.0));
    vec2 w2 = vec2(fbm(q*4.5 + uScroll*1.6), fbm(q*4.5 + 9.1 + uScroll*1.6));
    float c2 = fbm(q*6.0 + w2*1.1 + vec2(uTime*0.022, 0.0));
    float band = smoothstep(0.72, 0.05, uv.y) * smoothstep(-0.05, 0.35, uv.y);
    float m1 = smoothstep(0.42, 0.78, c1) * band;
    float m2 = smoothstep(0.50, 0.85, c2) * band * 0.8;
    // clouds are lit from the sun side
    float lit = exp(-length((uv-uSun)*vec2(uRes.x/uRes.y,1.0))*1.9);
    vec3 cloudCol = mix(uMid*0.80, uSunCol*0.16, lit*0.80);
    col = mix(col, cloudCol*0.85, m1*uCloud*0.70);
    col = mix(col, cloudCol*1.15, m2*uCloud*0.45);
  }

  // the light itself
  float d = length((uv-uSun)*vec2(uRes.x/uRes.y,1.0));
  col += uSunCol * uSunI * (exp(-d*7.0)*0.9 + exp(-d*2.2)*0.28 + exp(-d*0.75)*0.09);

  // ground haze lifting off the bottom
  col += uLow * uHaze * smoothstep(0.35, 1.05, uv.y) * (0.6 + 0.4*fbm3(uv*vec2(3.0,8.0)+uTime*0.03));

  frag = vec4(col, 1.0);
}`;

/* ── parallax layer ───────────────────────────────────────────────────────── */

const LAYER_VS = `#version 300 es
precision highp float;
uniform vec4 uRect;      // world x,y,w,h
uniform vec4 uCam;       // camx, camy, zoomx, zoomy
uniform vec2 uPar;       // parallax x,y
uniform vec2 uOffset;    // extra world offset
out vec2 vUv; out vec2 vWorld;
void main(){
  vec2 c = vec2((gl_VertexID==0||gl_VertexID==3||gl_VertexID==5)?0.0:1.0,
                (gl_VertexID==0||gl_VertexID==1||gl_VertexID==3)?0.0:1.0);
  vUv = c;
  vec2 world = uRect.xy + c*uRect.zw + uOffset;
  vWorld = world;
  vec2 cam = uCam.xy * uPar;
  gl_Position = vec4((world - cam) * uCam.zw, 0.0, 1.0);
}`;

const LAYER_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vWorld; out vec4 frag;
uniform sampler2D uTex;
uniform sampler2D uEmis;
uniform vec3 uBase, uFog, uLightCol, uAmbCol;
uniform float uFogAmt, uRim, uScatter, uAmb, uRimStep, uEmisI, uHasEmis, uAlpha, uLightR, uValue;
uniform vec2 uLightW;      // local fill light, in world
uniform vec2 uKeyDir;      // unit vector TOWARD the key, in world. One key per shot.
uniform float uKeyMode;    // 1 = use the local light's direction as the key instead of uKeyDir
uniform float uFeather;    // fade the quad's own borders, in uv — kills additive bounding boxes
uniform vec2 uTexel;
void main(){
  vec4 s = texture(uTex, vUv);
  float a = s.a;
  if (a < 0.004 && uHasEmis < 0.5) discard;
  float lum = a > 0.004 ? clamp(s.r/a, 0.0, 1.0) : 0.0;

  vec2 dl = uLightW - vWorld;
  float dist = length(dl);
  float atten = 1.0 / (1.0 + (dist*dist)/(uLightR*uLightR));
  vec2 kdir = uKeyMode > 0.5 ? normalize(dl + vec2(1e-5)) : uKeyDir;

  // Surface normal from the gradient of coverage. Only edges have a gradient, so interiors stay
  // black no matter how soft the brushwork is — the earlier a-minus-a-offset trick lit whole
  // trunks because a thin shape is all edge. Two scales: a tight one for the terminator and a
  // wide one for the falloff, or the rim is a uniform hairline stroke on every silhouette.
  vec2 e1 = uTexel * uRimStep;
  vec2 e2 = e1 * 2.6;
  vec2 g1 = vec2(texture(uTex, vUv+vec2(e1.x,0.0)).a - texture(uTex, vUv-vec2(e1.x,0.0)).a,
                 texture(uTex, vUv+vec2(0.0,e1.y)).a - texture(uTex, vUv-vec2(0.0,e1.y)).a);
  vec2 g2 = vec2(texture(uTex, vUv+vec2(e2.x,0.0)).a - texture(uTex, vUv-vec2(e2.x,0.0)).a,
                 texture(uTex, vUv+vec2(0.0,e2.y)).a - texture(uTex, vUv-vec2(0.0,e2.y)).a);
  float m1 = length(g1), m2 = length(g2);
  vec2 n1 = m1 > 1e-4 ? -g1/m1 : vec2(0.0);
  vec2 n2 = m2 > 1e-4 ? -g2/m2 : vec2(0.0);
  float rimN = pow(max(dot(n1, kdir), 0.0), 1.7) * min(m1*2.0, 1.0);
  float rimW = pow(max(dot(n2, kdir), 0.0), 1.1) * min(m2*1.1, 1.0);
  // modulated by the painted value, so the highlight is not a constant-width gold wire
  float rim = (rimN*0.62 + rimW*0.50) * a * (0.28 + lum*1.05);

  // Shadow is the ambient colour, NOT the warm base tinted by it — that is what made every shot
  // a single-hue wash. uBase only bleeds a little scene warmth back into the midtones.
  vec3 shade = mix(uAmbCol, uAmbCol*uBase, 0.30);
  vec3 col = shade * (uValue*0.30 + lum*0.85) * uAmb;
  col += uLightCol * rim * uRim * mix(1.0, atten, uKeyMode);
  // the ambient fill follows the painted value; it used to be INVERTED (1 - lum), which flattened
  // every internal value distinction the artwork carries
  col += uLightCol * uScatter * atten * a * (0.30 + lum*1.00);
  col = mix(col, uFog, uFogAmt);

  vec3 outc = col * a;
  float oa = a;
  if (uHasEmis > 0.5) {
    vec4 em = texture(uEmis, vUv);
    outc += em.rgb * uEmisI;
    oa = max(oa, em.a);
  }
  float fe = 1.0;
  if (uFeather > 0.0001) {
    vec2 d2 = min(vUv, 1.0 - vUv);
    fe = smoothstep(0.0, uFeather, min(d2.x, d2.y));
  }
  frag = vec4(outc*uAlpha*fe, oa*uAlpha*fe);
}`;

/* ── volumetric mist band ─────────────────────────────────────────────────── */

const MIST_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vWorld; out vec4 frag;
uniform vec3 uCol;
uniform float uTime, uAmt, uScale, uSharp, uTop, uBot;
uniform vec2 uLightW; uniform float uLightR; uniform vec3 uLightCol;
${GLSL_LIB}
void main(){
  // isotropic scale, or the noise stretches into vertical streaks on a 4:1 quad
  vec2 q = vWorld * uScale;
  float n  = fbm3(q + vec2(uTime*0.010, uTime*0.004));
  float n2 = fbm3(q*2.4 - vec2(uTime*0.018, 0.0));
  float band = smoothstep(uTop, uTop+0.30, vUv.y) * (1.0 - smoothstep(uBot-0.42, uBot, vUv.y));
  // the quad has to fade out inside its own bounds or its left/right edges are two vertical seams
  band *= smoothstep(0.0, 0.10, vUv.x) * smoothstep(1.0, 0.90, vUv.x);
  float m = smoothstep(0.40, 0.40+uSharp, n*0.72 + n2*0.38) * band * uAmt;
  float d = length(uLightW - vWorld);
  float lit = 1.0/(1.0 + (d*d)/(uLightR*uLightR));
  vec3 c = uCol * (1.0 + lit*0.45);
  frag = vec4(c*m, m);
}`;

/* ── the seam: showpiece one ──────────────────────────────────────────────── */

const SEAM_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform vec2 uRes;
uniform float uTime, uOpen, uWidth, uGlow, uAmp, uCore, uY, uRayI;
${GLSL_LIB}

float seamY(float x){
  return uY
    + (fbm3(vec2(x*3.0, 11.7)) - 0.5) * uAmp
    + (fbm3(vec2(x*9.0, 3.1))  - 0.5) * uAmp * 0.45
    + (vnoise(vec2(x*30.0, uTime*0.7)) - 0.5) * uAmp * 0.09;
}

void main(){
  float ar = uRes.x/uRes.y;
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  float xc = p.x - 0.5;

  // how far the tear has propagated out from the centre
  float reach = max(uOpen, 1e-4);
  float edge  = 1.0 - smoothstep(reach*0.62, reach, abs(xc));
  float taper = pow(clamp(1.0 - abs(xc)/reach, 0.0, 1.0), 0.5);
  if (edge <= 0.001) { frag = vec4(0.0); return; }

  float sy = seamY(p.x);
  float dy = (p.y - sy) * ar;
  float w  = max(uWidth * (0.22 + taper), 1e-4);

  float core = exp(-pow(abs(dy)/(w*0.30), 1.5));
  float halo = exp(-pow(abs(dy)/(w*1.6),  1.2));
  float glow = exp(-pow(abs(dy)/(w*5.0),  1.0));

  vec3 hot  = vec3(1.00, 0.97, 0.92);
  vec3 warm = vec3(1.00, 0.58, 0.20);
  vec3 deep = vec3(1.00, 0.22, 0.05);

  vec3 c = hot*core*uCore + warm*halo*0.55 + deep*glow*0.16;

  // forks: short branch cracks peeling off the main tear
  float fx = p.x*7.0;
  float cell = floor(fx);
  vec2 h2 = hash22(vec2(cell, 3.0));
  float side = h2.x < 0.5 ? -1.0 : 1.0;
  float bx = fract(fx) - h2.y;
  float bl = (0.05 + h2.x*0.11) * taper;
  float bdy = dy - side * abs(bx) * 1.35;
  float branch = exp(-pow(abs(bdy)/(w*0.55), 1.4))
               * smoothstep(bl, bl*0.25, abs(bx)*0.6) * step(0.30, h2.y);
  c += (hot*0.65 + warm*0.5) * branch * uCore;

  // filaments crawling along the crack
  c += warm * core * fbm3(vec2(p.x*46.0 - uTime*1.6, dy*26.0)) * 0.55;

  // light spilling downward out of the tear
  float shaft = fbm3(vec2(p.x*26.0 + 3.0, 0.6));
  c += warm * uRayI * exp(-max(dy, 0.0)/(w*22.0)) * pow(shaft, 3.0) * taper * 0.5;

  c *= edge * uGlow;
  frag = vec4(c, 0.0);
}`;

/* ── the ward: cracked barrier of light ───────────────────────────────────── */

const WARD_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vWorld; out vec4 frag;
uniform vec2 uCentre; uniform float uR, uTime, uAmt, uCrack, uBreak, uSeed;
uniform vec3 uCol;
${GLSL_LIB}
void main(){
  vec2 d = (vWorld - uCentre) / uR;
  d.y *= 1.42;                       // a dome, not a ball
  float r = length(d);
  if (d.y > 0.26 || r > 1.35) discard;
  // fade to nothing INSIDE the cut, or the base of the dome is a hard full-width horizontal seam
  float baseFade = smoothstep(0.20, -0.02, d.y);

  float ang = atan(d.y, d.x);
  float wob = (fbm3(vec2(ang*2.0, uTime*0.35 + uSeed))-0.5)*0.045;
  float rr = r + wob;

  float shell  = exp(-pow(abs(rr - 1.0)/0.070, 2.0));
  float fres   = pow(clamp(rr, 0.0, 1.0), 5.0) * smoothstep(1.22, 0.80, rr);
  float inside = smoothstep(1.02, 0.10, rr) * 0.045;

  // panel lattice
  vec2 cell = vec2(ang*4.6, rr*7.0);
  vec2 ci = floor(cell); vec2 cf = fract(cell)-0.5;
  float cd = min(abs(cf.x), abs(cf.y));
  float grid = smoothstep(0.055, 0.0, cd) * smoothstep(1.10, 0.35, rr) * 0.30;

  // fractures widen as it fails
  float fr = fbm3(vec2(ang*7.0 + uSeed, rr*9.0));
  float crackLine = smoothstep(0.50 - uCrack*0.16, 0.505, fr) * smoothstep(0.560, 0.505, fr);
  crackLine *= max(shell, fres*0.7);
  float flick = 0.74 + 0.26*sin(uTime*9.0 + fbm3(vec2(ang*3.0, uTime*0.6))*8.0);

  float panel = step(hash12(ci + floor(uSeed*10.0)), uBreak);
  float a = (shell*0.95 + fres*0.55 + inside + grid) * flick * uAmt * (1.0 - panel) * baseFade;
  vec3 c = uCol * a;
  c += vec3(1.0,0.94,0.85) * crackLine * (0.35 + uCrack*2.2) * uAmt * flick * (1.0 - panel) * baseFade;
  frag = vec4(c, 0.0);
}`;

/* ── the thing that comes through ─────────────────────────────────────────── */

const DARK_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform vec2 uRes; uniform float uTime, uRise, uEye, uFlip, uFocus, uReach;
${GLSL_LIB}
void main(){
  // uFlip = 1: the mass hangs from the top of the frame and pours down (the cold open)
  // uFlip = 0: it climbs up out of the ground (the last shot)
  vec2 sv = vec2(vUv.x, 1.0 - vUv.y);
  float uy = uFlip > 0.5 ? sv.y : (1.0 - sv.y);
  float ar = uRes.x/uRes.y;

  float wob = (fbm3(vec2(sv.x*3.0, uTime*0.22))-0.5)*0.10
            + (fbm3(vec2(sv.x*9.0, uTime*0.45))-0.5)*0.035;

  // a column bearing down on one point — the pressure has a location
  float col0 = exp(-pow((sv.x-uFocus)*ar*1.35, 2.0)) * 0.42 * uRise;
  float front = uRise*1.15 + wob + col0;
  float body = smoothstep(front+0.010, front-0.010, uy);

  // tendrils, longest inside the column
  float t1 = fbm3(vec2(sv.x*15.0 + 4.0, uTime*0.45));
  float t2 = fbm3(vec2(sv.x*44.0, uTime*0.8));
  float reach = pow(smoothstep(0.28, 1.0, t1), 1.4) * uReach * (0.5 + col0*2.2);
  body = max(body, smoothstep(front+reach+0.006, front+reach-0.06, uy) * smoothstep(0.36, 0.78, t2));

  // it does not merely cover the frame, it drinks the light out of the sky beneath it
  float halo = smoothstep(front+0.34, front-0.02, uy) * 0.5;

  float e = 0.0;
  for (int i=0;i<2;i++){
    vec2 ec = vec2(uFocus + (float(i)*2.0-1.0)*0.030, front - 0.075 + sin(uTime*0.6)*0.004);
    vec2 pp = vec2(sv.x, uy);
    float d = length((pp-ec)*vec2(ar,1.0)*vec2(1.0,1.9));
    e += exp(-d*26.0)*0.7 + exp(-d*80.0)*1.8;
  }
  float blink = smoothstep(0.015, 0.09, abs(fract(uTime*0.13)-0.5));

  vec3 c = vec3(0.003,0.003,0.007) * body;
  c += vec3(1.3,0.15,0.05) * e * uEye * blink;
  frag = vec4(c, clamp(body + halo*uRise, 0.0, 1.0));
}`;

const BLIT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform float uScale;
void main(){ frag = vec4(texture(uTex, vUv).rgb * uScale, 1.0); }`;

/* ── post chain ───────────────────────────────────────────────────────────── */

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform float uThresh, uKnee;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float b = max(c.r, max(c.g, c.b));
  float s = clamp((b - uThresh + uKnee) / (2.0*uKnee + 1e-4), 0.0, 1.0);
  float w = max(s*s*uKnee, b - uThresh) / max(b, 1e-4);
  // a single 20x-overbright pixel must not flood the whole chain
  frag = vec4(min(c*w, vec3(5.0)), 1.0);
}`;

const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec3 c = texture(uTex, vUv).rgb * 0.25;
  c += texture(uTex, vUv + uTexel*vec2( 1, 1)).rgb * 0.125;
  c += texture(uTex, vUv + uTexel*vec2(-1, 1)).rgb * 0.125;
  c += texture(uTex, vUv + uTexel*vec2( 1,-1)).rgb * 0.125;
  c += texture(uTex, vUv + uTexel*vec2(-1,-1)).rgb * 0.125;
  c += texture(uTex, vUv + uTexel*vec2( 2, 0)).rgb * 0.0625;
  c += texture(uTex, vUv + uTexel*vec2(-2, 0)).rgb * 0.0625;
  c += texture(uTex, vUv + uTexel*vec2( 0, 2)).rgb * 0.0625;
  c += texture(uTex, vUv + uTexel*vec2( 0,-2)).rgb * 0.0625;
  frag = vec4(c, 1.0);
}`;

const UP_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uRadius;
void main(){
  vec2 t = uTexel*uRadius;
  vec3 c = texture(uTex, vUv).rgb*4.0;
  c += (texture(uTex, vUv+vec2( t.x,0)).rgb + texture(uTex, vUv+vec2(-t.x,0)).rgb
      + texture(uTex, vUv+vec2(0, t.y)).rgb + texture(uTex, vUv+vec2(0,-t.y)).rgb)*2.0;
  c += texture(uTex, vUv+t).rgb + texture(uTex, vUv-t).rgb
     + texture(uTex, vUv+vec2(t.x,-t.y)).rgb + texture(uTex, vUv+vec2(-t.x,t.y)).rgb;
  frag = vec4(c/16.0, 1.0);
}`;

const RAY_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uSun; uniform float uDensity, uDecay, uWeight, uStep;
void main(){
  // March toward the light. Samples that fall outside the frame must contribute nothing —
  // CLAMP_TO_EDGE otherwise smears the border pixels into a solid rectangle.
  vec2 dir = (vUv - uSun) * (uDensity / 24.0);
  vec2 uv = vUv;
  vec3 acc = vec3(0.0);
  float illum = 1.0;
  for (int i=0;i<24;i++){
    uv -= dir;
    vec2 g = step(vec2(0.0), uv) * step(uv, vec2(1.0));
    acc += texture(uTex, uv).rgb * illum * uWeight * g.x * g.y;
    illum *= uDecay;
  }
  frag = vec4(acc/24.0, 1.0);
}`;

const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uScene, uBloom, uRays;
uniform vec2 uRes;
uniform float uTime, uExposure, uBloomI, uRayI, uVig, uGrain, uChroma, uFade, uShimmer;
uniform vec3 uFlash, uLift, uGain;
uniform float uSat, uContrast;
uniform vec4 uWave0, uWave1, uWave2;   // xy centre (uv), z age, w strength
${GLSL_LIB}

vec2 waveDisp(vec2 uv, vec4 w, float ar){
  if (w.w <= 0.0) return vec2(0.0);
  vec2 d = (uv - w.xy) * vec2(ar, 1.0);
  float r = length(d);
  float front = w.z;
  float ring = exp(-pow((r - front)/0.085, 2.0));
  return normalize(d + 1e-6) * ring * w.w * 0.055 / vec2(ar, 1.0);
}

void main(){
  float ar = uRes.x/uRes.y;
  vec2 uv = vUv;
  vec2 disp = waveDisp(uv,uWave0,ar) + waveDisp(uv,uWave1,ar) + waveDisp(uv,uWave2,ar);
  if (uShimmer > 0.0) {
    disp += (vec2(fbm3(uv*vec2(9.0,22.0)+vec2(0.0,uTime*0.9)),
                  fbm3(uv*vec2(9.0,22.0)+vec2(5.0,uTime*0.9)))-0.5) * uShimmer * 0.02;
  }
  uv += disp;

  float r2 = dot(vUv-0.5, vUv-0.5);
  float ca = (uChroma + length(disp)*7.0) * (0.25 + r2*2.2) * 0.006;
  vec3 col;
  col.r = texture(uScene, uv + vec2(ca, 0.0)).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - vec2(ca, 0.0)).b;

  col += texture(uBloom, uv).rgb * uBloomI;
  col += texture(uRays, uv).rgb * uRayI;
  col += uFlash;

  col *= uExposure;
  col = aces(col);

  // grade: lift shadows cool, push highlights warm, then contrast
  col = col + uLift*(1.0 - col);
  col *= uGain;
  float l = dot(col, vec3(0.2126,0.7152,0.0722));
  col = mix(vec3(l), col, uSat);
  col = clamp((col - 0.5)*uContrast + 0.5, 0.0, 1.0);

  float v = 1.0 - uVig * smoothstep(0.18, 0.95, length((vUv-0.5)*vec2(1.0, 1.12))*1.45);
  col *= v;

  float g = hash12(vUv*uRes + fract(uTime)*137.0) - 0.5;
  col += g * uGrain * (1.0 - l*0.7);

  col *= uFade;
  frag = vec4(col, 1.0);
}`;

/* ── the pass bundle ──────────────────────────────────────────────────────── */

export function createPasses(gl, floatOK) {
  const P = {
    sky: makeProgram(gl, VS_QUAD, SKY_FS, 'sky'),
    layer: makeProgram(gl, LAYER_VS, LAYER_FS, 'layer'),
    mist: makeProgram(gl, LAYER_VS, MIST_FS, 'mist'),
    seam: makeProgram(gl, VS_QUAD, SEAM_FS, 'seam'),
    ward: makeProgram(gl, LAYER_VS, WARD_FS, 'ward'),
    dark: makeProgram(gl, VS_QUAD, DARK_FS, 'dark'),
    bright: makeProgram(gl, VS_QUAD, BRIGHT_FS, 'bright'),
    down: makeProgram(gl, VS_QUAD, DOWN_FS, 'down'),
    up: makeProgram(gl, VS_QUAD, UP_FS, 'up'),
    ray: makeProgram(gl, VS_QUAD, RAY_FS, 'ray'),
    comp: makeProgram(gl, VS_QUAD, COMP_FS, 'comp'),
    blit: makeProgram(gl, VS_QUAD, BLIT_FS, 'blit'),
  };

  const vao = gl.createVertexArray();   // WebGL2 needs a bound VAO even with no attributes

  let W = 0, H = 0;
  let scene = null, rays = null, rayTmp = null, atmos = null;
  const mips = [];

  function resize(w, h) {
    if (w === W && h === H) return;
    W = w; H = h;
    free();
    scene = makeTarget(gl, w, h, { float: floatOK });
    // the sky is entirely low-frequency: rendering it at a third and upscaling is free quality
    atmos = makeTarget(gl, Math.max(8, Math.ceil(w / 3)), Math.max(8, Math.ceil(h / 3)), { float: floatOK });
    const rw = Math.max(8, w >> 2), rh = Math.max(8, h >> 2);
    rays = makeTarget(gl, rw, rh, { float: floatOK });
    rayTmp = makeTarget(gl, rw, rh, { float: floatOK });
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < 6 && mw > 4 && mh > 4; i++) {
      mips.push(makeTarget(gl, mw, mh, { float: floatOK }));
      mw >>= 1; mh >>= 1;
    }
  }

  function free() {
    scene?.free(); rays?.free(); rayTmp?.free(); atmos?.free();
    for (const m of mips) m.free();
    mips.length = 0;
    scene = rays = rayTmp = atmos = null;
  }

  function bloom(threshold = 1.0, knee = 0.6, radius = 1.15) {
    if (!mips.length) return null;
    BLEND.none(gl);
    bindTarget(gl, mips[0]);
    P.bright.use().tex('uTex', scene.tex, 0).f('uThresh', threshold).f('uKnee', knee);
    drawQuad(gl);
    for (let i = 1; i < mips.length; i++) {
      bindTarget(gl, mips[i]);
      P.down.use().tex('uTex', mips[i - 1].tex, 0).v2('uTexel', 1 / mips[i - 1].w, 1 / mips[i - 1].h);
      drawQuad(gl);
    }
    BLEND.add(gl);
    for (let i = mips.length - 1; i > 0; i--) {
      bindTarget(gl, mips[i - 1]);
      P.up.use().tex('uTex', mips[i].tex, 0).v2('uTexel', 1 / mips[i].w, 1 / mips[i].h).f('uRadius', radius);
      drawQuad(gl);
    }
    BLEND.none(gl);
    return mips[0];
  }

  function godrays(sunUv, density = 0.9, decay = 0.94, weight = 1.0, threshold = 1.25) {
    BLEND.none(gl);
    bindTarget(gl, rayTmp);
    P.bright.use().tex('uTex', scene.tex, 0).f('uThresh', threshold).f('uKnee', 0.5);
    drawQuad(gl);
    bindTarget(gl, rays);
    P.ray.use().tex('uTex', rayTmp.tex, 0).v2('uSun', sunUv[0], sunUv[1])
      .f('uDensity', density).f('uDecay', decay).f('uWeight', weight);
    drawQuad(gl);
    // second, wider sweep so the shafts reach the frame edge
    bindTarget(gl, rayTmp);
    P.ray.use().tex('uTex', rays.tex, 0).v2('uSun', sunUv[0], sunUv[1])
      .f('uDensity', Math.min(1.0, density * 1.15)).f('uDecay', decay).f('uWeight', 0.85);
    drawQuad(gl);
    return rayTmp;
  }

  return {
    prog: P, vao,
    get scene() { return scene; },
    get atmos() { return atmos; },
    get W() { return W; }, get H() { return H; },
    resize, free, bloom, godrays,
    bindVao() { gl.bindVertexArray(vao); },
    freeAll() { free(); for (const k in P) P[k].free(); gl.deleteVertexArray(vao); },
  };
}
