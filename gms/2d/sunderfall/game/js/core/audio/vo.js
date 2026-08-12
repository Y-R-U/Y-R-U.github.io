/**
 * Recorded voice — the one exception to "everything is synthesised".
 *
 * A character's whole part lives in one mp3 and a line is a slice of it:
 * `say(offset, length, { take })`. One fetch and one decode per **take**, no per-line
 * request, and the fade lengths stay tunable without re-cutting anything. The offsets
 * live next to the text they belong to — sim/barks.js for the barks take, and
 * story/scenes.js for act two's.
 *
 * There are five or six takes, not one: Rook has the cinematic (`rook`), the barks
 * (`barks`) and act two (`rook2`); Vayne has his own (`vayne`) and the one the Seam
 * wears (`vayne2`); Ostrick has one. `take` defaults to `barks`, so every caller
 * written before this existed still means what it said.
 *
 * Fades are not optional. The takes have a quiet music bed under the voice — Suno
 * leaves one there and it cannot be removed — so starting or stopping a slice dead is
 * an audible click.
 *
 * **Nothing here is load-bearing and nothing here blocks.** A take is fetched the first
 * time it is asked for, by `say()` or by `has()`. Until it has decoded, `say()` is a
 * no-op and `has()` is false. A missing or broken file costs the game nothing but the
 * voice — three of the six do not exist on disk yet — and it costs the console exactly
 * one warning per file, ever.
 */

const FADE_IN = 0.08;
const FADE_OUT = 0.16;
const DUCK = 0.45;         // how far the score and the wood get out of the way

export function createVO(actx, mix, takes, o = {}) {
  const DEFAULT = o.defaultTake || 'barks';

  // A bare url is the old single-take call. Keep it working: nothing else needs to know.
  const urls = new Map();
  if (typeof takes === 'string') urls.set(DEFAULT, takes);
  else for (const k in takes) urls.set(k, takes[k]);

  const state = new Map();   // take -> { buffer, loading, failed }
  const unknown = new Set();
  const live = [];

  function slot(name) {
    let s = state.get(name);
    if (!s) { s = { buffer: null, loading: null, failed: false }; state.set(name, s); }
    return s;
  }

  function nameOf(o2) {
    const n = (o2 && o2.take) || DEFAULT;
    if (urls.has(n)) return n;
    if (!unknown.has(n)) { unknown.add(n); console.warn('[audio] no such voice take: ' + n); }
    return null;
  }

  /** Fetch + decode one take. Safe to call any number of times; at most one of each happens. */
  function load(name = DEFAULT) {
    if (!urls.has(name)) { nameOf({ take: name }); return Promise.resolve(false); }
    const s = slot(name);
    if (s.buffer) return Promise.resolve(true);
    if (s.failed) return Promise.resolve(false);
    if (s.loading) return s.loading;
    s.loading = (async () => {
      try {
        const res = await fetch(urls.get(name));
        if (!res.ok) throw new Error(res.status);
        s.buffer = await actx.decodeAudioData(await res.arrayBuffer());
      } catch (e) {
        s.failed = true;
        console.warn('[audio] voice take "' + name + '" unavailable —', e.message || e);
      }
      s.loading = null;
      return !!s.buffer;
    })();
    return s.loading;
  }

  /**
   * Is this take loaded and decoded — i.e. would say() actually be heard?
   *
   * Asking is what starts the fetch, which is the whole lazy story: a caller that only
   * ever asks about `ostrick` never pays for the other five. It answers false until the
   * decode lands, and false forever for a file that is not there.
   */
  function has(name = DEFAULT) {
    if (!urls.has(name)) return false;
    const s = state.get(name);
    if (s && s.buffer) return true;
    if (!s || (!s.loading && !s.failed)) load(name);
    return false;
  }

  /**
   * Play seconds [at, at+len) of a take. Speech is one line at a time by design —
   * across every take, not per take — so a new line cuts the old one short rather than
   * talking over it.
   * @returns true if it will actually be heard
   */
  function say(at, len, o2 = {}) {
    const name = nameOf(o2);
    if (!name || !(len > 0)) return false;
    const s = state.get(name);
    if (!s || !s.buffer) { load(name); return false; }
    if (live.length) stop(0.08);

    const t = actx.currentTime + (o2.delay || 0);
    const level = o2.volume == null ? 1 : o2.volume;
    const src = actx.createBufferSource();
    src.buffer = s.buffer;
    const g = actx.createGain();

    const fin = Math.min(FADE_IN, len * 0.3);
    const fout = Math.min(FADE_OUT, len * 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + fin);
    g.gain.setValueAtTime(level, t + Math.max(fin, len - fout));
    g.gain.linearRampToValueAtTime(0.0001, t + len);

    src.connect(g);
    g.connect(mix.input('voice'));
    // a hair of extra tail so the fade lands on real samples rather than on the
    // silence past a buffer that has already stopped
    src.start(t, Math.max(0, at), len + 0.03);
    src.stop(t + len + 0.03);

    const rec = { src, g };
    live.push(rec);
    src.onended = () => {
      const i = live.indexOf(rec);
      if (i >= 0) live.splice(i, 1);
      try { g.disconnect(); } catch { /* context closing */ }
    };

    if (mix.duck) mix.duck(DUCK, len);
    return true;
  }

  function stop(fade = 0.12) {
    const t = actx.currentTime;
    for (const { src, g } of live) {
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0.0001, t, fade * 0.4);
        src.stop(t + fade);
      } catch { /* already stopped */ }
    }
    live.length = 0;
  }

  return {
    load, say, stop, has,
    names() { return [...urls.keys()]; },
    /** For the harness and the audio panel: what is on disk and what is not. */
    report() {
      const out = {};
      for (const n of urls.keys()) {
        const s = state.get(n);
        out[n] = !s ? 'untouched' : s.buffer ? 'ready' : s.failed ? 'missing' : 'loading';
      }
      return out;
    },
    get ready() { return has(DEFAULT); },
    get speaking() { return live.length > 0; },
    duration(name = DEFAULT) {
      const s = state.get(name);
      return s && s.buffer ? s.buffer.duration : 0;
    },
  };
}
