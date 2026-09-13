// Tiny emitter for UI/gfx wiring. The SIM does not use this - it pushes plain
// objects onto world.events, so that js/sim/** stays node-runnable and has no
// callback into presentation code.

export function makeEmitter() {
  const map = new Map();
  return {
    on(type, fn) {
      let a = map.get(type);
      if (!a) map.set(type, (a = []));
      a.push(fn);
      return () => this.off(type, fn);
    },
    off(type, fn) {
      const a = map.get(type);
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    emit(type, payload) {
      const a = map.get(type);
      if (!a) return;
      // copy: a handler may unsubscribe during dispatch
      for (const fn of a.slice()) fn(payload);
    },
    clear() { map.clear(); },
  };
}
