import * as THREE from 'three';

// High tier only. Heat shimmer: copies a small framebuffer patch mid-render (after the opaque pass) and redraws it
// with a wobbling offset — real refraction for 1 call + a ≤256² copy. Glare: an additive full-screen sun bloom +
// windscreen grime, only in the inside views while the sun is near the view direction.

const SH = 256;

const shimmerVert = /* glsl */`
uniform vec3 uCenter; uniform vec2 uSize;
varying vec2 vQ;
void main() {
  vec4 mv = viewMatrix * vec4(uCenter, 1.0);
  mv.xy += position.xy * uSize;
  vQ = position.xy;
  gl_Position = projectionMatrix * mv;
}`;
const shimmerFrag = /* glsl */`
uniform sampler2D tScene; uniform vec2 uOrigin; uniform float uTime, uAmt;
varying vec2 vQ;
void main() {
  vec2 q = vQ + 0.5;
  float m = smoothstep(0.0, 0.3, q.x) * smoothstep(1.0, 0.55, q.x) * smoothstep(0.0, 0.35, q.y) * smoothstep(1.0, 0.6, q.y);
  vec2 w = vec2(sin(gl_FragCoord.y * 0.21 + uTime * 23.0) + sin(gl_FragCoord.y * 0.13 - uTime * 17.0 + gl_FragCoord.x * 0.05),
                cos(gl_FragCoord.x * 0.19 - uTime * 19.0)) * 1.6 * uAmt * m;
  vec2 p = gl_FragCoord.xy - uOrigin + w;
  vec2 e = min(p, vec2(${SH}.0) - p);
  float inside = smoothstep(0.0, 6.0, min(e.x, e.y));
  if (inside * m < 0.01) discard;
  gl_FragColor = vec4(texture2D(tScene, p / ${SH}.0).rgb, inside * m);
}`;

const glareVert = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const glareFrag = /* glsl */`
uniform vec2 uSun; uniform float uAmt, uAspect;
varying vec2 vP;
float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 d = (vP - uSun) * vec2(uAspect, 1.0);
  float r = length(d);
  float bloom = exp(-r * r * 14.0) * 0.38 + exp(-r * 2.6) * 0.14;
  float streak = exp(-abs(d.y) * 60.0) * exp(-abs(d.x) * 1.6) * 0.22;
  vec2 g = vP * vec2(uAspect, 1.0) * 7.0;
  float grime = smoothstep(0.62, 0.95, n(g) * 0.65 + n(g * 3.1) * 0.35) * 0.55 + smoothstep(0.82, 0.9, n(g * 9.0)) * 0.35;
  float wipe = 0.6 + 0.4 * smoothstep(0.2, 1.4, length(vP - vec2(0.0, -1.2)));
  float lit = exp(-r * 1.4);
  vec3 c = vec3(1.0, 0.92, 0.78) * (bloom + streak) + vec3(1.0, 0.95, 0.85) * grime * wipe * lit * 0.3;
  gl_FragColor = vec4(c * uAmt, 1.0);
}`;

export function createScreenFX(scene, renderer, camera) {
  const tex = new THREE.FramebufferTexture(SH, SH);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  const sMat = new THREE.ShaderMaterial({
    vertexShader: shimmerVert, fragmentShader: shimmerFrag,
    uniforms: { tScene: { value: tex }, uOrigin: { value: new THREE.Vector2() }, uTime: { value: 0 }, uAmt: { value: 0 },
      uCenter: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2(2.6, 1.3) } },
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false,
  });
  const sGeo = new THREE.PlaneGeometry(1, 1);
  const shimmer = new THREE.Mesh(sGeo, sMat);
  shimmer.frustumCulled = false;
  shimmer.renderOrder = 3;
  shimmer.visible = false;
  shimmer.name = 'fx-shimmer';
  scene.add(shimmer);

  const v = new THREE.Vector3(), buf = new THREE.Vector2(), origin = new THREE.Vector2();
  let ok = true;
  shimmer.onBeforeRender = (r, sc, cam) => {
    if (!ok) return;
    v.copy(sMat.uniforms.uCenter.value).project(cam);
    r.getDrawingBufferSize(buf);
    const cx = (v.x * 0.5 + 0.5) * buf.x, cy = (v.y * 0.5 + 0.5) * buf.y;
    const x0 = Math.max(0, Math.min(buf.x - SH, Math.round(cx - SH / 2))), y0 = Math.max(0, Math.min(buf.y - SH, Math.round(cy - SH / 2)));
    origin.set(x0, y0);
    sMat.uniforms.uOrigin.value.copy(origin);
    try { r.copyFramebufferToTexture(tex, origin); } catch (e) { ok = false; shimmer.visible = false; }
  };

  const gMat = new THREE.ShaderMaterial({
    vertexShader: glareVert, fragmentShader: glareFrag,
    uniforms: { uSun: { value: new THREE.Vector2() }, uAmt: { value: 0 }, uAspect: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
    blending: THREE.AdditiveBlending,
  });
  const glare = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gMat);
  glare.frustumCulled = false;
  glare.renderOrder = 999;
  glare.visible = false;
  glare.name = 'fx-glare';
  scene.add(glare);

  const fwd = new THREE.Vector3(), sp = new THREE.Vector3();
  const X = { shimmer, glare, get shimmerOk() { return ok; } };
  // amt 0..1; center = world point of the plume
  X.setShimmer = (amt, center, T) => {
    shimmer.visible = ok && amt > 0.02;
    sMat.uniforms.uAmt.value = amt; sMat.uniforms.uTime.value = T[0];
    sMat.uniforms.uCenter.value.copy(center);
  };
  X.updateGlare = (enabled, sunDir, strength = 1) => {
    if (!enabled) { glare.visible = false; return; }
    camera.getWorldDirection(fwd);
    const c = fwd.dot(sunDir);
    if (c < 0.55) { glare.visible = false; return; }
    sp.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
    gMat.uniforms.uSun.value.set(sp.x, sp.y);
    gMat.uniforms.uAspect.value = camera.aspect;
    gMat.uniforms.uAmt.value = strength * Math.min(1, (c - 0.55) / 0.35) ** 2;
    glare.visible = true;
  };
  X.dispose = () => { scene.remove(shimmer); scene.remove(glare); sGeo.dispose(); sMat.dispose(); gMat.dispose(); tex.dispose(); glare.geometry.dispose(); };
  return X;
}
