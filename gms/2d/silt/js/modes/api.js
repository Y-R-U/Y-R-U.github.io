// The mode api (rng, biome, shake, banner, setGravity) is supplied by the host.
// Modes must run headlessly, in the attract loop and in the real game, so every
// mode routes through safeApi() rather than guarding each call site.

const NOOP = () => {};

export function safeApi(api = {}) {
  if (api && api.__safe) return api;
  return {
    __safe: true,
    rng: api.rng || fallbackRng(),
    biome: api.biome || NOOP,
    shake: api.shake || NOOP,
    banner: api.banner || NOOP,
    // Absent on hosts whose sim has no gravity vector yet. Modes must probe
    // hasGravity() rather than assume this does anything.
    setGravity: api.setGravity || null,
    _raw: api,
  };
}

/** True only when the host can actually redirect gravity. */
export function hasGravity(api, world) {
  return typeof (api && api.setGravity) === 'function' && !!(world && world.gravity);
}

function fallbackRng() {
  let s = 0x9e3779b9;
  const r = {
    next() {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) { return (r.next() * n) | 0; },
    chance(p) { return r.next() < p; },
    pick(a) { return a[(r.next() * a.length) | 0]; },
  };
  return r;
}
