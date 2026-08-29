// The corridor. Road deck, parapets, water, banks, theme decor, the finish
// arch and the backdrop — everything the run happens *on* and *between*.
//
// MANAGER: `game.js` clamps `state.x` to `±ROAD.halfW`, which means a
// `{kind:'narrow'}` section pinches the geometry but not the player — you can
// walk through the parapet. The fix is one line: clamp to `roadHalfAt(state.z)`
// (exported here, safe to call every frame, no allocation).
//
// MANAGER: `ROAD.segAhead = 14` reserves 560 m of road, but `scene.fog` closes
// at 185 m, so tiles 5..14 are invisible *and* they paint fog-coloured pixels
// over the mountain backdrop (the backdrop draws with depth off, first). We
// derive the live tile count from `fog.far` instead and honour segAhead only as
// a ceiling. `segAhead: 6` would say the same thing honestly.
//
// MANAGER: `ROAD.wallEvery` is 0 and unused — parapet bays are a fixed 5 m
// here, which is what makes the post rhythm in the reference read. Either give
// it a real default or drop it from config.
//
// ---------------------------------------------------------------------------
// HOW THIS STAYS INSIDE 14 DRAW CALLS
//
// Everything repeated is ONE `InstancedMesh`. The deck, the banks, the parapet
// bays, the theme decor and the level props are five geometries and five draws
// (plus three outline shells) no matter how much road is on screen. Two tricks
// make that possible:
//
//  1. COLOUR COMES FROM UVs. A single 8x8 palette texture holds every flat
//     colour the world uses; each box's UVs are pinned to one texel. So one
//     material can paint a grey post, a brown trunk and green foliage in the
//     same draw, and re-theming a level is a repaint of one 8x8 canvas.
//
//  2. VARIANTS COME FROM A PER-INSTANCE SELECTOR. Decor, props and bank
//     profiles merge every variant into one geometry, tag each vertex with a
//     kind (riding in toon.js's `aPart`, which `mergeParts` already carries),
//     and collapse the vertices that do not match the instance's `aWhich` to a
//     point in the vertex shader. Degenerate triangles cost nothing to
//     rasterise, so four prop types are one draw call, not four.
//
// Nothing allocates per frame. Instance matrices are rewritten only when the
// tile window shifts, which at RUN.speed is about once every three seconds.

import * as THREE from 'three';
import { ROAD, PAL } from './config.js';
import { state } from './state.js';
import { clamp, lerp, smoothstep, mulberry32 } from './utils.js';
import { flatMat, outlineMat, partBox, mergeParts, canvasTex, signText, hex } from './toon.js';

// ---------------------------------------------------------------------------
// Dimensions. All derived from ROAD.halfW so a config change moves everything
// together; the numbers here are ratios lifted off the reference frames.
// ---------------------------------------------------------------------------
const DECK_OVER = 0.7;    // deck overhangs the playable edge, so the wall sits ON it
const DECK_THICK = 1.15;  // the causeway reads raised only if you can see its side
// One slab, one parapet bay, one post. Tying the post rhythm to the slab
// rhythm is what keeps the wall glued to the deck edge through a taper.
const SUB = 5.0;          // metres per deck slab — also the narrowing granularity
const BAY = SUB;          // metres between parapet posts
const WALL_H = 1.15;   // ~1/10 of the road width, which is the reference ratio
const POST_H = 1.92;
const TAPER = 7;          // metres a `narrow` section takes to pinch in

// ---------------------------------------------------------------------------
// Palette slots. Index into an 8x8 texture; the *names* are fixed and the
// *colours* are per-theme, which is the whole re-theming mechanism.
// ---------------------------------------------------------------------------
const S = {
  deckSide: 0, kerb: 1, wall: 2, wallCap: 3, post: 4, postCap: 5, dark: 6,
  bankTop: 8, bankMid: 9, bankRock: 10, wood: 11, woodDark: 12, steel: 13, rust: 14, sandbag: 15,
  decorA: 16, decorB: 17, decorC: 18, decorD: 19, smoke: 20,
};

// ---------------------------------------------------------------------------
// Themes. One table, five rows. `decor` names index DECOR below and are also
// the per-instance kind indices (0,1,2), so a theme's decor geometry is built
// from exactly the three shapes it uses and nothing else.
// ---------------------------------------------------------------------------
const BASE_PAL = {
  [S.deckSide]: 0x565c62, [S.kerb]: 0xcbd0d3, [S.wall]: 0x7e858d, [S.wallCap]: 0xa7aeb4,
  [S.post]: 0x8d959b, [S.postCap]: 0xaeb6bb, [S.dark]: 0x2a3138,
  [S.bankTop]: 0x6b7355, [S.bankMid]: 0x5d6a4a, [S.bankRock]: PAL.bankRock,
  [S.wood]: PAL.wood, [S.woodDark]: PAL.woodDark, [S.steel]: PAL.steel,
  [S.rust]: 0x7a4a32, [S.sandbag]: 0x9a8f68,
  [S.decorA]: 0x4d7a3e, [S.decorB]: 0x585f52, [S.decorC]: 0x6b4a2c, [S.decorD]: 0x8a9470,
  [S.smoke]: 0x4a4a4a,
};

// `skyLow` is always exactly `fog`. The water plane runs 700 m out and is
// solid fog colour long before it ends, so the horizon is literally where the
// fogged ground meets the dome — any difference between the two shows up as a
// hard seam straight across the frame.
//
// `bankScale` / `bankDrop` scale one riprap profile in x and y. valley keeps a
// narrow near-vertical shoulder so the dark water starts a couple of metres off
// the parapet, which is what makes the reference read as a bridge; the land
// themes stretch it wide and flatten it so buildings and dunes have somewhere
// believable to stand.
const THEMES = {
  valley: {
    fog: 0xa8c6d8, skyTop: 0x3f7bb0, skyMid: 0x86b0cd,
    hillFar: 0x8ca8bc, hillNear: 0x5d7d84,
    deck: 0x8f959b, line: PAL.roadLine, low: 0x081722, crest: 0x14384c,
    ripple: true, bankScale: 0.34, bankDrop: 1.0, bankY: -0.6,
    shore: 20, decorBand: [23, 40], decorY: -1.3,
    decor: ['pine', 'rock', 'shrub'], decorW: [5, 3, 4],
    slots: {},
  },
  town: {
    fog: 0xb9b0a2, skyTop: 0x6d84a0, skyMid: 0xa9b3bb,
    hillFar: 0x9a9689, hillNear: 0x757062,
    deck: 0x99938a, line: 0xd8d3c8, low: 0x6a6255, crest: 0x7b7264,
    ripple: false, bankScale: 1.5, bankDrop: 0.55,
    shore: 0, decorBand: [7, 15], decorY: 0, bankY: 0,
    decor: ['ruin', 'rubble', 'pole'], decorW: [3, 5, 2],
    slots: {
      [S.bankTop]: 0x7a7365, [S.bankMid]: 0x6d6659, [S.bankRock]: 0x5c564b,
      [S.decorA]: 0x877e72, [S.decorB]: 0x615850, [S.decorC]: 0x6b5c49, [S.decorD]: 0x2c2924,
    },
  },
  desert: {
    fog: 0xdfc99e, skyTop: 0x6ea3c4, skyMid: 0xc0ceca,
    hillFar: 0xc9ab7e, hillNear: 0xb08d5e,
    deck: 0xaea28a, line: 0xe6dcc4, low: 0xc2a878, crest: 0xd4bd91,
    ripple: false, bankScale: 1.8, bankDrop: 0.5,
    shore: 0, decorBand: [8, 18], decorY: 0, bankY: 0,
    decor: ['dune', 'rock', 'deadtree'], decorW: [4, 4, 2],
    slots: {
      [S.bankTop]: 0xc4ab7c, [S.bankMid]: 0xb39a6c, [S.bankRock]: 0x9c8558,
      [S.decorA]: 0xcbb283, [S.decorB]: 0x9c8558, [S.decorC]: 0x8a7048, [S.decorD]: 0xb8a173,
    },
  },
  front: {
    fog: 0x847d6b, skyTop: 0x4e5358, skyMid: 0x7b7666,
    hillFar: 0x716d60, hillNear: 0x504d44,
    deck: 0x8a877f, line: 0xbdb9ad, low: 0x4b4437, crest: 0x5a5243,
    ripple: false, bankScale: 1.35, bankDrop: 0.6,
    shore: 0, decorBand: [7, 13], decorY: 0, bankY: 0,
    decor: ['crater', 'wreckD', 'smoke'], decorW: [5, 3, 1.2],
    slots: {
      [S.bankTop]: 0x565241, [S.bankMid]: 0x4a4738, [S.bankRock]: 0x3f3d32,
      [S.decorA]: 0x413f33, [S.decorB]: 0x33312b, [S.decorC]: 0x53422f, [S.decorD]: 0x27251f,
      [S.smoke]: 0x3d3a33,
    },
  },
  home: {
    fog: 0xcadfc4, skyTop: 0x4f92c9, skyMid: 0x9fc6de,
    hillFar: 0x9dbca6, hillNear: 0x77996d,
    deck: 0x9c9890, line: PAL.roadLine, low: 0x7ba05c, crest: 0x8cb268,
    ripple: false, bankScale: 1.7, bankDrop: 0.5,
    shore: 0, decorBand: [7, 17], decorY: 0, bankY: 0,
    decor: ['tree', 'fence', 'hay'], decorW: [4, 3, 3],
    slots: {
      [S.bankTop]: 0x7ea45e, [S.bankMid]: 0x6d9150, [S.bankRock]: 0x63864a,
      [S.decorA]: 0x4f8a3c, [S.decorB]: 0x6d9150, [S.decorC]: 0x8a6a42, [S.decorD]: 0xd9c274,
    },
  },
};

// ---------------------------------------------------------------------------
// Geometry helpers. `pbox` is partBox plus a palette-slot UV pin; the optional
// rotations are what stop every rock and every ruin reading as an axis-aligned
// crate.
// ---------------------------------------------------------------------------
function uvSlot(g, slot) {
  const u = ((slot % 8) + 0.5) / 8, v = (((slot / 8) | 0) + 0.5) / 8;
  const a = g.attributes.uv.array;
  for (let i = 0; i < a.length; i += 2) { a[i] = u; a[i + 1] = v; }
  return g;
}
function pbox(w, h, d, x, y, z, slot, kind = 0, ry = 0, rz = 0, rx = 0) {
  const g = partBox(w, h, d, 0, 0, 0, kind);
  if (rz) g.rotateZ(rz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return uvSlot(g, slot);
}
function tag(g, slot, kind = 0) {
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
  return uvSlot(g, slot);
}
// A 4-sided pyramid, turned so its faces square up with the post below it —
// this is the pointed cap that gives the reference railing its silhouette.
function pyramid(r, h, x, y, z, slot, kind = 0) {
  const g = new THREE.ConeGeometry(r, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(x, y + h / 2, z);
  return tag(g, slot, kind);
}

// ---------------------------------------------------------------------------
// Batch: one InstancedMesh, one optional outline shell, one optional
// per-instance variant selector.
// ---------------------------------------------------------------------------
// Collapse every vertex whose kind is not this instance's. It has to land
// AFTER `begin_vertex` and after any outline shell has pushed along the
// normal — collapse first and the outline push re-inflates the corpse into a
// visible speck at the instance origin.
const SELECT_GLSL = `
  transformed *= step(abs(aPart - aWhich), 0.5);
`;
function injectSelect(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s) => {
    if (prev) prev(s);
    s.vertexShader = 'attribute float aPart;\nattribute float aWhich;\n' + s.vertexShader
      .replace('#include <project_vertex>', SELECT_GLSL + '\n#include <project_vertex>');
    mat.userData.shader = s;
  };
  // Programs are deduped by cache key across materials, so a modified source
  // MUST declare itself or three hands us the un-injected program it compiled
  // for something with the same defines.
  mat.customProgramCacheKey = () => 'hb-world-sel' + (mat.side === THREE.BackSide ? '-o' : '')
    + (mat.isMeshDepthMaterial ? '-d' : '');
  return mat;
}

// MANAGER: `toon.js outlineMat()` writes `transformed += normalize(objectNormal)
// * uThick`, but `objectNormal` is declared by `<beginnormal_vertex>`, which
// MeshBasicMaterial only includes when something (envmap, flat shading) asks
// for normals. On a plain BackSide shell it is undefined and the vertex shader
// fails to compile — so EVERY inverted-hull outline in the game is currently
// dead, `makeCrowd`'s included. The fix in toon.js is one word: use `normal`,
// the raw attribute, which is always declared. Patched locally here so world.js
// can ship an outline; please fix it at source.
function worldOutline(thickness, select) {
  const m = outlineMat(thickness, 0x1b2228);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s) => {
    prev(s);
    s.vertexShader = s.vertexShader.replace('normalize(objectNormal)', 'normalize(normal)');
  };
  if (select) injectSelect(m); else m.customProgramCacheKey = () => 'hb-world-out';
  return m;
}

function makeBatch(geo, opts = {}) {
  const max = opts.max || 64;
  const mat = flatMat(0xffffff, { map: opts.map });
  const group = new THREE.Group();
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;             // the bounding sphere of one tile is a lie
  mesh.castShadow = !!opts.castShadow;
  mesh.receiveShadow = !!opts.receiveShadow;
  mesh.count = 0;
  group.add(mesh);

  let which = null, outline = null, om = null, depth = null;
  if (opts.select) {
    which = new Float32Array(max);
    injectSelect(mat);
    // The shadow pass runs its own material, so without the same collapse a
    // crate would cast a watchtower's shadow.
    if (opts.castShadow) {
      depth = injectSelect(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
      mesh.customDepthMaterial = depth;
    }
  }
  if (opts.outline) {
    om = worldOutline(opts.outline, !!opts.select);
    outline = new THREE.InstancedMesh(geo, om, max);
    outline.frustumCulled = false;
    outline.count = 0;
    outline.instanceMatrix = mesh.instanceMatrix;   // one buffer, two draws
    outline.renderOrder = -1;
    group.add(outline);
  }

  const api = {
    group, mesh, outline, material: mat, max, n: 0,
    setGeometry(g) {
      const old = mesh.geometry;
      if (which) g.setAttribute('aWhich', new THREE.InstancedBufferAttribute(which, 1));
      mesh.geometry = g;
      if (outline) outline.geometry = g;
      if (old && old !== g) old.dispose();
    },
    reset() { api.n = 0; },
    // Hand-written 4x4: column 0 is the local X axis scaled by sx, and so on.
    // A Matrix4.compose per instance is measurably slower at 300 instances and
    // allocates a Quaternion nobody reads.
    add(x, y, z, sx, sy, sz, yaw, kind = 0) {
      const i = api.n;
      if (i >= max) return;
      const arr = mesh.instanceMatrix.array;
      const c = Math.cos(yaw), s = Math.sin(yaw), o = i * 16;
      arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = s * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
      if (which) which[i] = kind;
      api.n = i + 1;
    },
    commit() {
      mesh.count = api.n;
      if (outline) outline.count = api.n;
      mesh.instanceMatrix.needsUpdate = true;
      const w = mesh.geometry.attributes.aWhich;
      if (w) w.needsUpdate = true;
    },
    dispose() {
      mesh.geometry.dispose(); mesh.dispose(); mat.dispose();
      if (outline) { outline.dispose(); om.dispose(); }
      if (depth) depth.dispose();
    },
  };
  if (opts.select) api.setGeometry(geo);
  return api;
}

// ---------------------------------------------------------------------------
// Textures. All generated, none downloaded.
// ---------------------------------------------------------------------------

// 8x8 of flat colour, nearest-filtered, no mips: every geometry in the world
// samples exactly one texel of this and that is where its colour comes from.
function paletteTex(themeName, theme) {
  const t = canvasTex('hb.world.pal.' + themeName, 8, 8, (c) => {
    const cols = { ...BASE_PAL, ...(theme.slots || {}) };
    // Rows are drawn bottom-up: a CanvasTexture uploads flipped, so slot row 0
    // has to be the canvas's LAST row to land at v = 1/16.
    for (let i = 0; i < 64; i++) {
      c.fillStyle = hex(cols[i] ?? 0xff00ff);
      c.fillRect(i % 8, 7 - ((i / 8) | 0), 1, 1);
    }
  });
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// The road surface, one 5 m stretch of it. `u` spans the deck across, `v`
// tiles along z — so the lane paint sits at a fixed fraction of the width and
// pinches correctly when a `narrow` section squeezes the deck.
const DECK_U0 = 12 / 128;         // left column is the deck's own side colour
function deckU(frac) { return DECK_U0 + (frac * 0.5 + 0.5) * (1 - DECK_U0); }
function deckTex(themeName, theme) {
  const t = canvasTex('hb.world.deck.' + themeName, 128, 256, (c, W, H) => {
    const half = ROAD.halfW + DECK_OVER;
    c.fillStyle = hex(theme.deck);
    c.fillRect(0, 0, W, H);
    c.fillStyle = hex(theme.slots?.[S.deckSide] ?? BASE_PAL[S.deckSide]);
    c.fillRect(0, 0, 12, H);   // the slab's flanks pin to this column

    // Paving. Rows offset every other course, drawn as mortar lines rather
    // than filled bricks so the road keeps one flat value at a distance.
    const px0 = DECK_U0 * W, pw = W - px0;
    const rows = 5, bw = pw / 5;
    c.strokeStyle = 'rgba(0,0,0,0.13)';
    c.lineWidth = 1.5;
    for (let r = 0; r <= rows; r++) {
      const y = (r / rows) * H;
      c.beginPath(); c.moveTo(px0, y); c.lineTo(W, y); c.stroke();
      const off = (r % 2) * bw * 0.5;
      for (let b = 0; b <= 5; b++) {
        const x = px0 + off + b * bw;
        if (x <= px0 || x >= W) continue;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + H / rows); c.stroke();
      }
    }

    // Shoulder: everything outside the playable half-width is darker, which is
    // the honest way to say "the wall is here, you cannot go further".
    const sh = ROAD.halfW / half;
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(deckU(-1) * W, 0, (deckU(-sh) - deckU(-1)) * W, H);
    c.fillRect(deckU(sh) * W, 0, (deckU(1) - deckU(sh)) * W, H);

    // Lane paint. Solid edge lines at the playable limit, dashed dividers on
    // the 3-lane grid at x = +-1.8 so a gate row reads as three slots even
    // before the gates pop in.
    const line = hex(theme.line);
    c.fillStyle = line;
    c.globalAlpha = 0.85;
    for (const s of [-1, 1]) c.fillRect(deckU(s * (ROAD.halfW - 0.32) / half) * W - 2, 0, 4, H);
    c.globalAlpha = 0.7;
    for (const s of [-1, 1]) {
      const x = deckU(s * 1.8 / half) * W;
      for (let d = 0; d < 2; d++) c.fillRect(x - 2.5, d * (H / 2) + H * 0.08, 5, H * 0.34);
    }
    c.globalAlpha = 1;
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// One texture for the whole finish structure: solid patches the steelwork
// samples, a checker the road strip stretches over, and the banner itself.
function finishTex() {
  // Canvas TOP half is v 0.5..1 (the banner); canvas BOTTOM half is v 0..0.5
  // and holds the two solid patches the steelwork pins to plus the checker the
  // road strip stretches over.
  const t = canvasTex('hb.world.finish', 256, 128, (c, W, H) => {
    const g = c.createLinearGradient(0, 0, 0, H * 0.5);
    g.addColorStop(0, '#a01f1b'); g.addColorStop(1, hex(PAL.signRed));
    c.fillStyle = g; c.fillRect(0, 0, W, H * 0.5);
    c.fillStyle = hex(PAL.signYellow);
    c.fillRect(0, 0, W, 5); c.fillRect(0, H * 0.5 - 5, W, 5);
    signText(c, 'FINISH', W / 2, H * 0.25, W * 0.8, 46);

    c.fillStyle = hex(PAL.steel); c.fillRect(0, H * 0.5, W * 0.25, H * 0.5);
    c.fillStyle = hex(0x3a4149); c.fillRect(W * 0.25, H * 0.5, W * 0.25, H * 0.5);
    for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) {
      c.fillStyle = (i + j) % 2 ? '#f2f4f6' : '#20262c';
      c.fillRect(W * 0.5 + i * (W * 0.5 / 12), H * 0.5 + j * (H * 0.25), W * 0.5 / 12, H * 0.25);
    }
  });
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Sky + hills share one strip: a vertical gradient on the left half, two solid
// silhouette colours on the right. One texture, one unlit draw call.
function skyTex(themeName, theme) {
  const t = canvasTex('hb.world.sky.' + themeName, 8, 64, (c, W, H) => {
    // v = 1 is the canvas top after the flipped upload, so zenith goes at y = 0.
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hex(theme.skyTop));
    g.addColorStop(0.45, hex(theme.skyMid));
    g.addColorStop(1, hex(theme.fog));
    c.fillStyle = g; c.fillRect(0, 0, 4, H);
    c.fillStyle = hex(theme.hillFar); c.fillRect(4, 0, 2, H);
    c.fillStyle = hex(theme.hillNear); c.fillRect(6, 0, 2, H);
  });
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Static geometry: one parapet bay, one deck slab, three bank profiles
// ---------------------------------------------------------------------------

// Local origin sits on the deck at the wall's INNER face, post centred at
// z = 0. Symmetric in z on purpose: the left-hand side is the same instance
// yawed 180 degrees, and a post that was not centred would land half a bay out
// of step with the right-hand side.
function bayGeo() {
  const wall = 0.55, capW = 0.78, post = 0.78, pz = post / 2 + 0.04;
  const g = [
    pbox(0.66, 0.18, BAY, -0.33, 0.09, 0, S.kerb),                     // raised kerb
    pbox(wall, WALL_H, BAY / 2 - pz, wall / 2, WALL_H / 2, -(BAY / 4 + pz / 2), S.wall),
    pbox(wall, WALL_H, BAY / 2 - pz, wall / 2, WALL_H / 2, (BAY / 4 + pz / 2), S.wall),
    pbox(capW, 0.17, BAY / 2 - pz, wall / 2 - 0.05, WALL_H + 0.085, -(BAY / 4 + pz / 2), S.wallCap),
    pbox(capW, 0.17, BAY / 2 - pz, wall / 2 - 0.05, WALL_H + 0.085, (BAY / 4 + pz / 2), S.wallCap),
    pbox(post, POST_H, post, wall / 2 - 0.02, POST_H / 2, 0, S.post),
    pyramid(0.64, 0.62, wall / 2 - 0.02, POST_H, 0, S.postCap),
  ];
  return mergeParts(g);
}

// A 1 m wide slab, scaled per instance to the deck width at that z. Custom UVs:
// the top face spans the paving texture across, the flanks pin to its side
// colour column.
function deckGeo() {
  const g = partBox(1, DECK_THICK, SUB, 0, -DECK_THICK / 2, 0, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > -0.01;
    const v = p.getZ(i) / SUB + 0.5;
    uv.setXY(i, top ? deckU(p.getX(i) * 2) : DECK_U0 * 0.5, v);
  }
  return g;
}

// Three stepped riprap profiles, terraced rather than smooth because a flat-
// shaded ramp reads as a bug and a staircase of chunks reads as rock. Local
// x = 0 is the deck's outer edge; the instance scales x by the theme's bank
// width, which is what turns a valley's narrow shoulder into a town's wide lot.
// [ x0, width, centreY, height, slot ]. Profiles 0-2 are the shoulder in three
// flavours, dealt out by slab index so a straight run of road does not repeat
// the same rock every 5 m. Profile 3 is the far shore: a separate landmass a
// valley level parks across the water so its trees have something to stand on.
const BANK_STEPS = [
  [[0.0, 1.7, -1.15, 0.55, S.bankTop], [1.5, 2.4, -1.95, 1.05, S.bankMid], [3.6, 3.2, -2.85, 1.3, S.bankRock], [6.5, 3.6, -3.9, 1.6, S.bankRock], [0.0, 11.0, -5.6, 3.6, S.bankRock]],
  [[0.0, 2.1, -1.05, 0.5, S.bankTop], [1.9, 2.0, -2.1, 1.2, S.bankMid], [3.6, 3.0, -2.7, 1.1, S.bankRock], [6.2, 4.2, -3.8, 1.7, S.bankRock], [0.0, 11.0, -5.6, 3.6, S.bankRock]],
  [[0.0, 4.5, -2.65, 1.5, S.bankRock], [3.6, 16.0, -1.95, 1.3, S.bankTop]],
];
// Two shoulder profiles, not three: every instance carries the vertices of
// EVERY variant and throws away the ones it is not, so a third flavour of rock
// costs 288 instances' worth of degenerate triangles for variety nobody sees.
const SHORE = 2;
function bankGeo() {
  const g = [];
  BANK_STEPS.forEach((prof, k) => {
    for (const [x0, w, y, h, slot] of prof) g.push(pbox(w, h, SUB + 0.02, x0 + w / 2, y, 0, slot, k));
  });
  return mergeParts(g);
}
// Top surface of whichever terrace covers `dx`, so a ruin sits ON the bank
// rather than half-buried in it. Steps, not a lerp: the bank IS steps.
function bankYAt(dx, scale, drop) {
  const u = dx / scale;
  let y = -4.4;
  for (const [x0, w, cy, h] of BANK_STEPS[0]) if (cy > -4 && u >= x0 - 0.3 && u <= x0 + w) y = cy + h / 2;
  return y * drop;
}

// ---------------------------------------------------------------------------
// Decor. Every theme picks three; the geometry is built from just those three,
// so a level never pays vertex cost for a shape it cannot spawn.
// ---------------------------------------------------------------------------
const DECOR = {
  pine: (k) => [
    pbox(0.34, 1.5, 0.34, 0, 0.75, 0, S.decorC, k),
    pbox(2.3, 1.1, 2.3, 0, 1.7, 0, S.decorA, k, 0.4),
    pbox(1.7, 1.0, 1.7, 0, 2.6, 0, S.decorA, k, 0.9),
    pbox(1.0, 0.9, 1.0, 0, 3.4, 0, S.decorA, k, 0.2),
  ],
  tree: (k) => [
    pbox(0.5, 1.9, 0.5, 0, 0.95, 0, S.decorC, k),
    pbox(3.0, 2.0, 3.0, 0, 2.7, 0, S.decorA, k, 0.5),
    pbox(2.0, 1.2, 2.0, 0.3, 3.9, -0.2, S.decorA, k, 1.1),
  ],
  shrub: (k) => [
    pbox(1.5, 0.8, 1.4, 0, 0.4, 0, S.decorA, k, 0.3),
    pbox(1.0, 0.6, 1.0, 0.5, 0.75, 0.3, S.decorD, k, 0.8),
  ],
  rock: (k) => [
    pbox(1.9, 1.3, 1.7, 0, 0.5, 0, S.bankRock, k, 0.6, 0.12),
    pbox(1.2, 1.0, 1.3, 0.9, 0.35, 0.6, S.decorB, k, 1.2, -0.1),
    pbox(0.8, 0.7, 0.8, -0.7, 0.3, -0.5, S.bankRock, k, 0.3),
  ],
  ruin: (k) => [
    pbox(4.4, 3.4, 3.6, 0, 1.7, 0, S.decorA, k),
    pbox(1.8, 5.6, 1.8, -1.5, 2.8, -0.9, S.decorA, k, 0.08),
    pbox(1.1, 1.1, 0.3, 1.0, 2.3, 1.85, S.decorD, k),
    pbox(1.1, 1.1, 0.3, -0.6, 2.3, 1.85, S.decorD, k),
    pbox(3.0, 0.5, 2.4, 1.4, 3.3, 0.4, S.decorB, k, 0.2, -0.22),
  ],
  rubble: (k) => [
    pbox(1.6, 0.7, 1.4, 0, 0.35, 0, S.decorB, k, 0.4),
    pbox(1.0, 0.9, 0.9, 0.9, 0.45, 0.5, S.decorA, k, 1.0, 0.2),
    pbox(2.2, 0.35, 0.8, -0.7, 0.5, -0.4, S.decorA, k, 0.7, -0.35),
  ],
  pole: (k) => [
    pbox(0.3, 6.0, 0.3, 0, 3.0, 0, S.decorD, k, 0, 0.09),
    pbox(2.4, 0.24, 0.24, 0.1, 5.6, 0, S.decorD, k, 0, 0.09),
  ],
  dune: (k) => [
    pbox(7.0, 1.5, 5.0, 0, 0.5, 0, S.decorA, k, 0.35),
    pbox(4.2, 1.2, 3.0, 1.2, 1.3, 0.5, S.decorA, k, 0.7),
  ],
  deadtree: (k) => [
    pbox(0.42, 3.4, 0.42, 0, 1.7, 0, S.decorC, k),
    pbox(0.26, 1.9, 0.26, 0.55, 2.7, 0, S.decorC, k, 0, 0.7),
    pbox(0.24, 1.6, 0.24, -0.45, 2.9, 0.2, S.decorC, k, 0, -0.6),
  ],
  crater: (k) => [
    pbox(5.6, 0.5, 5.0, 0, -0.1, 0, S.decorB, k, 0.3),
    pbox(6.6, 0.55, 6.0, 0, -0.45, 0, S.decorA, k, 0.7),
    pbox(1.4, 0.6, 1.2, 2.6, 0.15, 1.4, S.decorA, k, 0.9),
  ],
  wreckD: (k) => [
    pbox(4.4, 1.3, 2.2, 0, 0.65, 0, S.decorD, k, 0.25),
    pbox(2.2, 1.0, 1.9, -0.6, 1.6, 0, S.decorD, k, 0.25),
    pbox(0.5, 1.0, 1.0, 1.6, 0.5, 1.0, S.decorC, k, 0.25, 0.6),
  ],
  // A column, not a monolith: it has to taper and lean or it reads as a tower.
  smoke: (k) => [
    pbox(2.6, 0.9, 2.2, 0, 0.45, 0, S.decorB, k, 0.4),
    pbox(1.45, 3.2, 1.45, 0.2, 2.3, 0.1, S.smoke, k, 0.5, 0.06),
    pbox(1.05, 3.0, 1.05, 0.75, 5.3, 0.35, S.smoke, k, 1.0, 0.11),
    pbox(0.7, 2.6, 0.7, 1.55, 8.0, 0.8, S.smoke, k, 0.3, 0.15),
  ],
  fence: (k) => [
    pbox(0.16, 1.1, 0.16, -1.6, 0.55, 0, S.decorC, k),
    pbox(0.16, 1.1, 0.16, 1.6, 0.55, 0, S.decorC, k),
    pbox(3.4, 0.12, 0.1, 0, 0.95, 0, S.decorC, k),
    pbox(3.4, 0.12, 0.1, 0, 0.6, 0, S.decorC, k),
  ],
  hay: (k) => [
    pbox(1.9, 1.4, 1.9, 0, 0.7, 0, S.decorD, k, 0.3),
    pbox(1.5, 1.1, 1.5, 1.7, 0.55, 0.4, S.decorD, k, 0.9),
  ],
};

// ---------------------------------------------------------------------------
// Level props. All four always exist — a level can ask for any of them and
// the selector shader means the unused ones cost nothing per frame.
// ---------------------------------------------------------------------------
const PROPS = ['sandbags', 'wreck', 'tower', 'crate'];
const PROP_GEO = {
  sandbags: (k) => {
    const g = [];
    for (let r = 0; r < 3; r++) {
      const n = 4 - r, w = 0.78;
      for (let i = 0; i < n; i++) {
        g.push(pbox(w, 0.34, 0.62, (i - (n - 1) / 2) * w, 0.17 + r * 0.32, 0,
          r % 2 ? S.sandbag : S.decorD, k, (i + r) * 0.11));
      }
    }
    return g;
  },
  wreck: (k) => [
    pbox(4.2, 1.1, 2.0, 0, 0.55, 0, S.rust, k),
    pbox(2.0, 0.9, 1.8, -0.7, 1.5, 0, S.rust, k, 0.06),
    pbox(0.6, 0.6, 0.5, 1.5, 0.3, 0.9, S.dark, k, 0, 0.5),
    pbox(0.6, 0.6, 0.5, -1.5, 0.3, -0.9, S.dark, k, 0, 0.3),
  ],
  tower: (k) => [
    pbox(0.3, 4.6, 0.3, -0.9, 2.3, -0.9, S.woodDark, k),
    pbox(0.3, 4.6, 0.3, 0.9, 2.3, -0.9, S.woodDark, k),
    pbox(0.3, 4.6, 0.3, -0.9, 2.3, 0.9, S.woodDark, k),
    pbox(0.3, 4.6, 0.3, 0.9, 2.3, 0.9, S.woodDark, k),
    pbox(2.6, 0.24, 2.6, 0, 4.7, 0, S.wood, k),
    pbox(2.7, 0.9, 0.22, 0, 5.15, -1.3, S.wood, k),
    pbox(2.7, 0.9, 0.22, 0, 5.15, 1.3, S.wood, k),
    pbox(3.2, 0.3, 3.2, 0, 5.9, 0, S.steel, k),
  ],
  crate: (k) => [
    pbox(1.2, 1.1, 1.2, 0, 0.55, 0, S.wood, k),
    pbox(1.28, 0.16, 0.16, 0, 0.55, 0.6, S.woodDark, k),
    pbox(0.16, 0.16, 1.28, 0.6, 0.55, 0, S.woodDark, k),
    pbox(0.9, 0.85, 0.9, 0.35, 1.53, -0.2, S.wood, k, 0.5),
  ],
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
let ctxRef = null, quality = null, group = null;
let deck = null, bank = null, bays = null, decor = null, props = null;
let water = null, waterMat = null, waterUniforms = null;
let sky = null, skyMat = null;
let finish = null, finishBanner = null, finishZ = 0;

let theme = THEMES.valley, themeName = 'valley';
let narrows = [], propItems = [];
let tilesAhead = 5, tileFrom = 1e9, poolTiles = 9, revealAt = 170;
let decorGeoCache = new Map();
const tmpV = new THREE.Vector3();

// ---------------------------------------------------------------------------
// The one thing other systems need from here
// ---------------------------------------------------------------------------

/**
 * Playable half-width at a given z. Constant at ROAD.halfW except inside a
 * `{kind:'narrow'}` item, where it eases down over TAPER metres at each end —
 * a hard step would let the squad's outer men clip through the parapet on the
 * frame the pinch starts.
 */
export function roadHalfAt(z) {
  let h = ROAD.halfW;
  for (let i = 0; i < narrows.length; i++) {
    const n = narrows[i];
    const a = n.z - TAPER, b = n.z + n.len + TAPER;
    if (z <= a || z >= b) continue;
    const t = z < n.z ? (z - a) / TAPER
      : z > n.z + n.len ? (b - z) / TAPER : 1;
    const w = lerp(ROAD.halfW, n.halfW, smoothstep(clamp(t, 0, 1)));
    if (w < h) h = w;
  }
  return h;
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
export function initWorld(ctx) {
  ctxRef = ctx;
  quality = ctx.quality || { shadows: false, water: false, particles: 1 };
  group = new THREE.Group();
  group.name = 'world';

  // Only build as much road as the fog can actually show. Past fog.far every
  // pixel is fog colour, and because the backdrop draws with depth testing off
  // that fog-coloured road would paint over the mountains.
  const far = ctxRef.scene.fog?.far ?? 185;
  tilesAhead = Math.max(2, Math.min(ROAD.segAhead, Math.ceil((far + 25) / ROAD.segLen)));
  revealAt = far - 18;
  poolTiles = tilesAhead + ROAD.segBehind + 1;
  const subs = poolTiles * Math.ceil(ROAD.segLen / SUB);
  const shadows = !!quality.shadows;

  deck = makeBatch(deckGeo(), { max: subs, receiveShadow: shadows });
  bank = makeBatch(bankGeo(), { max: subs * 4, select: true, receiveShadow: shadows });
  bays = makeBatch(bayGeo(), { max: subs * 2 + 4, outline: 0.07, castShadow: shadows });
  decor = makeBatch(new THREE.BufferGeometry(), { max: 96, select: true, outline: 0.05, castShadow: false });
  props = makeBatch(buildKindGeo(PROPS, PROP_GEO), { max: 48, select: true, outline: 0.045, castShadow: shadows });

  group.add(deck.group, bank.group, bays.group, decor.group, props.group);

  buildWater();
  buildSky();
  ctx.scene.add(group);

  applyTheme('valley');
  rebuild(true);
  return group;
}

// One `r()` either way, so adding a weight never reshuffles a level's decor.
// Weights exist because an unweighted third of a war zone being smoke columns
// reads as a forest of grey monoliths.
function pickKind(u, w) {
  if (!w) return 0;
  let t = u * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { t -= w[i]; if (t <= 0) return i; }
  return w.length - 1;
}

function buildKindGeo(names, table) {
  const g = [];
  names.forEach((n, k) => { for (const part of table[n](k)) g.push(part); });
  return mergeParts(g);
}

// The water is one plane that rides along with the squad. The ripple is
// evaluated from WORLD position, not local, so the wave pattern stays put
// while the plane slides under it — otherwise the whole river appears to
// travel with you, which reads as the road standing still.
function buildWater() {
  const seg = quality.water ? 30 : 1;
  const g = new THREE.PlaneGeometry(520, 900, seg, seg * 2);
  g.rotateX(-Math.PI / 2);
  waterUniforms = { uTime: { value: 0 }, uCrest: { value: new THREE.Color(PAL.water) },
                    uAmp: { value: 1 } };
  waterMat = flatMat(PAL.waterDeep);
  if (quality.water) {
    waterMat.onBeforeCompile = (s) => {
      s.uniforms.uTime = waterUniforms.uTime;
      s.uniforms.uCrest = waterUniforms.uCrest;
      s.uniforms.uAmp = waterUniforms.uAmp;
      s.vertexShader = 'uniform float uTime;\nuniform float uAmp;\nvarying float vCrest;\n' + s.vertexShader.replace(
        '#include <begin_vertex>', `#include <begin_vertex>
        vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float w = sin(wp.x * 0.33 + uTime * 1.05)
                + sin(wp.z * 0.24 - uTime * 0.80) * 0.9
                + sin((wp.x + wp.z) * 0.11 + uTime * 0.45) * 1.1;
        w *= uAmp;
        transformed.y += w * 0.13;
        vCrest = w;`
      );
      s.fragmentShader = 'uniform vec3 uCrest;\nvarying float vCrest;\n' + s.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, uCrest, smoothstep(0.15, 1.9, vCrest));'
      );
      waterMat.userData.shader = s;
    };
    waterMat.customProgramCacheKey = () => 'hb-water';
  }
  water = new THREE.Mesh(g, waterMat);
  water.position.y = ROAD.waterY;
  water.frustumCulled = false;
  group.add(water);
}

// Sky dome and two mountain bands in ONE unlit geometry. Depth testing is off
// and renderOrder is far negative, so it lays down a backdrop before anything
// else draws and never fights the road for the depth buffer. Triangle order
// inside the buffer is what puts the near ridge over the far one.
function buildSky() {
  const R = 340, SEGS = 72;
  const pos = [], uv = [], idx = [];
  const push = (x, y, z, u, v) => { pos.push(x, y, z); uv.push(u, v); return pos.length / 3 - 1; };

  // Dome: a tall cylinder in five rings, crowded into the bottom. The camera is
  // pitched ~24 degrees down inside a ~58 degree frame, so only about FIVE
  // degrees of sky is ever on screen — at R=340 that is everything below y=30.
  // A gradient mapped evenly up the cylinder puts its whole range off the top of
  // the frame and the sky reads as one flat wash.
  const RING = [[-170, 0.0], [2, 0.05], [12, 0.42], [30, 0.80], [270, 1.0]];
  for (let i = 0; i <= SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2, cx = Math.cos(a) * R, cz = Math.sin(a) * R;
    const col = RING.map(([y, v]) => push(cx, y, cz, 0.25, v));
    if (i > 0) for (let r = 0; r < RING.length - 1; r++) {
      const lo = col[r], hi = col[r + 1], plo = lo - RING.length, phi = hi - RING.length;
      idx.push(phi, plo, lo, phi, lo, hi);
    }
  }
  // two ridge bands. `hash` is a fixed pseudo-noise so the horizon is the same
  // silhouette every run — a mountain that re-rolls on reset reads as a glitch.
  const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const band = (rad, u, base, lo, hi, salt) => {
    for (let i = 0; i <= SEGS; i++) {
      const a = (i / SEGS) * Math.PI * 2;
      const h = base + lerp(lo, hi, hash(i + salt) * 0.6 + hash(i * 0.37 + salt) * 0.4);
      const t = push(Math.cos(a) * rad, h, Math.sin(a) * rad, u, 0.5);
      const b = push(Math.cos(a) * rad, -220, Math.sin(a) * rad, u, 0.5);
      if (i > 0) idx.push(t - 2, b - 2, b, t - 2, b, t);
    }
  };
  // Peaks are sized in the same five visible degrees: at R=300 a 22 m ridge is
  // about 4 degrees tall, which is a mountain range on the horizon rather than
  // a wall of triangles filling the top third of a portrait frame.
  band(300, 0.625, -4, 7, 24, 3.1);
  band(238, 0.875, -6, 4, 14, 11.7);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  skyMat = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide, fog: false, depthTest: false, depthWrite: false,
  });
  sky = new THREE.Mesh(g, skyMat);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  group.add(sky);
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function applyTheme(name) {
  theme = THEMES[name] || THEMES.valley;
  themeName = THEMES[name] ? name : 'valley';

  const pal = paletteTex(themeName, theme);
  for (const b of [bank, bays, decor, props]) { b.material.map = pal; b.material.needsUpdate = true; }
  deck.material.map = deckTex(themeName, theme);
  deck.material.needsUpdate = true;
  skyMat.map = skyTex(themeName, theme);
  skyMat.needsUpdate = true;

  waterMat.color.set(theme.low);
  waterUniforms.uCrest.value.set(theme.crest);
  // The low plane is the river in `valley` and dry ground everywhere else; the
  // same mesh does both, and the ripple is what tells them apart.
  waterUniforms.uAmp.value = theme.ripple ? 1 : 0;

  // The fog colour is the horizon, so it has to move with the theme or a
  // desert road fades into a blue-grey valley haze. render.js owns the Fog
  // object; we only repaint it.
  if (ctxRef.scene.fog) ctxRef.scene.fog.color.set(theme.fog);

  let g = decorGeoCache.get(themeName);
  if (!g) { g = buildKindGeo(theme.decor, DECOR); decorGeoCache.set(themeName, g); }
  decor.setGeometry(g);
}

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------
export function resetWorld(level) {
  narrows = [];
  propItems = [];
  for (const it of level?.items || []) {
    if (it.kind === 'narrow') narrows.push({ z: it.z, len: it.len || 30, halfW: Math.min(ROAD.halfW, it.halfW ?? 3.2) });
    else if (it.kind === 'prop') propItems.push(it);
  }
  propItems.sort((a, b) => a.z - b.z);

  applyTheme(level?.theme || 'valley');
  buildFinish(level?.length ?? 600);
  tileFrom = 1e9;                  // force a full instance rewrite next update
  rebuild(true);
}

// A gate the player is running AT. Two towers, a beam, a banner big enough to
// read at 150 m, and a checker strip on the deck so the last metre is obvious
// even when the arch is above the top of a portrait frame.
function buildFinish(zEnd) {
  if (finish) { group.remove(finish); disposeTree(finish); finish = null; }
  if (finishBanner) { group.remove(finishBanner); disposeTree(finishBanner); finishBanner = null; }

  const half = roadHalfAt(zEnd) + DECK_OVER + 0.5;
  const H = 7.4;
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(pbox(1.5, H, 1.5, s * half, H / 2, 0, S.steel));
    parts.push(pbox(2.0, 0.5, 2.0, s * half, 0.25, 0, S.dark));
    parts.push(pbox(1.9, 0.4, 1.9, s * half, H - 0.2, 0, S.dark));
    parts.push(pbox(0.5, 1.5, 0.5, s * (half - 0.9), H + 0.6, 0, S.steel));
  }
  parts.push(pbox(half * 2, 0.6, 1.0, 0, H + 0.3, 0, S.steel));
  const structure = mergeParts(parts);
  const tex = finishTex();
  // The steel samples the solid patch at the texture's left; only the banner
  // and the road checker use real image area.
  const uvs = structure.attributes.uv.array;
  for (let i = 0; i < uvs.length; i += 2) { uvs[i] = 0.12; uvs[i + 1] = 0.25; }

  const mat = flatMat(0xffffff, { map: tex });
  finish = new THREE.Mesh(structure, mat);
  finish.position.z = zEnd;
  finish.castShadow = !!quality.shadows;
  const shell = new THREE.Mesh(structure, worldOutline(0.06, false));
  shell.renderOrder = -1;
  finish.add(shell);
  group.add(finish);

  // Banner + checker share one geometry so the level's biggest landmark is
  // two draws, not five.
  // Turned to face back down the road: seen from behind through a DoubleSide
  // material the lettering would read in a mirror.
  const banner = new THREE.PlaneGeometry(half * 2 - 0.6, 2.6);
  banner.rotateY(Math.PI);
  banner.translate(0, H - 2.1, -0.85);
  const strip = new THREE.PlaneGeometry(half * 2, 3.2);
  strip.rotateX(-Math.PI / 2);
  strip.translate(0, 0.02, -1.9);
  setPlaneUV(banner, 0, 1, 0.5, 1);
  setPlaneUV(strip, 0.5, 1, 0, 0.5);
  finishBanner = new THREE.Mesh(mergePlanes([banner, strip]), flatMat(0xffffff, { map: tex, side: THREE.DoubleSide }));
  finishBanner.position.z = zEnd;
  group.add(finishBanner);
  finishZ = zEnd;
}

function setPlaneUV(g, u0, u1, v0, v1) {
  const uv = g.attributes.uv.array;
  for (let i = 0; i < uv.length; i += 2) {
    uv[i] = lerp(u0, u1, uv[i]);
    uv[i + 1] = lerp(v0, v1, uv[i + 1]);
  }
}
// mergeParts insists on `aPart`; these two quads have no business carrying one.
function mergePlanes(list) {
  for (const g of list) {
    const n = g.attributes.position.count;
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n), 1));
  }
  return mergeParts(list);
}

// ---------------------------------------------------------------------------
// Recycling. Everything below runs only when the tile window moves.
// ---------------------------------------------------------------------------
function rebuild(force) {
  const tile = Math.floor(state.z / ROAD.segLen);
  const from = tile - ROAD.segBehind;
  if (!force && from === tileFrom) return;
  tileFrom = from;

  const z0 = from * ROAD.segLen;
  const z1 = (from + poolTiles) * ROAD.segLen;
  const bs = theme.bankScale;

  deck.reset(); bank.reset(); bays.reset(); decor.reset(); props.reset();

  // Deck + banks, one 5 m slab at a time. The slab is where narrowing lives:
  // each slab takes the half-width at its own centre, so a taper becomes a
  // short flight of steps rather than a single ugly seam.
  const drop = theme.bankDrop, by = theme.bankY || 0;
  for (let z = z0; z < z1; z += SUB) {
    const c = z + SUB / 2;
    const halfAt = roadHalfAt(c), half = halfAt + DECK_OVER;
    deck.add(0, 0, c, half * 2, 1, 1, 0);
    // The parapet is emitted from the SAME half-width sample as the slab it
    // stands on. Sampled independently it lags the deck by half a slab and the
    // wall visibly hangs off the edge for the length of a `narrow` taper.
    bays.add(halfAt, 0, c, 1, 1, 1, 0);
    bays.add(-halfAt, 0, c, 1, 1, 1, Math.PI);
    // `>>> 0`-safe modulo: the window starts at a negative z behind the squad
    // and a negative `aWhich` matches no kind at all, so the bank vanishes.
    const k = (((z / SUB) | 0) % SHORE + SHORE) % SHORE;
    bank.add(half, by, c, bs, drop, 1, 0, k);
    bank.add(-half, by, c, bs, drop, 1, Math.PI, (k + 1) % SHORE);
    // The far shore has no detail worth resolving at 5 m, so it goes in 20 m
    // lengths and costs a quarter of the instances.
    if (theme.shore && ((z / SUB) | 0) % 4 === 0) {
      const zc = z + SUB * 2;
      bank.add(half + theme.shore, 0, zc, 1.2, 1, 4, 0, SHORE);
      bank.add(-(half + theme.shore), 0, zc, 1.2, 1, 4, Math.PI, SHORE);
    }
  }

  // Theme decor. Seeded off the tile index, so a tile recycled back into view
  // 200 m later comes back with the same trees on it.
  const band = theme.decorBand;
  const density = Math.round(4 * clamp(quality.particles ?? 1, 0.3, 1)) + 1;
  for (let t = from; t < from + poolTiles; t++) {
    const r = mulberry32(t * 9176 + 7);
    for (let i = 0; i < density; i++) {
      const s = r() < 0.5 ? -1 : 1;
      const z = (t + r()) * ROAD.segLen;
      const half = roadHalfAt(z) + DECK_OVER;
      const dx = band[0] + r() * (band[1] - band[0]);
      const sc = 0.8 + r() * 0.65;
      const y = theme.shore ? theme.decorY : bankYAt(dx, bs, drop) + by;
      decor.add(s * (half + dx), y + 0.15, z, sc, sc, sc, r() * 6.283, pickKind(r(), theme.decorW));
    }
  }

  // Level props sit at absolute z; binary search would be overkill for a list
  // this short and this rarely walked. A prop the generator put just off the
  // road gets pushed clear of the parapet rather than half-swallowed by it —
  // levels place props by lane, not by wall thickness.
  for (let i = 0; i < propItems.length; i++) {
    const p = propItems[i];
    if (p.z < z0) continue;
    if (p.z > z1) break;
    const k = Math.max(0, PROPS.indexOf(p.id));
    const half = roadHalfAt(p.z);
    let x = p.x ?? 0, y = 0;
    if (Math.abs(x) > half) {
      const s = Math.sign(x);
      x = s * Math.max(Math.abs(x), half + DECK_OVER + 2.4);
      y = bankYAt(Math.abs(x) - half - DECK_OVER, bs, drop) + by;
    }
    props.add(x, y, p.z, 1, 1, 1, (p.yaw ?? 0), k);
  }

  deck.commit(); bank.commit(); bays.commit(); decor.commit(); props.commit();
}

// ---------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------
export function updateWorld(dt) {
  if (!group) return;
  rebuild(false);

  waterUniforms.uTime.value += dt;
  // Slide the plane in whole 20 m steps rather than continuously: the ripple is
  // world-space so it does not matter visually, and a stepped position keeps
  // the far edge from creeping into the fog boundary and shimmering.
  water.position.z = Math.round(state.z / 20) * 20 + 260;

  // The arch sits at the END of the level, which is usually further than the
  // road we build. Left visible it hangs in the haze above the horizon with no
  // ground under it — and it costs three draws to do that. Reveal it only once
  // there is road beneath it.
  const near = finishZ - state.z < revealAt;
  if (finish) finish.visible = near;
  if (finishBanner) finishBanner.visible = near;

  const cam = ctxRef.camera;
  if (cam) {
    cam.getWorldPosition(tmpV);
    sky.position.set(tmpV.x, 0, tmpV.z);
  }
}

export function disposeWorld() {
  if (!group) return;
  for (const b of [deck, bank, bays, decor, props]) b?.dispose();
  water?.geometry.dispose(); waterMat?.dispose();
  sky?.geometry.dispose(); skyMat?.dispose();
  if (finish) disposeTree(finish);
  if (finishBanner) disposeTree(finishBanner);
  for (const g of decorGeoCache.values()) g.dispose();
  decorGeoCache.clear();
  group.parent?.remove(group);
  group = null; deck = bank = bays = decor = props = null;
  water = sky = finish = finishBanner = null;
  narrows = []; propItems = [];
}

function disposeTree(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => m.dispose());
  });
}

// Anything that wants to know how many of the frame's draw calls are ours.
export function worldDrawCalls() {
  let n = 0;
  group?.traverse((o) => { if (o.isMesh && (o.count === undefined || o.count > 0)) n++; });
  return n;
}
