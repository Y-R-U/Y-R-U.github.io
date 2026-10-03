import * as THREE from 'three';

// Sun (one shared shadow map) + coloured hemisphere fill + low rim, fog = sky horizon, gradient sky and a
// tiny procedural equirect environment for the PBR sheen. Everything comes out of one palette `light` block.
const D2R = Math.PI / 180;
const BUTTES = 26;
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

export function createLighting(scene, light) {
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.mapSize.set(2048, 2048);
  const target = new THREE.Object3D();
  sun.target = target;
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.target = target;
  scene.add(sun, target, hemi, rim);
  scene.fog = new THREE.Fog(0xffffff, 80, 380);

  const sky = createSky();
  scene.add(sky.mesh);
  scene.background = new THREE.Color();
  const envCv = document.createElement('canvas');
  envCv.width = 64; envCv.height = 32;
  const envTex = new THREE.CanvasTexture(envCv);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = envTex;

  let L = null, size = 60, mapSize = 2048;
  const rig = {
    sun, hemi, rim, target, sky,
    get palette() { return L; },
    apply(l) {
      L = l;
      sun.color.set(l.sun.color);
      sun.intensity = l.sun.intensity;
      hemi.color.set(l.fill.sky);
      hemi.groundColor.set(l.fill.ground);
      hemi.intensity = l.fill.intensity;
      rim.color.set(l.rim.color);
      rim.intensity = l.rim.intensity;
      scene.fog.color.set(l.sky.horizon);
      sky.apply(l);
      scene.background.set(l.sky.horizon);
      paintEnv(envCv, l);
      envTex.needsUpdate = true;
      rig.place(target.position);
    },
    // Called per view: the shadow frustum hugs whatever this camera is looking at.
    place(look, radius = size) {
      if (!L) return;
      size = radius;
      target.position.copy(look);
      const az = L.sun.azimuth * D2R, el = L.sun.elevation * D2R, d = 120;
      sun.position.set(look.x + Math.cos(az) * Math.cos(el) * d, look.y + Math.sin(el) * d, look.z + Math.sin(az) * Math.cos(el) * d);
      const ra = az + Math.PI * 0.9, rel = 16 * D2R;
      rim.position.set(look.x + Math.cos(ra) * Math.cos(rel) * d, look.y + Math.sin(rel) * d, look.z + Math.sin(ra) * Math.cos(rel) * d);
      const c = sun.shadow.camera;
      if (c.right !== radius) {
        c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
        c.near = d - radius * 1.6; c.far = d + radius * 1.6;
        c.updateProjectionMatrix();
      }
      target.updateMatrixWorld();
    },
    setShadowMap(n) {
      if (n === mapSize) return;
      mapSize = n;
      sun.shadow.mapSize.set(n, n);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    },
  };
  return rig;
}

// Sky dome (one draw, follows the camera): world-space gradient horizon → mid → top, a warm glow band toward the sun,
// the sun disc (hot enough to bloom), soft streaky clouds lit from the sun side, and the moon + stars at night.
// The disc sits at l.disc {az, el} (decorative: low on the horizon where the hero camera can see it); light uses l.sun.
const SKY_V = `varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }`;
const SKY_F = `uniform vec3 uTop, uMid, uHor, uSun, uDisc, uGround, uRockLit, uRockShade;
uniform vec3 uDiscDir;
uniform float uNight, uTopY;
uniform vec4 uButte[${BUTTES}];
varying vec3 vDir;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  // R4: the gradient is framed by the view (uTopY = sky height at the frame's top edge), so a card that sees 6° of
  // sky and the hero that sees 15° both get the full horizon → rose → violet sunset ramp.
  float ty = max(y, 0.0) / clamp(uTopY, 0.1, 0.6);
  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.38, ty));
  c = mix(c, uTop, smoothstep(0.3, 0.95, ty));
  c = mix(c, mix(uHor, uGround, 0.55), smoothstep(0.0, -0.08, y));
  float s = max(dot(d, uDiscDir), 0.0);
  float band = exp(-abs(y) * 9.0);
  c += uSun * (pow(s, 4.0) * 0.22 + pow(s, 8.0) * 0.16 + pow(s, 60.0) * 0.32) * (1.0 - 0.75 * uNight) + uSun * band * pow(s, 2.0) * 0.16 * (1.0 - uNight);
  vec2 cp = d.xz / (y + 0.12);
  float cl = smoothstep(0.55, 0.85, vn(cp * vec2(0.9, 3.2) + 7.0) * 0.65 + vn(cp * vec2(2.3, 7.0)) * 0.35) * smoothstep(0.02, 0.12, y) * (1.0 - smoothstep(0.45, 0.8, y));
  vec3 cc = mix(uMid * 1.08, uSun * 0.9 + uHor * 0.35, pow(s, 3.0)) * (1.0 - 0.55 * uNight);
  c = mix(c, cc, cl * 0.55);
  float dr = mix(0.042, 0.052, uNight);
  float disc = smoothstep(cos(dr), cos(dr * 0.86), s);
  if (uNight > 0.5) {
    c += uDisc * 0.05 * pow(s, 90.0) * uNight + uDisc * 0.02 * pow(s, 14.0) * uNight;
    vec3 ax = normalize(cross(uDiscDir, vec3(0.0, 1.0, 0.0)));
    vec2 mp = vec2(dot(d - uDiscDir, ax), dot(d - uDiscDir, cross(ax, uDiscDir))) / dr;
    float mare = vn(mp * 2.3 + 4.0) * 0.6 + vn(mp * 5.0) * 0.4;
    disc *= 1.0 - 0.32 * smoothstep(0.45, 0.75, mare);
  }
  c = mix(c, uDisc, disc);
  // layered desert silhouettes painted on the dome (far → near: hazier, lower, paler); tops at a few degrees so the
  // sky stays open. Sun-facing flanks lit, the rest in violet shade; strata stripes; haze toward the horizon colour.
  if (y > -0.06 && y < 0.16) {
    float az = atan(d.z, d.x), saz = atan(uDiscDir.z, uDiscDir.x);
    for (int i = 0; i < ${BUTTES}; i++) {
      vec4 b = uButte[i];
      float da = az - b.x;
      da = da - 6.2831853 * floor((da + 3.1415927) / 6.2831853);
      float u = abs(da) / b.y;
      if (u > 1.7) continue;
      float layer = floor(b.w), spire = fract(b.w);
      float top = b.z * (1.0 - smoothstep(0.86, 1.0, u)) + b.z * 0.32 * (1.0 - smoothstep(1.0, 1.65, u));
      top += b.z * 0.03 * sin(da * 400.0 / (b.y * 40.0 + 1.0)) * step(u, 0.85);
      if (spire > 0.05) { float su = abs(da - b.y * 1.35) / (b.y * 0.09); top = max(top, b.z * (0.8 + spire) * (1.0 - smoothstep(0.7, 1.0, su))); }
      if (y < top) {
        float fy = clamp(y / max(b.z, 1e-3), 0.0, 1.0);
        float side = smoothstep(-0.6, 0.6, sign(da) * sign(saz - b.x) * min(1.0, abs(da) / (b.y * 0.6)));
        vec3 rc = mix(uRockShade, uRockLit, side * (1.0 - 0.6 * uNight));
        rc *= 1.0 - 0.12 * step(0.5, fract(fy * 5.0 + 0.3)) * step(fy, 0.82);
        rc *= 0.82 + 0.18 * smoothstep(0.0, 0.9, fy);
        float haze = layer < 0.5 ? 0.62 : layer < 1.5 ? 0.36 : 0.12;
        haze = mix(haze, 1.0, smoothstep(0.02, -0.04, y) * 0.6);
        c = mix(rc, mix(uHor, uMid, 0.25 * smoothstep(0.0, 0.1, y)), haze);
      }
    }
  }
  if (uNight > 0.3) {
    vec2 sp = floor(d.xz / max(0.06, y + 0.06) * 150.0);
    float tw = 0.75 + 0.25 * h21(sp + 7.0);
    float st = step(0.9955, h21(sp)) * smoothstep(0.004, 0.05, y) * (uNight - 0.3) * 1.6 * tw;
    c += vec3(0.9, 0.95, 1.1) * st * (0.6 + 0.6 * h21(sp + 3.0));
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
// [azimuth (rad, 0 = +x down the street), half-width (rad), height (tan of elevation), layer + spire fraction]
function buttes() {
  let a = 77;
  const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const out = [];
  const lay = [[0, 10, 0.016, 0.012], [1, 9, 0.026, 0.018], [2, 7, 0.032, 0.022]];
  for (const [L, n, h, hv] of lay) for (let i = 0; i < n; i++) {
    let az = -Math.PI + (i + 0.2 + r() * 0.6) * (2 * Math.PI / n) + L * 0.37;
    // keep the golden sun disc (az ≈ −0.14) in a notch between buttes
    if (Math.abs(az + 0.14) < 0.07) az += 0.16;
    const w = (L === 0 ? 0.16 : L === 1 ? 0.09 : 0.06) * (0.6 + r() * 0.9);
    out.push(new THREE.Vector4(az, w, h + r() * hv, L + (r() < 0.3 ? 0.2 + r() * 0.5 : 0)));
  }
  while (out.length < BUTTES) out.push(new THREE.Vector4(0, 0.0001, -1, 0));
  return out.slice(0, BUTTES);
}
const _top = new THREE.Vector3();
function createSky() {
  const u = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Color() },
    uDisc: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uDiscDir: { value: new THREE.Vector3(1, 0.1, 0) }, uNight: { value: 0 },
    uRockLit: { value: new THREE.Color() }, uRockShade: { value: new THREE.Color() }, uTopY: { value: 0.25 }, uButte: { value: buttes() } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.layers.enableAll();
  mesh.raycast = () => {};
  mesh.onBeforeRender = (r, sc, cam) => {
    mesh.position.copy(cam.position); mesh.scale.setScalar(cam.far * 0.8); mesh.updateMatrixWorld();
    u.uTopY.value = Math.max(0, _top.set(0, 1, 0.5).unproject(cam).sub(cam.position).normalize().y);
  };
  return {
    mesh,
    apply(l) {
      u.uTop.value.set(l.sky.top); u.uMid.value.set(l.sky.mid || l.sky.horizon); u.uHor.value.set(l.sky.horizon);
      u.uGround.value.set(l.env?.ground || l.fill.ground);
      const n = l.night || 0;
      u.uNight.value = n;
      u.uRockLit.value.set(l.rock?.lit || '#c8724f'); u.uRockShade.value.set(l.rock?.shade || '#8a5468');
      u.uSun.value.set(l.sun.color).lerp(_c1.set('#fff0d0'), 0.2);
      const disc = l.disc || { az: l.sun.azimuth, el: l.sun.elevation };
      u.uDisc.value.set(n > 0.6 ? '#fff3d6' : l.sun.color).multiplyScalar(n > 0.6 ? 1.6 : 3.2);
      const az = disc.az * D2R, el = disc.el * D2R;
      u.uDiscDir.value.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    },
  };
}

function paintEnv(cv, l) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height;
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, l.sky.top);
  grd.addColorStop(0.45, l.sky.horizon);
  grd.addColorStop(0.52, l.env?.ground || l.fill.ground);
  grd.addColorStop(1, l.env?.ground || l.fill.ground);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  const sx = ((l.sun.azimuth % 360) / 360) * w, sy = (0.5 - l.sun.elevation / 180) * h;
  const sg = g.createRadialGradient(sx, sy, 0, sx, sy, w * 0.18);
  _c1.set(l.sun.color);
  sg.addColorStop(0, `rgba(${(_c1.r * 255) | 0},${(_c1.g * 255) | 0},${(_c1.b * 255) | 0},0.9)`);
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, w, h);
  void _c2;
}

export function lerpLight(a, b, t, out = {}) {
  const lc = (x, y) => '#' + _c1.set(x).lerp(_c2.set(y), t).getHexString();
  const ln = (x, y) => x + (y - x) * t;
  out.sky = { top: lc(a.sky.top, b.sky.top), mid: lc(a.sky.mid || a.sky.horizon, b.sky.mid || b.sky.horizon), horizon: lc(a.sky.horizon, b.sky.horizon) };
  out.sun = { color: lc(a.sun.color, b.sun.color), intensity: ln(a.sun.intensity, b.sun.intensity), azimuth: ln(a.sun.azimuth, b.sun.azimuth), elevation: ln(a.sun.elevation, b.sun.elevation) };
  out.fill = { sky: lc(a.fill.sky, b.fill.sky), ground: lc(a.fill.ground, b.fill.ground), intensity: ln(a.fill.intensity, b.fill.intensity) };
  out.rim = { color: lc(a.rim.color, b.rim.color), intensity: ln(a.rim.intensity, b.rim.intensity) };
  out.env = { ground: lc(a.env?.ground || a.fill.ground, b.env?.ground || b.fill.ground) };
  out.sheen = lc(a.sheen || a.sky.horizon, b.sheen || b.sky.horizon);
  out.envK = ln(a.envK ?? 0.15, b.envK ?? 0.15);
  out.night = ln(a.night || 0, b.night || 0);
  out.lamps = ln(a.lamps || 0, b.lamps || 0);
  out.bounce = lc(a.bounce || '#000000', b.bounce || '#000000');
  out.bounceK = ln(a.bounceK || 0, b.bounceK || 0);
  out.exposure = ln(a.exposure ?? 1, b.exposure ?? 1);
  out.rock = { lit: lc(a.rock?.lit || '#c8724f', b.rock?.lit || '#c8724f'), shade: lc(a.rock?.shade || '#8a5468', b.rock?.shade || '#8a5468') };
  const da = a.disc || { az: a.sun.azimuth, el: a.sun.elevation }, db = b.disc || { az: b.sun.azimuth, el: b.sun.elevation };
  out.disc = t < 0.5 ? { ...da } : { ...db };
  if (Math.abs(da.az - db.az) < 90) out.disc = { az: ln(da.az, db.az), el: ln(da.el, db.el) };
  return out;
}
