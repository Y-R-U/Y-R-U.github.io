// Tiny event bus. Events used across the app:
//   project:open {id}   project:change   file:change {path}   tool:show {id}
//   settings:change {key,value}   log {level,msg}
const map = new Map();

export const bus = {
  on(evt, fn) { if (!map.has(evt)) map.set(evt, new Set()); map.get(evt).add(fn); return () => bus.off(evt, fn); },
  off(evt, fn) { const s = map.get(evt); if (s) s.delete(fn); },
  once(evt, fn) { const un = bus.on(evt, (d) => { un(); fn(d); }); return un; },
  emit(evt, data) {
    const s = map.get(evt); if (!s) return;
    for (const fn of [...s]) { try { fn(data); } catch (e) { console.error('[bus]', evt, e); } }
  }
};
