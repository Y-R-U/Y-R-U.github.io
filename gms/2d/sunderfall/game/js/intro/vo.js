/* SUNDERFALL — the cinematic's spoken lines.
 *
 * Two recordings, one per character, each holding that character's whole part.
 * A beat names a slice of its speaker's file (`vo: [offset, length]` in
 * story/script.js) and this plays that slice, fading in and out so the cut is
 * never heard as a cut — the takes have a quiet music bed under the voice, so
 * starting or stopping one dead would click.
 *
 * The score ducks while a line runs. Voice is routed past `master` for exactly
 * that reason: it would otherwise duck itself. See IntroAudio's constructor.
 *
 * Nothing here is load-bearing. If the fetch fails, the decode fails, or a line
 * is asked for before its file has arrived, the cinematic plays as it always
 * did — the pictures and the score carry it.
 */

const FADE_IN = 0.10;
const FADE_OUT = 0.18;
const DUCK_TO = 0.55;      // how far the score gets out of the way
const LEVEL = 1.0;

export class Voice {
  constructor(audio) {
    this.audio = audio;
    this.buffers = new Map();
    this.playing = [];
    this.ready = false;
  }

  /** Fire and forget: `files` is { speakerId: url }. Never throws. */
  async load(files) {
    const a = this.audio;
    if (!a || !a.ok) return false;
    const jobs = Object.entries(files).map(async ([who, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status + ' ' + url);
        const buf = await a.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(who, buf);
      } catch (e) {
        console.warn('[vo] ' + who + ' unavailable —', e.message || e);
      }
    });
    await Promise.all(jobs);
    this.ready = this.buffers.size > 0;
    return this.ready;
  }

  /**
   * Speak one slice. `at` and `len` are seconds into that speaker's recording.
   * Silently does nothing if the take never arrived.
   */
  say(who, at, len) {
    const a = this.audio;
    const buf = this.buffers.get(who);
    if (!a || !a.ok || !buf || !(len > 0)) return false;

    const ctx = a.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const g = ctx.createGain();
    const fin = Math.min(FADE_IN, len * 0.3);
    const fout = Math.min(FADE_OUT, len * 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(LEVEL, t + fin);
    g.gain.setValueAtTime(LEVEL, t + Math.max(fin, len - fout));
    g.gain.linearRampToValueAtTime(0.0001, t + len);

    src.connect(g);
    g.connect(a.voice);
    // a hair of extra tail so the fade completes on real samples, not on the
    // silence past a buffer that has already stopped
    src.start(t, Math.max(0, at), len + 0.03);
    src.stop(t + len + 0.03);

    const rec = { src, g };
    this.playing.push(rec);
    src.onended = () => {
      const i = this.playing.indexOf(rec);
      if (i >= 0) this.playing.splice(i, 1);
      try { g.disconnect(); } catch { /* context may be closing */ }
    };

    if (a.duck) a.duck(DUCK_TO, len);
    return true;
  }

  /** Cut everything short — used when the player skips mid-sentence. */
  stop(fade = 0.12) {
    const a = this.audio;
    if (!a || !a.ok) return;
    const t = a.ctx.currentTime;
    for (const { src, g } of this.playing) {
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0.0001, t, fade * 0.4);
        src.stop(t + fade);
      } catch { /* already stopped */ }
    }
    this.playing.length = 0;
  }
}
