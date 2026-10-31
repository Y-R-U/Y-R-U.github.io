// Bark line bank: script entries {id, voice, intent, tier?, text, delivery, maxSeconds, callsign?, rwy?} + audio manifest.
import { FALLBACK_LINES } from './fallback.js';

export class LineBank {
  constructor() {
    this.byKey = new Map();
    this.last = new Map();
    this.audio = new Map(); // `${voice}/${id}` -> { url, duration }
    this.load(FALLBACK_LINES, true);
  }

  load(entries, fallback = false) {
    for (const e of normaliseScript(entries)) {
      if (!e.voice || !e.intent || !e.text) continue;
      const k = `${e.voice}|${e.intent}`;
      let list = this.byKey.get(k);
      if (!list || (list.fallback && !fallback)) { list = []; list.fallback = fallback; this.byKey.set(k, list); }
      if (list.fallback !== fallback) continue;
      // variant = stable index within voice+intent, so online peers can name a clip with {voice, intent, variant}.
      list.push({ ...e, variant: list.length });
    }
  }

  loadManifest(m, base = '') {
    const put = (voice, id, v) => {
      if (!voice || !id) return;
      const file = typeof v === 'string' ? v : v?.file || v?.url || v?.path || `${voice}/${id}.mp3`;
      const duration = +(v?.duration ?? v?.dur ?? v?.seconds ?? 0) || 0;
      this.audio.set(`${voice}/${id}`, { url: /^(https?:|\/)/.test(file) ? file : base + file, duration });
    };
    const list = Array.isArray(m) ? m : Array.isArray(m?.lines) ? m.lines : Array.isArray(m?.clips) ? m.clips : null;
    if (list) for (const v of list) put(v.voice, v.id, v);
    else if (m && typeof m === 'object') {
      const voices = m.voices && typeof m.voices === 'object' ? m.voices : m;
      for (const [voice, set] of Object.entries(voices)) {
        if (Array.isArray(set)) for (const v of set) put(voice, typeof v === 'string' ? v : v.id, v);
        else if (set && typeof set === 'object') for (const [id, v] of Object.entries(set)) put(voice, id, v);
      }
    }
  }

  async fetchAll({ scriptUrl, manifestUrl, voicesUrl, audioBase } = {}) {
    const get = (u) => (u ? fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null);
    const [script, manifest, voices] = await Promise.all([get(scriptUrl), get(manifestUrl), get(voicesUrl)]);
    if (script) this.load(script);
    if (manifest) this.loadManifest(manifest, audioBase ?? manifestUrl.replace(/[^/]*$/, ''));
    return { script: !!script, manifest: !!manifest, voices: voices?.voices || voices || null };
  }

  list(voice, intent) {
    const l = this.byKey.get(`${voice}|${intent}`);
    return l?.length ? l : this.byKey.get(`*|${intent}`) || null;
  }

  has(voice, intent) { return !!this.list(voice, intent)?.length; }

  // A line only one voice has (a story line such as Toby's t_jumbo, said while Gerald holds the tower): that voice's own
  // entry, so it plays its own clip instead of being dropped.
  pickAny(intent) {
    for (const [k, l] of this.byKey) if (!l.fallback && l.length && k.endsWith(`|${intent}`) && !k.startsWith('*|')) return this.resolve(l[0].voice, l[Math.floor(Math.random() * l.length)]);
    return null;
  }

  // Random variant, nearest tier first, never the one this voice used last for this intent.
  pick(voice, intent, { tier } = {}) {
    let list = this.list(voice, intent);
    if (!list?.length) return null;
    if (tier != null && list.some((e) => e.tier != null)) {
      const d = (e) => (e.tier == null ? 9 : Math.abs(e.tier - tier));
      const best = Math.min(...list.map(d));
      list = list.filter((e) => d(e) === best);
    }
    const key = `${voice}|${intent}`;
    const pool = list.length > 1 ? list.filter((e) => e.id !== this.last.get(key)) : list;
    const e = pool[Math.floor(Math.random() * pool.length)];
    this.last.set(key, e.id);
    return this.resolve(voice, e);
  }

  variant(voice, intent, i) {
    const list = this.list(voice, intent);
    const e = list?.[i] || list?.[0];
    return e ? this.resolve(voice, e) : null;
  }

  resolve(voice, e) { return { ...e, voice: e.voice === '*' ? voice : e.voice, generic: e.voice === '*' }; }

  clip(voice, id) { return this.audio.get(`${voice}/${id}`) || null; }

  urlsForVoice(voice) {
    const out = [];
    for (const [k, v] of this.audio) if (k.startsWith(voice + '/')) out.push(v.url);
    return out;
  }
}

function normaliseScript(s) {
  if (Array.isArray(s)) return s;
  if (!s || typeof s !== 'object') return [];
  if (Array.isArray(s.lines)) return s.lines;
  if (Array.isArray(s.barks)) return s.barks;
  if (Array.isArray(s.pilot) || Array.isArray(s.tower)) return [...(s.pilot || []), ...(s.tower || []), ...(s.splice || [])];
  const out = [];
  for (const [voice, v] of Object.entries(s.voices || s)) {
    if (Array.isArray(v)) for (const e of v) out.push({ voice, ...e });
    else if (v && typeof v === 'object') for (const [intent, arr] of Object.entries(v)) if (Array.isArray(arr)) for (const e of arr) out.push({ voice, intent, ...e });
  }
  return out;
}

export function fillTemplate(text, ctx = {}) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (ctx[k] != null && ctx[k] !== '' ? ctx[k] : ({ runway: 'the runway' })[k] ?? ''));
}
