export const SAVE_VERSION = 2;
export const KEYS = { main: 'il2.save', bak: 'il2.save.bak', quarantine: 'il2.quarantine.' };
export const BAK_EVERY_MS = 5 * 60e3;

export const MIGRATIONS = {
  1(env) {
    const s = env.s || {};
    for (const id in s.lines || {}) {
      const l = s.lines[id];
      if (Array.isArray(l.boost)) l.boost = l.boost.reduce((a, b) => a + (b | 0), 0);
      l.earned = l.earned || 0;
    }
    for (const id in s.managers || {}) {
      const m = s.managers[id];
      m.level = Math.max(1, Math.min(5, m.level | 0 || 1));
      m.slots = (Array.isArray(m.slots) ? m.slots : []).map((x) => (typeof x === 'string' ? x : null));
      if (!m.slots.length) m.slots = [null];
    }
    s.items = Array.isArray(s.items) ? s.items.filter((x) => x && x.id) : [];
    const age = s.life?.age ?? s.age ?? 18;
    s.life = Object.assign({}, s.life, { xp: Math.max(0, age - 18), home: undefined });
    s.family = Object.assign({ gen: s.gen || 1, portraits: [], landmarks: [], legacy: s.legacy || 0 }, s.family);
    s.family.allTime = Math.max(s.family.allTime || 0, s.lifetime || 0);
    if (s.contracts && typeof s.contracts === 'object') {
      for (const k in s.contracts) if (s.contracts[k] !== 'claimed') delete s.contracts[k];
    }
    delete s.age; delete s.gen; delete s.legacy; delete s.equip;
    return { ...env, v: 2, s };
  },
};

export function parse(text) {
  if (!text) return { ok: false, reason: 'empty' };
  let env;
  try { env = JSON.parse(text); } catch { return { ok: false, reason: 'corrupt' }; }
  if (!env || typeof env !== 'object' || env.game !== 'il2' || !env.s || typeof env.s !== 'object') return { ok: false, reason: 'foreign' };
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
