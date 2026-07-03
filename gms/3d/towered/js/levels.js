// Level loading (built-in / custom / editor-test), path curve building + cell
// rasterisation, and player progress (stars, unlocks, one-time tips).

import * as THREE from 'three';
import { CELL, ENEMIES, THEMES } from './config.js';

const LS_CUSTOM = 'towered-custom';
const LS_PROGRESS = 'towered-progress';
const SS_TEST = 'towered-test';

// ── cell/world math ──────────────────────────────────────────────────────────
export const cellToWorld = (level, cx, cz) => ({
  x: (cx - (level.grid.w - 1) / 2) * CELL,
  z: (cz - (level.grid.h - 1) / 2) * CELL,
});
export const worldToCell = (level, x, z) => ({
  cx: Math.round(x / CELL + (level.grid.w - 1) / 2),
  cz: Math.round(z / CELL + (level.grid.h - 1) / 2),
});
export const inGrid = (level, cx, cz) =>
  cx >= 0 && cz >= 0 && cx < level.grid.w && cz < level.grid.h;
export const cellKey = (cx, cz) => `${cx},${cz}`;

// ── path curve ───────────────────────────────────────────────────────────────
// Thread a centripetal Catmull-Rom through the waypoints, extended ~1.4 cells
// past both ends (enemies emerge from the gate and disappear into the castle).
// Returns { pts, cum, total, posAt(s, pos, tan), start, end }.
export function buildCurve(level, pathIdx = 0) {
  const wps = level.paths[pathIdx].map(([cx, cz]) => {
    const { x, z } = cellToWorld(level, cx, cz);
    return new THREE.Vector3(x, 0, z);
  });
  const ext = CELL * 1.4;
  const d0 = wps[0].clone().sub(wps[1]).normalize();
  const dn = wps[wps.length - 1].clone().sub(wps[wps.length - 2]).normalize();
  const pre = wps[0].clone().addScaledVector(d0, ext);
  const post = wps[wps.length - 1].clone().addScaledVector(dn, ext);
  const curve = new THREE.CatmullRomCurve3([pre, ...wps, post], false, 'centripetal');

  const divisions = Math.max(64, Math.ceil(curve.getLength() * 4));
  const pts = curve.getSpacedPoints(divisions);
  const cum = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);
  const total = cum[pts.length - 1];

  function posAt(s, pos, tan) {
    const t = Math.min(Math.max(s, 0), total);
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; (cum[mid] <= t) ? lo = mid : hi = mid; }
    const span = cum[hi] - cum[lo] || 1;
    const f = (t - cum[lo]) / span;
    pos.lerpVectors(pts[lo], pts[hi], f);
    if (tan) tan.subVectors(pts[hi], pts[lo]).normalize();
    return pos;
  }
  return { pts, cum, total, posAt, start: wps[0], end: wps[wps.length - 1], gateDir: d0, castleDir: dn.clone().negate() };
}

// Cells the road covers (blocked for building): any cell centre within reach
// of the sampled centreline.
export function rasterizePaths(level, curves) {
  const set = new Set();
  const reach = CELL * 0.72;
  for (const curve of curves) {
    for (const p of curve.pts) {
      const { cx, cz } = worldToCell(level, p.x, p.z);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const nx = cx + dx, nz = cz + dz;
        if (!inGrid(level, nx, nz) || set.has(cellKey(nx, nz))) continue;
        const { x, z } = cellToWorld(level, nx, nz);
        if (Math.hypot(x - p.x, z - p.z) < reach) set.add(cellKey(nx, nz));
      }
    }
  }
  return set;
}

// ── loading ──────────────────────────────────────────────────────────────────
// levels/index.json is an array of { id, name } (name shown in level select
// without fetching all 20 level files).
let builtinIndex = null;
const cache = new Map();

export async function loadBuiltinIndex() {
  if (!builtinIndex) builtinIndex = await fetch('levels/index.json').then(r => r.json());
  return builtinIndex;
}
export async function loadBuiltin(id) {
  if (!cache.has(id)) cache.set(id, await fetch(`levels/${id}.json`).then(r => r.json()));
  return cache.get(id);
}
export async function loadBuiltinByNumber(n) {
  const idx = await loadBuiltinIndex();
  return loadBuiltin(idx[n - 1].id);
}

export function customLevels() {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM)) || {}; } catch { return {}; }
}
export function saveCustomLevel(level) {
  const all = customLevels();
  all[level.id] = level;
  localStorage.setItem(LS_CUSTOM, JSON.stringify(all));
}
export function deleteCustomLevel(id) {
  const all = customLevels();
  delete all[id];
  localStorage.setItem(LS_CUSTOM, JSON.stringify(all));
}

export function setTestLevel(level) { sessionStorage.setItem(SS_TEST, JSON.stringify(level)); }
export function getTestLevel() {
  try { return JSON.parse(sessionStorage.getItem(SS_TEST)); } catch { return null; }
}

// ── validation (shared by game + editor) ────────────────────────────────────
export function validateLevel(l) {
  const errs = [];
  if (!l || typeof l !== 'object') return ['not an object'];
  if (!l.id) errs.push('missing id');
  if (!l.grid || !(l.grid.w >= 8 && l.grid.w <= 32) || !(l.grid.h >= 6 && l.grid.h <= 24))
    errs.push('grid must be 8–32 × 6–24');
  if (!THEMES[l.theme]) errs.push(`unknown theme "${l.theme}"`);
  if (!Array.isArray(l.paths) || !l.paths.length) errs.push('needs at least one path');
  else l.paths.forEach((p, i) => {
    if (!Array.isArray(p) || p.length < 2) errs.push(`path ${i + 1} needs ≥ 2 waypoints`);
    else for (const wp of p)
      if (!Array.isArray(wp) || !inGrid(l, wp[0], wp[1])) { errs.push(`path ${i + 1} leaves the grid`); break; }
  });
  if (!(l.gold > 0)) errs.push('starting gold must be > 0');
  if (!(l.lives > 0)) errs.push('lives must be > 0');
  if (!Array.isArray(l.waves) || !l.waves.length) errs.push('needs at least one wave');
  else l.waves.forEach((w, i) => {
    if (!Array.isArray(w.groups) || !w.groups.length) errs.push(`wave ${i + 1} is empty`);
    else for (const g of w.groups) {
      if (!ENEMIES[g.type]) { errs.push(`wave ${i + 1}: unknown enemy "${g.type}"`); break; }
      if (!(g.n >= 1)) { errs.push(`wave ${i + 1}: bad count`); break; }
      if ((g.path || 0) >= l.paths.length) { errs.push(`wave ${i + 1}: path ${g.path + 1} doesn't exist`); break; }
    }
  });
  return errs;
}

// ── progress ─────────────────────────────────────────────────────────────────
let prog = null;
export function progress() {
  if (!prog) {
    try { prog = JSON.parse(localStorage.getItem(LS_PROGRESS)) || {}; } catch { prog = {}; }
    prog.stars ||= {}; prog.tips ||= {};
  }
  return prog;
}
export function saveProgress() {
  if (!new URLSearchParams(location.search).has('nosave'))
    localStorage.setItem(LS_PROGRESS, JSON.stringify(progress()));
}
export function starsFor(id) { return progress().stars[id] || 0; }
export function recordWin(id, stars) {
  const p = progress();
  if (stars > (p.stars[id] || 0)) p.stars[id] = stars;
  saveProgress();
}
// level n unlocked if n===1 or level n-1 has ≥1 star
export function isUnlocked(index, n) { return n === 1 || starsFor(index[n - 2].id) > 0; }

export function tipSeen(key) { return !!progress().tips[key]; }
export function markTip(key) { progress().tips[key] = 1; saveProgress(); }
