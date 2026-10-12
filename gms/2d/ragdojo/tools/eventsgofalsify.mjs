#!/usr/bin/env node
/**
 * Proves the events server tests can fail: each mutant breaks server/events.go (or the JS
 * engine behind the golden vectors) in a temp copy, and `go test -run TestEvents` (or
 * `eventsvectors.mjs --check`) must go red.
 *
 *   node tools/eventsgofalsify.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './cdp.mjs';

const GO = [
  ['hash32 finisher constant', '\th *= 0x85ebca6b\n', '\th *= 0x85ebca6c\n'],
  ['die indexed one roll late', 'strconv.Itoa(n))%6)', 'strconv.Itoa(n+1))%6)'],
  ['board links may drift 4 columns', 'iabs(sqCol(a)-sqCol(z)) > 3', 'iabs(sqCol(a)-sqCol(z)) > 4'],
  ['ISO week starts on Sunday', 'dow := (int(time.UnixMilli(day).UTC().Weekday()) + 6) % 7', 'dow := int(time.UnixMilli(day).UTC().Weekday())'],
  ['THE REPLAY RULE dropped', 'shown := min(theirs, myTurns)', 'shown := min(theirs, myTurns+1000)'],
  ['rivals report their real turn count', 'Turns: shown, Home:', 'Turns: theirs, Home:'],
  ['claimed rolls not clamped to banked points', 'p.rolls = max(p.rolls, min(body.Rolls, sumInts(pts)))', 'p.rolls = max(p.rolls, body.Rolls)'],
  ['campaign cap of 11', '}{10, 60000}', '}{11, 60000}'],
  ['campaign fights count in arena-only events', 'b.At < w.End && (def.AnyBattle || b.Src == "arena")', 'b.At < w.End'],
  ['agreed arena results not counted', '\th.st.afterMatch = h.st.eventArenaResult\n', ''],
  ['the client picks which answer is checked', '\tif (body.Pic == "art") != art {', '\tif (body.Pic == "art") != art && false {'],
  ['pass events open to everyone', 'if def.Pass && !h.lan && !h.hasPass(r.Context(), uid, tok) {', 'if def.Pass && false && !h.hasPass(r.Context(), uid, tok) {'],
];
let red = 0, total = 0;
for (const [what, from, to] of GO) {
  total++;
  const dir = mkdtempSync(join(tmpdir(), 'evgo-'));
  cpSync(join(ROOT, 'server'), dir, { recursive: true });
  const f = join(dir, 'events.go'), src = readFileSync(f, 'utf8');
  if (!src.includes(from)) { console.log(`MISSED (source moved): ${what}`); rmSync(dir, { recursive: true, force: true }); continue; }
  writeFileSync(f, src.replace(from, to));
  // A mutant that does not compile proves nothing: it would be "red" for the wrong reason.
  try { execFileSync('go', ['vet', '.'], { cwd: dir, stdio: 'pipe' }); } catch (e) {
    console.log(`BROKEN MUTANT (does not compile): ${what}\n${e.stderr}`); rmSync(dir, { recursive: true, force: true }); continue;
  }
  let failed = false;
  try { execFileSync('go', ['test', '-count=1', '-run', 'TestEvents', '.'], { cwd: dir, stdio: 'pipe' }); } catch { failed = true; }
  rmSync(dir, { recursive: true, force: true });
  console.log(`${failed ? 'RED  ' : 'GREEN'} ${what}`);
  if (failed) red++;
}
// The vectors file is the contract: change the JS engine without regenerating and --check fails.
total++;
{
  const dir = mkdtempSync(join(tmpdir(), 'evjs-'));
  mkdirSync(join(dir, 'tools'));
  cpSync(join(ROOT, 'js'), join(dir, 'js'), { recursive: true });
  cpSync(join(ROOT, 'server/testdata'), join(dir, 'server/testdata'), { recursive: true });
  cpSync(join(ROOT, 'tools/eventsvectors.mjs'), join(dir, 'tools/eventsvectors.mjs'));
  const f = join(dir, 'js/events/vines.js');
  writeFileSync(f, readFileSync(f, 'utf8').replace('int(8, 28)', 'int(8, 27)'));
  let failed = false;
  try { execFileSync('node', [join(dir, 'tools/eventsvectors.mjs'), '--check'], { stdio: 'pipe' }); } catch { failed = true; }
  rmSync(dir, { recursive: true, force: true });
  console.log(`${failed ? 'RED  ' : 'GREEN'} JS makeBoard changed without new vectors`);
  if (failed) red++;
}
console.log(`\nfalsify: ${red}/${total} mutants caught`);
process.exit(red === total ? 0 : 1);
