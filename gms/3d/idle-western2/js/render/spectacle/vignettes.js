import * as THREE from 'three';
import { pomfreyHat } from './looks.js?v=20261004e';
import { POMFREY_HATS } from '../../data/hats.js?v=20261004e';
import { PCOL } from './particles.js?v=20261004e';

// R4 hero vignettes, composed like refs/a_clay_hero.jpg: the Stranger seen from behind in the foreground (lower left of
// centre), one or two characters playing a readable gag in the mid-ground, and open dirt around them (`clear` zones:
// pooled townsfolk and shipments are kept out). Placement is solved on the live hero camera in NDC, so every shot
// (tour, pin, establishing) gets the same layout whatever the aspect.
const R = Math.random, PI = Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const _r = new THREE.Vector3(), _f = new THREE.Vector3(), _h = new THREE.Vector3();
export const FORE = { nx: -0.3, ny: -0.5 };
export const MID_FRAC = 0.072;
const FORE_HAT = 0.68;
// R5: the gag plays ~1.3× (the ref's rival and flying drunk read bigger than the street around them), the Stranger's
// hat tips forward with a narrower brim so his back and arms read under it, and impacts squash and spring back.
export const GAG_S = 1.3;
const HAT_TILT = 0.34, HAT_BRIM = 0.84;
const spring = (s, amp = 0.38) => (s < 0 ? 1 : 1 - amp * Math.exp(-s * 5.5) * Math.cos(s * 19));
const THREE_Q = 0.5;

export function createVignettes(ctx, H) {
  const { parts, PV, street, world } = ctx;
  const { CLIP, strangerSpec, popHat, hatPhysics, arc, face, walkTo } = H;
  const Z0 = street.north + 0.9, Z1 = street.south - 0.9;
  const cam = () => world.heroRig.camera;

  function ground(nx, ny, out = [0, 0]) {
    const c = cam();
    c.updateMatrixWorld();
    _r.set(nx, ny, 0.5).unproject(c).sub(c.position).normalize();
    if (_r.y > -0.01) return null;
    const t = -c.position.y / _r.y;
    out[0] = c.position.x + _r.x * t; out[1] = c.position.z + _r.z * t;
    return out;
  }
  function frac(x, z, h = 2) {
    _f.set(x, 0, z).project(cam()); _h.set(x, h, z).project(cam());
    return _f.z < 1 ? (_h.y - _f.y) / 2 : 0;
  }
  // The street point on screen column nx where a 2 m figure is `want` of the frame height (clamped into the street).
  function spot(nx, want) {
    let lo = -0.95, hi = 0.35, g = [0, 0];
    for (let i = 0; i < 18; i++) {
      const m = (lo + hi) / 2, p = ground(nx, m, g);
      if (p && frac(p[0], p[1]) > want) lo = m; else hi = m;
    }
    const p = ground(nx, lo, g) || ground(nx, -0.5, g);
    if (!p) return null;
    p[1] = clamp(p[1], Z0, Z1);
    return p;
  }
  function fore(nx = FORE.nx) {
    const p = ground(nx, FORE.ny);
    if (!p) return null;
    p[1] = clamp(p[1], Z0 - 0.4, Z1 + 0.4);
    return p;
  }
  // You on one side of the frame, the gag on the other: the mid spot must land (after the street clamp) at least SEP
  // across the screen from you, else try the other side.
  const SEP = 0.42;
  function layout(want, sides = [-1, 1]) {
    for (const sd of sides) {
      const S = fore(sd * Math.abs(FORE.nx));
      if (!S) continue;
      for (const nx of [0.34, 0.26, 0.42, 0.18, 0.5]) {
        const M = spot(-sd * nx, want);
        if (!M) continue;
        _f.set(M[0], 0, M[1]).project(cam());
        if (Math.abs(_f.x) < 0.8 && (_f.x - sd * Math.abs(FORE.nx)) * -sd >= SEP) return { S, M, sd };
      }
    }
    return null;
  }
  // Face the lens 3/4, turned toward the frame centre.
  const camFace = (a) => {
    const c = cam().position; face(a, c.x, c.z);
    _f.set(a.x, 0, a.z).project(cam());
    a.h += (_f.x > 0 ? -1 : 1) * THREE_Q;
  };
  const awayFace = (a, x, z) => face(a, x, z);
  const sideOf = () => { const c = cam(); c.getWorldDirection(_r); const n = Math.hypot(_r.x, _r.z) || 1; return [-_r.z / n, _r.x / n, _r.x / n, _r.z / n]; };

  function base(which, dur) {
    const sc = { prio: 0, kind: 'gag', which, cosmetic: true, dur, vig: true, heroOnly: true, clear: [] };
    sc.end = () => { sc.clear.length = 0; };
    return sc;
  }
  function stranger(sc, at, lookAt) {
    const a = ctx.actor(sc, strangerSpec({ x: at[0], z: at[1] }));
    if (a) { awayFace(a, lookAt[0], lookAt[1]); a.clip = CLIP.idle; a.hat.scale = Math.min(a.hat.scale, FORE_HAT); a.hat.tilt = HAT_TILT; a.hat.brim = HAT_BRIM; }
    return a;
  }
  function zones(sc, S, ...pts) {
    sc.clear.length = 0;
    if (S) sc.clear.push([S[0], S[1], 4.5]);
    for (const p of pts) if (p) sc.clear.push([p[0], p[1], p[2] ?? 4.5]);
    if (S && pts[0]) sc.clear.push([(S[0] + pts[0][0]) / 2, (S[1] + pts[0][1]) / 2, Math.hypot(S[0] - pts[0][0], S[1] - pts[0][1]) / 2 + 1.5]);
  }

  const V = {};

  // The showpiece: the saloon doors bang open and a drunk cartwheels out (dust burst), belly-flopping in the open dirt
  // between the doors and you. Nobody stands in the doorway (R5: Mabel at the lens hid the doors), so the doors read.
  V.eject = () => {
    if (!world.plots.has('saloon')) return null;
    const D = ctx.hasAnchor('saloon', 'doorsOut') ? ctx.anchor('saloon', 'doorsOut') : ctx.anchor('saloon', 'doors');
    if (!D || !ctx.inHero([D[0], 1.2, D[2]], 0.92) || frac(D[0], D[2] + 2) < MID_FRAC * 0.8) return null;
    const sc = base('eject', 8.5);
    _f.set(D[0], 0, D[2]).project(cam());
    const dnx = _f.x, dny = _f.y, sx = clamp(dnx + 0.8, 0.05, 0.42), S = fore(sx);
    if (!S) return null;
    let drunk, you, fl, land;
    const T0 = 0.55, FLY = 0.8;
    sc.begin = () => {
      // He lands in the middle of the free dirt between the doors and you, a little nearer the lens than the doors.
      let L = null;
      const g = ground(Math.min(dnx + 0.36, sx - 0.5), dny - 0.07);
      if (g && Math.hypot(g[0] - D[0], g[1] - D[2]) > 2.4 && Math.hypot(g[0] - S[0], g[1] - S[1]) > 3) L = [g[0], 0, clamp(g[1], D[2] + 1.8, Z1)];
      if (!L) {
        const [ax, az] = sideOf();
        L = [D[0] + ax * 1.4, 0, clamp(D[2] + 3.2, Z0 - 0.3, Z1)];
        for (let k = 0; k < 4; k++) {
          _f.set(L[0], 0, L[2]).project(cam());
          if (Math.abs(_f.x - sx) >= 0.36) break;
          L[0] -= ax * 0.8; L[2] -= az * 0.8;
        }
      }
      land = L;
      you = stranger(sc, S, L);
      drunk = ctx.actor(sc, { char: 'drunk', x: D[0], y: 0.6, z: D[2] - 0.2, clip: CLIP.flail, speed: 9, s: GAG_S });
      if (drunk) { drunk.hidden = true; face(drunk, L[0], L[2]); }
      fl = { from: [D[0], 1.0, D[2] + 0.3], to: [L[0], 0.15, L[2]], apex: 1.8, t0: T0, dur: FLY };
      zones(sc, S, [L[0], L[2], 4], [D[0], D[2] + 1.5, 2.5]);
      world.plots.get('saloon')?.kickDoors?.();
    };
    sc.update = (dt) => {
      const t = sc.t;
      if (!drunk) return false;
      if (t < fl.t0) {
        drunk.hidden = true;
      } else if (t < fl.t0 + fl.dur) {
        if (!sc.thrown) {
          sc.thrown = true;
          drunk.hidden = false;
          parts.puff([D[0], 0.7, D[2] + 0.6], 20, { r: 1.6, size: 0.75, life: 1.4 });
          world.plots.get('saloon')?.kickDoors?.();
          popHat(drunk, (D[0] - land[0]) * 0.15, 3.8, -0.8);
        }
        const u = (t - fl.t0) / fl.dur, p = arc(fl, u);
        drunk.x = p[0]; drunk.y = p[1]; drunk.z = p[2];
        face(drunk, land[0] + (land[0] - D[0]), land[2] + (land[2] - D[2]));
        drunk.pitch = -0.5 - u * PI * 1.5; drunk.roll = Math.sin(u * PI) * 0.4; drunk.clip = CLIP.flail;
        drunk.sq = u < 0.15 ? 1 + u * 2 : 1.3 - (u - 0.15) * 0.25;
        if (you && u > 0.5) { you.clip = CLIP.handsup; you.speed = 6; }
      } else {
        const s = t - fl.t0 - fl.dur;
        if (!sc.landed) {
          sc.landed = true;
          parts.puff([land[0], 0, land[2]], 26, { r: 1.9, size: 0.85, life: 1.5, up: 1.6 });
          parts.stars([land[0], 1, land[2]], 5, { follow: () => ctx.head(drunk, H.hv), life: 3 });
        }
        // belly slide (squash on impact), then sit up dazed with a bounce, then stagger off
        const slide = Math.min(1, s / 0.45);
        const dx = land[0] - D[0], dz = land[2] - D[2], n = Math.hypot(dx, dz) || 1;
        if (s < 2.6) {
          drunk.x = land[0] + (dx / n) * slide * 0.7; drunk.z = land[2] + (dz / n) * slide * 0.7;
          drunk.y = 0.15; drunk.pitch = -PI / 2; drunk.prone = true; drunk.clip = CLIP.sprawl; drunk.roll = Math.sin(s * 3) * 0.04;
          drunk.sq = spring(s, 0.45);
          if (s < 0.45 && Math.floor(s * 20) !== Math.floor((s - dt) * 20)) parts.puff([drunk.x, 0, drunk.z], 2, { r: 0.3, size: 0.4 });
        } else if (s < 4.6) {
          drunk.pitch = Math.min(0, drunk.pitch + dt * 4); drunk.y = Math.max(0, drunk.y - dt * 0.3); drunk.prone = false;
          drunk.clip = CLIP.dizzy; drunk.speed = 4; camFace(drunk);
          drunk.sq = spring(s - 2.6, -0.22);
        } else {
          drunk.pitch = 0; drunk.y = 0; drunk.sq = 1;
          const [ax, az] = sideOf();
          walkTo(drunk, drunk.x - ax * 3, drunk.z - az * 3, 1.0, dt);
          drunk.clip = CLIP.stagger; drunk.speed = 5; drunk.roll = Math.sin(t * 3) * 0.15;
        }
        if (you) { if (s > 1.4 && s < 3.2) { you.clip = CLIP.point; face(you, drunk.x, drunk.z); } else if (s >= 3.2) { you.clip = s < 4.6 ? CLIP.tiphat : CLIP.idle; } }
      }
      hatPhysics(drunk, dt, true);
      return t < sc.dur;
    };
    return sc;
  };

  // The duel standoff: you from behind in the foreground, the rival down the street facing the lens. You win by a hair:
  // his hat spins off, he faints, Mortimer strolls in with his tape.
  V.duel = (o = {}) => {
    const sc = base('duel', 10.5);
    const side = R() < 0.5 ? 1 : -1, lay = layout(MID_FRAC * 1.1, R() < 0.7 ? [-1, 1] : [1, -1]);
    if (!lay) return null;
    const { S, M } = lay;
    let you, opp, mort;
    const T_DRAW = 4.6 + R() * 0.6;
    sc.begin = () => {
      const [ax, az] = sideOf();
      opp = ctx.actor(sc, { char: o.opponent || H.pick(['bart', 'hiredgun', 'bart', 'nun']), x: M[0] - ax * side * 1.6, z: M[1] - az * side * 1.6, clip: CLIP.walk, s: GAG_S });
      you = stranger(sc, S, M);
      if (!opp) return;
      zones(sc, S, [M[0], M[1], 4.5]);
    };
    sc.update = (dt) => {
      const t = sc.t;
      if (!opp) return false;
      if (t < 1.2) { walkTo(opp, M[0], M[1], 1.4, dt); opp.speed = 5; }
      else if (t < T_DRAW) {
        opp.clip = CLIP.duel; you && (you.clip = CLIP.duel);
        face(opp, S[0], S[1]); you && face(you, M[0], M[1]);
        opp.roll = Math.sin(t * 13) * 0.02;
        if (t > 1.8 && t < T_DRAW - 0.3) {
          const u = (t - 1.8) / (T_DRAW - 2.1), [ax, az] = sideOf(), mx = (S[0] + M[0]) / 2, mz = (S[1] + M[1]) / 2;
          ctx.prop(PV.tumbleweed, mx + ax * (5 - u * 10), 0.45 + Math.abs(Math.sin(t * 5)) * 0.45, mz + az * (5 - u * 10), { rx: t * 6, s: 1.3 });
        }
      } else {
        const s = t - T_DRAW;
        if (!sc.bang) {
          sc.bang = true;
          if (you) { ctx.local(you, 0.3, 0.85, 0.55, H.c3); parts.flash(H.c3, 0.9); parts.smoke(H.c3, 5); }
          popHat(opp, (R() - 0.5) * 1.5, 7, 0.6);
        }
        if (you) you.clip = s < 1.6 ? CLIP.draw : s < 3.4 ? CLIP.idle : CLIP.tiphat;
        if (s < 0.25) { opp.clip = CLIP.draw; opp.sq = 1 + s * 0.6; }
        else if (s < 1.7) { opp.clip = CLIP.handsup; opp.speed = 7; opp.sq = spring(s - 0.25, -0.25); }
        else {
          if (!sc.fell) { sc.fell = true; parts.puff([opp.x, 0, opp.z], 20, { r: 1.5, size: 0.7, life: 1.3 }); }
          opp.sq = spring(s - 1.9, 0.4);
          opp.clip = CLIP.sprawl; opp.pitch = Math.max(-PI / 2, opp.pitch - dt * 5); opp.y = 0.15; opp.prone = true;
          if (!sc.starred) { sc.starred = true; parts.stars([opp.x, 1.2, opp.z], 4, { follow: () => ctx.head(opp, H.hv), life: 2.5 }); }
        }
        if (s > 2.4 && !mort && !sc.noMort) {
          const [ax, az] = sideOf();
          mort = ctx.actor(sc, { char: 'mortimer', x: M[0] + ax * side * 6, z: M[1] + az * side * 6, s: GAG_S });
          if (!mort) sc.noMort = true;
        }
        if (mort) {
          const [ax, az] = sideOf();
          if (walkTo(mort, opp.x + ax * side * 1.0, opp.z + az * side * 1.0, 1.8, dt)) {
            mort.clip = CLIP.work; mort.speed = 5; face(mort, opp.x, opp.z);
            ctx.prop(PV.tape, (mort.x + opp.x) / 2, 0.3, (mort.z + opp.z) / 2, { ry: Math.atan2(opp.x - mort.x, opp.z - mort.z), sz: 0.9 });
          }
        }
      }
      hatPhysics(opp, dt, true);
      return t < sc.dur;
    };
    return sc;
  };

  // Pickles sleeps it off in the street; a chicken pecks him awake, he sits up sozzled, flops back. You shrug.
  V.pickles = () => {
    const sc = base('pickles', 9.5);
    const lay = layout(MID_FRAC * 1.1);
    if (!lay) return null;
    const { S, M } = lay;
    let a, you;
    sc.begin = () => {
      you = stranger(sc, S, M);
      a = ctx.actor(sc, { char: 'pickles', x: M[0], y: 0.18, z: M[1], clip: CLIP.sprawl, s: GAG_S });
      if (!a) return;
      const c = cam().position;
      a.h = Math.atan2(c.x - M[0], c.z - M[1]) + PI / 2; a.pitch = -PI / 2; a.prone = true;
      zones(sc, S, [M[0], M[1], 4.2]);
    };
    sc.update = (dt) => {
      const t = sc.t;
      if (!a) return false;
      const [ax, az] = sideOf();
      if (t > 1.2 && t < 4.4) {
        const u = Math.min(1, (t - 1.2) / 1.6), peck = t > 2.8 ? Math.abs(Math.sin(t * 12)) * 0.25 : 0;
        const cx = M[0] + ax * (3.2 - u * 2.4), cz = M[1] + az * (3.2 - u * 2.4) + 0.3;
        ctx.prop(PV.chicken, cx, Math.abs(Math.sin(t * 14)) * (u < 1 ? 0.2 : 0), cz, { ry: Math.atan2(-ax, -az), rx: peck, ph: t * 4, s: 2.4 });
      } else if (t >= 4.4 && t < 6) {
        const u = (t - 4.4) / 1.6;
        ctx.prop(PV.chicken, M[0] + ax * (0.8 + u * 5), Math.abs(Math.sin(t * 16)) * 0.35, M[1] + az * (0.8 + u * 5) + 0.3, { ry: Math.atan2(ax, az), ph: t * 6, s: 2.4 });
      }
      if (t > 3.6 && t < 7.0) {
        const k = Math.min(1, (t - 3.6) / 0.4) * Math.min(1, (7.0 - t) / 0.3);
        a.pitch = -PI / 2 * (1 - k); a.y = 0.18 * (1 - k); a.prone = k < 0.5;
        a.clip = k > 0.5 ? CLIP.slump : CLIP.sprawl;
        a.sq = spring(t - 3.6, -0.3);
        if (k > 0.5) camFace(a);
        if (t > 3.8 && !sc.popped) { sc.popped = true; popHat(a, 0.6, 4.5, 0.3); }
        if (t > 4.2 && !sc.hic) { sc.hic = true; parts.stars([a.x, 2.2, a.z], 4, { follow: () => ctx.head(a, H.hv), life: 2.2 }); }
        if (you) you.clip = CLIP.point;
      } else {
        if (t >= 7.0) a.sq = spring(t - 7.0, 0.42);
        if (t >= 7.0 && !sc.flop) { sc.flop = true; parts.puff([a.x, 0, a.z], 20, { r: 1.5, size: 0.7, life: 1.3 }); const c = cam().position; a.h = Math.atan2(c.x - a.x, c.z - a.z) + PI / 2; }
        a.pitch = -PI / 2; a.y = 0.18; a.prone = true; a.clip = CLIP.sprawl;
        if (t > 7.6 && a.hat.off?.rest) { a.hat.off = null; }
        if (Math.floor(t * 1.2) !== Math.floor((t - dt) * 1.2)) parts.puff([a.x, 0.9, a.z], 1, { r: 0.05, size: 0.16, up: 0.6, col: PCOL.SMOKE });
        if (you) you.clip = t > 7.2 ? CLIP.handsup : CLIP.idle;
      }
      hatPhysics(a, dt, true);
      return t < sc.dur;
    };
    return sc;
  };

  // Wendell hunts the escaped prisoner; the prisoner is a barrel with legs that freezes every time he turns round.
  V.barrel = () => {
    const sc = base('barrel', 8.8);
    const lay = layout(MID_FRAC);
    if (!lay) return null;
    const { S, M } = lay;
    let w, you;
    const dir = -lay.sd;
    sc.begin = () => {
      const [ax, az] = sideOf();
      you = stranger(sc, S, M);
      w = ctx.actor(sc, { char: 'wendell', x: M[0] + ax * dir * 1.4, z: M[1] + az * dir * 1.4, clip: CLIP.idle, s: GAG_S });
      if (!w) return;
      zones(sc, S, [M[0], M[1], 5]);
    };
    const look = (a, s) => { const [ax, az] = sideOf(); face(a, a.x + ax * s, a.z + az * s); };
    sc.update = (dt) => {
      const t = sc.t;
      if (!w) return false;
      const [ax, az] = sideOf();
      // barrel path: sneaks from -3.4 toward Wendell's back (u), freezes when he looks (2.6–4.2), bolts at 6.4
      const turned = (t > 2.6 && t < 4.2) || t > 6.0;
      let u;
      if (t < 2.6) u = -3.6 + t * 0.7;
      else if (t < 4.2) u = -3.6 + 2.6 * 0.7;
      else if (t < 6.0) u = -1.78 + (t - 4.2) * 0.5;
      else u = -0.88 + Math.max(0, t - 6.6) * 4.2;
      const bx = M[0] + ax * dir * u, bz = M[1] + az * dir * u + 0.25;
      const moving = !turned || t > 6.6, step = moving ? Math.sin(t * (t > 6.6 ? 22 : 9)) : 0;
      const ry = Math.atan2(ax * dir, az * dir);
      // freezing squashes the barrel down onto its hoops, bolting stretches it
      const fz = turned && t < 6.6 ? spring(t - (t > 6.0 ? 6.0 : 2.6), 0.3) : t > 6.6 ? 1.12 : 1;
      if (moving) ctx.prop(PV.legs, bx, Math.max(0, step) * 0.1, bz, { ry, sx: 1 + step * 0.15, s: 2.2 });
      ctx.prop(PV.barrel, bx, ((moving ? 0.5 : 0.36) + Math.abs(step) * 0.1) * 1.3, bz, { rz: step * 0.12, ry, s: 2.2, sy: fz, sx: 1 / Math.sqrt(fz), sz: 1 / Math.sqrt(fz) });
      if (t > 6.6 && Math.floor(t * 8) !== Math.floor((t - dt) * 8)) parts.puff([bx, 0, bz], 1, { r: 0.15, size: 0.25 });
      if (t < 2.6 || (t >= 4.2 && t < 6.0)) { look(w, dir); w.clip = CLIP.point; w.speed = 2; }
      else if (t < 6.6) { look(w, -dir); w.clip = t < 4.2 ? CLIP.idle : CLIP.handsup; w.speed = 6; }
      else {
        if (!sc.chase) { sc.chase = true; parts.stars([w.x, 2.3, w.z], 3, { follow: () => ctx.head(w, H.hv), life: 1 }); }
        w.clip = CLIP.walk; w.speed = 12; look(w, dir);
        w.x += ax * dir * dt * 3.4; w.z += az * dir * dt * 3.4;
      }
      if (you) you.clip = t > 2.8 && t < 6 ? CLIP.point : t >= 6.6 ? CLIP.handsup : CLIP.idle;
      return t < sc.dur;
    };
    return sc;
  };

  // Pomfrey's procession stops in front of you; he tips the Hundred-Gallon hat, you tip yours back.
  V.pomfrey = () => {
    const sc = base('pomfrey', 9);
    const lay = layout(MID_FRAC * 1.05);
    if (!lay) return null;
    const { S, M } = lay;
    const def = POMFREY_HATS[ctx.game.state.pomfrey ?? 7];
    const dir = lay.sd;
    let p, you;
    const bearers = [];
    sc.begin = () => {
      const [ax, az] = sideOf();
      you = stranger(sc, S, M);
      p = ctx.actor(sc, { char: 'pomfrey', hat: pomfreyHat(def), x: M[0] - ax * dir * 4.5, z: M[1] - az * dir * 4.5, s: GAG_S });
      if (!p) return;
      if ((def?.scale || 1) >= 2) for (const s of [-1, 1]) { const e = ctx.extra(sc, { char: 'goon', x: p.x, z: p.z, clip: CLIP.cheer, speed: 2, s: GAG_S }); if (e) bearers.push([e, s]); }
      ctx.say('pomfrey', 'pomfrey_pass');
      zones(sc, S, [M[0], M[1], 5.5]);
    };
    sc.update = (dt) => {
      const t = sc.t;
      if (!p) return false;
      const [ax, az] = sideOf();
      const stop = t > 3.2 && t < 6.2;
      const u = t <= 3.2 ? -4.5 + t * 1.4 : stop ? 0 : (t - 6.2) * 1.4;
      p.x = M[0] + ax * dir * u; p.z = M[1] + az * dir * u;
      if (stop) { if (S) face(p, S[0], S[1]); p.clip = t < 4.8 ? CLIP.tiphat : CLIP.idle; p.speed = 4; p.sq = spring(t - 3.2, 0.18); }
      else { face(p, p.x + ax * dir, p.z + az * dir); p.clip = CLIP.walk; p.speed = 3.5; }
      for (const [e, s] of bearers) {
        const k = s * (def.scale || 1) * 0.42 * GAG_S;
        e.x = p.x - ax * dir * 0.2 + az * k; e.z = p.z - az * dir * 0.2 - ax * k;
        e.h = p.h; e.clip = stop ? CLIP.idle : CLIP.cheer; e.y = stop ? 0 : Math.abs(Math.sin(t * 7 + s)) * 0.03;
      }
      if (you) { face(you, p.x, p.z); you.clip = t > 4.0 && t < 5.6 ? CLIP.tiphat : CLIP.idle; }
      return t < sc.dur;
    };
    return sc;
  };

  return V;
}
