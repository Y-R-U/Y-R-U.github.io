// The whole security boundary for dev mode. The DEV button is only created when isLocal() is true,
// so a bug here ships the dev menu to the public site.

const PRIVATE = /^(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./;
const V6_LOOPBACK = new Set(['::1', '0:0:0:0:0:0:0:1']);

export function isLocal(loc) {
  const l = loc || (typeof location !== 'undefined' ? location : null);
  if (!l) return false;
  if (l.protocol === 'file:') return true;
  return hostIsLocal(l.hostname);
}

export function hostIsLocal(host) {
  if (typeof host !== 'string') return false;
  let h = host.trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.endsWith('.')) h = h.slice(0, -1);
  if (!h) return false;
  if (h === 'localhost') return true;
  if (V6_LOOPBACK.has(h)) return true;
  if (h.length > 6 && h.endsWith('.local')) return true;
  if (!isDottedQuad(h)) return false;
  if (h === '127.0.0.1') return true;
  return PRIVATE.test(h);
}

// Only canonical decimal quads count. Browsers resolve 010.0.0.1 as 8.0.0.1 and 2130706433 as
// 127.0.0.1, so anything non-canonical is rejected rather than parsed.
export function isDottedQuad(h) {
  const parts = h.split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    if (p.length > 1 && p[0] === '0') return false;
    if (+p > 255) return false;
  }
  return true;
}
