#!/usr/bin/env node
/**
 * Diagnostic, not a gate. Plays real autoplay fights and records every moment the player
 * swaps sides with the enemy, together with the state that allowed it — so the cause is
 * measured rather than guessed at.
 *
 *   node tools/crosslog.mjs [--level=N] [--runs=N]
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
const { LEVELS, MOVES } = await import('../js/config.js');
const { DEFAULT } = await import('../js/save.js');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const RUNS = +(args.runs || 12);
const DT = 1 / 60;

const causes = new Map();
const bump = (k) => causes.set(k, (causes.get(k) || 0) + 1);
let fights = 0, crossings = 0;

function run(levelIdx) {
  const save = DEFAULT();
  for (const m of MOVES) save.moves[m.id] = { owned: true, power: 3, cd: 3 };
  for (const p of ['hp', 'atk', 'spd', 'jump']) save.perks[p] = 3;
  const m = new Match({ level: LEVELS[levelIdx], save, autoplay: true, onEnd: () => {} });
  const P = m.player;
  const near = () => m.aliveEnemies[0] || m.enemies[0];
  // Use the same position the collision uses. A floored fighter's `x` is frozen where it
  // fell and snaps to the ragdoll on getup, so reading `x` directly reports that snap as a
  // crossing — the metric would be measuring its own artifact rather than the game.
  const px = (f) => m.bodyX(f);
  let side = Math.sign(px(P) - px(near())) || 1;
  for (let t = 0; t < 90 && !m.over; t += DT) {
    const eBefore = near();
    m.update(DT, null);
    const e = near();
    if (e !== eBefore) { side = Math.sign(px(P) - px(e)) || side; continue; }
    const now = Math.sign(px(P) - px(e)) || side;
    if (now !== side) {
      side = now;
      crossings++;
      // Whichever body actually moved through the other decides the label.
      // Caveat: a floored fighter's vx is not updated (the ragdoll drives it), so a body
      // sailing over someone is credited to whoever is still on their feet. Read the
      // "other mid-tumble" rows as ragdoll flight, not as that attack carrying anyone.
      const who = Math.abs(P.vx) > Math.abs(e.vx) ? 'player' : 'enemy';
      const st = who === 'player' ? P : e;
      const other = who === 'player' ? e : P;
      const how = st.mode === 'down' || st.mode === 'dead' ? 'ragdoll tumble'
        : !st.onGround ? `airborne${st.attack ? ' (' + st.attack.key + ')' : ''}`
        : st.attack ? `attack ${st.attack.key}`
        : `walked (mode=${st.mode})`;
      const ostate = other.mode === 'down' && !other.rag.grounded ? 'other mid-tumble'
        : other.mode === 'down' ? 'other floored'
        : other.mode === 'dead' ? 'other dead'
        : !other.onGround ? 'other airborne'
        : `other ${other.mode}`;
      bump(`${who} ${how}  |  ${ostate}`);
    }
  }
  fights++;
}

const levels = args.level !== undefined ? [+args.level] : [2, 8, 13, 18, 23, 28, 33, 38, 43, 44];
for (const L of levels) for (let i = 0; i < RUNS; i++) run(L);

console.log(`${fights} fights, ${crossings} side swaps (${(crossings / fights).toFixed(1)} per fight)\n`);
for (const [k, v] of [...causes].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(v).padStart(5)}  ${(100 * v / crossings).toFixed(1).padStart(5)}%  ${k}`);
}
