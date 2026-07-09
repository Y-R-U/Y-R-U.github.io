// Level loader + the static world: painted tile ground (with auto road
// markings), placed pack models classified into blockers (OBB colliders —
// buildings stop cars, never damage them) and smashables (fling + cash),
// hotspot rings, sky/sun. Levels are data (levels/*.json or editor JSON).

import * as THREE from 'three';
import { model } from './assets.js';
import { clamp, circleOBB } from './utils.js';
import { CFG, FLAG } from './config.js';

// prop classification: everything not listed here BLOCKS.
export const SMASHABLE = {
  cone: 5, bin: 8, bench: 12, hydrant: 10, sign_stop: 8, tirepile: 15,
  crate: 12, atm: 60, bush: 6, bin_h: 8, dumpster: 25, busstop: 40,
  stall_pizza: 45, stall_soda: 45, stall_coffee: 45, stall_burger: 45,
  lamp: 15, tlight: 20,
};
// world hotspot icon glyphs
const ICON = { wrench: '🔧', car: '🚗', star: '⭐', snake: '🐍', mug: '☕', flag: '🏁', anchor: '⚓', sun: '🌴', skull: '💀', cash: '💰', pin: '📍' };

export const TILE_COLORS = {
  g: ['#69a244', '#5f9a3e', '#73aa4b'],
  d: ['#a5793f', '#9c7038', '#af8148'],
  s: ['#dcc686', '#d4be7c', '#e3ce92'],
  r: ['#3f4346', '#3a3e41', '#44484b'],
  p: ['#8e9296', '#878b8f', '#95999d'],
  w: ['#2f7fae', '#2b78a6', '#3386b6'],
};

export function buildGroundCanvas(level, px = 16) {
  const { w, h, ground } = level;
  const c = document.createElement('canvas');
  c.width = w * px; c.height = h * px;
  const g = c.getContext('2d');
  const at = (cc, rr) => (cc < 0 || rr < 0 || cc >= w || rr >= h) ? 'g' : ground[rr][cc];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let r = 0; r < h; r++) {
    for (let cc = 0; cc < w; cc++) {
      const t = at(cc, r);
      const cols = TILE_COLORS[t] || TILE_COLORS.g;
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.fillRect(cc * px, r * px, px, px);
      // speckle
      if (t === 'g' || t === 'd' || t === 's') {
        g.fillStyle = 'rgba(0,0,0,0.08)';
        for (let i = 0; i < 3; i++) g.fillRect(cc * px + rnd() * px, r * px + rnd() * px, 1.6, 1.6);
      }
      if (t === 'w') {
        g.strokeStyle = 'rgba(255,255,255,0.14)';
        g.lineWidth = 1;
        g.beginPath();
        const y = r * px + 4 + rnd() * 8;
        g.moveTo(cc * px + 2, y); g.quadraticCurveTo(cc * px + px / 2, y - 3, cc * px + px - 2, y);
        g.stroke();
      }
      if (t === 'r') {
        const ew = at(cc - 1, r) === 'r' && at(cc + 1, r) === 'r';
        const ns = at(cc, r - 1) === 'r' && at(cc, r + 1) === 'r';
        // kerb edges
        g.fillStyle = 'rgba(255,255,255,0.22)';
        if (at(cc, r - 1) !== 'r' && at(cc, r - 1) !== undefined && !ns && ew) g.fillRect(cc * px, r * px, px, 1.5);
        if (at(cc, r + 1) !== 'r' && !ns && ew) g.fillRect(cc * px, r * px + px - 1.5, px, 1.5);
        if (at(cc - 1, r) !== 'r' && !ew && ns) g.fillRect(cc * px, r * px, 1.5, px);
        if (at(cc + 1, r) !== 'r' && !ew && ns) g.fillRect(cc * px + px - 1.5, r * px, 1.5, px);
        // centre dashes (between the two lanes of a 2-wide road)
        g.fillStyle = 'rgba(255,214,90,0.6)';
        if (ew && at(cc, r + 1) === 'r' && at(cc, r + 2) !== 'r' && at(cc, r - 1) !== 'r') {
          for (let i = 0; i < 2; i++) g.fillRect(cc * px + 2 + i * px / 2, r * px + px - 1, px / 4, 2);
        }
        if (ns && at(cc + 1, r) === 'r' && at(cc + 2, r) !== 'r' && at(cc - 1, r) !== 'r') {
          for (let i = 0; i < 2; i++) g.fillRect(cc * px + px - 1, r * px + 2 + i * px / 2, 2, px / 4);
        }
      }
      if (t === 'p') {
        g.strokeStyle = 'rgba(0,0,0,0.10)';
        g.strokeRect(cc * px + 0.5, r * px + 0.5, px, px);
      }
      if (t === 's' && at(cc + 1, r) === 'w') {          // foam edge
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(cc * px + px - 2, r * px, 2, px);
      }
    }
  }
  return c;
}

export function makeIconSprite(glyph, scale = 2.6) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '92px -apple-system, "Segoe UI Emoji", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 10;
  g.fillText(glyph, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(scale, scale, 1);
  return sp;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.level = null;
    this.colliders = [];     // {x,z,hw,hh,rot}
    this.smashables = [];    // {x,z,r,hp,obj,cash,name,dead}
    this.hotspots = [];      // level hotspots + {ring, icon}
    this.time = 0;
    this._sky();
  }

  _sky() {
    const s = this.scene;
    s.background = new THREE.Color(0x9fd4e8);
    s.fog = new THREE.Fog(0xa8d8ea, 150, 340);
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a6a48, 1.05);
    s.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
    this.sun.position.set(60, 90, 30);
    this.sun.castShadow = !FLAG.lite;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -70; sc.right = sc.top = 70; sc.far = 260;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    s.add(this.sun);
    s.add(this.sun.target);
  }

  // keep the shadow box tracking the player so shadows stay crisp
  trackSun(x, z) {
    this.sun.position.set(x + 60, 90, z + 30);
    this.sun.target.position.set(x, 0, z);
  }

  async load(level) {
    this.dispose();
    this.level = level;
    const W = level.w * level.tile, H = level.h * level.tile;

    // ground
    const tex = new THREE.CanvasTexture(buildGroundCanvas(level));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, 0, H / 2);
    ground.receiveShadow = !FLAG.lite;
    this.root.add(ground);
    this.groundMesh = ground;

    // out-of-bounds skirt (visual)
    const skirt = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 3, H * 3),
      new THREE.MeshStandardMaterial({ color: 0x2b6f9e, roughness: 1 }));
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(W / 2, -0.15, H / 2);
    this.root.add(skirt);

    // objects
    const placed = await Promise.all((level.objects || []).map(async (o) => {
      const m = await model(o.m, { ownMaterial: false });
      m.position.set(o.x, 0, o.z);
      m.rotation.y = o.rot || 0;
      const s = o.s || 1;
      m.scale.setScalar(s);
      return { o, m };
    }));
    for (const { o, m } of placed) {
      this.root.add(m);
      const size = m.userData.size || new THREE.Vector3(2, 2, 2);
      const s = o.s || 1;
      if (SMASHABLE[o.m] !== undefined) {
        this.smashables.push({
          name: o.m, obj: m, x: o.x, z: o.z,
          r: Math.max(size.x, size.z) * s * 0.5,
          hp: SMASHABLE[o.m], cash: SMASHABLE[o.m], dead: false,
        });
      } else {
        this.colliders.push({
          x: o.x, z: o.z, rot: o.rot || 0,
          hw: size.x * s * 0.46, hh: size.z * s * 0.46,
          tall: size.y * s > 3.2,
        });
      }
    }

    // map edge walls (keep play inside)
    const eW = 4;
    for (const [x, z, hw, hh] of [[W / 2, -eW, W / 2 + eW * 2, eW], [W / 2, H + eW, W / 2 + eW * 2, eW], [-eW, H / 2, eW, H / 2 + eW * 2], [W + eW, H / 2, eW, H / 2 + eW * 2]]) {
      this.colliders.push({ x, z, rot: 0, hw, hh, edge: true });
    }

    // hotspots
    for (const h of (level.hotspots || [])) {
      const color = h.faction === 'police' ? CFG.colors.police
        : h.faction === 'gang' ? CFG.colors.gang
        : h.kind === 'shop' || h.kind === 'garage' ? 0x8ef0b2 : CFG.colors.mission;
      const ringGeo = new THREE.RingGeometry(h.radius * 0.82, h.radius, 40);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(h.x, 0.12, h.z);
      this.root.add(ring);
      const icon = makeIconSprite(ICON[h.icon] || '📍');
      icon.position.set(h.x, 4.2, h.z);
      this.root.add(icon);
      this.hotspots.push({ ...h, ring, iconSprite: icon });
    }
  }

  terrainAt(x, z) {
    const lv = this.level;
    if (!lv) return 'g';
    const c = Math.floor(x / lv.tile), r = Math.floor(z / lv.tile);
    if (c < 0 || r < 0 || c >= lv.w || r >= lv.h) return 'g';
    return lv.ground[r][c];
  }
  isRoad(x, z) { const t = this.terrainAt(x, z); return t === 'r' || t === 'p'; }

  // push a circle out of all blockers; returns {x,z,hit,nx,nz} move applied
  collide(px, pz, r) {
    let hit = null;
    for (const b of this.colliders) {
      if (Math.abs(px - b.x) > b.hw + r + 3 || Math.abs(pz - b.z) > b.hh + r + 3) continue;
      const push = circleOBB(px, pz, r, b);
      if (push) { px += push.x; pz += push.z; hit = push; }
    }
    return { x: px, z: pz, hit };
  }

  // ray-ish visibility for shooting: does a segment cross any tall blocker?
  blocked(ax, az, bx, bz) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 2.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const b of this.colliders) {
        if (b.edge || !b.tall) continue;
        if (Math.abs(x - b.x) > b.hw + 1 || Math.abs(z - b.z) > b.hh + 1) continue;
        if (circleOBB(x, z, 0.3, b)) return true;
      }
    }
    return false;
  }

  hotspotAt(x, z, kinds = null) {
    for (const h of this.hotspots) {
      if (kinds && !kinds.includes(h.kind)) continue;
      const dx = x - h.x, dz = z - h.z;
      if (dx * dx + dz * dz < h.radius * h.radius) return h;
    }
    return null;
  }

  tick(dt) {
    this.time += dt;
    const pulse = 0.45 + Math.sin(this.time * 2.6) * 0.2;
    for (const h of this.hotspots) {
      h.ring.material.opacity = pulse;
      h.iconSprite.position.y = 4.2 + Math.sin(this.time * 2 + h.x) * 0.35;
    }
  }

  dispose() {
    // NOTE: placed models share geometry/materials with the template cache —
    // never dispose those. Only tear down what the world itself created.
    if (this.groundMesh) {
      this.groundMesh.material.map?.dispose();
      this.groundMesh.material.dispose();
      this.groundMesh.geometry.dispose();
      this.groundMesh = null;
    }
    for (const h of this.hotspots) {
      h.ring.geometry.dispose(); h.ring.material.dispose();
      h.iconSprite.material.map?.dispose(); h.iconSprite.material.dispose();
    }
    for (const ch of [...this.root.children]) this.root.remove(ch);
    this.colliders = [];
    this.smashables = [];
    this.hotspots = [];
  }
}
