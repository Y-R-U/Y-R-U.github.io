// One event bus for everything audible. The game emits; js/app/main.js routes to js/audio/.
// emit(name, params): one-shots use the sound names from docs/notes/sound.md; plus
// 'roll' { speed, surface } every frame and 'stopRoll'.
const subs = new Set();
export const sfx = {
  on(fn) { subs.add(fn); return () => subs.delete(fn); },
  emit(name, params = {}) { for (const fn of subs) { try { fn(name, params); } catch { /* audio must never break play */ } } },
};
