import { PLOTS, STREET } from '../data/plots.js?v=20261004c';

import { LINES } from '../data/lines.js?v=20261004c';

// Each business row picks its actor kind (data/lines.js `actor`).
export const KIND_BY_LINE = Object.fromEntries(LINES.map((l) => [l.id, l.actor || 'walker']));
// plotSec: time on the plot's exit path; speed m/s on the road; gap: min seconds between departures per line.
export const SPEC = {
  walker: { plotSec: 4.5, speed: 1.7, gap: 3, trip: [16, 34] },
  courier: { plotSec: 2.2, speed: 6.5, gap: 5, trip: [70, 170] },
  van: { plotSec: 2.6, speed: 8, gap: 7, trip: [60, 150] },
  boat: { plotSec: 4, speed: 3.2, gap: 12, trip: [36, 70] },
  drone: { plotSec: 2.4, speed: 9, gap: 5, trip: [60, 130] },
};
const MAX = 64, RESERVE = 8, PER_LINE = 6, HALF_W = 12;

const plotX = Object.fromEntries(PLOTS.map((p) => [p.id, p.x]));

function hash(n) {
  let t = (n + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function routeFor(lineId, kind, seq) {
  const spec = SPEC[kind];
  const x0 = (plotX[lineId] ?? 0) + HALF_W;
  const lo = STREET.x0 + 4, hi = STREET.x1 - 4;
  const r1 = hash(seq * 7 + 1), r2 = hash(seq * 13 + 5);
  let x1;
  if (kind === 'walker' || kind === 'boat') {
    const len = spec.trip[0] + (spec.trip[1] - spec.trip[0]) * r1;
    x1 = x0 + (r2 < 0.5 ? -len : len);
    if (kind === 'walker' && (x1 < lo || x1 > hi)) x1 = x0 + (x1 < lo ? len : -len);
  } else {
    const cands = [];
    for (const p of PLOTS) {
      const gx = p.x + HALF_W - 2, d = Math.abs(gx - x0);
      if (p.id !== lineId && d >= spec.trip[0] && d <= spec.trip[1]) cands.push(gx);
    }
    x1 = cands.length ? cands[Math.floor(r1 * cands.length)] : (x0 - lo > hi - x0 ? lo : hi);
  }
  return { x0, x1, roadSec: 1.2 + Math.abs(x1 - x0) / spec.speed };
}

export function createShipments(game, data) {
  const pool = [];
  const list = [];
  const pending = [];
  const nextAt = {}, carry = {}, live = {};
  const lineById = Object.fromEntries(data.lines.map((l) => [l.id, l]));
  let seq = 0;

  const t = () => game.simTime ?? 0;
  const gapFor = (lineId) => Math.max(SPEC[KIND_BY_LINE[lineId] || 'walker'].gap, (lineById[lineId]?.cycleSec || 0) * 0.9);

  game.on('produced', (e) => {
    const ls = game.state.lines[e.lineId];
    if (!ls || !ls.mgr) return;
    const now = t();
    carry[e.lineId] = (carry[e.lineId] || 0) + (e.units || 1);
    if (now < (nextAt[e.lineId] ?? -Infinity)) return;
    nextAt[e.lineId] = now + gapFor(e.lineId);
    pending.push({ lineId: e.lineId, units: carry[e.lineId], at: now });
    carry[e.lineId] = 0;
  });
  game.on('pileSold', (e) => {
    const now = t(), kind = KIND_BY_LINE[e.lineId] || 'walker';
    const n = kind === 'walker' ? 3 : 1;
    for (let i = 0; i < n; i++) pending.push({ lineId: e.lineId, units: 1, at: now + i * 0.7, sold: true });
  });
  // Economy-scheduled tips (L1 `courier:spawn`) each get their own courier crossing town; only those are tappable.
  game.on('courier:spawn', (e) => spawnTip(e.courier, t()));
  const untip = (id) => { for (const s of list) if (s.tipId === id) { s.tipped = true; s.pick = false; } };
  game.on('courier:gone', (e) => untip(e.courier?.id));
  game.on('courier:tap', (e) => untip(e.courier?.id));
  game.on('courierTap', (e) => api.tip(e.shipmentId));

  function spawnTip(c, now) {
    if (!c || list.some((s) => s.tipId === c.id)) return null;
    const s = spawn(c.lineId, 1, Math.min(now, c.t0 ?? now), 'courier', true);
    if (s) { s.tipId = c.id; s.pick = true; }
    return s;
  }

  // Ambient traffic stays under MAX - RESERVE and thins per line as lines grow; tips evict the oldest ambient one.
  const perLine = () => {
    let n = 0;
    for (const id in game.state.lines) if (game.state.lines[id]?.mgr) n++;
    return Math.max(2, Math.min(PER_LINE, Math.floor((MAX - RESERVE) / Math.max(1, n))));
  };
  function evictOldest() {
    let j = -1;
    for (let i = 0; i < list.length; i++) if (!list[i].tipId && (j < 0 || list[i].tDepart < list[j].tDepart)) j = i;
    if (j < 0) return false;
    drop(j);
    return true;
  }

  function spawn(lineId, units, tDepart, forceKind = null, force = false) {
    if (force) { if (list.length >= MAX && !evictOldest()) return null; }
    else if (list.length >= MAX - RESERVE || (live[lineId] || 0) >= perLine()) return null;
    const kind = forceKind || KIND_BY_LINE[lineId] || 'walker';
    const spec = SPEC[kind];
    const s = pool.pop() || {};
    s.id = ++seq;
    s.lineId = lineId;
    s.units = units;
    s.kind = kind;
    s.tipped = false;
    s.tipId = null;
    const r = routeFor(lineId, kind, s.id);
    s.x0 = r.x0;
    s.x1 = r.x1;
    s.dest = r.x1 > r.x0 ? 'east' : 'west';
    s.tDepart = tDepart;
    s.tExit = tDepart + spec.plotSec;
    s.tArrive = s.tExit + r.roadSec;
    s.pick = false;
    list.push(s);
    live[lineId] = (live[lineId] || 0) + 1;
    return s;
  }

  function drop(i) {
    const [s] = list.splice(i, 1);
    live[s.lineId]--;
    pool.push(s);
  }

  const api = {
    list,
    game,
    MAX,
    RESERVE,
    update(simTime) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i];
        if (p.at > simTime + 0.001) continue;
        spawn(p.lineId, p.units, p.at);
        pending.splice(i, 1);
      }
      for (let i = list.length - 1; i >= 0; i--) if (list[i].tArrive <= simTime) drop(i);
    },
    reseed(simTime) {
      while (list.length) drop(list.length - 1);
      pending.length = 0;
      for (const l of data.lines) {
        const ls = game.state.lines[l.id];
        if (!ls || !(ls.lv > 0) || !ls.mgr) continue;
        const gap = gapFor(l.id);
        const phase = hash(seq + l.id.length * 31) * gap;
        for (let k = 0, n = perLine(); k < n; k++) {
          const s = spawn(l.id, 1, simTime - phase - k * gap);
          if (!s) break;
          if (s.tArrive <= simTime) { drop(list.indexOf(s)); break; }
        }
        nextAt[l.id] = simTime - phase + gap;
        carry[l.id] = 0;
      }
      for (const c of game.state.couriers || []) if (c.t1 > simTime) spawnTip(c, simTime);
    },
    tip(id) {
      const s = list.find((x) => x.id === id);
      if (!s || s.tipped) return false;
      s.tipped = true;
      s.pick = false;
      return true;
    },
    place(s, simTime, out = {}) {
      if (simTime >= s.tArrive) { out.stage = 'arrived'; out.u = 1; }
      else if (simTime < s.tExit) { out.stage = 'plot'; out.u = Math.max(0, (simTime - s.tDepart) / (s.tExit - s.tDepart)); }
      else { out.stage = 'road'; out.u = (simTime - s.tExit) / (s.tArrive - s.tExit); }
      return out;
    },
  };
  return api;
}
