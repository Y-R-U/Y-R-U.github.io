export function createBus() {
  const map = new Map();
  const bus = {
    on(type, fn) {
      let set = map.get(type);
      if (!set) map.set(type, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    once(type, fn) {
      const off = bus.on(type, (d) => { off(); fn(d); });
      return off;
    },
    off(type, fn) { map.get(type)?.delete(fn); },
    emit(type, data) {
      const set = map.get(type);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(data); } catch (e) { console.error(`[bus] ${type} handler failed`, e); }
      }
    },
  };
  return bus;
}
