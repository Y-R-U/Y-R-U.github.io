// flythrough.js — the seeded cinematic tour: 3–6 POIs, style from char 15,
// always ending at the glowing door of the arrival building.

import * as THREE from 'three';

export class Flythrough {
  constructor(world) {
    this.world = world;
    const spec = world.spec;
    const style = spec.fly;
    const r = spec.rand('flypath');
    const pois = world.pois;
    const P = [];   // camera control points
    const L = [];   // matching look targets

    const center = new THREE.Vector3(0, world.plateauY + 10, 0);
    const hs = style.h;

    if (style.fam === 'spiral') {
      const turns = 2.2;
      const n = 9;
      const a0 = r.float() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        const a = a0 + f * turns * Math.PI * 2;
        const rr = 320 - f * 200;
        const h = (200 - f * 150) * hs;
        P.push(new THREE.Vector3(Math.cos(a) * rr, world.plateauY + h, Math.sin(a) * rr));
        L.push(pois[Math.min(pois.length - 1, Math.floor(f * pois.length))].look);
      }
    } else if (style.fam === 'orbit') {
      const n = 8;
      const a0 = r.float() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / (n - 1)) * Math.PI * 1.7;
        P.push(new THREE.Vector3(Math.cos(a) * 250, world.plateauY + 110 * hs, Math.sin(a) * 250));
        L.push(pois[Math.min(pois.length - 1, Math.floor((i / n) * pois.length))].look);
      }
    } else {
      // poi-visiting styles: drone / chase / balcony / skyfall / shoreline
      const first = pois[0];
      const inDir = first.pos.clone().setY(0).normalize();
      const start = first.pos.clone().add(inDir.multiplyScalar(160));
      start.y = style.fam === 'skyfall' ? 420 : (120 + 80 * hs);
      P.push(start); L.push(center.clone());
      for (let i = 0; i < pois.length; i++) {
        const poi = pois[i];
        const p = poi.pos.clone();
        if (style.fam === 'chase') {
          p.y = Math.min(p.y, world.plateauY + 5 + r.range(0, 6));
        } else if (style.fam === 'balcony') {
          p.lerp(poi.look, 0.35);
          p.y = Math.max(p.y, poi.look.y + 4);
        } else if (style.fam === 'drone') {
          p.y *= hs;
          p.y = Math.max(p.y, world.plateauY + 18);
        } else if (style.fam === 'shoreline' && world.hasWater) {
          p.y = Math.min(p.y, world.waterY + 9 + 6 * hs);
        }
        P.push(p);
        L.push(poi.look.clone());
        // raised midpoint between pois keeps sweeps airborne
        if (i < pois.length - 1 && style.fam !== 'chase') {
          const mid = p.clone().lerp(pois[i + 1].pos, 0.5);
          mid.y += 18 * hs;
          P.push(mid);
          L.push(pois[i + 1].look.clone());
        }
      }
    }

    // the ending is always the same ritual: over the roof, then down to the door
    const A = world.arrival;
    const doorEye = A.door.clone().add(A.out.clone().multiplyScalar(7)).setY(world.plateauY + 1.7);
    P.push(A.roof.clone().add(new THREE.Vector3(A.out.x * 20, 10, A.out.z * 20)));
    L.push(A.roof.clone());
    P.push(A.door.clone().add(A.out.clone().multiplyScalar(16)).setY(world.plateauY + 8));
    L.push(A.door.clone().setY(world.plateauY + 2));
    P.push(doorEye);
    L.push(A.door.clone().setY(world.plateauY + 1.8));

    // keep every control point above the terrain…
    for (const p of P) {
      const h = world.terrainH(p.x, p.z);
      if (p.y < h + 3) p.y = h + 3;
    }
    // …and out of the buildings: if a point is inside a footprint, fly over it
    // (skip the last two points — the door approach is deliberately tight)
    for (let i = 0; i < P.length - 2; i++) {
      const p = P[i];
      for (const b of world.buildings) {
        const rr = Math.max(b.w, b.d) * 0.75 + 3;
        const dx = p.x - b.x, dz = p.z - b.z;
        if (dx * dx + dz * dz < rr * rr && p.y < world.plateauY + b.h + 4) {
          p.y = world.plateauY + b.h + 9;
        }
      }
    }

    this.curve = new THREE.CatmullRomCurve3(P, false, 'centripetal', 0.4);
    this.looks = L;
    const len = this.curve.getLength();
    this.dur = Math.max(24, Math.min(85, len / (17 * style.s)));
    this.t = 0;
    this.mult = 1;
    this.lookCur = L[0].clone();
    this.pois = pois;
    this._pos = new THREE.Vector3();
  }

  // pose (position + current look target) at normalized time t
  poseAt(t) {
    const tt = Math.max(0, Math.min(1, t));
    const pos = this.curve.getPointAt(tt);
    const seg = tt * (this.looks.length - 1);
    const i = Math.min(this.looks.length - 2, Math.floor(seg));
    const f = seg - i;
    const sm = f * f * (3 - 2 * f);
    const look = this.looks[i].clone().lerp(this.looks[i + 1], sm);
    return { pos, look };
  }

  // the poi you're currently flying toward (for the whisper label)
  currentLabel() {
    const seg = this.t * (this.looks.length - 1);
    // looks 1..pois.length map to pois (0 is the approach)
    const idx = Math.round(seg) - 1;
    if (idx >= 0 && idx < this.pois.length) return this.pois[idx].name;
    if (this.t > 0.86) return 'arrival';
    return '';
  }

  update(camera, dt) {
    this.t += (dt * this.mult) / this.dur;
    const { pos, look } = this.poseAt(this.t);
    // never clip the ground
    const h = this.world.terrainH(pos.x, pos.z);
    if (pos.y < h + 1.6) pos.y = h + 1.6;
    camera.position.copy(pos);
    this.lookCur.lerp(look, Math.min(1, dt * 2.2));
    camera.lookAt(this.lookCur);
    return this.t >= 1;
  }
}
