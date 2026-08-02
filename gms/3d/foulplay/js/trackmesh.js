// Turning a Track into something you can look at: road ribbon, kerbs, rails,
// fences, verges, pillars under the elevated bits, dense roadside dressing,
// and the stands full of the people who are the reason you can get away with
// any of this.
//
// Everything is merged or instanced. A 3km circuit is a handful of draw calls.

import * as THREE from 'three';
import { quality, activeEnv } from './render.js';
import { RAIL_HEIGHT, RAIL_FACE } from './config.js';
import { mulberry32, clamp, lerp, wrap } from './utils.js';

// The kerb was once the highest-chroma and the highest-value object in the
// frame at the same time, which makes it the loudest thing on screen — louder
// than the car, which is not a job a kerb should ever get. So the red comes off
// full saturation and the white sits under the hero's paint rather than level
// with it.
//
// It then went too far the other way. 0x9d4036 has a luminance of 0.11 linear,
// and under a rig whose floor was 7% of its key that measured 16-30 on screen —
// the same values as the tyres. A kerb rendering black is not a restrained kerb.
// Both are lifted here to sit one clear band under the concrete: the red reads
// (159,59,46) on a sunlit top face, which is unambiguously red and still only
// half the value of the white block beside it.
const KERB_RED = new THREE.Color(0xc45045);
const KERB_WHITE = new THREE.Color(0xc8c4b6);
const KERB_GREY = new THREE.Color(0x484e57);

// ---------------------------------------------------------------------------
// THE WARM MASS.
//
// This circuit's palette was 100% cool — green grass, grey road, lavender
// mountains, blue sky — and a frame with no warm mass in it gives the cars
// nothing to sit against. Every car in this game is a saturated cool or hot
// colour dropped onto a cool ground, so the hot ones fight the frame and the
// cool ones vanish into it.
//
// The fix is not to resaturate the cars, it is to put a cream/sand mass behind
// them: the concrete a real circuit is made of. Grandstands, barrier walls,
// marshal huts, the run-off apron and the buildings behind all move off grey
// and onto sand, which is a large, calm, WARM area that the whole colour scheme
// can be read against. A shipped reference does exactly this and its cream
// concrete measures brighter than its own sky.
//
// Each environment still gets its own version, so the neon strip stays violet
// and nothing turns beige that should not.
// ---------------------------------------------------------------------------
// Taken down a fifth. Measured against the probe, 0xeadeba put the grandstand
// and the buildings at 183 up-face / 213 sun-side — the SAME two numbers as the
// hero car's own paint, which is precisely how "a large object in the centre of
// frame dissolves into the beige cliff behind it" happens. Nothing in the world
// is allowed to sit in the hero's value band. The sand is unchanged as a hue;
// it is simply a clear band further down the ladder, which is where a
// background belongs.
//
// What matters is the GAP, not the hex. When the rig went up the concrete had
// to come up with it or the run-off apron — the largest pale surface in a
// frame, and the one the reference uses to carry its highlights — would have
// stayed a stop behind everything around it. 0xddc898 measures 212 up-face /
// 233 sun-side against a hero at 226 / 247 — still the whole band below the
// car, just one band higher up the scale than it used to sit.
const CONCRETE = {
  day:  { face: 0xddc898, mid: 0xc6b17a, deep: 0xa79367 },
  neon: { face: 0x4a3468, mid: 0x3d2c5a, deep: 0x37294f },
};
function concreteFor(env) {
  return env.neon ? CONCRETE.neon : CONCRETE.day;
}
// Two line values, and NEITHER of them is white. Paint is not a light source.
// One shared 0xf6f7f9 for edge and centre put the markings at the very top of
// the frame's value range — above the hero car, above the kerb, level with the
// cloud — so the brightest thing on screen was road furniture. The edge line is
// the more useful of the two (it tells you where the track ends) so it keeps a
// little more value; the centre dash drops well under the car.
// Both went up with the rig, by less than the rig did, so the ranking is
// unchanged and the edge line is simply legible again: 213 up-face against a
// hero at 224. The reference keeps its lane paint among the brightest things in
// the frame; what it never does is let the CENTRE dash do that, which is why
// this pair stays split.
const LINE_EDGE = new THREE.Color(0xcdcec0);
const LINE_DASH = new THREE.Color(0xb6b7aa);

// Nothing in the world used to cast. 149 shadow casters existed on a live
// circuit and every one of them was a car body panel — which is why a trackside
// board sat on the grass with no shadow under it and read as a sticker.
//
// The named groups below are the ones that can actually reach the shadow box,
// which is a few tens of metres around the player. Buildings and the skyline
// silhouette sit 70m+ off the racing line and can never land a texel in it, so
// they stay off and cost nothing. The mesh fence stays off too: its holes live
// in an alpha map the depth pass does not read, so it would cast as a solid
// wall.
function markCasters(o) {
  if (!o) return o;
  o.traverse((k) => { if (k.isMesh) k.castShadow = true; });
  return o;
}

export function buildTrackMesh(track, opts = {}) {
  const env = activeEnv;
  const group = new THREE.Group();
  group.name = 'trackMesh';
  const rng = mulberry32(1000 + track.length | 0);
  const cast = quality.shadows ? markCasters : (o) => o;

  group.add(buildRoad(track, env));
  group.add(buildVerge(track, env));
  const kerbs = buildKerbs(track, env);
  if (kerbs) group.add(kerbs);
  const rails = buildRails(track, env);
  if (rails) group.add(cast(rails));
  const posts = buildPosts(track, env);
  if (posts) group.add(cast(posts));
  const fence = buildFence(track, env);
  if (fence) group.add(fence);
  const fencePosts = buildFencePosts(track, env);
  if (fencePosts) group.add(cast(fencePosts));
  const pillars = buildPillars(track, env);
  if (pillars) group.add(cast(pillars));
  group.add(cast(buildStartLine(track, env)));

  // One distance field, shared. The terrain needs it to build itself and
  // everything standing on the terrain needs it to find the floor.
  const height = terrainHeightFn(track);
  attachGroundProbe(track, height);

  const scenery = buildScenery(track, env, rng, height);
  if (scenery) group.add(scenery);

  const pads = buildPads(track);
  if (pads) group.add(pads);

  const cams = buildCameras(track);
  group.add(cams);
  group.userData.cams = cams;

  const ground = buildTerrain(track, env, height);
  group.add(ground);

  group.traverse((o) => { if (o.material) o.material.__owned = true; });
  return group;
}

// ---------------------------------------------------------------------------
// Road surface — bright edge lines, a dashed centre line, tonal asphalt, and
// kerb blocks that actually stand proud with a riser face.
// ---------------------------------------------------------------------------
// Every colour band needs a bracketing column on BOTH sides or the vertex
// colour interpolates across the whole quad and comes back as a smear. Each
// band below is written <edge>/<band>...<band>/<edge> for exactly that reason.
//
// Widths are fractions of the half-width, so on a 10m half-width road the edge
// line is 0.54m and the centre dash 0.52m. Still wider than a real marking,
// deliberately — the chase camera sits a metre off the deck and a scale 100mm
// line is a sub-pixel flicker by twenty metres out — but the centre dash used
// to be 0.76m, half again the edge line, which is what made it read as a
// runway rather than a road.
//
// The table is written as an exact mirror about u=0. It always was, but the
// right-hand side of the frame kept coming back looking thinner and unfinished
// next to the left, so it is worth saying: if the two sides ever differ, that
// is a bug here and nowhere else. The kerb is also wider than it was (0.7m of
// the half-width instead of 0.48m) so it survives the perspective squash on
// the far side of the road instead of collapsing into the edge line.
const ROAD_COLS = [
  { u: -1.000, region: 'kerb' },
  { u: -0.930, region: 'kerb' },
  { u: -0.928, region: 'kerbBase' },   // riser foot: the kerb top is lifted, this is not
  { u: -0.918, region: 'kerbBase' },
  { u: -0.916, region: 'edge' },
  { u: -0.862, region: 'edge' },
  { u: -0.854, region: 'asphalt' },
  { u: -0.480, region: 'tire' },
  { u: -0.440, region: 'tire' },
  { u: -0.042, region: 'asphalt' },
  { u: -0.026, region: 'center' },
  { u: 0.026, region: 'center' },
  { u: 0.042, region: 'asphalt' },
  { u: 0.440, region: 'tire' },
  { u: 0.480, region: 'tire' },
  { u: 0.854, region: 'asphalt' },
  { u: 0.862, region: 'edge' },
  { u: 0.916, region: 'edge' },
  { u: 0.918, region: 'kerbBase' },
  { u: 0.928, region: 'kerbBase' },
  { u: 0.930, region: 'kerb' },
  { u: 1.000, region: 'kerb' },
];

function buildRoad(track, env) {
  const n = track.count;
  const cols = ROAD_COLS.length;
  const rows = n + 1;                       // repeat the first row to close
  const pos = new Float32Array(rows * cols * 3);
  const col = new Float32Array(rows * cols * 3);
  const nor = new Float32Array(rows * cols * 3);
  const idx = [];

  // THE VALUE ANCHOR OF THE WHOLE FRAME. Asphalt was raised off near-black to
  // 0x5c6169 while the road was still being shaded with a downward normal and
  // receiving no sun at all — it was albedo compensating for a lighting bug.
  // The bug is fixed, the road now takes the key, and that compensation is pure
  // damage: it put the largest surface on screen into the same value band as
  // the sky, the mountains and the player's own car, and left the frame with
  // nothing dark in it to measure the bright things against. Back down it goes.
  // A road is the floor of the ladder, not a rung in the middle of it.
  // Calibrated, not guessed: a shipped low-poly racer's tarmac measures ~100
  // luminance lit and ~60 in a cast shadow against a ~175 sky. The pass this
  // replaces measured ~90 lit with NO shadow anywhere, so the road was in the
  // right band and simply had nothing on it. The first correction here went to
  // ~55 lit, which is a third darker than any shipped reference and turned the
  // whole bottom half of the frame into a slab. This lands ~80 lit / ~30 in
  // shadow: still clearly the darkest large surface in frame, with enough room
  // above the floor that a shadow reads as shade rather than as a hole.
  // Warm-neutral, not blue-grey. A blue asphalt under a blue hemisphere puts
  // the largest surface in the frame in the same hue family as the sky, so the
  // road separates from it only by value and the picture reads cold and
  // monochrome. A shipped reference measures its tarmac at rgb(101,100,79) —
  // faintly warm — which sets the road against the sky on hue as well.
  // Only a HAIR warm. The key is 0xfff3d8 and the grade's vibrance pass boosts
  // saturation hardest on near-neutrals, so both are already pulling the road
  // toward yellow; a strongly warm albedo on top of that came back olive.
  // Raised again, and this time it is not compensation for anything: the key
  // went up by half and the fill floor did not, so the same albedo came back a
  // stop and a half darker than the calibration above asks for. Measured, this
  // lands the lit tarmac near 100 and a cast shadow on it near 25 — the shipped
  // reference measures 100 lit, and its shadows are the one place this frame is
  // allowed to be deliberately harder than the reference.
  // Cool-neutral on purpose. The key is warm and the sky now carries a warm
  // horizon band, so a warm-grey base compounds into visible khaki tarmac —
  // right luminance, wrong hue. Biasing the albedo cool lands it neutral once
  // the light is applied. Do not "correct" this back toward warm grey.
  // Raised by a sixth against the new grade, which is a fifth darker at the
  // bottom of the range than the ACES curve it replaced. Same measured tarmac,
  // same cool bias — the number moved because the curve did, not because the
  // hue decision changed. It has not: do not "correct" it back to warm grey.
  const asphaltBase = new THREE.Color(env.neon ? 0x5c5c7a : 0x6f727b);

  // Night and neon circuits are lit by a 2.1-2.3 key against a black sky, so
  // paint that reads correctly at noon disappears entirely there. The markings
  // are the only thing telling you where the lane is on those tracks, so they
  // get their daylight value back.
  const lineEdge = new THREE.Color(LINE_EDGE);
  const lineDash = new THREE.Color(LINE_DASH);
  if (env.neon || env.stars > 0.5) { lineEdge.multiplyScalar(1.45); lineDash.multiplyScalar(1.45); }
  const tmp = new THREE.Color();
  const kerbTmp = new THREE.Color();
  const kerbTmp2 = new THREE.Color();
  // 3m of paint, 6m of gap. It was 6 on / 6 off, which at this camera height
  // reads as a near-continuous stripe and, being the brightest thing in frame,
  // dragged the eye straight off the car.
  const dashLen = 3.0;

  for (let r = 0; r < rows; r++) {
    const i = r % n;
    const p = track.pos[i], rt = track.right[i], up = track.up[i];
    const w = track.width[i];
    const curv = Math.abs(track.curv[i]);
    const kerbOn = curv > 0.0055 || track.kind[i] === 'loop';
    const s = i * track.spacing;
    // Stripe off arc length, not off the row index — spacing varies between
    // circuits, and an index-based stripe changes size with it.
    const stripe = Math.floor(s / 2.2) % 2 === 0;
    const dashOn = Math.floor(s / dashLen) % 3 === 0;
    const patch = 1 + Math.sin(s * 0.045) * 0.055 + Math.sin(s * 0.011 + 1.7) * 0.035;

    // The boundary is red/white the whole way round, not just on corners —
    // "track" and "off track" were separated by nothing but a colour change.
    // Corners get the full proud kerb; straights get the same stripe laid flat
    // and knocked back, so a corner still announces itself.
    // THE STRAIGHTS' PAINTED STRIPE IS NOT RED ANY MORE, AND THIS IS THE "FLAT
    // RED SLAB" NOBODY COULD FIND. buildKerbs below was rebuilt into hard-edged
    // alternating blocks precisely because a vertex-coloured ribbon smears its
    // stripe across the metre between two rows — and then this line went on
    // painting a red/white stripe into the ribbon on every straight, where a
    // 2.2m stripe on a 1.5m row pitch interpolates into one continuous
    // saturated red band with no alternation and no per-segment value in it at
    // all. From a chase camera the near-left kerb is a straight far more often
    // than it is a corner, so that band was the thing filling the corner of the
    // frame: the highest-chroma object on screen, out-shouting the car.
    //
    // Red/white now means ONE thing — a corner kerb, built as blocks — and a
    // straight gets a calm bone shoulder. Which is also how a real circuit
    // marks the difference.
    const kTop = kerbOn ? kerbTmp.copy(stripe ? KERB_RED : KERB_WHITE)
      : kerbTmp.copy(KERB_WHITE).lerp(KERB_GREY, 0.40);
    const kBase = kerbTmp2.copy(kTop).multiplyScalar(0.62);

    for (let c = 0; c < cols; c++) {
      const { u, region } = ROAD_COLS[c];
      const o = (r * cols + c) * 3;
      // On a corner the proud kerb is a separate merged mesh (see buildKerbs) —
      // it has to be, because a vertex-coloured ribbon interpolates its stripe
      // across every quad and comes back as a smeared two-colour band with no
      // block rhythm in it. What is left here is the flat painted stripe on the
      // straights, plus the base the blocks stand on.
      const lift = region === 'kerb' ? (kerbOn ? 0 : 0.05) : 0;
      pos[o] = p.x + rt.x * u * w + up.x * lift;
      pos[o + 1] = p.y + rt.y * u * w + up.y * lift;
      pos[o + 2] = p.z + rt.z * u * w + up.z * lift;
      nor[o] = up.x; nor[o + 1] = up.y; nor[o + 2] = up.z;

      // Across-width value, which the tarmac had none of: a road was one
      // colour from kerb to kerb and read as a printed strip. The middle is
      // polished dark by traffic, the outer thirds are lighter with the dust
      // and grit that gets swept off the racing line.
      // Widened. The road is the largest surface in frame and it was carrying a
      // 26% swing from centreline to kerb, which after the old shouldered curve
      // was nothing at all; on the straight part of the new curve the same swing
      // arrives whole, and it is the only thing giving a long empty stretch of
      // tarmac any structure. Dark polished line down the middle, dusty at the
      // edges.
      const wShade = 0.84 + 0.40 * Math.abs(u);

      let cc;
      if (region === 'kerb') {
        cc = kTop;
      } else if (region === 'kerbBase') {
        cc = kBase;
      } else if (region === 'edge') {
        cc = lineEdge;
      } else if (region === 'tire') {
        const g = 0.86 + ((i * 5) % 7) * 0.01;
        cc = tmp.copy(asphaltBase).multiplyScalar(patch * g * wShade * 0.78);
      } else if (region === 'center') {
        if (dashOn) {
          cc = lineDash;
        } else {
          const g = 1 + ((i * 7 + c * 13) % 11) * 0.01;
          cc = tmp.copy(asphaltBase).multiplyScalar(patch * g * wShade);
        }
      } else {
        // A little grain plus a slow tonal drift so a long straight is not
        // one flat colour.
        const g = 1 + ((i * 7 + c * 13) % 11) * 0.01;
        cc = tmp.copy(asphaltBase).multiplyScalar(patch * g * wShade);
      }
      col[o] = cc.r; col[o + 1] = cc.g; col[o + 2] = cc.b;
    }
  }

  // THE bug. This ribbon was wound (a, d, b) — clockwise seen from above — so
  // the surface you drive on was the material's BACK face. The vertex normals
  // say "up", but `side: DoubleSide` makes three flip the shading normal on a
  // back face, so the asphalt was shaded with a normal pointing straight down
  // into the earth: dot(N, sun) came out negative and clamped to zero. The road
  // received NO directional light at all, only the ground half of the
  // hemisphere. That is why the road was a dead grey slab and, far worse, why
  // no car ever cast a visible shadow — a shadow removes the sun, and there was
  // no sun on the road to remove. Wound the other way, the driving surface is
  // the front face and the normal points at the sky where it belongs.
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide,
  }));
  mesh.receiveShadow = quality.shadows;
  mesh.name = 'road';
  return mesh;
}

// ---------------------------------------------------------------------------
// Kerbs — ALTERNATING BLOCKS, not a painted stripe.
//
// The kerb used to be four columns of the road ribbon carrying a red/white
// vertex colour. Two things went wrong with that and both are structural. A
// ribbon shares its vertices between neighbouring quads, so a red row next to a
// white row interpolates across the metre between them and the stripe arrives
// as a gradient — the "smeared two-colour band with no block rhythm". And the
// "riser" was a pair of columns 2cm apart carrying the ribbon's own upward
// normal, so the face that is supposed to catch the light edge-on was shaded as
// though it pointed at the sky.
//
// Built as its own merged mesh, every block owns its twelve vertices: the
// colour boundary is a hard edge because there is nothing to interpolate with,
// and the top, the outer riser and the inner riser are three separate faces at
// three angles, so a kerb is one more object in the frame showing three values.
// One draw call, and only on the corners — a straight keeps the painted stripe.
// ---------------------------------------------------------------------------
const KERB_H = 0.17;        // how proud a corner kerb stands
const KERB_U0 = 0.924;      // inner edge, as a fraction of the half-width
const KERB_U1 = 1.014;      // outer edge — it overhangs the road slightly
const KERB_BLOCK = 1.0;     // metres of one colour
const KERB_GROUT = 0.12;    // dark joint between blocks
const KERB_CHAM = 0.62;     // where the top breaks into its outer chamfer

function buildKerbs(track, env) {
  const n = track.count;
  const total = n * track.spacing;
  const pos = [], col = [], idx = [];
  let v = 0;
  const red = new THREE.Color(KERB_RED);
  const white = new THREE.Color(KERB_WHITE);
  const grout = new THREE.Color(0x2c2f34);
  const dim = env.neon ? 0.8 : 1;

  const quad = (a, b, c, d, cc) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    for (let k = 0; k < 4; k++) col.push(cc.r, cc.g, cc.b);
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    v += 4;
  };

  for (const side of [-1, 1]) {
    for (let s = 0; s + KERB_BLOCK <= total; s += KERB_BLOCK) {
      const i = Math.round(s / track.spacing) % n;
      const j = Math.round((s + KERB_BLOCK) / track.spacing) % n;
      const on = Math.abs(track.curv[i]) > 0.0055 || track.kind[i] === 'loop';
      if (!on || track.up[i].y < 0.5 || track.kind[i] === 'loop') continue;
      const w0 = track.width[i] * side, w1 = track.width[j] * side;
      const blk = Math.floor(s / KERB_BLOCK);
      const cc = (blk % 2 === 0) ? red : white;
      // Per-block value. Without it every red block in a run is the identical
      // hex and the alternation only exists as HUE — so at any distance where
      // the blocks are shorter than a few pixels the whole run averages into one
      // unmodulated slab, which is exactly what kept getting reported. A few
      // percent either way, cycling on a period that does not divide by two, is
      // enough that no two adjacent blocks match.
      const jit = 1 + ((blk * 7 + (side > 0 ? 3 : 0)) % 5) * 0.055 - 0.11;
      const c2 = cc.clone().multiplyScalar(0.62 * dim * jit);
      const c3 = cc.clone().multiplyScalar(dim * jit);
      const s1 = s + KERB_BLOCK;
      // A JOINT BETWEEN BLOCKS. Alternating hues alone stop working the moment
      // the camera is close enough that one block fills a chunk of the frame —
      // which is exactly where the near-left kerb sits for most of a lap — and
      // what arrives is an unmodulated red slab. A dark groove at the end of
      // every block is the thing that survives the close-up: real kerbs have
      // one, it costs a quad, and it works at any distance because it is a
      // VALUE break rather than a hue break.
      // It is painted ON, not cut IN: a real groove leaves a notch you can see
      // the apron through at the shallow angle the near kerb is always viewed
      // at, which is a worse artefact than the slab it was fixing. The risers
      // still run the full block, so the kerb is a continuous solid.
      const sj = s1 - KERB_GROUT;
      const UM = KERB_U0 + (KERB_U1 - KERB_U0) * KERB_CHAM;
      const a = track.worldAt(s, w0 * KERB_U0, KERB_H);
      const b = track.worldAt(s, w0 * KERB_U1, KERB_H);
      const am = track.worldAt(s, w0 * UM, KERB_H);
      const c = track.worldAt(sj, w1 * KERB_U0, KERB_H);
      const d = track.worldAt(sj, w1 * KERB_U1, KERB_H);
      const cm = track.worldAt(sj, w1 * UM, KERB_H);
      const c1 = track.worldAt(s1, w1 * KERB_U0, KERB_H);
      const d1 = track.worldAt(s1, w1 * KERB_U1, KERB_H);
      // The top is split ALONG the kerb as well as across it. Grout lines only
      // help while more than one block is in shot; with the chase camera a metre
      // off the deck the near kerb is often ONE block filling a corner of the
      // frame, and one block of one hex is the flat red slab all over again.
      // A chamfer strip down the outer 38% is a value break that survives any
      // viewing angle, because it runs the length of the thing.
      quad(a, am, c, cm, c3);
      quad(am, b, cm, d, c3.clone().multiplyScalar(0.79));
      quad(c, d, c1, d1, grout);
      // outer riser, dropped below the apron so no daylight shows under it
      const e = track.worldAt(s, w0 * KERB_U1, -0.10);
      const f = track.worldAt(s1, w1 * KERB_U1, -0.10);
      quad(b, e, d1, f, c2);
      // inner riser, down to the tarmac
      const g = track.worldAt(s, w0 * KERB_U0, 0);
      const h = track.worldAt(s1, w1 * KERB_U0, 0);
      quad(a, g, c1, h, c2);
    }
  }
  if (!pos.length) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide, flatShading: true,
  }));
  mesh.receiveShadow = quality.shadows;
  mesh.name = 'kerbs';
  return mesh;
}

// A wide apron either side so an elevated road does not float in space, and
// so leaving the track lands you on something.
// Ten columns rather than eight, and the two extra ones exist to give the
// run-off apron a WIDTH. With one runoff column per side the tan never got to
// be a strip — it was a single vertex colour that interpolated away over the
// next five metres, so the road ended and grass began with nothing in between,
// and the right-hand side of frame in particular read as tarmac terminating
// into a dark void. Two columns per side hold a flat 3.2m apron, then the bank
// falls away to the outfield.
//
// The bank's slope is also where most of the verge's tonal variation comes
// from — real shading at a different angle to the key, not a painted gradient,
// so it moves with the sun.
//
// THE YELLOW-TO-GREEN SMEAR ON THE LEFT OF FRAME WAS THIS TABLE. buildRoad's
// own comment says it out loud — "every colour band needs a bracketing column
// on BOTH sides or the vertex colour interpolates across the whole quad and
// comes back as a smear" — and then this table, six inches further down the
// file, has one column per band and no brackets anywhere. So the sand apron at
// 3.2m and the mown grass at 9m were the SAME two vertices, and the six metres
// between them were a continuous gouraud ramp from tan through mustard to
// green. Seen from a chase camera a metre off the deck that ramp is not six
// metres of ground, it is most of the left half of the picture: a soft vertical
// wash with no edge in it anywhere, which reads as a broken vertex colour or a
// fog band rather than as terrain. Every boundary is doubled now, so the apron
// ends on a line.
//
// The inner lip also comes up. It sat 20cm below the road edge while the kerb's
// own riser stops at 10cm, so there was a 10cm step of nothing at the one seam
// the camera is closest to for the entire race.
const VERGE_OFF = [-46, -20.02, -20, -9.02, -9, -3.2, -3.2, 0, 0, 3.2, 3.2, 9, 9.02, 20, 20.02, 46];
const VERGE_DROP = [-3.0, -1.5, -1.5, -0.72, -0.72, -0.28, -0.28, -0.10, -0.10, -0.28, -0.28, -0.72, -0.72, -1.5, -1.5, -3.0];

// How far the ground has fallen away `e` metres beyond the road edge, read
// straight off the apron profile above.
//
// Everything standing on the verge used to be placed at `y = 0` — road level —
// while the ground under it is anywhere from 0.3m to 3m lower. So the roadside
// props were all hovering, by a metre in the near band and by two in the far
// one, and a hovering box with a flat lit face and no visible base is exactly
// the "tall slab standing alone on the grass with no base" a critic kept
// finding. There was never a missing shadow; there was a missing FLOOR.
const VERGE_E = [0, 3.2, 9, 20, 46];
const VERGE_Y = [-0.10, -0.28, -0.72, -1.5, -3.0];
function vergeDrop(e) {
  if (e <= 0) return VERGE_Y[0];
  for (let k = 1; k < VERGE_E.length; k++) {
    if (e <= VERGE_E[k]) {
      return lerp(VERGE_Y[k - 1], VERGE_Y[k], (e - VERGE_E[k - 1]) / (VERGE_E[k] - VERGE_E[k - 1]));
    }
  }
  return VERGE_Y[VERGE_Y.length - 1];
}

// The height of whatever is actually underneath a world point — the tarmac if
// it is over the road, the apron if it has just gone over the edge, the terrain
// heightfield once it is out in the scenery.
//
// A wreck is simulated in world space, so it needs this and nothing else. It
// used to guess with `roadY - 2.2`, which put the resting height of a wrecked
// car a metre and a half UNDER the surface it had just crashed on, and used a
// single flat plane at `bounds.min.y - 3` for everything off the circuit — so a
// car thrown off a raised section fell past the visible ground and kept going.
// Those two numbers between them are why a crash so often ended with the car
// vanishing into the earth. It lives here because this is the only file that
// knows both the apron profile and the heightfield.
//
// `out.onRoad` is left on the function after each call rather than returned in
// an object: this runs per wrecked car per frame and allocating a result would
// be pure garbage.
function attachGroundProbe(track, height) {
  const _p = new THREE.Vector3();
  const probe = (pos, sHint) => {
    const near = track.nearestS(pos, sHint == null ? null : sHint, 300);
    const i = Math.floor(track.idx(near.s));
    const w = track.width[i];
    const e = Math.abs(near.t) - w;
    // Surface height at that offset, so a banked corner reads as banked rather
    // than as its centreline.
    track.worldAt(near.s, clamp(near.t, -w, w), 0, _p);
    const roadY = _p.y;
    probe.s = near.s;
    probe.t = near.t;
    probe.onRoad = e <= 0.5;
    if (e <= 0) return roadY;
    const apron = roadY + vergeDrop(e);
    if (e < 24) return apron;
    // Past the apron the terrain owns the floor. Blend rather than step, or a
    // car sliding out of the run-off drops through a seam.
    const terra = height(pos.x, pos.z);
    return lerp(apron, Math.min(apron, terra), clamp((e - 24) / 22, 0, 1));
  };
  probe.s = 0;
  probe.t = 0;
  probe.onRoad = true;
  track.groundProbe = probe;
  track.terrainHeight = height;
}

function buildVerge(track, env) {
  const n = track.count;
  const step = 2;
  const rows = Math.floor(n / step) + 1;
  const cols = VERGE_OFF.length;
  const pos = new Float32Array(rows * cols * 3);
  const col = new Float32Array(rows * cols * 3);
  const idx = [];
  const base = new THREE.Color(env.ground);
  // The apron is the one piece of warm mass that touches the road on every
  // frame, so it carries more of the sand than it used to.
  // Knocked back from 0.74. The apron is the piece of warm mass nearest the
  // camera and the one thing that touches the hero car's own silhouette, so at
  // full concrete it was measuring BRIGHTER than the tarmac and only a shade
  // under the grass — a pale slab running the length of the frame right where
  // the eye is trying to find the car's dark underside. It is still sand, it is
  // just no longer competing.
  const runoff = new THREE.Color(env.ground).lerp(new THREE.Color(concreteFor(env).deep), 0.58)
    .multiplyScalar(0.86);
  const far = new THREE.Color(env.ground).multiplyScalar(0.74);
  const tmp = new THREE.Color();

  for (let r = 0; r < rows; r++) {
    const i = (r * step) % n;
    const p = track.pos[i], rt = track.right[i], up = track.up[i];
    const w = track.width[i];
    const s = i * track.spacing;
    const skip = track.kind[i] === 'loop' || track.up[i].y < 0.55;
    // Mown bands plus a slow drift. Cheap, and at speed it is what stops the
    // grass reading as one flat sheet of colour flying past.
    const mow = Math.floor(s / 11) % 2 === 0 ? 1.18 : 0.82;
    const drift = 1 + Math.sin(s * 0.017) * 0.09 + Math.sin(s * 0.0053 + 1.1) * 0.06;
    for (let c = 0; c < cols; c++) {
      const o = (r * cols + c) * 3;
      const scale = skip ? 0.02 : 1;
      const off = (c < cols / 2 ? -w : w) + VERGE_OFF[c];
      const drop = VERGE_DROP[c];
      pos[o] = p.x + rt.x * off * scale + up.x * drop;
      pos[o + 1] = p.y + rt.y * off * scale + up.y * drop;
      pos[o + 2] = p.z + rt.z * off * scale + up.z * drop;
      // Distance out from the road, in bands, so the two sides are written by
      // one expression and cannot drift apart. 7 = the road edge, 0 = outfield,
      // and every boundary is a doubled column so the value STEPS instead of
      // ramping: 7/6 is the apron, 5/4 the mown verge, 3/2 the outfield, 1/0
      // the far field.
      const band = Math.min(c, cols - 1 - c);
      if (band >= 6) {
        tmp.copy(runoff);
        if (band === 6) tmp.multiplyScalar(0.90);   // the apron falls off at its outer lip
      } else if (band >= 4) {
        // Two greens, not one. The verge nearest the circuit is mown short and
        // pale; the outfield behind it is coarser and a good step darker. One
        // flat green from kerb to horizon is what makes grass read as paper.
        tmp.copy(base).multiplyScalar(1.10 * mow * drift);
      } else if (band >= 2) {
        tmp.copy(base).multiplyScalar(0.87 * mow * drift);
      } else {
        tmp.copy(far).multiplyScalar(drift);
      }
      col[o] = tmp.r; col[o + 1] = tmp.g; col[o + 2] = tmp.b;
    }
  }
  // Wound to face the sky — see the note in buildRoad. computeVertexNormals
  // follows the winding, so the old order gave this apron downward normals too.
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.receiveShadow = quality.shadows;
  mesh.name = 'verge';
  return mesh;
}

// ---------------------------------------------------------------------------
// Barriers
// ---------------------------------------------------------------------------
function buildRails(track, env) {
  const n = track.count;
  const pos = [], col = [], idx = [];
  const metal = new THREE.Color(env.neon ? 0x8a7fd0 : 0xa8b2bd);
  const metal2 = new THREE.Color(env.neon ? 0xff5fc0 : 0xf2f5f8);
  const cc = concreteFor(env);
  const concrete = new THREE.Color(cc.face);
  const concrete2 = new THREE.Color(cc.deep);
  let v = 0;

  for (const side of [-1, 1]) {
    let run = null;
    const flush = () => {
      if (!run || run.length < 2) { run = null; return; }
      const base = v;
      for (const s of run) {
        pos.push(s.lo.x, s.lo.y, s.lo.z, s.hi.x, s.hi.y, s.hi.z);
        col.push(s.c1.r, s.c1.g, s.c1.b, s.c2.r, s.c2.g, s.c2.b);
        v += 2;
      }
      for (let k = 0; k < run.length - 1; k++) {
        const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
      run = null;
    };

    for (let i = 0; i <= n; i++) {
      const j = i % n;
      const type = side < 0 ? track.railL[j] : track.railR[j];
      if (type === 'open') { flush(); continue; }
      const p = track.pos[j], rt = track.right[j], up = track.up[j];
      const w = track.width[j] + RAIL_FACE;
      const h = type === 'wall' ? RAIL_HEIGHT * 1.35 : RAIL_HEIGHT;
      const wall = type === 'wall';
      const stripe = Math.floor(j / 5) % 2 === 0;
      const lo = new THREE.Vector3(
        p.x + rt.x * side * w, p.y + rt.y * side * w, p.z + rt.z * side * w
      );
      const hi = lo.clone().addScaledVector(up, h);
      lo.addScaledVector(up, -0.35);
      if (!run) run = [];
      run.push({
        lo, hi,
        c1: wall ? (stripe ? concrete : concrete2) : metal,
        c2: wall ? concrete2 : (stripe ? metal2 : metal),
      });
    }
    flush();
  }

  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  fadeNearCamera(mat);
  mat.__owned = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'rails';
  mesh.renderOrder = 1;
  return mesh;
}

// Barriers go see-through when the lens is jammed against them. Get pinned
// against the steel and the camera ends up *outside* the circuit looking in —
// without this you spend the most spectacular two seconds of the race staring
// at a fence. Anything more than sixteen metres away stays completely solid,
// so the track never looks like it is made of glass.
export function fadeNearCamera(mat, near = 5, far = 17, floor = 0.12) {
  mat.transparent = true;
  mat.depthWrite = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.fadeNear = { value: near };
    shader.uniforms.fadeFar = { value: far };
    shader.uniforms.fadeFloor = { value: floor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLensDist;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLensDist = -mvPosition.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying float vLensDist;\nuniform float fadeNear;\nuniform float fadeFar;\nuniform float fadeFloor;')
      .replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.a *= mix(fadeFloor, 1.0, smoothstep(fadeNear, fadeFar, vLensDist));');
  };
  mat.needsUpdate = true;
  return mat;
}

function buildPosts(track, env) {
  const n = track.count;
  const spots = [];
  const every = Math.max(3, Math.round(9 / track.spacing));
  for (let i = 0; i < n; i += every) {
    for (const side of [-1, 1]) {
      const type = side < 0 ? track.railL[i] : track.railR[i];
      if (type !== 'rail') continue;
      spots.push({ i, side });
    }
  }
  if (!spots.length) return null;
  const geo = new THREE.BoxGeometry(0.26, RAIL_HEIGHT + 0.5, 0.26);
  const postMat = new THREE.MeshLambertMaterial({ color: env.neon ? 0x4a3a70 : 0x6b737d });
  fadeNearCamera(postMat);
  postMat.__owned = true;
  const mesh = new THREE.InstancedMesh(geo, postMat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3();
  spots.forEach((sp, k) => {
    const p = track.pos[sp.i], rt = track.right[sp.i];
    up.copy(track.up[sp.i]);
    const w = track.width[sp.i] + 0.5;
    const at = new THREE.Vector3(
      p.x + rt.x * sp.side * w, p.y + rt.y * sp.side * w, p.z + rt.z * sp.side * w
    ).addScaledVector(up, (RAIL_HEIGHT + 0.5) * 0.5 - 0.35);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    m.compose(at, q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(k, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'posts';
  return mesh;
}

// A see-through mesh fence above the solid wall sections — a single tiled
// ribbon with a procedural diamond-grid alpha texture, not a wall of planes.
let _fenceTex = null;
function fenceTexture() {
  if (_fenceTex) return _fenceTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 2.2;
  for (let x = -64; x <= 128; x += 16) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 64, 0); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _fenceTex = t;
  return t;
}

function buildFence(track, env) {
  const n = track.count;
  const pos = [], uv = [], idx = [];
  const fenceH = 2.15;
  const tile = 3;
  let v = 0;

  for (const side of [-1, 1]) {
    let run = null;
    const flush = () => {
      if (!run || run.length < 2) { run = null; return; }
      const base = v;
      for (const s of run) {
        pos.push(s.lo.x, s.lo.y, s.lo.z, s.hi.x, s.hi.y, s.hi.z);
        uv.push(s.u, 0, s.u, 1);
        v += 2;
      }
      for (let k = 0; k < run.length - 1; k++) {
        const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
      run = null;
    };

    for (let i = 0; i <= n; i++) {
      const j = i % n;
      const type = side < 0 ? track.railL[j] : track.railR[j];
      if (type !== 'wall') { flush(); continue; }
      const p = track.pos[j], rt = track.right[j], up = track.up[j];
      const w = track.width[j] + RAIL_FACE;
      const wallH = RAIL_HEIGHT * 1.35;
      const lo = new THREE.Vector3(
        p.x + rt.x * side * w, p.y + rt.y * side * w, p.z + rt.z * side * w
      ).addScaledVector(up, wallH);
      const hi = lo.clone().addScaledVector(up, fenceH);
      if (!run) run = [];
      run.push({ lo, hi, u: (j * track.spacing) / tile });
    }
    flush();
  }

  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    map: fenceTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
    color: env.neon ? 0xcabfff : 0xd7dee6,
  });
  fadeNearCamera(mat, 4, 14, 0.05);
  mat.__owned = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fence';
  mesh.castShadow = false;
  mesh.renderOrder = 1;
  return mesh;
}

function buildFencePosts(track, env) {
  const n = track.count;
  const spots = [];
  const every = Math.max(3, Math.round(9 / track.spacing));
  for (let i = 0; i < n; i += every) {
    for (const side of [-1, 1]) {
      const type = side < 0 ? track.railL[i] : track.railR[i];
      if (type !== 'wall') continue;
      spots.push({ i, side });
    }
  }
  if (!spots.length) return null;
  const wallH = RAIL_HEIGHT * 1.35;
  const fenceH = 2.15;
  const totalH = wallH + fenceH;
  const geo = new THREE.BoxGeometry(0.16, totalH, 0.16);
  const mat = new THREE.MeshLambertMaterial({ color: env.neon ? 0x4a3a70 : 0x6b737d });
  fadeNearCamera(mat);
  mat.__owned = true;
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3();
  spots.forEach((sp, k) => {
    const p = track.pos[sp.i], rt = track.right[sp.i];
    up.copy(track.up[sp.i]);
    const w = track.width[sp.i] + 0.35;
    const at = new THREE.Vector3(
      p.x + rt.x * sp.side * w, p.y + rt.y * sp.side * w, p.z + rt.z * sp.side * w
    ).addScaledVector(up, totalH * 0.5);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    m.compose(at, q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(k, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'fenceposts';
  return mesh;
}

// ---------------------------------------------------------------------------
// Structure under elevated road
// ---------------------------------------------------------------------------
function buildPillars(track, env) {
  const n = track.count;
  const spots = [];
  const every = Math.max(6, Math.round(26 / track.spacing));
  for (let i = 0; i < n; i += every) {
    const p = track.pos[i];
    if (p.y < 5 || track.up[i].y < 0.6 || track.kind[i] === 'loop') continue;
    spots.push({ i, h: p.y });
  }
  if (!spots.length) return null;
  const geo = new THREE.BoxGeometry(2.4, 1, 2.4);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x767065 }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((sp, k) => {
    const p = track.pos[sp.i];
    m.makeTranslation(p.x, p.y * 0.5 - 0.5, p.z);
    m.scale(new THREE.Vector3(1, Math.max(1, p.y), 1));
    mesh.setMatrixAt(k, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = quality.shadows;
  mesh.name = 'pillars';
  return mesh;
}

// ---------------------------------------------------------------------------
// Start / finish
// ---------------------------------------------------------------------------
function buildStartLine(track, env) {
  const g = new THREE.Group();
  const f = track.frameAt(0);
  const w = f.width;

  // chequered strip — one merged mesh, hard-edged (duplicated verts per
  // square) so the pattern stays crisp instead of blending into grey.
  const squares = 16;
  const stripW = (w * 2) / squares;
  const light = new THREE.Color(0xf2f2f2), dark = new THREE.Color(0x14171c);
  const pos = [], col = [], idx = [];
  let v = 0;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < squares; c++) {
      const t0 = -w + stripW * c, t1 = t0 + stripW;
      const s0 = r * 1.5, s1 = s0 + 1.5;
      const p00 = track.worldAt(s0, t0, 0.03);
      const p01 = track.worldAt(s0, t1, 0.03);
      const p10 = track.worldAt(s1, t0, 0.03);
      const p11 = track.worldAt(s1, t1, 0.03);
      const cc = (r + c) % 2 ? light : dark;
      pos.push(p00.x, p00.y, p00.z, p01.x, p01.y, p01.z, p10.x, p10.y, p10.z, p11.x, p11.y, p11.z);
      for (let k = 0; k < 4; k++) col.push(cc.r, cc.g, cc.b);
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      v += 4;
    }
  }
  const checkGeo = new THREE.BufferGeometry();
  checkGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  checkGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  checkGeo.setIndex(idx);
  checkGeo.computeVertexNormals();
  const checker = new THREE.Mesh(checkGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  checker.name = 'checker';
  g.add(checker);

  // gantry
  const postGeo = new THREE.BoxGeometry(1.1, 9, 1.1);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.copy(track.worldAt(0, side * (w + 2.2), 4.5));
    post.quaternion.copy(track.quatAt(0, 0));
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 5, 2.2, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x1b2027 }));
  beam.position.copy(track.worldAt(0, 0, 9.6));
  beam.quaternion.copy(track.quatAt(0, 0));
  g.add(beam);

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.4, 1.5),
    new THREE.MeshBasicMaterial({ map: bannerTexture('FOUL PLAY', 0xffb020, 0x101318), transparent: true }));
  sign.position.copy(track.worldAt(-1.2, 0, 9.6));
  sign.quaternion.copy(track.quatAt(0, 0));
  g.add(sign);

  // start lights
  const lightBar = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x2a0d0d }));
    bulb.position.set((i - 2) * 1.35, 0, 0);
    bulb.name = 'startbulb' + i;
    lightBar.add(bulb);
  }
  lightBar.position.copy(track.worldAt(0.4, 0, 8.1));
  lightBar.quaternion.copy(track.quatAt(0, 0));
  lightBar.name = 'startlights';
  g.add(lightBar);
  g.userData.lights = lightBar;

  g.name = 'startline';
  return g;
}

// Four shared bulb materials, built once. These used to be allocated fresh on
// every call — and `setStartLights` runs every frame of the countdown, so that
// was five new materials and five shader lookups per frame for five seconds.
let BULB_MATS = null;
function bulbMats() {
  if (!BULB_MATS) {
    const m = (hex) => {
      const mm = new THREE.MeshBasicMaterial({ color: hex });
      mm.__owned = false;   // shared and reused; never disposed with a track
      return mm;
    };
    BULB_MATS = { off: m(0x2a0d0d), red: m(0xff2222), green: m(0x2bff6a), dark: m(0x1d2b20) };
  }
  return BULB_MATS;
}

export function setStartLights(group, n) {
  const bar = group.getObjectByName('startlights');
  if (!bar) return;
  const M = bulbMats();
  bar.userData.greenAt = -1;
  bar.children.forEach((b, i) => { b.material = i < n ? M.red : M.off; });
}

export function setStartLightsGreen(group) {
  const bar = group.getObjectByName('startlights');
  if (!bar) return;
  const M = bulbMats();
  // Remember when they went green so they can go out again. Nothing used to
  // turn these off, so a full green gantry sat over the circuit for the whole
  // race — which you never noticed until the camera came down low and close.
  bar.userData.greenAt = 0;
  bar.children.forEach((b) => { b.material = M.green; });
}

// Green for a beat after the off, then out — like a real start gantry.
const GREEN_HOLD = 3.5;
function updateStartLights(group, time) {
  const bar = group.getObjectByName('startlights');
  if (!bar || bar.userData.greenAt !== 0) return;
  if (time > GREEN_HOLD) {
    const M = bulbMats();
    bar.userData.greenAt = -1;
    bar.children.forEach((b) => { b.material = M.dark; });
  }
}

// ---------------------------------------------------------------------------
// Boost pads
// ---------------------------------------------------------------------------
function buildPads(track) {
  if (!track.pads.length) return null;
  const g = new THREE.Group();
  g.name = 'pads';
  for (const pad of track.pads) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pad.w * 2, pad.len),
      new THREE.MeshBasicMaterial({ map: padTexture(), transparent: true, depthWrite: false })
    );
    mesh.position.copy(track.worldAt(pad.s, pad.t, 0.06));
    mesh.quaternion.copy(track.quatAt(pad.s, 0));
    mesh.rotateX(-Math.PI / 2);
    mesh.renderOrder = 2;
    g.add(mesh);
    pad.mesh = mesh;
  }
  return g;
}

let _padTex = null;
function padTexture() {
  if (_padTex) return _padTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(60,220,255,0.22)';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(120,245,255,0.9)';
  for (let i = 0; i < 3; i++) {
    const y = 96 - i * 34;
    g.beginPath();
    g.moveTo(8, y);
    g.lineTo(32, y - 22);
    g.lineTo(56, y);
    g.lineTo(56, y + 9);
    g.lineTo(32, y - 13);
    g.lineTo(8, y + 9);
    g.closePath();
    g.fill();
  }
  _padTex = new THREE.CanvasTexture(c);
  _padTex.colorSpace = THREE.SRGBColorSpace;
  return _padTex;
}

// ---------------------------------------------------------------------------
// Broadcast cameras — the things you are trying not to be seen by
// ---------------------------------------------------------------------------
function buildCameras(track) {
  const g = new THREE.Group();
  g.name = 'cams';
  for (const cam of track.cams) {
    const rig = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, cam.height, 6),
      new THREE.MeshLambertMaterial({ color: 0x3a4149 }));
    pole.position.y = cam.height * 0.5;
    rig.add(pole);

    const head = new THREE.Group();
    head.position.y = cam.height;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.15),
      new THREE.MeshLambertMaterial({ color: 0x1c2026 }));
    head.add(box);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x0c0e12 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.75;
    head.add(lens);
    const tally = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    tally.position.set(0, 0.42, -0.3);
    tally.name = 'tally';
    head.add(tally);
    head.name = 'head';
    rig.add(head);

    rig.position.copy(track.worldAt(cam.s, cam.t, 0));
    g.add(rig);
    cam.rig = rig;
    cam.head = head;
    cam.tally = tally;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Terrain — a heightfield ground with grass tone variation, flattened around
// the circuit and rolling into hills further out, so nothing pokes through.
// ---------------------------------------------------------------------------
function buildTerrainDistanceField(track) {
  const cell = 44;
  const map = new Map();
  const key = (cx, cz) => cx * 100003 + cz;
  const stepPts = Math.max(1, Math.round(6 / track.spacing));
  for (let i = 0; i < track.count; i += stepPts) {
    const p = track.pos[i];
    const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
    const k = key(cx, cz);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return function nearestDistSq(x, z) {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = map.get(key(cx + dx, cz + dz));
        if (!arr) continue;
        for (const p of arr) {
          const ddx = p.x - x, ddz = p.z - z;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < best) best = d2;
        }
      }
    }
    return best === Infinity ? 810000 : best;
  };
}

// The heightfield as a function, so the terrain mesh and everything STANDING on
// the terrain agree about where the floor is. `hill` and `falloff` are left on
// the function after each call rather than returned in an object: this runs once
// per terrain vertex at build time and there are four thousand of them.
function terrainHeightFn(track) {
  const nearestDistSq = buildTerrainDistanceField(track);
  const base = Math.min(0, track.bounds.min.y) - 3.2;
  const fn = (wx, wz) => {
    const d = Math.sqrt(nearestDistSq(wx, wz));
    fn.falloff = clamp((d - 55) / 170, 0, 1);
    const n1 = Math.sin(wx * 0.021 + wz * 0.013) * 0.5 + Math.sin(wx * 0.008 - wz * 0.017 + 4.1) * 0.5;
    const n2 = Math.sin(wx * 0.05 + 1.3) * Math.cos(wz * 0.047 - 0.7);
    fn.hill = (n1 * 9 + n2 * 3.4) * fn.falloff;
    return base + fn.hill;
  };
  fn.base = base;
  fn.hill = 0;
  fn.falloff = 0;
  return fn;
}

function buildTerrain(track, env, height) {
  const size = Math.max(1600, track.radius * 4);
  const segs = 64;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  const posAttr = geo.attributes.position;
  const baseColor = new THREE.Color(env.ground);
  const isDust = !!env.haze || env.ground === 0x9a7c4c;
  const isNight = !!env.neon || env.stars > 0.5;
  const hillTint = isDust ? new THREE.Color(0xb08a4e) : isNight ? new THREE.Color(0x1c2430) : new THREE.Color(0x3f6b3a);
  const cx = track.center.x, cz = track.center.z;
  const col = new Float32Array(posAttr.count * 3);
  const tmp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const lx = posAttr.getX(i), ly = posAttr.getY(i);
    const wx = lx + cx, wz = -ly + cz;
    height(wx, wz);
    const falloff = height.falloff;
    const hill = height.hill;
    posAttr.setZ(i, hill);

    // The outfield used to be one unmodulated green from the verge to the
    // horizon. The grid is 25m a cell, so a smooth sine long enough not to
    // alias is also too long to see — you get less than half a period across
    // the whole visible field. A per-vertex hash instead reads as a patchwork
    // of fields, which is both cheaper and the right look, and a small hue
    // swing on top stops the patches being the same green at two brightnesses.
    const patch = Math.sin(wx * 0.015 + wz * 0.02) * 0.5 + Math.sin(wx * 0.004 - wz * 0.006 + 2.0) * 0.5;
    const h = Math.sin(wx * 12.9898 + wz * 78.233) * 43758.5453;
    const field = (h - Math.floor(h)) * 2 - 1;
    const rise = clamp(hill / 9, -1, 1);
    tmp.copy(baseColor).lerp(hillTint, falloff * clamp(rise * 0.5 + 0.25, 0, 1));
    tmp.offsetHSL(field * 0.032, field * 0.07, 0);
    const shade = 1 + patch * 0.12 + field * 0.15;
    tmp.multiplyScalar(shade);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, height.base, cz);
  mesh.receiveShadow = quality.shadows;
  mesh.name = 'ground';
  return mesh;
}

// ---------------------------------------------------------------------------
// Scenery — dense, layered (near / mid / far), and shaped by the track's env.
// ---------------------------------------------------------------------------
function buildScenery(track, env, rng, height) {
  const g = new THREE.Group();
  g.name = 'scenery';
  const n = track.count;
  const density = quality.scenery;
  // Thinning should cost depth last, not first: the near/mid silhouette
  // (stands, buildings) barely moves even on the low path, while far
  // clutter (the second prop layer, marshal posts, hoardings) is where the
  // triangle budget actually gets clawed back. Skyline and terrain below
  // are full-density unconditionally — they are nearly free either way.
  const midDensity = Math.pow(density, 0.4);   // 0.55 -> ~0.78
  const farDensity = Math.pow(density, 1.6);   // 0.55 -> ~0.36

  // --- grandstands on the outside of long corners and main straights,
  // collected into shared instanced meshes rather than one Group each.
  const standSpots = [];
  const every = Math.max(10, Math.round(120 / track.spacing));
  for (let i = 0; i < n; i += every) {
    if (track.up[i].y < 0.7) continue;
    if (track.pos[i].y > 24) continue;
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() > 0.55 * midDensity + 0.2) continue;
    standSpots.push({ i, side });
  }
  standSpots.push({ i: Math.round(30 / track.spacing), side: 1 });
  standSpots.push({ i: Math.round(30 / track.spacing), side: -1 });

  const cast = quality.shadows ? markCasters : (o) => o;

  const crowdMatrices = [];
  const stands = buildStands(track, standSpots, rng, crowdMatrices, env);
  if (stands) g.add(cast(stands));

  if (crowdMatrices.length) {
    // Twice the size of the old head-sized box. Small marks at a fixed pitch on
    // a dark wall are a CHECKER, and at fifty metres a checker is what a
    // missing texture looks like — the single most amateur read a piece of
    // scenery can have. Bigger irregular blocks at a broken pitch (see
    // buildStands) read as a packed mass instead.
    // Wide and shallow. A tall block shows the camera a big upward face that
    // collects the whole hemisphere, which is what was making the crowd pop
    // brighter than the stand even after the palette came down.
    const geo = new THREE.BoxGeometry(1.05, 0.72, 0.55);
    const crowd = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true }), crowdMatrices.length);
    crowd.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(crowdMatrices.length * 3), 3);
    // A full-hue-wheel random palette on a near-black stand made the crowd the
    // highest-contrast thing in the frame — brighter and busier than the cars
    // it is supposed to be watching. Four colours, all pulled off the
    // environment's own key/sky/ground, sitting well under the cars.
    const crowdPalette = crowdColours(env);
    const c = new THREE.Color();
    crowdMatrices.forEach((m, k) => {
      crowd.setMatrixAt(k, m);
      c.copy(crowdPalette[(rng() * crowdPalette.length) | 0]);
      // Enough per-head jitter to stop it banding, not enough to read as noise.
      c.multiplyScalar(0.88 + rng() * 0.22);
      crowd.instanceColor.setXYZ(k, c.r, c.g, c.b);
    });
    crowd.instanceMatrix.needsUpdate = true;
    crowd.instanceColor.needsUpdate = true;
    crowd.name = 'crowd';
    crowd.userData.base = crowdMatrices;
    g.add(crowd);
  }

  // --- floodlights for the dark environments
  if (env.stars > 0.4 || env.neon) {
    const lights = buildFloodlights(track);
    if (lights) g.add(cast(lights));
  }

  // --- near/mid roadside props: trees, rocks, scrub, blocks, containers.
  // The near layer keeps midDensity (barely thinned); the far layer inside
  // buildProps uses farDensity so it is the one that gives ground first.
  const props = buildProps(track, env, rng, midDensity, farDensity);
  if (props) g.add(cast(props));

  // --- blocky buildings set back behind the props — cheap silhouette, kept
  // close to full density even on the low path.
  const buildings = buildBuildings(track, env, rng, midDensity, height);
  if (buildings) g.add(buildings);

  // --- marshal posts — small clutter, thinned hardest
  const marshals = buildMarshalPosts(track, env, rng, farDensity);
  if (marshals) g.add(cast(marshals));

  // --- advertising hoardings on the barriers — small clutter, thinned hardest
  const hoardings = buildHoardings(track, env, rng, farDensity);
  if (hoardings) g.add(cast(hoardings));

  // --- distant background silhouette on the horizon
  g.add(buildSkyline(track, env, rng));

  // --- sponsor arches over the road
  const archStep = Math.max(30, Math.round(400 / track.spacing));
  for (let i = archStep; i < n; i += archStep) {
    if (track.up[i].y < 0.75 || track.kind[i] === 'loop') continue;
    g.add(cast(buildArch(track, i, rng)));
  }

  return g;
}

// Four muted tones per environment, mixed hard toward the stand's own concrete
// so the block reads as one mass with texture in it rather than as confetti.
//
// 0.46 toward the seat was not nearly far enough. env.sun is near-white and
// env.ground is a strong green, so 54% of those against a 0x33383f back gave
// bright cream and bright green marks on near-black — maximum contrast, in a
// regular grid. At 0.72 the marks sit inside the stand's own value range and
// the grid stops being legible as a grid at any distance that matters.
const _crowdCache = new Map();
function crowdColours(env) {
  if (_crowdCache.has(env.name)) return _crowdCache.get(env.name);
  const seat = new THREE.Color(concreteFor(env).mid);
  // Two of the four sources used to be the sky and the counter-key, both pale
  // blue, so half the crowd came out lighter than the concrete it sits on and
  // the stand read as lights rather than people. The hemisphere's GROUND colour
  // replaces the counter-key, and the whole palette is knocked below the
  // stand's own value: a crowd is darker than the structure holding it.
  const src = [env.hemi[0], env.sun, env.ground, env.hemi[1]];
  const out = src.map((hex) => new THREE.Color(hex)
    .lerp(seat, env.neon || env.stars > 0.5 ? 0.78 : 0.70)
    .multiplyScalar(0.70));
  _crowdCache.set(env.name, out);
  return out;
}

function buildStands(track, spots, rng, crowdOut, env) {
  const validSpots = spots.filter((sp) => track.up[sp.i].y >= 0.7);
  if (!validSpots.length) return null;
  const tiers = 5;
  const tierMat = new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true });
  const backMat = new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true });
  const tierMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), tierMat, validSpots.length * tiers);
  const backMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), backMat, validSpots.length);
  tierMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(validSpots.length * tiers * 3), 3);
  backMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(validSpots.length * 3), 3);

  // The back wall comes UP, not down. It was 0x33383f — a near-black slab —
  // which is what turned the crowd in front of it into high-contrast marks on
  // a void. Half the fix for the checker read is on this line: less range
  // between the stand and the people on it.
  //
  // And it is CONCRETE, not grey. The grandstand is the largest single object
  // beside the circuit, so it is the cheapest place in the whole scene to put a
  // warm mass — one hex here turns the biggest cool surface in the frame into
  // the thing the cars read against.
  const cc = concreteFor(env);
  const stepColor = new THREE.Color(cc.face);
  const backColor = new THREE.Color(cc.mid);
  const m = new THREE.Matrix4();
  let tk = 0;

  validSpots.forEach((sp, sIdx) => {
    const p = track.pos[sp.i], rt = track.right[sp.i];
    const side = sp.side;
    const w = track.width[sp.i];
    const len = 46 + rng() * 30;
    const base = new THREE.Vector3().copy(p).addScaledVector(rt, side * (w + 9));
    base.y = p.y > 6 ? 0 : p.y + vergeDrop(9);

    // Local axes: rows run along the track, tiers climb away from it.
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = rt.clone().setY(0).normalize().multiplyScalar(-side);
    const X = new THREE.Vector3().copy(Y).cross(Z).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));

    for (let t = 0; t < tiers; t++) {
      const local = new THREE.Vector3(0, 0.8 + t * 1.5, -t * 2.6).applyQuaternion(q).add(base);
      m.compose(local, q, new THREE.Vector3(len, 1.6, 3.2));
      tierMesh.setMatrixAt(tk, m);
      // A VALUE PER TIER. Five identical hexes stacked up a rake is a single
      // flat mass however many faces it has, and a large flat mass beside the
      // circuit reads as a sticker rather than as a building. The rake climbs
      // out of the stand's own shadow as it goes up, so brightening with `t` is
      // also what the thing would actually do.
      const kt = 0.76 + t * 0.09;
      tierMesh.instanceColor.setXYZ(tk, stepColor.r * kt, stepColor.g * kt, stepColor.b * kt);
      tk++;

      // Break the grid. Everything about the old loop was regular: a fixed
      // 1.5m pitch, the same phase on every tier, one uniform size, and a flat
      // 80% fill so the gaps were regular too. Five rows of that is a checker
      // pattern, and the eye locks onto it long before it can tell the blocks
      // are people. Wider pitch, a real chance of a gap, a per-block offset
      // wider than half the pitch, a half-pitch stagger between tiers, and
      // size variation — no two rows line up and there is no rhythm left to
      // read.
      const pitch = 2.6;
      const seats = Math.floor(len / pitch);
      for (let k = 0; k < seats; k++) {
        if (rng() > 0.58) continue;
        const sLocal = new THREE.Vector3(
          -len / 2 + 1.3 + k * pitch + (rng() - 0.5) * 1.6 + (t % 2) * 1.15,
          1.9 + t * 1.5 + (rng() - 0.5) * 0.18,
          -t * 2.6 + 0.5
        );
        sLocal.applyQuaternion(q).add(base);
        const sx = 0.78 + rng() * 0.8;
        crowdOut.push(new THREE.Matrix4().compose(sLocal, q, new THREE.Vector3(sx, 0.82 + rng() * 0.5, 1)));
      }
    }

    const backLocal = new THREE.Vector3(0, 4.5, -tiers * 2.6 - 1).applyQuaternion(q).add(base);
    m.compose(backLocal, q, new THREE.Vector3(len, 9, 1));
    backMesh.setMatrixAt(sIdx, m);
    backMesh.instanceColor.setXYZ(sIdx, backColor.r, backColor.g, backColor.b);
  });

  tierMesh.instanceMatrix.needsUpdate = true;
  backMesh.instanceMatrix.needsUpdate = true;
  tierMesh.instanceColor.needsUpdate = true;
  backMesh.instanceColor.needsUpdate = true;
  tierMesh.name = 'standTiers';
  backMesh.name = 'standBacks';

  const g = new THREE.Group();
  g.name = 'stands';
  g.add(tierMesh, backMesh);
  return g;
}

function buildFloodlights(track) {
  const n = track.count;
  const spots = [];
  const step = Math.max(24, Math.round(190 / track.spacing));
  for (let i = 0; i < n; i += step) {
    if (track.up[i].y < 0.7) continue;
    spots.push({ i, side: (i / step) % 2 === 0 ? 1 : -1 });
  }
  if (!spots.length) return null;
  const h = 22;
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.5, h, 6),
    new THREE.MeshLambertMaterial({ color: 0x3c434b }), spots.length);
  const rack = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 2, 0.8),
    new THREE.MeshLambertMaterial({ color: 0x22272d }), spots.length);
  const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.2, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xfff3cf }), spots.length * 4);
  const m = new THREE.Matrix4();
  const identity = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  let lk = 0;
  spots.forEach((sp, k) => {
    const p = track.pos[sp.i], rt = track.right[sp.i];
    const w = track.width[sp.i];
    const base = new THREE.Vector3().copy(p).addScaledVector(rt, sp.side * (w + 16));
    m.compose(new THREE.Vector3(base.x, base.y + h / 2, base.z), identity, unit);
    pole.setMatrixAt(k, m);
    m.compose(new THREE.Vector3(base.x, base.y + h, base.z), identity, unit);
    rack.setMatrixAt(k, m);
    for (let j = 0; j < 4; j++) {
      m.compose(new THREE.Vector3(base.x - 2.2 + j * 1.5, base.y + h, base.z + 0.5), identity, unit);
      lamp.setMatrixAt(lk++, m);
    }
  });
  pole.instanceMatrix.needsUpdate = true;
  rack.instanceMatrix.needsUpdate = true;
  lamp.instanceMatrix.needsUpdate = true;
  const g = new THREE.Group();
  g.name = 'floodlights';
  g.add(pole, rack, lamp);
  return g;
}

function envKinds(env) {
  const isDust = !!env.haze || env.ground === 0x9a7c4c;
  const isNight = !!env.neon || env.stars > 0.5;
  return { isDust, isNight };
}

function buildProps(track, env, rng, nearDensity, farDensity) {
  const { isDust, isNight } = envKinds(env);
  const kinds = isDust ? ['rock', 'scrub', 'rock', 'cactus']
    : isNight ? ['block', 'container', 'block']
      : ['tree', 'tree', 'roundtree', 'rock', 'container'];

  const items = [];
  const n = track.count;
  // Two depth bands: a denser near layer and a sparser, bigger far layer —
  // the "layer it: near / mid / far" instruction, cheaply. The far layer is
  // the one that gives ground first when quality.scenery drops.
  // The near layer used to start 14m off the kerb and run out to 48m, which
  // put it 24-58m from the centreline — i.e. mostly OUTSIDE the shadow camera,
  // so the trees were flagged as casters, cost a depth pass, and threw nothing
  // anybody could see. Pulling the band in to 8-28m does two jobs at once: it
  // puts every near tree inside the box, and it gets the trees close enough
  // that a low sun lays their shadows over the verge and onto the tarmac
  // instead of on empty grass nobody is looking at.
  // The far band used to run out to 94m, past the 46m the apron covers and into
  // where the terrain starts rolling — so its props were placed at road level
  // over ground that had fallen three metres and rolled another two. Kept inside
  // the apron, `vergeDrop` is an exact answer and everything lands on the floor.
  const layers = [
    { near: 8, span: 20, step: Math.max(2, Math.round(8 / track.spacing)), chance: 0.8, scaleMul: 1, density: nearDensity },
    { near: 30, span: 24, step: Math.max(3, Math.round(15 / track.spacing)), chance: 0.58, scaleMul: 1.35, density: farDensity },
  ];
  for (const layer of layers) {
    for (let i = 0; i < n; i += layer.step) {
      if (track.up[i].y < 0.6) continue;
      for (const side of [-1, 1]) {
        if (rng() > layer.chance * layer.density) continue;
        const w = track.width[i];
        const e = layer.near + rng() * layer.span;      // metres beyond the road edge
        const p = new THREE.Vector3().copy(track.pos[i]).addScaledVector(track.right[i], side * (w + e));
        // On an elevated section the apron is up in the air with the road, so a
        // tree belongs on the terrain below it, not on the flying verge.
        p.y = track.pos[i].y > 6 ? 0 : track.pos[i].y + vergeDrop(e);
        items.push({
          p, kind: kinds[(rng() * kinds.length) | 0],
          scale: Math.min(2.0, (0.7 + rng() * 1.1) * layer.scaleMul),
          rot: rng() * 7,
          tone: rng(),
        });
      }
    }
  }
  if (!items.length) return null;

  const g = new THREE.Group();
  g.name = 'props';
  const byKind = {};
  for (const it of items) (byKind[it.kind] = byKind[it.kind] || []).push(it);

  // Prop albedos are all a good step brighter than they were. A cone whose
  // albedo is 0x2f5c33 has nothing left once you turn its far side away from
  // the key: it lands in single digits and reads as a hole punched in the
  // treeline. Faceting only shows if BOTH sides of the facet are above the
  // floor, so the lit side has to be able to go somewhere.
  // Raised again, and this is where the "distant props are black cut-outs"
  // problem is paid for — NOT out of the fill budget. The previous pass bought
  // legible props by lifting hemisphere and counter-key, which rescued the
  // treeline and flattened every object in the game to do it. Albedo costs
  // nothing anybody else has to pay: a brighter cone still has a lit side and a
  // shaded side five times apart, it just has both of them above the floor.
  const defs = {
    // The pines are cones and the mountains on the horizon are cones, so half
    // the frame was drawing one triangle at two sizes — 'instancing spam rather
    // than a horizon'. The pine is narrower and taller than it was so it is
    // clearly a pine, and its partner is now a faceted BALL: a broadleaf, a
    // completely different silhouette, and the near field stops rhyming with
    // the skyline.
    tree: { geo: () => new THREE.ConeGeometry(2.1, 9.0, 6), color: 0x4f8f3f, y: 4.5 },
    roundtree: { geo: () => new THREE.DodecahedronGeometry(3.1, 0), color: 0x6fb352, y: 3.6 },
    rock: { geo: () => new THREE.DodecahedronGeometry(2.2, 0), color: 0x958f80, y: 1.4 },
    scrub: { geo: () => new THREE.DodecahedronGeometry(1.4, 0), color: 0xac9a5c, y: 0.9 },
    cactus: { geo: () => new THREE.CylinderGeometry(0.7, 0.9, 5.4, 6), color: 0x6aa05e, y: 2.7 },
    block: { geo: () => new THREE.BoxGeometry(9, 16, 9), color: isNight ? 0x2b1f46 : 0x5a5f66, y: 8, max: 1.1 },
    // A shipping container is six metres long. At the far layer's scale it was
    // coming out twelve metres long and five tall — a dark orange WALL alone on
    // the grass, which is the slab a critic kept naming. It is a container
    // again, and a useful warm accent at that size.
    container: { geo: () => new THREE.BoxGeometry(6, 2.6, 2.6), color: 0xc25c42, y: 1.3, max: 1.15 },
  };

  for (const kind of Object.keys(byKind)) {
    const d = defs[kind];
    const list = byKind[kind];
    // flatShading is the whole difference between a cone and a TREE. Three's
    // ConeGeometry averages its normals around the circumference, so a six-
    // sided pine came out as one smooth wash of green — a green triangle, with
    // no lit side and no shadow side, which is exactly what a blind critic
    // called it. Faceted, the same six sides land on six distinct values and
    // the thing reads as a solid form. It costs one dFdx in the fragment
    // shader and no extra geometry, and hard facets are the house style anyway.
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true });
    const mesh = new THREE.InstancedMesh(d.geo(), mat, list.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const c = new THREE.Color(), base = new THREE.Color(d.color);
    list.forEach((it, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      const s0 = Math.min(it.scale, d.max || 9);
      const yScale = s0 * (kind === 'block' ? 0.6 + it.tone * 1.4 : 1);
      sc.set(s0, yScale, s0);
      m.compose(new THREE.Vector3(it.p.x, it.p.y + d.y * yScale, it.p.z), q, sc);
      mesh.setMatrixAt(k, m);
      // Half the lightness spread it had. +-0.09 on a dark green sent the
      // bottom of the range under the floor, so a fifth of the treeline was
      // black cut-outs rather than trees.
      c.copy(base).offsetHSL((it.tone - 0.5) * 0.06, (it.tone - 0.5) * 0.12, (it.tone - 0.5) * 0.10);
      mesh.instanceColor.setXYZ(k, c.r, c.g, c.b);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    g.add(mesh);
  }
  return g;
}

// Blocky low-poly buildings set back behind the roadside props — background
// depth for the open-country tracks, an actual skyline for the night ones.
// A regular grid, deliberately. The complaint was "random square noise" on the
// facades, and the answer to noise is rhythm: four bays across, four floors up,
// same spacing on every building on the circuit. One 64px canvas, one material,
// alpha-tested so the wall shows between the panes.
let _winTex = null;
function windowGridTexture() {
  if (_winTex) return _winTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,1)';
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) g.fillRect(5 + k * 15, 5 + r * 15, 9, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  _winTex = t;
  return t;
}

function buildBuildings(track, env, rng, density, height) {
  const { isDust, isNight } = envKinds(env);
  if (isDust) return null;
  const n = track.count;
  const spots = [];
  const step = Math.max(6, Math.round(70 / track.spacing));
  for (let i = 0; i < n; i += step) {
    if (track.up[i].y < 0.6) continue;
    for (const side of [-1, 1]) {
      if (rng() > 0.6 * density) continue;
      spots.push({ i, side });
    }
  }
  if (!spots.length) return null;

  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true }), spots.length);
  const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(1.12, 1, 1.12),
    new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true }), spots.length);
  body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3), 3);
  roof.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3), 3);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const built = [];
  spots.forEach((sp, k) => {
    const p = track.pos[sp.i], rt = track.right[sp.i];
    const off = sp.side * (track.width[sp.i] + 70 + rng() * 90);
    const h = isNight ? 16 + rng() * 42 : 8 + rng() * 14;
    const bw = 10 + rng() * 8, bd = 10 + rng() * 8;
    const at = new THREE.Vector3().copy(p).addScaledVector(rt, off);
    // ON the terrain. These sat at y = h/2 above world zero while the ground
    // under them is 3.2m down and rolling — a tall slab standing on the grass
    // with no base, which is exactly what it looked like.
    const gy = height(at.x, at.z);
    at.y = gy + h * 0.5;
    const yaw = rng() * 6.28;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    m.compose(at, q, new THREE.Vector3(bw, h, bd));
    body.setMatrixAt(k, m);
    // Warm concrete, not blue-grey. These are the biggest thing on the horizon
    // on an open-country circuit, so they are most of the frame's warm mass.
    const shade = isNight ? 0.05 + rng() * 0.06 : 0.5 + rng() * 0.2;
    c.setRGB(shade * (isNight ? 1.0 : 1.06), shade * (isNight ? 1.05 : 1.0), shade * (isNight ? 1.25 : 0.82));
    body.instanceColor.setXYZ(k, c.r, c.g, c.b);

    const rAt = at.clone(); rAt.y = gy + h + 0.5;
    m.compose(rAt, q, new THREE.Vector3(bw, 1, bd));
    roof.setMatrixAt(k, m);
    c.multiplyScalar(0.8);
    roof.instanceColor.setXYZ(k, c.r, c.g, c.b);

    built.push({ at, yaw, bw, bd, h, gy });
  });
  body.instanceMatrix.needsUpdate = true;
  roof.instanceMatrix.needsUpdate = true;
  body.instanceColor.needsUpdate = true;
  roof.instanceColor.needsUpdate = true;

  const g = new THREE.Group();
  g.name = 'buildings';
  g.add(body, roof);

  if (isNight && built.length) {
    const perBuilding = 5;
    const win = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 1.3),
      new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: false, side: THREE.DoubleSide }),
      built.length * perBuilding);
    win.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(built.length * perBuilding * 3), 3);
    let wk = 0;
    const wq = new THREE.Quaternion(), wc = new THREE.Color(), fwd = new THREE.Vector3();
    built.forEach((b) => {
      for (let j = 0; j < perBuilding; j++) {
        const faceYaw = b.yaw + (j % 4) * (Math.PI / 2);
        wq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceYaw);
        fwd.set(0, 0, 1).applyQuaternion(wq);
        const wx = b.at.x + fwd.x * (b.bd * 0.5 + 0.05);
        const wz = b.at.z + fwd.z * (b.bd * 0.5 + 0.05);
        const wy = b.gy + 2 + rng() * Math.max(1, b.h - 4);
        m.compose(new THREE.Vector3(wx, wy, wz), wq, new THREE.Vector3(1, 1, 1));
        win.setMatrixAt(wk, m);
        const lit = rng() > 0.55;
        const bri = lit ? 0.55 + rng() * 0.45 : 0.06 + rng() * 0.1;
        wc.setRGB(bri, bri * 0.82, bri * 0.42);
        win.instanceColor.setXYZ(wk, wc.r, wc.g, wc.b);
        wk++;
      }
    });
    win.instanceMatrix.needsUpdate = true;
    win.instanceColor.needsUpdate = true;
    g.add(win);
  }

  if (!isNight && built.length) {
    // Daylight facades were blank boxes. Four bays by four floors on each face,
    // the same rhythm on every building — a grid, which is what a building looks
    // like, and the opposite of the scattered squares that were being read as
    // missing texture.
    const grid = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshLambertMaterial({
        map: windowGridTexture(), color: 0x6d7176, transparent: true,
        alphaTest: 0.5, side: THREE.DoubleSide, flatShading: true,
      }),
      built.length * 4
    );
    let gk = 0;
    const wq = new THREE.Quaternion(), fwd = new THREE.Vector3();
    built.forEach((b) => {
      for (let j = 0; j < 4; j++) {
        const faceYaw = b.yaw + j * (Math.PI / 2);
        wq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceYaw);
        fwd.set(0, 0, 1).applyQuaternion(wq);
        const face = j % 2 === 0 ? b.bd : b.bw;
        const wide = j % 2 === 0 ? b.bw : b.bd;
        m.compose(
          new THREE.Vector3(
            b.at.x + fwd.x * (face * 0.5 + 0.06),
            b.gy + b.h * 0.54,
            b.at.z + fwd.z * (face * 0.5 + 0.06)
          ),
          wq,
          new THREE.Vector3(wide * 0.82, b.h * 0.66, 1)
        );
        grid.setMatrixAt(gk++, m);
      }
    });
    grid.instanceMatrix.needsUpdate = true;
    g.add(grid);
  }

  return g;
}

// Marshal posts — small huts at intervals.
function buildMarshalPosts(track, env, rng, density) {
  const n = track.count;
  const spots = [];
  const step = Math.max(20, Math.round(280 / track.spacing));
  for (let i = 0; i < n; i += step) {
    if (track.up[i].y < 0.7) continue;
    if (rng() > 0.85 * density) continue;
    spots.push({ i, side: rng() < 0.5 ? -1 : 1 });
  }
  if (!spots.length) return null;
  const hut = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 2.6, 3.2),
    new THREE.MeshLambertMaterial({ color: concreteFor(env).face, flatShading: true }), spots.length);
  const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 0.3, 3.6),
    new THREE.MeshLambertMaterial({ color: 0xc23c3c }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  spots.forEach((sp, k) => {
    const p = track.pos[sp.i], rt = track.right[sp.i];
    const e = 12 + rng() * 8;
    const at = new THREE.Vector3().copy(p).addScaledVector(rt, sp.side * (track.width[sp.i] + e));
    at.y = (p.y > 6 ? 0 : p.y + vergeDrop(e)) + 1.3;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
    m.compose(at, q, new THREE.Vector3(1, 1, 1));
    hut.setMatrixAt(k, m);
    const rAt = at.clone(); rAt.y += 1.45;
    m.compose(rAt, q, new THREE.Vector3(1, 1, 1));
    roof.setMatrixAt(k, m);
  });
  hut.instanceMatrix.needsUpdate = true;
  roof.instanceMatrix.needsUpdate = true;
  const g = new THREE.Group();
  g.name = 'marshalposts';
  g.add(hut, roof);
  return g;
}

// Standalone advertising boards mounted on the barrier, denser than the
// sponsor arches so the track reads as sponsored the whole way round.
function buildHoardings(track, env, rng, density) {
  const n = track.count;
  const g = new THREE.Group();
  g.name = 'hoardings';
  const step = Math.max(40, Math.round(220 / track.spacing));
  let count = 0;
  for (let i = step; i < n && count < 16; i += step) {
    if (track.up[i].y < 0.75) continue;
    if (rng() > 0.8 * density) continue;
    const side = rng() < 0.5 ? -1 : 1;
    const type = side < 0 ? track.railL[i] : track.railR[i];
    if (type !== 'wall' && type !== 'rail') continue;
    const w = track.width[i];
    const wallH = type === 'wall' ? RAIL_HEIGHT * 1.35 : RAIL_HEIGHT;
    const s = i * track.spacing;
    const boardMat = new THREE.MeshBasicMaterial({ map: bannerTexture(SPONSORS[(rng() * SPONSORS.length) | 0], 0xffffff, 0x14171c) });
    // A board is a single-sided plane, so half of them face away from the sun
    // and would write nothing into the depth pass — a board with no shadow is
    // the exact defect this is fixing.
    boardMat.shadowSide = THREE.DoubleSide;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), boardMat);
    board.position.copy(track.worldAt(s, side * (w + 0.6), wallH + 1.3));
    board.quaternion.copy(track.quatAt(s, 0));
    if (side < 0) board.rotateY(Math.PI);
    g.add(board);
    count++;
  }
  return g.children.length ? g : null;
}

// Distant background silhouette on the horizon — mountains for open country,
// a skyline for night/neon, mesas for dust. One InstancedMesh, always visible.
function buildSkyline(track, env, rng) {
  const { isDust, isNight } = envKinds(env);
  const radius = track.radius * 1.9 + 260;
  const count = 46;
  let geo, mat;
  if (isNight) {
    geo = new THREE.BoxGeometry(1, 1, 1);
    mat = new THREE.MeshBasicMaterial({ vertexColors: false, fog: false, toneMapped: false });
  } else if (isDust) {
    geo = new THREE.BoxGeometry(1, 1, 1.6);
    mat = new THREE.MeshBasicMaterial({ vertexColors: false, fog: false, toneMapped: false });
  } else {
    geo = new THREE.ConeGeometry(0.6, 1, 5);
    mat = new THREE.MeshBasicMaterial({ vertexColors: false, fog: false, toneMapped: false });
  }
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + rng() * 0.05;
    const r = radius * (0.92 + rng() * 0.22);
    p.set(track.center.x + Math.cos(a) * r, 0, track.center.z + Math.sin(a) * r);
    if (isNight) {
      const h = 26 + rng() * 90;
      p.y = h * 0.5 - 4;
      s.set(14 + rng() * 20, h, 14 + rng() * 20);
      c.setRGB(0.05 + rng() * 0.04, 0.06 + rng() * 0.04, 0.09 + rng() * 0.05);
    } else if (isDust) {
      const h = 20 + rng() * 46;
      p.y = h * 0.5 - 6;
      s.set(60 + rng() * 90, h, 40 + rng() * 60);
      c.setRGB(0.55 + rng() * 0.12, 0.4 + rng() * 0.1, 0.26 + rng() * 0.08);
    } else {
      // A HORIZON, NOT A ROW OF THE SAME CONE. Every peak used to be 40-140m
      // tall on a 60-130m base — one aspect ratio, one silhouette — and the
      // roadside pines are cones too, so the back of the frame and the middle
      // of the frame were drawing the same triangle at two sizes and the whole
      // thing read as instancing spam. Two thirds of these are now RIDGES:
      // three times wider than they are tall, overlapping into a continuous
      // skirt that the few remaining peaks stand out of. Nothing in the near
      // field is that shape, so the layers stop rhyming.
      // The ridges also sit further out and a step lighter, which is the only
      // aerial perspective a fog-less horizon can have.
      const ridge = k % 4 !== 0;
      const h = ridge ? 22 + rng() * 26 : 62 + rng() * 90;
      const wide = ridge ? 150 + rng() * 130 : 55 + rng() * 45;
      p.y = h * 0.5 - 10;
      s.set(wide, h, ridge ? 70 + rng() * 60 : 55 + rng() * 45);
      // Distance is a value job, not a fog job. This mesh is toneMapped:false
      // and fog:false, so whatever is written here IS the pixel — and 0.5-0.66
      // came out at luminance ~170 against a ~200 sky. Thirty levels of
      // separation over the whole back of the frame is what "milky" means. A
      // darker, wider spread puts the ridge line back and layers the peaks.
      // Not lavender. A blue-violet ridge was the third cool mass in a frame
      // that already had a blue sky and a green field and no warm anything, and
      // it was light enough (~170 against a ~200 sky) to read as a foreground
      // shape rather than as distance. Darker, and pulled to a neutral warm
      // grey-green so it recedes and leaves the colour to the circuit.
      const gy = (ridge ? 0.23 : 0.15) + rng() * 0.10;
      c.setRGB(gy * 1.02, gy * 0.94, gy * 0.76);
    }
    q.identity();
    // A cone with five sides has five silhouettes; spinning each one means no
    // two peaks on the ridge line present the same profile. Free.
    if (!isNight && !isDust) q.setFromAxisAngle(_yAxis, rng() * 6.28);
    m.compose(p, q, s);
    mesh.setMatrixAt(k, m);
    mesh.instanceColor.setXYZ(k, c.r, c.g, c.b);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.name = 'skyline';
  mesh.frustumCulled = false;
  return mesh;
}

const _yAxis = new THREE.Vector3(0, 1, 0);

const SPONSORS = ['NITROX', 'BAD HABIT', 'CUTSHAW OIL', 'RUSTLINE', 'PAYDAY', 'HALLOWAY', 'GRUDGE FUEL', 'MOTH & SONS'];

function buildArch(track, i, rng) {
  const g = new THREE.Group();
  const s = i * track.spacing;
  const w = track.width[i];
  const mat = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), mat);
    leg.position.copy(track.worldAt(s, side * (w + 1.6), 4));
    leg.quaternion.copy(track.quatAt(s, 0));
    g.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 4, 2.4, 0.9),
    new THREE.MeshBasicMaterial({
      map: bannerTexture(SPONSORS[(rng() * SPONSORS.length) | 0], 0xffffff, 0x171b21),
    }));
  beam.position.copy(track.worldAt(s, 0, 8.2));
  beam.quaternion.copy(track.quatAt(s, 0));
  g.add(beam);
  return g;
}

const bannerCache = new Map();
export function bannerTexture(text, fg, bg) {
  const key = text + fg + bg;
  if (bannerCache.has(key)) return bannerCache.get(key);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#' + (bg >>> 0).toString(16).padStart(6, '0');
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#' + (fg >>> 0).toString(16).padStart(6, '0');
  g.font = 'bold 60px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  bannerCache.set(key, t);
  return t;
}

// Crowd reaction — the stands ripple when the hype is high.
// Scratch is module-level: this runs every frame of every race, and the inner
// loop used to hand the collector a fresh Vector3 per instance.
const _cm = new THREE.Matrix4();
const _cp = new THREE.Vector3();
const _cq = new THREE.Quaternion();
const _cs = new THREE.Vector3();
const _cj = new THREE.Vector3();

export function updateCrowd(group, time, hype) {
  if (group) updateStartLights(group, time);
  const crowd = group && group.getObjectByName('crowd');
  if (!crowd || !crowd.userData.base) return;
  const amp = 0.12 + (hype / 100) * 0.85;
  const base = crowd.userData.base;
  const stride = Math.max(1, Math.floor(base.length / 260));
  for (let k = 0; k < base.length; k += stride) {
    base[k].decompose(_cp, _cq, _cs);
    const j = Math.sin(time * 7 + k * 1.7) * amp;
    _cj.set(_cp.x, _cp.y + Math.max(0, j), _cp.z);
    _cm.compose(_cj, _cq, _cs);
    crowd.setMatrixAt(k, _cm);
  }
  crowd.instanceMatrix.needsUpdate = true;
}
