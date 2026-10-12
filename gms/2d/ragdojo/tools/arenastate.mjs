#!/usr/bin/env node
/**
 * Keyframes are complete: a PvP Match rebuilt on another machine from one matchState() must
 * carry on as the same fight. This is what host migration will stand on. Also: wire.js
 * round-trips a snapshot, and verdict() agrees with itself on quantised HP.
 *
 *   node tools/arenastate.mjs
 */
const noopCtx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }), fonts: { ready: Promise.resolve() } };
globalThis.window = globalThis;
globalThis.location = { search: '', hostname: 'node' };
const { PvpMatch, matchState, applyState, pvpSave, arenaLevel } = await import('../js/net/fight.js');
const W = await import('../js/net/wire.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; process.stderr.write(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}\n`); };
const make = () => new PvpMatch({ level: { ...arenaLevel(3) }, saves: [pvpSave([0, 1, 3]), pvpSave([0, 2])], you: 0,
  seats: [{ name: 'A' }, { name: 'B' }] });

// Play a scrappy fight for a while: walking in, strikes, specials, a toss in the air.
const m = make();
m.begin();
let t = 0;
for (let i = 0; i < 120 * 9; i++, t += 1 / 120) {
  const [a, b] = m.all;
  if (m.phase === W.PHASE.FIGHT) {
    a.move(Math.sign(b.x - a.x), 1 / 120); b.move(Math.sign(a.x - b.x), 1 / 120);
    const close = Math.abs(a.x - b.x) < 90;
    if (close && i % 37 === 0) m.act(0, W.ACT.STRIKE);
    if (close && i % 53 === 0) m.act(1, W.ACT.STRIKE);
    if (i % 301 === 0) m.act(0, W.ACT.SPECIAL + 1);
    if (close && i % 401 === 0) m.act(1, W.ACT.SPECIAL + 0);
  }
  m.update(1 / 120);
}
ok('the fight went somewhere', m.phase === W.PHASE.FIGHT && m.all.some((f) => f.hp < f.maxHp), m.all.map((f) => f.hp.toFixed(1)).join(' / '));

// Key it mid-action: one fighter in the air, the other halfway through a swing.
for (let i = 0; i < 600 && !(!m.all[0].onGround && m.all[0].vy < 0 && m.all[1].attack); i++) {
  if (m.all[0].canAct && m.all[0].onGround) m.act(0, W.ACT.JUMP);
  if (m.all[1].canAct) m.act(1, W.ACT.STRIKE);
  m.update(1 / 120);
}
ok('keyframe taken mid-action', !m.all[0].onGround && !!m.all[1].attack);
const st = JSON.parse(JSON.stringify(matchState(m)));
const r = make();
applyState(r, st);
const again = JSON.parse(JSON.stringify(matchState(r)));
ok('a rebuilt match reproduces the keyframe exactly', JSON.stringify(again) === JSON.stringify(st));

// The ORIGINAL against its rebuild, in lockstep, compared EVERY tick: the ragdoll forgets a
// wrong velocity within a second, so checking only at the end misses it. Math.random is pinned
// to the same sequence for both, so an exact keyframe gives zero divergence.
const rng = () => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const rm = rng(), rr = rng();
let d = 0;
for (let i = 0; i < 240; i++) {
  for (const [mm, rand] of [[m, rm], [r, rr]]) {
    Math.random = rand;
    const [a, b] = mm.all; a.move(1, 1 / 120); b.move(-1, 1 / 120);
    if (i % 30 === 0) mm.act(0, W.ACT.STRIKE);
    if (i % 45 === 0) mm.act(1, W.ACT.STRIKE);
    mm.update(1 / 120);
  }
  d = Math.max(d, ...m.all.flatMap((f, k) => [Math.abs(f.x - r.all[k].x), Math.abs(f.hp - r.all[k].hp),
    ...Array.from(f.rag.x, (v, q) => Math.abs(v - r.all[k].rag.x[q])), ...Array.from(f.rag.y, (v, q) => Math.abs(v - r.all[k].rag.y[q]))]));
}
ok('the rebuild and the original, in lockstep, stay the same fight every tick for 2 s', d < 1e-6, `max divergence ${d}`);
ok('and stay finite', r.all.every((f) => Number.isFinite(f.x) && Array.from(f.rag.y).every(Number.isFinite)));

// The 30/s snapshot round-trips at 1/8 unit.
const fs = m.all.map((f, i) => ({ slot: i, f, ack: 99, cds: [1, 2, 0, 0, 0, 0, 0, 0] }));
const s = W.unSnap(W.snap(5, 12.5, m.phase, m.clock, false, fs, m.projectiles.map((p, k) => Object.assign(p, { netId: k, ownerSlot: 0 }))));
const pe = Math.max(...s.fighters.flatMap((F, i) => Array.from(F.pts, (v, k) => Math.abs(v - (k % 2 ? m.all[i].rag.y[k >> 1] : m.all[i].rag.x[k >> 1])))));
ok('snapshot points survive the wire within 1/16 unit', pe <= 1 / 16 + 1e-9, `max ${pe}`);
ok('snapshot HP and ack survive', s.fighters.every((F, i) => Math.abs(F.hp - m.all[i].hp) <= 0.05 && F.ack === 99));
ok('verdict: last one standing wins by KO', JSON.stringify(W.verdict([{ slot: 0, hp: 0, dead: true }, { slot: 1, hp: 3, dead: false }], false)) === '{"winner":1,"ko":true}');
ok('verdict: time up goes to more HP, a tie is a draw', W.verdict([{ slot: 0, hp: 40, dead: false }, { slot: 1, hp: 39.9, dead: false }], true).winner === 0 &&
  W.verdict([{ slot: 0, hp: 40, dead: false }, { slot: 1, hp: 40.04, dead: false }], true).winner === -1);
process.stderr.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
