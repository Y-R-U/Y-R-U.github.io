// The cold open: you wake in your bedroom to a TV hissing static and a broken
// emergency broadcast. This drives (a) the animated static texture on the
// bedroom TV screen + its glow, (b) a Web Audio static hiss with dropouts, and
// (c) a DOM overlay that fades up from black and crawls the garbled broadcast.
// Tap anywhere to skip. run() resolves when the sequence finishes or is skipped.

import * as THREE from 'three';

const BROADCAST = [
  '…ksshh— this is the Emergency Alert System —zzzt—',
  'A state of emergency is in effect for all —static—',
  'Do NOT go outside. Bolt your doors. The infected —kksh—',
  '…spreads through bites. If someone is turning, do not —zzt—',
  'Military checkpoints at the —signal breaking up—',
  'If you can hear this… arm yourself… stay —',
  '— we are no longer able to —',
  '………… [ signal lost ] …………',
];

export function createIntro(tv) {
  // static noise texture for the TV screen
  const c = document.createElement('canvas');
  c.width = 96; c.height = 64;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  if (tv?.screen) { tv.screen.material.map = tex; tv.screen.material.color.set(0xffffff); tv.screen.material.needsUpdate = true; }

  let noiseT = 0, on = true, card = 0;
  function drawStatic() {
    const img = g.createImageData(c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = (Math.random() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    // occasional "EMERGENCY" colour bar flash
    if (card > 0) {
      g.fillStyle = 'rgba(180,30,20,0.55)'; g.fillRect(0, 22, c.width, 20);
      g.fillStyle = '#fff'; g.font = 'bold 13px monospace'; g.textAlign = 'center';
      g.fillText('EMERGENCY', c.width / 2, 36);
    }
    tex.needsUpdate = true;
  }
  drawStatic();

  // ── Web Audio static hiss ──
  let actx = null, src = null, gain = null;
  function startAudio() {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const len = actx.sampleRate * 2;
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const dat = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dat[i] = (Math.random() * 2 - 1) * 0.5;
    src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filt = actx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 1600; filt.Q.value = 0.7;
    gain = actx.createGain(); gain.gain.value = 0.0;
    src.connect(filt).connect(gain).connect(actx.destination); src.start();
    gain.gain.setTargetAtTime(0.06, actx.currentTime, 0.4);
  }
  function blip() {     // a garbled voice-ish chirp between lines
    if (!actx) return;
    const o = actx.createOscillator(), gg = actx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 120 + Math.random() * 220;
    gg.gain.setValueAtTime(0.0001, actx.currentTime);
    gg.gain.exponentialRampToValueAtTime(0.05, actx.currentTime + 0.02);
    gg.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.25);
    o.connect(gg).connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.26);
  }
  function stopAudio() { if (gain && actx) { gain.gain.setTargetAtTime(0.0, actx.currentTime, 0.3); setTimeout(() => { try { src.stop(); actx.close(); } catch {} }, 600); } }

  const api = {
    tex,
    update(dt, t) {
      noiseT += dt;
      if (noiseT > 0.06) { noiseT = 0; if (on) drawStatic(); }
      if (card > 0) card -= dt;
      if (tv?.glow) tv.glow.intensity = 0.6 + Math.sin(t * 30) * 0.25 + (Math.random() < 0.05 ? 0.6 : 0);
    },
    run() {
      const overlay = document.getElementById('intro');
      const sub = document.getElementById('intro-sub');
      const title = document.getElementById('intro-title');
      const hint = document.getElementById('intro-skip');
      if (!overlay) return Promise.resolve();
      overlay.classList.remove('hidden'); overlay.classList.add('show');
      startAudio();

      let done = false, line = 0, timer = null;
      const finish = () => {
        if (done) return; done = true;
        clearTimeout(timer);
        overlay.removeEventListener('pointerdown', skip);
        overlay.classList.remove('show'); overlay.classList.add('fade');
        stopAudio();
        setTimeout(() => { overlay.classList.add('hidden'); overlay.classList.remove('fade'); }, 900);
        resolveFn();
      };
      const skip = () => finish();
      overlay.addEventListener('pointerdown', skip);
      if (hint) hint.textContent = 'tap to skip';

      let resolveFn;
      const promise = new Promise(r => resolveFn = r);

      // sequence: title beat, then crawl the broadcast line by line
      if (title) { title.textContent = 'You wake up.'; title.classList.add('show'); }
      setTimeout(() => { if (title) title.classList.remove('show'); }, 2600);

      const next = () => {
        if (done) return;
        if (line >= BROADCAST.length) { timer = setTimeout(finish, 1400); return; }
        if (sub) sub.textContent = BROADCAST[line];
        card = 0.5; blip();
        line++;
        timer = setTimeout(next, 2300);
      };
      timer = setTimeout(next, 2800);
      return promise;
    },
  };
  return api;
}
