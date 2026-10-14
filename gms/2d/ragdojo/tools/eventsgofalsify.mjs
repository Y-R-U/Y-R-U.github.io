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
  ['campaign cap of 11', 'campaignCap = evCap{10, 60000}', 'campaignCap = evCap{11, 60000}'],
  ['agreed arena results not counted', '\th.st.afterMatch = h.st.eventArenaResult\n', ''],
  ['the client picks which answer is checked', '\tif (body.Pic == "art") != art {', '\tif (body.Pic == "art") != art && false {'],
  ['pass events open to everyone', 'if def.Pass && !h.lan && !h.ent(r.Context(), uid, tok).Pass {', 'if def.Pass && false && !h.ent(r.Context(), uid, tok).Pass {'],
  ['art routes not wired', '\th.eventArtRoutes(mux, prefix, origins)', '\t_ = 0'],
  ['a solved picture stops opening (no way to 25)', 'if def.Kind == "reveal" && len(p.openCells) < cells {', 'if def.Kind == "reveal" && !p.solved && len(p.openCells) < cells {'],
  ['art: a tile for any square', '(!whole && !containsInt(open, cell))', '(!whole && false)', 'eventart.go'],
  ['art: the whole picture before 25 are open', '(whole && len(open) < cells)', '(whole && len(open) < 2)', 'eventart.go'],
  ['art: tiles cut from the wrong square', 'col, row := c%5, c/5', 'col, row := c/5, c%5', 'eventart.go'],
  ['paid: a daily cap after all', 'paidCap     = evCap{0, 15000}', 'paidCap     = evCap{10, 15000}'],
  ['paid: no anti-spam gap', 'paidCap     = evCap{0, 15000}', 'paidCap     = evCap{0, 0}'],
  ['paid: a supporter is not paid', 'Paid: pass || out.Entitlements["ragdojo_supporter"]', 'Paid: pass'],
  ['paid: an outage grants unlimited', 'unknown := evEnt{Pass: true}', 'unknown := evEnt{Pass: true, Paid: true}'],
  ['paid: the cap ignores the entitlement', 'cap := capFor(paid)', 'cap := capFor(false)'],
  ['paid: fights refused in an outage are lost', 'p.mark = min(now.UnixMilli(), refused-1+evSyncSlack.Milliseconds())', 'p.mark = 0'],
  ['paid: stored claims re-counted with the free cap', 'p.battles = counted(def, win, append(all, arena...), paidCap)', 'p.battles = counted(def, win, append(all, arena...), campaignCap)'],
  ['tower: a win past the top', '\t\t\t} else {\n\t\t\t\tt.Floor++\n', '\t\t\t}\n\t\t\t{\n\t\t\t\tt.Floor++\n'],
  ['tower: below floor 1', 't.Floor = max(1, t.Floor-1)', 't.Floor = t.Floor - 1'],
  ['tower: no TOP on floor 12', 'if t.Floor == towerFloors {', 'if t.Floor == towerFloors+1 {'],
  ['tower: spam within the gap', 'r.At-last < towerGapMs', 'r.At-last < 0'],
  ['tower: back-dated fights', 'if c.At -= ahead; c.At < oldest ||', 'if c.At -= ahead; c.At < oldest-10*evMaxAge.Milliseconds() ||'],
  ['tower: takes battle points', 'return def.Kind != "tower" && b.At >= w.Start', 'return b.At >= w.Start'],
  ['tower: rivals unsorted', 'di, dj := iabs(l[i].Floor-my.Floor), iabs(l[j].Floor-my.Floor)', 'di, dj := 0, 0'],
  ['story: a circle short', 'for chapter < len(ch) && left >= ch[chapter] {', 'for chapter < len(ch) && left > ch[chapter] {'],
  ['story: one story for every month', 'return ((y*12+m-1)%n + n) % n', 'return ((y*0+m*0)%n + n) % n'],
  ['retired events still answer', '{ID: "tower", Kind: "tower", Cadence: "weekly", Pass: true},', '{ID: "tower", Kind: "tower", Cadence: "weekly", Pass: true},\n\t{ID: "vines-month", Kind: "vines", Cadence: "monthly", Pass: true},'],
  ['solo quick fights refused as claims', '(camp|ghost|tower|quick|arena)', '(camp|ghost|tower|arena)'],
  ['tower/story open without the Pass', '{ID: "story", Kind: "story", Cadence: "monthly", Pass: true, AnyBattle: true},', '{ID: "story", Kind: "story", Cadence: "monthly", AnyBattle: true},'],
];
let red = 0, total = 0;
for (const [what, from, to, file = 'events.go'] of GO) {
  total++;
  const dir = mkdtempSync(join(tmpdir(), 'evgo-'));
  cpSync(join(ROOT, 'server'), dir, { recursive: true });
  const f = join(dir, file), src = readFileSync(f, 'utf8');
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
