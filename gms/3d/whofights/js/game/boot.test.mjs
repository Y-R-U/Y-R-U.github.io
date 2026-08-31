import { test, eq } from '../../tools/harness.mjs';
import { bootMode, playing, devRow } from './boot.js';

const q = s => new URLSearchParams(s);

test('a shot is a shot on any origin — it renders the game, it does not author it', () => {
  eq(bootMode(q('shot=hall'), true), 'shot');
  eq(bootMode(q('shot=hall'), false), 'shot');
});

test('?editor is a mode only on a local origin', () => {
  eq(bootMode(q('editor'), true), 'editor');
  eq(bootMode(q('editor'), false), 'play', 'the scene editor is a dev tool — DEV_CONTRACT §1');
  eq(bootMode(q('editor=1'), false), 'play');
  eq(bootMode(q('editor'), undefined), 'play', 'a caller that forgot to ask the gate gets the game');
});

test('everything else plays', () => {
  eq(bootMode(q(''), true), 'play');
  eq(bootMode(q('level=academy&preset=high'), true), 'play');
  eq([playing('play'), playing('editor'), playing('shot')], [true, false, false]);
  eq([devRow('play'), devRow('editor'), devRow('shot')], [false, true, true]);
});
