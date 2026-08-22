// S2-H — street level. Shopfronts along the ground floor of the city's commercial buildings:
// eateries and food stores with the lights on, a fascia sign over the glass, and Aaron's venetian
// blind deciding when the room behind the glass is worth paying for.
//
// ── the shape of it, and why ───────────────────────────────────────────────
//
// ONE QUAD IS ONE SHOP, AND THE WHOLE LAYER IS ONE DRAW. Every shopfront in the city is an
// instance in a single `Field`, exactly the architecture §3.2 imposes on the building fields and
// signage.js follows for its six. The fascia, its sign, the mullions, the door, the stall riser,
// the blind and the three-plane room behind it are all fragment-shader work inside that quad — see
// materials.js §11. No geometry per shop, no second material, no texture but the signage sheet the
// city already has resident.
//
// THE INTERIOR IS PAID FOR RARELY — AND WHAT THAT SAVES IS UNMEASURED ON A MAC. The room is
// evaluated only when the blind is open, and the blind opens on angle AND distance AND facing, so
// flying the city at 60 m looks down on every shopfront in it and the steady state is a lit face
// and a handful of ALU. That is the design, and it is Aaron's.
//
// It is NOT a measured saving on this machine, and this comment will not pretend otherwise.
// `__state.ms.frame` is CPU wall time around the loop body, so it cannot see fragment cost at all
// while the GPU still finishes inside vsync — and it does: forcing every blind in a street-level
// frame OPEN against forcing them all SHUT moved the mean by -0.003 ms at 1.3 Mpx and -0.14 ms at
// 5.8 Mpx, both far inside a 0.4-0.8 ms within-arm spread, and at 13 Mpx (4800x2700) all three
// arms sat on 60.0 fps with a spread of 0.01. This M-series GPU is nowhere near saturated by it.
// The blind is a PHONE-class optimisation and a phone is the only place its saving can be shown.
// `__game.setShopRange(near, far)` is the live lever if it turns out not to be needed.
//
// PLACEMENT IS A HASH, NEVER A DRAW FROM THE CITY'S RNG. `city.js`'s determinism hash mixes the
// chunk's xorshift stream; one extra draw taken from it would move every building in the city.
// Every number here comes from a dedicated hash of the building's quantised world position, the
// same discipline districts.js's `paint()` and signage.js's `livingRoll` already keep. The golden
// city hash is provably untouched: `hashRegion` never sees any of this.
//
// A SHOP THAT DOES NOT FIT IS DROPPED, NEVER SHRUNK. §3.10 #4 makes physical size the game's
// distance ruler and a shopfront is a new rung on it: 5.6 m tall, 5.4-11.0 m wide, a 1.6 m fascia
// carrying a 4:1 sign whatever the shop is wide. A building whose ground-floor mass is under 6.2 m
// gets no shops at all rather than a squashed row of them.

import * as THREE from 'three';
import { Field } from './render_city.js';
import { protoBoxes } from './blocks.js';
import { shopMaterial, U } from './materials.js';
import { xorshift32, hash2i, hashf } from './utils.js';
import { byId } from './districts.js';

const AXIS_Y = new THREE.Vector3(0, 1, 0);

const SHOP_ATTRS = [
  { name: 'iRegion', size: 4 },      // the fascia sign's tile in the signage sheet
  { name: 'iEmissive', size: 3 },    // that sign's tint
  { name: 'iGlow', size: 3 },        // the light inside the shop
  { name: 'iShop', size: 4 },        // (width m, height m, seed, kind + 8 if the tile is a tube bake)
  { name: 'iChunk', size: 2 },       // §3.2.2's dither, shared with the LOD0 shell
];

const UNIT_H = 5.60;                 // a shopfront storey: 3.48 m of glass, 0.52 m riser, 1.6 m fascia
const MIN_GROUND = 6.20;             // the ground-floor mass must be this tall or the shops are dropped
const PROUD = 0.12;                  // how far the frontage stands off the wall
const EDGE = 1.10;                   // bare wall left at each corner — a shop must not wrap one
const WIDTHS = [5.4, 6.8, 6.8, 8.6, 8.6, 11.0];
const MAX_PER_FACE = 3;

// ── what a shop IS ─────────────────────────────────────────────────────────
//
// Aaron asked for "simple eateries or food stores", so those are the plurality everywhere and the
// rest are texture. `glow` is the light inside the room and `sign` the fascia tint; they are
// deliberately NOT the same colour — a ramen bar's window is warm and its sign is red, and that
// difference is most of what makes a row read as a row of different businesses.
//
// `glow` is deliberately LOW-SATURATION where the sign is not. It is a lamp, and the shader paints
// neutral surfaces with it, so a fully saturated value gives a room that reads as a coloured filter
// rather than as a lit interior. The saturated neon belongs on the fascia, which is a sign.
//
// Kind index 0-2 are eateries and 3-7 are stores; the shader reads that split for the counter,
// the hanging lamps and the chiller (materials.js `shopRoom`).
//
// The Japanese words are `board_ja`, NOT `blade_ja`. A fascia is 4:1 and a blade is 1:4, and the
// bake has 六 of one and six of the other — asking for ラーメン here got four silent fallbacks to
// an English board on the first run, which `state().missingWords` is there to report.
export const SHOP_KINDS = [
  { id: 'ramen',   words: ['RAMEN BAR', 'NOODLES', 'HOT FOOD', '営業中'],            glow: 0xffc07a, sign: 0xff3a2b },
  { id: 'tea',     words: ['TEA HOUSE', 'SUSHI', 'HOT FOOD', '入口'],                glow: 0xffe9d0, sign: 0xffb04a },
  { id: 'bar',     words: ['DRINKS', 'NIGHT MARKET', '営業中', '24時間'],             glow: 0xffa0b4, sign: 0xff2a9d },
  { id: 'grocer',  words: ['COLD STORE', 'NIGHT MARKET', 'IMPORTS', '24時間'],       glow: 0xdbe8ff, sign: 0x6bff8a },
  { id: 'pharm',   words: ['PHARMACY', 'CLINIC', '東区'],                            glow: 0xeef6ff, sign: 0x2bd0ff },
  { id: 'parts',   words: ['SPARE PARTS', 'TOOLS', 'SALVAGE', 'WIRE'],               glow: 0xffa24a, sign: 0xffb04a },
  { id: 'laundry', words: ['LAUNDRY', 'RENTALS', 'PAY HERE'],                        glow: 0xdbe8ff, sign: 0x9a6bff },
  { id: 'arcade',  words: ['ARCADE', 'SYNTH', 'DATA BANK'],                          glow: 0xc9a8ff, sign: 0x35e6ff },
];

// Weighted per district, the same idea as districts.js' MIX and for the same reason: a district
// has to READ as a place at street level too. The Ribs is a market, Pale Terrace is not.
const TRADE_MIX = {
  spine:   [[1, 26], [3, 22], [4, 16], [0, 16], [6, 12], [7, 8]],
  ribs:    [[0, 30], [3, 22], [2, 16], [1, 12], [5, 10], [6, 10]],
  vault:   [[4, 24], [1, 24], [3, 20], [0, 14], [7, 12], [6, 6]],
  soot:    [[5, 28], [0, 20], [3, 18], [2, 14], [6, 14], [4, 6]],
  lantern: [[2, 26], [0, 22], [7, 18], [1, 16], [3, 10], [4, 8]],
  cradle:  [[3, 28], [1, 22], [0, 18], [4, 16], [6, 10], [2, 6]],
  pale:    [[1, 32], [4, 24], [3, 22], [0, 16], [6, 6]],
  drown:   [[3, 26], [0, 24], [5, 18], [6, 16], [2, 12], [4, 4]],
};

// What fraction of buildings carry street trade at all. Higher than signage.js's COMMERCIAL,
// because a tower with no signage still has a chemist under it — but the ordering is the same, so
// a dark district stays dark at street level as well as above it.
const TRADE = {
  spine: 0.32, ribs: 0.62, vault: 0.24, soot: 0.48,
  lantern: 0.60, cradle: 0.38, pale: 0.16, drown: 0.52,
};

const TOTALS = Object.fromEntries(Object.entries(TRADE_MIX).map(([k, v]) => [k, v.reduce((s, e) => s + e[1], 0)]));

function pickKind(id, u) {
  const table = TRADE_MIX[id] || TRADE_MIX.spine;
  let a = u * TOTALS[id];
  for (const [k, w] of table) { a -= w; if (a <= 0) return k; }
  return table[0][0];
}

const lin = (hex, out) => out.setHex(hex).convertSRGBToLinear();

export class Shops {
  // `sa` is the signage sheet (js/signs.js) — the fascia signs come out of the atlas the city has
  // already paid for, so this layer ships no new bytes at all.
  constructor(Q, sa, noiseTex, keepMeta = false) {
    this.Q = Q;
    this.sa = sa;
    // Per-shop placement metadata for tools/gates_s2h.mjs, which re-derives every host wall from
    // blocks.js' OWN unit-space box list rather than trusting what this file thought it placed
    // against. OFF unless ?debug: it is one object per shop inside a work unit §3.2.3 caps at
    // 1.2 ms, and nothing in the game reads it.
    this.keepMeta = !!keepMeta;
    this.density = Q.shopDensity ?? 1;
    this.blockers = null;
    this.mat = shopMaterial(sa.tex, noiseTex);
    this.applyRange(Q);

    // Sized against the worst district standing in a HIGH 5x5 ring, MEASURED rather than reasoned
    // about: the peak over six districts is The Ribs at 3,852, so 5,600 is 1.45x the worst measured
    // ring. `state().peak` reports the high-water mark and `overflow` reports the drops, so a cap
    // that turns out to be wrong says so in a gate instead of silently deleting a street. At 32
    // floats an instance the whole field is 717 KB of typed array and 11,200 triangles.
    this.field = new Field('shops', new THREE.PlaneGeometry(1, 1), this.mat, 5600, SHOP_ATTRS);
    this.field.mesh.renderOrder = 0;
    this.mesh = this.field.mesh;

    // Region lookups resolved once. `find` returns null for a word the bake never produced, and a
    // null here would be a black fascia on every shop of that kind — so the fallback is explicit
    // and the misses are counted rather than swallowed.
    this.missing = [];
    this.regions = SHOP_KINDS.map(k => {
      const out = [];
      for (const w of k.words) {
        const r = sa.find('board_en', w) || sa.find('board_ja', w);
        if (r) out.push(r); else this.missing.push(w);
      }
      if (!out.length) out.push(sa.pick('board_en', 0.5));
      return out;
    });

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.stats = { shops: 0, buildings: 0, skippedShort: 0, rounds: 0, peak: 0, blockedByPortal: 0 };
    for (const k of SHOP_KINDS) this.stats[k.id] = 0;
  }

  applyQuality(Q) { this.Q = Q; this.density = Q.shopDensity ?? 1; this.applyRange(Q); }

  // The one number the frame budget moves on, so it is a preset value and not a constant.
  applyRange(Q) {
    const r = Q.shopRange || [58, 100];
    U.uShop.value.y = r[0];
    U.uShop.value.z = r[1];
  }

  flush() { this.field.flush(); }

  // Both arrays are checked independently: signage.js' own prepare() also touches the chunk record,
  // and a single `if (!rec.shQ)` guard let it create shQ first and leave shMeta undefined — which
  // threw on the first write of the first chunk and took the whole boot with it.
  prepare(rec) { if (!rec.shQ) rec.shQ = []; if (!rec.shMeta) rec.shMeta = []; }

  release(rec) {
    if (!rec.shQ) return;
    for (let i = rec.shQ.length - 1; i >= 0; i--) this.field.free(rec.shQ[i]);
    rec.shQ.length = 0;
    if (rec.shMeta) rec.shMeta.length = 0;
  }

  // ── one building's street frontage ───────────────────────────────────────

  // `blockers` is S2-N's tunnel-portal list for THIS building (js/tunnels.js). A portal and a
  // shopfront are both opaque panels standing off the same wall, so a shop that lands on one is
  // dropped rather than z-fought — the row simply steps over the doorway, which is what a real
  // street does. Absent or empty is the shipped behaviour.
  writeBuilding(rec, b, ccx, ccz, blockers = null) {
    this.blockers = blockers && blockers.length ? blockers : null;
    if (this.density <= 0) return;
    const d = byId[b.district];
    if (!d) return;
    const xi = Math.round(b.x * 4), zi = Math.round(b.z * 4);
    if (hashf(xi, zi, 0x51e0) >= (TRADE[d.id] ?? 0.3) * this.density) return;

    const boxes = protoBoxes(b.proto);
    if (!boxes) return;
    // Every mass that starts on the ground gets frontage, not just the largest — `bridged` is two
    // towers standing side by side and shopping only one of them leaves half a block blank.
    const ground = boxes.filter(bx => bx.y0 < 0.005 && !bx.round);
    const round = boxes.filter(bx => bx.y0 < 0.005 && bx.round);

    const rng = xorshift32(hash2i(xi, zi, 0x2c07));
    let placed = 0;
    // `drum` is 7 % of the mix and a drum with a dark base standing in a lit row is a hole, so its
    // ten facets get frontage too — one shop each, on the facet's own normal. Same arithmetic as
    // signage.js `roundFace`: the prism is scaled non-uniformly by (w, d), so the outward direction
    // is the ellipse normal and not the radius.
    for (const bx of round) {
      if (bx.y1 * b.h < MIN_GROUND) { this.stats.skippedShort++; continue; }
      this.stats.rounds++;
      const SIDES = 10, inr = 0.5 * Math.cos(Math.PI / SIDES);
      const facetW = Math.min(b.w, b.d) * Math.sin(Math.PI / SIDES);
      for (let i = 0; i < SIDES; i++) {
        const w = WIDTHS[(rng() * WIDTHS.length) | 0];
        if (w > facetW - 1.2) continue;
        const a = ((i + 0.5) / SIDES) * Math.PI * 2;
        const cx = Math.cos(a), sz = Math.sin(a);
        let nx = cx * b.d, nz = sz * b.w;
        const L = Math.hypot(nx, nz) || 1;
        nx /= L; nz /= L;
        const x = b.x + cx * inr * b.w + nx * PROUD;
        const z = b.z + sz * inr * b.d + nz * PROUD;
        if (this.write(rec, b, d, rng, x, z, Math.atan2(nx, nz), w, ccx, ccz,
                       { bx, face: 4 + i, nx, nz })) placed++;
      }
    }
    for (const bx of ground) {
      // §3.10 #4 — a shopfront is a fixed 5.6 m storey. A ground-floor mass too short to carry one
      // is dropped, never squashed to fit, exactly as signage.js drops a sign with no face.
      if (bx.y1 * b.h < MIN_GROUND) { this.stats.skippedShort++; continue; }
      const x0 = b.x + bx.x0 * b.w, x1 = b.x + bx.x1 * b.w;
      const z0 = b.z + bx.z0 * b.d, z1 = b.z + bx.z1 * b.d;
      for (let face = 0; face < 4; face++) {
        // The face convention is signage.js `flatFace`'s, verbatim, so the two layers cannot
        // disagree about which way a wall points.
        let nx = 0, nz = 0, yaw = 0, wall, aLo, aHi;
        if (face === 0) { nx = 1; yaw = Math.PI / 2; wall = x1; aLo = z0; aHi = z1; }
        else if (face === 1) { nx = -1; yaw = -Math.PI / 2; wall = x0; aLo = z0; aHi = z1; }
        else if (face === 2) { nz = 1; yaw = 0; wall = z1; aLo = x0; aHi = x1; }
        else { nz = -1; yaw = Math.PI; wall = z0; aLo = x0; aHi = x1; }
        placed += this.runFace(rec, b, d, rng, nx, nz, yaw, wall, aLo, aHi, ccx, ccz, bx, face);
      }
    }
    if (placed) this.stats.buildings++;
    if (this.field.n > this.stats.peak) this.stats.peak = this.field.n;
  }

  // One wall's worth of shops, packed left to right. Most abut — a terrace is what a street IS —
  // but a third of the gaps are wide, which is what leaves the blank stretches of dead frontage
  // that make the lit ones read as businesses rather than as a repeating strip.
  runFace(rec, b, d, rng, nx, nz, yaw, wall, aLo, aHi, ccx, ccz, bx, face) {
    let cursor = aLo + EDGE + rng() * 0.9;
    const limit = aHi - EDGE;
    let n = 0;
    while (n < MAX_PER_FACE) {
      const w = WIDTHS[(rng() * WIDTHS.length) | 0];
      if (cursor + w > limit) break;
      const a = cursor + w * 0.5;
      const px = nx !== 0 ? wall + nx * PROUD : a;
      const pz = nx !== 0 ? a : wall + nz * PROUD;
      if (!this.write(rec, b, d, rng, px, pz, yaw, w, ccx, ccz, { bx, face, nx, nz })) return n;
      cursor += w + (rng() < 0.32 ? 1.1 + rng() * 2.6 : 0.10);
      n++;
    }
    return n;
  }

  // A shop centre that lands on a tunnel mouth. The test is anisotropic on the PORTAL's own axes
  // — wide across its face, tight along its normal — because an isotropic radius large enough to
  // cover a 5.5 m doorway also deletes shops round the corner that were never in the way.
  onPortal(x, z, w) {
    if (!this.blockers) return false;
    for (const p of this.blockers) {
      const dAcross = p.axis === 0 ? z - p.z : x - p.x;      // across the portal's face
      const dAlong = p.axis === 0 ? x - p.x : z - p.z;       // out along its normal
      if (Math.abs(dAlong) < 2.2 && Math.abs(dAcross) < p.hw + w * 0.5 + 0.5) return true;
    }
    return false;
  }

  write(rec, b, d, rng, x, z, yaw, w, ccx, ccz, host) {
    if (this.onPortal(x, z, w)) { this.stats.blockedByPortal++; return true; }
    this.prepare(rec);
    const idx = rec.shQ.length;
    const slot = this.field.alloc(rec.shQ, idx);
    if (slot < 0) return false;
    rec.shQ.push(slot);

    this._q.setFromAxisAngle(AXIS_Y, yaw);
    this._p.set(x, UNIT_H * 0.5, z);
    this._s.set(w, UNIT_H, 1);
    this._m4.compose(this._p, this._q, this._s);
    this._m4.toArray(this.field.mesh.instanceMatrix.array, slot * 16);

    const k = pickKind(d.id, rng());
    const K = SHOP_KINDS[k];
    const pool = this.regions[k];
    const reg = pool[(rng() * pool.length) | 0];
    this.field.set('iRegion', slot, reg.u, reg.v, reg.w, reg.h);

    // 30 % of fascias take the district's own sign colour so a block still reads as one place,
    // the same 55/45 idea signage.js uses one storey up but weighted the other way — at street
    // level the businesses should out-shout the district, not the reverse.
    lin(rng() < 0.30 ? d.sign : K.sign, this._c);
    this.field.set('iEmissive', slot, this._c.r, this._c.g, this._c.b);

    lin(K.glow, this._c);
    // The interior light is jittered wide. Two ramen bars next door to each other are not the
    // same lamp, and a row at one value is the wallpaper this whole layer exists to avoid.
    const j = 0.62 + rng() * 0.62;
    this.field.set('iGlow', slot, this._c.r * j, this._c.g * j, this._c.b * j);

    // The tile's bake mode rides in the kind's high bit rather than in a sixth attribute: `tube`
    // regions are white marks that ARE the glow, `box` regions are a lit panel with dark artwork,
    // and drawing one as the other gives an inverted sign.
    this.field.set('iShop', slot, w, UNIT_H, rng() * 64, k + (reg.mode === 'tube' ? 8 : 0));
    this.field.set('iChunk', slot, ccx, ccz);
    this.field.touch(slot);

    this.stats.shops++;
    this.stats[K.id]++;
    if (this.keepMeta) {
      rec.shMeta.push({
        x, z, y: UNIT_H * 0.5, w, h: UNIT_H, yaw, nx: host.nx, nz: host.nz, face: host.face,
        proud: PROUD, kind: K.id, k, tube: reg.mode === 'tube', reg: reg.kind, text: reg.text || null,
        aspect: reg.aspect, proto: b.proto, bx: b.x, bz: b.z, bw: b.w, bh: b.h, bd: b.d,
        y0: host.bx.y0, y1: host.bx.y1, district: d.id, lm: b.landmark || null,
      });
    }
    return true;
  }

  // ── the gate surface ─────────────────────────────────────────────────────

  setVisible(on) { this.mesh.visible = !!on; return this.mesh.visible; }

  state() {
    return {
      n: this.field.n, cap: this.field.cap, overflow: this.field.overflow,
      tris: this.field.tris, density: this.density,
      visible: this.mesh.visible, missingWords: this.missing.slice(),
      stats: Object.assign({}, this.stats),
    };
  }

  breakdown() {
    return { field: 'shops', n: this.field.n, cap: this.field.cap, tris: this.field.tris * this.field.n };
  }

  dispose() { this.field.dispose(); this.mat.dispose(); }
}
