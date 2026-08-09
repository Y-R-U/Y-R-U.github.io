/** Tiny synchronous event bus. Handlers added during an emit do not fire for that emit. */

export function createBus() {
  const map = new Map();
  let depth = 0;
  const pendingRemoves = [];

  function listeners(name) {
    let l = map.get(name);
    if (!l) { l = []; map.set(name, l); }
    return l;
  }

  function off(name, fn) {
    if (depth > 0) { pendingRemoves.push(name, fn); return; }
    const l = map.get(name);
    if (!l) return;
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }

  const bus = {
    on(name, fn) {
      listeners(name).push(fn);
      return () => off(name, fn);
    },

    once(name, fn) {
      const wrap = (p) => { off(name, wrap); fn(p); };
      listeners(name).push(wrap);
      return () => off(name, wrap);
    },

    off,

    emit(name, payload) {
      const l = map.get(name);
      if (!l || l.length === 0) return;
      depth++;
      // snapshot length so handlers registered mid-emit don't run this pass
      const n = l.length;
      for (let i = 0; i < n; i++) {
        const fn = l[i];
        if (!fn) continue;
        try { fn(payload); }
        catch (e) { console.error(`[bus] ${name}`, e); }
      }
      depth--;
      if (depth === 0 && pendingRemoves.length) {
        for (let i = 0; i < pendingRemoves.length; i += 2) off(pendingRemoves[i], pendingRemoves[i + 1]);
        pendingRemoves.length = 0;
      }
    },

    clear(name) {
      if (name) map.delete(name); else map.clear();
    },
  };

  return bus;
}
