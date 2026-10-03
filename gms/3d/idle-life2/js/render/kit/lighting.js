import * as THREE from 'three';

// Sun (one shared shadow map) + coloured hemisphere fill + low rim, fog = sky horizon, gradient sky and a
// tiny procedural equirect environment for the PBR sheen. Everything comes out of one palette `light` block.
const D2R = Math.PI / 180;
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

  const skyCv = document.createElement('canvas');
  skyCv.width = 4; skyCv.height = 128;
  const skyTex = new THREE.CanvasTexture(skyCv);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  const envCv = document.createElement('canvas');
  envCv.width = 64; envCv.height = 32;
  const envTex = new THREE.CanvasTexture(envCv);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = envTex;

  let L = null, size = 60, mapSize = 2048;
  const rig = {
    sun, hemi, rim, target,
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
      paintSky(skyCv, l);
      skyTex.needsUpdate = true;
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

function paintSky(cv, l) {
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, cv.height);
  grd.addColorStop(0, l.sky.top);
  grd.addColorStop(0.62, l.sky.mid || l.sky.horizon);
  grd.addColorStop(1, l.sky.horizon);
  g.fillStyle = grd;
  g.fillRect(0, 0, cv.width, cv.height);
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
  return out;
}
