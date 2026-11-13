import * as THREE from 'three';
import { STRIDE } from './people.js';
import { parseCosmetics } from './cosmetics.js';

const GOLDEN = 2.399963229728653;
const NEUTRAL_DEFAULT = [0xf4f3ef, 0xdcdcd8, 0xc3c6c9, 0xebe2d0, 0xa3a7ac, 0xffffff, 0xd2cbbd, 0x8d939b].map((h) => new THREE.Color(h));
const F_FREE = 0, F_CROWD = 1, F_NEUTRAL = 2, F_DYING = 3, F_ABSORB = 4;

function normColor(hex) {
  const col = new THREE.Color(hex);
  const hsl = {}; col.getHSL(hsl, THREE.SRGBColorSpace);
  col.setHSL(hsl.h, Math.max(0.85, hsl.s), Math.min(0.56, Math.max(0.46, hsl.l)), THREE.SRGBColorSpace);
  return col;
}

export function createCrowdSystem(people, map) {
  const cap = people.capacity;
  let NEUTRALS = NEUTRAL_DEFAULT;
  const wave = new Float32Array(cap), pend = new Uint8Array(cap);
  const px = new Float32Array(cap), pz = new Float32Array(cap), py = new Float32Array(cap);
  const vx = new Float32Array(cap), vz = new Float32Array(cap);
  const yaw = new Float32Array(cap), phase = new Float32Array(cap), gait = new Float32Array(cap);
  const look = new Float32Array(cap), flash = new Float32Array(cap), hop = new Float32Array(cap);
  const scale = new Float32Array(cap), scaleT = new Float32Array(cap);
  const cr = new Float32Array(cap), cg = new Float32Array(cap), cb = new Float32Array(cap);
  const tr = new Float32Array(cap), tg = new Float32Array(cap), tb = new Float32Array(cap);
  const kind = new Uint8Array(cap), owner = new Int16Array(cap), run = new Float32Array(cap);
  const free = [];
  for (let i = cap - 1; i >= 0; i--) free.push(i);
  // per-slot trig (slot k at angle k·GOLDEN and its 3/7/12 harmonics) and per-figure jitter phases, so the hot loop has no trig
  const GC = new Float32Array(cap), GS = new Float32Array(cap), H3 = new Float32Array(cap * 2), H7 = new Float32Array(cap * 2), H12 = new Float32Array(cap * 2);
  for (let k = 0; k < cap; k++) {
    const a = k * GOLDEN;
    GC[k] = Math.cos(a); GS[k] = Math.sin(a);
    H3[k * 2] = Math.sin(3 * a); H3[k * 2 + 1] = Math.cos(3 * a);
    H7[k * 2] = Math.sin(7 * a); H7[k * 2 + 1] = Math.cos(7 * a);
    H12[k * 2] = Math.sin(12 * a); H12[k * 2 + 1] = Math.cos(12 * a);
  }
  const J = new Float32Array(cap * 4);
  const obs = map.obstacles || [];
  let hi = 0;
  const tmp = { x: 0, z: 0, hit: false };

  const crowds = [];
  const PC = 4, POFF = 200, PN = 100;
  let props = Array.from({ length: PN * PN }, () => null);
  const addProp = (x, z, r) => {
    const i0 = Math.floor((x - r + POFF) / PC), i1 = Math.floor((x + r + POFF) / PC);
    const j0 = Math.floor((z - r + POFF) / PC), j1 = Math.floor((z + r + POFF) / PC);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (i < 0 || j < 0 || i >= PN || j >= PN) continue;
      (props[j * PN + i] ||= []).push(x, z, r);
    }
  };
  function baseProps(extra) {
    props = Array.from({ length: PN * PN }, () => null);
    for (const t of map.trees || []) addProp(t.x, t.z, 0.45 + 0.35 * t.s);
    for (const l of map.lamps || []) addProp(l.x, l.z, l.grand ? 0.75 : 0.4);
    if (extra) for (let k = 0; k < extra.length; k += 3) addProp(extra[k], extra[k + 1], extra[k + 2]);
  }
  baseProps(null);
  function propPush(f) {
    const i = Math.floor((px[f] + POFF) / PC), j = Math.floor((pz[f] + POFF) / PC);
    if (i < 0 || j < 0 || i >= PN || j >= PN) return;
    const L = props[j * PN + i];
    if (!L) return;
    for (let k = 0; k < L.length; k += 3) {
      const dx = px[f] - L[k], dz = pz[f] - L[k + 1], rr = L[k + 2] + 0.22;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1e-3;
        px[f] = L[k] + dx / d * rr; pz[f] = L[k + 1] + dz / d * rr;
      }
    }
  }
  let nCap = 0, nfig = null, nPrevX = null, nPrevZ = null, nCurX = null, nCurZ = null, nState = null;
  let lastTick = -1;
  let budget = 6000;
  let time = 0, figScale = 1;
  const stats = { drawn: 0, crowdFigs: 0, neutralFigs: 0, popIn: 0, popOut: 0, recruits: 0, transfers: 0, hats: 0, culled: 0 };

  function alloc(x, z, look0) {
    const i = free.pop();
    if (i === undefined) return -1;
    px[i] = x; pz[i] = z; py[i] = 0; vx[i] = 0; vz[i] = 0;
    yaw[i] = Math.random() * Math.PI * 2; phase[i] = Math.random() * 6.28; gait[i] = 0;
    look[i] = look0 ?? Math.random(); flash[i] = 0; hop[i] = 0;
    J[i * 4] = Math.sin(look[i] * 40); J[i * 4 + 1] = Math.cos(look[i] * 40); J[i * 4 + 2] = Math.sin(look[i] * 23); J[i * 4 + 3] = Math.cos(look[i] * 23);
    scale[i] = 0; scaleT[i] = 1; run[i] = 0; owner[i] = -1;
    if (i + 1 > hi) hi = i + 1;
    return i;
  }
  function kill(i) { kind[i] = F_DYING; scaleT[i] = 0; }
  function setColor(i, c, instant) {
    tr[i] = c.r; tg[i] = c.g; tb[i] = c.b;
    if (instant) { cr[i] = c.r; cg[i] = c.g; cb[i] = c.b; }
  }
  function teamShade(cw, lk, out) {
    const c = cw.palette ? cw.palette[Math.floor(((lk * 5.31) % 1) * cw.palette.length)] : cw.color;
    const k = 0.82 + 0.36 * ((lk * 9.13) % 1);
    out.r = c.r * k; out.g = c.g * k; out.b = c.b * k;
    return out;
  }
  const shade = new THREE.Color();

  function setCrowds(meta) {
    for (let i = 0; i < hi; i++) if (kind[i] !== F_FREE) release(i);
    hi = 0;
    crowds.length = 0;
    nCap = 0; lastTick = -1;
    for (const m of meta) {
      const col = normColor(m.color);
      const cos = parseCosmetics(m);
      crowds[m.index] = {
        index: m.index, color: col, ringCol: col.clone(), meta: { ...m }, figs: [], alive: false, cos,
        palette: cos.palette ? cos.palette.map((h) => new THREE.Color(h)) : null,
        hero: !!(cos.leader || cos.flag), onScreen: true, skip: 0,
        x: 0, z: 0, prevX: 0, prevZ: 0, curX: 0, curZ: 0, vx: 0, vz: 0, heading: 0,
        radius: 1, visR: 1, count: 0, want: 0, stealAcc: 0, vScale: 1, seen: false,
      };
    }
  }

  function crowdAt(i) { return crowds[i]; }

  // change one crowd's colour / cosmetics mid-match; the new shirt colour runs through the crowd as a wave from `from`
  function updateMeta(index, meta, from) {
    const c = crowds[index];
    if (!c || !meta) return false;
    const m = { ...c.meta, ...meta, index };
    c.meta = m;
    const col = normColor(m.color);
    const recolor = col.getHex() !== c.color.getHex() || JSON.stringify(m.palette || null) !== JSON.stringify(c.cos.palette || null);
    c.color = col;
    c.cos = parseCosmetics(m);
    c.palette = c.cos.palette ? c.cos.palette.map((h) => new THREE.Color(h)) : null;
    c.hero = !!(c.cos.leader || c.cos.flag);
    if (!recolor) return true;
    const ox = from && Number.isFinite(from.x) ? from.x : c.x, oz = from && Number.isFinite(from.z) ? from.z : c.z;
    const span = Math.max(4, c.visR * 1.1);
    for (const f of c.figs) {
      const d = Math.sqrt((px[f] - ox) ** 2 + (pz[f] - oz) ** 2);
      wave[f] = Math.min(1.4, d / span * 1.1) + Math.random() * 0.08;
      pend[f] = 1;
    }
    return true;
  }

  function joinCrowd(f, c, fromColor = true) {
    kind[f] = F_CROWD; owner[f] = c.index;
    c.figs.push(f);
    setColor(f, teamShade(c, look[f], shade), !fromColor);
  }
  function absorbInto(f, c) {
    kind[f] = F_ABSORB; owner[f] = c.index;
    setColor(f, teamShade(c, look[f], shade), false);
  }
  function removeAt(c, idx) {
    const last = c.figs.pop();
    if (idx < c.figs.length) c.figs[idx] = last;
  }

  function transfer(fromC, toC, n, x, z) {
    if (!fromC || !toC || n <= 0) return 0;
    let moved = 0;
    const figs = fromC.figs;
    const pickN = Math.min(n, Math.max(0, figs.length - 1));
    if (!pickN) return 0;
    const best = [], bestD = [];
    for (let k = 1; k < figs.length; k++) {
      const f = figs[k];
      const d = (px[f] - x) ** 2 + (pz[f] - z) ** 2;
      if (best.length < pickN) { best.push(k); bestD.push(d); continue; }
      let wi = 0;
      for (let q = 1; q < best.length; q++) if (bestD[q] > bestD[wi]) wi = q;
      if (d < bestD[wi]) { best[wi] = k; bestD[wi] = d; }
    }
    best.sort((a, b) => b - a);
    for (const k of best) {
      const f = figs[k];
      removeAt(fromC, k);
      if (toC.alive !== false && toC.figs.length < toC.want + 4) joinCrowd(f, toC);
      else absorbInto(f, toC);
      flash[f] = 0.8; run[f] = 1.2; hop[f] = 0.25;
      moved++; stats.transfers++;
    }
    return moved;
  }

  function onRecruit(e) {
    const c = crowds[e.crowd];
    if (!c) return;
    let f = nfig && e.slot >= 0 && e.slot < nCap ? nfig[e.slot] : -1;
    if (f >= 0) nfig[e.slot] = -1;
    else {
      f = alloc(e.x, e.z);
      if (f < 0) return;
      setColor(f, NEUTRALS[Math.min(7, (look[f] * 8) | 0)], true);
    }
    if (c.figs.length < c.want + 4) joinCrowd(f, c); else absorbInto(f, c);
    flash[f] = 1; run[f] = 0.8; hop[f] = 0.3;
    stats.recruits++;
    c.want = Math.max(c.want, c.figs.length);
  }

  function onSteal(e) {
    const from = crowds[e.from], to = crowds[e.to];
    if (!from || !to) return 0;
    const ratio = from.count > 0 ? from.want / Math.max(1, from.count) : 1;
    from.stealAcc += e.n * Math.min(1, ratio);
    const n = Math.floor(from.stealAcc);
    from.stealAcc -= n;
    return transfer(from, to, n, e.x, e.z);
  }

  function onElim(e) {
    const v = crowds[e.victim], by = crowds[e.by];
    if (!v) return;
    for (let k = v.figs.length - 1; k >= 0; k--) {
      const f = v.figs[k];
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 5;
      vx[f] = Math.cos(a) * s; vz[f] = Math.sin(a) * s;
      flash[f] = 1; hop[f] = 0.5; run[f] = 1.6;
      if (by && by.figs.length < by.want + 40) joinCrowd(f, by);
      else if (by) absorbInto(f, by);
      else kill(f);
    }
    v.figs.length = 0;
  }

  function onRespawn(e) {
    const c = crowds[e.crowd];
    if (!c) return;
    c.x = c.prevX = c.curX = e.x; c.z = c.prevZ = c.curZ = e.z;
    for (const f of c.figs) kill(f);
    c.figs.length = 0;
  }

  function allocate(state) {
    let neutrals = 0;
    if (nState) for (let s = 0; s < nCap; s++) if (nState[s]) neutrals++;
    let total = 0;
    for (const sc of state.crowds) if (sc.alive) total += sc.count;
    const avail = Math.max(200, budget - neutrals);
    let s = 1;
    if (total > avail) {
      let lo = 0, hiS = 1;
      for (let it = 0; it < 14; it++) {
        const mid = (lo + hiS) / 2;
        let sum = 0;
        for (const sc of state.crowds) if (sc.alive) sum += Math.min(sc.count, Math.max(Math.min(sc.count, 150), Math.floor(sc.count * mid)));
        if (sum > avail) hiS = mid; else lo = mid;
      }
      s = lo;
    }
    for (const sc of state.crowds) {
      const c = crowds[sc.index];
      if (!c) continue;
      c.want = sc.alive ? Math.max(1, Math.min(sc.count, Math.max(Math.min(sc.count, 150), Math.floor(sc.count * s)))) : 0;
      c.vScale = sc.alive ? Math.min(1.16, Math.sqrt(sc.count / Math.max(1, c.want))) : 1;
    }
  }

  function snapshot(state) {
    const live = state.crowds.length && state.crowds[0].px !== undefined;
    if (live) {
      for (const sc of state.crowds) {
        const c = crowds[sc.index];
        if (!c) continue;
        c.prevX = sc.px; c.prevZ = sc.pz; c.curX = sc.x; c.curZ = sc.z; c.seen = true;
      }
      const N = state.neutrals;
      if (N && N.px) {
        if (N.cap !== nCap) {
          nCap = N.cap;
          nfig = new Int32Array(nCap).fill(-1);
          nState = new Uint8Array(nCap);
        }
        nPrevX = N.px; nPrevZ = N.pz; nCurX = N.x; nCurZ = N.z;
        return;
      }
    }
    if (state.tick === lastTick) return;
    lastTick = state.tick;
    for (const sc of state.crowds) {
      const c = crowds[sc.index];
      if (!c) continue;
      const jump = (sc.x - c.curX) ** 2 + (sc.z - c.curZ) ** 2 > 64 || !c.seen;
      c.prevX = jump ? sc.x : c.curX; c.prevZ = jump ? sc.z : c.curZ;
      c.curX = sc.x; c.curZ = sc.z; c.seen = true;
    }
    const N = state.neutrals;
    if (!N) return;
    if (N.cap !== nCap) {
      nCap = N.cap;
      nfig = new Int32Array(nCap).fill(-1);
      nPrevX = new Float32Array(nCap); nPrevZ = new Float32Array(nCap);
      nCurX = new Float32Array(nCap); nCurZ = new Float32Array(nCap);
      nState = new Uint8Array(nCap);
      for (let s = 0; s < nCap; s++) { nCurX[s] = N.x[s]; nCurZ[s] = N.z[s]; }
    }
    for (let s = 0; s < nCap; s++) {
      const x = N.x[s], z = N.z[s];
      const jump = (x - nCurX[s]) ** 2 + (z - nCurZ[s]) ** 2 > 25 || !nState[s];
      nPrevX[s] = jump ? x : nCurX[s]; nPrevZ[s] = jump ? z : nCurZ[s];
      nCurX[s] = x; nCurZ[s] = z;
    }
  }

  function syncNeutrals(state, alpha, dt) {
    const N = state.neutrals;
    if (!N) return;
    for (let s = 0; s < nCap; s++) {
      const st = N.state[s];
      let f = nfig[s];
      const x = nPrevX[s] + (nCurX[s] - nPrevX[s]) * alpha, z = nPrevZ[s] + (nCurZ[s] - nPrevZ[s]) * alpha;
      if (!st) {
        if (f >= 0) { kill(f); nfig[s] = -1; }
        nState[s] = 0;
        continue;
      }
      if (f >= 0 && ((px[f] - x) ** 2 + (pz[f] - z) ** 2 > 36)) { kill(f); f = -1; nfig[s] = -1; }
      if (f < 0) {
        f = alloc(x, z, N.look ? N.look[s] / 255 : Math.random());
        if (f < 0) continue;
        kind[f] = F_NEUTRAL; nfig[s] = f;
        setColor(f, NEUTRALS[Math.min(7, (look[f] * 8) | 0)], true);
        yaw[f] = N.heading ? N.heading[s] : 0;
      }
      nState[s] = st;
      const dx = x - px[f], dz = z - pz[f];
      const sp = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      vx[f] = dt > 0 ? dx / dt : 0; vz[f] = dt > 0 ? dz / dt : 0;
      px[f] = x; pz[f] = z;
      const g = Math.min(1, Math.max(0, (sp - 0.2) / 2.0));
      gait[f] += (Math.max(0.35, g) - gait[f]) * Math.min(1, dt * 6);
      phase[f] += dt * (4.2 + sp * 1.0);
      const ty = sp > 0.3 ? Math.atan2(dx, dz) : (N.heading ? N.heading[s] : yaw[f]);
      yaw[f] = angLerp(yaw[f], ty, Math.min(1, dt * 8));
      if (st === 2) {
        const c = crowds[N.target[s]];
        if (c) {
          teamShade(c, look[f], shade);
          const base = NEUTRALS[Math.min(7, (look[f] * 8) | 0)];
          tr[f] = base.r + (shade.r - base.r) * 0.3; tg[f] = base.g + (shade.g - base.g) * 0.3; tb[f] = base.b + (shade.b - base.b) * 0.3;
        }
      }
    }
  }

  function updateCrowds(state, alpha, dt) {
    for (const sc of state.crowds) {
      const c = crowds[sc.index];
      if (!c) continue;
      c.alive = sc.alive; c.count = sc.count; c.radius = sc.radius;
      c.protect = sc.protect || 0; c.panic = sc.panic || 0; c.eating = sc.eating || 0; c.horde = !!sc.horde; c.boost = sc.boost || 0;
      const nx = c.prevX + (c.curX - c.prevX) * alpha, nz = c.prevZ + (c.curZ - c.prevZ) * alpha;
      c.vx = Number.isFinite(sc.vx) ? sc.vx : (dt > 0 ? (nx - c.x) / dt : 0);
      c.vz = Number.isFinite(sc.vz) ? sc.vz : (dt > 0 ? (nz - c.z) / dt : 0);
      c.x = nx; c.z = nz;
      c.visR += (sc.radius - c.visR) * Math.min(1, dt * (sc.radius > c.visR ? 3 : 1.5));
      if (!sc.alive) {
        for (const f of c.figs) kill(f);
        c.figs.length = 0;
        continue;
      }
      if (!c.figs.length) {
        const f = alloc(c.x, c.z);
        if (f >= 0) { joinCrowd(f, c, false); flash[f] = 1; }
      }
      const add = Math.min(c.want - c.figs.length, 40);
      for (let k = 0; k < add; k++) {
        const n = c.figs.length;
        const r = c.visR * 0.9 * Math.sqrt(n / Math.max(n + 1, c.want));
        const a = n * GOLDEN;
        const f = alloc(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
        if (f < 0) break;
        joinCrowd(f, c, false);
        flash[f] = 0.6;
        stats.popIn++;
      }
      const drop = Math.min(c.figs.length - c.want, 30);
      for (let k = 0; k < drop; k++) { kill(c.figs.pop()); stats.popOut++; }

      const figs = c.figs, N = figs.length;
      // off-screen crowds integrate every other frame at twice the step
      if (!c.onScreen && (c.skip ^= 1)) continue;
      const fdt = c.onScreen ? dt : dt * 2;
      const R = c.visR * 0.9;
      const bodyR = 0.34 * figScale;
      const lsp = Math.sqrt(c.vx * c.vx + c.vz * c.vz);
      const ldx = lsp > 0.3 ? c.vx / lsp : Math.sin(sc.heading || 0), ldz = lsp > 0.3 ? c.vz / lsp : Math.cos(sc.heading || 0);
      if (lsp > 0.3) c.heading = Math.atan2(c.vx, c.vz);
      // only crowds whose disc reaches an obstacle pay for push-out
      let near = false;
      if (map.pushOut) {
        const reach = R * 1.35 + 3;
        for (const o of obs) {
          const dx = o.type === 'rect' ? Math.max(0, Math.abs(c.x - o.x) - o.w / 2) : Math.max(0, Math.hypot(c.x - o.x, c.z - o.z) - o.r);
          const dz = o.type === 'rect' ? Math.max(0, Math.abs(c.z - o.z) - o.d / 2) : 0;
          if (dx * dx + dz * dz < reach * reach) { near = true; break; }
        }
      }
      const ph = c.index * 1.7;
      const t3 = time * 0.45 + ph, t7 = -time * 0.7 + ph, t12 = time * 1.1;
      const s3 = Math.sin(t3), c3 = Math.cos(t3), s7 = Math.sin(t7), c7 = Math.cos(t7), s12 = Math.sin(t12), c12 = Math.cos(t12);
      const sj1 = Math.sin(time * 0.7), cj1 = Math.cos(time * 0.7), sj2 = Math.sin(time * 0.6), cj2 = Math.cos(time * 0.6);
      const blRun = 1 - Math.exp(-fdt * 9), blWalk = 1 - Math.exp(-fdt * 5);
      const kg = Math.min(1, fdt * 5), kyF = Math.min(1, fdt * 9), kyS = Math.min(1, fdt * 1.5);
      const idleYaw = Math.atan2(ldx, ldz);
      for (let k = 0; k < N; k++) {
        const f = figs[k];
        if (k === 0) {
          px[f] = c.x; pz[f] = c.z; vx[f] = c.vx; vz[f] = c.vz;
          scaleT[f] = c.cos.leader ? 2.0 : 1.35;
        } else {
          const u = k / N;
          let r = R * Math.sqrt(u);
          if (u > 0.45) {
            const edge = 1 + 0.08 * (H3[k * 2] * c3 + H3[k * 2 + 1] * s3) + 0.05 * (H7[k * 2] * c7 + H7[k * 2 + 1] * s7) + 0.035 * (H12[k * 2] * c12 + H12[k * 2 + 1] * s12);
            const t = Math.min(1, (u - 0.45) / 0.4);
            r *= 1 + (edge - 1) * t;
            const h = (look[f] * 97.3) % 1;
            if (h < 0.06 && u > 0.6) r *= 1.1 + h * 2.5;
          }
          const j = f * 4;
          const jx = (sj1 * J[j + 1] + cj1 * J[j]) * 0.22, jz = (cj2 * J[j + 3] - sj2 * J[j + 2]) * 0.22;
          let tx = c.x + GC[k] * r + jx - c.vx * 0.06 * u, tz = c.z + GS[k] * r + jz - c.vz * 0.06 * u;
          if (near) {
            // slots inside a building fold back out into a loose band rather than a line along the wall
            map.pushOut(tx, tz, 0.3, tmp);
            if (tmp.hit) { const fx = tmp.x - tx, fz = tmp.z - tz; tx = tmp.x + fx * 0.6 + jz; tz = tmp.z + fz * 0.6 + jx; }
          }
          const kk = 2.6 - 1.2 * u;
          let dvx = c.vx * (1 - 0.12 * u) + (tx - px[f]) * kk;
          let dvz = c.vz * (1 - 0.12 * u) + (tz - pz[f]) * kk;
          const lim = lsp * 1.25 + 3.5 + run[f] * 5;
          const dl2 = dvx * dvx + dvz * dvz;
          if (dl2 > lim * lim) { const q = lim / Math.sqrt(dl2); dvx *= q; dvz *= q; }
          const bl = run[f] > 0 ? blRun : blWalk;
          vx[f] += (dvx - vx[f]) * bl; vz[f] += (dvz - vz[f]) * bl;
          px[f] += vx[f] * fdt; pz[f] += vz[f] * fdt;
          if (near) {
            map.pushOut(px[f], pz[f], bodyR * c.vScale, tmp);
            if (tmp.hit) { px[f] = tmp.x; pz[f] = tmp.z; }
          }
          propPush(f);
          scaleT[f] = c.vScale;
        }
        const sp = Math.sqrt(vx[f] * vx[f] + vz[f] * vz[f]);
        const g = Math.min(1, Math.max(0, (sp - 0.35) / 2.2));
        gait[f] += (g - gait[f]) * kg;
        phase[f] += fdt * (4.5 + Math.min(sp, 9) * 0.85);
        const ty = sp > 0.6 ? Math.atan2(vx[f], vz[f]) : idleYaw;
        yaw[f] = angLerp(yaw[f], ty, sp > 0.6 ? kyF : kyS);
      }
    }
  }

  function updateLoose(dt) {
    for (let i = 0; i < hi; i++) {
      const k = kind[i];
      if (k === F_ABSORB) {
        const c = crowds[owner[i]];
        if (!c || !c.alive) { kill(i); continue; }
        const dx = c.x - px[i], dz = c.z - pz[i];
        const d = Math.hypot(dx, dz) || 1;
        const s = 6 + run[i] * 3;
        vx[i] += (dx / d * s - vx[i]) * Math.min(1, dt * 6); vz[i] += (dz / d * s - vz[i]) * Math.min(1, dt * 6);
        px[i] += vx[i] * dt; pz[i] += vz[i] * dt;
        if (map.pushOut) { map.pushOut(px[i], pz[i], 0.34 * figScale, tmp); if (tmp.hit) { px[i] = tmp.x; pz[i] = tmp.z; } }
        gait[i] = 1; phase[i] += dt * 10;
        yaw[i] = angLerp(yaw[i], Math.atan2(vx[i], vz[i]), Math.min(1, dt * 10));
        if (d < c.visR * 0.55) scaleT[i] = 0;
        if (scale[i] < 0.03 && scaleT[i] === 0) release(i);
      } else if (k === F_DYING) {
        if (scale[i] < 0.03) release(i);
      }
    }
  }
  function release(i) { kind[i] = F_FREE; scale[i] = 0; pend[i] = 0; free.push(i); }

  function update(state, alpha, dt) {
    time += dt;
    if (!crowds.length) return;
    snapshot(state);
    allocate(state);
    updateCrowds(state, alpha, dt);
    syncNeutrals(state, alpha, dt);
    updateLoose(dt);
  }

  // view: ground quad of the screen (4 points, counter-clockwise or clockwise), or null = draw everything
  let view = null;
  const vn = new Float32Array(12);
  function setView(q, margin) {
    if (!q) { view = null; return; }
    let area = 0;
    for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4];
      let nx = (b[1] - a[1]) * sgn, nz = -(b[0] - a[0]) * sgn;
      const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
      vn[k * 3] = nx; vn[k * 3 + 1] = nz; vn[k * 3 + 2] = nx * a[0] + nz * a[1] + margin;
    }
    view = vn;
  }
  const inView = (x, z, r = 0) => !view || (
    view[0] * x + view[1] * z <= view[2] + r && view[3] * x + view[4] * z <= view[5] + r &&
    view[6] * x + view[7] * z <= view[8] + r && view[9] * x + view[10] * z <= view[11] + r);

  const hatOf = new Uint8Array(cap);
  const SKIP = 255;
  function write(dt) {
    const d = people.data;
    let n = 0, cf = 0, nf = 0, culled = 0;
    const cl = 1 - Math.exp(-dt * 4.5);
    const kUp = 1 - Math.exp(-dt * 9), kDown = 1 - Math.exp(-dt * 14);
    const fl = Math.exp(-dt * 4);
    let newHi = 0;
    for (const c of crowds) {
      if (!c) continue;
      c.onScreen = c.alive && inView(c.x, c.z, c.visR + 6);
      c.leadFig = c.alive && c.figs.length ? c.figs[0] : -1;
    }
    const put = (i) => {
      const o = n * STRIDE;
      const hc = owner[i] >= 0 && kind[i] === F_CROWD ? crowds[owner[i]] : null;
      const h = hop[i] > 0 ? Math.sin((hop[i] / 0.3) * Math.PI) * 0.35 : 0;
      d[o] = px[i]; d[o + 1] = Math.max(0, h); d[o + 2] = pz[i]; d[o + 3] = yaw[i];
      d[o + 4] = phase[i] % 628.3185; d[o + 5] = gait[i] + (hc && hc.horde ? 2 : 0); d[o + 6] = hatOf[i] + Math.min(look[i], 0.999); d[o + 7] = flash[i];
      d[o + 8] = cr[i]; d[o + 9] = cg[i]; d[o + 10] = cb[i]; d[o + 11] = scale[i];
      n++;
    };
    for (let i = 0; i < hi; i++) {
      const k = kind[i];
      hatOf[i] = SKIP;
      if (k === F_FREE) continue;
      newHi = i + 1;
      scale[i] += (scaleT[i] - scale[i]) * (scaleT[i] < scale[i] ? kDown : kUp);
      if (run[i] > 0) run[i] = Math.max(0, run[i] - dt);
      flash[i] *= fl;
      hop[i] = Math.max(0, hop[i] - dt);
      if (pend[i]) {
        wave[i] -= dt;
        if (wave[i] <= 0) {
          pend[i] = 0;
          const oc = owner[i] >= 0 ? crowds[owner[i]] : null;
          if (oc && (k === F_CROWD || k === F_ABSORB)) { setColor(i, teamShade(oc, look[i], shade), false); flash[i] = Math.max(flash[i], 0.6); hop[i] = 0.25; }
        }
      }
      cr[i] += (tr[i] - cr[i]) * cl; cg[i] += (tg[i] - cg[i]) * cl; cb[i] += (tb[i] - cb[i]) * cl;
      if (scale[i] < 0.01) continue;
      if (!inView(px[i], pz[i])) { culled++; continue; }
      let hat = 0;
      const c = owner[i] >= 0 ? crowds[owner[i]] : null;
      if (c && k !== F_NEUTRAL) {
        const lead = c.leadFig === i;
        if (lead && c.cos.leader) continue;
        const cos = c.cos;
        if (cos.hat && (lead || (!cos.hatLeaderOnly && ((look[i] * 53.71) % 1) < cos.hatShare))) hat = cos.hat;
      }
      if (k === F_NEUTRAL) nf++; else cf++;
      hatOf[i] = hat;
      if (hat) put(i);
    }
    const nh = n;
    for (let i = 0; i < newHi; i++) if (hatOf[i] === 0) put(i);
    hi = newHi;
    people.setCount(n);
    stats.drawn = n; stats.crowdFigs = cf; stats.neutralFigs = nf; stats.hats = nh; stats.culled = culled;
    return nh;
  }

  // state of a crowd's leader figure, for the hero mesh
  function leaderState(c, out) {
    const f = c.leadFig;
    if (f == null || f < 0 || kind[f] === F_FREE) return null;
    out.x = px[f]; out.z = pz[f]; out.y = hop[f] > 0 ? Math.max(0, Math.sin((hop[f] / 0.3) * Math.PI) * 0.35) : 0;
    out.yaw = yaw[f]; out.phase = phase[f] % 628.3185; out.gait = gait[f]; out.look = Math.min(look[f], 0.999); out.flash = flash[f];
    out.scale = scale[f];
    return out;
  }

  return {
    setCrowds, update, write, crowdAt, crowds, stats, setView, inView, leaderState,
    onRecruit, onSteal, onElim, onRespawn,
    setBudget(b) { budget = b; },
    updateMeta,
    setProps(extra) { baseProps(extra); },
    setNeutralPalette(list) {
      NEUTRALS = list ? list.map((h) => new THREE.Color(h)) : NEUTRAL_DEFAULT;
      for (let i = 0; i < hi; i++) if (kind[i] === F_NEUTRAL) setColor(i, NEUTRALS[Math.min(7, (look[i] * 8) | 0)], true);
    },
    setFigScale(v) { figScale = v; },
    figPos(f) { return [px[f], pz[f]]; },
  };
}

function angLerp(a, b, t) {
  let d = b - a;
  if (d > Math.PI || d < -Math.PI) d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const r = a + d * t;
  return r > 50 || r < -50 ? r % (Math.PI * 2) : r;
}
