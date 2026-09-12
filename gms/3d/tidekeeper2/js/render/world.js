/* ═══════════════════════════════════════════════════════════════════════════
   THE ROOM
   A dark gallery with one brightly lit tank in it. The contrast between the
   warm dim room and the cold bright water is most of why aquarium
   photographs look the way they do, so the room is deliberately murky.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { clamp, lerp, rr, rnd, damp, TAU } from '../util.js';
import { CFG } from '../config.js';
import { TankView, TANK_U } from './tankview.js';
import { SpeciesBatch, FISH_U, useWaterFog } from './fish.js';
import { buildPlantGeo, plantMaterial, buildDecor } from './flora.js';
import { photo, wallFallback, oakFallback, derivedNormal } from './textures.js';
import { SP } from '../data/species.js';
import { PL, DEC, FD } from '../data/flora.js';
import { daylight, lightFixture, flowOf } from '../sim/tank.js';

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qb = new THREE.Quaternion(),
      _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(),
      _e = new THREE.Euler(), _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(1, 0, 0);

/** How many of a thing one purchase actually plants. */
const CLUMP = { carpet: 9, stem: 6, ribbon: 4, grape: 3, fern: 4, broad: 2 };

export class World {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.root = new THREE.Group(); scene.add(this.root);
    this.tank = new TankView(this.root);
    this.batches = new Map();
    this.plantMeshes = new Map();
    this.decorMeshes = [];
    this.dims = [4, 2.4, 2.2];
    this.buildLights();
    this.buildRoom();
  }

  buildLights() {
    /* the tank fixture */
    this.key = new THREE.DirectionalLight(0xffffff, 1.4);
    this.key.position.set(0.8, 12, 1.6);
    this.scene.add(this.key, this.key.target);
    this.fill = new THREE.DirectionalLight(0xbfe4f5, 0.42);
    this.fill.position.set(-3, 3, 6);
    this.scene.add(this.fill);
    this.lamp = new THREE.PointLight(0xd8f2ff, 3.0, 40, 1.1);
    this.scene.add(this.lamp);
    this.hemi = new THREE.HemisphereLight(0xa8e6ff, 0x0a1820, 0.5);
    this.scene.add(this.hemi);
    /* a floor of light so the dark gallery is dark, not black */
    this.amb = new THREE.AmbientLight(0x4a6d8c, 1.15);
    this.scene.add(this.amb);
    /* the room */
    this.room = new THREE.PointLight(0xffc287, 60, 120, 0.7);
    this.room.position.set(-11, 10, 16);
    this.room2 = new THREE.PointLight(0x7fb8e0, 26, 90, 0.8);
    this.room2.position.set(10, 4, 16);
    this.scene.add(this.room2);
    this.scene.add(this.room);
    this.moon = new THREE.DirectionalLight(0x8ac6ff, 0);
    this.moon.position.set(-2, 8, 3);
    this.scene.add(this.moon);
  }

  buildRoom() {
    const wallTex = photo('wall', { repeat: 4, fallback: wallFallback });
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex, normalMap: derivedNormal(wallTex, 0.5, 4), color: 0x2f3a45, roughness: 0.96 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(90, 58), wallMat);
    back.position.set(0, 14, -18);
    this.root.add(back);
    for (const s of [1, -1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(50, 58), wallMat);
      w.position.set(s * 22, 14, 4); w.rotation.y = -s * Math.PI / 2;
      this.root.add(w);
    }
    const floorTex = photo('wall', { repeat: 9, fallback: wallFallback });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ map: floorTex, color: 0x272d33, roughness: 0.88, metalness: 0.06 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -7;
    this.root.add(floor); this.floor = floor;

    const oakTex = photo('oak', { repeat: 2, fallback: oakFallback });
    this.cabinet = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: oakTex, normalMap: derivedNormal(oakTex, 0.8, 2),
        color: 0x55463a, roughness: 0.58, metalness: 0.06 }));
    this.root.add(this.cabinet);
    /* a plinth line under the tank, so it does not float */
    this.plinth = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1),
      new THREE.MeshStandardMaterial({ color: 0x11161b, roughness: 0.5, metalness: 0.3 }));
    this.root.add(this.plinth);
    /* the hood the light hangs in */
    this.hood = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 1),
      new THREE.MeshStandardMaterial({ color: 0x0d1216, roughness: 0.4, metalness: 0.5 }));
    this.root.add(this.hood);
    this.tube = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xf2fbff }));
    this.root.add(this.tube);
  }

  /* ── (re)build for a tank ─────────────────────────────────────────────── */
  buildTank(T) {
    this.dims = T.dims.slice();
    this.tank.build(T.dims, T.water, T.substrate);
    const [W, H, D] = T.dims;
    this.cabinet.scale.set(W + 0.30, 7, D + 0.26);
    this.cabinet.position.set(0, -3.55, 0);
    this.plinth.scale.set(W + 0.45, 1, D + 0.4);
    this.plinth.position.set(0, -0.09, 0);
    this.hood.scale.set(W + 0.16, 1, D + 0.14);
    this.hood.position.set(0, H + 0.30, 0);
    this.tube.scale.set(W * 0.8, 1, 1);
    this.tube.position.set(0, H + 0.18, 0);
    this.lamp.position.set(0, H + 0.9, 0);
    this.lamp.distance = Math.max(W, D) * 4;
    this.key.target.position.set(0, H * 0.4, 0);
    this.key.target.updateMatrixWorld();
    return this;
  }

  /* ── hardscape layout, deterministic so a tank looks the same on reload ── */
  layout(T) {
    const [W, H, D] = T.dims;
    let seed = 1337 + T.uid * 977;
    const rq = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    T.decor.forEach((d, i) => {
      const n = T.decor.length;
      d.x = (n === 1 ? -W * 0.12 : -W * 0.33 + (i / (n - 1)) * W * 0.66) + (rq() - 0.5) * W * 0.07;
      d.z = -D * 0.13 + (rq() - 0.5) * D * 0.34;
      d.rot = rq() * TAU;
      d.scale = 0.8 + rq() * 0.35;
    });
    /* plants go in two or three masses with a gap between them, which is how
       anyone actually aquascapes and reads far better than an even row */
    const groups = T.plants.length <= 2 ? 1 : T.plants.length <= 6 ? 2 : 3;
    const anchors = [];
    for (let g = 0; g < groups; g++)
      anchors.push(groups === 1 ? -W * 0.22 : -W * 0.36 + (g / (groups - 1)) * W * 0.72);
    const byKind = new Map();
    T.plants.forEach(p => { const k = PL[p.id].kind;
      if (!byKind.has(k)) byKind.set(k, byKind.size % groups); });
    T.plants.forEach((p, i) => {
      const g = byKind.get(PL[p.id].kind) ?? (i % groups);
      const spread = PL[p.id].kind === 'carpet' ? W * 0.30 : W * 0.11;
      p.x = clamp(anchors[g] + (rq() - 0.5) * spread * 2, -W * 0.45, W * 0.45);
      p.z = -D * 0.30 + (rq() * 0.62) * D * 0.5;
      p.rot = rq() * TAU;
      p.scale = 0.72 + rq() * 0.56;
    });
  }

  syncContents(T) {
    this.layout(T);
    const byKind = new Map();
    for (const p of T.plants) {
      const k = PL[p.id].kind;
      if (!byKind.has(k)) byKind.set(k, []);
      byKind.get(k).push(p);
    }
    for (const [k, mesh] of this.plantMeshes) if (!byKind.has(k)) {
      this.tank.group.remove(mesh); mesh.geometry.dispose(); this.plantMeshes.delete(k);
    }
    for (const [k, list] of byKind) {
      let mesh = this.plantMeshes.get(k);
      const want = list.length * (CLUMP[k] ?? 3) + 4;
      if (!mesh || mesh.instanceMatrix.count < want) {
        if (mesh) { this.tank.group.remove(mesh); mesh.geometry.dispose(); }
        const geo = buildPlantGeo(k);
        const cap = Math.max(16, want);
        const ph = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        for (let i = 0; i < cap; i++) ph.setXYZ(i, rnd() * TAU, rnd(), rnd());
        geo.setAttribute('aPhase', ph);
        mesh = new THREE.InstancedMesh(geo, plantMaterial(), cap);
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        this.plantMeshes.set(k, mesh);
        this.tank.group.add(mesh);
      }
      let n = 0;
      const clump = CLUMP[k] ?? 3;
      list.forEach((p) => {
        let seed = (p.x * 971 + p.z * 613 + 7) | 0;
        const rq = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const base = PL[p.id].height * 2.5 * p.scale * (0.45 + 0.55 * p.health) * (this.dims[1] / 2.6);
        const r = PL[p.id].kind === 'carpet' ? 0.62 : 0.26;
        for (let c = 0; c < clump && n < mesh.instanceMatrix.count; c++) {
          const a = rq() * TAU, d = c === 0 ? 0 : Math.sqrt(rq()) * r;
          const s = base * (c === 0 ? 1 : 0.62 + rq() * 0.5);
          _m4.compose(_v.set(p.x + Math.cos(a) * d, 0.04, p.z + Math.sin(a) * d),
            _q.setFromEuler(_e.set(0, p.rot + rq() * TAU, 0)), _v2.set(s, s, s));
          mesh.setMatrixAt(n++, _m4);
        }
      });
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }

    for (const m of this.decorMeshes) { this.tank.group.remove(m); m.traverse(c => c.geometry && c.geometry.dispose()); }
    this.decorMeshes = [];
    this.bubbleBars = [];
    for (const d of T.decor) {
      const g = buildDecor(DEC[d.id].kind);
      const s = d.scale * (this.dims[1] / 2.6) * 0.95;
      g.position.set(d.x, 0.03, d.z); g.rotation.y = d.rot; g.scale.setScalar(s);
      this.tank.group.add(g);
      this.decorMeshes.push(g);
      if (DEC[d.id].kind === 'bubbler') this.bubbleBars.push({ x: d.x, z: d.z, w: 1.1 * s });
      d.wp = new THREE.Vector3(d.x, 0.42 * s, d.z);
    }

    const need = new Set(T.fish.map(f => f.spId));
    for (const [id, b] of this.batches) if (!need.has(id)) {
      this.tank.group.remove(b.mesh); b.dispose(); this.batches.delete(id);
    }
    for (const id of need) if (!this.batches.has(id)) {
      const b = new SpeciesBatch(SP[id], 80);
      this.batches.set(id, b);
      this.tank.group.add(b.mesh);
    }
  }

  /* ── per frame ────────────────────────────────────────────────────────── */
  updateFish(T) {
    for (const b of this.batches.values()) { b.mesh.count = 0; b.at.length = 0; }
    const sm = this.tank.shadows;
    let shadowN = 0;
    for (const f of T.fish) {
      const b = this.batches.get(f.spId);
      if (!b || b.mesh.count >= b.cap || !f.pos) continue;
      const i = b.mesh.count++;
      b.at[i] = f;
      const scale = f.len / CFG.UNIT_CM;
      const dir = _v.copy(f.vel);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0); else dir.normalize();

      if (f.sp.shape === 'seahorse' || f.sp.shape === 'snail') {
        _q.setFromEuler(_e.set(0, -Math.atan2(dir.z, dir.x), f.alive ? 0 : 1.7, 'YXZ'));
      } else if (!f.alive) {
        _q.setFromEuler(_e.set(Math.PI, -Math.atan2(dir.z, dir.x), 0, 'YXZ'));
      } else {
        const X = _v, Z = _v2.copy(UP).cross(X);
        if (Z.lengthSq() < 1e-5) Z.set(0, 0, 1);
        Z.normalize().multiplyScalar(-1);
        const Y = _v3.copy(Z).cross(X).normalize();
        _m4.makeBasis(X, Y, Z);
        _q.setFromRotationMatrix(_m4);
        if (f.bank) _q.multiply(_qb.setFromAxisAngle(FWD, f.bank));
      }
      _m4.compose(f.pos, _q, _v3.set(scale, scale, scale));
      b.mesh.setMatrixAt(i, _m4);

      const speed = f.vel.length();
      const beat = clamp(2.4 + speed * 9 * f.sp.activity, 1.5, 18) * (f.alive ? 1 : 0.06);
      const amp = (0.05 + clamp(speed * 0.55, 0, 0.075)) * (f.alive ? 1 : 0.12);
      b.anim.setXYZW(i, f.phase, beat, amp, beat * 1.5);
      b.state.setXYZW(i, f.alive ? 1 : 0.25, f.finDamage, f.sick, f.flash);
      const cond = f.alive ? 0.55 + 0.45 * f.health : 0.35;
      const t = f.tint * cond;
      _col.setRGB(t, t * (f.sick > 0.3 ? 0.96 : 1), t * (f.sick > 0.3 ? 0.98 : 1));
      b.mesh.setColorAt(i, _col);

      if (f.alive && shadowN < 138 && f.pos.y < this.dims[1] * 0.85) {
        const h = clamp(f.pos.y / (this.dims[1] * 0.85), 0, 1);
        const s = scale * (2.2 + h * 2.8);
        _m4.compose(_v.set(f.pos.x, f.pos.z, -0.055 - h * 0.02), _q.set(0, 0, 0, 1), _v2.set(s, s * 0.6, 1));
        sm.setMatrixAt(shadowN++, _m4);
      }
    }
    sm.count = shadowN; sm.instanceMatrix.needsUpdate = true;
    for (const b of this.batches.values()) {
      b.mesh.instanceMatrix.needsUpdate = true;
      b.anim.needsUpdate = true; b.state.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
  }

  updateBubbles(dt, T) {
    const tk = this.tank, H = this.dims[1];
    if (this.bubbleBars) for (const bar of this.bubbleBars)
      if (rnd() < dt * 30) tk.spawnBubble(bar.x + rr(-bar.w / 2, bar.w / 2), 0.07, bar.z, rr(0.010, 0.028));
    if (T && T.powerOut <= 0 && rnd() < dt * (2 + flowOf(T) * 5))
      tk.spawnBubble(rr(-this.dims[0] * 0.45, this.dims[0] * 0.45), 0.09, -this.dims[2] * 0.36, rr(0.007, 0.018));
    let n = 0;
    for (let i = tk.bubbleList.length - 1; i >= 0; i--) {
      const b = tk.bubbleList[i];
      b.life += dt;
      b.y += b.vy * dt * (0.7 + b.r * 9);
      b.x += Math.sin(b.life * 5.5 + b.ph) * dt * 0.14;
      b.z += Math.cos(b.life * 4.1 + b.ph) * dt * 0.11;
      if (b.y > H - 0.03) { tk.bubbleList.splice(i, 1); continue; }
      if (n < tk.bubbleCap) {
        _m4.compose(_v.set(b.x, b.y, b.z), _q.set(0, 0, 0, 1), _v2.set(b.r, b.r, b.r));
        tk.bubbles.setMatrixAt(n++, _m4);
      }
    }
    tk.bubbles.count = n; tk.bubbles.instanceMatrix.needsUpdate = true;
  }

  updateFood(T) {
    const g = this.tank.foodPts.geometry;
    const p = g.attributes.position.array, s = g.attributes.aSize.array, c = g.attributes.aCol.array;
    const tone = { flake: [0.88, 0.70, 0.36], pellet: [0.50, 0.34, 0.17], micro: [0.96, 0.76, 0.58],
                   meaty: [0.88, 0.44, 0.42], wafer: [0.34, 0.44, 0.20] };
    let n = 0;
    for (const q of T.food) {
      if (n >= this.tank.foodCap) break;
      p[n*3] = q.pos.x; p[n*3+1] = q.pos.y; p[n*3+2] = q.pos.z;
      s[n] = q.mass * 26 + 0.06;
      const t = tone[q.type] || tone.flake;
      c[n*3] = t[0]; c[n*3+1] = t[1]; c[n*3+2] = t[2];
      n++;
    }
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aCol.needsUpdate = true;
  }

  updateRays(camera) {
    this.fill.position.copy(camera.position).setY(camera.position.y + this.dims[1] * 0.5);
    if (!this.tank.rays) return;
    const a = Math.atan2(camera.position.x, camera.position.z);
    for (const r of this.tank.rays.children) r.rotation.y = a + r.userData.tilt;
  }

  /* ── light and water colour ───────────────────────────────────────────── */
  updateLighting(T, night) {
    const day = daylight(T), lamp = lightFixture(T);
    TANK_U.uNight.value = night; FISH_U.uNight.value = night;
    TANK_U.uCaustic.value = (0.32 + 0.68 * day) * (0.8 + lamp * 0.5);
    TANK_U.uAlgae.value = T.algae;
    TANK_U.uMurk.value = clamp(T.detritus * 0.35 + T.algae * 0.6, 0, 1);
    TANK_U.uLamp.value = lamp;

    const warm = new THREE.Color(0xfff3e2), cool = new THREE.Color(0x9fe2ff), blue = new THREE.Color(0x3a6ea8);
    this.key.color.copy(warm).lerp(cool, 0.42).lerp(blue, night);
    this.key.intensity = (0.45 + 3.1 * day) * lamp + 0.10;
    this.fill.intensity = 0.34 + 0.62 * day;
    this.hemi.intensity = 0.34 + 0.85 * day + night * 0.26;
    this.hemi.color.setHex(0xa8e6ff).lerp(new THREE.Color(0x2d5c96), night);
    this.lamp.intensity = (2.5 + 16 * day) * lamp + night * 2.4;
    this.lamp.color.setHex(0xd8f2ff).lerp(new THREE.Color(0x86b8ff), night);
    this.moon.intensity = night * 1.2;
    this.room.intensity = 52 + night * 26;
    this.room2.intensity = 20 + night * 10;
    this.amb.intensity = 1.0 + night * 0.35;
    this.tube.material.color.setHex(0xf2fbff).multiplyScalar(0.15 + day * lamp);

    /* water colour and per-channel absorption */
    const clear = new THREE.Color(T.water === 'sw' ? 0x2a86bb : 0x35848c);
    const murky = new THREE.Color(0x3d6a2c);
    const wc = clear.clone().lerp(murky, clamp(T.algae * 0.85 + T.detritus * 0.18, 0, 0.9));
    wc.lerp(new THREE.Color(0x0b2749), night * 0.7);
    wc.multiplyScalar(0.55 + 0.55 * Math.max(day, 0.2) * lamp);
    TANK_U.uWater.value.copy(wc);
    /* the light that survives a metre of water is blue-green, so the colour
       everything fades toward leans blue rather than toward the tank tint */
    FISH_U.uFogCol.value.copy(wc);
    FISH_U.uFogCol.value.r *= 0.50;
    FISH_U.uFogCol.value.g *= 0.82;
    FISH_U.uFogCol.value.b *= 1.15;
    /* red goes first, which is why everything deep looks blue */
    /* Real water loses about a third of its red per metre and almost no
       blue. One unit is ten centimetres, so these are per-decimetre numbers
       exaggerated about four times for the look. Murk scatters all three. */
    const murk = T.algae * 0.9 + T.detritus * 0.16;
    FISH_U.uAbsorb.value.set(0.055 + murk * 0.11, 0.013 + murk * 0.09, 0.006 + murk * 0.085);
    FISH_U.uFogLo.value = 0.5;

    this.scene.background = wc.clone().multiplyScalar(0.10);
    for (const m of this.plantMeshes.values())
      if (m.material.userData.sh) m.material.userData.sh.uniforms.uFlow.value = flowOf(T);
  }
}
