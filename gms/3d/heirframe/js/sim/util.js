export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const round = (v, dp = 0) => { const m = 10 ** dp; return Math.round(v * m) / m; };

export function createEmitter() {
  const map = new Map();
  const log = [];
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt)?.delete(fn);
    },
    off(evt, fn) { map.get(evt)?.delete(fn); },
    emit(evt, payload) {
      log.push([evt, payload]);
      if (log.length > 200) log.shift();
      for (const fn of map.get(evt) || []) fn(payload, evt);
      for (const fn of map.get('*') || []) fn(payload, evt);
    },
    recent: () => log.slice(),
  };
}

export function fmtNum(n) {
  const a = Math.abs(n);
  if (a < 1000) return String(Math.round(n));
  const units = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['k', 1e3]];
  for (const [u, v] of units) if (a >= v) return (n / v).toFixed(a / v < 10 ? 2 : a / v < 100 ? 1 : 0) + u;
  return String(Math.round(n));
}

export const deepClone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
