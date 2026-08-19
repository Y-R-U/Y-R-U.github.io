// §7.1 — zones: where pads are, what type they read as, and the world volume that marks one.
//
// NOTHING ABOVE `createZoneVisuals()` IMPORTS three.js OR TOUCHES THE DOM. That is the same rule
// city.js follows and for the same reason: `tools/sim_p7a.mjs` and `tools/gates_p7a.mjs` import
// this module straight into node, place a hundred thousand pads and measure the distributions. A
// placement scheme you can only exercise in a browser is a scheme nobody can prove.
//
// The visual layer at the bottom takes THREE as an ARGUMENT rather than importing it, so the
// module stays node-clean while the browser still gets its cylinders.
//
// §3.1.1's lookup order is respected: the authored table and its keep-out are consulted before a
// pad is allowed to exist, and a rejected pad is DROPPED, never retried elsewhere.

import { hash2i, xorshift32, clamp } from './utils.js';
import { CHUNK } from './city.js';
import { byId as districtById } from './districts.js';
import { ZONE_TYPES } from './config.js';

export const ZONE_SALT = 0x7a17;
export const PAD_CHANCE = 0.22;          // §7.1 "every chunk has a 22 % chance of a pad"

// §7.1's volume, verbatim. `glyphY` is the floating glyph's height.
export const VOLUME = { radius: 14, height: 26, glyphY: 18 };

// ── the two coarse lattices ────────────────────────────────────────────────
//
// §7.1: "WORKSHOP and CHARGE are placed on a coarser grid so there is always one within ~700 m;
// §7.4's charging rhythm depends on that number, so do not loosen it."
//
// A 3-chunk lattice is 768 m. The worst case for a point inside a lattice cell is the half
// diagonal, 543 m, plus however far the pad sits from its chunk's centre. That is the whole
// derivation and `gates_p7a.mjs` T10 measures the real number over the sampled world rather than
// trusting it — a lattice point can still be lost to a keep-out circle.
//
// The two residue classes are DISJOINT BY CONSTRUCTION (0 mod 3 can never equal 1 mod 3), so a
// chunk is never both a CHARGE cell and a WORKSHOP cell and neither lattice ever has to be shifted
// out of the other's way. Shifting was the first draft and it cost the guarantee 256 m.
export const LATTICE = { step: 3, charge: [0, 0], workshop: [1, 2] };

const mod = (a, n) => ((a % n) + n) % n;

// Pad kinds are intrinsic to the world. The *displayed* zone type is a function of the kind plus
// what the player is currently doing (§7.1's table has PICKUP and DROP, which are ROLES — the same
// courier pad is a PICKUP when you are collecting from it and a DROP when it is your destination).
export const KIND = { PAD: 'PAD', CHARGE: 'CHARGE', WORKSHOP: 'WORKSHOP', HUB: 'HUB' };

const CLIENT_SALT = 0x51e4;              // §7.1's client<->pad assignment
const RUSH_CHANCE = 0.12;                // §7.4.5: at most one on a board, and only from tier 3

// ── §7.1's "or a ledge" — a CANTILEVERED DECK, not a point inside the tower ─────────────────
//
// THE DEFECT THIS REPLACES. The first version of `_site()` returned the building CENTRE for both
// pad kinds and changed only the height: a roof pad at `h + 1.2` (clear) and a ledge pad at
// `0.42 h`. Collision does not know about a prototype's setbacks — `render_city.js` builds ONE
// AABB per building, the full `w x d` footprint extruded from y = 0 to y = h — so `0.42 h` is
// inside the mass by construction. Measured over a 13x13 chunk block: 21 of 21 ledge pad centres
// inside solid geometry, 0 of 45 roof pads. About a third of every pad in the city, CHARGE and
// WORKSHOP included, could not be docked at: placed at the centre, §6.3's collision softening
// pushes the craft out through the nearest face and the proximity term keeps it there.
//
// **Why a shelf on the real geometry cannot work.** `blocks.js` does have genuine setbacks —
// `podium`'s deck at 0.30 h, `bridged`'s sky bridge at 0.60 h — but collision sees none of them,
// and the widest of them is ~9 m of free surface on a building whose footprint is capped at 38 m
// by §3.1's 51.2 m lot. A 14 m-radius docking cylinder does not fit on any ledge this city
// contains. The choice was therefore between deleting the ledge kind and putting the pad OUTSIDE
// the mass; outside is what an actual pad bracketed off a tower looks like, it keeps a third of
// the city's pads, and it is the only one of the two that gives varied approaches.
//
// `OUT` is measured from the FACADE, and it is > `FLIGHT.REPEL_RANGE` (12 m) on purpose: at the
// pad centre the parent tower contributes exactly zero proximity repulsion, so a craft can hold
// station there for §7.2's 0.6 s. `CLEAR` applies the same 12 m + margin to every OTHER mass that
// reaches the pad's height, which is also what keeps the vertical descent column open.
export const LEDGE = {
  OUT: 15,          // m from the facade to the pad centre
  CLEAR: 13,        // m of required horizontal clearance to any mass that reaches the pad height
  MIN_H: 60,        // only a tower gets one
  CHANCE: 0.38,     // of the towers that qualify
  BAND: [0.30, 0.62], // fraction of the tower's height the deck sits at
  MIN_Y: 24,        // never lower than this, so a deck is never at street level
  DECK_W: 24,       // the drawn deck's width; visual only, see createZoneVisuals
};
const LEDGE_SALT = 0x1ed6;

// The four faces, in a fixed order. A pad is placed off the first one that clears.
const FACES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class ZoneField {
  // `city` is a CityModel. `clients` is data/clients.json's `clients` array — its LENGTH is the
  // client count and nothing here contains the literal 16 (T8).
  constructor({ city, clients, hub = null }) {
    this.city = city;
    this.clients = clients || [];
    this.seed = city.seed | 0;
    this._pads = new Map();              // 'cx,cz' -> pad | null
    this._nulls = 0;

    // The HUB is one fixed pad on the spindle's podium deck (§7.1), not the bare world origin.
    const sp = hub || (city.spawn && city.spawn.pos) || [40, 92, 30];
    this.hubChunk = [Math.floor(sp[0] / CHUNK), Math.floor(sp[2] / CHUNK)];
    this.hubPos = [sp[0], sp[1], sp[2]];
  }

  key(cx, cz) { return cx + ',' + cz; }

  isChargeCell(cx, cz) {
    return mod(cx, LATTICE.step) === LATTICE.charge[0] && mod(cz, LATTICE.step) === LATTICE.charge[1];
  }
  isWorkshopCell(cx, cz) {
    return mod(cx, LATTICE.step) === LATTICE.workshop[0] && mod(cz, LATTICE.step) === LATTICE.workshop[1];
  }

  // ── the one placement function ───────────────────────────────────────────
  // Deterministic in (cx, cz, worldSeed) and nothing else. No pad state is ever stored, exactly
  // like §2.4 bucket 2 requires — the Map is a memo of a pure function.
  padAt(cx, cz) {
    const k = this.key(cx, cz);
    if (this._pads.has(k)) return this._pads.get(k);
    const pad = this._build(cx, cz);
    this._pads.set(k, pad);
    if (!pad) this._nulls++;
    return pad;
  }

  _build(cx, cz) {
    const isHub = cx === this.hubChunk[0] && cz === this.hubChunk[1];
    const district = this.city.districtAt(cx, cz);

    if (isHub) {
      return this._pad({
        cx, cz, kind: KIND.HUB, district,
        x: this.hubPos[0], y: this.hubPos[1], z: this.hubPos[2],
        charge: true, landmark: 'spindle',
      });
    }

    let kind = null;
    if (this.isWorkshopCell(cx, cz)) kind = KIND.WORKSHOP;
    else if (this.isChargeCell(cx, cz)) kind = KIND.CHARGE;

    const rng = xorshift32(hash2i(cx, cz, this.seed ^ ZONE_SALT));
    const roll = rng();
    if (!kind && roll >= PAD_CHANCE) return null;      // §7.1's 22 %

    const site = this._site(cx, cz, district, rng, kind);
    if (!site) return null;                             // dropped, never retried (§3.1.1)

    return this._pad({
      cx, cz, kind: kind || KIND.PAD, district,
      x: site.x, y: site.y, z: site.z,
      charge: kind === KIND.CHARGE || kind === KIND.WORKSHOP,
      rush: !kind && rng() < RUSH_CHANCE,
      ledge: site.ledge,
      face: site.face, out: site.out, anchor: site.anchor, mass: site.mass,
    });
  }

  // ── clearance ────────────────────────────────────────────────────────────
  // The minimum HORIZONTAL distance from (x, z) to the collision AABB of any building that
  // reaches height `y`. This is deliberately the same predicate `render_city.js` builds its AABBs
  // from — one box per building, the full footprint extruded from the ground to `h` — because a
  // clearance computed against the pretty geometry and a repulsion computed against the boxes
  // would disagree, and the boxes are the ones that push the craft around.
  //
  // A building SHORTER than the pad is not an obstacle: you descend past it. A building taller
  // than the pad and inside `CLEAR` blocks both the hover and the descent column, so one test
  // covers both.
  //
  // Cost: the query box is +-(CLEAR + 40) m, which is 53 m against a 256 m chunk, so it spans at
  // most 2 chunks per axis. `generateChunk` is memoised in city.js, and the pad's own chunk is
  // already generated by the caller.
  _clearance(x, y, z, reach = LEDGE.CLEAR) {
    const R = reach + 40;                              // + the largest half-footprint a lot allows
    const c0x = Math.floor((x - R) / CHUNK), c1x = Math.floor((x + R) / CHUNK);
    const c0z = Math.floor((z - R) / CHUNK), c1z = Math.floor((z + R) / CHUNK);
    let best = Infinity;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        for (const b of this.city.generateChunk(cx, cz).buildings) {
          if (b.h < y) continue;                       // below the pad — you fly over it
          const ax0 = b.x - b.w / 2, ax1 = b.x + b.w / 2;
          const az0 = b.z - b.d / 2, az1 = b.z + b.d / 2;
          const dx = x < ax0 ? ax0 - x : x > ax1 ? x - ax1 : 0;
          const dz = z < az0 ? az0 - z : z > az1 ? z - az1 : 0;
          const d = Math.hypot(dx, dz);
          if (d < best) { best = d; if (best <= 0) return 0; }
        }
      }
    }
    return best;
  }

  // A pad always sits on a building roof or a ledge (§7.1), biased toward the district's tier —
  // a licence-6 district puts its pads high up the towers, a licence-1 district keeps them low.
  // Landmark parts are NOT candidates: their footprints are inside their own keep-out circle, and
  // §3.1.1 applies the keep-out to zone pads as well as to buildings.
  _site(cx, cz, district, rng, kind) {
    const rec = this.city.generateChunk(cx, cz);
    const cand = [];
    for (const b of rec.buildings) {
      if (b.landmark) continue;
      if (Math.min(b.w, b.d) < VOLUME.radius * 1.6) continue;   // the volume must fit the roof
      cand.push(b);
    }
    if (!cand.length) return null;
    cand.sort((a, b) => b.h - a.h || a.x - b.x);

    // pow bias: tier 1 samples the whole stack, tier 6 hugs the tallest.
    const tier = district.tier || 1;
    const u = rng();
    const i0 = clamp(Math.floor(Math.pow(u, 1 + tier * 0.42) * cand.length), 0, cand.length - 1);

    // A ROOF pad can be buried too, and it was: 1 of 45 sampled roof pads sat under a TALLER
    // neighbour whose footprint covers the chosen roof. Walk outward from the biased index to the
    // first candidate whose roof is genuinely open. No extra rng() is drawn, so the stream — and
    // therefore every other pad in the city — is untouched by this scan.
    let b = null;
    for (let k = 0; k < cand.length && !b; k++) {
      for (const i of (k === 0 ? [i0] : [i0 - k, i0 + k])) {
        if (i < 0 || i >= cand.length) continue;
        const c = cand[i];
        if (this._clearance(c.x, c.h + 1.2, c.z, 0) > 0) { b = c; break; }
      }
    }
    if (!b) return null;

    // The ledge roll is drawn from the SAME stream and in the same place as before, so a pad that
    // was a roof pad is still a roof pad and `rush` is unchanged. Only where a ledge lands moved.
    const wantLedge = b.h > LEDGE.MIN_H && rng() < LEDGE.CHANCE;

    // §3.1.1 item 4 — the keep-out, applied to the PAD, not to the building it stands on.
    const keep = this.city.keepOutNear(cx, cz);
    const outsideKeepOut = (x, z) => {
      for (const l of keep) {
        const dx = x - l.x, dz = z - l.z;
        if (dx * dx + dz * dz < (l.radius + VOLUME.radius) ** 2) return false;
      }
      return true;
    };
    if (!outsideKeepOut(b.x, b.z)) return null;

    if (wantLedge) {
      const site = this._ledgeSite(cx, cz, b, outsideKeepOut);
      if (site) return site;                            // else fall through to the roof
    }
    return { x: b.x, y: b.h + 1.2, z: b.z, ledge: false, face: null, out: 0, anchor: null };
  }

  // A cantilevered deck off one face of `b`, or null if no face has the room. Deterministic in
  // (cx, cz, worldSeed) through its OWN hash rather than the caller's `rng` stream — a placement
  // scheme that consumed a variable number of draws would shift `rush` and every later pad in the
  // chunk, which is a much larger change than this defect warrants.
  _ledgeSite(cx, cz, b, outsideKeepOut) {
    const r = xorshift32(hash2i(cx, cz, this.seed ^ LEDGE_SALT));
    const f = LEDGE.BAND[0] + r() * (LEDGE.BAND[1] - LEDGE.BAND[0]);
    const y = Math.max(LEDGE.MIN_Y, Math.round(b.h * f));
    const start = Math.floor(r() * FACES.length) % FACES.length;
    for (let i = 0; i < FACES.length; i++) {
      const [fx, fz] = FACES[(start + i) % FACES.length];
      const half = fx ? b.w / 2 : b.d / 2;
      const x = b.x + fx * (half + LEDGE.OUT);
      const z = b.z + fz * (half + LEDGE.OUT);
      if (!outsideKeepOut(x, z)) continue;
      if (this._clearance(x, y, z) < LEDGE.CLEAR) continue;
      return {
        x, y, z, ledge: true,
        face: Math.atan2(fx, fz),                      // yaw of the outward normal, for the deck
        out: LEDGE.OUT,
        anchor: [b.x + fx * half, b.z + fz * half],    // where the deck meets the facade
        mass: [b.x, b.z],                              // the tower's centre — where the OLD (broken)
                                                       // placement put the pad. Gates use it as a
                                                       // control: a craft put there must NOT hold.
      };
    }
    return null;
  }

  _pad(p) {
    const d = p.district;
    const pad = {
      key: this.key(p.cx, p.cz),
      cx: p.cx, cz: p.cz,
      kind: p.kind,
      x: p.x, y: p.y, z: p.z,
      district: d.id,
      districtName: this.city.districtName(d.id),
      tier: d.tier,
      name: this.city.padName(p.cx, p.cz),
      charge: !!p.charge,
      rush: !!p.rush,
      ledge: !!p.ledge,
      // Only a ledge pad carries these; the deck renderer and the autopilot's final approach are
      // the only consumers.
      face: p.face === undefined ? null : p.face,
      out: p.out || 0,
      anchor: p.anchor || null,
      mass: p.mass || null,
      landmark: p.landmark || null,
      clientId: null,
    };
    // §7.1's client<->pad assignment: derived from the world seed, never stored, so it survives a
    // reload exactly like the buildings do. Reads clients.length; no literal count anywhere.
    if (this.clients.length) {
      pad.clientId = this.clients[hash2i(p.cx, p.cz, CLIENT_SALT) % this.clients.length].id;
    }
    return pad;
  }

  // ── queries ─────────────────────────────────────────────────────────────
  // Every query walks the chunk lattice; nothing is precomputed, so an unbounded city stays
  // unbounded. A 2.4 km radius is 19x19 chunks = 361 padAt() calls, all memoised.
  padsInRadius(x, z, radius, filter = null, out = []) {
    out.length = 0;
    const c0x = Math.floor((x - radius) / CHUNK), c1x = Math.floor((x + radius) / CHUNK);
    const c0z = Math.floor((z - radius) / CHUNK), c1z = Math.floor((z + radius) / CHUNK);
    const r2 = radius * radius;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const p = this.padAt(cx, cz);
        if (!p) continue;
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz > r2) continue;
        if (filter && !filter(p)) continue;
        out.push(p);
      }
    }
    return out;
  }

  // Pads whose horizontal range from (x,z) falls inside [minKm, maxKm]. §7.4.5's drop band.
  padsInBand(x, z, minKm, maxKm, filter = null) {
    const out = [];
    const rMax = maxKm * 1000, rMin = minKm * 1000;
    const c0x = Math.floor((x - rMax) / CHUNK), c1x = Math.floor((x + rMax) / CHUNK);
    const c0z = Math.floor((z - rMax) / CHUNK), c1z = Math.floor((z + rMax) / CHUNK);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const p = this.padAt(cx, cz);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < rMin || d > rMax) continue;
        if (filter && !filter(p)) continue;
        out.push(p);
      }
    }
    return out;
  }

  // ── the cheap half of padsInBand ────────────────────────────────────────
  // A tier-6 job's 6 km band covers 2,209 chunks, and `padsInBand` materialises every one of them
  // — 9 ms cold, and worse, it blows straight through city.js's 900-entry descriptor cache, which
  // clears WHOLESALE and hands the renderer a cold cache on the next stream-in. §3.11's ms.gen
  // gate is 1.4 ms; a docking panel is not allowed to cost the frame budget a chunk rebuild.
  //
  // Both filters that matter can be answered WITHOUT generating anything: a pad is at most
  // CHUNK/sqrt2 = 181 m from its chunk centre, and `districtAt` is a noise lookup. So the band and
  // the licence filter run on chunk coordinates, and only the survivors are ever materialised.
  chunksInBand(x, z, minKm, maxKm, districtOk = null) {
    const rMax = maxKm * 1000, rMin = minKm * 1000;
    const tol = CHUNK * Math.SQRT1_2 * 0.5 + VOLUME.radius;
    const out = [];
    const c0x = Math.floor((x - rMax) / CHUNK), c1x = Math.floor((x + rMax) / CHUNK);
    const c0z = Math.floor((z - rMax) / CHUNK), c1z = Math.floor((z + rMax) / CHUNK);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const d = Math.hypot(cx * CHUNK + CHUNK / 2 - x, cz * CHUNK + CHUNK / 2 - z);
        if (d > rMax + tol || d < rMin - tol) continue;
        if (districtOk && !districtOk(this.city.districtAt(cx, cz))) continue;
        out.push([cx, cz]);
      }
    }
    return out;
  }

  // Deterministic single pick from a band. Walks the candidate chunks in a hash-ordered
  // permutation and materialises them one at a time, so the expected cost is a handful of
  // generateChunk calls rather than the whole annulus. Returns { pad, probes, candidates }.
  pickPadInBand(x, z, minKm, maxKm, { districtOk = null, filter = null, salt = 0, maxProbe = 96 } = {}) {
    const chunks = this.chunksInBand(x, z, minKm, maxKm, districtOk);
    if (!chunks.length) return { pad: null, probes: 0, candidates: 0 };
    // A stable pseudorandom permutation: sort by a hash of the chunk and the caller's salt.
    chunks.sort((a, b) => hash2i(a[0], a[1], salt) - hash2i(b[0], b[1], salt));
    const rMin = minKm * 1000, rMax = maxKm * 1000;
    let probes = 0;
    for (const [cx, cz] of chunks) {
      if (probes >= maxProbe) break;
      probes++;
      const p = this.padAt(cx, cz);
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < rMin || d > rMax) continue;
      if (filter && !filter(p)) continue;
      return { pad: p, probes, candidates: chunks.length };
    }
    return { pad: null, probes, candidates: chunks.length };
  }

  nearest(x, z, filter = null, maxRadius = 3000) {
    let best = null, bestD = Infinity;
    for (let r = CHUNK * 2; r <= maxRadius; r *= 2) {
      const list = this.padsInRadius(x, z, r, filter);
      for (const p of list) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) break;
    }
    return best ? { pad: best, dist: bestD } : null;
  }

  nearestCharge(x, z) { return this.nearest(x, z, p => p.charge); }

  // ── display type (§7.1) ─────────────────────────────────────────────────
  // The role a pad reads as right now. CHARGE/WORKSHOP/HUB are intrinsic; a courier pad is a DROP
  // when it is an active parcel's destination, a RUSH when it is lit (tier 3+, §7.4.5) and a
  // PICKUP otherwise. Colour AND glyph come from ONE table in config.js so a world volume, a
  // minimap dot and a panel can never disagree (§7.1's colour-blind rule).
  displayType(pad, { destKeys = null, tier = 1 } = {}) {
    if (pad.kind === KIND.HUB) return 'HUB';
    if (pad.kind === KIND.CHARGE) return 'CHARGE';
    if (pad.kind === KIND.WORKSHOP) return 'WORKSHOP';
    if (destKeys && destKeys.has && destKeys.has(pad.key)) return 'DROP';
    if (pad.rush && tier >= 3) return 'RUSH';
    return 'PICKUP';
  }

  // What the minimap, the HUD markers and the volume renderer all consume. One shape, one source.
  zonesNear(x, z, radius, ctx = {}) {
    const out = [];
    for (const p of this.padsInRadius(x, z, radius)) {
      const type = this.displayType(p, ctx);
      const t = ZONE_TYPES[type];
      out.push({
        key: p.key, type, glyph: t.glyph, color: t.color, label: t.label,
        x: p.x, y: p.y, z: p.z, name: p.name, district: p.districtName,
        tier: p.tier, charge: p.charge, kind: p.kind, ledge: p.ledge,
        face: p.face, out: p.out, anchor: p.anchor,
        dist: Math.hypot(p.x - x, p.z - z),
      });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  // §7.2's entry test is three conditions and all three must hold. It lives here rather than in
  // main.js so a gate can exercise it without a renderer.
  canDock(pad, { x, z, y, speed, held }) {
    if (!pad) return false;
    const dx = pad.x - x, dz = pad.z - z;
    const inside = dx * dx + dz * dz <= VOLUME.radius * VOLUME.radius
      && y >= pad.y - 2 && y <= pad.y + VOLUME.height;
    return inside && speed < 3.5 && held >= 0.6;
  }

  stats() {
    let pads = 0, charge = 0, workshop = 0, hub = 0, rush = 0, ledge = 0;
    for (const p of this._pads.values()) {
      if (!p) continue;
      if (p.kind === KIND.PAD) pads++;
      if (p.kind === KIND.CHARGE) charge++;
      if (p.kind === KIND.WORKSHOP) workshop++;
      if (p.kind === KIND.HUB) hub++;
      if (p.rush) rush++;
      if (p.ledge) ledge++;
    }
    return { pads, charge, workshop, hub, rush, ledge, empty: this._nulls, visited: this._pads.size };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// THE VISUAL LAYER — browser only. THREE is injected, never imported, so the analytic half of
// this file still loads in node. **UNTESTED IN A BROWSER as of P7a**: main.js is another agent's
// file this phase, so nothing calls this yet. See docs/P7A_WIRING.md.
//
// Draw calls, which are the budget that matters (§3.8): two InstancedMesh (cylinder + ground
// ring) cover every drawn volume in 2 draws regardless of count, one glyph plane per drawn volume
// (up to Q.zonesDrawn, 3 on HIGH), and the world marker is 2 — 7 worst case, as originally built.
//
// **P7b adds an 8th, and only sometimes.** The ledge-pad fix moves a ledge pad OUTSIDE its tower,
// so it needs a deck under it or it is a ring hanging in clear air. That is one more InstancedMesh
// covering every drawn ledge deck, and it is `visible = false` at count 0 — so the layer costs 6
// draws in the common case, exactly as measured at integration, and 7 with one ledge pad nearby.
// ───────────────────────────────────────────────────────────────────────────

export function createZoneVisuals(THREE, { Q, scene }) {
  const N = Math.max(1, Q.zonesDrawn | 0);

  // §7.1's scrolling vertical gradient — a 32x256 canvas, brightest at the base, so the column
  // reads as light rising off the pad rather than as a tube.
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 256;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0.00, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 256);
  for (let i = 0; i < 6; i++) {                       // the six pillar strips, baked into the map
    g.fillStyle = 'rgba(255,255,255,0.30)';
    g.fillRect(Math.round(i * 32 / 6) + 1, 0, 2, 256);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);

  const cylGeo = new THREE.CylinderGeometry(VOLUME.radius, VOLUME.radius, VOLUME.height, 20, 1, true);
  cylGeo.translate(0, VOLUME.height / 2, 0);
  const cylMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, opacity: 0.55,
  });
  const cyl = new THREE.InstancedMesh(cylGeo, cylMat, N);
  cyl.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cyl.frustumCulled = false;
  cyl.count = 0;

  const ringGeo = new THREE.RingGeometry(VOLUME.radius * 0.82, VOLUME.radius, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, opacity: 0.9,
  });
  const ring = new THREE.InstancedMesh(ringGeo, ringMat, N);
  ring.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ring.frustumCulled = false;
  ring.count = 0;

  // One glyph texture per zone TYPE, drawn once. §7.1's rule again: the glyph goes everywhere the
  // colour goes, so the world volume carries the same character the minimap dot does.
  const glyphTex = {};
  function glyphFor(type) {
    if (glyphTex[type]) return glyphTex[type];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = '#fff';
    x.font = '600 44px system-ui, -apple-system, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(ZONE_TYPES[type].glyph, 32, 34);
    const t = new THREE.CanvasTexture(c);
    glyphTex[type] = t;
    return t;
  }

  const glyphGeo = new THREE.PlaneGeometry(7, 7);
  const glyphs = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(glyphGeo, new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95,
    }));
    m.visible = false;
    m.frustumCulled = false;
    glyphs.push(m);
  }

  // ── the ledge deck ───────────────────────────────────────────────────────
  // A cantilevered ledge pad is OUTSIDE the tower by construction (that is the whole fix), so
  // without this it is a glowing ring floating in clear air beside a facade. One InstancedMesh —
  // the layer costs a 7th draw only on frames where a ledge pad is among the nearest `N`, and
  // nothing at all otherwise, because `visible` is false at count 0.
  //
  // Local space: the origin is where the deck meets the facade, at the pad's height; +Z runs
  // outward. Vertex colour carries the dark/bright split so the slab and its lit rim are ONE
  // geometry: material colour x vertex colour x instance colour, and the instance colour is the
  // zone tint, so a CHARGE deck is amber and a HUB deck is ice without a second material.
  const deck = (() => {
    const P = [], NM = [], CO = [], IX = [];
    const box = (x0, y0, z0, x1, y1, z1, c) => {
      const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      const faces = [[4, 5, 6, 7, 0, 1, 0], [3, 2, 1, 0, 0, -1, 0], [7, 6, 2, 3, 0, 0, 1],
        [5, 4, 0, 1, 0, 0, -1], [6, 5, 1, 2, 1, 0, 0], [4, 7, 3, 0, -1, 0, 0]];
      for (const f of faces) {
        const b = P.length / 3;
        for (let k = 0; k < 4; k++) { P.push(...v[f[k]]); NM.push(f[4], f[5], f[6]); CO.push(c, c, c); }
        IX.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    };
    const HW = LEDGE.DECK_W / 2, FAR = LEDGE.OUT + 12, DARK = 0.10, LIT = 1.0;
    box(-HW, -2.4, 0, HW, -1.2, FAR, DARK);                      // the slab
    box(-2.2, -7.4, 0, 2.2, -2.4, FAR * 0.55, DARK);             // the bracket into the facade
    box(-HW, -1.25, FAR - 0.7, HW, -0.95, FAR, LIT);             // outer lip
    box(-HW, -1.25, 1.0, -HW + 0.7, -0.95, FAR, LIT);            // side rails
    box(HW - 0.7, -1.25, 1.0, HW, -0.95, FAR, LIT);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(NM, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(CO, 3));
    g.setIndex(IX);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const m = new THREE.InstancedMesh(g, mat, N);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0; m.visible = false;
    return { mesh: m, geo: g, mat };
  })();

  // §7.1's world marker: a light column at the ACTIVE job's destination, depthTest false at 0.14
  // so it is visible THROUGH buildings, plus a brighter segment for the part in line of sight.
  const markGeo = new THREE.CylinderGeometry(1.6, 1.6, 1, 8, 1, true);
  markGeo.translate(0, 0.5, 0);
  const markThrough = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.14, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const markSolid = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.85, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  markThrough.renderOrder = 12; markSolid.renderOrder = 13;
  markThrough.visible = markSolid.visible = false;
  markThrough.frustumCulled = markSolid.frustumCulled = false;

  const group = new THREE.Group();
  group.name = 'zones';
  group.add(cyl, ring, deck.mesh, ...glyphs, markThrough, markSolid);
  (scene || {}).add && scene.add(group);

  const M = new THREE.Matrix4();
  const C = new THREE.Color();
  let t = 0;

  const Q4 = new THREE.Quaternion();
  const V3 = new THREE.Vector3();
  const S3 = new THREE.Vector3(1, 1, 1);
  const AXIS = new THREE.Vector3(0, 1, 0);

  return {
    group, cyl, ring, deck: deck.mesh, glyphs, marker: { through: markThrough, solid: markSolid },

    // `zones` is ZoneField.zonesNear()'s output, already distance sorted. `marker` is the active
    // job's destination or null.
    update(dt, camera, zones, marker) {
      t += dt;
      tex.offset.y = (tex.offset.y - 0.25 * dt) % 1;    // §7.1's scroll

      const n = Math.min(N, zones.length);
      let inside = false;
      let nd = 0;
      for (let i = 0; i < n; i++) {
        const z = zones[i];
        M.makeTranslation(z.x, z.y, z.z);
        cyl.setMatrixAt(i, M);
        ring.setMatrixAt(i, M);
        C.setHex(z.color);
        cyl.setColorAt(i, C);
        ring.setColorAt(i, C);

        // The deck, for a cantilevered ledge pad only. `anchor` is the point on the facade the
        // deck grows from and `face` is the yaw of its outward normal — both come straight off
        // the placement, so the deck can never sit somewhere the pad is not.
        if (z.ledge && z.anchor) {
          Q4.setFromAxisAngle(AXIS, z.face || 0);
          V3.set(z.anchor[0], z.y, z.anchor[1]);
          M.compose(V3, Q4, S3);
          deck.mesh.setMatrixAt(nd, M);
          deck.mesh.setColorAt(nd, C);
          nd++;
        }
        const gm = glyphs[i];
        gm.visible = true;
        gm.position.set(z.x, z.y + VOLUME.glyphY, z.z);
        gm.material.map = glyphFor(z.type);
        gm.material.color.setHex(z.color);
        gm.material.needsUpdate = true;
        if (camera) gm.quaternion.copy(camera.quaternion);

        // Camera inside this cylinder: the near wall is behind you and drawing it doubles the fill
        // on the one frame the volume covers the screen (§7.1).
        if (camera) {
          const dx = camera.position.x - z.x, dz = camera.position.z - z.z;
          if (dx * dx + dz * dz < VOLUME.radius * VOLUME.radius
            && camera.position.y > z.y - 2 && camera.position.y < z.y + VOLUME.height) inside = true;
        }
      }
      for (let i = n; i < N; i++) glyphs[i].visible = false;
      deck.mesh.count = nd;
      deck.mesh.visible = nd > 0;
      if (nd) {
        deck.mesh.instanceMatrix.needsUpdate = true;
        if (deck.mesh.instanceColor) deck.mesh.instanceColor.needsUpdate = true;
      }
      cyl.count = ring.count = n;
      cyl.instanceMatrix.needsUpdate = ring.instanceMatrix.needsUpdate = true;
      if (cyl.instanceColor) cyl.instanceColor.needsUpdate = true;
      if (ring.instanceColor) ring.instanceColor.needsUpdate = true;
      cylMat.side = inside ? THREE.FrontSide : THREE.DoubleSide;

      if (marker) {
        const h = Math.max(60, marker.y + 240);
        for (const m of [markThrough, markSolid]) {
          m.visible = true;
          m.position.set(marker.x, 0, marker.z);
          m.scale.set(1, h, 1);
          m.material.color.setHex(marker.color === undefined ? 0x6cff9c : marker.color);
        }
        markSolid.scale.set(0.7, Math.min(h, marker.y + 40), 0.7);
      } else {
        markThrough.visible = markSolid.visible = false;
      }
    },

    // T7's rule: every layer that can contaminate a gate's isolation must be hideable.
    setVisible(v) { group.visible = !!v; },

    // §S2-E — Aaron asked for this by name: *"Make the white/coloured transparent docking cylinder
    // almost invisible for the cutscene."* ALMOST, not off: the craft is parked ON a pad and a pad
    // with no volume at all reads as a mistake rather than as a mood. `k` scales the three
    // additive materials' opacity off their shipped values, so restoring is `setDim(1)` and there
    // is no second copy of the numbers to drift.
    setDim(k) {
      const v = k === null || k === undefined ? 1 : Math.max(0, Math.min(1, +k));
      cylMat.opacity = 0.55 * v;
      ringMat.opacity = 0.9 * v;
      for (const m of glyphs) m.material.opacity = 0.85 * v;
      // NOT the ledge deck. That is a physical slab with a lit rim, not a glow, and it is opaque
      // (`MeshBasicMaterial` with no `transparent`) — writing `opacity` on it would have changed
      // nothing at all and read in the diff as if it had. Aaron asked for the *cylinder* to go.
      return v;
    },

    dispose() {
      cylGeo.dispose(); ringGeo.dispose(); glyphGeo.dispose(); markGeo.dispose();
      cylMat.dispose(); ringMat.dispose(); tex.dispose();
      deck.geo.dispose(); deck.mat.dispose();
      for (const k in glyphTex) glyphTex[k].dispose();
      for (const m of glyphs) m.material.dispose();
      markThrough.material.dispose(); markSolid.material.dispose();
    },
  };
}
