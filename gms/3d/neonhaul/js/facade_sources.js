// Bounded analytic spill on the emitter's own facade: four rectangles per building,
// two signs + two strips. Independent row handles survive dense Field swap-removal.
// No city RNG, world lights, neighbour search, or additional draw calls.
import * as THREE from 'three';
export const FACADE_SOURCE_CAP = 2048;
export class FacadeSources {
  constructor() {
    this.rows = new Map(); this.free = []; this.next = 1; this.overflow = 0;
    this.data = new Float32Array(16 * FACADE_SOURCE_CAP * 4);
    this.texture = new THREE.DataTexture(this.data, 16, FACADE_SOURCE_CAP, THREE.RGBAFormat, THREE.FloatType);
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.dirty = false;
  }
  alloc(b) {
    let r = this.rows.get(b);
    if (r) return r.id;
    const id = this.free.length ? this.free.pop() : this.next++;
    if (id >= FACADE_SOURCE_CAP) { this.overflow++; return 0; }
    this.rows.set(b, { id, sources: [null, null, null, null] });
    return id;
  }
  clear(b) {
    const r = this.rows.get(b); if (!r) return;
    this.data.fill(0, r.id * 64, (r.id + 1) * 64);
    r.sources.fill(null); this.dirty = true;
  }
  release(b) {
    const r = this.rows.get(b); if (!r) return;
    this.clear(b); this.rows.delete(b); this.free.push(r.id);
  }
  add(b, bx, src) {
    const r = this.rows.get(b);
    // Round facets need their actual bounds rather than an enclosing box. Defer those;
    // ordinary flat walls/strips are the dominant visible receivers.
    if (!r || !bx || bx.round) return;
    const start = src.kind === 'strip' ? 2 : 0;
    const candidates = r.sources.slice(start, start + 2).filter(Boolean);
    candidates.push(src);
    candidates.sort((a, c) => c.score - a.score || a.x - c.x || a.y - c.y || a.z - c.z);
    for (let i = 0; i < 2; i++) {
      const s = candidates[i]; r.sources[start + i] = s || null;
      const k = r.id * 64 + (start + i) * 16;
      this.data.fill(0, k, k + 16);
      if (!s) continue;
      const hb = s.box;
      const tangent0 = s.nx ? b.z + hb.z0 * b.d : b.x + hb.x0 * b.w;
      const tangent1 = s.nx ? b.z + hb.z1 * b.d : b.x + hb.x1 * b.w;
      // Use the emitted field's actual linear RGB (including its shipped palette
      // conversion); source and receiver must have the same chromaticity.
      const rgb = s.rgb;
      this.data.set([s.x, s.y, s.z, s.range,
        s.nx, s.nz, s.w * 0.5, s.h * 0.5,
        rgb[0] * s.intensity, rgb[1] * s.intensity, rgb[2] * s.intensity, (start ? 2 : 1) + (s.seed || 0) / 1024,
        tangent0, tangent1, hb.y0 * b.h, hb.y1 * b.h], k);
    }
    this.dirty = true;
  }
  flush() { if (this.dirty) { this.texture.needsUpdate = true; this.dirty = false; } }
  list() {
    const out = [];
    for (const [b, r] of this.rows) for (let i = 0; i < 4; i++) {
      const s = r.sources[i]; if (s) out.push({ ...s, box: { ...s.box }, row: r.id, index: i, host: { x:b.x,z:b.z,w:b.w,h:b.h,d:b.d,proto:b.proto } });
    }
    return out;
  }
  dispose() { this.texture.dispose(); this.rows.clear(); }
}
