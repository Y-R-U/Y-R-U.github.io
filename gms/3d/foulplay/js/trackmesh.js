// Turning a Track into something you can look at: road ribbon, kerbs, rails,
// verges, pillars under the elevated bits, and the stands full of the people
// who are the reason you can get away with any of this.
//
// Everything is merged or instanced. A 3km circuit is a handful of draw calls.

import * as THREE from 'three';
import { quality, activeEnv } from './render.js';
import { RAIL_HEIGHT } from './config.js';
import { mulberry32, clamp, lerp, wrap } from './utils.js';

const COL_U = [-1, -0.93, -0.88, -0.32, 0.32, 0.88, 0.93, 1];
const KERB_RED = new THREE.Color(0xd6392f);
const KERB_WHITE = new THREE.Color(0xe8e8e8);
const KERB_GREY = new THREE.Color(0x3b4048);
const LINE = new THREE.Color(0xdfe4e8);

export function buildTrackMesh(track, opts = {}) {
  const env = activeEnv;
  const group = new THREE.Group();
  group.name = 'trackMesh';
  const rng = mulberry32(1000 + track.length | 0);

  group.add(buildRoad(track, env));
  group.add(buildVerge(track, env));
  const rails = buildRails(track, env);
  if (rails) group.add(rails);
  const posts = buildPosts(track, env);
  if (posts) group.add(posts);
  const pillars = buildPillars(track, env);
  if (pillars) group.add(pillars);
  group.add(buildStartLine(track, env));

  const scenery = buildScenery(track, env, rng);
  if (scenery) group.add(scenery);

  const pads = buildPads(track);
  if (pads) group.add(pads);

  const cams = buildCameras(track);
  group.add(cams);
  group.userData.cams = cams;

  const ground = buildGround(track, env);
  group.add(ground);

  group.traverse((o) => { if (o.material) o.material.__owned = true; });
  return group;
}

// ---------------------------------------------------------------------------
// Road surface
// ---------------------------------------------------------------------------
function buildRoad(track, env) {
  const n = track.count;
  const cols = COL_U.length;
  const rows = n + 1;                       // repeat the first row to close
  const pos = new Float32Array(rows * cols * 3);
  const col = new Float32Array(rows * cols * 3);
  const nor = new Float32Array(rows * cols * 3);
  const idx = [];

  const asphaltBase = new THREE.Color(env.neon ? 0x3a3a4c : 0x4e555f);
  const tmp = new THREE.Color();

  for (let r = 0; r < rows; r++) {
    const i = r % n;
    const p = track.pos[i], rt = track.right[i], up = track.up[i];
    const w = track.width[i];
    const curv = Math.abs(track.curv[i]);
    const kerbOn = curv > 0.0055 || track.kind[i] === 'loop';
    const stripe = Math.floor(i / 3) % 2 === 0;

    for (let c = 0; c < cols; c++) {
      const u = COL_U[c];
      const o = (r * cols + c) * 3;
      // Kerbs sit a few centimetres proud; the rest is flat.
      const lift = Math.abs(u) > 0.9 && kerbOn ? 0.09 : 0;
      pos[o] = p.x + rt.x * u * w + up.x * lift;
      pos[o + 1] = p.y + rt.y * u * w + up.y * lift;
      pos[o + 2] = p.z + rt.z * u * w + up.z * lift;
      nor[o] = up.x; nor[o + 1] = up.y; nor[o + 2] = up.z;

      let cc;
      if (Math.abs(u) > 0.9) {
        cc = kerbOn ? (stripe ? KERB_RED : KERB_WHITE) : KERB_GREY;
      } else if (Math.abs(u) > 0.86) {
        cc = LINE;
      } else {
        // A little grain so a long straight is not a flat colour.
        const g = 1 + ((i * 7 + c * 13) % 11) * 0.006;
        cc = tmp.copy(asphaltBase).multiplyScalar(g);
      }
      col[o] = cc.r; col[o + 1] = cc.g; col[o + 2] = cc.b;
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide,
  }));
  mesh.receiveShadow = quality.shadows;
  mesh.name = 'road';
  return mesh;
}

// A wide apron either side so an elevated road does not float in space, and
// so leaving the track lands you on something.
function buildVerge(track, env) {
  const n = track.count;
  const step = 2;
  const rows = Math.floor(n / step) + 1;
  const cols = 4;
  const pos = new Float32Array(rows * cols * 3);
  const col = new Float32Array(rows * cols * 3);
  const idx = [];
  const inner = new THREE.Color(env.ground).multiplyScalar(1.06);
  const outer = new THREE.Color(env.ground).multiplyScalar(0.72);

  for (let r = 0; r < rows; r++) {
    const i = (r * step) % n;
    const p = track.pos[i], rt = track.right[i], up = track.up[i];
    const w = track.width[i];
    const skip = track.kind[i] === 'loop' || track.up[i].y < 0.55;
    const us = [-w - 34, -w - 0.2, w + 0.2, w + 34];
    for (let c = 0; c < cols; c++) {
      const o = (r * cols + c) * 3;
      const drop = c === 0 || c === 3 ? -2.2 : -0.35;
      const scale = skip ? 0.02 : 1;
      pos[o] = p.x + rt.x * us[c] * scale + up.x * drop;
      pos[o + 1] = p.y + rt.y * us[c] * scale + up.y * drop;
      pos[o + 2] = p.z + rt.z * us[c] * scale + up.z * drop;
      const cc = c === 0 || c === 3 ? outer : inner;
      col[o] = cc.r; col[o + 1] = cc.g; col[o + 2] = cc.b;
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.receiveShadow = quality.shadows;
  mesh.name = 'verge';
  return mesh;
}

// ---------------------------------------------------------------------------
// Barriers
// ---------------------------------------------------------------------------
function buildRails(track, env) {
  const n = track.count;
  const pos = [], col = [], idx = [];
  const metal = new THREE.Color(env.neon ? 0x8a7fd0 : 0xa8b2bd);
  const metal2 = new THREE.Color(env.neon ? 0xff5fc0 : 0xd7dee6);
  const concrete = new THREE.Color(0xb9b3a8);
  const concrete2 = new THREE.Color(0x8f8a80);
  let v = 0;

  for (const side of [-1, 1]) {
    let run = null;
    const flush = () => {
      if (!run || run.length < 2) { run = null; return; }
      const base = v;
      for (const s of run) {
        pos.push(s.lo.x, s.lo.y, s.lo.z, s.hi.x, s.hi.y, s.hi.z);
        col.push(s.c1.r, s.c1.g, s.c1.b, s.c2.r, s.c2.g, s.c2.b);
        v += 2;
      }
      for (let k = 0; k < run.length - 1; k++) {
        const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
      run = null;
    };

    for (let i = 0; i <= n; i++) {
      const j = i % n;
      const type = side < 0 ? track.railL[j] : track.railR[j];
      if (type === 'open') { flush(); continue; }
      const p = track.pos[j], rt = track.right[j], up = track.up[j];
      const w = track.width[j] + 0.35;
      const h = type === 'wall' ? RAIL_HEIGHT * 1.35 : RAIL_HEIGHT;
      const wall = type === 'wall';
      const stripe = Math.floor(j / 5) % 2 === 0;
      const lo = new THREE.Vector3(
        p.x + rt.x * side * w, p.y + rt.y * side * w, p.z + rt.z * side * w
      );
      const hi = lo.clone().addScaledVector(up, h);
      lo.addScaledVector(up, -0.35);
      if (!run) run = [];
      run.push({
        lo, hi,
        c1: wall ? (stripe ? concrete : concrete2) : metal,
        c2: wall ? concrete : (stripe ? metal2 : metal),
      });
    }
    flush();
  }

  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  fadeNearCamera(mat);
  mat.__owned = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'rails';
  mesh.castShadow = false;
  mesh.renderOrder = 1;
  return mesh;
}

// Barriers go see-through when the lens is jammed against them. Get pinned
// against the steel and the camera ends up *outside* the circuit looking in —
// without this you spend the most spectacular two seconds of the race staring
// at a fence. Anything more than sixteen metres away stays completely solid,
// so the track never looks like it is made of glass.
export function fadeNearCamera(mat, near = 5, far = 17, floor = 0.12) {
  mat.transparent = true;
  mat.depthWrite = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.fadeNear = { value: near };
    shader.uniforms.fadeFar = { value: far };
    shader.uniforms.fadeFloor = { value: floor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLensDist;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLensDist = -mvPosition.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying float vLensDist;\nuniform float fadeNear;\nuniform float fadeFar;\nuniform float fadeFloor;')
      .replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.a *= mix(fadeFloor, 1.0, smoothstep(fadeNear, fadeFar, vLensDist));');
  };
  mat.needsUpdate = true;
  return mat;
}

function buildPosts(track, env) {
  const n = track.count;
  const spots = [];
  const every = Math.max(3, Math.round(9 / track.spacing));
  for (let i = 0; i < n; i += every) {
    for (const side of [-1, 1]) {
      const type = side < 0 ? track.railL[i] : track.railR[i];
      if (type !== 'rail') continue;
      spots.push({ i, side });
    }
  }
  if (!spots.length) return null;
  const geo = new THREE.BoxGeometry(0.26, RAIL_HEIGHT + 0.5, 0.26);
  const postMat = new THREE.MeshLambertMaterial({ color: env.neon ? 0x4a3a70 : 0x6b737d });
  fadeNearCamera(postMat);
  postMat.__owned = true;
  const mesh = new THREE.InstancedMesh(geo, postMat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3();
  spots.forEach((sp, k) => {
    const p = track.pos[sp.i], rt = track.right[sp.i];
    up.copy(track.up[sp.i]);
    const w = track.width[sp.i] + 0.5;
    const at = new THREE.Vector3(
      p.x + rt.x * sp.side * w, p.y + rt.y * sp.side * w, p.z + rt.z * sp.side * w
    ).addScaledVector(up, (RAIL_HEIGHT + 0.5) * 0.5 - 0.35);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    m.compose(at, q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(k, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'posts';
  return mesh;
}

// ---------------------------------------------------------------------------
// Structure under elevated road
// ---------------------------------------------------------------------------
function buildPillars(track, env) {
  const n = track.count;
  const spots = [];
  const every = Math.max(6, Math.round(26 / track.spacing));
  for (let i = 0; i < n; i += every) {
    const p = track.pos[i];
    if (p.y < 5 || track.up[i].y < 0.6 || track.kind[i] === 'loop') continue;
    spots.push({ i, h: p.y });
  }
  if (!spots.length) return null;
  const geo = new THREE.BoxGeometry(2.4, 1, 2.4);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x767065 }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((sp, k) => {
    const p = track.pos[sp.i];
    m.makeTranslation(p.x, p.y * 0.5 - 0.5, p.z);
    m.scale(new THREE.Vector3(1, Math.max(1, p.y), 1));
    mesh.setMatrixAt(k, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = quality.shadows;
  mesh.name = 'pillars';
  return mesh;
}

// ---------------------------------------------------------------------------
// Start / finish
// ---------------------------------------------------------------------------
function buildStartLine(track, env) {
  const g = new THREE.Group();
  const f = track.frameAt(0);
  const w = f.width;

  // chequered strip
  const squares = 16;
  const stripW = (w * 2) / squares;
  const light = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14171c });
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < squares; c++) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(stripW, 1.5), (r + c) % 2 ? light : dark);
      const t = -w + stripW * (c + 0.5);
      const p = track.worldAt(r * 1.5, t, 0.03);
      q.position.copy(p);
      q.quaternion.copy(track.quatAt(r * 1.5, 0));
      q.rotateX(-Math.PI / 2);
      g.add(q);
    }
  }

  // gantry
  const postGeo = new THREE.BoxGeometry(1.1, 9, 1.1);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.copy(track.worldAt(0, side * (w + 2.2), 4.5));
    post.quaternion.copy(track.quatAt(0, 0));
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 5, 2.2, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x1b2027 }));
  beam.position.copy(track.worldAt(0, 0, 9.6));
  beam.quaternion.copy(track.quatAt(0, 0));
  g.add(beam);

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.4, 1.5),
    new THREE.MeshBasicMaterial({ map: bannerTexture('FOUL PLAY', 0xffb020, 0x101318), transparent: true }));
  sign.position.copy(track.worldAt(-1.2, 0, 9.6));
  sign.quaternion.copy(track.quatAt(0, 0));
  g.add(sign);

  // start lights
  const lightBar = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x2a0d0d }));
    bulb.position.set((i - 2) * 1.35, 0, 0);
    bulb.name = 'startbulb' + i;
    lightBar.add(bulb);
  }
  lightBar.position.copy(track.worldAt(0.4, 0, 8.1));
  lightBar.quaternion.copy(track.quatAt(0, 0));
  lightBar.name = 'startlights';
  g.add(lightBar);
  g.userData.lights = lightBar;

  g.name = 'startline';
  return g;
}

export function setStartLights(group, n) {
  const bar = group.getObjectByName('startlights');
  if (!bar) return;
  bar.children.forEach((b, i) => {
    const on = i < n;
    b.material = new THREE.MeshBasicMaterial({ color: on ? 0xff2222 : 0x2a0d0d });
    b.material.__owned = true;
  });
}

export function setStartLightsGreen(group) {
  const bar = group.getObjectByName('startlights');
  if (!bar) return;
  bar.children.forEach((b) => {
    b.material = new THREE.MeshBasicMaterial({ color: 0x2bff6a });
    b.material.__owned = true;
  });
}

// ---------------------------------------------------------------------------
// Boost pads
// ---------------------------------------------------------------------------
function buildPads(track) {
  if (!track.pads.length) return null;
  const g = new THREE.Group();
  g.name = 'pads';
  for (const pad of track.pads) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pad.w * 2, pad.len),
      new THREE.MeshBasicMaterial({ map: padTexture(), transparent: true, depthWrite: false })
    );
    mesh.position.copy(track.worldAt(pad.s, pad.t, 0.06));
    mesh.quaternion.copy(track.quatAt(pad.s, 0));
    mesh.rotateX(-Math.PI / 2);
    mesh.renderOrder = 2;
    g.add(mesh);
    pad.mesh = mesh;
  }
  return g;
}

let _padTex = null;
function padTexture() {
  if (_padTex) return _padTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(60,220,255,0.22)';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(120,245,255,0.9)';
  for (let i = 0; i < 3; i++) {
    const y = 96 - i * 34;
    g.beginPath();
    g.moveTo(8, y);
    g.lineTo(32, y - 22);
    g.lineTo(56, y);
    g.lineTo(56, y + 9);
    g.lineTo(32, y - 13);
    g.lineTo(8, y + 9);
    g.closePath();
    g.fill();
  }
  _padTex = new THREE.CanvasTexture(c);
  _padTex.colorSpace = THREE.SRGBColorSpace;
  return _padTex;
}

// ---------------------------------------------------------------------------
// Broadcast cameras — the things you are trying not to be seen by
// ---------------------------------------------------------------------------
function buildCameras(track) {
  const g = new THREE.Group();
  g.name = 'cams';
  for (const cam of track.cams) {
    const rig = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, cam.height, 6),
      new THREE.MeshLambertMaterial({ color: 0x3a4149 }));
    pole.position.y = cam.height * 0.5;
    rig.add(pole);

    const head = new THREE.Group();
    head.position.y = cam.height;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.15),
      new THREE.MeshLambertMaterial({ color: 0x1c2026 }));
    head.add(box);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x0c0e12 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.75;
    head.add(lens);
    const tally = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    tally.position.set(0, 0.42, -0.3);
    tally.name = 'tally';
    head.add(tally);
    head.name = 'head';
    rig.add(head);

    rig.position.copy(track.worldAt(cam.s, cam.t, 0));
    g.add(rig);
    cam.rig = rig;
    cam.head = head;
    cam.tally = tally;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Ground plane and scenery
// ---------------------------------------------------------------------------
function buildGround(track, env) {
  const size = Math.max(1600, track.radius * 4);
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: env.ground }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(track.center.x, Math.min(0, track.bounds.min.y) - 3.2, track.center.z);
  mesh.receiveShadow = quality.shadows;
  mesh.name = 'ground';
  return mesh;
}

function buildScenery(track, env, rng) {
  const g = new THREE.Group();
  g.name = 'scenery';
  const n = track.count;
  const density = quality.scenery;

  // --- grandstands on the outside of long corners and main straights
  const standSpots = [];
  const every = Math.max(10, Math.round(120 / track.spacing));
  for (let i = 0; i < n; i += every) {
    if (track.up[i].y < 0.7) continue;
    if (track.pos[i].y > 24) continue;
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() > 0.55 * density + 0.2) continue;
    standSpots.push({ i, side });
  }
  // Always put stands along the pit straight.
  standSpots.push({ i: Math.round(30 / track.spacing), side: 1 });
  standSpots.push({ i: Math.round(30 / track.spacing), side: -1 });

  const crowdMatrices = [];
  for (const sp of standSpots) {
    const stand = buildStand(track, sp.i, sp.side, rng, crowdMatrices, env);
    if (stand) g.add(stand);
  }

  if (crowdMatrices.length) {
    const geo = new THREE.BoxGeometry(0.5, 0.7, 0.4);
    const crowd = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: false }), crowdMatrices.length);
    crowd.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(crowdMatrices.length * 3), 3);
    const c = new THREE.Color();
    crowdMatrices.forEach((m, k) => {
      crowd.setMatrixAt(k, m);
      c.setHSL(rng(), 0.55, 0.45 + rng() * 0.25);
      crowd.instanceColor.setXYZ(k, c.r, c.g, c.b);
    });
    crowd.instanceMatrix.needsUpdate = true;
    crowd.instanceColor.needsUpdate = true;
    crowd.name = 'crowd';
    crowd.userData.base = crowdMatrices;
    g.add(crowd);
  }

  // --- floodlights for the dark environments
  if (env.stars > 0.4 || env.neon) {
    const spots = [];
    const step = Math.max(24, Math.round(190 / track.spacing));
    for (let i = 0; i < n; i += step) {
      if (track.up[i].y < 0.7) continue;
      spots.push({ i, side: (i / step) % 2 === 0 ? 1 : -1 });
    }
    for (const sp of spots) g.add(buildFloodlight(track, sp.i, sp.side));
  }

  // --- roadside props: trees, rocks, containers, blocks — one instanced mesh
  const props = buildProps(track, env, rng, density);
  if (props) g.add(props);

  // --- sponsor arches over the road
  const archStep = Math.max(30, Math.round(400 / track.spacing));
  for (let i = archStep; i < n; i += archStep) {
    if (track.up[i].y < 0.75 || track.kind[i] === 'loop') continue;
    g.add(buildArch(track, i, rng));
  }

  return g;
}

function buildStand(track, i, side, rng, crowdOut, env) {
  const p = track.pos[i], rt = track.right[i], up = track.up[i];
  if (up.y < 0.7) return null;
  const w = track.width[i];
  const g = new THREE.Group();
  const tiers = 5;
  const len = 46 + rng() * 30;
  const base = new THREE.Vector3().copy(p).addScaledVector(rt, side * (w + 9));
  base.y = Math.max(0, p.y - 1.2);

  // Local axes: rows run along the track, tiers climb away from it (local -Z
  // faces the racing, which is where the seats look).
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = rt.clone().setY(0).normalize().multiplyScalar(-side);
  const X = new THREE.Vector3().copy(Y).cross(Z).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));

  const mat = new THREE.MeshLambertMaterial({ color: env.neon ? 0x2a1f42 : 0x50565f });
  for (let t = 0; t < tiers; t++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 3.2), mat);
    step.position.set(0, 0.8 + t * 1.5, -t * 2.6);
    g.add(step);
    const seats = Math.floor(len / 1.5);
    for (let k = 0; k < seats; k++) {
      if (rng() > 0.8) continue;
      const local = new THREE.Vector3(-len / 2 + 0.75 + k * 1.5, 1.95 + t * 1.5, -t * 2.6 + 0.5);
      local.applyQuaternion(q).add(base);
      crowdOut.push(new THREE.Matrix4().compose(local, q, new THREE.Vector3(1, 1, 1)));
    }
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(len, 9, 1),
    new THREE.MeshLambertMaterial({ color: env.neon ? 0x140d24 : 0x33383f }));
  back.position.set(0, 4.5, -tiers * 2.6 - 1);
  g.add(back);

  g.position.copy(base);
  g.quaternion.copy(q);
  return g;
}

function buildFloodlight(track, i, side) {
  const p = track.pos[i], rt = track.right[i];
  const w = track.width[i];
  const g = new THREE.Group();
  const h = 22;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, h, 6),
    new THREE.MeshLambertMaterial({ color: 0x3c434b }));
  pole.position.y = h / 2;
  g.add(pole);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.8),
    new THREE.MeshLambertMaterial({ color: 0x22272d }));
  rack.position.y = h;
  g.add(rack);
  for (let k = 0; k < 4; k++) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xfff3cf }));
    lamp.position.set(-2.2 + k * 1.5, h, 0.5);
    g.add(lamp);
  }
  g.position.copy(p).addScaledVector(rt, side * (w + 16));
  return g;
}

function buildProps(track, env, rng, density) {
  const kinds = env.haze || env.ground === 0x9a7c4c
    ? ['rock', 'cactus', 'rock']
    : env.neon || env.stars > 0.5
      ? ['block', 'container', 'block']
      : ['tree', 'tree', 'rock', 'container'];

  const items = [];
  const n = track.count;
  const step = Math.max(3, Math.round(11 / track.spacing));
  for (let i = 0; i < n; i += step) {
    if (track.up[i].y < 0.6) continue;
    for (const side of [-1, 1]) {
      if (rng() > 0.5 * density) continue;
      const w = track.width[i];
      const off = side * (w + 16 + rng() * 46);
      const p = new THREE.Vector3().copy(track.pos[i]).addScaledVector(track.right[i], off);
      p.y = Math.max(0, track.pos[i].y - 2.6 - rng() * 2);
      if (track.pos[i].y > 8) p.y = 0;
      items.push({ p, kind: kinds[(rng() * kinds.length) | 0], scale: 0.7 + rng() * 1.1, rot: rng() * 7 });
    }
  }
  if (!items.length) return null;

  const g = new THREE.Group();
  const byKind = {};
  for (const it of items) (byKind[it.kind] = byKind[it.kind] || []).push(it);

  const defs = {
    tree: { geo: () => new THREE.ConeGeometry(2.6, 8, 6), color: 0x2f5c33, y: 4 },
    rock: { geo: () => new THREE.DodecahedronGeometry(2.2, 0), color: 0x6b6a63, y: 1.4 },
    cactus: { geo: () => new THREE.CylinderGeometry(0.7, 0.9, 5.4, 6), color: 0x4a7a45, y: 2.7 },
    block: { geo: () => new THREE.BoxGeometry(9, 16, 9), color: env.neon ? 0x241a3c : 0x40464e, y: 8 },
    container: { geo: () => new THREE.BoxGeometry(6, 2.6, 2.6), color: 0xb2503c, y: 1.3 },
  };

  for (const kind of Object.keys(byKind)) {
    const d = defs[kind];
    const list = byKind[kind];
    const mesh = new THREE.InstancedMesh(d.geo(), new THREE.MeshLambertMaterial({ color: d.color }), list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    list.forEach((it, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      sc.set(it.scale, it.scale * (kind === 'block' ? 0.6 + Math.random() * 1.4 : 1), it.scale);
      m.compose(new THREE.Vector3(it.p.x, it.p.y + d.y * sc.y, it.p.z), q, sc);
      mesh.setMatrixAt(k, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    g.add(mesh);
  }
  g.name = 'props';
  return g;
}

const SPONSORS = ['NITROX', 'BAD HABIT', 'CUTSHAW OIL', 'RUSTLINE', 'PAYDAY', 'HALLOWAY', 'GRUDGE FUEL', 'MOTH & SONS'];

function buildArch(track, i, rng) {
  const g = new THREE.Group();
  const s = i * track.spacing;
  const w = track.width[i];
  const mat = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), mat);
    leg.position.copy(track.worldAt(s, side * (w + 1.6), 4));
    leg.quaternion.copy(track.quatAt(s, 0));
    g.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 4, 2.4, 0.9),
    new THREE.MeshBasicMaterial({
      map: bannerTexture(SPONSORS[(rng() * SPONSORS.length) | 0], 0xffffff, 0x171b21),
    }));
  beam.position.copy(track.worldAt(s, 0, 8.2));
  beam.quaternion.copy(track.quatAt(s, 0));
  g.add(beam);
  return g;
}

const bannerCache = new Map();
export function bannerTexture(text, fg, bg) {
  const key = text + fg + bg;
  if (bannerCache.has(key)) return bannerCache.get(key);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#' + (bg >>> 0).toString(16).padStart(6, '0');
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#' + (fg >>> 0).toString(16).padStart(6, '0');
  g.font = 'bold 60px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  bannerCache.set(key, t);
  return t;
}

// Crowd reaction — the stands ripple when the hype is high.
export function updateCrowd(group, time, hype) {
  const crowd = group && group.getObjectByName('crowd');
  if (!crowd || !crowd.userData.base) return;
  const amp = 0.12 + (hype / 100) * 0.85;
  const base = crowd.userData.base;
  const stride = Math.max(1, Math.floor(base.length / 260));
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let k = 0; k < base.length; k += stride) {
    base[k].decompose(p, q, s);
    const j = Math.sin(time * 7 + k * 1.7) * amp;
    m.compose(new THREE.Vector3(p.x, p.y + Math.max(0, j), p.z), q, s);
    crowd.setMatrixAt(k, m);
  }
  crowd.instanceMatrix.needsUpdate = true;
}
