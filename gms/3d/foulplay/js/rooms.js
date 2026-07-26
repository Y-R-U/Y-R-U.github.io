// The rooms behind the menus. One small renderer, mounted into whichever DOM
// panel asked for it, drawing a real 3D space with your real car in it.
//
// Built in Three rather than painted as a backdrop image for three reasons that
// all turned out to matter: the camera moves, so a flat photo would slide
// against the car; the trophy case fills up as you win things, so it cannot be
// baked; and a photographic backdrop behind flat-shaded low-poly cars looks
// like a cut-out. A modelled room lights the car with the same lights that lit
// the room, which is the whole trick.

import * as THREE from 'three';
import { buildCar } from './carfactory.js';
import { profile, activeCar, playerLivery, playerStyle } from './save.js';
import { TROPHIES, earnedTrophies } from './progress.js';

let renderer = null;
let scene = null;
let camera = null;
let raf = 0;
let host = null;
let room = null;          // the furniture group for the current room
let car = null;
let kind = '';
let t = 0;
let spin = 0;
let drag = null;
// A car to show instead of the one you actually drive, so the showroom can put
// something you have not bought on the turntable.
let carOverride = null;

const DISPOSE = (obj) => {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) if (m.__owned) m.dispose();
    }
  });
  if (obj.parent) obj.parent.remove(obj);
};

const mat = (hex, opts = {}) => {
  const m = new THREE.MeshLambertMaterial({ color: hex, ...opts });
  m.__owned = true;
  return m;
};
const emissive = (hex) => {
  const m = new THREE.MeshBasicMaterial({ color: hex });
  m.__owned = true;
  return m;
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ---------------------------------------------------------------------------
// `carSpec` puts a specific car on the turntable instead of the one you drive.
// It is passed in rather than set afterwards so a re-render builds one car, not
// two — every menu repaint would otherwise construct the whole mesh twice.
export function mountRoom(nodeOrId, which, carSpec) {
  const node = typeof nodeOrId === 'string' ? document.getElementById(nodeOrId) : nodeOrId;
  if (!node) return;
  host = node;
  ensure();
  node.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
  // Changing room drops any preview — the garage always shows the car you drive.
  if (kind !== which) { kind = which; carOverride = null; buildRoom(); }
  carOverride = carSpec || null;
  rebuildCar();
  resize();
  bindDrag(renderer.domElement);
  if (!raf) tick();
}

export function unmountRoom() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (renderer && renderer.domElement.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
  host = null;
}

function ensure() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.fog = new THREE.Fog(0x05070b, 16, 44);
  camera = new THREE.PerspectiveCamera(38, 2, 0.1, 120);
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------
function buildRoom() {
  DISPOSE(room);
  room = new THREE.Group();
  scene.add(room);
  // Lights belong to the room so a different room can have a different mood.
  scene.traverse(() => {});
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const c = scene.children[i];
    if (c.isLight) scene.remove(c);
  }

  if (kind === 'trophy') buildTrophyRoom();
  else if (kind === 'showroom') buildShowroom();
  else buildGarage();
}

function shell(wallHex, floorHex, W = 22, D = 26, H = 8) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(floorHex));
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);

  // A wet-looking floor: a second, darker plane just above it with a soft
  // radial gradient reads as a reflection for the price of one quad.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.7, D * 0.5), new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(150,190,230,0.16)', 'rgba(150,190,230,0)'),
    transparent: true, depthWrite: false,
  }));
  glow.material.__owned = true;
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.01;
  room.add(glow);

  const wallMat = mat(wallHex);
  const back = new THREE.Mesh(box(W, H, 0.4), wallMat);
  back.position.set(0, H / 2, -D / 2);
  room.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(box(0.4, H, D), wallMat);
    side.position.set(sx * W / 2, H / 2, 0);
    room.add(side);
  }
  const ceil = new THREE.Mesh(box(W, 0.4, D), mat(0x0a0d13));
  ceil.position.y = H;
  room.add(ceil);

  // Panel lines on the back wall so it is not a flat colour.
  for (let i = -3; i <= 3; i++) {
    const seam = new THREE.Mesh(box(0.06, H, 0.06), mat(0x000000));
    seam.position.set(i * (W / 7), H / 2, -D / 2 + 0.24);
    room.add(seam);
  }
  return { W, D, H };
}

function lamp(x, y, z, colour = 0xfff0d0, power = 26, shadeHex = 0x1b1f27) {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(box(0.04, 1.1, 0.04), mat(0x14171d));
  cord.position.y = 0.55;
  g.add(cord);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.44, 12, 1, true), mat(shadeHex, { side: THREE.DoubleSide }));
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), emissive(colour));
  bulb.position.y = -0.12;
  g.add(bulb);
  // A cone of light you can see, which does more for the mood than the light.
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.4, 14, 1, true), new THREE.MeshBasicMaterial({
    color: colour, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false,
  }));
  beam.material.__owned = true;
  beam.position.y = -2.8;
  g.add(beam);
  g.position.set(x, y, z);
  room.add(g);

  const light = new THREE.PointLight(colour, power, 22, 1.6);
  light.position.set(x, y - 0.2, z);
  scene.add(light);
  return g;
}

// A soft dark blob under the car. Real shadow maps in a panel this small cost
// more than they show; this reads as contact and costs one quad.
function contactShadow(rx, rz) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(0,0,0,0.62)', 'rgba(0,0,0,0)'),
    transparent: true, depthWrite: false,
  }));
  m.material.__owned = true;
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.renderOrder = 1;
  room.add(m);
  return m;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A tool board, drawn once into a canvas. Cheaper than fifty little meshes and
// it reads better, because the silhouettes can be scruffy.
function toolboardTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1e26';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let x = 6; x < 256; x += 10) {
    for (let y = 6; y < 128; y += 10) { g.beginPath(); g.arc(x, y, 1.2, 0, 7); g.stroke(); }
  }
  const cols = ['#c8ced6', '#9aa3ad', '#e0a13a', '#7f8794'];
  for (let i = 0; i < 26; i++) {
    const x = 12 + (i % 13) * 18, y = 16 + Math.floor(i / 13) * 52;
    g.fillStyle = cols[i % cols.length];
    const h = 18 + (i * 7) % 26;
    g.fillRect(x, y, 4, h);
    g.beginPath(); g.arc(x + 2, y + h + 3, 4.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x + 4, y, 2, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildGarage() {
  const { W, D, H } = shell(0x232a34, 0x171c23);
  scene.add(new THREE.HemisphereLight(0xa8caea, 0x14171d, 1.0));
  const key = new THREE.DirectionalLight(0xfff0d8, 1.5);
  key.position.set(5, 9, 7);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ab4e0, 0.7);
  fill.position.set(-6, 4, -5);
  scene.add(fill);
  lamp(-3.4, 6.4, -1.5, 0xd8f0ff, 38);
  lamp(3.4, 6.4, 1.8, 0xffd9a0, 32);
  contactShadow(2.5, 1.35);

  // Inspection pit lip: a lighter rectangle the car is parked over.
  const pad = new THREE.Mesh(box(6.4, 0.12, 9.6), mat(0x1d2530));
  pad.position.y = 0.02;
  room.add(pad);
  for (const sx of [-1, 1]) {
    const stripe = new THREE.Mesh(box(0.16, 0.14, 9.6), emissive(0xffb020));
    stripe.position.set(sx * 3.1, 0.03, 0);
    stripe.material.transparent = true;
    stripe.material.opacity = 0.5;
    room.add(stripe);
  }

  // Roller door at the back — slats, and a slice of night behind it.
  const doorMat = mat(0x2b333d);
  for (let i = 0; i < 11; i++) {
    const slat = new THREE.Mesh(box(7.6, 0.34, 0.16), doorMat);
    slat.position.set(0, 0.3 + i * 0.38, -D / 2 + 0.3);
    room.add(slat);
  }
  const night = new THREE.Mesh(box(7.6, 0.5, 0.06), emissive(0x2a4a66));
  night.position.set(0, 0.12, -D / 2 + 0.42);
  room.add(night);

  // Workbench and tool boards on both walls.
  for (const sx of [-1, 1]) {
    const bench = new THREE.Mesh(box(0.9, 0.9, 5.2), mat(0x232a33));
    bench.position.set(sx * (W / 2 - 0.9), 0.45, -2.4);
    room.add(bench);
    const top = new THREE.Mesh(box(1.0, 0.1, 5.3), mat(0x39424d));
    top.position.set(sx * (W / 2 - 0.9), 0.94, -2.4);
    room.add(top);

    const boardMat = new THREE.MeshLambertMaterial({ map: toolboardTexture() });
    boardMat.__owned = true;
    const board = new THREE.Mesh(box(0.08, 1.7, 3.4), boardMat);
    board.position.set(sx * (W / 2 - 0.45), 2.3, -2.4);
    room.add(board);

    // Tyre stack.
    for (let i = 0; i < 4; i++) {
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.17, 6, 14), mat(0x14161a));
      tyre.rotation.x = Math.PI / 2;
      tyre.position.set(sx * (W / 2 - 1.6), 0.18 + i * 0.3, 4.4);
      room.add(tyre);
    }
    // Oil drum.
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), mat(sx > 0 ? 0xc4482c : 0x3a6b4a));
    drum.position.set(sx * (W / 2 - 2.6), 0.55, 5.6);
    room.add(drum);
  }

  // Trolley jack, because every garage has one in the way.
  const jack = new THREE.Mesh(box(0.5, 0.22, 1.4), mat(0xc4302a));
  jack.position.set(-4.2, 0.11, 2.6);
  jack.rotation.y = 0.4;
  room.add(jack);
}

function buildShowroom() {
  const { W, D, H } = shell(0x1c2230, 0x12161d, 24, 26, 9);
  scene.add(new THREE.HemisphereLight(0xbcd4f0, 0x11141a, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 10, 6);
  scene.add(key);
  lamp(0, 7.2, -0.5, 0xffffff, 60, 0x0f1219);
  lamp(-5, 6.6, 3.5, 0xff8a4a, 30);
  lamp(5, 6.6, 3.5, 0x4aa3ef, 30);

  // Turntable plinth.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, 0.34, 40), mat(0x232b38));
  plinth.position.y = 0.17;
  room.add(plinth);
  contactShadow(2.5, 1.35).position.y = 0.36;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(4.62, 0.06, 6, 44), emissive(0xff5a2b));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.35;
  room.add(lip);

  // Banners down the back wall.
  for (let i = -2; i <= 2; i++) {
    const banner = new THREE.Mesh(box(1.5, 5.2, 0.06), mat(i % 2 ? 0x232b36 : 0x2a1d18));
    banner.position.set(i * 2.4, 4.4, -D / 2 + 0.35);
    room.add(banner);
    const flash = new THREE.Mesh(box(1.1, 0.28, 0.05), emissive(i % 2 ? 0xff5a2b : 0xffb020));
    flash.position.set(i * 2.4, 3.0, -D / 2 + 0.42);
    flash.material.transparent = true;
    flash.material.opacity = 0.75;
    room.add(flash);
  }
}

// Trophies are simple shapes on purpose: a cup you can read at thumbnail size
// beats a detailed one you cannot.
function trophyMesh(kindId, colour) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(box(0.34, 0.1, 0.34), mat(0x2b2118));
  g.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 8), mat(colour));
  stem.position.y = 0.16;
  g.add(stem);
  if (kindId === 'cup') {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.1, 0.26, 10), mat(colour));
    bowl.position.y = 0.4;
    g.add(bowl);
    for (const sx of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.022, 5, 9), mat(colour));
      handle.position.set(sx * 0.19, 0.4, 0);
      handle.rotation.y = Math.PI / 2;
      g.add(handle);
    }
  } else if (kindId === 'star') {
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), mat(colour));
    star.position.y = 0.42;
    g.add(star);
  } else if (kindId === 'plate') {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 14), mat(colour));
    plate.position.y = 0.36;
    plate.rotation.x = 0.5;
    g.add(plate);
  } else {
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), mat(colour));
    belt.position.y = 0.4;
    g.add(belt);
  }
  return g;
}

function buildTrophyRoom() {
  const { W, D, H } = shell(0x252b36, 0x181d25, 20, 22, 7.5);
  scene.add(new THREE.AmbientLight(0xbfd4ee, 0.5));
  scene.add(new THREE.HemisphereLight(0xb0c8e8, 0x252a33, 1.6));
  // Aimed at the cabinet rather than at the origin, which is where an untargeted
  // directional light points and why the first pass lit an empty floor.
  const key = new THREE.DirectionalLight(0xffe6c0, 2.4);
  key.position.set(1, 7, 5);
  key.target.position.set(0, 2.8, -8.2);
  scene.add(key);
  scene.add(key.target);
  lamp(-2.6, 6.0, 1.5, 0xffe6b8, 28);
  lamp(2.6, 6.0, 1.5, 0xffe6b8, 28);
  // Well in front of the cabinet: a point light parked a metre off a panel
  // washes it to a white blob instead of lighting the things on the shelves.
  const inside = new THREE.PointLight(0xfff0d0, 70, 22, 1.2);
  inside.position.set(0, 3.2, -4.4);
  scene.add(inside);

  // The case. Everything is a child of one group so the shelves, the trophies
  // and the glass cannot drift apart — the first version buried the whole
  // collection inside a solid backing panel, which is a very quiet bug.
  const caseG = new THREE.Group();
  caseG.position.z = -8.2;
  room.add(caseG);

  // A frame, not a block. A solid box here puts its front face between the
  // camera and everything on the shelves, which looks exactly like a cabinet
  // with nothing in it.
  const frameMat = mat(0x11151b);
  const W2 = 9.6, H2 = 5.6, DEEP = 1.5, TH = 0.22;
  for (const [w, h, d, x, y, z] of [
    [W2, TH, DEEP, 0, 5.6, -0.4],              // top
    [W2, TH, DEEP, 0, 0.0, -0.4],              // bottom
    [TH, H2, DEEP, -W2 / 2, 2.8, -0.4],        // left
    [TH, H2, DEEP, W2 / 2, 2.8, -0.4],         // right
  ]) {
    const m = new THREE.Mesh(box(w, h, d), frameMat);
    m.position.set(x, y, z);
    caseG.add(m);
  }
  const backing = new THREE.Mesh(box(W2, H2, 0.1), mat(0x2b3646));
  backing.position.set(0, 2.8, -1.1);
  caseG.add(backing);

  const SHELF_Z = -0.42;
  const shelfY = [0.85, 2.05, 3.25, 4.45];
  for (const y of shelfY) {
    const shelf = new THREE.Mesh(box(9.0, 0.09, 1.15), mat(0x424c5b));
    shelf.position.set(0, y, SHELF_Z);
    caseG.add(shelf);
    // Strip light tucked under the shelf above, facing out.
    const strip = new THREE.Mesh(box(8.7, 0.05, 0.07), emissive(0xffe8b8));
    strip.position.set(0, y + 1.08, SHELF_Z + 0.5);
    caseG.add(strip);
  }
  const glass = new THREE.Mesh(box(9.2, 5.2, 0.04), new THREE.MeshLambertMaterial({
    color: 0xa9d8f0, transparent: true, opacity: 0.1, depthWrite: false,
  }));
  glass.material.__owned = true;
  glass.position.set(0, 2.8, 0.3);
  glass.renderOrder = 3;
  caseG.add(glass);

  // Fill it. Empty slots stay empty — a half-full cabinet is the point of it.
  const won = earnedTrophies();
  const perShelf = 6;
  TROPHIES.forEach((tr, i) => {
    if (!won.includes(tr.id)) return;
    const shelf = Math.min(shelfY.length - 1, Math.floor(i / perShelf));
    const slot = i % perShelf;
    const m = trophyMesh(tr.shape, tr.colour);
    m.position.set((slot - (perShelf - 1) / 2) * 1.45, shelfY[shelf] + 0.05, SHELF_Z + 0.1);
    m.scale.setScalar(1.35);
    m.userData.trophy = tr.id;
    caseG.add(m);
  });

  // A rug and a chair so the room is a room, not a shop window.
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.6, 26), mat(0x2a1f22));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.02, -2.0);
  room.add(rug);
}

// ---------------------------------------------------------------------------
export function rebuildRoom() {
  if (!scene) return;
  if (kind === 'trophy') { buildRoom(); return; }
  rebuildCar();
}

// Put a specific car on the turntable. Pass null to go back to your own.
export function setRoomCar(spec) {
  carOverride = spec || null;
  rebuildCar();
}

function rebuildCar() {
  if (!scene) return;
  DISPOSE(car);
  car = null;
  if (kind === 'trophy') return;
  const liv = playerLivery();
  const spec = carOverride || { style: playerStyle(), body: liv.body, trim: liv.trim };
  car = buildCar({ style: spec.style, body: spec.body, trim: spec.trim, partHp: 1 });
  car.position.set(0, kind === 'showroom' ? 0.34 : 0, 0);
  scene.add(car);
}

// Drag to spin the car. Costs nothing and is the first thing anybody tries.
function bindDrag(el) {
  if (el.__dragBound) return;
  el.__dragBound = true;
  const down = (e) => { drag = { x: (e.touches ? e.touches[0] : e).clientX, spin }; };
  const move = (e) => {
    if (!drag) return;
    const x = (e.touches ? e.touches[0] : e).clientX;
    spin = drag.spin + (x - drag.x) * 0.012;
    e.preventDefault();
  };
  const up = () => { drag = null; };
  el.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function resize() {
  if (!renderer || !host) return;
  const w = host.clientWidth || 320;
  const h = host.clientHeight || 180;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function tick() {
  raf = requestAnimationFrame(tick);
  if (!host || !host.isConnected) { unmountRoom(); return; }
  resize();
  t += 0.016;
  if (!drag) spin += 0.0035;

  if (kind === 'trophy') {
    // A slow drift along the front of the case, like walking past it. Far
    // enough back that the whole cabinet is in frame on a phone.
    const sway = Math.sin(t * 0.22) * 3.2;
    camera.position.set(sway, 3.1 + Math.sin(t * 0.17) * 0.22, 1.4);
    camera.lookAt(sway * 0.3, 2.7, -8.3);
  } else {
    const r = kind === 'showroom' ? 8.6 : 8.0;
    const height = kind === 'showroom' ? 2.9 : 2.5;
    camera.position.set(Math.cos(spin) * r, height + Math.sin(t * 0.3) * 0.18, Math.sin(spin) * r);
    camera.lookAt(0, kind === 'showroom' ? 1.1 : 0.8, 0);
  }
  renderer.render(scene, camera);
}

// Which trophy is under a tap, so the career screen can open its history.
export function trophyAt(clientX, clientY) {
  if (!renderer || !host || kind !== 'trophy') return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(room.children, true).filter((h) => h.object.visible);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.trophy) o = o.parent;
    if (o && o.userData.trophy) return o.userData.trophy;
  }
  return null;
}
