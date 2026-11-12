import * as THREE from 'three';
import { STRIDE } from './people.js';

const GOLDEN = 2.399963229728653;
const NEUTRAL_SHIRTS = [0xf4f3ef, 0xdcdcd8, 0xc3c6c9, 0xebe2d0, 0xa3a7ac, 0xffffff, 0xd2cbbd, 0x8d939b].map((h) => new THREE.Color(h));
const F_FREE = 0, F_CROWD = 1, F_NEUTRAL = 2, F_DYING = 3, F_ABSORB = 4;

export function createCrowdSystem(people, map) {
  const cap = people.capacity;
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
  let hi = 0;
  const tmp = { x: 0, z: 0, hit: false };

  const crowds = [];
  const PC = 4, POFF = 200, PN = 100;
  const props = Array.from({ length: PN * PN }, () => null);
  const addProp = (x, z, r) => {
    const i0 = Math.floor((x - r + POFF) / PC), i1 = Math.floor((x + r + POFF) / PC);
    const j0 = Math.floor((z - r + POFF) / PC), j1 = Math.floor((z + r + POFF) / PC);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (i < 0 || j < 0 || i >= PN || j >= PN) continue;
      (props[j * PN + i] ||= []).push(x, z, r);
    }
  };
  for (const t of map.trees || []) addProp(t.x, t.z, 0.45 + 0.35 * t.s);
  for (const l of map.lamps || []) addProp(l.x, l.z, l.grand ? 0.75 : 0.4);
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
  let time = 0;
  const stats = { drawn: 0, crowdFigs: 0, neutralFigs: 0, popIn: 0, popOut: 0, recruits: 0, transfers: 0 };

  function alloc(x, z, look0) {
    const i = free.pop();
    if (i === undefined) return -1;
    px[i] = x; pz[i] = z; py[i] = 0; vx[i] = 0; vz[i] = 0;
    yaw[i] = Math.random() * Math.PI * 2; phase[i] = Math.random() * 6.28; gait[i] = 0;
    look[i] = look0 ?? Math.random(); flash[i] = 0; hop[i] = 0;
    scale[i] = 0; scaleT[i] = 1; run[i] = 0; owner[i] = -1;
    if (i + 1 > hi) hi = i + 1;
    return i;
  }
  function kill(i) { kind[i] = F_DYING; scaleT[i] = 0; }
  function setColor(i, c, instant) {
    tr[i] = c.r; tg[i] = c.g; tb[i] = c.b;
    if (instant) { cr[i] = c.r; cg[i] = c.g; cb[i] = c.b; }
  }
  function teamShade(c, lk, out) {
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
      const col = new THREE.Color(m.color);
      const hsl = {}; col.getHSL(hsl, THREE.SRGBColorSpace);
      col.setHSL(hsl.h, Math.max(0.85, hsl.s), Math.min(0.56, Math.max(0.46, hsl.l)), THREE.SRGBColorSpace);
      crowds[m.index] = {
        index: m.index, color: col, figs: [], alive: false,
        x: 0, z: 0, prevX: 0, prevZ: 0, curX: 0, curZ: 0, vx: 0, vz: 0, heading: 0,
        radius: 1, visR: 1, count: 0, want: 0, stealAcc: 0, vScale: 1, seen: false,
      };
    }
  }

  function crowdAt(i) { return crowds[i]; }

  function joinCrowd(f, c, fromColor = true) {
    kind[f] = F_CROWD; owner[f] = c.index;
    c.figs.push(f);
    setColor(f, teamShade(c.color, look[f], shade), !fromColor);
  }
  function absorbInto(f, c) {
    kind[f] = F_ABSORB; owner[f] = c.index;
    setColor(f, teamShade(c.color, look[f], shade), false);
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
      setColor(f, NEUTRAL_SHIRTS[Math.min(7, (look[f] * 8) | 0)], true);
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
        setColor(f, NEUTRAL_SHIRTS[Math.min(7, (look[f] * 8) | 0)], true);
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
          teamShade(c.color, look[f], shade);
          const base = NEUTRAL_SHIRTS[Math.min(7, (look[f] * 8) | 0)];
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
      c.protect = sc.protect || 0; c.panic = sc.panic || 0; c.eating = sc.eating || 0;
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
      const R = c.visR * 0.9;
      const lsp = Math.hypot(c.vx, c.vz);
      const ldx = lsp > 0.3 ? c.vx / lsp : Math.sin(sc.heading || 0), ldz = lsp > 0.3 ? c.vz / lsp : Math.cos(sc.heading || 0);
      if (lsp > 0.3) c.heading = Math.atan2(c.vx, c.vz);
      for (let k = 0; k < N; k++) {
        const f = figs[k];
        if (k === 0) {
          px[f] = c.x; pz[f] = c.z; vx[f] = c.vx; vz[f] = c.vz;
          scaleT[f] = 1.35;
        } else {
          const u = k / N;
          const a = k * GOLDEN;
          let r = R * Math.sqrt(u);
          if (u > 0.45) {
            const ph = c.index * 1.7;
            const edge = 1 + 0.08 * Math.sin(3 * a + time * 0.45 + ph) + 0.05 * Math.sin(7 * a - time * 0.7 + ph) + 0.035 * Math.sin(12 * a + time * 1.1);
            const t = Math.min(1, (u - 0.45) / 0.4);
            r *= 1 + (edge - 1) * t;
            const h = (look[f] * 97.3) % 1;
            if (h < 0.06 && u > 0.6) r *= 1.1 + h * 2.5;
          }
          const jx = Math.sin(time * 0.7 + look[f] * 40) * 0.22, jz = Math.cos(time * 0.6 + look[f] * 23) * 0.22;
          const tx = c.x + Math.cos(a) * r + jx - c.vx * 0.06 * u, tz = c.z + Math.sin(a) * r + jz - c.vz * 0.06 * u;
          const kk = 2.6 - 1.2 * u;
          let dvx = c.vx * (1 - 0.12 * u) + (tx - px[f]) * kk;
          let dvz = c.vz * (1 - 0.12 * u) + (tz - pz[f]) * kk;
          const lim = lsp * 1.25 + 3.5 + run[f] * 5;
          const dl = Math.hypot(dvx, dvz);
          if (dl > lim) { dvx *= lim / dl; dvz *= lim / dl; }
          const bl = 1 - Math.exp(-dt * (run[f] > 0 ? 9 : 5));
          vx[f] += (dvx - vx[f]) * bl; vz[f] += (dvz - vz[f]) * bl;
          px[f] += vx[f] * dt; pz[f] += vz[f] * dt;
          if (map.pushOut) {
            map.pushOut(px[f], pz[f], 0.25, tmp);
            if (tmp.hit) { px[f] = tmp.x; pz[f] = tmp.z; }
          }
          propPush(f);
          scaleT[f] = c.vScale;
        }
        const sp = Math.hypot(vx[f], vz[f]);
        const g = Math.min(1, Math.max(0, (sp - 0.35) / 2.2));
        gait[f] += (g - gait[f]) * Math.min(1, dt * 5);
        phase[f] += dt * (4.5 + Math.min(sp, 9) * 0.85);
        const ty = sp > 0.6 ? Math.atan2(vx[f], vz[f]) : Math.atan2(ldx, ldz);
        yaw[f] = angLerp(yaw[f], ty, Math.min(1, dt * (sp > 0.6 ? 9 : 1.5)));
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
        gait[i] = 1; phase[i] += dt * 10;
        yaw[i] = angLerp(yaw[i], Math.atan2(vx[i], vz[i]), Math.min(1, dt * 10));
        if (d < c.visR * 0.55) scaleT[i] = 0;
        if (scale[i] < 0.03 && scaleT[i] === 0) release(i);
      } else if (k === F_DYING) {
        if (scale[i] < 0.03) release(i);
      }
    }
  }
  function release(i) { kind[i] = F_FREE; scale[i] = 0; free.push(i); }

  function update(state, alpha, dt) {
    time += dt;
    if (!crowds.length) return;
    snapshot(state);
    allocate(state);
    updateCrowds(state, alpha, dt);
    syncNeutrals(state, alpha, dt);
    updateLoose(dt);
  }

  function write(dt) {
    const d = people.data;
    let n = 0, cf = 0, nf = 0;
    const cl = 1 - Math.exp(-dt * 4.5);
    const kUp = 1 - Math.exp(-dt * 9), kDown = 1 - Math.exp(-dt * 14);
    const fl = Math.exp(-dt * 4);
    let newHi = 0;
    for (let i = 0; i < hi; i++) {
      const k = kind[i];
      if (k === F_FREE) continue;
      newHi = i + 1;
      scale[i] += (scaleT[i] - scale[i]) * (scaleT[i] < scale[i] ? kDown : kUp);
      if (run[i] > 0) run[i] = Math.max(0, run[i] - dt);
      flash[i] *= fl;
      hop[i] = Math.max(0, hop[i] - dt);
      cr[i] += (tr[i] - cr[i]) * cl; cg[i] += (tg[i] - cg[i]) * cl; cb[i] += (tb[i] - cb[i]) * cl;
      if (scale[i] < 0.01) continue;
      const o = n * STRIDE;
      const h = hop[i] > 0 ? Math.sin((hop[i] / 0.3) * Math.PI) * 0.35 : 0;
      d[o] = px[i]; d[o + 1] = Math.max(0, h); d[o + 2] = pz[i]; d[o + 3] = yaw[i];
      d[o + 4] = phase[i] % 628.3185; d[o + 5] = gait[i]; d[o + 6] = look[i]; d[o + 7] = flash[i];
      d[o + 8] = cr[i]; d[o + 9] = cg[i]; d[o + 10] = cb[i]; d[o + 11] = scale[i];
      n++;
      if (k === F_NEUTRAL) nf++; else cf++;
    }
    hi = newHi;
    people.setCount(n);
    stats.drawn = n; stats.crowdFigs = cf; stats.neutralFigs = nf;
    return n;
  }

  return {
    setCrowds, update, write, crowdAt, crowds, stats,
    onRecruit, onSteal, onElim, onRespawn,
    setBudget(b) { budget = b; },
    figPos(f) { return [px[f], pz[f]]; },
  };
}

function angLerp(a, b, t) {
  let d = b - a;
  d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
