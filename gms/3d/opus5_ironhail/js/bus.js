// Tiny event bus. Systems announce things (a tank died, an objective ticked)
// without importing each other, which keeps the module graph a DAG.

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
  for (const fn of set) {
    try { fn(payload); } catch (e) { console.error('[bus]', evt, e); }
  }
}

export function clearBus(evt) {
  if (evt) listeners.delete(evt); else listeners.clear();
}
