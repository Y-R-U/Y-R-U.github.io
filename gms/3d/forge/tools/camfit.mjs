#!/usr/bin/env node
// Measures the camera arm against the world instead of eyeballing it.
//
//   indoors  — a grid across every room's floor × 12 headings × 2 pitches: how often the arm is
//              at full length (the "core" of WORLD.md §2.5), and whether the camera ever ends up
//              outside the shell.
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

const PROBE = `(step => {
  const D = window.__forge.doors, P = window.__forge.player, W = window.__forge.walk;
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

  for (let i = 0; i < D.doors.length; i++) {
    D.abort();
    if (!D.jump(i)) continue;
    const I = D.interior, d = D.active, M = d.m.elements;
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
      rooms.push({
        door: i, zone: d.zoneId, level: name, loft: !!I.loft,
        w: +d.house.w.toFixed(2), d: +d.house.d.toFixed(2),
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
console.log(`\noutdoor — ${r.outdoor.length} doors × 12 headings × 3 arm lengths`);
console.log(`camera inside a building: ${badOut.reduce((a, b) => a + b.bad, 0)} cases`
  + (badOut.length ? ` at doors ${badOut.map(b => `${b.door}(${b.bad}${b.aimInside ? ',aim in ' + b.aimInside : ''})`).join(', ')}` : ''));

if (args.json) writeFileSync(resolve(ROOT, args.json), JSON.stringify(r, null, 2));

function pct(v) { return v === null || v === undefined ? '  —  ' : (100 * v).toFixed(1).padStart(5) + '%'; }
