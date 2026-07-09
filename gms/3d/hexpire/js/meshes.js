// Procedural low-poly building & army meshes. Everything is built from
// primitives with flat-shaded Lambert materials — no external assets.
import * as THREE from 'three';
import { CFG } from './config.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const k = color + '|' + JSON.stringify(opts);
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  }
  return matCache.get(k);
}

const C = {
  stone: 0x9aa0a8, stoneDark: 0x767c85, wood: 0x8a6238, woodDark: 0x6b4a28,
  roof: 0xb5502e, roofAlt: 0x7a8a4a, straw: 0xc8a75a, metal: 0x555b63,
  trunk: 0x71513a, leaf: 0x4d8f3c, leaf2: 0x3f7a33, gold: 0xd8a92c,
};

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.position.set(x, y + h / 2, z);
  g.castShadow = true; g.receiveShadow = true;
  return g;
}
function cyl(rt, rb, h, seg, m, x = 0, y = 0, z = 0) {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  g.position.set(x, y + h / 2, z);
  g.castShadow = true; g.receiveShadow = true;
  return g;
}
function cone(r, h, seg, m, x = 0, y = 0, z = 0) {
  const g = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  g.position.set(x, y + h / 2, z);
  g.castShadow = true; g.receiveShadow = true;
  return g;
}

function crenels(radius, y, n, m, size = 0.07) {
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    grp.add(box(size, size * 1.3, size, m, Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  return grp;
}

export function flagTexture(text, cssColor) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 44;
  const g = cv.getContext('2d');
  g.fillStyle = cssColor; g.fillRect(0, 0, 64, 44);
  g.fillStyle = 'rgba(255,255,255,.92)';
  if (text) {
    g.font = 'bold 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 32, 24);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function banner(cssColor, text = '', scale = 1) {
  const grp = new THREE.Group();
  const pole = cyl(0.02, 0.025, 0.62 * scale, 5, mat(0x4a3826));
  grp.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34 * scale, 0.22 * scale),
    new THREE.MeshBasicMaterial({ map: flagTexture(text, cssColor), side: THREE.DoubleSide }),
  );
  flag.position.set(0.18 * scale, 0.5 * scale, 0);
  grp.add(flag);
  grp.userData.flag = flag;
  return grp;
}

// ---- home base castle, levels 1..5 ----
export function baseMesh(level, cssColor) {
  const grp = new THREE.Group();
  const h = 0.34 + level * 0.1;
  grp.add(cyl(0.62, 0.7, 0.14, 6, mat(C.stoneDark)));                    // plinth
  grp.add(cyl(0.4, 0.46, h, 8, mat(C.stone), 0, 0.12));                  // keep
  grp.add(crenels(0.4, 0.12 + h + 0.02, 8, mat(C.stoneDark)));
  if (level >= 2) grp.add(cyl(0.58, 0.62, 0.16, 8, mat(C.stone), 0, 0.1)); // wall ring
  const turrets = Math.max(0, level - 2);
  for (let i = 0; i < turrets; i++) {
    const a = (i / Math.max(turrets, 1)) * Math.PI * 2 + 0.6;
    const tx = Math.cos(a) * 0.5, tz = Math.sin(a) * 0.5;
    grp.add(cyl(0.11, 0.13, h * 0.8, 6, mat(C.stone), tx, 0.12, tz));
    grp.add(cone(0.15, 0.2, 6, mat(level >= 5 ? C.gold : C.roof), tx, 0.12 + h * 0.8, tz));
  }
  grp.add(cone(0.3, 0.3, 8, mat(level >= 5 ? C.gold : C.roof), 0, 0.12 + h + 0.06));
  const b = banner(cssColor, '', 1.1);
  b.position.set(0, 0.12 + h + 0.3, 0);
  grp.add(b);
  grp.userData.flag = b.userData.flag;
  return grp;
}

// ---- towers ----
export function towerMesh(type, cssColor) {
  const grp = new THREE.Group();
  if (type === 'wood') {
    grp.add(cyl(0.3, 0.36, 0.1, 6, mat(C.woodDark)));
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const leg = cyl(0.035, 0.045, 0.42, 5, mat(C.wood), Math.cos(a) * 0.17, 0.06, Math.sin(a) * 0.17);
      leg.rotation.z = Math.cos(a) * 0.16; leg.rotation.x = -Math.sin(a) * 0.16;
      grp.add(leg);
    }
    grp.add(box(0.4, 0.07, 0.4, mat(C.wood), 0, 0.46));
    grp.add(crenels(0.2, 0.53, 8, mat(C.woodDark), 0.06));
    grp.add(cone(0.24, 0.18, 4, mat(C.straw), 0, 0.6));
  } else if (type === 'stone') {
    grp.add(cyl(0.34, 0.4, 0.1, 6, mat(C.stoneDark)));
    grp.add(cyl(0.2, 0.26, 0.62, 7, mat(C.stone), 0, 0.08));
    grp.add(cyl(0.26, 0.22, 0.1, 7, mat(C.stone), 0, 0.68));
    grp.add(crenels(0.22, 0.78, 7, mat(C.stoneDark), 0.06));
  } else { // mortar
    grp.add(cyl(0.4, 0.46, 0.12, 6, mat(C.stoneDark)));
    grp.add(cyl(0.3, 0.36, 0.4, 8, mat(C.stone), 0, 0.1));
    grp.add(cyl(0.34, 0.3, 0.09, 8, mat(C.stoneDark), 0, 0.48));
    const tube = cyl(0.09, 0.12, 0.42, 8, mat(C.metal), 0, 0.4);
    tube.rotation.z = 0.6;
    tube.position.set(-0.12, 0.62, 0);
    grp.add(tube);
    grp.add(crenels(0.3, 0.56, 8, mat(C.stoneDark), 0.07));
  }
  const b = banner(cssColor, '', 0.8);
  b.position.set(0.16, type === 'wood' ? 0.5 : type === 'stone' ? 0.72 : 0.55, 0.16);
  grp.add(b);
  grp.userData.flag = b.userData.flag;
  return grp;
}

// ---- village: cluster of little houses ----
export function villageMesh(cssColor, neutral = false) {
  const grp = new THREE.Group();
  const spots = [[-0.22, -0.1, 0.5], [0.2, -0.18, -0.4], [0.05, 0.24, 1.9]];
  spots.forEach(([x, z, rot], i) => {
    const hw = 0.24 - i * 0.03, hh = 0.16, hd = 0.2 - i * 0.02;
    const house = new THREE.Group();
    house.add(box(hw, hh, hd, mat(i === 1 ? 0xcbb38a : 0xbfa87e)));
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.02, hd * 0.78, hw * 1.15, 3), mat(i === 2 ? C.roofAlt : C.roof));
    roof.rotation.z = Math.PI / 2;
    roof.position.y = hh + hd * 0.3;
    roof.castShadow = true;
    house.add(roof);
    house.position.set(x, 0, z * 0.16);
    house.rotation.y = rot;
    grp.add(house);
  });
  const b = banner(neutral ? '#8b9779' : cssColor, '', 0.7);
  b.position.set(0.3, 0, -0.25);
  grp.add(b);
  grp.userData.flag = b.userData.flag;
  return grp;
}

// ---- army: squad of little soldiers + level banner ----
export function armyMesh(level, colorHex, cssColor) {
  const grp = new THREE.Group();
  const n = Math.min(2 + Math.ceil(level / 2), 7);
  const bodyM = mat(colorHex);
  const skinM = mat(0xe8c49a);
  const spearM = mat(0x6b4a28);
  const scale = 0.85 + Math.min(level, 10) * 0.035;
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? 0 : ((i - 1) / (n - 1)) * Math.PI * 2;
    const rad = i === 0 ? 0 : 0.22 + (i % 2) * 0.06;
    const s = new THREE.Group();
    s.add(cone(0.085, 0.24, 6, bodyM, 0, 0));                    // tabard body
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skinM);
    head.position.y = 0.28; head.castShadow = true;
    s.add(head);
    const helm = cone(0.055, 0.07, 6, mat(C.metal), 0, 0.3);
    s.add(helm);
    const spear = cyl(0.008, 0.008, 0.36, 4, spearM, 0.07, 0.02);
    s.add(spear);
    s.add(cone(0.02, 0.05, 4, mat(C.metal), 0.07, 0.37));
    s.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    s.rotation.y = -a + Math.PI / 2;
    s.scale.setScalar(scale);
    grp.add(s);
  }
  const b = banner(cssColor, String(level), 1);
  b.position.set(0, 0.05, 0);
  grp.add(b);
  grp.userData.flag = b.userData.flag;
  grp.userData.level = level;
  return grp;
}

// ---- decorative tree ----
export function treeGeo() {
  // merged into instanced mesh by render.js; return canonical group parts
  return {
    trunk: new THREE.CylinderGeometry(0.05, 0.07, 0.22, 5),
    leaf: new THREE.ConeGeometry(0.24, 0.5, 6),
    trunkMat: mat(C.trunk),
    leafMat: mat(C.leaf),
  };
}

// HP pip bar as a sprite (drawn on demand)
export function hpBar(frac) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 10;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(20,24,18,.75)'; g.fillRect(0, 0, 64, 10);
  g.fillStyle = frac > 0.55 ? '#6fd151' : frac > 0.28 ? '#e8b93c' : '#e8453c';
  g.fillRect(2, 2, 60 * Math.max(frac, 0.03), 6);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  sp.scale.set(0.55, 0.09, 1);
  sp.renderOrder = 30;
  return sp;
}
