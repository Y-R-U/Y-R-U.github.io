// Line voice-over. Everything that turns a clip into sound goes through js/game/clip.js — pitch is
// a resample there, and a bare <audio src> silently drops it because HTMLMediaElement
// time-stretches instead.
//
// Barks are keyed {character, category, i}; a conversation line is keyed by its own `vo` basename
// and lives in the `lines` section of data/vo.json. The runtime does not read that ledger: the
// basename plus the codec extension IS the path, and the ledger is the authoring tools' record of
// what made it.

import { playClip, stop as stopClip, CODEC } from './clip.js';

export const VO_EXT = CODEC.ext;

export const clipPath = vo =>
  (typeof vo === 'string' && /^[\w.-]+$/.test(vo) ? `audio/vo/${vo}${VO_EXT}` : null);

// −4…+4 semitones, the §7 range. A character with no entry sings at the pitch it was recorded at.
export const pitchOf = c => {
  const n = +c?.voicePitch;
  return Number.isFinite(n) ? Math.min(4, Math.max(-4, n)) : 0;
};

// Speech is mixed above music on purpose: the takes measure about −24 dB mean and a set playing
// under them at 0.7 makes the quieter half of a line unintelligible.
const SPEECH_GAIN = 1.35;

export class Voice {
  // `cast` is the normalised character map; `settings` is read fresh each line so muting mid-scene
  // takes effect on the next one rather than at the next reload.
  constructor({ cast = {}, settings = () => ({}) } = {}) {
    this.cast = cast;
    this.settings = settings;
    this.missing = new Set();
    this.playing = null;
  }

  stop() { this.playing = null; try { stopClip(); } catch { /* never started */ } }

  // Returns the clip path it tried, or null. Never throws and never awaits the caller: a line that
  // has no take, or a decode a browser refuses, must not stop the conversation.
  say(line) {
    this.stop();
    const path = clipPath(line?.vo);
    if (!path || this.missing.has(path)) return null;
    const s = this.settings() || {};
    if (s.mute) return null;
    const gain = SPEECH_GAIN * (Number.isFinite(+s.volume) ? +s.volume : 1);
    if (gain <= 0) return null;
    const token = {};
    this.playing = token;
    playClip(path, { pitch: pitchOf(this.cast[line.who]), gain })
      .catch(e => {
        this.missing.add(path);
        console.warn(`vo ${path}: ${e.message}`);
        if (this.playing === token) this.playing = null;
      });
    return path;
  }
}
