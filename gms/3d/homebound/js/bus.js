// Tiny event bus. Systems announce things without importing each other, which
// keeps the module graph a DAG and lets six people build six systems at once.

const listeners = new Map();

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => off(evt, fn);
}

export function off(evt, fn) {
  const set = listeners.get(evt);
  if (set) set.delete(fn);
}

export function emit(evt, payload) {
  const set = listeners.get(evt);
  if (!set) return;
  for (const fn of Array.from(set)) {
    try { fn(payload); } catch (e) { console.error('[bus]', evt, e); }
  }
}

// Run teardown drops every listener a system registered in resetX(), so a
// second run does not double-fire. Systems that listen once at init use
// `on()` in initX and are exempt.
export function clearBus(evt) {
  if (evt) listeners.delete(evt); else listeners.clear();
}
