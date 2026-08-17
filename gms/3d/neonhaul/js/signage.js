// §3.5.4 / §3.5.5 / §3.10 — signage placement, edge strips, warning strobes, masts and bridges.
//
// SIX GLOBAL INSTANCED FIELDS, chunks owning slot ranges inside them, exactly the architecture
// §3.2 imposes on the building fields and for the same reason: one mesh per chunk would be 150
// draw calls before anything was lit. Everything here is written in §3.2.3's work units (3) and
// (4), from `rec.desc.buildings`, and freed with the chunk's LOD0 slots.
//
//   signsNeon   quad, additive        the sheet IS the glow           ~66 % of tiles
//   signsBox    quad, normal blend    a lit panel with dark artwork   ~34 % of tiles
//   heroes      quad, normal blend    three animated CanvasTextures   L5 only
//   strips      thin box, additive    roof lips, corners, ledges
//   strobes     billboard, additive   §3.10 #3, one every 60 m
//   structures  box, dark metal       masts, roof plant, sky bridges
//
// ── the two rules that carry the look ──────────────────────────────────────
//
// 1. BLADES STICK OUT PERPENDICULAR (§3.5.5 rule 1). A sign flush to a wall is invisible when you
//    fly parallel to that wall. A blade projecting off it is visible from everywhere and builds
//    the receding row down a canyon that makes the reference plates work.
// 2. SIGNAGE CLUSTERS, IT DOES NOT SPRINKLE (§3.5.5 rule 2). A building rolls ONE commercial flag
//    at a per-district rate; a commercial building carries 4-9 signs and a non-commercial one
//    carries zero. Dense blocks next to dark blocks — a uniform wash is the P3 failure mode.
//
// ── and the two that must not be weakened ──────────────────────────────────
//
// §3.2.2 part 2. Every emissive instance carries its chunk centre and ramps to nothing over the
// outer 15 % of the LOD0 band. That is in the shader (materials.js §6/§7), not here.
//
// §3.10 #4. SIGN TILES ARE FIXED PHYSICAL SIZES — street blades 3.2-5 m tall, facade boards 12-24 m
// wide, hero billboards 60-110 m — with the baked tile's aspect preserved, so apparent size is a
// direct read of distance. Nothing in this file may scale a sign up because it looks small at
// range; that breaks the same ruler §3.10 #1 protects, and with no people in the world the size
// bands are one of the few scale cues we have.

import * as THREE from 'three';
import { Field } from './render_city.js';
import { protoBoxes, PROTO_TRAITS } from './blocks.js';
import { signMaterial, stripMaterial, strobeMaterial, structureMaterial } from './materials.js';
import { heroCanvases } from './signs.js';
import { xorshift32, hash2i, clamp } from './utils.js';
import { byId } from './districts.js';

const AXIS_Y = new THREE.Vector3(0, 1, 0);

// The four instanced attributes §3.5.4 asks for, plus iIntensity and the §3.2.2 chunk centre.
const SIGN_ATTRS = [
  { name: 'iRegion', size: 4 },
  { name: 'iEmissive', size: 3 },
  { name: 'iSeed', size: 1 },
  { name: 'iChunk', size: 2 },
  { name: 'iIntensity', size: 1 },
  { name: 'iAnim', size: 1 },
];

const EMIS_ATTRS = [
  { name: 'iEmissive', size: 3 },
  { name: 'iSeed', size: 1 },
  { name: 'iChunk', size: 2 },
  { name: 'iIntensity', size: 1 },
];

const STRUCT_ATTRS = [{ name: 'iChunk', size: 2 }];

// Buildings per signage work unit. 9 keeps the worst unit near 0.5 ms (§3.2.3's cap is 1.2).
const SIGN_SLICE = 9;

// §3.5.5 rule 2. The plan pins ribs and lantern at 45 % and pale at 12 %; the rest are interpolated
// by what the district IS — Vault Row and Pale Terrace are corporate towers, the Drownings and
// Sootfields are markets and yards.
const COMMERCIAL = {
  spine: 0.26, ribs: 0.45, vault: 0.16, soot: 0.30,
  lantern: 0.45, cradle: 0.24, pale: 0.12, drown: 0.34,
};

// A sign is tinted at runtime from the greyscale sheet (§3.5.1). 55 % of tiles take the district's
// own sign colour so a block reads as one place; the rest come from the shared neon set so a block
// is a crowd of shops and not a corporate colourway.
const NEON = [0x35e6ff, 0xff2a9d, 0xffb04a, 0xffe9d0, 0xff3a2b, 0x6bff8a, 0x9a6bff, 0x2bd0ff];

// §3.5.5's five layers. `y` is the world height band, `proud` the stand-off from the face.
// P11 / ART_PASS item 2, option 1 — "raise hero count and spread them wider".
//
// §3.5.5 gave the L5 surface to `spire` and `bridged` only, which are 4 % and 6 % of the mix and
// which additionally demote below 260 m and 26 m — so the whole near ring carried 13 heroes and
// the skyline had no big signage anywhere the eye happened to be. Aaron's note is that ours
// "cluster around the middle of the range" and 746850_03 spans roughly 30x.
//
// So the surface is a PROBABILITY per prototype rather than a boolean. `spire` and `bridged` keep
// their near-certainty because they are rare and the plan gave them the role; the common masses
// get a low roll, which spreads heroes across the skyline instead of concentrating them on the
// two prototypes you almost never see. The face requirements in placeHero are unchanged — a
// building still has to HAVE a 70 m continuous face 18 m wide — so nothing is stretched to fit.
const HERO_CHANCE = { spire: 0.85, bridged: 0.85, slab: 0.10, terrace: 0.10, taper: 0.08, stack: 0.08 };
const heroChance = proto => HERO_CHANCE[proto] || 0;

const LAYERS = {
  1: { key: 'blade', y: [6, 30], proud: 1.20, perp: true },
  2: { key: 'board', y: [30, 180], proud: 0.40 },
  3: { key: 'panel', y: [20, 120], proud: 0.30 },
  4: { key: 'rule', y: [4, 1e9], proud: 0.15, onLip: true },
  5: { key: 'hero', y: [90, 620], proud: 1.00 },
};

// data/landmarks.json was authored before the sheet was baked and names six strings the bake never
// produced (HAUL CONTROL, UNDERSTACK, KILN, SEVER, LADDER, NINEFOLD) — data/signwords.json has no
// landmark block. Rather than drop the authored signage or ship six blank boards, each is aliased
// to the nearest baked word. Reported to the manager as a plan defect; the real fix is six more
// words in signwords.json and a re-bake, which is one command.
const TEXT_ALIAS = {
  'HAUL CONTROL': 'HAULAGE', UNDERSTACK: 'SECTOR 7', KILN: 'HOT FOOD',
  SEVER: 'NO ENTRY', LADDER: 'LEVEL 12', NINEFOLD: 'TOWER 9', OPEN: 'OPEN 24H',
};

const lin = (hex, out) => out.setHex(hex).convertSRGBToLinear();

export class Signage {
  constructor(scene, Q, sa, city, sky, noiseTex, keepMeta = false) {
    this.Q = Q; this.sa = sa; this.city = city;
    this.density = Q.signDensity;
    // Per-sign placement metadata for tools/gates_p3a.mjs. OFF unless ?debug: it is one object
    // per sign inside a work unit §3.2.3 caps at 1.2 ms, and nothing in the game reads it.
    this.keepMeta = !!keepMeta;

    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);

    this.hero = heroCanvases(0x5a17);
    this.heroFps = Q.holoFps > 0 ? 8 : 0;
    this.heroAcc = 0;

    this.matNeon = signMaterial(sa.tex, 'tube');
    this.matBox = signMaterial(sa.tex, 'box');
    // §3.5.4's fallback: with holo off the hero quads take the eight static `hero` sheet tiles.
    this.matHero = this.heroFps > 0 ? signMaterial(this.hero.tex, 'hero') : signMaterial(sa.tex, 'box');
    this.matStrip = stripMaterial();
    this.matStrobe = strobeMaterial();
    this.matStruct = structureMaterial(sky?.env, noiseTex);

    const quad = () => new THREE.PlaneGeometry(1, 1);
    const boxg = () => new THREE.BoxGeometry(1, 1, 1);

    // Caps are sized from the HIGH 5x5 ring standing in the WORST district for each field, not the
    // worst overall — the peaks are in different places, and a field that overflows drops instances
    // silently. Measured over a 5x5 ring in each district (tools/gates_p3a.mjs re-checks this):
    //   signsNeon / signsBox  Lantern Quarter, 45 % commercial   1560 / 480
    //   strips / structures   The Ribs, 720 buildings a ring     1972 / 1404
    //   strobes               Vault Row, 260-620 m towers        2785  ← every building over 180 m
    this.neon = this.add(new Field('signsNeon', quad(), this.matNeon, 2200, SIGN_ATTRS), 4);
    this.box = this.add(new Field('signsBox', quad(), this.matBox, 900, SIGN_ATTRS), 3);
    this.heroF = this.add(new Field('heroes', quad(), this.matHero, 160, SIGN_ATTRS), 3);   // P11 raised the hero roll; 48 overflows
    this.strip = this.add(new Field('strips', boxg(), this.matStrip, 2900, EMIS_ATTRS), 4);
    this.strobe = this.add(new Field('strobes', quad(), this.matStrobe, 4200, EMIS_ATTRS), 5);
    this.struct = this.add(new Field('structures', boxg(), this.matStruct, 2200, STRUCT_ATTRS), 0);

    this.fields = [this.neon, this.box, this.heroF, this.strip, this.strobe, this.struct];

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._cand = [];
    this._hit = { x: 0, y: 0, z: 0, yaw: 0, nx: 0, nz: 0, face: 0, box: null };
    this._q2 = { x: 0, y: 0, z: 0, yaw: 0, w: 0, h: 0, reg: null, anim: 0, off: 0, tint: 0,
      inten: 0, seed: 0, ccx: 0, ccz: 0, layer: 0, cls: '', kind: '', mode: '', b: null,
      face: 0, nx: 0, nz: 0, perp: false };
    this.stats = { blade: 0, board: 0, panel: 0, rule: 0, hero: 0, poster: 0, rejected: 0 };
  }

  add(f, order) {
    f.mesh.renderOrder = order;
    this.group.add(f.mesh);
    return f;
  }

  applyQuality(Q) {
    this.Q = Q;
    this.density = Q.signDensity;
    this.heroFps = Q.holoFps > 0 ? 8 : 0;
  }

  update(dt, t) {
    if (this.heroFps > 0 && this.heroF.n > 0) {
      this.heroAcc += dt;
      if (this.heroAcc >= 1 / this.heroFps) { this.heroAcc = 0; this.hero.draw(t); }
    }
  }

  flush() { for (const f of this.fields) f.flush(); }

  // ── slot ownership ───────────────────────────────────────────────────────

  prepare(rec) {
    if (!rec.sgN) {
      rec.sgN = []; rec.sgB = []; rec.sgH = [];
      rec.stS = []; rec.stO = []; rec.stR = [];
      rec.sgMeta = []; rec.stMeta = []; rec.sgAt = 0;
    }
  }

  release(rec) {
    if (!rec.sgN) return;
    const free = (f, arr) => { for (let i = arr.length - 1; i >= 0; i--) f.free(arr[i]); arr.length = 0; };
    free(this.neon, rec.sgN); free(this.box, rec.sgB); free(this.heroF, rec.sgH);
    free(this.strip, rec.stS); free(this.strobe, rec.stO); free(this.struct, rec.stR);
    rec.sgMeta.length = 0; rec.stMeta.length = 0;
    rec.sgAt = 0; rec.signed = false; rec.extra = false;
  }

  // ── §3.2.3 work unit (3) — signage placement and matrices ────────────────

  // YIELDABLE. Returns true when the chunk is finished, false to be called again next frame.
  // A whole chunk in one go measured up to 1.8 ms on a dense Lantern block — over §3.2.3's 1.2 ms
  // unit cap on its own — so this walks the buildings in slices. §3.2.3 asks for "independently
  // yieldable work units"; this is the unit that actually needed it.
  writeSigns(rec) {
    if (rec.signed) return true;
    this.prepare(rec);
    const ccx = rec.desc.cxWorld, ccz = rec.desc.czWorld;
    const bs = rec.desc.buildings;
    const end = Math.min(bs.length, rec.sgAt + SIGN_SLICE);
    for (let i = rec.sgAt; i < end; i++) this.buildingSigns(rec, bs[i], ccx, ccz);
    rec.sgAt = end;
    if (end < bs.length) return false;
    this.landmarkSigns(rec, ccx, ccz);
    rec.signed = true;
    return true;
  }

  // ── §3.2.3 work unit (4) — strips, strobes, antennae, bridges ────────────

  writeExtras(rec) {
    if (rec.extra) return;
    this.prepare(rec);
    rec.extra = true;
    const ccx = rec.desc.cxWorld, ccz = rec.desc.czWorld;
    for (const b of rec.desc.buildings) {
      this.buildingStrips(rec, b, ccx, ccz);
      this.buildingStrobes(rec, b, ccx, ccz);
      this.buildingStructures(rec, b, ccx, ccz);
    }
    this.bridges(rec, ccx, ccz);
  }

  // ── one building's signage ───────────────────────────────────────────────

  buildingSigns(rec, b, ccx, ccz) {
    const boxes = protoBoxes(b.proto);
    if (!boxes) return;
    const rng = xorshift32(hash2i(Math.round(b.x * 4), Math.round(b.z * 4), 0x51a9));

    // L5 first: the hero surface is the highest thing on the building and it must not lose its
    // slot to a board that happened to roll earlier.
    if (heroChance(b.proto) > 0) this.placeHero(rec, b, boxes, rng, ccx, ccz, null);

    // §3.5.5 rule 2 — one commercial roll for the whole building. Landmarks are always commercial:
    // they are the authored silhouette and the Market is explicitly the signage showcase (§3.1.1).
    const p = COMMERCIAL[b.district] ?? 0.22;
    if (!b.landmark && rng() >= p) return;

    const n = Math.max(1, Math.round((4 + rng() * 5.99) * this.density));
    for (let k = 0; k < n; k++) {
      // DECISIONS decision 9 — figurative poster tiles are punctuation, not wallpaper: at most one
      // per building, only on a tall one, and only high up. The height rule is enforced again in
      // placeSign, so a poster can never appear at eye level even if this roll changes.
      const poster = b.h >= 200 && k === 0 && rng() < 0.16;
      const u = rng();
      const layer = poster ? 2 : u < 0.31 ? 1 : u < 0.57 ? 2 : u < 0.74 ? 3 : 4;
      if (!this.placeSign(rec, b, boxes, rng, ccx, ccz, layer, poster)) this.stats.rejected++;
    }
  }

  // ── the authored core's own signage (§3.1.1) ─────────────────────────────

  landmarkSigns(rec, ccx, ccz) {
    if (!this.city || !rec.desc.landmarks.length) return;
    for (const id of rec.desc.landmarks) {
      const lm = this.city.byLandmark[id];
      if (!lm || !lm.signage.length) continue;
      // The parts as they were written into the descriptor, so the sign lands on real geometry.
      const parts = rec.desc.buildings.filter(x => x.landmark === id);
      if (!parts.length) continue;
      const tall = parts.reduce((a, x) => (x.h > a.h ? x : a));
      const wide = parts.reduce((a, x) => (x.w * x.d > a.w * a.d ? x : a));
      let hero = 0;
      for (let i = 0; i < lm.signage.length; i++) {
        const spec = lm.signage[i];
        const rng = xorshift32(hash2i(Math.round(lm.x), Math.round(lm.z) + i * 7, 0x2c31));
        if (spec.startsWith('hero_')) {
          this.placeHero(rec, tall, protoBoxes(tall.proto), rng, ccx, ccz, hero++);
          continue;
        }
        const c = spec.indexOf(':');
        const kind = c < 0 ? spec : spec.slice(0, c);
        let text = c < 0 ? null : spec.slice(c + 1);
        if (text && TEXT_ALIAS[text]) text = TEXT_ALIAS[text];
        const reg = (text && this.sa.find(kind, text)) || this.sa.pick(kind, rng());
        if (!reg) continue;
        // A named board goes on the big mass at a readable height; a blade goes on the podium.
        const host = kind.startsWith('blade') ? wide : (i === 0 ? tall : wide);
        const layer = kind.startsWith('blade') ? 1 : 2;
        this.placeSign(rec, host, protoBoxes(host.proto), rng, ccx, ccz, layer, false, reg);
      }
    }
  }

  // ── placement ────────────────────────────────────────────────────────────

  // Choose the tile FIRST, size the quad from its baked aspect, then look for a face that can hold
  // it. The other order — find a wall, then stretch a tile to fill it — is what §3.10 #4 forbids.
  placeSign(rec, b, boxes, rng, ccx, ccz, layer, poster, forced) {
    if (!boxes) return false;
    const L = LAYERS[layer];
    const reg = forced || this.pickRegion(layer, poster, rng);
    if (!reg) return false;

    let W, H;
    if (poster) { W = 12 + rng() * 8; H = W / reg.aspect; }
    else if (layer === 1) { H = 3.2 + rng() * 1.8; W = H * reg.aspect; }
    else if (layer === 2) { W = 12 + rng() * 12; H = W / reg.aspect; }
    else if (layer === 3) { W = 8 + rng() * 8; H = W / reg.aspect; }
    else { W = 8 + rng() * 16; H = W / reg.aspect; }

    // DECISIONS decision 9 — posters are DISTANCE ONLY. Never at eye level, never on a podium the
    // player can hover next to: the upper half of a tall building, and no lower than 120 m.
    const yLo = poster ? Math.max(120, b.h * 0.55) : L.y[0];
    const yHi = poster ? b.h : L.y[1];

    const hit = this.findFace(b, boxes, rng, yLo, yHi, W, H, L.onLip);
    if (!hit) return false;

    // A blade's quad plane contains the wall normal, so its WIDTH is its projection: a 3.2-5 m
    // blade off a 0.25-aspect tile stands 0.8-1.25 m proud, which is §3.5.5's 1.2 m.
    let x = hit.x, z = hit.z, yaw = hit.yaw;
    const off = L.perp ? W * 0.5 + 0.12 : L.proud;
    x += hit.nx * off; z += hit.nz * off;
    if (L.perp) yaw += Math.PI / 2;

    const field = reg.mode === 'box' ? this.box : this.neon;
    const arr = reg.mode === 'box' ? rec.sgB : rec.sgN;
    const q = this._q2;
    q.x = x; q.y = hit.y; q.z = z; q.yaw = yaw; q.w = W; q.h = H; q.reg = reg; q.off = off;
    q.anim = reg.wrapU ? 0.08 + rng() * 0.12 : 0;
    q.tint = this.tint(b, rng);
    q.inten = reg.mode === 'box' ? 0.55 + rng() * 0.45 : 1.15 + rng() * 0.95;
    q.seed = rng() * 100; q.ccx = ccx; q.ccz = ccz;
    q.layer = layer; q.cls = reg.cls; q.kind = reg.kind; q.mode = reg.mode;
    q.b = b; q.face = hit.face; q.nx = hit.nx; q.nz = hit.nz; q.perp = !!L.perp;
    return this.writeQuad(rec, field, arr, q);
  }

  pickRegion(layer, poster, rng) {
    if (poster) return this.sa.pick('poster', rng());
    const u = rng();
    let kind;
    if (layer === 1) kind = u < 0.50 ? 'blade_abs' : u < 0.92 ? 'blade_en' : 'blade_ja';
    else if (layer === 2) kind = u < 0.50 ? 'board_abs' : u < 0.92 ? 'board_en' : 'board_ja';
    else if (layer === 3) kind = u < 0.62 ? 'panel_abs' : 'mark';
    else kind = u < 0.62 ? 'rule' : 'ticker';
    return this.sa.pick(kind, rng());
  }

  // §3.5.5's L5. The hero band is the highest CONTINUOUS face that can carry a 60-110 m tile.
  //
  // The `hero` tiles and the three animated panels are both portrait, which is what makes this
  // work at all: §3.1's 51.2 m lot with a 13.2 m road caps every seeded building at 38 m wide, so
  // a LANDSCAPE 60-110 m billboard could not sit on anything in the seeded city without becoming
  // a slab floating either side of its own tower. Vertical ad screens running up a tower face are
  // both the genre's own language and the only reading of the size band the geometry allows.
  placeHero(rec, b, boxes, rng, ccx, ccz, panel) {
    if (!boxes) return false;
    // §3.5.5 wants ~12 in the near ring. Landmarks (panel !== null) are authored and always land;
    // the seeded field is thinned so the skyline is punctuated rather than papered.
    if (panel === null && rng() > heroChance(b.proto) * this.density) return false;
    let best = null;
    for (const bx of boxes) {
      if (bx.round) continue;
      const span = (bx.y1 - bx.y0) * b.h;
      if (span < 70) continue;
      const fw = Math.min((bx.x1 - bx.x0) * b.w, (bx.z1 - bx.z0) * b.d);
      if (fw < 18) continue;
      if (!best || bx.y0 > best.bx.y0) best = { bx, fw, span };
    }
    if (!best) return false;

    // P11 / ART_PASS item 2 — "the occasional big sign", option 2 in the manager's preference
    // order: "let an authored LANDMARK carry a genuinely huge board (landmarks are not
    // lot-limited)". §3.5.5's 60-110 m band was derived against §3.1's 51.2 m lot, and DECISIONS
    // T6.1 accepted the portrait reading for exactly that reason — but `market` is a 180 x 140 m
    // authored mass and `ninefold` a 90 m one, and neither is bound by a lot that does not apply
    // to it. 746850_03's ENFIELD board is this and we had nothing like it.
    //
    // It is a SEPARATE class with its own fixed band, not a stretched L5. §3.10 #4's ruler works
    // because a given class is always the same physical size; a second class with its own constant
    // size adds a rung to the ruler, whereas widening L5 to 60-200 would remove one.
    const mega = panel !== null;
    const H = mega
      ? Math.min(clamp(best.fw * 2.6, 80, 190), best.span * 0.90)
      : Math.min(clamp(best.fw * 2.2, 60, 110), best.span * 0.8);
    if (H < (mega ? 80 : 60)) return false;
    const reg = this.heroFps > 0
      ? Object.assign({ cls: 'graphic', kind: 'hero', mode: 'hero' }, this.hero.region(panel === null ? (rng() * 3) | 0 : panel))
      : this.sa.pick('hero', rng());
    if (!reg) return false;
    const W = H * (reg.aspect || 0.5);

    // The upper facade, never the podium: §3.5.5 puts L5 above 180 m and DECISIONS decision 9 puts
    // everything figurative at distance. The floor is the higher of the mass's own base, a third of
    // the way up the building, and 90 m.
    // §3.5.5 puts L5 above 90 m and above a third of the building. A MEGAHERO cannot obey that and
    // exist: on `market`'s 160 m podium a 98 m board centred no lower than 90 + H/2 = 139 m has to
    // end at 188 m on a 160 m building, so the placement always failed and the class was dead code
    // that reported no error. An authored board 90-190 m tall is not at eye level at any height it
    // can occupy, so its floor is its own mass's base — which is also where 746850_03's ENFIELD
    // board actually sits, part way up its host and not on the crown.
    const yLo = mega ? Math.max(best.bx.y0 * b.h + 2, b.h * 0.18)
                     : Math.max(best.bx.y0 * b.h + 2, b.h * 0.35, LAYERS[5].y[0]);
    const yHi = best.bx.y1 * b.h - 2;
    // `overhang` lets a hero be up to 1.6x its host face wide and sits it CENTRED on that face —
    // a 60 m ad screen strapped across a 40 m tower is the genre's own language, and the seeded
    // field has nothing wider than 38 m to hang one on (§3.1's 51.2 m lot minus a 13.2 m road).
    const hit = this.findFace(b, boxes, rng, yLo, yHi, W, H, false, best.bx, 1.6);
    if (!hit) return false;

    const q = this._q2;
    q.x = hit.x + hit.nx * LAYERS[5].proud; q.y = hit.y; q.z = hit.z + hit.nz * LAYERS[5].proud;
    q.yaw = hit.yaw; q.w = W; q.h = H; q.reg = reg; q.anim = 0; q.off = LAYERS[5].proud;
    q.tint = this.heroFps > 0 ? 0xffffff : this.tint(b, rng);
    q.inten = this.heroFps > 0 ? 1.0 : 0.9;
    q.seed = rng() * 100; q.ccx = ccx; q.ccz = ccz;
    q.layer = 5; q.cls = mega ? 'megahero' : 'graphic'; q.kind = 'hero'; q.mode = 'hero';
    q.b = b; q.face = hit.face; q.nx = hit.nx; q.nz = hit.nz; q.perp = false;
    return this.writeQuad(rec, this.heroF, rec.sgH, q);
  }

  // ── finding a wall ───────────────────────────────────────────────────────
  //
  // A WALL IS NOT THE BOUNDING BOX. `taper` steps in twice, `terrace` is sheer on -x and stepped
  // on +x, `podium` hangs a thin tower off-centre over a three-storey base, `bridged` has two
  // masses at the same height. So this walks the prototype's OWN box list, sizes the sign to stay
  // inside one continuous face, and then proves the face is exterior by testing the sign's
  // stand-off point against every other box. Without that last test a sign on the bridge deck of
  // `bridged` lands inside the tower it abuts.
  findFace(b, boxes, rng, yLo, yHi, needW, needH, onLip, only, overhang = 0) {
    // A reused scratch array: this runs up to nine times per building, ~30 buildings a chunk, and
    // a fresh array each time is the kind of allocation that turns a 1.2 ms unit into a GC pause.
    const cand = this._cand;
    cand.length = 0;
    for (const bx of (only ? [only] : boxes)) {
      const wy0 = bx.y0 * b.h, wy1 = bx.y1 * b.h;
      if (wy1 - wy0 < needH + 1.0) continue;
      if (wy1 <= yLo || wy0 >= yHi) continue;
      cand.push(bx);
    }
    // Every candidate box gets one look, in a seeded order, then we give up: a sign that cannot
    // be placed is DROPPED, never shrunk to fit (§3.10 #4) and never nudged onto the bounding box.
    while (cand.length) {
      const ci = (rng() * cand.length) | 0;
      const bx = cand[ci];
      cand.splice(ci, 1);

      const wy0 = bx.y0 * b.h, wy1 = bx.y1 * b.h;
      const lo = Math.max(yLo, wy0) + needH / 2 + 0.5;
      const hi = Math.min(yHi, wy1) - needH / 2 - 0.5;
      if (hi <= lo) continue;
      // §3.5.5 puts rules and tickers on ledge lips and bridge undersides — the top of the mass.
      const y = onLip ? hi : lo + rng() * (hi - lo);

      const f0 = (rng() * 4) | 0;
      for (let k = 0; k < 4; k++) {
        const hit = bx.round
          ? this.roundFace(b, bx, rng, y, needW)
          : this.flatFace(b, bx, (f0 + k) % 4, rng, y, needW, overhang);
        if (!hit) continue;
        // The exterior test. The sign's stand-off point must not be inside any OTHER mass — this
        // is what stops a sign on `bridged`'s deck landing inside the tower the deck abuts, and a
        // sign on a `stack` body landing under the lip above it.
        if (this.insideOther(boxes, bx, b, hit.x + hit.nx * 0.9, y, hit.z + hit.nz * 0.9)) continue;
        hit.box = bx;
        return hit;
      }
    }
    return null;
  }

  // The building's ROOF, which is not its highest box: `slab`'s highest box is a 6 m plant hut and
  // `taper`'s is a 2 m mast. What a cornice strip or a mast wants is the widest mass near the top.
  topMass(boxes) {
    let best = null, fallback = null;
    const area = b => (b.x1 - b.x0) * (b.z1 - b.z0);
    for (const bx of boxes) {
      if (bx.round) continue;
      if (!fallback || area(bx) > area(fallback)) fallback = bx;
      if (bx.y1 < 0.90) continue;
      if (!best || area(bx) > area(best)) best = bx;
    }
    return best || fallback;
  }

  flatFace(b, bx, face, rng, y, needW, overhang = 0) {
    const x0 = b.x + bx.x0 * b.w, x1 = b.x + bx.x1 * b.w;
    const z0 = b.z + bx.z0 * b.d, z1 = b.z + bx.z1 * b.d;
    let nx = 0, nz = 0, yaw = 0, aLo, aHi, wall;
    if (face === 0) { nx = 1; yaw = Math.PI / 2; wall = x1; aLo = z0; aHi = z1; }
    else if (face === 1) { nx = -1; yaw = -Math.PI / 2; wall = x0; aLo = z0; aHi = z1; }
    else if (face === 2) { nz = 1; yaw = 0; wall = z1; aLo = x0; aHi = x1; }
    else { nz = -1; yaw = Math.PI; wall = z0; aLo = x0; aHi = x1; }

    const span = aHi - aLo;
    let a;
    if (overhang > 0) {
      // a hero: allowed to be wider than its host, but only up to `overhang` times, and centred
      if (span * overhang < needW) return null;
      a = (aLo + aHi) / 2;
    } else {
      if (span < needW + 1.0) return null;
      const m = needW / 2 + 0.5;
      a = aLo + m + rng() * (span - 2 * m);
    }
    const h = this._hit;
    h.x = nx !== 0 ? wall : a; h.y = y; h.z = nx !== 0 ? a : wall;
    h.yaw = yaw; h.nx = nx; h.nz = nz; h.face = face; h.box = null;
    return h;
  }

  // `drum` is a 10-gon. A flat sign on it needs a FACET normal, not a cardinal one, or it floats
  // off the curve at both ends. The prism is scaled non-uniformly by (w, d), so the outward
  // direction is the ellipse normal and not the radius.
  roundFace(b, bx, rng, y, needW) {
    const SIDES = 10;
    const inr = 0.5 * Math.cos(Math.PI / SIDES);        // facet inradius in unit space
    const facetW = Math.min(b.w, b.d) * 2 * 0.5 * Math.sin(Math.PI / SIDES);
    if (facetW < needW + 0.6) return null;
    const i = (rng() * SIDES) | 0;
    const a = ((i + 0.5) / SIDES) * Math.PI * 2;
    const cx = Math.cos(a), sz = Math.sin(a);
    const x = b.x + cx * inr * b.w, z = b.z + sz * inr * b.d;
    const nx = cx * b.d, nz = sz * b.w;
    const L = Math.hypot(nx, nz) || 1;
    const h = this._hit;
    h.x = x; h.y = y; h.z = z; h.yaw = Math.atan2(nx / L, nz / L);
    h.nx = nx / L; h.nz = nz / L; h.face = 4 + i; h.box = null;
    return h;
  }

  insideOther(boxes, host, b, px, py, pz) {
    const ux = (px - b.x) / b.w, uy = py / b.h, uz = (pz - b.z) / b.d;
    for (const o of boxes) {
      if (o === host) continue;
      if (ux > o.x0 + 1e-4 && ux < o.x1 - 1e-4 && uy > o.y0 + 1e-4 && uy < o.y1 - 1e-4
        && uz > o.z0 + 1e-4 && uz < o.z1 - 1e-4) return true;
    }
    return false;
  }

  // ── writing an instance ──────────────────────────────────────────────────

  writeQuad(rec, field, arr, m) {
    const idx = arr.length;
    const slot = field.alloc(arr, idx);
    if (slot < 0) return false;
    arr.push(slot);

    this._q.setFromAxisAngle(AXIS_Y, m.yaw);
    this._p.set(m.x, m.y, m.z);
    this._s.set(m.w, m.h, 1);
    this._m4.compose(this._p, this._q, this._s);
    this._m4.toArray(field.mesh.instanceMatrix.array, slot * 16);

    field.set('iRegion', slot, m.reg.u, m.reg.v, m.reg.w, m.reg.h);
    lin(m.tint, this._c);
    field.set('iEmissive', slot, this._c.r, this._c.g, this._c.b);
    field.set('iSeed', slot, m.seed);
    field.set('iChunk', slot, m.ccx, m.ccz);
    field.set('iIntensity', slot, m.inten);
    field.set('iAnim', slot, m.anim);
    field.touch(slot);

    this.stats[LAYERS[m.layer].key]++;
    if (m.cls === 'poster') this.stats.poster++;
    if (!this.keepMeta) return true;
    // Kept so gates_p3a.mjs can re-derive every sign's wall from protoBoxes and prove nothing
    // floats, and so P3b's halo field (§4.4) has sign positions without decomposing a matrix.
    rec.sgMeta.push({
      layer: m.layer, cls: m.cls, kind: m.kind, mode: m.mode,
      x: m.x, y: m.y, z: m.z, yaw: m.yaw, w: m.w, h: m.h, perp: m.perp, off: m.off,
      nx: m.nx, nz: m.nz, proto: m.b.proto, bx: m.b.x, bz: m.b.z,
      bw: m.b.w, bh: m.b.h, bd: m.b.d, face: m.face, lm: m.b.landmark || null,
    });
    return true;
  }

  writeEmis(rec, field, arr, x, y, z, sx, sy, sz, tint, inten, seed, ccx, ccz) {
    const idx = arr.length;
    const slot = field.alloc(arr, idx);
    if (slot < 0) return false;
    arr.push(slot);
    this._p.set(x, y, z);
    this._s.set(sx, sy, sz);
    this._m4.compose(this._p, IDENT_Q, this._s);
    this._m4.toArray(field.mesh.instanceMatrix.array, slot * 16);
    lin(tint, this._c);
    field.set('iEmissive', slot, this._c.r, this._c.g, this._c.b);
    field.set('iSeed', slot, seed);
    field.set('iChunk', slot, ccx, ccz);
    field.set('iIntensity', slot, inten);
    field.touch(slot);
    return true;
  }

  writeStruct(rec, x, y, z, sx, sy, sz, ccx, ccz) {
    const idx = rec.stR.length;
    const slot = this.struct.alloc(rec.stR, idx);
    if (slot < 0) return false;
    rec.stR.push(slot);
    this._p.set(x, y, z);
    this._s.set(sx, sy, sz);
    this._m4.compose(this._p, IDENT_Q, this._s);
    this._m4.toArray(this.struct.mesh.instanceMatrix.array, slot * 16);
    this.struct.set('iChunk', slot, ccx, ccz);
    this.struct.touch(slot);
    return true;
  }

  // ── §3.8's edge and roof strips ──────────────────────────────────────────
  // The repeated horizontal tick of §3.10 #7 made into light: a lip along the top of the mass, a
  // corner run up a tall one, a lip on one setback. Strips are the cheapest way to draw a
  // building's silhouette in a frame where the building itself is nearly black.

  buildingStrips(rec, b, ccx, ccz) {
    const boxes = protoBoxes(b.proto);
    if (!boxes) return;
    const rng = xorshift32(hash2i(Math.round(b.x * 4), Math.round(b.z * 4), 0x7f13));
    const d = byId[b.district];
    const tint = this.mixWhite(d ? d.sign : 0x9fd8e8, 0.45);
    const T = 0.38;

    // the cornice run: along the top of the widest mass near the roof
    const top = this.topMass(boxes);
    if (top) {
      const y = top.y1 * b.h - T;
      const x0 = b.x + top.x0 * b.w, x1 = b.x + top.x1 * b.w;
      const z0 = b.z + top.z0 * b.d, z1 = b.z + top.z1 * b.d;
      const L = (x1 - x0) * 0.98;
      this.writeEmis(rec, this.strip, rec.stS, (x0 + x1) / 2, y, z1 + T * 0.4, L, T, T,
        tint, 0.9 + rng() * 0.5, rng() * 100, ccx, ccz);
      if (rng() < 0.55 * this.density) {
        this.writeEmis(rec, this.strip, rec.stS, (x0 + x1) / 2, y, z0 - T * 0.4, L, T, T,
          tint, 0.9 + rng() * 0.5, rng() * 100, ccx, ccz);
      }
    }

    // a corner run on anything tall enough to need one. Dimmer than the horizontals: a 300 m
    // vertical is 40x the screen length of a cornice and at equal intensity it reads as a laser.
    if (b.h >= 140) {
      const base = boxes.find(bx => !bx.round && bx.y0 < 0.02) || boxes[0];
      const sx = rng() < 0.5 ? base.x0 : base.x1;
      const sz = rng() < 0.5 ? base.z0 : base.z1;
      const y0 = b.h * 0.05, y1 = b.h * (0.86 + rng() * 0.1);
      // P11, ROUND 7. FIVE OF SIX blind critics independently named this strip as a rendering
      // defect — "a stray edge or an untrimmed beam", "the single most obvious unfinished-build
      // tell in the frame", "it looks like debug wireframe", "a 1px line primitive rather than
      // tapering geometry". It is none of those things: it is a legitimate corner run, drawn at a
      // constant 0.30 m over a mass up to 464 m tall. That is an aspect ratio of 1:1,500 — it
      // resolves to a sub-pixel hairline that no mip and no AA can help, and a line that stays
      // exactly one pixel wide over a 400 m depth range is the signature of a line primitive,
      // which is what all five of them correctly deduced from what they could see.
      //
      // So the width scales with the run. A 464 m corner run is now 1.8 m wide — still a strip on
      // a 74 m tower, and about two pixels at the distance `fog_city` frames it, which is enough
      // for the mip chain and the bloom to give it a core and a halo instead of a stairstep.
      const TV = Math.min(1.8, Math.max(0.50, (y1 - y0) * 0.0045));
      this.writeEmis(rec, this.strip, rec.stS,
        b.x + sx * b.w + Math.sign(sx) * TV * 0.5, (y0 + y1) / 2, b.z + sz * b.d + Math.sign(sz) * TV * 0.5,
        TV, y1 - y0, TV, this.mixWhite(tint, 0.25), 0.30 + rng() * 0.22, rng() * 100, ccx, ccz);
    }

    // one setback lip — the `stack` / `terrace` ledge rhythm, lit
    const lips = boxes.filter(bx => !bx.round && bx.y1 - bx.y0 < 0.03 && bx.y0 > 0.05);
    if (lips.length && rng() < 0.8 * this.density) {
      const bx = lips[(rng() * lips.length) | 0];
      const x0 = b.x + bx.x0 * b.w, x1 = b.x + bx.x1 * b.w;
      const z1 = b.z + bx.z1 * b.d;
      this.writeEmis(rec, this.strip, rec.stS, (x0 + x1) / 2, bx.y1 * b.h - T * 0.6, z1 + T * 0.4,
        (x1 - x0) * 0.96, T, T, tint, 0.8 + rng() * 0.4, rng() * 100, ccx, ccz);
    }
  }

  // ── §3.10 #3's warning strobes ───────────────────────────────────────────
  // Red, EXACTLY every 60 m of height, on every building over 180 m, 0.85 Hz with a per-building
  // phase. A column of six strobes up a fog-dimmed silhouette is an unambiguous height read and
  // it is six quads. The 60 m spacing is the whole point — do not jitter it.

  buildingStrobes(rec, b, ccx, ccz) {
    if (b.h < 180) return;
    const boxes = protoBoxes(b.proto);
    if (!boxes) return;
    const seed = (hash2i(Math.round(b.x), Math.round(b.z), 0x3b71) % 1000) / 10;
    const sx = ((hash2i(Math.round(b.x), Math.round(b.z), 0x1d5) & 1) ? 1 : -1);
    const sz = ((hash2i(Math.round(b.x), Math.round(b.z), 0x9c7) & 1) ? 1 : -1);
    const top = this.topMass(boxes);
    for (let y = 60; y <= b.h - 4; y += 60) {
      const t = y / b.h;
      let host = null;
      for (const bx of boxes) {
        if (t < bx.y0 || t > bx.y1) continue;
        const a = (bx.x1 - bx.x0) * (bx.z1 - bx.z0);
        if (!host || a > (host.x1 - host.x0) * (host.z1 - host.z0)) host = bx;
      }
      // `bridged` tops out at y1 = 0.985, so a 60 m step can land in the 1.5 % above every box.
      // Fall back to the topmost mass rather than dropping the strobe: §3.10 #3's whole value is
      // that the column is COMPLETE and its spacing is a ruler, and a missing rung is a 120 m lie.
      if (!host) host = top;
      const px = b.x + (sx > 0 ? host.x1 : host.x0) * b.w * 0.97;
      const pz = b.z + (sz > 0 ? host.z1 : host.z0) * b.d * 0.97;
      const ok = this.writeEmis(rec, this.strobe, rec.stO, px, y, pz, 2.6, 2.6, 2.6, 0xff2418, 2.6, seed, ccx, ccz);
      // Grouped by BUILDING, not by (x, z): a `taper`'s strobes step inward with its setbacks, so
      // keying the column on position would split one column into three and hide a 120 m gap.
      // Gate-only, like sgMeta — at 2,785 strobes in Vault Row this is not free.
      if (ok && this.keepMeta) rec.stMeta.push({ b: Math.round(b.x) + ',' + Math.round(b.z), y, bh: b.h });
    }
  }

  // ── §3.8's antennae, masts and roof plant ────────────────────────────────

  buildingStructures(rec, b, ccx, ccz) {
    const boxes = protoBoxes(b.proto);
    if (!boxes) return;
    const traits = PROTO_TRAITS[b.proto];
    const rng = xorshift32(hash2i(Math.round(b.x * 4), Math.round(b.z * 4), 0x6ae3));
    const top = this.topMass(boxes);
    if (!top) return;
    const ty = top.y1 * b.h;
    const hw = (top.x1 - top.x0) * b.w, hd = (top.z1 - top.z0) * b.d;
    const cxw = b.x + (top.x0 + top.x1) / 2 * b.w, czw = b.z + (top.z0 + top.z1) / 2 * b.d;

    // P3b: the height gate was 80 m and one unit. Both blind critic rounds called the skyline
    // "flat rectangular cuts with zero detail" / "blocked-out", and roof kit is the cheapest
    // silhouette variety in the game — it is the same instanced box field, already allocated,
    // running at 664 of a 2,200 cap. 45 m brings the low-rise blocks in, and the second unit
    // breaks the one-box-per-roof rhythm that reads as a template.
    if (traits?.roofPlant && b.h >= 45 && rng() < 0.78 * this.density) {
      const w = hw * (0.2 + rng() * 0.18), d = hd * (0.2 + rng() * 0.18), h = 3 + rng() * 4;
      this.writeStruct(rec, cxw + (rng() - 0.5) * (hw - w) * 0.7, ty + h / 2,
        czw + (rng() - 0.5) * (hd - d) * 0.7, w, h, d, ccx, ccz);
      if (rng() < 0.55) {
        const w2 = hw * (0.10 + rng() * 0.12), d2 = hd * (0.10 + rng() * 0.12), h2 = 2 + rng() * 6;
        this.writeStruct(rec, cxw + (rng() - 0.5) * (hw - w2) * 0.8, ty + h2 / 2,
          czw + (rng() - 0.5) * (hd - d2) * 0.8, w2, h2, d2, ccx, ccz);
      }
      // a short vent stack: 0.6 m across and up to 9 m, which is a silhouette nick rather than a
      // mast — the tall-mast branch below still owns anything over 150 m.
      if (rng() < 0.4) {
        const sh = 4 + rng() * 5;
        this.writeStruct(rec, cxw + (rng() - 0.5) * hw * 0.6, ty + sh / 2,
          czw + (rng() - 0.5) * hd * 0.6, 0.6, sh, 0.6, ccx, ccz);
      }
    }
    if (b.h >= 150) {
      const mh = 10 + rng() * 18;
      this.writeStruct(rec, cxw, ty + mh / 2, czw, 0.9, mh, 0.9, ccx, ccz);
      if (b.h >= 260) this.writeStruct(rec, cxw, ty + mh * 0.72, czw, 5 + rng() * 4, 0.5, 0.5, ccx, ccz);
    }
  }

  // ── §3.10 #7's sky bridges between towers ────────────────────────────────
  // Two neighbours, facing, close, both tall enough — one deck at 90 / 150 / 220 m. Capped at two
  // a chunk: a bridge is a depth cue, and a lattice of them is a jungle gym.

  bridges(rec, ccx, ccz) {
    const bs = rec.desc.buildings;
    let made = 0;
    for (let i = 0; i < bs.length && made < 2; i++) {
      for (let j = i + 1; j < bs.length && made < 2; j++) {
        const a = bs[i], c = bs[j];
        const y = [90, 150, 220][hash2i(Math.round(a.x), Math.round(c.z), 0x4d19) % 3];
        if (a.h < y + 30 || c.h < y + 30) continue;
        const dx = c.x - a.x, dz = c.z - a.z;
        if (Math.abs(dx) > Math.abs(dz)) {
          const gap = Math.abs(dx) - (a.w + c.w) / 2;
          const over = Math.min(a.z + a.d / 2, c.z + c.d / 2) - Math.max(a.z - a.d / 2, c.z - c.d / 2);
          if (gap < 8 || gap > 42 || over < 10) continue;
          this.writeStruct(rec, (a.x + c.x) / 2, y + 2.5, (a.z + c.z) / 2, gap + 2, 5, 7, ccx, ccz);
        } else {
          const gap = Math.abs(dz) - (a.d + c.d) / 2;
          const over = Math.min(a.x + a.w / 2, c.x + c.w / 2) - Math.max(a.x - a.w / 2, c.x - c.w / 2);
          if (gap < 8 || gap > 42 || over < 10) continue;
          this.writeStruct(rec, (a.x + c.x) / 2, y + 2.5, (a.z + c.z) / 2, 7, 5, gap + 2, ccx, ccz);
        }
        made++;
      }
    }
  }

  // ── colour ───────────────────────────────────────────────────────────────

  tint(b, rng) {
    const d = byId[b.district];
    if (d && rng() < 0.55) return this.jitter(d.sign, rng);
    return this.jitter(NEON[(rng() * NEON.length) | 0], rng);
  }

  jitter(hex, rng) {
    const k = 0.86 + rng() * 0.28;
    const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
    const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
    const b = Math.min(255, Math.round((hex & 255) * k));
    return (r << 16) | (g << 8) | b;
  }

  mixWhite(hex, t) {
    const r = Math.round(((hex >> 16) & 255) * (1 - t) + 255 * t);
    const g = Math.round(((hex >> 8) & 255) * (1 - t) + 255 * t);
    const b = Math.round((hex & 255) * (1 - t) + 255 * t);
    return (r << 16) | (g << 8) | b;
  }

  // ── reporting ────────────────────────────────────────────────────────────

  breakdown() {
    const rows = this.fields.map(f => ({
      field: f.name, draws: f.n ? 1 : 0, instances: f.n, geoTris: f.tris,
      tris: f.n * f.tris, cap: f.cap, overflow: f.overflow,
    }));
    return {
      rows,
      draws: rows.reduce((a, r) => a + r.draws, 0),
      tris: rows.reduce((a, r) => a + r.tris, 0),
      overflow: rows.reduce((a, r) => a + r.overflow, 0),
    };
  }

  strobeColumns(live) {
    const cols = new Map();
    for (const rec of live) {
      if (!rec.stMeta) continue;
      for (const m of rec.stMeta) {
        let a = cols.get(m.b);
        if (!a) cols.set(m.b, a = { h: m.bh, y: [] });
        a.y.push(m.y);
      }
    }
    return [...cols.values()].map(c => ({ h: c.h, y: c.y.sort((a, b) => a - b) }));
  }

  // P3b's mirrored buckets and LOW halo sprites are second draws of THESE buffers, and they carry
  // §3.2.2's same R0 ramp. Obligation T7 says every later phase adding a layer that rides R0 must
  // check whether it has broken gates_p2's isolation the same way — so they are registered here
  // and hidden by the same switch rather than left for a gate author to remember.
  attachDerived({ signs = [], all = [] } = {}) {
    this.derived = { signs, all };
  }

  // `all` also hides the strips, strobes and structures. gates_p2 needs that: §3.2.2's dither
  // measurement sweeps R0, and R0 drives P3a's intensity ramp as well, so leaving the emissive
  // layers on makes part 2 show up as part 3's residue.
  setVisible(on, all) {
    const set = all ? this.fields : [this.neon, this.box, this.heroF];
    for (const f of set) f.mesh.visible = !!on;
    const d = this.derived && (all ? this.derived.all : this.derived.signs);
    if (d) for (const m of d) m.visible = !!on;
    return !!on;
  }

  state() {
    return {
      neon: this.neon.n, box: this.box.n, hero: this.heroF.n,
      strips: this.strip.n, strobes: this.strobe.n, structures: this.struct.n,
      signs: this.neon.n + this.box.n + this.heroF.n,
      density: this.density, heroFps: this.heroFps,
      overflow: this.breakdown().overflow,
    };
  }

  dispose() {
    for (const f of this.fields) f.dispose();
    for (const m of [this.matNeon, this.matBox, this.matHero, this.matStrip, this.matStrobe, this.matStruct]) m.dispose();
    this.hero.tex.dispose();
    this.group.parent?.remove(this.group);
  }
}

const IDENT_Q = new THREE.Quaternion();
