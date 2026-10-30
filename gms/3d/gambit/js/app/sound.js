// GAMBIT sound facade for the app (owner: audio agent). The engine lives in js/audio/.
//   play(name)          any sound: move capture castle promote check illegal start win lose draw
//                       lowtime tick correct wrong solved tap notify (+ battle names, see docs/notes/audio.md)
//   playMove(verbose)   the right move sound (+ check overlay), landing with the board animation
//   unlockAudio()       harmless no-op kept for main.js: the engine unlocks itself on the first gesture
// Respects settings: sound (on/off), volume (0..1, default 0.8), music (off by default), musicVolume.
import { sfx, playMove, attachBoard, unlock, prewarm, music } from '../audio/index.js';

export function play(name, opts) { try { return sfx(name, opts); } catch { return false; } }
export function unlockAudio() { try { unlock(); } catch { /* audio blocked */ } }
export { sfx, playMove, attachBoard, prewarm, music };
