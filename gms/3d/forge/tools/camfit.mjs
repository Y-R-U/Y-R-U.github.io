#!/usr/bin/env node
// Measures the camera arm against the world instead of eyeballing it.
//
//   indoors  — a grid across every room's floor × 12 headings × 2 pitches: how often the arm is
//              at full length (the "core" of WORLD.md §2.5), and whether the camera ever ends up
//              outside the shell.
//   ceiling  — the same rooms, at the room centre × 12 headings: how much of the frame the ceiling
//              takes, landscape against portrait, at the default pitch and looking up. This is the
//              only survey that sees all 52 rooms — the 29 `doors.doors` entries are ground floors,
//              and every loft is lower than the floor under it. docs/NOTES_PORTRAIT.md §3.
//   outdoors — every door approach × 12 headings × 3 arm lengths: whether the camera ever ends up
//              inside a building.
//
//   node tools/camfit.mjs
//   node tools/camfit.mjs --step=0.35 --json=docs/CAMFIT.json

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, waitFor, evalJSON, parseArgs } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const STEP = +(args.step || 0.5);

// Half-field tangents, [vertical, horizontal], at the two gate profiles. quality.js MOBILE_PROFILE
// is 844 × 390 and fov.js holds the 55° field on the short axis, so the pair is a transpose.
const T0 = Math.tan(27.5 * Math.PI / 180), A = 844 / 390;
const FIELDS = { L: [T0, T0 * A], P: [T0 * A, T0] };
const PITCH_MIN = -0.35;   // js/player.js — the limit of looking up
const GRID = [13, 41];     // frame samples, x × y

const PROBE = `(step => {
  const D = window.__forge.doors, P = window.__forge.player, W = window.__forge.walk;
  const FIELDS = ${JSON.stringify(FIELDS)}, PITCH_MIN = ${PITCH_MIN}, GRID = ${JSON.stringify(GRID)};
  const rooms = [], outs = [];
  const HEADINGS = 12;

  const insideAny = (x, y, z) => {
    for (const b of D.colliders.boxes) {
      const px = x - b.x, pz = z - b.z;
      const lx = px * b.c - pz * b.s, lz = px * b.s + pz * b.c;
      if (Math.abs(lx) < b.hw && Math.abs(lz) < b.hd && y > b.y0 && y < b.y1) return b.id;
    }
    return 0;
  };

  const arm = (ax, ay, az, dx, dy, dz, dist) => {
    const clear = D.colliders.hit(ax, ay, az, dx, dy, dz, dist, P.camRadius);
    return clear < dist ? Math.max(P.armMin, clear - 0.06) : dist;
  };

  // What the frame is filled with, standing at the room centre with the arm swept through 12
  // headings: the worst heading's ceiling share, plus how many headings put the eye *in* the
  // ceiling.
  //
  // A room is a convex solid — floor, four walls, and a lid that is flat on a ground floor but a
  // *gable* upstairs (stairs.js gableCeiling), measured off the mesh by ceilingAt. The gable is
  // why the flat \`roomH\` understates a loft: the slope comes down to roomH − rise at the eaves,
  // well under the 2.59 m eye, while the arm's collider lid is the flat ridge — so in the lowest
  // lofts the camera ends up inside the ceiling slab. Its faces are then backfacing and the
  // outdoor world is hidden, so the player looks through the roof at the sky. Those headings are
  // counted, not measured: the share of a frame you are seeing through is not worth a number.
  const frameFill = (R, base, pitch, t, th) => {
    const { ox, oy, oz, cs, sn, dist } = R;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    let worst = 0, inside = 0;
    for (let h = 0; h < HEADINGS; h++) {
      const yaw = h / HEADINGS * Math.PI * 2;
      const ldx = -Math.sin(yaw) * cp, ldz = -Math.cos(yaw) * cp;
      const dx = ldx * cs + ldz * sn, dz = -ldx * sn + ldz * cs;
      const a = arm(ox, oy + base + P.heightIn, oz, dx, sp, dz, dist);
      // camera in the room's own frame, height above this floor
      const C = [ldx * a, P.heightIn + a * sp, ldz * a];
      const fx = -ldx / cp, fz = -ldz / cp;
      // camera basis: forward is pitched down by \`pitch\`, up is its perpendicular in the same plane
      const F = [fx * cp, -sp, fz * cp], U = [fx * sp, cp, fz * sp], Rt = [fz, 0, -fx];
      if (R.planes.some(([nx, ny, nz, c]) => nx * C[0] + ny * C[1] + nz * C[2] > c)) continue;
      inside++;
      let ceil = 0, n = 0;
      for (let i = 0; i < GRID[0]; i++) {
        const su = GRID[0] === 1 ? 0 : -1 + 2 * i / (GRID[0] - 1);
        for (let j = 0; j < GRID[1]; j++) {
          const sv = -1 + 2 * j / (GRID[1] - 1);
          const d = [F[0] + su * th * Rt[0] + sv * t * U[0],
                     F[1] + sv * t * U[1],
                     F[2] + su * th * Rt[2] + sv * t * U[2]];
          if (surface(C, d, R.planes) === 1) ceil++;
          n++;
        }
      }
      worst = Math.max(worst, ceil / n);
    }
    return [+worst.toFixed(3), HEADINGS - inside];
  };

  // Slab test against the convex solid: 1 = ceiling, 0 = wall or floor, -1 = the ray never meets
  // it. Works from inside and from the roof void alike — inside, the entry is behind the camera
  // and the surface is the exit plane.
  const surface = (C, d, planes) => {
    let tIn = -Infinity, tOut = Infinity, inFace = -1, outFace = -1;
    for (const [nx, ny, nz, c, kind] of planes) {
      const den = nx * d[0] + ny * d[1] + nz * d[2];
      const num = c - (nx * C[0] + ny * C[1] + nz * C[2]);
      if (Math.abs(den) < 1e-9) { if (num < 0) return -1; continue; }
      const q = num / den;
      if (den > 0) { if (q < tOut) { tOut = q; outFace = kind; } }
      else if (q > tIn) { tIn = q; inFace = kind; }
    }
    if (tIn >= tOut || tOut <= 1e-6) return -1;
    return tIn > 1e-6 ? inFace : outFace;
  };

  // Inward half-spaces n·p ≤ c, tagged 1 for ceiling and 0 for everything else. \`k\` is the
  // ceiling's fall per metre off the ridge — 0 for a flat one — so the pair y ± k·u ≤ lid reads
  // y ≤ lid − k·|u| and one shape covers both floors.
  const roomPlanes = (rx, rz, lid, k, alongX) => {
    const p = [[0, -1, 0, 0, 0], [1, 0, 0, rx, 0], [-1, 0, 0, rx, 0], [0, 0, 1, rz, 0], [0, 0, -1, rz, 0]];
    if (!k) { p.push([0, 1, 0, lid, 1]); return p; }
    for (const s of [1, -1]) p.push([alongX ? 0 : s * k, 1, alongX ? s * k : 0, lid, 1]);
    return p;
  };

  // The ceiling the player actually sees, measured off the built mesh rather than re-derived from
  // interior.js: \`roomH\` is the structural height, and what hangs below it — a 0.16 m gable slab,
  // the deck's joists — is what the eye meets. Sampled along the ridge and near the eaves, taking
  // the highest hit of five so a beam or a shelf is not mistaken for the ceiling.
  const RC = new window.__forge.three.Raycaster();
  const UP = new window.__forge.three.Vector3(0, 1, 0);
  const _p = new window.__forge.three.Vector3();
  const ceilingAt = (I, o, base, u, alongX) => {
    const run = alongX ? I.rx : I.rz;
    let best = null;
    for (let i = 0; i < 5; i++) {
      const t = (i / 4 - 0.5) * 1.7 * run;
      const lx = alongX ? t : u, lz = alongX ? u : t;
      _p.set(o.ox + lx * o.cs + lz * o.sn, o.oy + base + 0.4, o.oz - lx * o.sn + lz * o.cs);
      RC.set(_p, UP);
      const h = RC.intersectObject(I.object3D, true)[0];
      if (h) best = Math.max(best ?? 0, 0.4 + h.distance);
    }
    return best;
  };

  for (let i = 0; i < D.doors.length; i++) {
    D.abort();
    if (!D.jump(i)) continue;
    const I = D.interior, d = D.active, M = d.m.elements;
    I.object3D.updateMatrixWorld(true);   // built this tick; the raycaster needs it current
    const ox = M[12], oy = M[13], oz = M[14], cs = d.n.z, sn = d.n.x;
    const dist = P.distIn, pmax = P.pitchMaxIn, wt = d.house.t;
    const levels = I.loft ? [['ground', I.fy], ['loft', I.deck]] : [['ground', I.fy]];
    for (const [name, base] of levels) {
      const B = I.bounds;
      let n = 0, full = 0, escaped = 0, minArm = 99, maxEye = 0, poke = 0;
      const axis = { x: [0, 0], z: [0, 0] };
      // what is actually overhead on this level: the loft's deck downstairs, the shell above it
      const lid = (I.loft && name === 'ground') ? I.deck : I.top;
      maxEye = base + P.heightIn + dist * Math.sin(pmax) + P.camRadius;
      for (let lx = -B.rx; lx <= B.rx + 1e-6; lx += step) {
        for (let lz = -B.rz; lz <= B.rz + 1e-6; lz += step) {
          const wx = ox + lx * cs + lz * sn, wz = oz - lx * sn + lz * cs;
          const ay = oy + base + P.heightIn;
          for (const pitch of [0.26, pmax]) {
            const cp = Math.cos(pitch), sp = Math.sin(pitch);
            // headings are swept in the room's own frame so "camera pushed at the +x wall" means
            // the same thing whatever the house's rotation
            for (let h = 0; h < HEADINGS; h++) {
              const yaw = h / HEADINGS * Math.PI * 2;
              const ldx = -Math.sin(yaw) * cp, ldz = -Math.cos(yaw) * cp;
              const dx = ldx * cs + ldz * sn, dz = -ldx * sn + ldz * cs;
              const a = arm(wx, ay, wz, dx, sp, dz, dist);
              n++;
              const atFull = a > dist - 1e-3;
              if (atFull) full++;
              minArm = Math.min(minArm, a);
              const cy = ay + sp * a;
              const px = wx + dx * a - ox, pz = wz + dz * a - oz;
              const clx = Math.abs(px * cs - pz * sn), clz = Math.abs(px * sn + pz * cs);
              // inside the wall panel is survivable — its inner face is backfacing from there.
              // Past the outer face, or above the ceiling slab, is seeing outside the shell.
              poke = Math.max(poke, clx - I.rx, clz - I.rz, cy - oy - I.top);
              if (clx > I.rx + wt || clz > I.rz + wt || cy > oy + I.top + 0.02) escaped++;
              if (pitch !== 0.26) continue;
              if (Math.abs(lz) < step * 0.5 && (h === 3 || h === 9)) { axis.x[0]++; if (atFull) axis.x[1]++; }
              if (Math.abs(lx) < step * 0.5 && (h === 0 || h === 6)) { axis.z[0]++; if (atFull) axis.z[1]++; }
            }
          }
        }
      }
      const o = { ox, oy, oz, cs, sn };
      const alongX = I.rx >= I.rz, half = Math.min(I.rx, I.rz) * 0.9;
      const ridge = ceilingAt(I, o, base, 0, alongX) ?? lid - base;
      const eaves = +(ceilingAt(I, o, base, half, alongX) ?? ridge).toFixed(2);
      const R = { ox, oy, oz, cs, sn, dist, planes: roomPlanes(I.rx, I.rz, ridge, (ridge - eaves) / half, alongX) };
      const ceil = {};
      for (const [k, [t, th]] of Object.entries(FIELDS)) {
        ceil[k] = [frameFill(R, base, 0.26, t, th), frameFill(R, base, PITCH_MIN, t, th)];
      }
      rooms.push({
        door: i, zone: d.zoneId, level: name, loft: !!I.loft,
        w: +d.house.w.toFixed(2), d: +d.house.d.toFixed(2), ceil, ridge: +ridge.toFixed(2), eaves,
        roomH: +(lid - base).toFixed(2), rx: +I.rx.toFixed(2), rz: +I.rz.toFixed(2),
        samples: n, fullFrac: +(full / n).toFixed(3),
        coreX: axis.x[0] ? +(axis.x[1] / axis.x[0]).toFixed(3) : null,
        coreZ: axis.z[0] ? +(axis.z[1] / axis.z[0]).toFixed(3) : null,
        minArm: +minArm.toFixed(3), maxEye: +maxEye.toFixed(3), wallT: +wt.toFixed(2),
        headroom: +(lid - maxEye).toFixed(3), poke: +poke.toFixed(3), escaped,
      });
    }
  }
  D.abort();

  for (let i = 0; i < D.doors.length; i++) {
    const d = D.doors[i];
    const px = d.pos.x + d.n.x * 3.10, pz = d.pos.z + d.n.z * 3.10;
    const py = W.groundAt(px, pz, d.pos.y);
    let bad = 0, worst = 0;
    for (const frac of [1, 0.6, 0.3]) {
      const dist = P.dist * frac;
      for (let h = 0; h < HEADINGS; h++) {
        const yaw = h / HEADINGS * Math.PI * 2;
        const pitch = 0.26, cp = Math.cos(pitch), sp = Math.sin(pitch);
        const ay = py + P.height;
        const dx = -Math.sin(yaw) * cp, dz = -Math.cos(yaw) * cp;
        let bx = px + dx * dist, by = ay + sp * dist, bz = pz + dz * dist;
        const floor = W.groundAt(bx, bz, by) + 0.7;
        if (floor > by) {
          const dy = Math.min(floor - ay, dist);
          const k = Math.sqrt(Math.max(0, dist * dist - dy * dy)) / Math.max(1e-4, cp * dist);
          bx = px + (bx - px) * k; bz = pz + (bz - pz) * k; by = ay + dy;
        }
        let ux = bx - px, uy = by - ay, uz = bz - pz;
        const len = Math.hypot(ux, uy, uz) || 1;
        ux /= len; uy /= len; uz /= len;
        const a = arm(px, ay, pz, ux, uy, uz, len);
        const id = insideAny(px + ux * a, ay + uy * a, pz + uz * a);
        if (id) { bad++; worst = id; }
      }
    }
    outs.push({ door: i, zone: d.zoneId, bad, worst, aimInside: insideAny(px, py + P.height, pz) });
  }
  D.abort();
  return { rooms, outdoor: outs };
})(${STEP})`;

const page = await open({ w: 640, h: 360, dpr: 1 });
await page.S('Page.navigate', { url: `${page.base}/index.html?preset=medium${args.set ? '&' + args.set : ''}` });
await waitFor(page.S, 'window.__forge && window.__forge.ready', 20000);
const r = await evalJSON(page.S, PROBE);
await page.close();

const bad = r.rooms.filter(x => x.escaped > 0);
const badOut = r.outdoor.filter(x => x.bad > 0);

console.log(`indoor — ${r.rooms.length} room/level pairs, grid step ${STEP} m\n`);
console.log('door zone   level   w×d        roomH  core-x core-z  full  minArm headroom  poke escapes');
for (const m of r.rooms) {
  console.log(`${String(m.door).padStart(4)} ${m.zone.padEnd(8)} ${m.level.padEnd(7)} `
    + `${(m.w + '×' + m.d).padEnd(10)} ${String(m.roomH).padEnd(6)} `
    + `${pct(m.coreX)}  ${pct(m.coreZ)}   ${pct(m.fullFrac)} ${String(m.minArm).padStart(6)} `
    + `${String(m.headroom).padStart(8)} ${String(m.poke).padStart(5)} ${String(m.escaped).padStart(7)}`);
}
const mean = k => r.rooms.reduce((a, b) => a + (b[k] ?? 0), 0) / r.rooms.length;
console.log(`\nmean core-x ${pct(mean('coreX'))}  core-z ${pct(mean('coreZ'))}  full ${pct(mean('fullFrac'))}`);
console.log(`min headroom ${Math.min(...r.rooms.map(m => m.headroom)).toFixed(3)} m`
  + `   max poke into wall ${Math.max(...r.rooms.map(m => m.poke)).toFixed(3)} m of ${r.rooms[0].wallT} m panel`);
console.log(`camera escaped the shell: ${bad.length} of ${r.rooms.length} rooms`
  + (bad.length ? ` — ${bad.map(b => b.door + '/' + b.level).join(', ')}` : ''));

const lofts = r.rooms.filter(m => m.level === 'loft');
const ground = r.rooms.filter(m => m.level === 'ground');
const key = m => m.ceil.P[0][0];
const low = [...r.rooms].sort((a, b) => key(b) - key(a)).slice(0, 8);
console.log(`\nceiling — all ${r.rooms.length} rooms (${ground.length} ground, ${lofts.length} loft), worst heading at the room centre.`);
const lowest = r.rooms.reduce((a, b) => (b.roomH < a.roomH ? b : a));
console.log(`lowest roomH ${lowest.roomH} m (door ${lowest.door} ${lowest.level})`
  + `   lowest ground floor ${Math.min(...ground.map(m => m.roomH))} m`
  + `   lowest loft eaves ${Math.min(...lofts.map(m => m.eaves))} m against a 2.59 m eye`);
console.log('  room             roomH ridge eaves    land   port  land↑  port↑   eye in the ceiling');
for (const m of low) {
  const v = ['L', 'P'].flatMap(f => m.ceil[f].map(([, n]) => n));
  console.log(`  door ${String(m.door).padStart(2)} ${m.level.padEnd(7)} ${String(m.roomH).padStart(5)} `
    + `${String(m.ridge).padStart(5)} ${String(m.eaves).padStart(5)} ` + ['L0', 'P0', 'L1', 'P1']
      .map(k => pct(m.ceil[k[0]][+k[1]][0])).join(' ')
    + `   ${Math.max(...v)} of 12 headings`);
}
const voids = r.rooms.filter(m => ['L', 'P'].some(f => m.ceil[f].some(([, n]) => n > 0)));
console.log(`rooms where the eye reaches the ceiling and the player sees through the roof:`
  + ` ${voids.length} of ${r.rooms.length}`
  + (voids.length ? ` — ${voids.map(m => m.door + '/' + m.level).join(', ')}` : ''));

console.log(`\noutdoor — ${r.outdoor.length} doors × 12 headings × 3 arm lengths`);
console.log(`camera inside a building: ${badOut.reduce((a, b) => a + b.bad, 0)} cases`
  + (badOut.length ? ` at doors ${badOut.map(b => `${b.door}(${b.bad}${b.aimInside ? ',aim in ' + b.aimInside : ''})`).join(', ')}` : ''));

if (args.json) writeFileSync(resolve(ROOT, args.json), JSON.stringify(r, null, 2));

function pct(v) { return v === null || v === undefined ? '  —  ' : (100 * v).toFixed(1).padStart(5) + '%'; }