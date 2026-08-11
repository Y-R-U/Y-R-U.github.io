/**
 * Recorded voice — the one exception to "everything is synthesised".
 *
 * Rook's barks are a single 45-second take with all twenty-one lines in it, and a line is
 * played as a slice of that: `say(offset, length)`. One fetch, one decode, no per-line
 * request, and the fade lengths stay tunable without re-cutting anything. The offsets live
 * next to the text they belong to, in sim/barks.js.
 *
 * Fades are not optional. The take has a quiet music bed under the voice — Suno leaves one
 * there and it cannot be removed — so starting or stopping a slice dead is an audible click.
 *
 * Loads lazily and never blocks: the file is fetched once the context is running, and until
 * it has decoded, say() is a no-op. A missing or broken file costs the game nothing but the
 * voice; the bubble still appears and the run plays exactly as it did before.
 */

const FADE_IN = 0.08;
const FADE_OUT = 0.16;
const DUCK = 0.45;         // how far the score and the wood get out of his way

export function createVO(actx, mix, url) {
  let buffer = null;
  let loading = null;
  let failed = false;
  const live = [];

  function load() {
    if (buffer || failed || loading) return loading || Promise.resolve(!!buffer);
    loading = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status);
        buffer = await actx.decodeAudioData(await res.arrayBuffer());
      } catch (e) {
        failed = true;
        console.warn('[audio] voice take unavailable —', e.message || e);
      }
      loading = null;
      return !!buffer;
    })();
    return loading;
  }

  /**
   * Play seconds [at, at+len) of the take. Barks are one-at-a-time by design, so a new
   * line cuts the old one short rather than talking over it.
   * @returns true if it will actually be heard
   */
  function say(at, len, o = {}) {
    if (!buffer || !(len > 0)) return false;
    if (live.length) stop(0.08);

    const t = actx.currentTime + (o.delay || 0);
    const level = o.volume == null ? 1 : o.volume;
    const src = actx.createBufferSource();
    src.buffer = buffer;
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
    load, say, stop,
    get ready() { return !!buffer; },
    get speaking() { return live.length > 0; },
    get duration() { return buffer ? buffer.duration : 0; },
  };
}
