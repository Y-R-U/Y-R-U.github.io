// Circuit authoring. A tiny turtle-graphics builder emits 3D control points;
// track.js turns those into frames. Loops are just control points that go up
// and over — parallel transport does the rest, which is why a vertical loop
// needs no special case anywhere in the physics.
//
// Closure: most circuits are authored so their turns sum to 360° and their
// straights match, which closes them exactly. `close()` mops up whatever is
// left with a Hermite blend, and DEV mode prints the residual.

import * as THREE from 'three';
import { DEV_MODE } from './config.js';
import { mulberry32, clamp, lerp, smoothstep, wrap } from './utils.js';
import { Track } from './track.js';

const D2R = Math.PI / 180;

class PathBuilder {
  constructor(opts = {}) {
    this.pos = new THREE.Vector3(0, opts.y || 0, 0);
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.points = [];
    this.attr = { bank: 0, width: opts.width || 11, railL: 'rail', railR: 'rail', kind: 'road' };
    this.start = { pos: this.pos.clone(), fwd: this.fwd.clone() };
    this.push();
  }

  set(attr) {
    Object.assign(this.attr, attr);
    return this;
  }

  push(extra) {
    this.points.push({
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      ...this.attr, ...(extra || {}),
    });
    return this;
  }

  right() {
    return new THREE.Vector3().copy(this.fwd).cross(this.up).normalize();
  }

  straight(len, opts = {}) {
    const n = Math.max(1, Math.round(len / (opts.step || 14)));
    for (let i = 1; i <= n; i++) {
      this.pos.addScaledVector(this.fwd, len / n);
      this.push(opts.attr);
    }
    return this;
  }

  // Positive degrees turn right. Radius is to the centreline.
  turn(deg, radius, opts = {}) {
    const steps = Math.max(2, Math.ceil(Math.abs(deg) / (opts.stepDeg || 9)));
    const dir = Math.sign(deg) || 1;
    const bank = opts.bank != null ? opts.bank : 0;
    const rise = opts.rise || 0;

    // Snapshot the arc start and rebuild each sample from it, so a long arc
    // cannot accumulate drift one step at a time.
    const from = this.pos.clone();
    const fwd0 = this.fwd.clone();
    const centre = from.clone().addScaledVector(this.right(), dir * radius);
    const rel = from.clone().sub(centre);

    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const a = Math.abs(deg * D2R) * f;
      const p = rel.clone().applyAxisAngle(this.up, -dir * a);
      this.pos.copy(centre).add(p);
      this.pos.y = from.y + rise * f;
      this.fwd.copy(fwd0).applyAxisAngle(this.up, -dir * a).normalize();

      // Bank eases in and out so the road never kinks at the entry.
      const ease = opts.hardBank ? 1 : Math.sin(f * Math.PI);
      this.push({ bank: bank * ease * dir, ...(opts.attr || {}) });
    }
    return this;
  }

  // Net elevation change, level at both ends.
  ramp(len, rise, opts = {}) {
    const n = Math.max(3, Math.round(len / (opts.step || 12)));
    const y0 = this.pos.y;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      this.pos.addScaledVector(this.fwd, len / n);
      this.pos.y = y0 + rise * smoothstep(0, 1, f);
      this.push(opts.attr);
    }
    return this;
  }

  // Up and back down — a crest you can get air over.
  hill(len, rise, opts = {}) {
    const n = Math.max(4, Math.round(len / (opts.step || 10)));
    const y0 = this.pos.y;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      this.pos.addScaledVector(this.fwd, len / n);
      this.pos.y = y0 + rise * Math.sin(f * Math.PI);
      this.push(opts.attr);
    }
    return this;
  }

  // Lateral S-shift with no net heading change.
  shift(len, offset, opts = {}) {
    const n = Math.max(4, Math.round(len / (opts.step || 9)));
    const r = this.right();
    const base = this.pos.clone();
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      this.pos.copy(base)
        .addScaledVector(this.fwd, len * f)
        .addScaledVector(r, offset * smoothstep(0, 1, f));
      this.push(opts.attr);
    }
    return this;
  }

  // Out and back — a proper chicane.
  chicane(len, offset, opts = {}) {
    const n = Math.max(6, Math.round(len / (opts.step || 8)));
    const r = this.right();
    const base = this.pos.clone();
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      const lat = Math.sin(f * Math.PI) * offset;
      this.pos.copy(base).addScaledVector(this.fwd, len * f).addScaledVector(r, lat);
      this.push({ bank: -Math.cos(f * Math.PI) * (opts.bank || 0) * Math.sign(offset), ...(opts.attr || {}) });
    }
    return this;
  }

  // A vertical loop. Ends where it started, advanced `adv` metres forward, so
  // the entry and exit roads do not occupy the same space.
  loop(radius, opts = {}) {
    const adv = opts.adv != null ? opts.adv : radius * 0.62;
    const steps = opts.steps || 30;
    const centre = new THREE.Vector3().copy(this.pos).addScaledVector(this.up, radius);
    const f0 = this.fwd.clone();
    const u0 = this.up.clone();
    const p0 = this.pos.clone();
    for (let i = 1; i <= steps; i++) {
      const phi = (i / steps) * Math.PI * 2;
      this.pos.copy(centre)
        .addScaledVector(u0, -Math.cos(phi) * radius)
        .addScaledVector(f0, Math.sin(phi) * radius)
        .addScaledVector(f0, adv * (phi / (Math.PI * 2)));
      this.push({ width: opts.width || this.attr.width, railL: 'wall', railR: 'wall', kind: 'loop' });
    }
    this.pos.copy(p0).addScaledVector(f0, adv);
    this.fwd.copy(f0);
    return this;
  }

  // A corkscrew: a horizontal turn that also rolls the road right over.
  corkscrew(deg, radius, opts = {}) {
    return this.turn(deg, radius, { ...opts, bank: opts.bank || 0.85, hardBank: true });
  }

  // Run the same sub-path `times` times. If one repetition turns exactly
  // 360/times degrees and ends level, the circuit closes exactly — because
  // repetition n starts in a frame rotated by n×(360/times), so the
  // displacements sum to zero. Every circuit here is built this way, which is
  // why none of them need the closing blend to invent a hairpin.
  //
  // Variations between repetitions are allowed as long as they have the same
  // net displacement: a chicane instead of a straight of the same length, a
  // crest instead of flat, a loop plus a shortened straight.
  repeat(times, fn) {
    for (let i = 0; i < times; i++) fn(this, i, times);
    return this;
  }

  close(opts = {}) {
    const gap = this.pos.distanceTo(this.start.pos);
    this.closureGap = gap;
    if (gap > 6) {
      console.warn(`[track] closure gap ${gap.toFixed(1)}m — the blend will distort the shape`);
    }
    if (gap < 1.5) {
      if (DEV_MODE) console.log('[track] closed exactly, gap', gap.toFixed(2));
      return this;
    }
    const n = Math.max(4, Math.round(gap / (opts.step || 12)));
    const m = opts.tension != null ? opts.tension : 0.62;
    const p0 = this.pos.clone();
    const p1 = this.start.pos.clone();
    const t0 = this.fwd.clone().multiplyScalar(gap * m);
    const t1 = this.start.fwd.clone().multiplyScalar(gap * m);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
      const h10 = t ** 3 - 2 * t ** 2 + t;
      const h01 = -2 * t ** 3 + 3 * t ** 2;
      const h11 = t ** 3 - t ** 2;
      this.pos.set(
        h00 * p0.x + h10 * t0.x + h01 * p1.x + h11 * t1.x,
        h00 * p0.y + h10 * t0.y + h01 * p1.y + h11 * t1.y,
        h00 * p0.z + h10 * t0.z + h01 * p1.z + h11 * t1.z
      );
      this.push({ bank: 0 });
    }
    if (DEV_MODE) console.log('[track] closed with blend, gap was', gap.toFixed(1));
    return this;
  }

  build(def) {
    // Drop the final point if it landed on top of the first — Catmull-Rom
    // closes the ring for us and a duplicate makes a cusp.
    const pts = this.points;
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 3 && pts.length > 8) pts.pop();
    return { ...def, points: pts, closureGap: this.closureGap || 0 };
  }
}

// ---------------------------------------------------------------------------
// Feature decoration
// ---------------------------------------------------------------------------
// Everything placeable is positioned relative to what the road is doing at
// that point: boost pads on the exits, crates off the fast line, and broadcast
// cameras wherever the racing is worth filming.
function decorate(track, opts = {}) {
  const rng = mulberry32(opts.seed || 1234);
  const L = track.length;
  const pads = [];
  const crates = [];
  const cams = [];
  const jumps = (opts.jumps || []).slice();

  const straightness = (s, span = 70) => {
    let sum = 0, n = 0;
    for (let d = -span; d <= span; d += 8) { sum += Math.abs(track.curvatureAt(s + d)); n++; }
    return sum / n;
  };

  // --- boost pads: on the exit of a corner, or down the middle of a straight
  const padCount = Math.round(clamp(L / 260, 4, 14) * (opts.padMul || 1));
  for (let i = 0; i < padCount; i++) {
    let best = null;
    for (let k = 0; k < 26; k++) {
      const s = rng() * L;
      if (pads.some((p) => Math.abs(track.delta(p.s, s)) < 90)) continue;
      const flat = straightness(s);
      const score = 1 / (0.004 + flat) + rng() * 60;
      if (!best || score > best.score) best = { s, score, flat };
    }
    if (!best) continue;
    const w = track.widthAt(best.s);
    const curvHere = track.curvatureAt(best.s + 40);
    // Reward the tidy line: pads sit on the inside of the next corner.
    const t = Math.abs(curvHere) > 0.004 ? -Math.sign(curvHere) * w * 0.42 : (rng() < 0.5 ? 0 : (rng() - 0.5) * w * 0.9);
    pads.push({ s: best.s, t, w: 4.2, len: 12 });
  }

  // --- crates: deliberately off the racing line, so grabbing one costs time
  const crateCount = Math.round(clamp(L / 190, 6, 20) * (opts.crateMul || 1));
  for (let i = 0; i < crateCount; i++) {
    const s = rng() * L;
    if (crates.some((c) => Math.abs(track.delta(c.s, s)) < 45)) { i--; continue; }
    const w = track.widthAt(s);
    const curvHere = track.curvatureAt(s);
    const outside = Math.abs(curvHere) > 0.005 ? Math.sign(curvHere) : (rng() < 0.5 ? -1 : 1);
    crates.push({ s, t: outside * w * (0.55 + rng() * 0.3), kind: 'chest' });
  }

  // --- boost pickups: cheaper, more common, closer to the line
  const boostCount = Math.round(clamp(L / 150, 8, 26));
  for (let i = 0; i < boostCount; i++) {
    const s = rng() * L;
    const w = track.widthAt(s);
    crates.push({ s, t: (rng() - 0.5) * w * 1.3, kind: 'boost' });
  }

  // --- broadcast cameras. Each covers a stretch of track and sweeps, so there
  // is always a window where nobody is filming that corner.
  const camCount = Math.round(clamp(L / 320, 3, 9) * (opts.camMul || 1));
  for (let i = 0; i < camCount; i++) {
    const s = (i / camCount) * L + rng() * 40;
    const w = track.widthAt(s);
    cams.push({
      s: wrap(s, L),
      t: (rng() < 0.5 ? -1 : 1) * (w + 7 + rng() * 5),
      back: 34 + rng() * 26,
      fwd: 60 + rng() * 50,
      period: 7 + rng() * 6,
      onTime: 3.4 + rng() * 2.6,
      phase: rng() * 12,
      height: 6 + rng() * 4,
      live: true,
    });
  }
  // The start/finish camera never looks away. Everybody knows that.
  cams.push({ s: 0, t: 18, back: 60, fwd: 90, period: 1, onTime: 1, phase: 0, height: 11, always: true, live: true });
  // Remember how each camera behaves by default — events switch them all on or
  // all off, and the track object is cached between races.
  for (const cam of cams) {
    cam.baseOn = cam.onTime;
    cam.basePeriod = cam.period;
    cam.baseAlways = !!cam.always;
  }

  track.buildFeatures({ ...track.def, pads, crates, cams, jumps, startS: 0 });
  return track;
}

// ---------------------------------------------------------------------------
// The circuits
// ---------------------------------------------------------------------------
// grade: 1 easy .. 5 brutal. `flavour` is shown on the track select card.
export const TRACK_DEFS = [
  {
    id: 'hometown', name: 'HOMETOWN OVAL', env: 'noon', grade: 1, laps: 3,
    flavour: 'Two long straights, two easy bends. Where everybody starts.',
    build: () => new PathBuilder({ width: 12 })
      .repeat(2, (b) => b.straight(320).turn(180, 96, { bank: 0.12 }))
      .close(),
    deco: { seed: 11, camMul: 0.8 },
  },
  {
    id: 'dockside', name: 'DOCKSIDE SPRINT', env: 'dawn', grade: 1, laps: 3,
    flavour: 'Container stacks, a crane hairpin, and nowhere at all to hide.',
    build: () => new PathBuilder({ width: 11.5 })
      .repeat(4, (b, i) => {
        b.straight(80);
        if (i % 2) b.chicane(120, i === 1 ? 9 : -9); else b.straight(120);
        b.straight(60).turn(90, 58);
      })
      .close(),
    deco: { seed: 22 },
  },
  {
    id: 'speedbowl', name: 'THE SPEEDBOWL', env: 'dusk', grade: 2, laps: 3,
    flavour: 'Banked to the roof. Flat out the whole way if your nerve holds.',
    build: () => new PathBuilder({ width: 14 })
      .repeat(2, (b) => b.straight(300).turn(180, 118, { bank: 0.42, hardBank: true }))
      .close(),
    deco: { seed: 33, padMul: 1.4 },
  },
  {
    id: 'carverpass', name: 'CARVER PASS', env: 'dawn', grade: 3, laps: 3,
    flavour: 'A mountain road with a drop down one side. Rails optional.',
    build: () => new PathBuilder({ width: 10.5 })
      .repeat(2, (b, i) => {
        b.set({ railR: i === 0 ? 'open' : 'rail' });
        b.ramp(150, 24).turn(70, 60, { bank: 0.16 });
        b.set({ railR: 'rail', railL: i === 0 ? 'rail' : 'open' });
        b.hill(130, 11).turn(-40, 92).straight(70);
        b.set({ railL: 'rail' });
        b.turn(150, 46, { bank: 0.22 }).ramp(150, -24).straight(70);
      })
      .close(),
    deco: { seed: 44, crateMul: 1.2 },
  },
  {
    id: 'neonmile', name: 'NEON MILE', env: 'neon', grade: 2, laps: 3,
    flavour: 'Downtown after midnight. Concrete walls, no run-off, big crowd.',
    build: () => new PathBuilder({ width: 10 })
      .set({ railL: 'wall', railR: 'wall' })
      .repeat(4, (b, i) => {
        b.straight(150).turn(90, 44).straight(40);
        if (i % 2) b.chicane(100, 7); else b.straight(100);
      })
      .close(),
    deco: { seed: 55, camMul: 1.5 },
  },
  {
    id: 'loopyard', name: 'THE LOOP YARD', env: 'night', grade: 3, laps: 3,
    flavour: 'A scrapyard with a forty-foot loop welded across the middle.',
    build: () => new PathBuilder({ width: 12 })
      .repeat(2, (b, i) => {
        b.straight(70);
        if (i === 0) b.loop(23, { adv: 16 }).straight(134); else b.straight(150);
        b.straight(90).turn(120, 60, { bank: 0.2 });
        b.straight(140).turn(60, 70);
      })
      .close(),
    deco: { seed: 66, padMul: 1.3 },
  },
  {
    id: 'saltflats', name: 'SALT FLATS', env: 'dust', grade: 2, laps: 3,
    flavour: 'No barriers. No walls. A painted line and a very long way down.',
    build: () => new PathBuilder({ width: 15 })
      .set({ railL: 'open', railR: 'open' })
      .repeat(3, (b, i) => {
        b.straight(150);
        if (i === 1) b.chicane(130, 12); else b.hill(130, i === 2 ? 7 : 0);
        b.straight(150).turn(120, 118, { bank: 0.1 });
      })
      .close(),
    deco: { seed: 77, crateMul: 1.4 },
  },
  {
    id: 'stormharbour', name: 'STORM HARBOUR', env: 'storm', grade: 3, laps: 3,
    flavour: 'Standing water, low grip and a crowd that came for the crashes.',
    build: () => new PathBuilder({ width: 11 })
      .repeat(2, (b, i) => {
        b.straight(160).turn(-90, 54).straight(120).turn(120, 48, { bank: 0.14 });
        if (i === 0) b.chicane(110, -9); else b.straight(110);
        b.turn(150, 52, { bank: 0.2 }).straight(90);
      })
      .close(),
    deco: { seed: 88 },
  },
  {
    id: 'crownpoint', name: 'CROWN POINT', env: 'noon', grade: 3, laps: 3,
    flavour: 'The overpass crosses the back straight. Mind the shadow.',
    build: () => new PathBuilder({ width: 11.5 })
      .repeat(2, (b, i) => {
        b.ramp(150, 21).turn(100, 62, { bank: 0.2 }).straight(120);
        b.turn(-40, 82);
        if (i === 0) b.ramp(150, -21); else b.ramp(150, -21);
        b.turn(120, 58).straight(110);
      })
      .close(),
    deco: { seed: 99 },
  },
  {
    id: 'grinder', name: 'THE GRINDER', env: 'dusk', grade: 4, laps: 3,
    flavour: 'Narrow, walled and twelve corners long. Bring spare panels.',
    build: () => new PathBuilder({ width: 9 })
      .set({ railL: 'wall', railR: 'wall' })
      .repeat(4, (b, i) => {
        b.straight(70).turn(60, 38).straight(50).turn(-40, 44).straight(40).turn(70, 36);
        if (i % 2) b.chicane(70, 5); else b.straight(70);
      })
      .close(),
    deco: { seed: 101, camMul: 1.6 },
  },
  {
    id: 'skyline', name: 'SKYLINE RISE', env: 'dusk', grade: 4, laps: 3,
    flavour: 'Climbs two hundred feet, then throws you off the top of it.',
    build: () => new PathBuilder({ width: 11 })
      .repeat(2, (b, i) => {
        b.ramp(200, 38).turn(110, 68, { bank: 0.24 }).straight(80);
        // A short, sharp crest: at anything over ~130km/h this launches you.
        b.hill(70, i === 0 ? 13 : 9, { attr: { kind: 'jump' } }).straight(60);
        b.turn(-50, 76).ramp(200, -38).turn(120, 62).straight(100);
      })
      .close(),
    deco: { seed: 111 },
  },
  {
    id: 'twinrings', name: 'TWIN RINGS', env: 'neon', grade: 5, laps: 3,
    flavour: 'Two loops back to back. Lift inside one and you fall out of it.',
    build: () => new PathBuilder({ width: 12 })
      .repeat(2, (b, i) => {
        b.straight(60);
        b.loop(i === 0 ? 22 : 26, { adv: 16 }).straight(154);
        b.straight(100).turn(130, 62, { bank: 0.3 }).straight(120).turn(50, 84);
        if (i === 0) b.chicane(90, 8); else b.straight(90);
      })
      .close(),
    deco: { seed: 121, padMul: 1.5 },
  },
  {
    id: 'quarry', name: 'QUARRY RUN', env: 'dust', grade: 3, laps: 3,
    flavour: 'Blasted out of a hillside. Half of it has no edge at all.',
    build: () => new PathBuilder({ width: 13 })
      .repeat(3, (b, i) => {
        b.set({ railR: i === 0 ? 'open' : 'rail', railL: i === 2 ? 'open' : 'rail' });
        b.straight(220).turn(60, 72, { bank: 0.14 });
        if (i === 1) b.hill(140, 12); else b.straight(140);
        b.turn(60, 66);
      })
      .close(),
    deco: { seed: 131, crateMul: 1.3 },
  },
  {
    id: 'cathedral', name: 'CATHEDRAL', env: 'storm', grade: 4, laps: 3,
    flavour: 'Half a kilometre of wet straight, then a corner that ends careers.',
    build: () => new PathBuilder({ width: 12.5 })
      .repeat(2, (b, i) => {
        b.straight(520).turn(150, 58, { bank: 0.26 });
        if (i === 0) b.chicane(160, -10); else b.straight(160);
        b.turn(30, 130);
      })
      .close(),
    deco: { seed: 141, padMul: 1.3 },
  },
  {
    id: 'circus', name: 'THE CIRCUS', env: 'night', grade: 5, laps: 3,
    flavour: 'The season finale: a loop, a corkscrew, a jump and a live audience.',
    build: () => new PathBuilder({ width: 12 })
      .repeat(2, (b, i) => {
        b.straight(60);
        if (i === 0) b.loop(25, { adv: 18 }).straight(142); else b.straight(160);
        b.turn(120, 60, { bank: 0.3 });
        b.hill(76, i === 0 ? 15 : 10, { attr: { kind: 'jump' } }).straight(64);
        b.corkscrew(90, 58).straight(100).turn(-30, 96).straight(120);
      })
      .close(),
    deco: { seed: 151, padMul: 1.4, camMul: 1.4 },
  },
];

export const TRACK_BY_ID = Object.fromEntries(TRACK_DEFS.map((t) => [t.id, t]));

const cache = new Map();

export function buildTrack(id) {
  if (cache.has(id)) return cache.get(id);
  const def = TRACK_BY_ID[id] || TRACK_DEFS[0];
  const built = def.build().build({
    id: def.id, name: def.name, env: def.env, laps: def.laps, width: 11,
  });
  const track = new Track(built);
  track.grade = def.grade;
  track.flavour = def.flavour;
  decorate(track, def.deco || {});
  if (DEV_MODE) {
    let minR = Infinity;
    for (let i = 0; i < track.count; i++) {
      const c = Math.abs(track.curv[i]);
      if (c > 1e-4) minR = Math.min(minR, 1 / c);
    }
    console.log(`[track] ${def.id}: ${track.length.toFixed(0)}m, ${track.count} frames, min radius ${minR.toFixed(1)}m`);
  }
  cache.set(id, track);
  return track;
}

export function clearTrackCache() {
  cache.clear();
}

export const trackIds = () => TRACK_DEFS.map((t) => t.id);
