export function createEvents() {
  const map = new Map();
  const ev = {
    on(name, fn) { (map.get(name) || map.set(name, new Set()).get(name)).add(fn); return () => ev.off(name, fn); },
    off(name, fn) { map.get(name)?.delete(fn); },
    once(name, fn) { const off = ev.on(name, (...a) => { off(); fn(...a); }); return off; },
    emit(name, data) {
      const set = map.get(name);
      if (!set) return;
      for (const fn of [...set]) { try { fn(data); } catch (e) { console.error(`[events:${name}]`, e); } }
    },
    clear() { map.clear(); },
  };
  return ev;
}
