// Moved to js/game/clip.js: the shipped game plays conversation voice-over, and DEVTOOLS §1
// promises a live origin fetches nothing under js/dev/ but gate.js. Re-exported here so the
// character and conversation tabs keep their one import path, and so there is still exactly one
// place a clip plus a voicePitch becomes sound.
export { loadClip, playClip, stop, forget, pitchRate } from '../../game/clip.js';
