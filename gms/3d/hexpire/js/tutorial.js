// Scripted intro for Story chapter 1. main.js reports events via tutEvent();
// each step waits for a button press or a named game event.
import { tutShow, tutHide } from './ui.js';
import { Sfx } from './audio.js';

let active = false, stepIdx = 0, G = null;

const STEPS = [
  {
    text: `Welcome, ruler! 👑 This is your <b>home base</b> — the castle with your banner. The coloured hexes around it are <b>your land</b>. Drag to look around, pinch to zoom.`,
    next: 'button',
    onEnter: () => G.focusHome(),
  },
  {
    text: `Every structure stands on your land. First, raise a fighting force: <b>tap your castle</b>.`,
    next: 'select-base',
  },
  {
    text: `Now tap <b>⚔️ Recruit</b>, pick <b>level 1</b>, and tap a glowing hex near the castle to muster your army.`,
    next: 'recruited',
  },
  {
    text: `Fresh troops need a turn to muster. Tap <b>End Turn</b> — your towers and base fire arrows at nearby enemies automatically, then the rivals move.`,
    next: 'turn-ended',
  },
  {
    text: `💰 Each turn you collect <b>income</b>: coin from your base, +1 for every 4 hexes you fully control, and +5 from each village. More land, more gold!`,
    next: 'button',
  },
  {
    text: `Let's grow the treasury. Tap an <b>empty hex inside your borders</b> and build a <b>🏘️ Village</b>.`,
    next: 'built-village',
  },
  {
    text: `Land is claimed by buildings. Build a <b>🗼 Wooden Tower</b> near your border — watch your territory spread around it.`,
    next: 'built-tower',
  },
  {
    text: `Time to march. <b>Tap your army</b>, then tap a highlighted hex. Armies move ${5} hexes a turn — attacking costs 1 move.`,
    next: 'army-moved',
  },
  {
    text: `⚔️ To win: <b>destroy Braemar's base</b> in the east. Red hexes are attacks — damage is your attack minus their defence, and towers shield their neighbours. Merge armies (blue hexes) to hit harder. Good hunting!`,
    next: 'button', label: 'To war!',
  },
];

export function tutStart(game) {
  G = game;
  active = true;
  stepIdx = -1;
  advance();
}

export function tutStop() { active = false; tutHide(); }
export const tutActive = () => active;

function advance() {
  stepIdx++;
  if (stepIdx >= STEPS.length) { tutStop(); return; }
  const s = STEPS[stepIdx];
  s.onEnter?.();
  tutShow(s.text,
    s.next === 'button' ? (s.label || 'Next') : null,
    s.next === 'button' ? () => { Sfx.tap(); advance(); } : null);
}

export function tutEvent(name) {
  if (!active) return;
  const s = STEPS[stepIdx];
  if (s && s.next === name) advance();
}
