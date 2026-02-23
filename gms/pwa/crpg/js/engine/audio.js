// ===== Web Audio API — Retro Bleeps =====
let ctx = null;
let enabled = true;

function getCtx() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {
      enabled = false;
    }
  }
  return ctx;
}

function bleep(freq, dur, type = 'square', vol = 0.12) {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + dur);
  } catch(e) { /* silent */ }
}

export function playHit()     { bleep(220, 0.08, 'sawtooth', 0.1); }
export function playMiss()    { bleep(110, 0.06, 'sine', 0.06); }
export function playLevelUp() {
  bleep(440, 0.1);
  setTimeout(() => bleep(550, 0.1), 100);
  setTimeout(() => bleep(660, 0.2), 200);
}
export function playDeath()   { bleep(80, 0.3, 'sawtooth', 0.15); }
export function playPickup()  { bleep(660, 0.06, 'sine', 0.08); }
export function playDungeon() { bleep(110, 0.4, 'sawtooth', 0.12); }
export function playBoss()    { bleep(55, 0.6, 'sawtooth', 0.2); }

export function setEnabled(val) { enabled = val; }
export function isEnabled() { return enabled; }

// Resume context on user gesture
export function resumeCtx() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}
