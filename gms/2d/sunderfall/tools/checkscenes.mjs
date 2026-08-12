/* Static check on story/scenes.js. `node tools/checkscenes.mjs`
 *
 * A scene is data, so the whole class of bugs it can have is data bugs: a speaker that does
 * not exist, a cue the runner will warn-and-ignore, a take nobody will ever record, or two
 * bubbles from one mouth at the same time. None of those throw at runtime — they just quietly
 * make the scene wrong — so they are checked here instead.
 *
 * The timing rule is the one worth keeping: a bubble types at its speaker's cps, so it needs
 * text.length / cps seconds before the last character is even on screen. A `dur` shorter than
 * that is a line the player cannot read.
 */

import { SCENES } from '../game/js/story/scenes.js';
import { SPEAKER, TAKES } from '../game/js/story/script.js';

// contract §3.3 — anything else is a no-op with a console.warn, which is a silent scene bug
const CUES = new Set([
  'cam.hold', 'cam.to', 'cam.shake',
  'ostrick.leave', 'ostrick.arrive', 'elders.arrive',
  'rook.walk', 'rook.kneel',
  'fire.snuff', 'gate.crack', 'gate.open',
  'seam.speak', 'seam.reveal', 'boss.start', 'staff.take',
  'fade.out', 'fade.in', 'audio.cue',
]);

const ANCHORS = new Set(['rook', 'ostrick', 'seam', 'world']);
const CAST = new Set(['ostrick', 'elder', 'staff']);
const READ = 0.55;          // minimum eye-time after the last character lands

const fail = [];
const err = (s, m) => fail.push(`${s}: ${m}`);

for (const id of Object.keys(SCENES)) {
  const sc = SCENES[id];
  if (sc.id !== id) err(id, `id is "${sc.id}"`);
  if (!(sc.duration > 0)) err(id, 'no duration');
  if (!Array.isArray(sc.beats) || !sc.beats.length) err(id, 'no beats');
  if (!sc.cam || sc.cam.x == null) err(id, 'no cam');

  for (const c of sc.cast || []) {
    if (!CAST.has(c.who)) err(id, `cast "${c.who}" is not an NPC kind`);
    if (c.x == null) err(id, `cast "${c.who}" has no x`);
  }

  const last = {};          // speaker -> end of their last bubble
  let prevT = -1;
  for (const b of sc.beats) {
    const w = `${id} "${(b.text || '').slice(0, 28)}"`;
    const sp = SPEAKER[b.who];
    if (!sp) { err(w, `unknown speaker "${b.who}"`); continue; }
    if (!TAKES[b.take]) err(w, `unknown take "${b.take}"`);
    if (!('vo' in b)) err(w, 'no vo field — it must be present and null until the take exists');
    if (b.vo != null && !(Array.isArray(b.vo) && b.vo.length === 2)) err(w, 'vo is not [offset, length]');
    if (!ANCHORS.has(b.anchor)) err(w, `unknown anchor "${b.anchor}"`);
    if (!(b.t >= 0) || !(b.dur > 0)) err(w, 'bad t/dur');
    if (b.t < prevT) err(w, 'beats are out of order');
    prevT = b.t;

    const need = (b.text || '').length / (sp.cps || 26) + READ;
    if (b.dur + 1e-6 < need) err(w, `dur ${b.dur} < ${need.toFixed(2)} needed at ${sp.cps} cps`);

    const end = b.t + b.dur;
    if (last[b.who] != null && b.t < last[b.who]) {
      err(w, `overlaps the previous ${b.who} bubble by ${(last[b.who] - b.t).toFixed(2)}s`);
    }
    last[b.who] = end;
    if (end > sc.duration) err(w, `runs past the scene end (${end.toFixed(1)} > ${sc.duration})`);
  }

  let ct = -1;
  for (const c of sc.cues || []) {
    if (!CUES.has(c.fx)) err(id, `cue "${c.fx}" is not in contract §3.3`);
    if (!(c.t >= 0)) err(id, `cue "${c.fx}" has no t`);
    if (c.t < ct) err(id, `cue "${c.fx}" is out of order`);
    ct = c.t;
    if (c.t > sc.duration) err(id, `cue "${c.fx}" fires after the scene ends`);
    if (c.fx === 'audio.cue' && !c.key) err(id, 'audio.cue with no key');
    if (c.fx === 'cam.to' && (c.x == null || c.y == null)) err(id, 'cam.to with no x/y');
    if (c.fx === 'rook.walk' && c.x == null) err(id, 'rook.walk with no x');
  }
}

const n = Object.keys(SCENES).length;
const beats = Object.values(SCENES).reduce((a, s) => a + s.beats.length, 0);
if (fail.length) {
  for (const f of fail) console.error('  ✗ ' + f);
  console.error(`\n${fail.length} problem(s) in ${n} scenes.`);
  process.exit(1);
}
console.log(`✓ ${n} scenes, ${beats} beats, all speakers/takes/cues/timings consistent.`);
for (const id of Object.keys(SCENES)) {
  const s = SCENES[id];
  const voiced = s.beats.filter((b) => b.vo).length;
  console.log(`  ${id.padEnd(7)} ${String(s.duration).padStart(5)}s  ${String(s.beats.length).padStart(2)} beats  ${voiced}/${s.beats.length} cut to audio`);
}
