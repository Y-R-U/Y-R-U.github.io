// The events server: the arena service's /events endpoints (server/events.go). Every call
// fails soft — offline, signed out or no server, the panel simply plays locally.

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const qs = new URLSearchParams(location.search);

export function deviceId() {
  let d = store.get('ragdojo.arena.device');
  if (!d) { d = Math.random().toString(36).slice(2, 12); store.set('ragdojo.arena.device', d); }
  return d;
}
export const arenaName = () => (store.get('ragdojo.arena.name') || '').trim();

/** Same rule as net/panel.js arenaBase: games.br8t.com, a 192.* LAN host, or the dev port. */
function bases({ dev, lan }) {
  if (dev && qs.get('arena')) return [qs.get('arena')];
  const path = '/gms/2d/ragdojo/arena';
  if (location.hostname === 'games.br8t.com') return [location.origin + path];
  if (lan) return [location.origin + path, `${location.protocol}//${location.hostname}:8017${path}`];
  if (dev) return [`http://127.0.0.1:8017${path}`];
  return [];
}

export function createEventsNet({ dev, lan, account }) {
  let base = null, probing = null, skew = 0;
  const net = {
    get online() { return !!base; },
    get skew() { return skew; },
    async probe() {
      if (base) return true;
      probing ||= (async () => {
        for (const b of bases({ dev, lan })) {
          try {
            const r = await fetch(b + '/events', { cache: 'no-store' });
            if (r.ok) { const j = await r.json(); base = b; skew = (j.now || Date.now()) - Date.now(); return true; }
          } catch {}
        }
        return false;
      })();
      const ok = await probing;
      if (!ok) probing = null;
      return ok;
    },
    /** The player's own identity for the server, or '' (then everything stays local). */
    async token() {
      if (lan) return 'lan:' + deviceId();
      if (dev && qs.get('arenauid')) return 'dev:' + qs.get('arenauid');
      const a = account()?.auth;
      if (!a?.user || a.user.anon) return '';
      try { return (await a.getIdToken()) || ''; } catch { return ''; }
    },
    /** The uid the server will use for this player's dice, if it can be known locally. */
    localUid() {
      if (lan) return 'lan:' + deviceId();
      if (dev && qs.get('arenauid')) return qs.get('arenauid');
      const u = account()?.auth?.user;
      return u && !u.anon ? u.uid : 'local:' + deviceId();
    },
    async call(method, path, body) {
      if (!base) return { status: 0 };
      const tok = await net.token();
      if (!tok) return { status: 401 };
      try {
        const r = await fetch(base + path, {
          method, cache: 'no-store',
          headers: { Authorization: `Bearer ${tok}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        let data = null;
        try { data = await r.json(); } catch {}
        return { status: r.status, data };
      } catch { return { status: 0 }; }
    },
    /** An image the server only gives this player (event art tiles, server/eventart.go). */
    async image(path) {
      if (!base) return null;
      const tok = await net.token();
      if (!tok) return null;
      try {
        const r = await fetch(base + path, { headers: { Authorization: `Bearer ${tok}` } });
        return r.ok ? await createImageBitmap(await r.blob()) : null;
      } catch { return null; }
    },
    tile: (event, cell) => net.image(`/events/art/tile?event=${encodeURIComponent(event)}&cell=${cell}`),
    full: (event) => net.image(`/events/art/full?event=${encodeURIComponent(event)}`),
    sync: (body) => net.call('POST', '/events/sync', body),
    guess: (event, pic, choice) => net.call('POST', '/events/guess', { event, pic, choice }),
  };
  return net;
}
