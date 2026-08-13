// The §7 script: seven prompts, gated by insufficiency. Pure — it picks the line, the HUD draws
// it. Each is armed by the moment the previous control stops being enough and is retired forever
// the first time the gesture is performed, including across a New Game.

export const HOLD = 4;          // seconds on screen if the gesture is not performed
export const SIDE = 'left-handed?';

// `when` arms the prompt, `until` retires it. Both read one flat context the session assembles;
// nothing here reaches into the world.
export const PROMPTS = [
  { id: 'look', text: 'Drag to look.', when: () => true, until: c => c.looked },
  { id: 'cast', text: 'Tap to cast.', when: c => c.looked && c.target, until: c => c.cast },
  { id: 'move', text: 'Drag to move.', when: c => c.cast, until: c => c.moved, side: true },
  { id: 'door', text: 'Walk at the door.', when: c => c.cleared, until: c => c.doorUsed },
  { id: 'context', text: 'The button acts.', when: c => !!c.contextKind, until: c => c.contextUsed },
  { id: 'channel', text: 'Hold to cast the line.', when: c => c.contextKind === 'work', until: c => c.channelled },
  { id: 'dial', text: 'Tap to change school.', when: c => c.schools >= 2, until: c => c.dialUsed },
];

export const byId = Object.fromEntries(PROMPTS.map(p => [p.id, p]));

// One prompt at a time, earliest in the script first: the order is the teaching order and a
// player who skips ahead simply never sees the one they overtook.
export function next(ctx = {}, done = {}) {
  for (const p of PROMPTS) {
    if (done[p.id] || p.until(ctx)) continue;
    if (p.when(ctx)) return p;
  }
  return null;
}

// Anything the player has already done is retired without ever being shown, which is what stops a
// returning player being taught the stick again.
export function settle(ctx = {}, done = {}) {
  const out = { ...done };
  for (const p of PROMPTS) if (p.until(ctx)) out[p.id] = true;
  return out;
}
