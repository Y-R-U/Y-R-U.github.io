// Sound, haptics and confetti. Sound goes through AU's js/audio/sfx.js when it loads; tiny beeps until then.
import { BUILD } from '../build.js?v=202610071336';
import { getSettings } from '../core/store.js?v=202610071336';

let sfxMod = null;
import(`../audio/sfx.js?v=${BUILD}`).then(m => {
  sfxMod = m.default || m;
  try { sfxMod.installUnlock && sfxMod.installUnlock(document); } catch (e) {}
  applyAudioSettings();
}).catch(() => { sfxMod = null; });

export function applyAudioSettings(s = getSettings()) {
  try { sfxMod?.applySettings?.({ sound: s.sound, muted: !s.sound, musicVolume: s.music }); } catch (e) {}
  import(`../audio/ctx.js?v=${BUILD}`).then(m => m.applySettings?.({ muted: !s.sound, musicVolume: s.music })).catch(() => {});
}

let ac = null;
const BEEPS = { correct: [660, 880], wrong: [220, 160], tick: [1200], timerLow: [900], tap: [520], button: [520], reveal: [440, 660], streak: [660, 880, 1100], fanfare: [523, 659, 784, 1046], join: [700, 900] };
function beep(name) {
  const f = BEEPS[name];
  if (!f) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    let t = ac.currentTime;
    for (const hz of f) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.14);
      t += 0.09;
    }
  } catch (e) {}
}

export function sfx(name, opts) {
  if (!getSettings().sound) return;
  if (sfxMod?.play) { try { sfxMod.play(name, opts); return; } catch (e) {} }
  beep(name);
}

export function haptic(kind = 'tap') {
  if (!getSettings().haptics || !navigator.vibrate) return;
  try { navigator.vibrate(kind === 'wrong' ? [40, 40, 60] : kind === 'correct' ? 25 : kind === 'win' ? [30, 50, 30, 50, 80] : 12); } catch (e) {}
}

export const reducedMotion = () => getSettings().reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function confetti({ count = 140, duration = 2600 } = {}) {
  if (reducedMotion()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.append(c);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = c.width = innerWidth * dpr, H = c.height = innerHeight * dpr;
  const g = c.getContext('2d');
  const cols = ['#FF5D5D', '#FFC23C', '#2EC4A0', '#7B61FF', '#3DA5FF', '#FF7AC6'];
  const ps = Array.from({ length: count }, (_, i) => ({
    x: W * (0.2 + Math.random() * 0.6), y: H * 0.35, vx: (Math.random() - 0.5) * 22 * dpr, vy: (-Math.random() * 22 - 8) * dpr,
    w: (6 + Math.random() * 8) * dpr, h: (8 + Math.random() * 10) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: cols[i % cols.length], shape: i % 3,
  }));
  const t0 = performance.now();
  (function frame(t) {
    const k = (t - t0) / duration;
    g.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.7 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - k * k);
      g.fillStyle = p.c;
      if (p.shape === 0) g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      else { g.beginPath(); g.arc(0, 0, p.w / 2, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    if (k < 1) requestAnimationFrame(frame); else c.remove();
  })(t0);
}
