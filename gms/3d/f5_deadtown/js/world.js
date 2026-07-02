// Per-level environment: sky, fog, lights and the ground plane, all built from
// the level document's `env` + `roads` + `bounds` (nothing hardcoded — the
// editor authors these). buildEnv() returns a disposable bundle so a level
// swap tears the whole environment down cleanly. groundHeight(x,z) stays the
// single source of truth for height (flat 0 today; terrain could hook in here).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CFG, LITE } from './config.js';

export function groundHeight(_x, _z) { return 0; }

// sky/fog/light palettes per env.preset
const PRESETS = {
  dusk:     { fog: 0x6b6f63, fogNear: 36, fogFar: 118, skyTop: 0x3c4642, skyBot: 0x8a8b77, hemi: 0xb9bca8, hemiI: 1.05, sun: 0xf2e9cf, sunI: 1.35, day: 1.0 },
  overcast: { fog: 0x777b70, fogNear: 40, fogFar: 130, skyTop: 0x4a524e, skyBot: 0x979886, hemi: 0xc4c7b4, hemiI: 1.15, sun: 0xe8e2d2, sunI: 1.0,  day: 1.0 },
  night:    { fog: 0x12151d, fogNear: 22, fogFar: 74,  skyTop: 0x090d16, skyBot: 0x232838, hemi: 0x2a3346, hemiI: 0.55, sun: 0x5a6a8a, sunI: 0.28, day: 0.06 },
  // interiors carry ALL their light themselves (no town hemi bleeding in like
  // old deadtown's offset rooms) — so run the warm hemi + lamp much hotter
  interior: { fog: 0x14110c, fogNear: 14, fogFar: 60,  hemi: 0x9a8a72,  hemiI: 1.35, sun: 0xffe6c0, sunI: 0 },
};

let envMapBuilt = false;
export function buildEnv(scene, renderer, doc) {
  const env = doc.env || {};
  const P = PRESETS[env.preset] || PRESETS.dusk;
  const HX = doc.bounds?.hx || 40, HZ = doc.bounds?.hz || 40;
  const interior = env.preset === 'interior';
  const disposables = [];
  const nodes = [];
  const add = (o) => { scene.add(o); nodes.push(o); return o; };

  // environment map for the shared metalness/atlas material (build once, keep)
  if (!envMapBuilt) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    envMapBuilt = true;
  }

  scene.background = new THREE.Color(P.fog);
  scene.fog = new THREE.Fog(P.fog, P.fogNear, P.fogFar);

  // ── sky dome (outdoor only) ──
  let skyMat = null;
  if (!interior) {
    const sky = add(new THREE.Mesh(
      new THREE.SphereGeometry(320, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { top: { value: new THREE.Color(P.skyTop) }, bot: { value: new THREE.Color(P.skyBot) } },
        vertexShader: `varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying float h; uniform vec3 top; uniform vec3 bot; void main(){ gl_FragColor = vec4(mix(bot, top, clamp(h*1.1+0.12,0.0,1.0)), 1.0);} `,
      })
    ));
    sky.userData.noWire = true;
    skyMat = sky.material;
    disposables.push(sky.geometry, sky.material);
  }

  // ── lights ──
  const hemi = add(new THREE.HemisphereLight(P.hemi, interior ? 0x14110d : 0x3a382f, P.hemiI));
  const sun = new THREE.DirectionalLight(P.sun, P.sunI);
  sun.position.set(...CFG.sunDir);
  if (!LITE && !interior) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 48;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  }
  sun.visible = !interior;
  add(sun);
  const sunTarget = add(new THREE.Object3D());
  sun.target = sunTarget;
  if (interior) {
    const lamp = add(new THREE.PointLight(0xffe6c0, 2.4, Math.max(HX, HZ) * 4, 1.6));
    lamp.position.set(0, 3.4, 0);
  }

  // ── ground ──
  const tex = makeGroundTexture(env, doc.roads, HX, HZ);
  disposables.push(tex);
  const floorTint = env.floorColor ? new THREE.Color(env.floorColor) : new THREE.Color(0xffffff);
  const gmat = new THREE.MeshStandardMaterial({ map: tex, color: floorTint, roughness: 0.95, metalness: 0 });
  disposables.push(gmat);
  const geo = new THREE.PlaneGeometry(HX * 2 + (interior ? 2 : 0), HZ * 2 + (interior ? 2 : 0)).rotateX(-Math.PI / 2);
  disposables.push(geo);
  const ground = add(new THREE.Mesh(geo, gmat));
  ground.receiveShadow = true;

  // flat invisible plane for ground raycasts
  const rp = new THREE.Mesh(
    new THREE.PlaneGeometry(HX * 2.6, HZ * 2.6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  disposables.push(rp.geometry, rp.material);
  const rayPlane = add(rp);

  // ── optional day→night cycle (kept readable; never pitch black) ──
  const C = (h) => new THREE.Color(h);
  const PAL = {
    dayFog: C(P.fog), nightFog: C(0x12151d),
    daySkyTop: C(P.skyTop || 0x3c4642), nightSkyTop: C(0x090d16),
    daySkyBot: C(P.skyBot || 0x8a8b77), nightSkyBot: C(0x232838),
    daySun: C(P.sun), nightSun: C(0x5a6a8a),
    dayHemi: C(P.hemi), nightHemi: C(0x2a3346),
  };
  const _c = new THREE.Color();
  let dayT = 0; const CYCLE = 240;
  let k = P.day ?? 1;
  function setDaylight(kk) {
    if (interior) return;
    k = kk;
    sun.intensity = 0.18 + k * 1.25;
    sun.color.copy(PAL.nightSun).lerp(PAL.daySun, k);
    hemi.intensity = 0.42 + k * 0.7;
    hemi.color.copy(PAL.nightHemi).lerp(PAL.dayHemi, k);
    _c.copy(PAL.nightFog).lerp(PAL.dayFog, k);
    scene.fog.color.copy(_c); scene.background.copy(_c);
    scene.fog.near = 24 + k * 14; scene.fog.far = 78 + k * 48;
    if (skyMat) {
      skyMat.uniforms.top.value.copy(PAL.nightSkyTop).lerp(PAL.daySkyTop, k);
      skyMat.uniforms.bot.value.copy(PAL.nightSkyBot).lerp(PAL.daySkyBot, k);
    }
  }
  if (!interior) setDaylight(P.day ?? 1);

  return {
    interior,
    ground: rayPlane, groundVisual: ground,
    groundHeight,
    sun, sunTarget,
    daylight: () => k,
    setDaylight,
    tickSky(dt) {
      if (!env.dayCycle || interior) return;
      dayT += dt; setDaylight(0.5 + 0.5 * Math.cos((dayT / CYCLE) * Math.PI * 2));
    },
    dispose() {
      for (const n of nodes) scene.remove(n);
      for (const d of disposables) d.dispose?.();
      scene.fog = null;
    },
  };
}

// One texture for the whole floor, drawn at level scale so roads/markings line
// up with the roads table (which colliders, the editor and the minimap share).
function makeGroundTexture(env, roads, HX, HZ) {
  const kind = env.floor || (env.preset === 'interior' ? 'wood' : 'grass');
  const PX = 2048;
  const c = document.createElement('canvas');
  // non-square bounds keep world-square texels by scaling the canvas axes
  c.width = PX; c.height = Math.max(256, Math.round(PX * (HZ / HX)));
  const g = c.getContext('2d');
  const sx = (x) => (x + HX) / (HX * 2) * c.width;
  const sz = (z) => (z + HZ) / (HZ * 2) * c.height;
  const sdx = (d) => d / (HX * 2) * c.width;
  const sdz = (d) => d / (HZ * 2) * c.height;

  const mottle = (base, n, dark) => {
    g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * c.width, y = Math.random() * c.height, r = 6 + Math.random() * 60;
      g.fillStyle = `rgba(${dark[0] + Math.random() * 40 | 0},${dark[1] + Math.random() * 40 | 0},${dark[2] + Math.random() * 36 | 0},0.05)`;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  };

  if (kind === 'street') {
    mottle('#4f5249', 2600, [30, 30, 26]);
    const R = roads || { vert: [], horiz: [], half: 4.6, sidewalk: 1.8 };
    const drawRoad = (cxz, horiz) => {
      const w = horiz ? sdz(R.half * 2) : sdx(R.half * 2);
      const sw = horiz ? sdz((R.half + R.sidewalk) * 2) : sdx((R.half + R.sidewalk) * 2);
      g.fillStyle = '#6a6c60';
      if (horiz) g.fillRect(0, sz(cxz) - sw / 2, c.width, sw); else g.fillRect(sx(cxz) - sw / 2, 0, sw, c.height);
      g.fillStyle = '#34352f';
      if (horiz) g.fillRect(0, sz(cxz) - w / 2, c.width, w); else g.fillRect(sx(cxz) - w / 2, 0, w, c.height);
    };
    for (const x of (R.vert || [])) drawRoad(x, false);
    for (const z of (R.horiz || [])) drawRoad(z, true);
    // faded dashes
    g.fillStyle = 'rgba(210,200,120,0.5)';
    const dash = sdz(2.2), gap = sdz(2.4), tw = sdx(0.32);
    for (const x of (R.vert || [])) for (let p = 0; p < c.height; p += dash + gap) g.fillRect(sx(x) - tw / 2, p, tw, dash);
    for (const z of (R.horiz || [])) for (let p = 0; p < c.width; p += dash + gap) g.fillRect(p, sz(z) - tw / 2, dash, tw);
    grimeAndStains(g, c);
  } else if (kind === 'grass') {
    mottle('#4a5c38', 2200, [24, 40, 18]);
    grimeAndStains(g, c, 0.5);
  } else if (kind === 'dirt') {
    mottle('#5c4c34', 2200, [40, 30, 18]);
    grimeAndStains(g, c, 0.5);
  } else if (kind === 'wood') {
    g.fillStyle = '#5a4029'; g.fillRect(0, 0, c.width, c.height);
    const row = Math.max(10, sdz(1.2));
    for (let y = 0; y < c.height; y += row) {
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, y, c.width, 2);
      for (let i = 0; i < 24; i++) { g.strokeStyle = 'rgba(35,22,10,0.28)'; g.beginPath(); const x = Math.random() * c.width; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 20, y + row); g.stroke(); }
    }
  } else {   // tile / concrete
    g.fillStyle = '#4d4d46'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
    const step = Math.max(24, sdx(2));
    for (let p = 0; p <= c.width; p += step) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, c.height); g.stroke(); }
    for (let p = 0; p <= c.height; p += step) { g.beginPath(); g.moveTo(0, p); g.lineTo(c.width, p); g.stroke(); }
    for (let i = 0; i < 800; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * c.width, Math.random() * c.height, 3, 3); }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function grimeAndStains(g, c, mult = 1) {
  for (let i = 0; i < 900 * mult; i++) {
    g.strokeStyle = `rgba(20,18,14,${0.04 + Math.random() * 0.08})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const x = Math.random() * c.width, y = Math.random() * c.height;
    g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60); g.stroke();
  }
  for (let i = 0; i < 60 * mult; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height, r = 8 + Math.random() * 26;
    g.fillStyle = `rgba(${60 + Math.random() * 30 | 0},${10 + Math.random() * 12 | 0},8,0.10)`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
}
