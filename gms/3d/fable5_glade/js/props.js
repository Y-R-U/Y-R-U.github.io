// Static props + pickups: thatched cottage, trees, rocks, well, chicken-pen
// fence, barrels, crates, campfire, stone path, and the Diablo-style
// floating pickups. Everything registers itself for the debug panel.

import * as THREE from 'three';
import { CFG, SITES, LITE } from './config.js';
import { rand, pick, canvasTexture, M, mesh } from './utils.js';
import { register } from './registry.js';
import { groundHeight } from './world.js';
import { makeHeroSword, makeBow, makeCrossbow, makeStaff } from './combat.js';

const ticks = [];   // (t, dt) animation callbacks
const TIMBER = 0x5b4530, WOOD = 0x7a5634, DARKWOOD = 0x6e4a26, STONE = 0x8e8a80, GOLD = 0xcaa34a;

// ───────── shared textures ─────────

const plankTex = canvasTexture(128, (g, s) => {
  g.fillStyle = '#a87848'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(60,35,15,${rand(0.25, 0.5)})`;
    g.fillRect(i * 21 + rand(-2, 2), 0, rand(1.5, 3), s);
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = 'rgba(70,45,20,0.25)';
    g.beginPath();
    const y = Math.random() * s;
    g.moveTo(Math.random() * s, y); g.lineTo(Math.random() * s, y + rand(-3, 3));
    g.stroke();
  }
});

const thatchTex = canvasTexture(128, (g, s) => {
  g.fillStyle = '#b5945a'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 220; i++) {
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(120,90,40,0.35)' : 'rgba(230,205,140,0.3)';
    g.lineWidth = rand(0.7, 1.8);
    const x = Math.random() * s, y = Math.random() * s;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(8, 22), y + rand(-2, 2)); g.stroke();
  }
});
thatchTex.repeat.set(3, 1.5);

// ───────── smoke (chimney + campfire) ─────────

const smokeTex = canvasTexture(64, (g, s) => {
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(235,235,230,0.7)');
  grad.addColorStop(1, 'rgba(235,235,230,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
});
smokeTex.wrapS = smokeTex.wrapT = THREE.ClampToEdgeWrapping;

function addSmoke(parent, x, y, z, { rate = 0.16, size = 1 } = {}) {
  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTex, transparent: true, opacity: 0, depthWrite: false,
    }));
    sp.userData.phase = i / 7;
    parent.add(sp); puffs.push(sp);
  }
  ticks.push((t) => {
    for (const sp of puffs) {
      const age = (t * rate + sp.userData.phase) % 1;
      sp.position.set(x + Math.sin(age * 5 + sp.userData.phase * 9) * 0.18 * age, y + age * 1.9, z);
      const s = (0.3 + age * 1.3) * size;
      sp.scale.set(s, s, 1);
      sp.material.opacity = Math.min(age * 6, 1) * (1 - age) * 0.4;
    }
  });
}

// ───────── builders ─────────

function makeHouse() {
  const g = new THREE.Group();
  const wallMat = M(0xead9b8), timberMat = M(TIMBER), stoneMat = M(STONE);

  g.add(mesh(new THREE.BoxGeometry(5.0, 0.35, 4.0), stoneMat, 0, 0.175, 0));        // foundation
  g.add(mesh(new THREE.BoxGeometry(4.6, 2.1, 3.6), wallMat, 0, 1.4, 0));            // walls

  // tudor timber framing
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
    g.add(mesh(new THREE.BoxGeometry(0.13, 2.1, 0.13), timberMat, sx * 2.27, 1.4, sz * 1.77));
  for (const z of [-1.82, 1.82]) {
    g.add(mesh(new THREE.BoxGeometry(4.7, 0.13, 0.1), timberMat, 0, 0.45, z));
    g.add(mesh(new THREE.BoxGeometry(4.7, 0.13, 0.1), timberMat, 0, 2.38, z));
  }
  for (const x of [-2.32, 2.32]) {
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.13, 3.7), timberMat, x, 0.45, 0));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.13, 3.7), timberMat, x, 2.38, 0));
  }
  for (const [x, rot] of [[-1.55, 0.55], [1.55, -0.55]]) {
    const brace = mesh(new THREE.BoxGeometry(0.1, 1.5, 0.08), timberMat, x, 1.4, 1.83);
    brace.rotation.z = rot; g.add(brace);
  }

  // gable triangles (ridge runs along x)
  const tri = new THREE.Shape();
  tri.moveTo(-1.85, 0); tri.lineTo(1.85, 0); tri.lineTo(0, 1.5); tri.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.25, bevelEnabled: false });
  const g1 = mesh(gableGeo, wallMat, 2.3, 2.45, 0);  g1.rotation.y = -Math.PI / 2; // extrudes toward -x
  const g2 = mesh(gableGeo, wallMat, -2.3, 2.45, 0); g2.rotation.y = Math.PI / 2;  // extrudes toward +x
  g.add(g1, g2);

  // thatched roof
  const roofMat = new THREE.MeshStandardMaterial({ map: thatchTex, roughness: 1 });
  const slope = Math.atan2(1.5, 1.8);
  for (const side of [1, -1]) {
    const slab = mesh(new THREE.BoxGeometry(5.6, 0.16, 2.7), roofMat, 0, 2.99, side * 0.95);
    slab.rotation.x = side * slope;
    g.add(slab);
  }
  g.add(mesh(new THREE.BoxGeometry(5.7, 0.18, 0.42), M(0x8a6c3c), 0, 3.98, 0));    // ridge cap

  // door (front face z+)
  const doorMat = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.9 });
  for (const x of [-0.52, 0.52]) g.add(mesh(new THREE.BoxGeometry(0.13, 1.62, 0.15), timberMat, x, 1.16, 1.82));
  g.add(mesh(new THREE.BoxGeometry(1.17, 0.15, 0.15), timberMat, 0, 2.02, 1.82));
  g.add(mesh(new THREE.BoxGeometry(0.9, 1.52, 0.08), doorMat, 0, 1.11, 1.81));
  g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), M(GOLD, { metalness: 0.7, roughness: 0.35 }), 0.3, 1.05, 1.87));

  // windows
  const makeWindow = () => {
    const w = new THREE.Group();
    w.add(mesh(new THREE.BoxGeometry(0.78, 0.78, 0.1), timberMat));
    w.add(mesh(new THREE.BoxGeometry(0.62, 0.62, 0.05), new THREE.MeshStandardMaterial({
      color: 0xaed4e6, roughness: 0.15, metalness: 0.4,
      emissive: 0x86b8d2, emissiveIntensity: LITE ? 0 : 0.22,
    }), 0, 0, 0.01));
    w.add(mesh(new THREE.BoxGeometry(0.06, 0.66, 0.07), timberMat, 0, 0, 0.03));
    w.add(mesh(new THREE.BoxGeometry(0.66, 0.06, 0.07), timberMat, 0, 0, 0.03));
    return w;
  };
  for (const x of [-1.45, 1.45]) {
    const w = makeWindow(); w.position.set(x, 1.55, 1.82); g.add(w);
  }
  const sideW = makeWindow();
  sideW.position.set(-2.32, 1.55, 0); sideW.rotation.y = -Math.PI / 2; g.add(sideW);

  // chimney + smoke
  g.add(mesh(new THREE.BoxGeometry(0.55, 1.9, 0.55), stoneMat, 1.5, 3.3, -0.7));
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.16, 0.72), M(0x77736a), 1.5, 4.3, -0.7));
  g.add(mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), M(0x21201c), 1.5, 4.39, -0.7, false));
  addSmoke(g, 1.5, 4.5, -0.7);

  return g;
}

function makeTree(kind, scale = 1) {
  const g = new THREE.Group();
  const trunkMat = M(0x6b4a2e, { flatShading: true });
  if (kind === 'pine') {
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.22, 1.1, 7), trunkMat, 0, 0.55, 0));
    const greens = [0x39702f, 0x437f38, 0x4e8f41];
    [[1.25, 1.5, 1.45], [1.0, 1.3, 2.35], [0.7, 1.1, 3.1]].forEach(([r, h, y], i) => {
      g.add(mesh(new THREE.ConeGeometry(r, h, 8), M(greens[i], { flatShading: true }), 0, y, 0));
    });
  } else {
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.27, 1.4, 7), trunkMat, 0, 0.7, 0));
    const branch = mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.7, 5), trunkMat, 0.3, 1.45, 0.1);
    branch.rotation.z = -0.7; g.add(branch);
    const greens = [0x4d8a3c, 0x5d9c46, 0x6fae52];
    const blobs = [[0, 2.15, 0, 1.05], [0.65, 1.85, 0.25, 0.75], [-0.6, 1.9, -0.2, 0.7], [0.1, 1.8, 0.6, 0.65]];
    blobs.forEach(([x, y, z, r], i) => {
      const b = mesh(new THREE.IcosahedronGeometry(r, 1), M(greens[i % 3], { flatShading: true }), x, y, z);
      b.scale.y = 0.85; g.add(b);
    });
    if (kind === 'apple') {
      for (let i = 0; i < 6; i++) {
        const a = rand(0, Math.PI * 2), rr = rand(0.5, 0.95);
        g.add(mesh(new THREE.SphereGeometry(0.08, 6, 5), M(0xc23b2e, { roughness: 0.5 }),
          Math.cos(a) * rr, rand(1.7, 2.7), Math.sin(a) * rr, false));
      }
    }
  }
  g.scale.setScalar(scale);
  return g;
}

function makeRock(r) {
  const rock = mesh(
    new THREE.IcosahedronGeometry(r, 1),
    M(0x8d8d86, { flatShading: true, roughness: 1 })
  );
  rock.material.color.offsetHSL(0, 0, rand(-0.06, 0.05));
  rock.scale.set(rand(0.85, 1.25), rand(0.55, 0.8), rand(0.85, 1.25));
  rock.rotation.set(rand(0, 0.3), rand(0, Math.PI * 2), rand(0, 0.3));
  rock.position.y = r * 0.25;
  const g = new THREE.Group();
  g.add(rock);
  return g;
}

function makeWell() {
  const g = new THREE.Group();
  const stoneTex = canvasTexture(128, (gc, s) => {
    gc.fillStyle = '#8a857c'; gc.fillRect(0, 0, s, s);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) {
      gc.fillStyle = `hsl(40, ${rand(4, 10)}%, ${rand(42, 58)}%)`;
      gc.fillRect(x * 26 + (y % 2) * 13 + 1, y * 32 + 1, 24, 30);
    }
  });
  stoneTex.repeat.set(3, 1);
  g.add(mesh(new THREE.CylinderGeometry(0.8, 0.88, 0.85, 12),
    new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 1 }), 0, 0.425, 0));
  g.add(mesh(new THREE.TorusGeometry(0.8, 0.09, 8, 14).rotateX(Math.PI / 2), M(0x77736a), 0, 0.87, 0));
  g.add(mesh(new THREE.CircleGeometry(0.66, 16).rotateX(-Math.PI / 2),
    M(0x2e5f86, { roughness: 0.15, metalness: 0.3 }), 0, 0.74, 0, false));
  for (const x of [-0.72, 0.72]) g.add(mesh(new THREE.BoxGeometry(0.13, 1.5, 0.13), M(WOOD), x, 1.55, 0));
  const bar = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.55, 8), M(DARKWOOD), 0, 2.2, 0);
  bar.rotation.z = Math.PI / 2; g.add(bar);
  const crank = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), M(0x4a4a48), 0.85, 2.08, 0);
  g.add(crank);
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 5), M(0xb8a88a), 0, 1.9, 0));
  const bucket = new THREE.Group();
  bucket.add(mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.24, 10, 1, true), M(DARKWOOD, { side: THREE.DoubleSide })));
  bucket.add(mesh(new THREE.CircleGeometry(0.13, 10).rotateX(Math.PI / 2), M(DARKWOOD), 0, -0.11, 0, false));
  bucket.position.set(0, 1.5, 0); g.add(bucket);
  for (const side of [1, -1]) {
    const slab = mesh(new THREE.BoxGeometry(2.0, 0.08, 0.85), new THREE.MeshStandardMaterial({ map: thatchTex, roughness: 1 }), 0, 2.62, side * 0.36);
    slab.rotation.x = side * 0.62; g.add(slab);
  }
  g.add(mesh(new THREE.BoxGeometry(2.05, 0.1, 0.2), M(0x8a6c3c), 0, 2.82, 0));
  return g;
}

// Fence pen with a gate gap on the side facing the meadow centre.
function makeFencePen(cx, cz, half = 2.5) {
  const g = new THREE.Group();
  const points = [];
  const postMat = M(WOOD), railMat = M(0x8a6340);
  const runs = [
    [[-half, -half], [half, -half]],
    [[half, -half], [half, half]],
    [[half, half], [-half, half], true],   // gate side (faces centre, +x+z-ish)
    [[-half, half], [-half, -half]],
  ];
  for (const [a, b, hasGate] of runs) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const nPosts = Math.round(len / 1.25);
    for (let i = 0; i <= nPosts; i++) {
      const d = (i / nPosts) * len;
      if (hasGate && d > len / 2 - 0.8 && d < len / 2 + 0.8 && i !== 0 && i !== nPosts) continue;
      const x = a[0] + dir[0] * d, z = a[1] + dir[1] * d;
      const post = mesh(new THREE.BoxGeometry(0.15, 1.0, 0.15), postMat, x, groundHeight(cx + x, cz + z) - groundHeight(cx, cz) + 0.48, z);
      post.rotation.y = rand(-0.1, 0.1);
      g.add(post);
    }
    const nSegs = Math.ceil(len / 1.25);
    for (let i = 0; i < nSegs; i++) {
      const d0 = (i / nSegs) * len, d1 = ((i + 1) / nSegs) * len, dm = (d0 + d1) / 2;
      if (hasGate && dm > len / 2 - 0.8 && dm < len / 2 + 0.8) continue;
      const x = a[0] + dir[0] * dm, z = a[1] + dir[1] * dm;
      const segLen = d1 - d0;
      for (const y of [0.5, 0.82]) {
        const rail = mesh(new THREE.BoxGeometry(segLen, 0.09, 0.06), railMat, x,
          groundHeight(cx + x, cz + z) - groundHeight(cx, cz) + y, z);
        rail.rotation.y = Math.atan2(-dir[1], dir[0]);
        rail.rotation.z = rand(-0.03, 0.03);
        g.add(rail);
      }
      // collision circles along the rail
      for (let d = d0 + 0.35; d < d1; d += 0.7)
        points.push({ x: cx + a[0] + dir[0] * d, z: cz + a[1] + dir[1] * d, r: 0.28 });
    }
  }
  return { group: g, points };
}

function makeBarrel() {
  const profile = [
    new THREE.Vector2(0.001, 0), new THREE.Vector2(0.26, 0), new THREE.Vector2(0.31, 0.18),
    new THREE.Vector2(0.33, 0.4), new THREE.Vector2(0.31, 0.62), new THREE.Vector2(0.26, 0.8),
    new THREE.Vector2(0.001, 0.8),
  ];
  const g = new THREE.Group();
  g.add(mesh(new THREE.LatheGeometry(profile, 14), new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.9 })));
  for (const y of [0.18, 0.62])
    g.add(mesh(new THREE.TorusGeometry(0.315, 0.022, 6, 16).rotateX(Math.PI / 2), M(0x4a4a48, { metalness: 0.5, roughness: 0.5 }), 0, y, 0, false));
  return g;
}

function makeCrate(size = 0.62) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(size, size, size), mat, 0, size / 2, 0));
  const edge = M(DARKWOOD);
  const t = 0.07, h = size + 0.02;
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
    g.add(mesh(new THREE.BoxGeometry(t, h, t), edge, sx * (size / 2 - 0.02), size / 2, sz * (size / 2 - 0.02)));
  const plank = mesh(new THREE.BoxGeometry(size * 1.35, 0.05, 0.14), edge, 0, size + 0.01, 0);
  plank.rotation.y = 0.7; g.add(plank);
  return g;
}

function makeCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const st = mesh(new THREE.IcosahedronGeometry(rand(0.09, 0.14), 0), M(0x7e7a72, { flatShading: true }),
      Math.cos(a) * 0.52, 0.07, Math.sin(a) * 0.52);
    st.rotation.y = rand(0, 3); g.add(st);
  }
  for (let i = 0; i < 3; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.75, 6), M(0x4a3320), 0, 0.13, 0);
    log.rotation.set(Math.PI / 2 - 0.25, 0, (i / 3) * Math.PI * 2);
    g.add(log);
  }
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff7a26, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  flameMat.userData.noWire = true;
  const flame = mesh(new THREE.ConeGeometry(0.22, 0.6, 7), flameMat, 0, 0.42, 0, false);
  const innerMat = flameMat.clone(); innerMat.color.set(0xffd24a); innerMat.userData.noWire = true;
  const inner = mesh(new THREE.ConeGeometry(0.12, 0.36, 6), innerMat, 0, 0.32, 0, false);
  g.add(flame, inner);
  const light = new THREE.PointLight(0xff8c3a, LITE ? 0 : 7, 9, 2);
  light.position.y = 0.7; g.add(light);
  addSmoke(g, 0, 0.7, 0, { rate: 0.22, size: 0.7 });
  ticks.push((t) => {
    const f = 1 + Math.sin(t * 11) * 0.1 + Math.sin(t * 23 + 1.7) * 0.07;
    flame.scale.set(f, 1 / f + Math.sin(t * 17) * 0.06, f);
    inner.scale.set(2 - f, f * 0.9, 2 - f);
    light.intensity = LITE ? 0 : 7 + Math.sin(t * 13) * 1.2 + Math.sin(t * 29) * 0.8;
  });
  return g;
}

// ───────── pickups ─────────

function makeCoin() {
  const c = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 18),
    M(0xe8b33a, { metalness: 0.85, roughness: 0.3 }));
  c.rotation.x = Math.PI / 2; // stand on edge
  const g = new THREE.Group(); g.add(c);
  return g;
}

function makePotion(body = 0xc43b4a, glow = 0x701820) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({
    color: body, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.92,
    emissive: glow, emissiveIntensity: 0.4,
  }), 0, 0.18, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.12, 8), M(0xd8e8ea, { roughness: 0.2 }), 0, 0.36, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.07, 8), M(0xb89a6a), 0, 0.45, 0));
  return g;
}

function makeSword() {
  const g = new THREE.Group();
  const steel = M(0xcfd4dc, { metalness: 0.9, roughness: 0.25 });
  g.add(mesh(new THREE.BoxGeometry(0.085, 0.72, 0.028), steel, 0, 0.46, 0));
  const tip = mesh(new THREE.ConeGeometry(0.06, 0.16, 4), steel, 0, 0.9, 0);
  tip.rotation.y = Math.PI / 4; tip.scale.z = 0.33; g.add(tip);
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.055, 0.06), M(GOLD, { metalness: 0.7, roughness: 0.35 }), 0, 0.09, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.18, 8), M(0x4a3320), 0, -0.02, 0));
  g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), M(GOLD, { metalness: 0.7, roughness: 0.35 }), 0, -0.13, 0));
  return g;
}

function makeMushroom() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.17, 8), M(0xe8dcc8), 0, 0.085, 0));
  const cap = mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    M(0xc0392b, { roughness: 0.6 }), 0, 0.14, 0);
  cap.scale.y = 0.75; g.add(cap);
  for (let i = 0; i < 4; i++) {
    const a = rand(0, Math.PI * 2), rr = rand(0.04, 0.11);
    g.add(mesh(new THREE.SphereGeometry(0.022, 5, 4), M(0xf2ead8),
      Math.cos(a) * rr, 0.16 + (0.11 - rr) * 0.7, Math.sin(a) * rr, false));
  }
  return g;
}

function placePickup(name, icon, kind, builder, x, z, glow, opts = {}) {
  const g = new THREE.Group();
  const inner = builder();
  const baseY = opts.floatY ?? 0.25;
  inner.position.y = baseY;
  g.add(inner);
  const ringMat = new THREE.MeshBasicMaterial({
    color: glow, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  ringMat.userData.noWire = true;
  const ring = mesh(new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2), ringMat, 0, 0.04, 0, false);
  g.add(ring);
  g.position.set(x, groundHeight(x, z), z);
  const phase = rand(0, Math.PI * 2);
  const float = opts.float !== false, spin = opts.spin !== false;
  ticks.push((t) => {
    if (entry.dead) return;
    if (float) inner.position.y = baseY + Math.sin(t * 2.1 + phase) * 0.08;
    if (spin) inner.rotation.y = t * 1.4 + phase;
    ring.material.opacity = 0.32 + Math.sin(t * 2.6 + phase) * 0.18;
  });
  const entry = register({
    name, category: 'Pickups', icon, object: g, collider: null,
    pickup: { kind }, note: opts.note || '',
  });
  return g;
}

// ───────── placement ─────────

function place(scene, group, x, z, rotY = 0) {
  group.position.set(x, groundHeight(x, z), z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

export function buildProps(scene) {
  const H = SITES.house, W = SITES.well, F = SITES.campfire, P = SITES.pen;

  // house faces the meadow centre
  const houseRot = Math.atan2(-H.x, -H.z);
  const house = place(scene, makeHouse(), H.x, H.z, houseRot);
  register({ name: 'Thatched Cottage', category: 'Buildings', icon: '🏠', object: house, collider: { r: 3.1 }, pickup: null, note: 'Tudor frame, extruded gables, plank/thatch canvas textures, chimney smoke' });

  // stone path from the door toward the centre
  const dir = new THREE.Vector2(-H.x, -H.z).normalize();
  const door = new THREE.Vector2(H.x + dir.x * 2.1, H.z + dir.y * 2.1);
  const path = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const d = i * 1.05 + rand(-0.1, 0.1);
    const px = door.x + dir.x * d + dir.y * rand(-0.3, 0.3);
    const pz = door.y + dir.y * d - dir.x * rand(-0.3, 0.3);
    const st = mesh(new THREE.CylinderGeometry(rand(0.3, 0.45), rand(0.32, 0.47), 0.1, 9),
      M(0x9a9a92, { flatShading: true }), px, groundHeight(px, pz) + 0.03, pz);
    st.material.color.offsetHSL(0, 0, rand(-0.05, 0.04));
    st.scale.x = rand(0.8, 1.2); st.rotation.y = rand(0, 3);
    st.castShadow = false;
    path.add(st);
  }
  scene.add(path);
  register({ name: 'Stone Path', category: 'Props', icon: '🪨', object: path, collider: null, pickup: null, note: 'Flattened stepping stones, door → meadow' });

  // well + campfire
  const well = place(scene, makeWell(), W.x, W.z, 0.5);
  register({ name: 'Old Well', category: 'Props', icon: '🪣', object: well, collider: { r: 1.05 }, pickup: null, note: 'Stone-texture cylinder, thatch roof, rope + bucket' });
  const fire = place(scene, makeCampfire(), F.x, F.z, 0);
  register({ name: 'Campfire', category: 'Props', icon: '🔥', object: fire, collider: { r: 0.7 }, pickup: null, note: 'Additive flame cones, flickering point light, smoke' });

  // chicken pen
  const pen = makeFencePen(P.x, P.z, 2.6);
  place(scene, pen.group, P.x, P.z, 0);
  register({ name: 'Chicken Pen Fence', category: 'Props', icon: '🪵', object: pen.group, collider: { points: pen.points }, pickup: null, note: 'Post-and-rail runs with a gate gap, per-rail collision circles' });

  // trees — ring near the edge, avoiding the house sector, plus two inner
  const treeDefs = [];
  const houseAngle = Math.atan2(H.z, H.x);
  for (let i = 0; i < 11; i++) {
    let a = (i / 11) * Math.PI * 2 + rand(-0.12, 0.12);
    let dA = Math.atan2(Math.sin(a - houseAngle), Math.cos(a - houseAngle));
    if (Math.abs(dA) < 0.55) continue;
    const r = rand(17, 23);
    treeDefs.push([Math.cos(a) * r, Math.sin(a) * r, pick(['oak', 'oak', 'pine', 'pine', 'apple'])]);
  }
  treeDefs.push([-13, 2, 'apple'], [6.5, 9.5, 'oak']);
  treeDefs.forEach(([x, z, kind], i) => {
    const s = rand(0.85, 1.25);
    const tree = place(scene, makeTree(kind, s), x, z, rand(0, Math.PI * 2));
    register({
      name: `${kind === 'pine' ? 'Pine' : kind === 'apple' ? 'Apple Tree' : 'Oak'} ${i + 1}`,
      category: 'Props', icon: kind === 'pine' ? '🌲' : '🌳', object: tree,
      collider: { r: 0.5 * s }, pickup: null,
      note: kind === 'pine' ? 'Stacked flat-shaded cones' : 'Icosahedron blob canopy' + (kind === 'apple' ? ' + apples' : ''),
    });
  });

  // rocks
  const rockSpots = [[14, 6], [12.5, 7.5], [-15, -11], [2, -12], [-6, 12], [18, -4], [-18, 6]];
  rockSpots.forEach(([x, z], i) => {
    const r = i < 2 ? rand(0.75, 0.95) : rand(0.3, 0.6);
    const rock = place(scene, makeRock(r), x, z, 0);
    register({ name: i < 2 ? `Boulder ${i + 1}` : `Rock ${i - 1}`, category: 'Props', icon: '🪨', object: rock, collider: { r: r * 1.05 }, pickup: null, note: 'Flat-shaded squashed icosahedron' });
  });

  // barrels + crates by the house walls (local offsets rotated with the house)
  const placeNearHouse = (lx, lz) => {
    const c = Math.cos(houseRot), s = Math.sin(houseRot);
    return [H.x + lx * c + lz * s, H.z - lx * s + lz * c];
  };
  const [b1x, b1z] = placeNearHouse(2.9, 0.4);
  const [b2x, b2z] = placeNearHouse(3.1, 1.4);
  const barrel1 = place(scene, makeBarrel(), b1x, b1z, rand(0, 3));
  const barrel2 = place(scene, makeBarrel(), b2x, b2z, rand(0, 3));
  barrel2.scale.setScalar(0.85);
  register({ name: 'Barrel 1', category: 'Props', icon: '🛢️', object: barrel1, collider: { r: 0.4 }, pickup: null, note: 'Lathe-profile staves + iron hoops' });
  register({ name: 'Barrel 2', category: 'Props', icon: '🛢️', object: barrel2, collider: { r: 0.35 }, pickup: null, note: 'Lathe-profile staves + iron hoops' });
  const [c1x, c1z] = placeNearHouse(-2.9, 0.8);
  const crate1 = place(scene, makeCrate(), c1x, c1z, 0.4);
  const crate2 = makeCrate(0.48);
  crate2.position.set(0.05, 0.62, 0.05); crate2.rotation.y = 0.5;
  crate1.add(crate2);
  register({ name: 'Crates', category: 'Props', icon: '📦', object: crate1, collider: { r: 0.55 }, pickup: null, note: 'Stacked plank-texture boxes, corner trim' });

  // weapon rack — display copies of the gear the heroes carry, so each
  // weapon gets its own debug entry + tri count
  const rack = new THREE.Group();
  for (const x of [-0.55, 0.55]) {
    rack.add(mesh(new THREE.BoxGeometry(0.09, 1.5, 0.09), M(WOOD), x, 0.75, 0));
    rack.add(mesh(new THREE.BoxGeometry(0.09, 0.09, 0.5), M(WOOD), x, 0.045, 0));
  }
  rack.add(mesh(new THREE.BoxGeometry(1.3, 0.08, 0.08), M(WOOD), 0, 1.45, 0));
  rack.add(mesh(new THREE.BoxGeometry(1.3, 0.06, 0.06), M(DARKWOOD), 0, 0.55, 0));
  const dispSword = makeHeroSword();
  dispSword.position.set(-0.38, 1.32, 0.07);
  dispSword.rotation.z = Math.PI; // hangs point-down
  rack.add(dispSword);
  const dispXbow = makeCrossbow();
  dispXbow.position.set(0.08, 0.78, 0.09);
  rack.add(dispXbow);
  const dispStaff = makeStaff();
  dispStaff.position.set(0.46, 0.5, 0.12);
  dispStaff.rotation.z = -0.16; dispStaff.rotation.x = -0.1;
  rack.add(dispStaff);
  const [rx, rz] = placeNearHouse(-2.2, 2.7);
  place(scene, rack, rx, rz, houseRot + 0.4);
  register({ name: 'Weapon Rack', category: 'Props', icon: '🪵', object: rack, collider: { r: 0.55 }, pickup: null, note: 'Display rack for the heroes’ gear' });
  register({ name: 'Hero Sword', category: 'Gear', icon: '🗡️', object: dispSword, collider: null, pickup: null, note: 'Carried by all heroes (⚔️ style). Box blade + fuller, 4-side cone tip, gold guard' });
  register({ name: 'Crossbow', category: 'Gear', icon: '🏹', object: dispXbow, collider: null, pickup: null, note: 'Carried by all heroes (🏹 style). Swept limbs, cocked string, loaded bolt' });
  register({ name: 'Mage Staff', category: 'Gear', icon: '🪄', object: dispStaff, collider: null, pickup: null, note: 'Carried by all heroes (🔮 style). Emissive crystal orb in claw prongs' });

  // pickups
  scene.add(placePickup('Gold Coin 1', '🪙', 'coin', makeCoin, door.x + dir.x * 2.5, door.y + dir.y * 2.5, 0xffd34a, { note: 'Spinning edge-on cylinder' }));
  scene.add(placePickup('Gold Coin 2', '🪙', 'coin', makeCoin, door.x + dir.x * 4.2 + 0.6, door.y + dir.y * 4.2, 0xffd34a));
  scene.add(placePickup('Gold Coin 3', '🪙', 'coin', makeCoin, W.x + 1.6, W.z + 0.8, 0xffd34a));
  scene.add(placePickup('Gold Coin 4', '🪙', 'coin', makeCoin, W.x + 2.2, W.z - 0.6, 0xffd34a));
  scene.add(placePickup('Gold Coin 5', '🪙', 'coin', makeCoin, F.x + 1.4, F.z + 1.2, 0xffd34a));
  scene.add(placePickup('Gold Coin 6', '🪙', 'coin', makeCoin, -2, -8, 0xffd34a));
  scene.add(placePickup('Health Potion 1', '🧪', 'hpot', makePotion, F.x - 1.3, F.z + 0.6, 0xff6a7a, { floatY: 0.12, note: 'Translucent flask, faint emissive' }));
  scene.add(placePickup('Health Potion 2', '🧪', 'hpot', makePotion, door.x - dir.y * 1.6, door.y + dir.x * 1.6, 0xff6a7a, { floatY: 0.12 }));
  const makeManaPotion = () => makePotion(0x3a7ac8, 0x182a70);
  scene.add(placePickup('Mana Potion 1', '🧪', 'mpot', makeManaPotion, W.x - 1.7, W.z + 1.4, 0x6aa8ff, { floatY: 0.12, note: 'Same flask, blue brew' }));
  scene.add(placePickup('Mana Potion 2', '🧪', 'mpot', makeManaPotion, P.x + 4.4, P.z + 4.2, 0x6aa8ff, { floatY: 0.12 }));
  scene.add(placePickup('Iron Sword', '🗡️', 'sword', makeSword, 13.2, 6.8, 0xbcd9ff, { floatY: 0.55, note: 'Diablo-style hovering loot by the boulders' }));
  scene.add(placePickup('Recurve Bow', '🏹', 'bow', makeBow, -7.2, 11.5, 0xc8e89a, { floatY: 0.55, note: 'Decorative loot — the demo heroes shoot crossbows instead' }));
  scene.add(placePickup('Mushroom 1', '🍄', 'mushroom', makeMushroom, -13.6, 2.9, 0xffb46a, { float: false, spin: false, floatY: 0, note: 'Grounded — no float/spin' }));
  scene.add(placePickup('Mushroom 2', '🍄', 'mushroom', makeMushroom, -12.2, 1.6, 0xffb46a, { float: false, spin: false, floatY: 0 }));
  scene.add(placePickup('Mushroom 3', '🍄', 'mushroom', makeMushroom, 0.8, -13.4, 0xffb46a, { float: false, spin: false, floatY: 0 }));

  return {
    tick(t, dt) { for (const fn of ticks) fn(t, dt); },
  };
}
