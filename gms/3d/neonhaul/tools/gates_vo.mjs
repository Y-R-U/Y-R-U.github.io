// §S2-M's gate — the cutscene's beats are as long as its audio.
//
//   node tools/gates_vo.mjs
//
// V1  every slot the intro script names exists on disk
// V2  the SCRIPT table's written `sec` is the real length of the file
// V3  no line is cut off: every beat outlasts its clip by a readable margin
// V4  the bubble text and the synthesised text are the same words
//
// Why this suite exists. The holds in storyui.js were hand-tuned against the ABOGEN boss takes.
// S2-L replaced the Boss with the SUNO performance — a slower read of the same words — and nothing
// recomputed them, so from that commit onward every one of his seven lines was truncated. The
// worst was boss_06 at 11.50 s of audio held for 7.2, which cut him off mid-sentence and started
// the next line over the top of him. Aaron: *"it gets to just after the word 'then' in the middle
// then moves on even though he is still talking."*
//
// Nothing could see it. It is not a crash, not a console error, not a pixel any capture tool looks
// at, and not a number in `__state`. The only witness was a person listening. So the gate is a
// pure-node comparison of the table against the files, which is the one arrangement that catches
// the NEXT regeneration too — V2 goes red the moment audio changes and the table does not.
//
// V3's falsification is the shipped bug itself: the same check run against the pre-S2-M holds.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCRIPT, MONOLOGUE, beatHold } from '../js/storyui.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = resolve(ROOT, 'assets/audio/story');
const GENDERS = ['m', 'f', 'n'];

const ok = [], fail = [];
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${det}`);
}

function secOf(file) {
  const p = resolve(DIR, file);
  if (!existsSync(p)) return null;
  const out = execFileSync('ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' });
  const v = parseFloat(out.trim());
  return Number.isFinite(v) ? v : null;
}

// A pc row is three files, one per gender; a boss row is one. The slots a row owns, as
// storyui.js's slotFor() derives them, so this cannot drift from what the game asks for.
const slotsOf = row => row.who === 'boss' ? [row.voice] : GENDERS.map(g => `pc_${g}_${row.voice}`);
const ROWS = [...SCRIPT, MONOLOGUE];

try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); }
catch { console.error('ffprobe not on PATH — this suite measures real files and cannot run without it'); process.exit(2); }

// ── V1 ─────────────────────────────────────────────────────────────────────
const measured = new Map();
{
  const missing = [];
  for (const row of ROWS) for (const slot of slotsOf(row)) {
    const s = secOf(`${slot}.mp3`);
    if (s === null) missing.push(slot); else measured.set(slot, s);
  }
  check('V1 every slot the script names exists on disk', missing.length === 0,
    `${measured.size} clips measured, ${missing.length} missing${missing.length ? ': ' + missing.join(' ') : ''}`);
}

// ── V2 ─────────────────────────────────────────────────────────────────────
// The table's `sec` is what the beat falls back to when a clip has not decoded yet — a slow
// network, or a player with audio off. A stale fallback is the shipped bug in its dormant form, so
// it is asserted at the same tolerance as everything else rather than treated as documentation.
//
// For a pc row the fallback must cover the LONGEST take, because one number serves three genders.
const TOL = 0.05;
{
  const off = [];
  for (const row of ROWS) {
    const longest = Math.max(...slotsOf(row).map(s => measured.get(s) ?? 0));
    if (row.cut) continue;                       // a cut row's `sec` is a written beat, not a length
    if (Math.abs(row.sec - longest) > TOL) off.push(`${row.voice} table=${row.sec} disk=${longest.toFixed(2)}`);
  }
  check('V2 the written fallback is the real length of the file', off.length === 0,
    off.length ? off.join(' · ') : `all ${ROWS.filter(r => !r.cut).length} spoken rows within ${TOL}s of disk`);

  const drifted = ROWS.filter(r => !r.cut).map(r => ({ ...r, sec: r.sec + 2 }));
  const caught = drifted.filter(r => Math.abs(r.sec - Math.max(...slotsOf(r).map(s => measured.get(s) ?? 0))) > TOL);
  check('V2-falsify a table 2 s out of date is seen', caught.length === drifted.length,
    `${caught.length}/${drifted.length} rows flagged when every \`sec\` is pushed +2 s`);
}

// ── V3 ─────────────────────────────────────────────────────────────────────
// The property Aaron actually reported. Not "the number is 11.5" — the number will change again
// the next time a line is re-recorded — but "the beat lasts longer than the clip, every time, with
// enough left over to be a pause rather than a race."
const MIN_GAP = 0.4;
{
  const short = [];
  for (const row of ROWS) {
    if (row.cut) continue;                       // an interjection is MEANT to be talked over
    for (const slot of slotsOf(row)) {
      const m = measured.get(slot);
      const gap = beatHold(row, m) - m;
      if (gap < MIN_GAP) short.push(`${slot} audio=${m.toFixed(2)} beat=${beatHold(row, m).toFixed(2)} gap=${gap.toFixed(2)}`);
    }
  }
  check('V3 every beat outlasts its clip', short.length === 0,
    short.length ? short.join(' · ') : `all spoken slots hold >= ${MIN_GAP}s past the end of the audio`);

  // The shipped holds, verbatim from the pre-S2-M table. This is not a synthetic perturbation: it
  // is the build Aaron played, run through the check that now guards it.
  const SHIPPED = { boss_01: 3.2, boss_02: 4.4, boss_03: 4.6, boss_04: 3.4, boss_05: 4.8,
    boss_06: 7.2, boss_07: 2.6, close: 11.0 };
  const wouldCatch = [];
  for (const row of ROWS) {
    if (row.cut || SHIPPED[row.voice] === undefined) continue;
    for (const slot of slotsOf(row)) {
      if (SHIPPED[row.voice] - measured.get(slot) < MIN_GAP) wouldCatch.push(slot);
    }
  }
  check('V3-falsify the SHIPPED holds are caught by this check', wouldCatch.length >= 7,
    `${wouldCatch.length} slots would have failed on the pre-S2-M table: ${wouldCatch.slice(0, 8).join(' ')}`);
}

// ── V4 ─────────────────────────────────────────────────────────────────────
// The bubble shows the text and the clip says it. gen_story.py's header has demanded they match
// word for word since S2-E, and nothing enforced it — the two lists just sat in different files in
// different languages. They were then hand-edited in lockstep twice (S2-M cut a clause; S2-S
// changed the monologue's second "shit" to "crap" at Aaron's request), which is exactly the edit
// that goes wrong silently: a mismatch is not a crash, and the ONLY witness is a player who reads
// one thing and hears another. So the contract is now checked rather than documented.
{
  const py = readFileSync(resolve(ROOT, 'tools/vo/gen_story.py'), 'utf8');
  // Both files build these strings by implicit concatenation across lines, so the literals are
  // joined the way each language joins them rather than matched with one regex per line.
  const pyLines = new Map();
  for (const m of py.matchAll(/\(\s*'(boss_\d+|int\d|close)'\s*,\s*((?:'(?:[^'\\]|\\.)*'\s*)+)\)/g)) {
    const joined = [...m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1]).join('');
    pyLines.set(m[1], joined);
  }
  const diff = [];
  for (const row of ROWS) {
    if (row.cut) continue;
    const want = pyLines.get(row.voice);
    if (want === undefined) { diff.push(`${row.voice}: not found in gen_story.py`); continue; }
    if (want !== row.text) diff.push(`${row.voice}: bubble ${JSON.stringify(row.text.slice(0, 48))} vs synth ${JSON.stringify(want.slice(0, 48))}`);
  }
  check('V4 the bubble text and the synthesised text are the same words', diff.length === 0,
    diff.length ? diff.join(' · ') : `all ${ROWS.filter(r => !r.cut).length} spoken rows match gen_story.py character for character`);

  // Falsify on the edit that was actually made, not on a scrambled string: put the second "shit"
  // back and confirm the check goes red. An arm that mangles a line beyond recognition proves only
  // that the comparison runs.
  const reverted = ROWS.filter(r => !r.cut).map(r => ({ ...r, text: r.text.replace('sort of crap', 'sort of shit') }));
  const caught = reverted.filter(r => pyLines.get(r.voice) !== r.text);
  check('V4-falsify one word changed in one line is seen', caught.length === 1,
    caught.length === 1 ? `reverting "crap" to "shit" in the monologue trips exactly this row: ${caught[0].voice}`
      : `expected 1 row to trip, ${caught.length} did`);
}

console.log(`\n${ok.length}/${ok.length + fail.length} gates green${fail.length ? '  FAILED: ' + fail.join(', ') : ''}`);
process.exit(fail.length ? 1 : 0);
