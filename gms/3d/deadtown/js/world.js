// The town: a flat asphalt ground with a drawn street grid, an overcast
// apocalyptic sky, dim sun + shadows, and an environment map for the shared
// material. groundHeight(x,z) is THE single source of truth for height — the
// town is flat (0) but every prop/zombie/player still queries it, so a future
// session can add gentle terrain here without touching anything else.
//
// ROADS is the authoritative street layout: the ground texture, prop placement
// (townobj.js) and the minimap (minimap.js) all read it so they agree.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CFG, LITE } from './config.js';

// Street grid: centre-lines + half-width. Drawn as tarmac with markings; props
// avoid them; the minimap shades them.
export const ROADS = {
  vert: [-30, 0, 30],    // roads running N–S at these x
  horiz: [-24, 0, 24],   // roads running E–W at these z
  half: 4.6,             // half road width
  sidewalk: 1.8,         // sidewalk band outside the tarmac
};

export function groundHeight(_x, _z) { return 0; }

// is (x,z) on tarmac (used to keep wrecks/zombies sensible + sidewalk logic)
export function onRoad(x, z) {
  for (const rx of ROADS.vert) if (Math.abs(x - rx) <= ROADS.half) return true;
  for (const rz of ROADS.horiz) if (Math.abs(z - rz) <= ROADS.half) return true;
  return false;
}

export function buildWorld(scene, renderer) {
  const H = CFG.townHalf;

  // ── environment map (makes the metalness/atlas material read right) ──
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // ── overcast dusk sky + thick fog ──
  scene.background = new THREE.Color(0x6b6f63);
  scene.fog = new THREE.Fog(0x6b6f63, 36, 118);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x3c4642) }, bot: { value: new THREE.Color(0x8a8b77) } },
      vertexShader: `varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying float h; uniform vec3 top; uniform vec3 bot; void main(){ gl_FragColor = vec4(mix(bot, top, clamp(h*1.1+0.12,0.0,1.0)), 1.0);} `,
    })
  );
  sky.userData.noWire = true;
  scene.add(sky);
  const skyMat = sky.material;

  // ── lighting: flat overcast + a low hazy sun ──
  const hemi = new THREE.HemisphereLight(0xb9bca8, 0x3a382f, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xf2e9cf, 1.35);
  sun.position.set(...CFG.sunDir);
  if (!LITE) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 48;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  }
  scene.add(sun);
  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget); sun.target = sunTarget;

  // ── ground: one big plane with a drawn top-down street texture ──
  const tex = makeStreetTexture(H);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(H * 2, H * 2).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 })
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // flat invisible plane for any ground raycasts (cheap, never misses)
  const rayPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(H * 2.4, H * 2.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  scene.add(rayPlane);

  // ── day → night cycle (kept readable; never pitch black) ──
  const townFog = scene.fog;                       // mutated in place; main keeps this as the town fog
  const C = (h) => new THREE.Color(h);
  const PAL = {
    dayFog: C(0x6b6f63), nightFog: C(0x12151d),
    daySkyTop: C(0x3c4642), nightSkyTop: C(0x090d16),
    daySkyBot: C(0x8a8b77), nightSkyBot: C(0x232838),
    daySun: C(0xf2e9cf), nightSun: C(0x5a6a8a),
    dayHemiSky: C(0xb9bca8), nightHemiSky: C(0x2a3346),
  };
  const _c = new THREE.Color();
  let dayT = 0; const CYCLE = 240;                 // seconds for a full day→night→day
  let k = 1;                                       // 1 = midday, 0 = midnight
  function setDaylight(kk) {
    k = kk;
    sun.intensity = 0.18 + k * 1.25;
    sun.color.copy(PAL.nightSun).lerp(PAL.daySun, k);
    hemi.intensity = 0.42 + k * 0.7;
    hemi.color.copy(PAL.nightHemiSky).lerp(PAL.dayHemiSky, k);
    _c.copy(PAL.nightFog).lerp(PAL.dayFog, k);
    townFog.color.copy(_c); scene.background.copy(_c);
    townFog.near = 24 + k * 14; townFog.far = 78 + k * 48;   // night closes in
    skyMat.uniforms.top.value.copy(PAL.nightSkyTop).lerp(PAL.daySkyTop, k);
    skyMat.uniforms.bot.value.copy(PAL.nightSkyBot).lerp(PAL.daySkyBot, k);
  }
  setDaylight(1);

  return {
    ground: rayPlane, groundVisual: ground,
    groundHeight, onRoad,
    sun, sunTarget, sky, townFog,
    daylight: () => k,
    setDaylight,
    // called by main ONLY in town (interiors swap scene.fog, so don't clobber)
    tickSky(dt) { dayT += dt; setDaylight(0.5 + 0.5 * Math.cos((dayT / CYCLE) * Math.PI * 2)); },
    tick() {},
  };
}

// Draw the whole town floor once: dark tarmac roads on a grimy concrete base,
// faded lane markings, kerbs and scattered stains. Drawn at town scale so it
// lines up with ROADS / building placement.
function makeStreetTexture(H) {
  const PX = 2048;
  const span = H * 2;
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d');
  // world (x,z in [-H,H]) -> pixel
  const sx = (x) => (x + H) / span * PX;
  const sz = (z) => (z + H) / span * PX;
  const sd = (d) => d / span * PX;

  // concrete base with mottling
  g.fillStyle = '#4f5249'; g.fillRect(0, 0, PX, PX);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * PX, y = Math.random() * PX, r = 6 + Math.random() * 60;
    g.fillStyle = `rgba(${30 + Math.random() * 40 | 0},${30 + Math.random() * 40 | 0},${26 + Math.random() * 36 | 0},0.05)`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }

  // sidewalks (lighter band) then tarmac on top
  const drawRoad = (cx, cz, horiz) => {
    const w = sd(ROADS.half * 2), sw = sd((ROADS.half + ROADS.sidewalk) * 2);
    g.fillStyle = '#6a6c60';
    if (horiz) g.fillRect(0, sz(cz) - sw / 2, PX, sw); else g.fillRect(sx(cx) - sw / 2, 0, sw, PX);
    g.fillStyle = '#34352f';
    if (horiz) g.fillRect(0, sz(cz) - w / 2, PX, w); else g.fillRect(sx(cx) - w / 2, 0, w, PX);
  };
  for (const x of ROADS.vert) drawRoad(x, 0, false);
  for (const z of ROADS.horiz) drawRoad(0, z, true);

  // faded centre lane markings (dashes)
  g.fillStyle = 'rgba(210,200,120,0.5)';
  const dash = sd(2.2), gap = sd(2.4), tw = sd(0.32);
  for (const x of ROADS.vert) for (let p = 0; p < PX; p += dash + gap) g.fillRect(sx(x) - tw / 2, p, tw, dash);
  for (const z of ROADS.horiz) for (let p = 0; p < PX; p += dash + gap) g.fillRect(p, sz(z) - tw / 2, dash, tw);

  // grime streaks + cracks
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = `rgba(20,18,14,${0.04 + Math.random() * 0.08})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const x = Math.random() * PX, y = Math.random() * PX;
    g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60); g.stroke();
  }
  // a few rusty/blood stains
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * PX, y = Math.random() * PX, r = 8 + Math.random() * 26;
    g.fillStyle = `rgba(${60 + Math.random() * 30 | 0},${10 + Math.random() * 12 | 0},8,0.10)`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
