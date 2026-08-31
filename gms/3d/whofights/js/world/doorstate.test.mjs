import { test, eq, ok } from '../../tools/harness.mjs';
import { stalePeek, idleDoorState } from './doorstate.js';

// The report: "I can't look all the way round... refresh page fixed it." Pressing a Camera shot in
// the ⚙ panel while playing called doors.peek(), which set a flag nothing ever cleared, so
// Doors.update returned on its first line for the rest of the session — `indoor` stayed at 1 and
// the tighter indoor pitch cap applied from then on.
test('a peek taken while someone is playing is handed straight back', () => {
  ok(stalePeek(true, true, false));
});

test('a peek holds where there is no live player — that is what it is for', () => {
  ok(!stalePeek(true, false, false), 'under ?shot= and in the editor the player is off');
  ok(!stalePeek(true, true, true), 'the orbit camera owns the view');
  ok(!stalePeek(false, true, false));
});

test('with no script running the player carries no door state', () => {
  eq(idleDoorState('out', null), { indoor: 0, driven: false, confine: null, floorY: null });
});

// Every one of the four is a latch, and Doors.update has early returns for a peek, for a disabled
// player and for the orbit camera. Whichever of them a frame takes, this is applied first.
test('a script that owns the player is left alone', () => {
  for (const s of ['in', 'entering', 'leaving']) eq(idleDoorState(s, null), null, s);
  eq(idleDoorState('out', { id: 3 }), null, 'the arm is still growing back out of the doorway');
});
