#!/usr/bin/env node
/**
 * The fight roster must not repeat itself, within a run OR across refreshes.
 *   node tools/musicrota.mjs
 *   node tools/musicrota.mjs --falsify   # the old index-based rotation, watch it go red
 */
import { FIGHT_POOL, unlockedFightTracks, pickFightTrack, RECENT_KEEP } from '../js/music.js';
const falsify = process.argv.includes('--falsify');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const poolAt = (reached) => unlockedFightTracks(reached).map((t) => t.id);
const choose = (pool, recent, ordinal) =>
  falsify ? pool[ordinal % pool.length] : pickFightTrack(pool, recent);

// A player who keeps replaying level 1 from a fresh save must not hear one song forever.
{
  const heard = {};
  for (let session = 0; session < 60; session++) {
    const t = choose(poolAt(0), [], 0);          // fresh save every time
    heard[t] = (heard[t] || 0) + 1;
  }
  const distinct = Object.keys(heard).length;
  ok('replaying level 1 from scratch varies the track', distinct >= 3,
     `${distinct} distinct over 60 fresh starts: ${JSON.stringify(heard)}`);
}

// Repeated fights inside one save must not repeat back to back.
{
  let recent = [], last = null, back2back = 0, seen = new Set();
  for (let i = 0; i < 400; i++) {
    const reached = Math.min(44, Math.floor(i / 4));
    const t = choose(poolAt(reached), recent, i);
    if (t === last) back2back++;
    last = t;
    seen.add(t);
    recent = [...recent, t].slice(-RECENT_KEEP);
  }
  ok('never plays the same track twice in a row', back2back === 0, `${back2back} back-to-back`);
  ok('the whole roster gets used', seen.size === FIGHT_POOL.length, `${seen.size}/${FIGHT_POOL.length}`);
}

// Only unlocked tracks may play.
{
  let bad = 0, recent = [];
  for (let i = 0; i < 200; i++) {
    const reached = i % 45;
    const pool = poolAt(reached);
    const t = choose(pool, recent, i);
    if (!pool.includes(t)) bad++;
    recent = [...recent, t].slice(-RECENT_KEEP);
  }
  ok('never plays a locked track', bad === 0, `${bad} leaks`);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
