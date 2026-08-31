#!/usr/bin/env node
/**
 * No fighter position may ever go non-finite. A NaN x is silent — no error, no crash — but
 * the fighter drops out of every hit test and the fight can never end, so it reads as
 * "this level times out". Runs every level that carries a hazard.
 *
 *   node tools/nangate.mjs
 *   node tools/nangate.mjs --falsify   # restore the old unguarded dodge and watch it go red
 */
const noopCtx = new Proxy({}, { get: (t, k) => {
  if (k === 'canvas') return { width: 0, height: 0 };
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
  return () => {};
}, set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }), fonts: { ready: Promise.resolve() } };
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);

const { Match } = await import('../js/match.js');
const { LEVELS, MOVES, PERKS } = await import('../js/config.js');
const { DEFAULT } = await import('../js/save.js');
const { NPTS } = await import('../js/ragdoll.js');
const falsify = process.argv.includes('--falsify');

const DT = 1 / 120;
const hazardLevels = LEVELS.filter((l) => l.event);
const kinds = [...new Set(hazardLevels.map((l) => l.event))];
console.log(`checking ${hazardLevels.length} hazard levels covering: ${kinds.join(', ')}\n`);

let bad = 0, checked = 0;
for (const L of hazardLevels) {
  const save = DEFAULT();
  save.level = L.idx;
  for (const m of MOVES) save.moves[m.id] = { owned: true, power: 4, cd: 4 };
  for (const p of PERKS) save.perks[p.id] = Math.round(p.max * 0.8);
  let hit = null;
  for (let run = 0; run < 2 && !hit; run++) {
    const m = new Match({ level: L, save, autoplay: true, onEnd: () => {} });
    if (falsify) {
      // The bug as it shipped: hazards with no .x hand the AI an undefined to steer by.
      for (const b of [...m.brains, m.playerBrain].filter(Boolean)) {
        const orig = b.update.bind(b);
        b.update = (dt, info) => {
          for (const h of info.hazards || []) {
            if (h.threatens && h.threatens(b.f.x)) b.f.vx += (h.x - b.f.x) * 0;
          }
          return orig(dt, info);
        };
      }
    }
    let t = 0;
    while (!m.over && t < 60 && !hit) {
      m.update(DT, null);
      t += DT;
      for (const f of m.all) {
        let ragBad = false;
        for (let k = 0; k < NPTS; k++) if (!Number.isFinite(f.rag.x[k]) || !Number.isFinite(f.rag.y[k])) { ragBad = true; break; }
        if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.vx) || !Number.isFinite(f.vy) || ragBad) {
          hit = `${f.isPlayer ? 'PLAYER' : f.name} at ${t.toFixed(1)}s (x=${f.x} vx=${f.vx} rag=${ragBad ? 'NaN' : 'ok'})`;
        }
      }
    }
    checked++;
  }
  if (hit) { bad++; console.log(`FAIL  level ${String(L.idx).padStart(2)} ${L.event.padEnd(9)} ${hit}`); }
}
console.log(bad ? `\n${bad} level(s) produced a non-finite position` : `\nall ${checked} runs finite — no level can silently drop a fighter out of the fight`);
process.exit(bad ? 1 : 0);
