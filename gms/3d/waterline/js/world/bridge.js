// The bridge — C2 owns this file.
//
// object3D's origin is the waterline (y=0), centred; the room group sits at ROOM.deck above it.
// Room space: +Z is forward (out of the window), +X is starboard, y=0 is the deck plate.
//
// Everything repeated is an InstancedMesh, so the whole room — ~60 consoles, pods, racks, pillars
// and crew, plus ~70 lit displays — costs about twenty draw calls. The displays are one mesh
// sampling one atlas with a per-instance tile, which is what buys the wall of individually
// different instruments the reference plates have and a repeated sprite does not.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial } from './materials/index.js';
import { ATLAS_TILES, setEnvIntensity } from './materials/bridge.js';
import { pumpTables } from './table.js';
import { TABLE } from '../config.js';
import { defineScenario, frameCamera } from '../scenarios.js';
import { GRADES as SKY_GRADES } from './sky.js';
import {
  bevelBox, place, faceQuad, instanced, tileUV, setColour,
  radialTexture, haloTexture, lensTexture, spillTexture, deckWearTexture, contactMaterial,
  additive, rimMaterial, pendantLamp,
} from './bridgeKit.js';
import { bakeStatic } from './merge.js';

export const ROOM = { w: 11.4, d: 7.2, h: 2.68, deck: 18, sill: 1.02, head: 2.18 };

// The room's OUTSIDE. Every plate in the compartment faces inward, so before this the bridge was
// invisible from the sea and the fly-in arrived in a room with no building around it. `pedestal` is
// how far the house reaches below its own deck to meet the flagship's tower; `wing` is the
// half-width of the open bridge wings, which is what makes the silhouette read as a bridge.
const HOUSE = { skin: 0.24, pedestal: 1.95, wing: 7.60, eave: 0.55 };

// Where the deckhead fixtures physically are. The geometry and the lamps that go with them are
// both built from this, so a red practical can never end up lighting a place it is not mounted.
const OVERHEAD = [
  { x: 0, z: -1.55, col: 0xff2f18, i: 5.0 },
  { x: 0, z: 2.05, col: 0xff3d1c, i: 4.2 },
  { x: -4.55, z: 0.20, col: 0xff2a14, i: 3.6 },
  { x: 4.55, z: 0.20, col: 0xff2a14, i: 3.6 },
];

// The forward bay, in room space. Three window runs: port wing, centre, starboard wing.
const BAY = [
  [-ROOM.w / 2, ROOM.d / 2 - 1.35],
  [-ROOM.w * 0.315, ROOM.d / 2],
  [ROOM.w * 0.315, ROOM.d / 2],
  [ROOM.w / 2, ROOM.d / 2 - 1.35],
];

// Interior lamps, priority order — bridgeLights.js refills its pool from the top of whichever rig
// is active. Positions are ROOM space; bridgeLights adds ROOM.deck itself.
//
// Every entry here answers to something visible: the plot glass, a deckhead fixture, a bank of
// screens, the pendant bulb. `hemi` is the only non-diegetic term and it exists so that unlit
// steel sits at ~8% rather than at zero — a dark room is not a black room.
const TH = TABLE.height;

const deckhead = (s = 1, y = ROOM.h - 0.18) =>
  OVERHEAD.map(o => ({ pos: [o.x, y, o.z], colour: o.col, intensity: o.i * s, distance: 6.4 }));

// The four long fixtures over the aft equipment wall. They had geometry and no lamp, which is why
// the aft third of every shot was a void — an emissive with nothing behind it lights nothing.
const AFT_FIXTURES = [-1.5, -0.5, 0.5, 1.5].map(k => [k * 2.7, -ROOM.d / 2 + 1.6]);
const aftDeckhead = (colour, intensity, distance = 4.2) =>
  AFT_FIXTURES.map(([x, z]) => ({ pos: [x, ROOM.h - 0.22, z], colour, intensity, distance, decay: 1.5 }));

// The rig's `hemi` is the room's ambient floor. Dark is not the same thing as absent: the
// professional plates hold a median luma near 20-30 with literally zero dead pixels, and they get
// there from bounce, not from exposure. `sky` is tinted to the compartment's dominant practical,
// `ground` is the deck bouncing back up at the deckhead. ACES maps anything below ~0.012 scene
// radiance to exactly zero, so this has to be a real irradiance and not a rounding error.
export const RIGS = {
  bridge: {
    hemi: { sky: 0x9a8a86, ground: 0x4d4650, intensity: 0.62 },
    lamps: [
      // The plot glass, above and below. The upper one sits well clear of the paper with a shallow
      // decay: a 2.3 m sheet of glowing glass is an AREA source, and a point light 15 cm above it
      // blows the middle of the chart to white while the corners stay dark.
      { pos: [0, TH + 0.62, 0.15], colour: 0x63d2ee, intensity: 2.6, distance: 5.2, decay: 1.15 },
      // 5 cm above the surface with a 2.2 m reach and almost no decay. A horizontal emissive panel
      // throws a grazing wash under its own overhang: this is what puts the skirt, the pedestal and
      // the deck on one continuous falloff instead of a painted decal with an edge.
      { pos: [0, TH + 0.05, 0.15], colour: 0x5cc4e2, intensity: 1.7, distance: 2.2, decay: 0.9 },
      { pos: [0, TH - 0.30, 0.15], colour: 0x4fb7d6, intensity: 1.5, distance: 3.2, decay: 1.4 },
      ...deckhead(1),
      ...aftDeckhead(0xff5a2c, 1.5),
      { pos: [-4.85, 0.98, 1.62], colour: 0xffc178, intensity: 1.6, distance: 2.4, decay: 1.5 },
      // forward console screens washing up onto the bay frame and down onto their own faces
      { pos: [-3.30, 1.22, 2.62], colour: 0x2fd08a, intensity: 1.5, distance: 2.5 },
      { pos: [0.10, 1.22, 3.10], colour: 0x3ec4e8, intensity: 1.5, distance: 2.5 },
      { pos: [3.30, 1.22, 2.62], colour: 0xffa93c, intensity: 1.3, distance: 2.4 },
      // side racks and the aft equipment wall
      { pos: [-5.05, 1.42, -0.45], colour: 0x2fd08a, intensity: 1.6, distance: 2.6 },
      { pos: [5.05, 1.42, -0.45], colour: 0x3ec4e8, intensity: 1.6, distance: 2.6 },
      { pos: [-2.0, 1.35, -3.12], colour: 0x35c8a0, intensity: 1.2, distance: 2.4 },
      { pos: [2.0, 1.35, -3.12], colour: 0x3ec4e8, intensity: 1.2, distance: 2.4 },
      { pos: [0, 1.9, -3.20], colour: 0x2f5c86, intensity: 1.4, distance: 4.5 },
    ],
  },

  // One warm lamp over the chart and almost nothing else — 494840_09's model. The pendant is a
  // shadow-casting spot: the ruler's shadow on the paper is this shot's most legible detail.
  chart: {
    hemi: { sky: 0xa08a68, ground: 0x7b7061, intensity: 1.55 },
    lamps: [
      {
        pos: [-0.26, TH + 0.92, -0.08], colour: 0xffbe80, intensity: 5.2, distance: 6.0, decay: 1.30,
        spot: { at: [-0.26, 0, -0.08], angle: 0.92, penumbra: 0.85 }, shadow: true,
      },
      // the bounce off the paper — warm, wide, weak, and it is what stops the pool ending in a
      // hard step at the table edge
      { pos: [-0.20, TH - 0.06, 0.02], colour: 0xd98a44, intensity: 3.4, distance: 5.4, decay: 1.2 },
      // one bounce off the chart, aimed back up. The deckhead directly over a lit sheet of paper
      // 90 cm below it cannot be black.
      { pos: [-0.24, TH + 0.10, -0.04], colour: 0xc08048, intensity: 1.5, distance: 3.0, decay: 1.0 },
      // The off-key practicals. Without these the compartment is one pool and four black walls;
      // with them there are three readable depth layers for no draw calls at all. They sit ABOVE
      // the decorative screen washes in this list because the preset cap cuts from the bottom, and
      // at `medium` the fills are exactly what used to fall off the end.
      { pos: [-4.70, 1.06, 1.45], colour: 0xffb066, intensity: 2.4, distance: 3.4, decay: 1.5 },
      { pos: [0, ROOM.h - 0.30, -2.55], colour: 0xff5a2c, intensity: 2.2, distance: 4.6, decay: 1.5 },
      { pos: [4.4, 1.65, -2.10], colour: 0x8a5a30, intensity: 2.2, distance: 4.2, decay: 1.4 },
      { pos: [-4.4, 1.65, -2.10], colour: 0x7a5a34, intensity: 1.4, distance: 3.8, decay: 1.4 },
      ...aftDeckhead(0xff5222, 1.1),
      ...deckhead(0.28),
      { pos: [-0.26, TH + 1.72, -0.08], colour: 0xffb877, intensity: 0.6, distance: 1.4 },
      { pos: [-3.30, 1.22, 2.62], colour: 0x2fd08a, intensity: 0.7, distance: 2.2 },
      { pos: [3.30, 1.22, 2.62], colour: 0xffa93c, intensity: 0.6, distance: 2.2 },
      { pos: [-5.05, 1.42, -0.45], colour: 0x2fd08a, intensity: 0.7, distance: 2.4 },
      { pos: [5.05, 1.42, -0.45], colour: 0x3ec4e8, intensity: 0.7, distance: 2.4 },
    ],
  },

  // Night watch: the plot is the only real source, the practicals are barely on.
  night: {
    hemi: { sky: 0x7794ac, ground: 0x59626d, intensity: 1.00 },
    lamps: [
      { pos: [0, TH + 0.62, 0.15], colour: 0x59c8e8, intensity: 2.2, distance: 5.0, decay: 1.15 },
      { pos: [0, TH + 0.05, 0.15], colour: 0x52bcdc, intensity: 1.6, distance: 2.2, decay: 0.9 },
      { pos: [0, TH - 0.28, 0.15], colour: 0x47a8c8, intensity: 1.4, distance: 3.2, decay: 1.4 },
      // the deckhead directly over the table, which was pure black
      { pos: [0, TH + 1.32, 0.15], colour: 0x4bb6d8, intensity: 0.9, distance: 1.9, decay: 1.3 },
      ...deckhead(0.42),
      // the two quarters nearest the lens, which every camera in the set has behind it
      { pos: [4.4, 1.65, -2.10], colour: 0x2e6e88, intensity: 2.0, distance: 3.8, decay: 1.4 },
      { pos: [-4.4, 1.65, -2.10], colour: 0x2a7a68, intensity: 1.8, distance: 3.8, decay: 1.4 },
      { pos: [-3.10, 1.30, -0.30], colour: 0x2a6478, intensity: 1.5, distance: 3.0, decay: 1.4 },
      ...aftDeckhead(0xff5a2c, 1.3),
      // moonlight through the bay, the one thing that gives port and starboard different values
      { pos: [-2.2, 2.05, 4.6], colour: 0x2c4a6e, intensity: 2.6, distance: 9.0, decay: 1.5 },
      { pos: [-5.05, 1.42, -0.45], colour: 0x2fd08a, intensity: 1.4, distance: 2.6 },
      { pos: [5.05, 1.42, -0.45], colour: 0x3ec4e8, intensity: 1.8, distance: 3.4 },
      { pos: [-3.30, 1.22, 2.62], colour: 0x2fd08a, intensity: 1.1, distance: 2.4 },
      { pos: [0.10, 1.22, 3.10], colour: 0x3ec4e8, intensity: 0.9, distance: 2.2 },
      { pos: [3.30, 1.22, 2.62], colour: 0xffa93c, intensity: 0.8, distance: 2.2 },
      { pos: [4.9, 1.9, 1.9], colour: 0x2a5f7a, intensity: 1.4, distance: 3.6, decay: 1.4 },
      { pos: [-2.0, 1.35, -3.12], colour: 0x35c8a0, intensity: 0.8, distance: 2.2 },
      { pos: [2.0, 1.35, -3.12], colour: 0x3ec4e8, intensity: 0.8, distance: 2.2 },
      { pos: [-4.85, 0.98, 1.62], colour: 0xffbb70, intensity: 1.4, distance: 2.4, decay: 1.5 },
    ],
  },
};

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S3 = new THREE.Vector3();
const C = new THREE.Color();

export function buildBridge(quality) {
  const object3D = new THREE.Group();
  object3D.name = 'bridge';

  const room = new THREE.Group();
  room.position.y = ROOM.deck;
  object3D.add(room);

  const { w: W, d: D, h: H, sill, head } = ROOM;
  const panel = getMaterial('bridge', 'panel');
  const trim = getMaterial('bridge', 'trim');
  const seat = getMaterial('bridge', 'seat');
  const floorMat = getMaterial('bridge', 'floor');

  // ── shell ──────────────────────────────────────────────────────────────────────────────────

  const floor = new THREE.Mesh(tileUV(new THREE.PlaneGeometry(W, D, 12, 8), 2.6, 1.7), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  const ceil = new THREE.Mesh(tileUV(new THREE.PlaneGeometry(W, D, 12, 8), 4, 2.5), panel);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  room.add(ceil);

  const aft = new THREE.Mesh(tileUV(new THREE.PlaneGeometry(W, H, 12, 4), 4, 1), panel);
  aft.position.set(0, H / 2, -D / 2);
  aft.receiveShadow = true;
  room.add(aft);

  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(tileUV(new THREE.PlaneGeometry(D, H, 8, 4), 2.6, 1), panel);
    side.position.set(sx * W / 2, H / 2, 0);
    side.rotation.y = -sx * Math.PI / 2;
    side.receiveShadow = true;
    room.add(side);
  }

  // ── the forward bay: sill, header, mullions, glass ─────────────────────────────────────────

  const segs = [];
  for (let i = 0; i < BAY.length - 1; i++) {
    const a = BAY[i], b = BAY[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    segs.push({
      mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      len: Math.hypot(dx, dz),
      ry: Math.atan2(dx, dz) - Math.PI / 2,
    });
  }

  const frameParts = [];
  const mullions = [];
  for (const sg of segs) {
    frameParts.push({ p: [sg.mid[0], sill / 2, sg.mid[1]], ry: sg.ry, s: [sg.len, sill, 0.16] });
    frameParts.push({ p: [sg.mid[0], (head + H) / 2, sg.mid[1]], ry: sg.ry, s: [sg.len, H - head, 0.16] });
    frameParts.push({ p: [sg.mid[0], sill + 0.055, sg.mid[1]], ry: sg.ry, s: [sg.len, 0.11, 0.30] });
    frameParts.push({ p: [sg.mid[0], head - 0.05, sg.mid[1]], ry: sg.ry, s: [sg.len, 0.10, 0.24] });
    const n = Math.max(1, Math.round(sg.len / 1.55));
    for (let k = 0; k <= n; k++) {
      const t = k / n - 0.5;
      mullions.push({
        p: [sg.mid[0] + Math.cos(sg.ry) * t * sg.len, (sill + head) / 2, sg.mid[1] - Math.sin(sg.ry) * t * sg.len],
        ry: sg.ry, s: [0.115, head - sill, 0.19],
      });
    }
  }

  const box = new THREE.BoxGeometry(1, 1, 1);
  instanced(room, box, panel, frameParts, (im, i, o) => place(im, i, o.p, [0, o.ry, 0], o.s), { receive: true });
  instanced(room, bevelBox(1, 1, 1, 0.02), panel, mullions, (im, i, o) => place(im, i, o.p, [0, o.ry, 0], o.s));

  // Vertical stanchions from the sill to the deckhead at the bay joints — the near-black posts
  // that break the bright band in every one of the plates.
  const posts = [BAY[1], BAY[2]].map(p => ({ p: [p[0], H / 2, p[1] - 0.1], s: [0.17, H, 0.17] }));
  instanced(room, bevelBox(1, 1, 1, 0.02), panel, posts, (im, i, o) => place(im, i, o.p, [0, 0, 0], o.s));

  let glassPlane = null;
  const glassMat = getMaterial('bridge', 'glass');
  segs.forEach(sg => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(sg.len - 0.02, head - sill), glassMat);
    g.position.set(sg.mid[0], (sill + head) / 2, sg.mid[1] - 0.02);
    g.rotation.y = sg.ry + Math.PI;
    g.renderOrder = 2;
    room.add(g);
    if (!glassPlane) glassPlane = g;
  });

  // ── the house: what the room looks like from outside ──────────────────────────────────────
  //
  // Room space, so it turns with `setHeading` and rides the same bake. The side walls stop at the
  // outboard end of the bay (BAY[0]) — the window run itself is already closed from outside by the
  // sill and header boxes above, and a wall carried any further forward stands in the port view.

  // GAP is not slack, it is the whole reason the shell works: every plate in the compartment is a
  // single-sided plane, and a shell face flush against one of them z-fights across the entire
  // surface. Measured — a flush roof striped the whole deckhead in bridge_night.
  const T = HOUSE.skin, GAP = 0.08, bayZ = D / 2 - 1.35;
  const wallY = [H + 2 * (T + GAP), H / 2];
  const off = T / 2 + GAP;
  const house = [
    { p: [0, -off, (-(D / 2 + off) + (D / 2 + 0.15)) / 2], s: [W + 2 * off, T, D + off + 0.15] },
    { p: [0, -(T + GAP + HOUSE.pedestal / 2), -0.2], s: [W - 1.0, HOUSE.pedestal, D + 1.6] },
    { p: [0, wallY[1], -(D / 2 + off)], s: [W + 2 * off, wallY[0], T] },
    { p: [0, H + off, (-(D / 2 + off) + (D / 2 + HOUSE.eave)) / 2],
      s: [W + 2 * off + 2 * HOUSE.eave, T, D + off + HOUSE.eave] },
  ];
  for (const sx of [-1, 1]) {
    house.push({ p: [sx * (W / 2 + off), wallY[1], (-(D / 2 + off) + bayZ) / 2], s: [T, wallY[0], D / 2 + off + bayZ] });
    const wx = sx * (W / 2 + HOUSE.wing) / 2, ww = HOUSE.wing - W / 2;
    house.push({ p: [wx, -off, 0.5], s: [ww, T, 5.0] });
    house.push({ p: [sx * (HOUSE.wing - 0.09), 0.42, 0.5], s: [0.18, 0.95, 5.0] });
    house.push({ p: [wx, 0.42, 2.91], s: [ww, 0.95, 0.18] });
    house.push({ p: [wx, 0.42, -1.91], s: [ww, 0.95, 0.18] });
    // the bracket the wing stands on, so it does not hang off the side of the house unsupported
    house.push({ p: [sx * (W / 2 + 0.55), -0.70, 0.5], s: [1.5, 0.9, 3.4] });
  }
  // The bay's sill and header boxes are the compartment's own panel, so from outside the front of
  // the bridge was a warm brown wheelhouse bolted to a grey warship. Skin them, on the segment's
  // outboard face — 0.15 clears the 0.16-thick frame.
  for (const sg of segs) {
    const n = [Math.sin(sg.ry), Math.cos(sg.ry)];
    for (const [cy, hgt] of [[(sill - T) / 2, sill + T], [(head + H + T) / 2, H + T - head]]) {
      house.push({ p: [sg.mid[0] + n[0] * 0.15, cy, sg.mid[1] + n[1] * 0.15], ry: sg.ry, s: [sg.len + 0.10, hgt, 0.14] });
    }
  }
  // On the SHIP's structure material, not the compartment's: the house is painted steel seen from
  // outside in daylight, and the interior panel is a warm-lit bulkhead. That material reads vertex
  // colours for its AO — a box without the attribute renders BLACK — and its plating has a real
  // metre scale, so each part is unwrapped to its own size. Merged: one extra draw call.
  const houseMesh = new THREE.Mesh(mergeGeometries(house.map(o => {
    const g = tileUV(new THREE.BoxGeometry(o.s[0], o.s[1], o.s[2]),
      Math.max(o.s[0], o.s[2]) / 2.6, Math.max(o.s[1], Math.min(o.s[0], o.s[2])) / 2.6);
    g.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    if (o.ry) g.rotateY(o.ry);
    return g.translate(o.p[0], o.p[1], o.p[2]);
  }), false), getMaterial('hull', 'turret'));
  houseMesh.castShadow = houseMesh.receiveShadow = true;
  room.add(houseMesh);

  // ── consoles ──────────────────────────────────────────────────────────────────────────────

  const bodies = [];      // chamfered equipment bodies
  const slopes = [];      // the angled instrument faces on top of them
  const screens = [];     // {p, dir, w, h, tile, col}

  const SCREEN_COL = {
    cyan: [0.22, 1.30, 1.62], green: [0.18, 1.40, 0.50], amber: [1.70, 0.86, 0.20],
    red: [1.60, 0.22, 0.13], pale: [1.05, 1.20, 1.35], dim: [0.30, 0.52, 0.64],
  };
  const PALETTE = ['cyan', 'green', 'amber', 'pale', 'cyan', 'dim', 'red', 'green', 'dim', 'cyan'];

  let seedI = 1;
  const pick = () => PALETTE[(seedI = (seedI * 7 + 3) % 251) % PALETTE.length];
  const tile = () => (seedI = (seedI * 31 + 17) % 4093) % (ATLAS_TILES * ATLAS_TILES);
  const scr = (p, dir, w, h, col) => screens.push({ p, dir, w, h, col: col || pick(), tile: tile() });

  const SLOPE = 0.62;
  const cs = Math.cos(SLOPE), sn = Math.sin(SLOPE);

  // Forward console run, following the bay, with a sloped instrument face.
  for (const sg of segs) {
    const al = [Math.cos(sg.ry), 0, -Math.sin(sg.ry)];       // along the run
    const nm = [Math.sin(sg.ry), 0, -Math.cos(sg.ry)];       // into the room
    const n = Math.max(2, Math.round(sg.len / 1.35));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n - 0.5;
      const cx = sg.mid[0] + al[0] * t * sg.len + nm[0] * 0.42;
      const cz = sg.mid[1] + al[2] * t * sg.len + nm[2] * 0.42;
      const wid = sg.len / n - 0.05;
      bodies.push({ p: [cx, 0.44, cz], ry: sg.ry, s: [wid, 0.88, 0.72] });
      slopes.push({ p: [cx - nm[0] * 0.06, 0.965, cz - nm[2] * 0.06], ry: sg.ry, rx: -SLOPE, s: [wid, 0.44, 0.07] });
      const face = [nm[0] * sn, cs, nm[2] * sn];
      for (let j = 0; j < 2; j++) {
        const o = (j - 0.5) * wid * 0.46;
        scr([cx + al[0] * o + nm[0] * 0.02 + face[0] * 0.045, 1.03 + face[1] * 0.045, cz + al[2] * o + nm[2] * 0.02 + face[2] * 0.045],
          face, wid * 0.40, 0.30);
      }
      scr([cx + nm[0] * 0.365, 0.74, cz + nm[2] * 0.365], nm, wid * 0.78, 0.10, 'red');
    }
  }

  // Side racks, port and starboard.
  for (const sx of [-1, 1]) {
    const nm = [-sx, 0, 0];
    for (let k = 0; k < 3; k++) {
      const z = -2.0 + k * 1.55;
      const x = sx * (W / 2 - 0.36);
      bodies.push({ p: [x, 0.52, z], ry: sx * Math.PI / 2, s: [1.34, 1.04, 0.66] });
      slopes.push({ p: [x + nm[0] * 0.06, 1.12, z], ry: sx * Math.PI / 2, rx: -0.5, s: [1.30, 0.42, 0.07] });
      const face = [nm[0] * Math.sin(0.5), Math.cos(0.5), 0];
      scr([x + nm[0] * 0.10, 1.17, z], face, 0.92, 0.28);
      for (let j = 0; j < 2; j++) {
        bodies.push({ p: [sx * (W / 2 - 0.13), 1.70 + j * 0.54, z], ry: sx * Math.PI / 2, s: [1.16, 0.48, 0.24] });
        scr([sx * (W / 2 - 0.245), 1.70 + j * 0.54, z], nm, 0.86, 0.34);
      }
    }
  }

  // Aft bulkhead equipment.
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * 1.95;
    bodies.push({ p: [x, 0.95, -D / 2 + 0.18], ry: 0, s: [1.72, 1.9, 0.34] });
    for (let j = 0; j < 3; j++) {
      scr([x + (j - 1) * 0.5, 1.44, -D / 2 + 0.36], [0, 0, 1], 0.44, 0.32);
      scr([x + (j - 1) * 0.5, 1.03, -D / 2 + 0.36], [0, 0, 1], 0.44, 0.12, k % 2 ? 'green' : 'amber');
    }
  }

  // Overhead instrument pods hanging off the deckhead.
  const stalks = [];
  const POD = 0.34;
  for (let k = 0; k < 9; k++) {
    const x = (k - 4) * 1.20;
    const z = 1.50 + (k % 3 === 1 ? 0.36 : 0);
    const y = H - 0.52;
    stalks.push({ p: [x, (H + y + 0.24) / 2, z], s: [0.055, H - y - 0.24, 0.055] });
    bodies.push({ p: [x, y, z], ry: 0, rx: POD, s: [0.74, 0.58, 0.20] });
    const face = [0, -Math.sin(POD), -Math.cos(POD)];
    scr([x + face[0] * 0.105, y + face[1] * 0.105, z + face[2] * 0.105], face, 0.54, 0.40);
  }
  instanced(room, box, panel, stalks, (im, i, o) => place(im, i, o.p, [0, 0, 0], o.s));

  const bodyGeo = bevelBox(1, 1, 1, 0.022);
  instanced(room, bodyGeo, panel, bodies,
    (im, i, o) => place(im, i, o.p, [o.rx || 0, o.ry, 0], o.s), { shadow: true, receive: true });
  instanced(room, bodyGeo, panel, slopes,
    (im, i, o) => place(im, i, o.p, [o.rx || 0, o.ry, 0], o.s));

  // ── every display in the room, one mesh ───────────────────────────────────────────────────

  const allScreens = screens;
  const quad = new THREE.PlaneGeometry(1, 1);
  const screenMesh = new THREE.InstancedMesh(quad, getMaterial('bridge', 'screen'), allScreens.length);
  screenMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(allScreens.length * 3), 3);
  const tiles = new Float32Array(allScreens.length * 2);
  allScreens.forEach((o, i) => {
    faceQuad(screenMesh, i, o.p, o.dir, o.w, o.h);
    const c = SCREEN_COL[o.col] || SCREEN_COL.pale;
    screenMesh.setColorAt(i, C.setRGB(c[0], c[1], c[2]));
    const t = o.tile % (ATLAS_TILES * ATLAS_TILES);
    tiles[i * 2] = (t % ATLAS_TILES) / ATLAS_TILES;
    tiles[i * 2 + 1] = Math.floor(t / ATLAS_TILES) / ATLAS_TILES;
  });
  screenMesh.geometry = quad.clone();
  screenMesh.geometry.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 2));
  screenMesh.frustumCulled = false;
  screenMesh.renderOrder = 1;
  room.add(screenMesh);

  // A lit bezel behind every display, and the glow each one spills onto the console face under it.
  // The spill is what makes a console read as three-dimensional rather than as a printed card.
  const bezels = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), seat, allScreens.length);
  bezels.frustumCulled = false;
  allScreens.forEach((o, i) => faceQuad(bezels, i,
    [o.p[0] - o.dir[0] * 0.004, o.p[1] - o.dir[1] * 0.004, o.p[2] - o.dir[2] * 0.004],
    o.dir, o.w + 0.055, o.h + 0.055));
  room.add(bezels);

  // The wash each display throws on the surface it is mounted on. Centred ON the emitter, not
  // below it, and elongated along the wall — a screen's glow brightens its own bezel first, and a
  // symmetric circle 90 px across behind every console is the signature of a pasted-on sprite.
  const spills = allScreens.filter(o => o.h > 0.2);
  const spill = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), additive(0xffffff, spillTexture()), spills.length);
  spill.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spills.length * 3), 3);
  spill.frustumCulled = false;
  spill.renderOrder = 2;
  spills.forEach((o, i) => {
    faceQuad(spill, i,
      [o.p[0] + o.dir[0] * 0.010, o.p[1] - o.h * 0.10, o.p[2] + o.dir[2] * 0.010],
      o.dir, o.w * 3.4, o.h * 5.6);
    const c = SCREEN_COL[o.col] || SCREEN_COL.pale;
    setColour(spill, i, c[0] * 0.14, c[1] * 0.14, c[2] * 0.14);
  });
  room.add(spill);

  // ── deckhead structure and lamp fixtures ──────────────────────────────────────────────────

  const beams = [];
  for (let k = 0; k < 5; k++) beams.push({ p: [0, H - 0.055, -D / 2 + 0.9 + k * 1.35], s: [W, 0.11, 0.19] });
  for (let k = 0; k < 4; k++) beams.push({ p: [(k - 1.5) * 2.7, H - 0.045, 0], s: [0.14, 0.09, D] });
  instanced(room, box, panel, beams, (im, i, o) => place(im, i, o.p, [0, 0, 0], o.s));

  // Deckhead fixtures. A shallow recessed housing with a diffuser in it, not an emissive rectangle
  // cut into the plate: four housing bars, a lens that fades toward its own frame, and the lamp in
  // RIGS at the same x/z so the red wash lands on the plates the fixture is actually bolted to.
  const LENS = { w: 0.60, d: 0.36, drop: 0.085 };
  const housings = [];
  const lenses = [];
  const addFixture = (x, z, col, mul, w = LENS.w, d = LENS.d) => {
    for (const [dx, dz, sx, sz] of [
      [0, -(d + 0.05) / 2, w + 0.10, 0.05], [0, (d + 0.05) / 2, w + 0.10, 0.05],
      [-(w + 0.05) / 2, 0, 0.05, d], [(w + 0.05) / 2, 0, 0.05, d],
    ]) housings.push({ p: [x + dx, H - 0.045, z + dz], s: [sx, 0.09, sz] });
    lenses.push({ p: [x, H - LENS.drop, z], s: [w, d], col, mul });
  };
  for (const o of OVERHEAD) addFixture(o.x, o.z, o.col, 0.72);
  for (let k = 0; k < 4; k++) addFixture((k - 1.5) * 2.7, -D / 2 + 1.6, 0xff3a18, 0.34, 0.26, 1.45);

  instanced(room, box, panel, housings, (im, i, o) => place(im, i, o.p, [0, 0, 0], o.s), { receive: true });

  const lensMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), additive(0xffffff, lensTexture()), lenses.length);
  lensMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(lenses.length * 3), 3);
  lensMesh.frustumCulled = false;
  lensMesh.renderOrder = 2;
  lenses.forEach((o, i) => {
    place(lensMesh, i, o.p, [Math.PI / 2, o.s[0] > o.s[1] ? 0 : Math.PI / 2, 0],
      [Math.max(o.s[0], o.s[1]), Math.min(o.s[0], o.s[1]), 1]);
    C.set(o.col);
    setColour(lensMesh, i, C.r * o.mul, C.g * o.mul, C.b * o.mul);
  });
  room.add(lensMesh);

  // Deck wear at 1:1 across the whole plate. The seams and grain tile; the scuffing must not, or
  // the floor reads as wallpaper however good the material underneath is.
  // Unlit, so it must stay a modulation and not a light source: at full strength the polished
  // lanes put luma ~20 on the deck whether or not anything is shining on them, which is most of
  // why the deck used to read as a flat milky sheet with no gradient across it.
  const wear = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({
    map: deckWearTexture(), color: 0x3c424a, transparent: true, depthWrite: false,
    opacity: 0.55, fog: false,
  }));
  wear.rotation.x = -Math.PI / 2;
  wear.position.y = 0.0035;
  wear.renderOrder = 1;
  room.add(wear);

  // Contact darkening where anything meets the deck. Multiply, not a black quad — a black quad's
  // strength depends on whatever happens to be behind it, and half of these sit in shadow.
  const contacts = [
    [0, 0.15, 1.35, 1.35], [-3.75, 1.45, 0.95, 0.95], [3.95, 1.25, 0.95, 0.95], [1.30, -1.72, 0.95, 0.95],
    [-2.30, 2.30, 0.75, 0.75], [2.30, 2.20, 0.75, 0.75], [-1.08, -1.34, 0.80, 0.80],
    [0, D / 2 - 0.35, W, 1.5], [0, -D / 2 + 0.30, W, 1.1],
    [-W / 2 + 0.45, 0, 1.4, D], [W / 2 - 0.45, 0, 1.4, D],
  ];
  instanced(room, new THREE.PlaneGeometry(1, 1), contactMaterial(), contacts,
    (im, i, o) => place(im, i, [o[0], 0.008, o[1]], [-Math.PI / 2, 0, 0], [o[2], o[3], 1]))
    .renderOrder = 2;

  // Air. Four soft cards stacked through the room: near objects sit in front of one or two, the
  // far bulkhead behind all four, so distance costs contrast. Scene fog would have to be shared
  // with the ocean, and this is a compartment 7 m deep, not a seascape.
  const hazeCards = [];
  const hazeMat = additive(0x1b2a38, radialTexture(), { opacity: 1 });
  for (const hz of [3.2, 1.4, -0.6, -2.6]) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.6, H * 2.4), hazeMat);
    card.position.set(0, H * 0.45, hz);
    card.renderOrder = 4;
    room.add(card);
    hazeCards.push(card);
  }

  // A wide, weak tint under the table on top of the real light the plot glass throws. It used to
  // be 3.2 m square at enough strength to see, which put a hard rectangular cut-off and a visible
  // gradient-stop arc on the deck — a decal edge where a falloff belongs. The light at TH + 0.05
  // does the work now; this only carries the colour.
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), additive(0xffffff, radialTexture()));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.012, 0.15);
  pool.renderOrder = 3;
  room.add(pool);
  const poolMat = pool.material;
  poolMat.color = new THREE.Color(0.014, 0.034, 0.042);

  // ── seats, rails, crew ────────────────────────────────────────────────────────────────────

  const seatAnchors = [];
  const chairs = [
    { p: [-3.75, 0, 1.45], ry: 0.34 },
    { p: [3.95, 0, 1.25], ry: -0.50 },
    { p: [1.30, 0, -1.72], ry: -2.75 },
  ];
  const cushions = [], backs = [], columns = [], arms = [];
  chairs.forEach(ch => {
    const [x, , z] = ch.p;
    cushions.push({ p: [x, 0.52, z], ry: ch.ry, s: [0.60, 0.12, 0.56] });
    backs.push({ p: [x - Math.sin(ch.ry) * 0.28, 1.00, z - Math.cos(ch.ry) * 0.28], ry: ch.ry, s: [0.58, 0.98, 0.14] });
    columns.push({ p: [x, 0.23, z], ry: 0, s: [0.13, 0.46, 0.13] });
    columns.push({ p: [x, 0.03, z], ry: ch.ry, s: [0.56, 0.06, 0.56] });
    for (const sx of [-1, 1]) {
      arms.push({ p: [x + Math.cos(ch.ry) * sx * 0.32, 0.66, z - Math.sin(ch.ry) * sx * 0.32], ry: ch.ry, s: [0.09, 0.09, 0.48] });
    }
    const a = new THREE.Object3D();
    a.position.set(x, 0.58, z);
    a.rotation.y = ch.ry;
    room.add(a);
    seatAnchors.push(a);
  });
  instanced(room, bevelBox(1, 1, 1, 0.03), seat, cushions.concat(backs, arms),
    (im, i, o) => place(im, i, o.p, [0, o.ry, 0], o.s), { shadow: true });
  instanced(room, box, trim, columns, (im, i, o) => place(im, i, o.p, [0, o.ry, 0], o.s));

  const rails = [];
  for (const sx of [-1, 1]) {
    rails.push({ p: [sx * 2.2, 1.02, -D / 2 + 0.42], ry: 0, len: 1.6, vert: false });
    rails.push({ p: [sx * 1.42, 0.72, -D / 2 + 0.42], ry: 0, len: 0.6, vert: true });
    rails.push({ p: [sx * 3.0, 0.72, -D / 2 + 0.42], ry: 0, len: 0.6, vert: true });
  }
  const tube = new THREE.CylinderGeometry(0.022, 0.022, 1, 7);
  instanced(room, tube, trim, rails,
    (im, i, o) => place(im, i, o.p, [0, 0, o.vert ? 0 : Math.PI / 2], [1, o.len, 1]));

  // Overhead pipe runs down the sides — clutter is most of what separates the plates from a box.
  const pipes = [];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      pipes.push({ p: [sx * (W / 2 - 0.13 - k * 0.085), H - 0.20 - k * 0.055, 0], len: D * 0.94, r: 0.038 - k * 0.007 });
    }
  }
  const pipeGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  instanced(room, pipeGeo, trim, pipes,
    (im, i, o) => place(im, i, o.p, [Math.PI / 2, 0, 0], [o.r, o.len, o.r]));

  // ── crew ──────────────────────────────────────────────────────────────────────────────────

  // The helm is off the centre window on purpose — a featureless capsule occluding the best part of
  // the sunset is worse than no crewman at all. `reach` pushes his arms out to the wheel.
  const crewDefs = [
    { p: [-3.35, 0, 2.34], ry: 0.02, lean: 0.20, reach: 0.30, name: 'helm' },
    { p: [2.55, 0, 2.16], ry: -0.24, lean: 0.14, reach: 0.10, name: 'watch' },
    { p: [-1.08, 0, -1.34], ry: 0.63, lean: 0.70, reach: 0.24, name: 'plotter' },
  ];
  const crewMat = rimMaterial({ colour: 0x2a2f37, rim: 0x33465a, power: 3.0, floor: 0.10 });
  const crew = buildCrew(room, crewDefs, crewMat);

  // Something for the helmsman's hands to be on.
  const helmStand = new THREE.Group();
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.15, 0.86, 12), trim);
  column.position.set(-3.35, 0.43, 2.74);
  column.castShadow = true;
  helmStand.add(column);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.018, 6, 22), trim);
  wheel.position.set(-3.35, 0.94, 2.70);
  wheel.rotation.x = 0.42;
  helmStand.add(wheel);
  for (let k = 0; k < 6; k++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.40, 5), trim);
    spoke.position.copy(wheel.position);
    spoke.rotation.set(0.42, 0, k * Math.PI / 6);
    helmStand.add(spoke);
  }
  room.add(helmStand);

  // The chart lamp. A pool of warm light with no visible source is the thing that makes a render
  // look computed rather than photographed, so the fixture and its shaft are both in shot.
  const lampPos = RIGS.chart.lamps[0].pos;
  // The rim sits just ABOVE the emitter. With the fixture hung 6 cm lower the spot's origin was
  // inside the shade, so the cone's outer surface was blasted white by its own bulb and lost every
  // gradient it had — the shade has to be outside the spot's angular cutoff to read as a shade.
  const chart = pendantLamp({
    x: lampPos[0], y: lampPos[1] - 0.005, z: lampPos[2],
    ceiling: H, beamTo: TABLE.height - 0.06, colour: 0xffc186,
  });
  chart.group.visible = false;
  room.add(chart.group);
  const chartLamp = chart.group;

  // ── anchors ───────────────────────────────────────────────────────────────────────────────

  const tableAnchor = new THREE.Object3D();
  tableAnchor.position.set(0, TABLE.height, 0.15);
  room.add(tableAnchor);

  const windowAnchor = new THREE.Object3D();
  windowAnchor.position.set(0, (sill + head) / 2, D / 2);
  room.add(windowAnchor);

  // The room's shell, frames, consoles, beams, pipes and chairs never move, and eleven separate
  // instanced meshes on one panel material was eleven draw calls. Everything anything else holds a
  // reference to — the glass C6 builds its glare from, the crew it toggles, the screens, the light
  // cards — is excluded by identity, not by guesswork.
  const noBake = new Set([glassPlane, screenMesh, spill, lensMesh, wear, pool, crew.group,
    chartLamp, tableAnchor]);
  bakeStatic(room, o => {
    for (let p = o; p && p !== room; p = p.parent) if (noBake.has(p)) return false;
    return o.material !== glassMat;
  });
  // The four air cards became one; setHaze still needs a handle on whatever survived.
  hazeCards.length = 0;
  room.traverse(o => { if (o.isMesh && o.material === hazeMat) hazeCards.push(o); });

  const api = {
    object3D, room, tableAnchor, windowAnchor, seatAnchors, glassPlane,
    deckHeight: ROOM.deck, crew, screens: screenMesh,

    // Which way the window faces, in world radians. Anchors are children so they follow.
    setHeading(rad) { object3D.rotation.y = rad; object3D.updateMatrixWorld(true); },

    setCrew(on) { crew.group.visible = on !== false; },

    // What the room leaves on a uniform. A cold blue rim in a compartment lit by one tungsten lamp
    // makes the watch read as two pale ghosts, which is the opposite of the silhouette they are for.
    setCrewRim(colour, strength = 1) { crewMat.userData.rim.uRimCol.value.set(colour).multiplyScalar(strength); },
    setChartLamp(on) { chartLamp.visible = on !== false; },
    setPlotter(on) { crew.setVisible('plotter', on !== false); },

    // The deck pool is the table's light on the floor; it has to follow the table's look or a
    // warm chart lamp sits in a cyan puddle.
    setPool(colour, scale = 1) {
      poolMat.color.set(colour).multiplyScalar(0.28);
      pool.scale.setScalar(scale);
    },

    // How much of the sky's IBL the room's own materials see. A bridge is lit by its practicals;
    // at 1 the deck is as bright at the far bulkhead as it is under the glowing table.
    setEnv(v) { setEnvIntensity(v); },

    setHaze(colour, strength = 1) {
      hazeMat.color.set(colour).multiplyScalar(strength);
      for (const c of hazeCards) c.visible = strength > 0;
    },

    update(dt, app) {
      pumpTables(dt);
      if (chartLamp.visible && app) chart.billboard(app.camera);
    },

    registerKnobs(q) {
      q.register({ key: 'bridgeCrew', label: 'Bridge crew', type: 'toggle', default: true, group: 'Bridge' },
        v => { crew.group.visible = !!v; });
    },
  };

  return api;
}

// One InstancedMesh per body part, so any number of silhouettes costs five draw calls. They are
// black shapes on purpose — the plates never light a crewman, they let him block a screen.
function buildCrew(parent, defs, mat) {
  const group = new THREE.Group();
  group.name = 'crew';
  parent.add(group);

  const HIP = 0.94, SPINE = 0.62, NECK = 0.14;
  const torsoGeo = bevelBox(0.40, SPINE, 0.25, 0.07);
  const headGeo = new THREE.SphereGeometry(0.098, 10, 8);
  const capGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.035, 12);
  const legGeo = bevelBox(0.16, HIP, 0.19, 0.05);
  const armGeo = bevelBox(0.11, 0.54, 0.12, 0.04);

  const parts = { torso: [], head: [], cap: [], leg: [], arm: [] };

  defs.forEach(d => {
    const lean = d.lean || 0;
    const cs = Math.cos(lean), sn = Math.sin(lean);
    const fwd = [Math.sin(d.ry), Math.cos(d.ry)];                // the way he faces
    const side = [Math.cos(d.ry), -Math.sin(d.ry)];
    // Spine as a line from the hip, tipped `lean` forward. Everything above hangs off its end,
    // so a leaning plotter's head goes over the table instead of through his own chest.
    const up = (t, extra = 0) => [
      d.p[0] + fwd[0] * (sn * t + extra * sn),
      HIP + cs * t,
      d.p[2] + fwd[1] * (sn * t + extra * sn),
    ];
    const mid = up(SPINE / 2), top = up(SPINE);
    parts.torso.push({ p: mid, rot: [lean, d.ry, 0] });
    parts.head.push({ p: up(SPINE + NECK), rot: [0, d.ry, 0] });
    parts.cap.push({ p: up(SPINE + NECK + 0.085), rot: [0, d.ry, 0] });
    // `reach` swings the arms forward from the shoulder. Without it every crewman stands with his
    // hands at his sides in front of a wheel he is supposed to be holding.
    const reach = d.reach || 0;
    const ra = Math.min(1.3, reach * 3.2);
    for (const sx of [-1, 1]) {
      parts.leg.push({ p: [d.p[0] + side[0] * sx * 0.11, HIP / 2, d.p[2] + side[1] * sx * 0.11], rot: [0, d.ry, 0] });
      const sh = up(SPINE - 0.10);
      const drop = 0.27 * Math.cos(ra);
      const out = 0.27 * Math.sin(ra);
      parts.arm.push({
        p: [
          sh[0] + side[0] * sx * 0.24 + fwd[0] * (sn * 0.16 + out),
          sh[1] - drop * cs,
          sh[2] + side[1] * sx * 0.24 + fwd[1] * (sn * 0.16 + out),
        ],
        rot: [lean * 1.35 + ra, d.ry, sx * 0.07],
      });
    }
  });

  const meshes = {};
  for (const [k, geo] of [['torso', torsoGeo], ['head', headGeo], ['cap', capGeo], ['leg', legGeo], ['arm', armGeo]]) {
    meshes[k] = instanced(group, geo, mat, parts[k], (im, i, o) => place(im, i, o.p, o.rot), { shadow: true });
  }

  // Hiding one crewman means shrinking his instances to nothing; there is no per-instance visible.
  const hidden = new Set();
  const reapply = () => {
    for (const [k, list] of Object.entries(parts)) {
      const per = list.length / defs.length;
      list.forEach((o, i) => {
        const who = defs[Math.floor(i / per)].name;
        place(meshes[k], i, o.p, o.rot, hidden.has(who) ? [0, 0, 0] : [1, 1, 1]);
      });
      meshes[k].instanceMatrix.needsUpdate = true;
    }
  };

  return {
    group, meshes,
    setVisible(name, on) { on ? hidden.delete(name) : hidden.add(name); reapply(); },
    only(names) { hidden.clear(); for (const d of defs) if (!names.includes(d.name)) hidden.add(d.name); reapply(); },
    all() { hidden.clear(); reapply(); },
  };
}

// ── Scored scenarios ────────────────────────────────────────────────────────────────────────

const BRIDGE_ROOTS = new Set(['lighting', 'ocean', 'bridge', 'bridgeLights', 'vfx']);

// A plausible mid-game board, so the plot has something on it. Deterministic — the shot has to be
// bit-identical between rounds or score movement stops meaning anything.
function demoView(w, h, seed = 5) {
  const grid = new Uint8Array(w * h);
  let a = seed >>> 0;
  const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ships = [
    { cells: [{ r: 2, c: 3 }, { r: 2, c: 4 }, { r: 2, c: 5 }], sunk: true },
    { cells: null, sunk: false },
    { cells: null, sunk: false },
  ];
  for (const s of ships) if (s.sunk) for (const c of s.cells) grid[c.r * w + c.c] = 3;
  const hits = [[5, 6], [5, 7], [6, 2], [7, 7]];
  for (const [r, c] of hits) grid[r * w + c] = 2;
  for (let i = 0; i < w * h; i++) {
    if (!grid[i] && rnd() < 0.19) grid[i] = 1;
  }
  return { w, h, grid, enemyShips: ships, ships: [] };
}

// The ship we are standing on, seen through the window. Scenario dressing, not the ship kit —
// C3 replaces it with the real superstructure. Named `_bd*` so a sea shot strips it the same way
// ocean.js strips its `_ph*` placeholders.
function foredeck(app, { lit = false } = {}) {
  const g = new THREE.Group();
  g.name = '_bd_deck';
  const panel = getMaterial('bridge', 'panel');
  const trim = getMaterial('bridge', 'trim');

  const deckY = ROOM.deck - 3.4;
  const deck = new THREE.Mesh(tileUV(new THREE.PlaneGeometry(26, 84), 9, 26), getMaterial('bridge', 'floor'));
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, deckY, 52);
  g.add(deck);

  const box = new THREE.BoxGeometry(1, 1, 1);
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push({ p: [sx * 13, deckY + 0.75, 52], s: [0.35, 1.5, 84] });
    parts.push({ p: [sx * 8.4, deckY + 1.5, 22], s: [3.2, 3.0, 9] });
  }
  parts.push({ p: [0, deckY + 2.6, 34], s: [7.5, 5.2, 12] });
  parts.push({ p: [0, deckY + 7.0, 70], s: [1.0, 14, 1.0] });
  instanced(g, box, panel, parts, (im, i, o) => place(im, i, o.p, [0, 0, 0], o.s));

  const rails = [];
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    rails.push({ p: [sx * 13, deckY + 0.6 + k * 0.42, 52], len: 84 });
  }
  instanced(g, new THREE.CylinderGeometry(0.05, 0.05, 1, 6), trim, rails,
    (im, i, o) => place(im, i, o.p, [Math.PI / 2, 0, 0], [1, o.len, 1]));

  // Deck lighting. This is bridge_night's whole subject: a bright surface OUTSIDE seen from a
  // dark room, which must land mid-grey and not white.
  if (lit) {
    const lamps = [];
    for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) {
      lamps.push({ p: [sx * 12.2, deckY + 1.6, 20 + k * 11], c: [2.2, 1.9, 1.4] });
    }
    const strips = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 1.6), additive(0xffffff, haloTexture()), lamps.length);
    strips.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(lamps.length * 3), 3);
    strips.renderOrder = 3;
    lamps.forEach((o, i) => {
      faceQuad(strips, i, o.p, [0, 0, -1], 1.6, 1.6);
      setColour(strips, i, o.c[0], o.c[1], o.c[2]);
    });
    strips.frustumCulled = false;
    g.add(strips);

    // Three overlapping pools rather than one: a single radial gradient over an 80 m deck has a
    // hot spot in the middle and black at both ends, which reads as a bug rather than as floods.
    const washMat = getMaterial('table', 'gridline').clone();
    washMat.map = radialTexture();
    washMat.color = new THREE.Color(1.55, 1.36, 1.02);
    for (const z of [22, 46, 70, 94]) {
      const wash = new THREE.Mesh(new THREE.PlaneGeometry(26, 40), washMat);
      wash.rotation.x = -Math.PI / 2;
      wash.position.set(0, deckY + 0.03, z);
      g.add(wash);
    }

    const centreline = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 74), getMaterial('table', 'gridline'));
    centreline.rotation.x = -Math.PI / 2;
    centreline.position.set(0, deckY + 0.05, 54);
    centreline.material = centreline.material.clone();
    centreline.material.color = new THREE.Color(2.0, 1.60, 0.55);
    g.add(centreline);

    // PointLights ignore the bulkhead they are on the far side of, so the flood's reach has to
    // stop short of the bridge or it lights the deck plate under the camera's feet.
    const flood = new THREE.PointLight(0xffd9a8, 2600, 42, 2);
    flood.position.set(0, deckY + 10, 50);
    g.add(flood);
  }

  app.scene.add(g);
  return g;
}

// A darkened vessel a mile out, showing nothing but her navigation lights. The window band is
// otherwise a flat gradient, and a flat gradient across 40% of the frame is the whole shot.
function seaContacts(app, list) {
  const g = new THREE.Group();
  g.name = '_bd_contacts';
  const hullGeo = new THREE.BoxGeometry(1, 1, 1);
  const hulls = [], lights = [];
  for (const c of list) {
    const [x, z, len, ang] = c.at;
    hulls.push({ p: [x, ROOM.deck - 15.4, z], ry: ang, s: [len, 5.5, len * 0.16] });
    hulls.push({ p: [x - Math.cos(ang) * len * 0.1, ROOM.deck - 10.5, z + Math.sin(ang) * len * 0.1], ry: ang, s: [len * 0.26, 6.0, len * 0.13] });
    for (const [t, col, up] of c.lamps) {
      lights.push({
        p: [x + Math.cos(ang) * t * len, ROOM.deck - 13.0 + up, z - Math.sin(ang) * t * len],
        col, s: c.dot,
      });
    }
  }
  instanced(g, hullGeo, getMaterial('bridge', 'seat'), hulls, (im, i, o) => place(im, i, o.p, [0, o.ry, 0], o.s));
  // Soft radial sprites with a real halo. A navigation light at two miles is a smear, never a
  // hard-edged white quad, and pure #FFF is not a colour any of them come in.
  const dots = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), additive(0xffffff, haloTexture()), lights.length);
  dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(lights.length * 3), 3);
  dots.frustumCulled = false;
  dots.renderOrder = 3;
  lights.forEach((o, i) => {
    faceQuad(dots, i, o.p, [0, 0, -1], o.s * 4.5, o.s * 4.5);
    C.set(o.col);
    setColour(dots, i, C.r * 1.5, C.g * 1.5, C.b * 1.5);
  });
  g.add(dots);
  app.scene.add(g);
  return g;
}

// Navigation lights are green to starboard, red to port, warm-white for the masthead and stern.
const CONTACTS = [
  { at: [-190, 760, 96, 0.22], dot: 2.6, lamps: [[-0.45, 0xffdcae, 8], [-0.2, 0xfff0d2, 15], [0.05, 0xffe8c4, 3], [0.28, 0xff4030, 5], [0.46, 0xffd8a4, 4]] },
  { at: [420, 1180, 120, -0.4], dot: 2.4, lamps: [[-0.4, 0xffdcae, 6], [0, 0x30ff7a, 12], [0.4, 0xffd8a4, 5]] },
];

// The authored sun for each grade, snapshotted before any bridge shot moves it. sky.setSun writes
// into the grade record, so restoring it is the difference between "this shot is authored" and
// "this shot silently retunes C1's sea shots for the rest of the session".
const SUN0 = Object.fromEntries(['noon', 'dusk', 'night']
  .map(k => [k, [SKY_GRADES[k].azimuth, SKY_GRADES[k].elev]]));

function bridgeScene(app, { grade, rig, look, exposure, env = 0.3, sun = null, heading = 0, deck = null, contacts = false, ripple = 1 }) {
  const { sky, lighting, ocean, bridge, bridgeLights, table } = window.__waterline.world;
  sky.setGrade(grade);
  // The bay faces +Z. The dusk grade's own sun is at 176°, i.e. behind the camera, which is why
  // the window band was a flat orange wall with no sun path in it — a low sun has to be OUT there.
  sky.setSun(sun ? sun[0] : SUN0[grade][0], sun ? sun[1] : SUN0[grade][1]);
  lighting.setGrade(grade);
  // At the night grade the sun is 0.05 intensity and its shadow map is ~28 draw calls of pure
  // cost. The interior's own shadow-casting spot is the one that has to fit in the budget.
  lighting.sun.castShadow = grade !== 'night';
  bridge.setEnv(env);
  app.scene.background = null;
  app.scene.environment = sky.env;
  for (const o of [...app.scene.children]) {
    if (o.name.startsWith('_ph') || o.name.startsWith('_bd')) app.scene.remove(o);
    else o.visible = BRIDGE_ROOTS.has(o.name);
  }
  ocean.setSeaLights?.([]);
  bridge.setHeading(heading);
  bridgeLights.useRig(rig);
  table.setLook(look);
  table.setState(demoView(10, 10));
  app.quality.set('exposure', exposure);
  // Seen through a window pane the sea's ripple normal repeats a countable number of times and
  // reads as woven cloth. `seaRipple` is ocean.js's own knob, so this is a seam, not an edit —
  // and shot.mjs reloads the page per shot, so a bridge shot cannot leak it into a sea shot.
  app.quality.set('seaRipple', ripple);
  if (deck) foredeck(app, deck);
  if (contacts) seaContacts(app, CONTACTS);
  return { sky, lighting, ocean, bridge, bridgeLights, table };
}

defineScenario({
  id: 'bridge_table',
  label: 'Bridge at dusk, built around the lit plot table',
  ref: '1489630_00',
  setup(app) {
    const { bridge, table } = bridgeScene(app, {
      grade: 'dusk', rig: 'bridge', look: 'holo', exposure: 0.92, contacts: true,
      env: 0.16, sun: [23, 1.9], ripple: 2.6,
    });
    bridge.setHaze(0x2a2018, 0.055);
    bridge.setCrewRim(0x4a3a3c, 1.0);
    bridge.setPlotter(false);
    table.setAimMode(null);
    frameCamera(app, {
      pos: [-0.62, ROOM.deck + 1.80, -3.15], look: [0.52, ROOM.deck + 1.00, 1.5],
      fov: 48, near: 0.05, far: 9000,
    });
  },
});

defineScenario({
  id: 'bridge_night',
  label: 'Night watch — a lit deck outside a dark bridge',
  ref: '1489630_15',
  setup(app) {
    const { bridge, table } = bridgeScene(app, {
      grade: 'night', rig: 'night', look: 'holo', exposure: 1.18, deck: { lit: true }, contacts: true,
      env: 0.18, sun: [18, -1.2],
    });
    bridge.setPool(0x2a7d94, 0.85);
    bridge.setHaze(0x14202c, 0.05);
    bridge.setPlotter(false);
    table.setAimMode(null);
    frameCamera(app, {
      pos: [-2.60, ROOM.deck + 1.88, -2.70], look: [0.35, ROOM.deck + 1.12, 1.9],
      fov: 56, near: 0.05, far: 9000,
    });
  },
});

defineScenario({
  id: 'bridge_lamp',
  label: 'The chart table under a single warm lamp',
  ref: '494840_09',
  setup(app) {
    const { bridge, table } = bridgeScene(app, {
      grade: 'night', rig: 'chart', look: 'chart', exposure: 0.90, env: 0.19, sun: [12, -1.1],
    });
    bridge.setPool(0x3a2410, 1.15);
    bridge.setHaze(0x2c1c10, 0.075);
    bridge.setChartLamp(true);
    bridge.setCrewRim(0x4a3320, 1.1);
    bridge.crew.only(['helm', 'watch']);      // the plotter stands 60 cm from this lens
    table.setAimMode(null);
    table.setSheen(-0.26, -0.08, 0.85);
    frameCamera(app, {
      pos: [-0.35, ROOM.deck + 1.86, -2.60], look: [-0.49, ROOM.deck + 0.95, 1.40],
      fov: 50, near: 0.03, far: 9000,
    });
  },
});

// Study shots. Not scored this round — they are the two plates that are closest to what this game
// should look like, and having them renderable is how the next pass checks against them.
defineScenario({
  id: 'bridge_plot',
  label: 'The plot surface from above',
  ref: '1272010_04',
  setup(app) {
    const { bridge, table } = bridgeScene(app, {
      grade: 'night', rig: 'chart', look: 'chart', exposure: 0.72,
    });
    bridge.setCrew(false);
    bridge.setChartLamp(true);
    table.setAimMode(null);
    frameCamera(app, {
      pos: [0.12, ROOM.deck + TABLE.height + 0.86, -0.34], look: [0.02, ROOM.deck + TABLE.height, 0.16],
      fov: 46, near: 0.03, far: 9000,
    });
  },
});

defineScenario({
  id: 'bridge_red',
  label: 'Red-lit night bridge looking out at a burning sea',
  ref: '1272010_02',
  setup(app) {
    const { table } = bridgeScene(app, {
      grade: 'night', rig: 'bridge', look: 'holo', exposure: 1.35, deck: {},
    });
    table.setAimMode(null);
    frameCamera(app, {
      pos: [0.05, ROOM.deck + 1.62, 0.55], look: [0.05, ROOM.deck + 1.52, 4.0],
      fov: 48, near: 0.05, far: 9000,
    });
  },
});

// Dev-only: the whole room from outside, to see where a piece of furniture actually landed.
defineScenario({
  id: 'bridge_dbg',
  label: 'DEV — bridge from above, no plate',
  ref: null,
  setup(app) {
    bridgeScene(app, { grade: 'noon', rig: 'bridge', look: 'holo', exposure: 1.0 });
    frameCamera(app, { pos: [0, ROOM.deck + 7.5, -7.5], look: [0, ROOM.deck + 0.8, 1.0], fov: 60, near: 0.05, far: 9000 });
  },
});
