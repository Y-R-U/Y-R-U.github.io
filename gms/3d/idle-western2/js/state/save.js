export const SAVE_VERSION = 1;
export const GAME_ID = 'iw2';
export const KEYS = { main: 'iw2.save', bak: 'iw2.save.bak', quarantine: 'iw2.quarantine.' };
export const BAK_EVERY_MS = 5 * 60e3;

// MIGRATIONS[n](env) → env at version n + 1. Add one whenever the saved state shape changes, and bump SAVE_VERSION.
export const MIGRATIONS = {};

export function parse(text) {
  if (!text) return { ok: false, reason: 'empty' };
  let env;
  try { env = JSON.parse(text); } catch { return { ok: false, reason: 'corrupt' }; }
  if (!env || typeof env !== 'object' || env.game !== GAME_ID || !env.s || typeof env.s !== 'object') return { ok: false, reason: 'foreign' };
  if (!(env.v >= 1)) return { ok: false, reason: 'corrupt' };
  if (env.v > SAVE_VERSION) return { ok: false, reason: 'future' };
  const from = env.v;
  try {
    while (env.v < SAVE_VERSION) {
      const m = MIGRATIONS[env.v];
      if (!m) return { ok: false, reason: 'corrupt' };
      env = m(env);
    }
  } catch { return { ok: false, reason: 'corrupt' }; }
  return { ok: true, state: env, migratedFrom: from !== SAVE_VERSION ? from : undefined };
}

function savedAtOf(text) {
  const m = /"savedAt":\s*(\d+)/.exec(text || '');
  return m ? +m[1] : 0;
}

export function createSaveStore(storage) {
  let persistence = 'ok';
  let lastBak = 0;
  let quarantined = null;

  function quarantine(raw) {
    let n = 0;
    try {
      for (let i = 0; i < storage.length; i++) if ((storage.key(i) || '').startsWith(KEYS.quarantine)) n++;
    } catch {}
    const key = KEYS.quarantine + (savedAtOf(raw) || 'x') + '.' + n;
    try { storage.setItem(key, raw); quarantined = key; } catch { quarantined = null; }
  }

  return {
    get persistence() { return persistence; },
    get quarantined() { return quarantined; },
    load() {
      let raw = null;
      try { raw = storage.getItem(KEYS.main); } catch { persistence = 'off'; return { ok: false, reason: 'storage' }; }
      if (!raw) return { ok: false, reason: 'empty' };
      const r = parse(raw);
      if (r.ok) { lastBak = savedAtOf(raw); return r; }
      if (r.reason === 'future') { persistence = 'off'; return r; }
      quarantine(raw);
      let bakRaw = null;
      try { bakRaw = storage.getItem(KEYS.bak); } catch {}
      const bak = parse(bakRaw);
      if (bak.ok) { persistence = 'armed'; return { ...bak, fromBackup: true, reason: r.reason }; }
      persistence = 'armed';
      return r;
    },
    arm() { if (persistence === 'armed') persistence = 'ok'; },
    write(text) {
      if (persistence !== 'ok') return false;
      try {
        const at = savedAtOf(text);
        const prev = storage.getItem(KEYS.main);
        if (prev && parse(prev).ok && (!lastBak || !at || at - lastBak >= BAK_EVERY_MS)) {
          storage.setItem(KEYS.bak, prev);
          lastBak = at || lastBak;
        }
        storage.setItem(KEYS.main, text);
        return true;
      } catch { return false; }
    },
    clear() { try { storage.removeItem(KEYS.main); storage.removeItem(KEYS.bak); } catch {} },
  };
}
